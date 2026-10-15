import type { Register } from 'claude-code'

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const rank = (v: unknown): number => RANK.findIndex((r) => r === v)

// Pure: state-file text -> plan?; missing, corrupt or non-plan input is false (fail open)
const isPlan = (text: unknown): boolean => {
  if (typeof text !== 'string') return false
  try {
    return (JSON.parse(text) as { mode?: unknown } | null)?.mode === 'plan'
  } catch {
    return false
  }
}

export const register: Register = (on, options) => {
  // Status text this mod pinned; undefined = nothing of ours is shown (never clear what we did not set)
  let shown: string | undefined

  // Raise only (lower/equal, numeric, absent efforts and subagent steps untouched); status 'plan: <target>' pinned on a raise, cleared otherwise
  // Mode = hooks/mode.mjs command hook -> <root>/.state/mode-<session>.json (works on org-managed installs too)
  on('turn.step', async function* ($, e, next) {
    const main = e.agentId === undefined
    const wanted = rank(options.planEffort)
    const have = rank(e.effort)
    let plan = false
    if (main && have >= 0 && have < wanted) {
      const sid = await $.session.id()
      plan = isPlan(await $.fs.read(`${$.plugin.root}/.state/mode-${sid}.json`).catch(() => undefined))
    }
    const target = plan ? RANK[wanted] : undefined
    if (main && options.statusLine !== false) {
      const text = target === undefined ? undefined : `plan: ${target}`
      if (text !== shown) {
        $.ui.status(text)
        shown = text
      }
    }
    return yield* next(target === undefined ? e : { ...e, effort: target })
  })
}
