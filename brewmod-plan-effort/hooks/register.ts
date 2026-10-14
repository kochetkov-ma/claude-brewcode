import type { Register } from 'claude-code'

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof RANK)[number]
const rank = (v: unknown): number => (typeof v === 'string' ? RANK.indexOf(v as Effort) : -1)

export const register: Register = (on, options) => {
  let plan = false

  // Mode from the classic payloads; fail open, subagent signals ignored
  const track = (e: { permission_mode?: unknown; agent_id?: unknown }): void => {
    try {
      if (e.agent_id === undefined && typeof e.permission_mode === 'string') plan = e.permission_mode === 'plan'
    } catch {
      // keep the last known mode
    }
  }

  on('classic.UserPromptSubmit', ($, e, next) => {
    track(e)
    return next(e)
  })

  on('classic.PostToolBatch', ($, e, next) => {
    track(e)
    return next(e)
  })

  // Non-classic fallback (org-managed installs); fires before turn.step
  on('session.append', ($, e, next) => {
    try {
      const name = e.message.name
      if (e.agentId === undefined && e.message.type === 'attachment') {
        if (name === 'plan_mode') plan = true
        else if (name === 'plan_mode_exit') plan = false
      }
    } catch {
      // keep the last known mode
    }
    return next(e)
  })

  // Raise only: lower or equal-rank, numeric, absent efforts and subagent steps pass untouched
  on('turn.step', async function* ($, e, next) {
    let target: Effort | undefined
    try {
      const wanted: Effort = rank(options.planEffort) >= 0 ? (options.planEffort as Effort) : 'xhigh'
      const have = rank(e.effort)
      if (e.agentId === undefined && plan && have >= 0 && have < rank(wanted)) target = wanted
    } catch {
      target = undefined
    }
    return yield* next(target === undefined ? e : { ...e, effort: target })
  })
}
