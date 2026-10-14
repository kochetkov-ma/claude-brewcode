import type { Register } from 'claude-code'

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof RANK)[number]
const rank = (v: unknown): number => (typeof v === 'string' ? RANK.indexOf(v as Effort) : -1)

export const register: Register = (on, options) => {
  let plan = false
  // Status text this mod pinned; undefined = nothing of ours is shown (never clear what we did not set)
  let shown: string | undefined

  // Mode from the classic payloads; fail open, subagent signals ignored; true = plan was just left
  const track = (e: { permission_mode?: unknown; agent_id?: unknown }): boolean => {
    try {
      if (e.agent_id === undefined && typeof e.permission_mode === 'string') {
        const left = plan && e.permission_mode !== 'plan'
        plan = e.permission_mode === 'plan'
        return left
      }
    } catch {
      // keep the last known mode
    }
    return false
  }

  // $ is never passed to a helper, so each hook clears the status inline
  on('classic.UserPromptSubmit', ($, e, next) => {
    if (track(e) && shown !== undefined) {
      try {
        $.ui.status(undefined)
        shown = undefined
      } catch {
        // status is cosmetic
      }
    }
    return next(e)
  })

  on('classic.PostToolBatch', ($, e, next) => {
    if (track(e) && shown !== undefined) {
      try {
        $.ui.status(undefined)
        shown = undefined
      } catch {
        // status is cosmetic
      }
    }
    return next(e)
  })

  // Non-classic fallback (org-managed installs); fires before turn.step
  on('session.append', ($, e, next) => {
    try {
      const name = e.message.name
      if (e.agentId === undefined && e.message.type === 'attachment') {
        if (name === 'plan_mode') plan = true
        else if (name === 'plan_mode_exit') {
          plan = false
          if (shown !== undefined) {
            $.ui.status(undefined)
            shown = undefined
          }
        }
      }
    } catch {
      // keep the last known mode
    }
    return next(e)
  })

  // Raise only: lower or equal-rank, numeric, absent efforts and subagent steps pass untouched
  // Status 'plan: <target>' is pinned on a raised main step, cleared on an unraised one; only on change
  on('turn.step', async function* ($, e, next) {
    let target: Effort | undefined
    try {
      const wanted: Effort = rank(options.planEffort) >= 0 ? (options.planEffort as Effort) : 'xhigh'
      const have = rank(e.effort)
      if (e.agentId === undefined && plan && have >= 0 && have < rank(wanted)) target = wanted
    } catch {
      target = undefined
    }
    try {
      if (e.agentId === undefined && options.statusLine !== false) {
        const text = target === undefined ? undefined : `plan: ${target}`
        if (text !== shown) {
          $.ui.status(text)
          shown = text
        }
      }
    } catch {
      // status is cosmetic
    }
    return yield* next(target === undefined ? e : { ...e, effort: target })
  })
}
