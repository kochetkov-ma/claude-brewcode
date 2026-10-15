export type Effort = string

declare module 'claude-code' {
  interface PluginState {
    'brewmod-plan-effort': { session: Effort; toasted: boolean }
  }
}
