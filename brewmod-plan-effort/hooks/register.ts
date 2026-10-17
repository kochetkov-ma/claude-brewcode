// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import type { Register } from 'claude-code'
import type { PlanSeen } from '../types'

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const LEVELS = ['medium', 'high', 'xhigh', 'max'] as const
const SESSION_ID = /^[A-Za-z0-9_-]+$/
// Live CC 2.1.301: a Shift+Tab out of plan draws one hint 'plan mode on (shift+tab to cycle)', in plan it reads '(shift+tab to cycle)'
const LEFT_PLAN = /^plan mode on\b/
const NONE = 'none'
const USAGE = '/plan-effort <level>   set the plan-mode effort\n/plan-effort           show this status'
const HEADLESS = 'plan effort: cannot set it here (no /config row, e.g. under -p) · set: /config in an interactive session, or settings.json pluginConfigs'
const HELP = 'help · in plan mode, main-session requests below the plan effort are sent at it; never lowered; subagents and the session effort setting are left alone'
const session = { plugin: 'brewmod-plan-effort', key: 'session' } as const
const toasted = { plugin: 'brewmod-plan-effort', key: 'toasted' } as const
const plan = { plugin: 'brewmod-plan-effort', key: 'plan' } as const
const rank = (v: unknown): number => RANK.findIndex((r) => r === v)

type ModeFile = { mode: string; ts: number }

// Pure: state-file text -> {mode, ts}; missing or corrupt input is undefined (fail open)
const modeOf = (text: unknown): ModeFile | undefined => {
  if (typeof text !== 'string') return undefined
  try {
    const j = JSON.parse(text) as { mode?: unknown; ts?: unknown } | null
    return typeof j?.mode === 'string' ? { mode: j.mode, ts: typeof j.ts === 'number' ? j.ts : 0 } : undefined
  } catch {
    return undefined
  }
}

// Pure: a left-plan hint holds until mode.mjs writes a newer file; a ts-less file (ts 0) never holds it
const isLeftNow = (file: ModeFile | undefined, seen: PlanSeen | undefined): boolean => file !== undefined && file.ts > 0 && seen?.isLeft === true && seen.ts === file.ts
const isPlanNow = (file: ModeFile | undefined, seen: PlanSeen | undefined): boolean => file?.mode === 'plan' && !isLeftNow(file, seen)

// Pure: why a non-level session effort is never raised
const noLevel = (s: string): string => (s === NONE ? 'model takes no effort level' : `${s} is not an effort level`)

// Pure: the row above the prompt; undefined = no row
const rowText = (isPlan: boolean, planEffort: string, sess: string | undefined): string | undefined => {
  if (!isPlan || sess === undefined) return undefined
  const have = rank(sess)
  if (have < 0) return `plan mode · effort not raised: ${noLevel(sess)}`
  return have < rank(planEffort) ? `plan mode · effort ${planEffort} for this mode · change: /plan-effort <level>` : `plan mode · effort ${sess}, already >= ${planEffort}`
}

// Pure: head line (the engine glues the plugin name to it) + aligned status rows + usage
const block = (head: string, planEffort: string, levels: readonly string[], sess: string | undefined, mode: string): string => {
  const have = rank(sess)
  const s =
    sess === undefined
      ? 'n/a until the next request'
      : have < 0
        ? `${sess.padEnd(7)}not raised, ${noLevel(sess)}`
        : `${sess.padEnd(7)}${have < rank(planEffort) ? `-> raised to ${planEffort} in plan mode` : 'not raised, session already >= plan effort'}`
  return [head, `plan effort  ${planEffort.padEnd(7)}(${levels.join(' | ')})`, `session      ${s}`, `mode now     ${mode}`, USAGE].join('\n')
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
    let target = typeof row?.value === 'string' ? row.value : String(options.planEffort)
    const sid = await $.session.id()
    const file = typeof sid === 'string' && SESSION_ID.test(sid) ? modeOf(await $.fs.read(`${$.plugin.root}/.state/mode-${sid}.json`).catch(() => undefined)) : undefined
    const seen = (await $.state.get(plan).catch(() => undefined))?.value
    const left = isLeftNow(file, seen)
    const mode = file === undefined ? 'unknown until the next prompt' : left ? 'plan mode left (Shift+Tab); known at the next prompt' : file.mode
    const held = (await $.state.get(session).catch(() => undefined))?.value
    const status = (head = 'status'): string => block(head, target, levels, held, mode)
    if (arg === undefined || arg === 'status') return { text: status() }
    if (arg === 'help') return { text: status(HELP) }
    if (!levels.includes(arg)) return { text: status(`unknown '${words[0]}'`) }
    const res = row === undefined ? undefined : await $.config.set({ key: row.key, value: arg }).catch(() => undefined)
    if (res === undefined) return { text: status(HEADLESS) }
    if (res.deny !== undefined) return { text: `${res.deny}\n${USAGE}` }
    const old = target
    target = arg
    return { text: status(`plan effort: ${old} -> ${arg}`) }
  })

  // Raise only (lower/equal, numeric, absent efforts and subagent steps untouched); mode = hooks/mode.mjs state file (works on org-managed installs too)
  // One-shot toast per plan visit; session/toasted/plan live in $.state, so a reload neither repeats nor loses them
  on('turn.step', async function* ($, e, next) {
    const main = e.agentId === undefined
    const wanted = rank(options.planEffort)
    const have = rank(e.effort)
    let target: (typeof RANK)[number] | undefined
    if (main) {
      const sid = await $.session.id()
      // no read unless the id is path-safe (same check as mode.mjs)
      const file = typeof sid === 'string' && SESSION_ID.test(sid) ? modeOf(await $.fs.read(`${$.plugin.root}/.state/mode-${sid}.json`).catch(() => undefined)) : undefined
      const seen = (await $.state.get(plan).catch(() => undefined))?.value
      const isPlan = isPlanNow(file, seen)
      if (have >= 0 && have < wanted && isPlan) target = RANK[wanted]
      const sess = e.effort === undefined ? NONE : String(e.effort)
      if ((await $.state.get(session).catch(() => undefined))?.value !== sess) await $.state.set(session, sess).catch(() => undefined)
      const isLeft = isLeftNow(file, seen)
      // no file = not plan (fail open), so a vanished file drops the row too
      const now = { isPlan, ts: file?.ts ?? 0, isLeft }
      if (seen === undefined ? file !== undefined : seen.ts !== now.ts || seen.isPlan !== now.isPlan || seen.isLeft !== now.isLeft) await $.state.set(plan, now).catch(() => undefined)
      const shown = (await $.state.get(toasted).catch(() => undefined))?.value === true
      if (target !== undefined && !shown) {
        $.ui.toast(`plan mode · effort raised to ${target}`, { timeoutMs: 5000 })
        await $.state.set(toasted, true).catch(() => undefined)
      } else if (shown && !isPlan) await $.state.set(toasted, false).catch(() => undefined)
    }
    return yield* next(target === undefined ? e : { ...e, effort: target })
  })

  // Shift+Tab out of plan mode: drop the row and end the toast's visit; a draw cannot write state, so a timer does, unless a step wrote since the draw
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const r = LEFT_PLAN.test(e.props.hint) ? await $.state.get(plan).catch(() => undefined) : undefined
    const ts = r?.value?.isPlan === true ? r.value.ts : undefined
    if (r !== undefined && ts !== undefined) {
      $.clock.after(0, () => void $.state.set(plan, { isPlan: false, ts, isLeft: true }, { ifVersion: r.version }).then((w) => (w.isSet ? $.state.set(toasted, false) : undefined)).catch(() => undefined))
    }
    return next(e)
  })

  // Persistent plan-mode row above whatever the plugins beneath draw; yields to a survey
  // The row takes one of maxRows: hooks beneath get one fewer, so a band sized to it never scrolls under the row
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const seen = (await $.state.get(plan).catch(() => undefined))?.value
    const sess = (await $.state.get(session).catch(() => undefined))?.value
    const text = rowText(seen?.isPlan === true, String(options.planEffort), sess)
    if (text === undefined) return next(e)
    const below = await next({ ...e, props: { ...e.props, maxRows: Math.max(1, e.props.maxRows - 1) } })
    const { Box, Text } = $.ui.resolve(e)
    return Box({ flexDirection: 'column', children: [Text({ color: 'planMode', wrap: 'truncate-end', children: text }), below] })
  })
}
