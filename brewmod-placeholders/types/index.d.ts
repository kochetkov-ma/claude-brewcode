export type PlaceholderToken = {
  text: string
  name: string
  isKnown: boolean
  start: number
  end: number
}

export type PlaceholderView = { tokens: PlaceholderToken[] }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-placeholders': {
      view: PlaceholderView
      expanded: boolean
    }
  }
}
