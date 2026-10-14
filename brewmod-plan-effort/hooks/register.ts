import type { Register } from 'claude-code'

const RANK = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const rank = (v: unknown): number => RANK.findIndex((r) => r === v)

export const register: Register = (on, options) => {
  let plan = false
  // Status text this mod pinned; undefined = nothing of ours is shown (never clear what we did not set)
  let shown: string | undefined

  // Sets the mode; true = plan was left with our status pinned, so the caller clears it ($ is never passed to a helper)
  const setPlan = (value: boolean): boolean => {
    const left = plan && !value && shown !== undefined
    plan = value
    return left
  }

  // Classic payloads carry the exact mode; subagent (agent_id) and non-string modes are ignored
  const fromClassic = (e: { permission_mode?: unknown; agent_id?: unknown }): boolean =>
    e.agent_id === undefined && typeof e.permission_mode === 'string' && setPlan(e.permission_mode === 'plan')

  on('classic.UserPromptSubmit', ($, e, next) => {
    try {
      if (fromClassic(e)) {
        $.ui.status(undefined)
        shown = undefined
      }
    } catch {
      // fail open: keep the last known mode
    }
    return next(e)
  })

  on('classic.PostToolBatch', ($, e, next) => {
    try {
      if (fromClassic(e)) {
        $.ui.status(undefined)
        shown = undefined
      }
    } catch {
      // fail open: keep the last known mode
    }
    return next(e)
  })

  // Non-classic fallback (org-managed installs); fires before turn.step
  on('session.append', ($, e, next) => {
    try {
      const { type, name } = e.message
      if (e.agentId === undefined && type === 'attachment') {
        if (name === 'plan_mode') setPlan(true)
        else if (name === 'plan_mode_exit' && setPlan(false)) {
          $.ui.status(undefined)
          shown = undefined
        }
      }
    } catch {
      // fail open: keep the last known mode
    }
    return next(e)
  })

  // Raise only: lower or equal-rank, numeric, absent efforts and subagent steps pass untouched
  // Status 'plan: <target>' is pinned on a raised main step, cleared on an unraised one; only on change
  on('turn.step', async function* ($, e, next) {
    const main = e.agentId === undefined
    const wanted = RANK[rank(options.planEffort)] ?? 'xhigh'
    const have = rank(e.effort)
    const target = main && plan && have >= 0 && have < rank(wanted) ? wanted : undefined
    try {
      if (main && options.statusLine !== false) {
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
