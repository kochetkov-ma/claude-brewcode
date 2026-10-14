// Plan-mode tracker (same shape as brewmod-plan-effort): classic payloads carry the exact mode, session.append rows are the fallback.

export type ModeTracker = {
  classic: (e: { permission_mode?: unknown; agent_id?: unknown }) => void
  append: (e: { agentId?: unknown; message: { type?: unknown; name?: unknown } }) => void
  isPlan: () => boolean
  last: () => string | undefined
}

export function createModeTracker(): ModeTracker {
  let plan = false
  let last: string | undefined

  return {
    // Subagent payloads and non-string modes are ignored; the last known mode stays.
    classic: (e) => {
      try {
        if (e.agent_id === undefined && typeof e.permission_mode === 'string') {
          last = e.permission_mode
          plan = last === 'plan'
        }
      } catch {
        // keep the last known mode
      }
    },
    // Non-classic fallback (org-managed installs); a subagent's rows carry agentId and are skipped.
    append: (e) => {
      try {
        if (e.agentId !== undefined || e.message.type !== 'attachment') return
        if (e.message.name === 'plan_mode') {
          plan = true
          last = 'plan'
        } else if (e.message.name === 'plan_mode_exit') {
          plan = false
          last = undefined
        }
      } catch {
        // keep the last known mode
      }
    },
    isPlan: () => plan,
    last: () => last,
  }
}

// The tracker the band reads: each register() call installs a fresh one, so module reloads start clean.
let active: ModeTracker = createModeTracker()

export function resetMode(): ModeTracker {
  active = createModeTracker()
  return active
}

export const isPlan = (): boolean => active.isPlan()
export const lastMode = (): string | undefined => active.last()
