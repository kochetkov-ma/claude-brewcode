// Plan-mode tracker (same shape as brewmod-plan-effort): classic payloads carry the exact mode, session.append rows are the fallback.

export type ModeTracker = {
  classic: (e: { permission_mode?: unknown; agent_id?: unknown }) => void
  append: (e: { agentId?: unknown; message: { type?: unknown; name?: unknown } }) => void
  isPlan: () => boolean
}

export function createModeTracker(): ModeTracker {
  let plan = false

  return {
    // Subagent payloads and non-string modes are ignored; the last known mode stays.
    classic: (e) => {
      if (e.agent_id === undefined && typeof e.permission_mode === 'string') plan = e.permission_mode === 'plan'
    },
    // A subagent's rows carry agentId and are skipped.
    append: (e) => {
      if (e.agentId !== undefined || e.message.type !== 'attachment') return
      if (e.message.name === 'plan_mode') plan = true
      else if (e.message.name === 'plan_mode_exit') plan = false
    },
    isPlan: () => plan,
  }
}
