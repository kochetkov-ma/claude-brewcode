// Pure band rendering: view + registry entries -> rows -> tree. Zero I/O; atoms and `$` stay in register.ts.
import type { ElementTable, RenderElement } from 'claude-code'
import type { EditorEntry, EditorStyle } from './editor'
import type { PlaceholderView } from './match'

export type BandRow = { text: string; name: string; isKnown: boolean; description: string; body: string; isPlanOnly: boolean }
export type BandState = { isExpanded: boolean; isPlan: boolean; style: EditorStyle; onToggle: () => unknown; budget: number }
export type BandUi = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

// Default TUI: maxRows = terminal height and the prompt box + footer take 8 rows more (45-row probe: 37 fit, 38 clip); +4 for a wrapped draft or a spinner.
const BAND_RESERVE = 12
const BAND_MAX = 30
const BAND_MIN = 6

// Rows the whole band may take: fullscreen -> the engine's bottom-slot rows, else the terminal height less the reserve; always 6..30 (fullscreen up to maxRows).
export const bandBudget = (maxRows: number, isFullscreen: boolean): number =>
  isFullscreen ? Math.min(BAND_MAX, maxRows) : Math.max(BAND_MIN, Math.min(BAND_MAX, maxRows - BAND_RESERVE))

// First `lines` rows of a body, one truncated Text per line; the last row says how many lines were cut.
export function bodyRows(Text: BandUi['Text'], body: string, lines: number, key: string): RenderElement[] {
  const all = body.split('\n')
  const cut = all.length > lines ? Math.max(lines - 1, 0) : all.length
  const out = all.slice(0, cut).map((l, i) => (
    <Text key={`${key}:${i}`} dimColor wrap="truncate-end">
      {l === '' ? ' ' : l}
    </Text>
  ))
  if (cut < all.length) {
    out.push(
      <Text key={`${key}:more`} dimColor>
        {`... +${all.length - cut} lines`}
      </Text>,
    )
  }
  return out
}

export const UNKNOWN_LABEL = 'unknown placeholder'
export const PLAN_ONLY_LABEL = '(plan only)'

// One row per distinct token (case-insensitive, first occurrence); known rows take description, body and plan flag from the entry.
export function bandRows(view: PlaceholderView, entries: readonly EditorEntry[]): BandRow[] {
  const byName = new Map<string, EditorEntry>()
  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    if (!byName.has(name)) byName.set(name, entry)
  }
  const seen = new Set<string>()
  const rows: BandRow[] = []
  for (const token of view.tokens) {
    const id = token.text.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    const entry = token.isKnown ? byName.get(token.name) : undefined
    rows.push({
      text: token.text,
      name: token.name,
      isKnown: token.isKnown,
      description: token.isKnown ? (entry?.description ?? token.name) : UNKNOWN_LABEL,
      body: entry?.body ?? '',
      isPlanOnly: entry?.planOnly === true,
    })
  }
  return rows
}

const hasBodies = (rows: readonly BandRow[]): boolean => rows.some((r) => r.body !== '')

export const toggleLabel = (isExpanded: boolean): string => (isExpanded ? 'Hide text' : 'Show text')

// Header (count + toggle Button, only when some row has a body), one keyed row per token, a `+K more` row past the budget; expanded -> capped body under the row.
// Collapsed -> UN-keyed hidden hover Box under the keyed row (a keyed hidden hover Box makes the engine refuse the band).
export function renderBand(ui: BandUi, rows: readonly BandRow[], state: BandState): RenderElement {
  const { Box, Text, Button } = ui
  const { isExpanded, isPlan, style, budget } = state
  const toggle = hasBodies(rows)
  const shown = rows.length + 1 <= budget ? rows : rows.slice(0, Math.max(budget - 2, 1))
  const hidden = rows.length - shown.length
  const free = budget - 1 - shown.length - (hidden > 0 ? 1 : 0)
  const bodies = shown.filter((r) => r.body !== '').length
  const lines = Math.max(bodies === 0 ? 0 : Math.floor(free / bodies), 1)
  const hoverLines = Math.max(free, 1)

  return (
    <Box key="band" flexDirection="column">
      <Box key="head">
        <Text dimColor>{`placeholders ${rows.length} `}</Text>
        {toggle ? <Button key="toggle" label={toggleLabel(isExpanded)} onPress={state.onToggle} /> : null}
      </Box>
      {shown.map((row) => (
        <Box key={`row:${row.text.toLowerCase()}`} flexDirection="column">
          <Box>
            <Text color={row.isKnown ? style.knownColor : style.unknownColor}>{row.text}</Text>
            <Text color={row.isKnown ? undefined : style.unknownColor} dimColor={row.isKnown} wrap="truncate-end">
              {`  ${row.description}`}
            </Text>
            {row.isPlanOnly && !isPlan ? <Text dimColor>{` ${PLAN_ONLY_LABEL}`}</Text> : null}
          </Box>
          {row.body === '' ? null : isExpanded ? (
            <Box marginLeft={2} flexDirection="column">
              {bodyRows(Text, row.body, lines, row.text.toLowerCase())}
            </Box>
          ) : (
            <Box marginLeft={2} flexDirection="column" display="none" hover={{ display: 'flex' }}>
              {bodyRows(Text, row.body, hoverLines, row.text.toLowerCase())}
            </Box>
          )}
        </Box>
      ))}
      {hidden > 0 ? <Text dimColor>{`... +${hidden} more placeholders`}</Text> : null}
    </Box>
  )
}
