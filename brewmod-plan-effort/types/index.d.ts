export type Effort = string
// Plan mode as last decided from the state file (ts); isLeft = a Shift+Tab hint ended it since
export type PlanSeen = { isPlan: boolean; ts: number; isLeft: boolean }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-plan-effort': { session: Effort; toasted: boolean; plan: PlanSeen }
  }
}
