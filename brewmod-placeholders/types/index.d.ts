export type PlaceholderToken = {
  text: string
  name: string
  isKnown: boolean
  start: number
  end: number
}

// escapedBy = the first escape marker typed (`P/` or `P\`), set with isEscaped.
export type PlaceholderView = { tokens: PlaceholderToken[]; isEscaped?: true; escapedBy?: string }

// The caret token (prompt.edit, editor.ts CaretFocus): name null = none; isQuery = `?` follows it; isMenuOpen = our typeahead has rows.
export type PlaceholderFocus = { name: string | null; isQuery: boolean; isMenuOpen: boolean }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-placeholders': {
      view: PlaceholderView
      expanded: boolean
      focus: PlaceholderFocus
    }
  }
}
