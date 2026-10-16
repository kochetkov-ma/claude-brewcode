// Pure editor UX: draft -> view + decorations, view diff, typeahead rows. Zero I/O, no engine state.
import type { PromptAutocompleteSuggestion, PromptDecoration } from 'claude-code'
import type { PlaceholderFocus as CaretFocus, PlaceholderView } from '../../types'
import { scanDraft, type Matchers } from './match'

export const MAX_DECORATED_CHARS = 20_000
export const EMPTY_VIEW: PlaceholderView = { tokens: [] }

export const KNOWN_COLOR = 'suggestion'
export const UNKNOWN_COLOR = 'warning'
// Claude Code's plan-mode colour: every plan-mode label, tag and addition.
export const PLAN_COLOR = 'planMode'
export type EditorEntry = { name: string; description?: string; body?: string; isInline?: boolean }
export type Highlight = { view: PlaceholderView; decorations: PromptDecoration[] }
export type { CaretFocus }

const GRAPHEME_TAIL = /[\p{M}\u200D\uFE00-\uFE0F]*/uy

// A run ends on a grapheme edge: the engine moves an end inside a grapheme back to its start, so combining marks, ZWJ and variation selectors after the token join it.
function graphemeEnd(text: string, end: number): number {
  GRAPHEME_TAIL.lastIndex = end
  const m = GRAPHEME_TAIL.exec(text)
  return end + (m === null ? 0 : m[0].length)
}

// Known token -> KNOWN_COLOR + underline; unknown -> UNKNOWN_COLOR. Above the cap or without the prefix -> nothing.
// Escaped draft: markers bold UNKNOWN_COLOR, every token dim and struck through (nothing in it is substituted); escapedBy = the first marker.
export function highlight(ms: Matchers, text: string): Highlight {
  if (text.length > MAX_DECORATED_CHARS || !text.includes(ms.prefix)) return { view: EMPTY_VIEW, decorations: [] }
  const view = scanDraft(ms, text)
  const marks = [...text.matchAll(ms.escape)]
  const first = marks[0]
  if (first !== undefined) {
    const runs = [
      ...view.tokens.map((t): PromptDecoration => ({ start: t.start, end: graphemeEnd(text, t.end), dimColor: true, strikethrough: true })),
      ...marks.map((m): PromptDecoration => ({ start: m.index, end: graphemeEnd(text, m.index + m[0].length), color: UNKNOWN_COLOR, bold: true })),
    ]
    return { view: { ...view, isEscaped: true, escapedBy: first[0] }, decorations: runs.sort((a, b) => a.start - b.start) }
  }
  const decorations = view.tokens.map((t): PromptDecoration => {
    const end = graphemeEnd(text, t.end)
    return t.isKnown ? { start: t.start, end, color: KNOWN_COLOR, underline: true } : { start: t.start, end, color: UNKNOWN_COLOR }
  })
  return { view, decorations }
}

// Offsets are not compared: the band reads text/name/isKnown and the escape marker only; decorations are rebuilt on every edit.
export function sameView(a: PlaceholderView, b: PlaceholderView): boolean {
  if (a.tokens.length !== b.tokens.length || a.isEscaped !== b.isEscaped || a.escapedBy !== b.escapedBy) return false
  return a.tokens.every((x, i) => {
    const y = b.tokens[i]
    return y !== undefined && x.text === y.text && x.name === y.name && x.isKnown === y.isKnown
  })
}

// Token whose [start, end] holds the caret, or end+1 when `?` follows it (isQuery): the band's FOCUS trigger.
export function caretFocus(view: PlaceholderView, text: string, cursor: number): Omit<CaretFocus, 'isMenuOpen'> {
  for (const t of view.tokens) {
    const isQuery = text.charAt(t.end) === '?'
    if (cursor >= t.start && cursor <= t.end + (isQuery ? 1 : 0)) return { name: t.name, isQuery }
  }
  return { name: null, isQuery: false }
}

const SPACE = /\s/

// Our typeahead has rows for the word before the caret; computed in prompt.edit, as prompt.autocomplete lands too late.
// A backward walk, not /\S*$/: that regex is quadratic on a long word (a pasted blob).
export function isMenuOpen(prefix: string, text: string, cursor: number, entries: readonly EditorEntry[]): boolean {
  let i = cursor
  while (i > 0 && !SPACE.test(text.charAt(i - 1))) i--
  return suggest(prefix, text.slice(i, cursor), entries).length > 0
}

export const sameFocus = (a: CaretFocus, b: CaretFocus): boolean => a.name === b.name && a.isQuery === b.isQuery && a.isMenuOpen === b.isMenuOpen

// Rows for the token at the cursor: names whose `P+name` extends it; an exact match and a repeated name give no row.
// A space already after the caret -> rows drop their own trailing space, so taking one never leaves two.
export function suggest(prefix: string, token: string, entries: readonly EditorEntry[], isSpaceAfter = false): PromptAutocompleteSuggestion[] {
  if (!token.startsWith(prefix)) return []
  const typed = token.toLowerCase()
  const seen = new Set<string>()
  const rows: PromptAutocompleteSuggestion[] = []
  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    const full = prefix + name
    if (seen.has(name) || full === typed || !full.startsWith(typed)) continue
    seen.add(name)
    rows.push({ text: isSpaceAfter ? full : `${full} `, label: full, description: entry.description ?? name })
  }
  return rows
}
