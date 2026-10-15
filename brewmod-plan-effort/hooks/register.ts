import type { Register } from 'claude-code'

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const LEVELS = ['medium', 'high', 'xhigh', 'max'] as const
const SESSION_ID = /^[A-Za-z0-9_-]+$/
const USAGE = '/plan-effort <level>   set the plan-mode effort\n/plan-effort           show this status'
const HEADLESS = 'plan effort: cannot set it here (no /config row, e.g. under -p): use /config in an interactive session or set pluginConfigs'
const session = { plugin: 'brewmod-plan-effort', key: 'session' } as const
const toasted = { plugin: 'brewmod-plan-effort', key: 'toasted' } as const
const rank = (v: unknown): number => RANK.findIndex((r) => r === v)

// Pure: state-file text -> permission mode; missing or corrupt input is undefined (fail open)
const modeOf = (text: unknown): string | undefined => {
  if (typeof text !== 'string') return undefined
  try {
    const m = (JSON.parse(text) as { mode?: unknown } | null)?.mode
    return typeof m === 'string' ? m : undefined
  } catch {
    return undefined
  }
}

// Pure: head line (the engine glues the plugin name to it) + aligned status rows + usage
const block = (head: string, plan: string, levels: readonly string[], sessionEffort: string | undefined, mode: string | undefined): string => {
  const have = rank(sessionEffort)
  const sess =
    sessionEffort === undefined || have < 0
      ? 'n/a until the next request'
      : `${sessionEffort.padEnd(7)}${have < rank(plan) ? `-> raised to ${plan} in plan mode` : 'not raised, session already >= plan effort'}`
  return [head, `plan effort  ${plan.padEnd(7)}(${levels.join(' | ')})`, `session      ${sess}`, `mode now     ${mode ?? 'unknown'}`, USAGE].join('\n')
}

export const register: Register = (on, options) => {
  // Re-fires after every reload (a config set reloads the module): register is idempotent
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'plan-effort', description: 'Show or set the plan-mode effort', argumentHint: '[status|help|medium|high|xhigh|max]' }).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'plan-effort' }, async ($, e, next) => {
    const words = e.args.trim().split(/\s+/).filter((w) => w !== '')
    if (words[0] === 'set') words.shift()
    const arg = words[0]?.toLowerCase()
    const rows = await $.config.list().catch(() => [])
    const row = rows.find((r) => r.key.endsWith('.planEffort') && r.provider.plugin.startsWith($.plugin.name))
    const levels = row?.options ?? LEVELS
    let plan = typeof row?.value === 'string' ? row.value : String(options.planEffort)
    const sid = await $.session.id()
    const mode = typeof sid === 'string' && SESSION_ID.test(sid) ? modeOf(await $.fs.read(`${$.plugin.root}/.state/mode-${sid}.json`).catch(() => undefined)) : undefined
    const held = (await $.state.get(session).catch(() => undefined))?.value
    const status = (head = 'status'): string => block(head, plan, levels, held, mode)
    if (arg === undefined || arg === 'status' || arg === 'help') return { text: status() }
    if (!levels.includes(arg)) return { text: status(`unknown '${words[0]}'`) }
    const res = row === undefined ? undefined : await $.config.set({ key: row.key, value: arg }).catch(() => undefined)
    if (res === undefined) return { text: status(HEADLESS) }
    if (res.deny !== undefined) return { text: `${res.deny}\n${USAGE}` }
    const old = plan
    plan = arg
    return { text: status(`plan effort: ${old} -> ${arg}`) }
  })

  // Raise only (lower/equal, numeric, absent efforts and subagent steps untouched); mode = hooks/mode.mjs state file (works on org-managed installs too)
  // One-shot toast on the first raised main step of a plan visit; session/toasted live in $.state, so a reload does not repeat or lose them
  on('turn.step', async function* ($, e, next) {
    const main = e.agentId === undefined
    const wanted = rank(options.planEffort)
    const have = rank(e.effort)
    const shown = main && (await $.state.get(toasted).catch(() => undefined))?.value === true
    let mode: string | undefined
    if (main && (shown || (have >= 0 && have < wanted))) {
      const sid = await $.session.id()
      // no read unless the id is path-safe (same check as mode.mjs)
      if (typeof sid === 'string' && SESSION_ID.test(sid)) mode = modeOf(await $.fs.read(`${$.plugin.root}/.state/mode-${sid}.json`).catch(() => undefined))
    }
    const target = main && mode === 'plan' && have >= 0 && have < wanted ? RANK[wanted] : undefined
    if (main) {
      if (have >= 0 && (await $.state.get(session).catch(() => undefined))?.value !== e.effort) await $.state.set(session, String(e.effort)).catch(() => undefined)
      if (target !== undefined && !shown) {
        $.ui.toast(`plan mode: effort ${target} · /plan-effort to change`, { timeoutMs: 5000 })
        await $.state.set(toasted, true).catch(() => undefined)
      } else if (shown && mode !== 'plan') await $.state.set(toasted, false).catch(() => undefined)
    }
    return yield* next(target === undefined ? e : { ...e, effort: target })
  })
}
