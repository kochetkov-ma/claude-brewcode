// Pure editor UX: draft -> view + decorations, view diff, typeahead rows. Zero I/O, no engine state.
import type { PromptAutocompleteSuggestion, PromptDecoration } from 'claude-code'
import { scanDraft, type Matchers, type PlaceholderView } from './match'

export const MAX_DECORATED_CHARS = 20_000
export const EMPTY_VIEW: PlaceholderView = { tokens: [] }

export type EditorStyle = { knownColor: string; unknownColor: string }
export type EditorEntry = { name: string; description?: string; body?: string; planOnly?: boolean }
export type Highlight = { view: PlaceholderView; decorations: PromptDecoration[] }

// Known token -> knownColor + underline; unknown -> unknownColor. Above the cap or without the prefix -> nothing.
export function highlight(ms: Matchers, text: string, style: EditorStyle): Highlight {
  if (text.length > MAX_DECORATED_CHARS || !text.includes(ms.prefix)) return { view: EMPTY_VIEW, decorations: [] }
  const view = scanDraft(ms, text)
  const decorations = view.tokens.map(
    (t): PromptDecoration =>
      t.isKnown
        ? { start: t.start, end: t.end, color: style.knownColor, underline: true }
        : { start: t.start, end: t.end, color: style.unknownColor },
  )
  return { view, decorations }
}

export function sameView(a: PlaceholderView, b: PlaceholderView): boolean {
  if (a.tokens.length !== b.tokens.length) return false
  return a.tokens.every((x, i) => {
    const y = b.tokens[i]
    return y !== undefined && x.text === y.text && x.name === y.name && x.isKnown === y.isKnown && x.start === y.start && x.end === y.end
  })
}

// Rows for the token at the cursor: names whose `P+name` extends it; an exact match and a repeated name give no row.
export function suggest(prefix: string, token: string, entries: readonly EditorEntry[]): PromptAutocompleteSuggestion[] {
  if (!token.startsWith(prefix)) return []
  const typed = token.toLowerCase()
  const seen = new Set<string>()
  const rows: PromptAutocompleteSuggestion[] = []
  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    const full = prefix + name
    if (seen.has(name) || full === typed || !full.startsWith(typed)) continue
    seen.add(name)
    rows.push({ text: `${full} `, label: full, description: entry.description ?? name })
  }
  return rows
}

// userConfig color -> theme key; a missing or non-string value falls back to the default.
export const optionColor = (value: unknown, fallback: string): string => (typeof value === 'string' && value !== '' ? value : fallback)
