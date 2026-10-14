// Pure band rendering: view + registry entries -> rows -> tree. Zero I/O; atoms and `$` stay in register.ts.
import type { ElementTable, RenderElement } from 'claude-code'
import type { EditorEntry, EditorStyle } from './editor'
import type { PlaceholderView } from './match'

export type BandRow = { text: string; name: string; isKnown: boolean; description: string; body: string; isPlanOnly: boolean }
export type BandState = { isExpanded: boolean; isPlan: boolean; style: EditorStyle; onToggle: () => unknown }
export type BandUi = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

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

export const hasBodies = (rows: readonly BandRow[]): boolean => rows.some((r) => r.body !== '')

export const toggleLabel = (isExpanded: boolean): string => (isExpanded ? 'Hide text' : 'Show text')

// Header (count + toggle Button, only when some row has a body) then one keyed row per token; expanded -> visible body under the row.
// Collapsed -> UN-keyed hidden hover Box under the keyed row (a keyed hidden hover Box makes the engine refuse the band).
export function renderBand(ui: BandUi, rows: readonly BandRow[], state: BandState): RenderElement {
  const { Box, Text, Button } = ui
  const { isExpanded, isPlan, style } = state
  const toggle = hasBodies(rows)

  return (
    <Box key="band" flexDirection="column">
      <Box key="head">
        <Text dimColor>{`placeholders ${rows.length} `}</Text>
        {toggle ? <Button key="toggle" label={toggleLabel(isExpanded)} onPress={state.onToggle} /> : null}
      </Box>
      {rows.map((row) => (
        <Box key={`row:${row.text.toLowerCase()}`} flexDirection="column">
          <Box>
            <Text color={row.isKnown ? style.knownColor : style.unknownColor}>{row.text}</Text>
            <Text color={row.isKnown ? undefined : style.unknownColor} dimColor={row.isKnown} wrap="truncate-end">
              {`  ${row.description}`}
            </Text>
            {row.isPlanOnly && !isPlan ? <Text dimColor>{` ${PLAN_ONLY_LABEL}`}</Text> : null}
          </Box>
          {row.body === '' ? null : isExpanded ? (
            <Box marginLeft={2}>
              <Text dimColor>{row.body}</Text>
            </Box>
          ) : (
            <Box marginLeft={2} display="none" hover={{ display: 'flex' }}>
              <Text dimColor>{row.body}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
