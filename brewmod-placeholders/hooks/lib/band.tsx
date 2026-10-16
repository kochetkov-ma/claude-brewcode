// Pure band rendering: view + registry entries + sent texts -> rows -> tree. Zero I/O; atoms and `$` stay in register.ts.
import type { ElementTable, RenderElement } from 'claude-code'
import { FILES_GONE } from './defs'
import { KNOWN_COLOR, UNKNOWN_COLOR, type CaretFocus, type EditorEntry } from './editor'
import type { PlaceholderView } from './match'
import { PLAN_LABEL, REASON, escapedReason, type PlanParts, type Sent } from './sent'

// body = exact text the token sends; reason = why it is not sent (plan-only has its own flag); plan = its plan-mode addon.
export type BandRow = { text: string; name: string; isKnown: boolean; description: string; body: string; isPlanOnly: boolean; isInline?: boolean; reason?: string; plan?: RowPlan }
// A plan-mode text beside the normal one: add = plan is the addition, replace = plan is the whole plan-mode text.
export type RowPlan = { kind: 'add' | 'replace'; plan: string }
export type BandMode = 'hidden' | 'escaped' | 'focus' | 'compact'
// mode = bandState's pick; marker = the escape typed; budget = focus band and hover rows, autoBudget = compact rows, queryBudget = rows once `?` closes the menu; columns = bodyColumns.
export type BandOptions = {
  mode: Exclude<BandMode, 'hidden'>
  focus: CaretFocus
  prefix: string
  marker: string
  isPlan: boolean
  isGone: boolean
  budget: number
  autoBudget: number
  queryBudget: number
  columns: number
  // The `P<name>?` hand-off runs (the build has the mod tools): the cut row names it.
  hasQuery: boolean
}
export type BandUi = Pick<ElementTable<'terminal'>, 'Box' | 'Text'>

// Default TUI: maxRows = terminal height and the prompt box + footer take 8 rows more (45-row probe: 37 fit, 38 clip); +4 for a wrapped draft or a spinner.
const BAND_RESERVE = 12
const BAND_MAX = 30
const BAND_MIN = 6
const AUTO_MAX = 15
const AUTO_SHARE = 0.4
// Up to this many token rows show their bodies in the compact band; more get hover bodies.
const AUTO_MAX_ROWS = 2
// An open typeahead reserves rows under the box that maxRows does not subtract (80x24: 6 rows fit, 120x40: 14).
const MENU_RESERVE = 6
const MENU_MIN = 3
export const FOCUS_MAX = 15

// Focus band: fullscreen -> the engine's bottom-slot rows, else the terminal height less the reserve; always 6..30 (fullscreen up to maxRows).
export const bandBudget = (maxRows: number, isFullscreen: boolean): number =>
  isFullscreen ? Math.min(BAND_MAX, maxRows) : Math.max(BAND_MIN, Math.min(BAND_MAX, maxRows - BAND_RESERVE))

// Compact band: min(15, 40% of the terminal rows), at least 6, never above the focus budget.
export const autoBudget = (maxRows: number, isFullscreen: boolean): number =>
  Math.min(bandBudget(maxRows, isFullscreen), isFullscreen ? AUTO_MAX : Math.max(BAND_MIN, Math.min(AUTO_MAX, Math.floor(maxRows * AUTO_SHARE))))

// The budgets; outside fullscreen an open menu caps budget and autoBudget, else the band's top rows are pushed into scrollback.
export function budgets(maxRows: number, isFullscreen: boolean, isMenuOpen: boolean): { budget: number; autoBudget: number; queryBudget: number } {
  const cap = isMenuOpen && !isFullscreen ? Math.max(MENU_MIN, Math.floor(maxRows / 2) - MENU_RESERVE) : Number.POSITIVE_INFINITY
  const open = bandBudget(maxRows, isFullscreen)
  return { budget: Math.min(open, cap), autoBudget: Math.min(autoBudget(maxRows, isFullscreen), cap), queryBudget: open }
}

// Rows a tree drawn beneath takes: Text or string 1, column Box the sum, row Box its tallest child; core's own drawing 0.
export function treeRows(node: unknown): number {
  if (typeof node === 'string') return 1
  if (node === null || typeof node !== 'object') return 0
  const el = node as { type?: unknown; props?: { flexDirection?: unknown; display?: unknown }; children?: unknown[] }
  if (el.type === 'engine' || el.props?.display === 'none') return 0
  if (el.type !== 'Box') return 1
  const rows = (el.children ?? []).map(treeRows)
  return String(el.props?.flexDirection ?? '').startsWith('column') ? rows.reduce((a, b) => a + b, 0) : Math.max(0, ...rows)
}

// Precedence: hidden > escaped > focus > compact.
export function bandState(p: { hasSurvey: boolean; draft: string | null; view: PlaceholderView; focus: string | null }): BandMode {
  if (p.hasSurvey || p.draft === '') return 'hidden'
  if (p.view.isEscaped === true) return 'escaped'
  if (p.view.tokens.length === 0) return 'hidden'
  return p.focus !== null && p.view.tokens.some((t) => t.name === p.focus) ? 'focus' : 'compact'
}

const ASCII = /^[\x20-\x7e]*$/
// East Asian Wide/Fullwidth blocks, sorted and disjoint; escapes only, as editors NFC-fold a raw U+F900 to U+8C48.
const WIDE = /[\p{Emoji_Presentation}\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97C\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u
const ZERO = /[\p{M}\u200B-\u200D\uFE00-\uFE0F]/u
const PICTO = /\p{Extended_Pictographic}/u
const VS16 = '\uFE0F'

// Terminal cells of a text: wide CJK and emoji 2, combining marks, ZWJ and VS16 0, the rest 1; VS16 turns a text-style pictograph (☺) to 2.
export function cells(s: string): number {
  if (ASCII.test(s)) return s.length
  let n = 0
  let prev = ''
  for (const ch of s) {
    if (ch === VS16 && PICTO.test(prev) && !WIDE.test(prev)) n += 1
    n += ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1
    prev = ch
  }
  return n
}

// One line as rows of at most `width` cells: greedy by words, a word wider than a row broken hard; each row is drawn truncate-end.
export function wrapRows(line: string, width: number): string[] {
  if (width < 1 || cells(line) <= width) return [line]
  const rows: string[] = []
  let cur = ''
  let col = 0
  for (const m of line.matchAll(/ +|[^ ]+/g)) {
    const seg = m[0]
    const w = cells(seg)
    if (col + w <= width) {
      cur += seg
      col += w
      continue
    }
    if (seg.startsWith(' ')) {
      rows.push(cur.trimEnd())
      cur = ''
      col = 0
      continue
    }
    if (col > 0) rows.push(cur.trimEnd())
    cur = ''
    col = 0
    for (const ch of seg) {
      const cw = cells(ch)
      if (col + cw > width && col > 0) {
        rows.push(cur)
        cur = ''
        col = 0
      }
      cur += ch
      col += cw
    }
  }
  // Trailing spaces past the width leave no blank row of their own.
  if (cur.trimEnd() !== '' || rows.length === 0) rows.push(cur.trimEnd())
  return rows
}

// Text cut to `room` cells with a trailing ellipsis; nothing when there is no room.
export function clip(s: string, room: number): string {
  if (cells(s) <= room) return s
  if (room < 1) return ''
  let out = ''
  let used = 0
  for (const ch of s) {
    const w = cells(ch)
    if (used + w > room - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}

// Rows a body takes at `width`: its source lines as they are (the text exactly as sent), each wrapped.
const rowsOf = (body: string, width: number): number => (body === '' ? 0 : body.split('\n').reduce((n, l) => n + wrapRows(l, width).length, 0))
// Rows a drawn body needs: a plan note (outside plan mode) or a `sends instead` mark adds one; plan mode's `adds` mark takes the blank separator row.
const needOf = (r: BandRow, isPlan: boolean, width: number): number => rowsOf(r.body, width) + (r.plan !== undefined && (!isPlan || r.plan.kind === 'replace') ? 1 : 0)

// Rows per body, never more than `free` in all: a body needing less leaves its spare rows to the rest; each gets one while rows are left.
export function shareRows(needs: readonly number[], free: number): number[] {
  const out = needs.map(() => 0)
  const order = needs.map((_, i) => i).sort((a, b) => (needs[a] ?? 0) - (needs[b] ?? 0))
  let left = free
  order.forEach((i, k) => {
    const give = left <= 0 ? 0 : Math.min(needs[i] ?? 0, Math.max(1, Math.floor(left / (order.length - k))))
    out[i] = give
    left -= give
  })
  return out
}

// Colour rule: every row Claude receives now is bold in the theme text colour; everything else is dim.
const SENT_STYLE = { color: 'text', bold: true } as const
const styleOf = (isSent: boolean) => (isSent ? SENT_STYLE : { dimColor: true })
const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`)
const moreLines = (n: number): string => `... ${n} more ${plural(n, 'line')}`

// A row piece: plain = dim label, act = what to type or do, key = a key to press, tok = a placeholder name.
export type Part = string | { act: string } | { key: string } | { tok: string; isKnown: boolean }
// Token names: placeholder colour (unknown: warning), bold; actions: theme text colour, underlined; keys: theme text colour.
export const tokStyle = (isKnown: boolean) => ({ color: isKnown ? KNOWN_COLOR : UNKNOWN_COLOR, bold: true }) as const
const ACT_STYLE = { color: 'text', underline: true } as const
const KEY_STYLE = { color: 'text' } as const
const partText = (p: Part): string => (typeof p === 'string' ? p : 'act' in p ? p.act : 'key' in p ? p.key : p.tok)
const partsCells = (parts: readonly Part[]): number => cells(parts.map(partText).join(''))

// One row of styled pieces, cut at the end as a whole.
function partsRow(Text: BandUi['Text'], key: string, parts: readonly Part[]): RenderElement {
  return (
    <Text key={key} wrap="truncate-end">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Text key={`${key}:${i}`} dimColor>
            {p}
          </Text>
        ) : 'act' in p ? (
          <Text key={`${key}:${i}`} {...ACT_STYLE}>
            {p.act}
          </Text>
        ) : 'key' in p ? (
          <Text key={`${key}:${i}`} {...KEY_STYLE}>
            {p.key}
          </Text>
        ) : (
          <Text key={`${key}:${i}`} {...tokStyle(p.isKnown)}>
            {p.tok}
          </Text>
        ),
      )}
    </Text>
  )
}

// What a cut row offers: the show command (plus the `P<name>?` hand-off where it runs), or `?` while the menu caps the rows.
export type More = { kind: 'show'; token: string; hasQuery: boolean } | { kind: 'query'; token: string } | null

// The cut row: the widest variant that fits `width`; the hand-off goes first, the show command is never cut while it fits alone.
export function cutParts(left: number, more: More, width: number): Part[] {
  const lines = moreLines(left)
  if (more === null) return [lines]
  if (more.kind === 'query') return [`${lines} · `, { act: `type ? after ${more.token}` }, ' to see all']
  const show: Part = { act: `/placeholders show ${more.token}` }
  const tiers: Part[][] = [
    ...(more.hasQuery ? [[`${lines} · whole text: `, show, ' or ', { act: `${more.token}?` }, ' alone ', { key: '[Enter]' }]] : []),
    [`${lines} · whole text: `, show],
    [`${lines} · `, show],
  ]
  return tiers.find((t) => partsCells(t) <= width) ?? [show]
}

// Whole source lines of a body while their pre-wrapped rows fit `rows`; a cut adds one row counting the source lines left and what `more` offers.
function bodyRows(Text: BandUi['Text'], body: string, rows: number, key: string, width: number, more: More, isSent: boolean): RenderElement[] {
  const lines = body.split('\n').map((l) => wrapRows(l, width))
  const total = lines.reduce((n, l) => n + l.length, 0)
  const room = total > rows ? rows - 1 : total
  let take = 0
  let used = 0
  for (const l of lines) {
    if (used + l.length > room) break
    used += l.length
    take++
  }
  const out = lines.slice(0, take).flatMap((parts, i) =>
    parts.map((p, j) => (
      <Text key={`${key}:${i}:${j}`} {...styleOf(isSent)} wrap="truncate-end">
        {p === '' ? ' ' : p}
      </Text>
    )),
  )
  if (used < total) out.push(partsRow(Text, `${key}:more`, cutParts(lines.length - take, more, width)))
  return out
}

export const UNKNOWN_LABEL = 'unknown placeholder'
export const PLAN_ONLY_LABEL = `(${PLAN_LABEL.only})`
const GONE_REASON = 'not sent: plugin files removed'

// One row per distinct token (case-insensitive, first occurrence); known rows take description and plan flag from the entry, the text from `sent` when given.
export function bandRows(view: PlaceholderView, entries: readonly EditorEntry[], sent?: readonly Sent[], plans?: (name: string) => PlanParts): BandRow[] {
  const byName = new Map<string, EditorEntry>()
  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    if (!byName.has(name)) byName.set(name, entry)
  }
  const bySent = new Map((sent ?? []).map((s) => [s.name, s]))
  const seen = new Set<string>()
  const rows: BandRow[] = []
  for (const token of view.tokens) {
    const id = token.text.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    const entry = token.isKnown ? byName.get(token.name) : undefined
    const s = token.isKnown ? bySent.get(token.name) : undefined
    const reason = s?.reason ?? null
    const pp = token.isKnown ? plans?.(token.name) : undefined
    rows.push({
      text: token.text,
      name: token.name,
      isKnown: token.isKnown,
      description: token.isKnown ? (entry?.description ?? token.name) : UNKNOWN_LABEL,
      body: s === undefined ? (entry?.body ?? '') : s.text,
      isPlanOnly: entry?.planOnly === true,
      ...(entry?.isInline === true ? { isInline: true } : {}),
      ...(reason !== null && reason !== REASON.planOnly ? { reason } : {}),
      ...(pp?.kind === 'add' || pp?.kind === 'replace' ? { plan: { kind: pp.kind, plan: pp.plan } } : {}),
    })
  }
  return rows
}

// Every band string; P = the prefix, token = the first or focused token as typed.
const showMore = (o: BandOptions, row: BandRow): More => ({ kind: 'show', token: o.prefix + row.name, hasQuery: o.hasQuery })
const compactFoot = (token: string, prefix: string): Part[] => ['more: ', { act: `put the caret on ${token}` }, ' · send as typed: ', { act: `${prefix}/` }, ' · help: ', { act: '/placeholders help' }]
const focusFoot = (token: string, prefix: string): Part[] => ['close: ', { act: `move the caret off ${token}` }, ' · send as typed: ', { act: `${prefix}/` }]
const UNKNOWN_FOOT: Part[] = ['names: ', { act: '/placeholders list' }]
const alsoRow = (rows: readonly BandRow[]): Part[] => ['also:', ...rows.flatMap((r): Part[] => [' ', { tok: r.text, isKnown: r.isKnown }])]
const moreText = (hidden: number): string => `... ${hidden} more ${plural(hidden, 'placeholder')}`
const ESCAPED_HEAD = '  placeholders off: this message is sent exactly as typed'
const escapedFoot = (marker: string): Part[] => ['turn back on: ', { act: `delete ${marker}` }]
const PLAN_HEAD = ' · plan mode'
const PLAN_PLUS = ` ${PLAN_LABEL.plus}`
// The band knows plan mode only after a prompt (state file), so the note says when the text is sent.
const planNote = (p: RowPlan): string => {
  const n = p.plan.split('\n').length
  const lines = `${n} ${plural(n, 'line')}`
  return p.kind === 'add' ? `not sent now · plan mode adds ${lines}` : `not sent now · plan mode sends ${lines} instead`
}

// Body rows sit 2 cells in.
const bodyWidth = (o: BandOptions): number => Math.max(o.columns - 2, 1)
// Token rows that fit `budget` beside the band head, the foot and a `K more` row.
const fitting = (rows: readonly BandRow[], budget: number): readonly BandRow[] => (rows.length + 2 <= budget ? rows : rows.slice(0, Math.max(budget - 3, 0)))
// Rows left for bodies once the head, the foot, `shown` token rows and a `K more` row past them are drawn.
const freeRows = (budget: number, shown: number, total: number): number => budget - 2 - shown - (shown < total ? 1 : 0)

type Fit = { shown: readonly BandRow[]; alloc: ReadonlyMap<BandRow, number> }

// Token rows that fit `budget` and the body rows each shown row gets.
// Fewer free rows than bodies: the last token rows fold into `K more` (one stays), so the band never passes `budget`.
function fitRows(rows: readonly BandRow[], budget: number, width: number, isPlan: boolean): Fit {
  let shown = fitting(rows, budget)
  while (shown.length > 1 && freeRows(budget, shown.length, rows.length) < shown.filter((r) => r.body !== '').length) shown = shown.slice(0, -1)
  const bodies = shown.filter((r) => r.body !== '')
  const needs = bodies.map((r) => needOf(r, isPlan, width))
  const give = shareRows(needs, freeRows(budget, shown.length, rows.length))
  return { shown, alloc: new Map(bodies.map((r, i) => [r, give[i] ?? 0])) }
}

// The body is what Claude receives with this message (a cut body too); else it is the other mode's text or not sent.
export const isSentNow = (row: BandRow, isPlan: boolean): boolean => row.isKnown && row.body !== '' && !(row.isPlanOnly && !isPlan) && (row.reason === undefined || row.reason === REASON.cut)

export const RECEIVES = 'Claude receives these lines now:'
// Label over a drawn body; null = nothing drawn or not sent in either mode (the head keeps its reason tag).
export function receivesLabel(row: BandRow, isPlan: boolean): string | null {
  if (!row.isKnown || row.body === '') return null
  if (row.isPlanOnly && !isPlan) return `not sent now (${PLAN_LABEL.only}):`
  if (row.reason === REASON.notInPlan) return 'not sent in plan mode:'
  if (row.reason === REASON.cut) return `Claude receives these lines now (${REASON.cut}):`
  return row.reason === undefined ? RECEIVES : null
}

// A token's one line: the description gives way so the token and its labels stay whole.
// label = receivesLabel of a drawn body: it replaces the plan-only/reason tags; isFocus also drops the description and the plan tag.
function drawHead(ui: BandUi, row: BandRow, o: BandOptions, label: string | null = null, isFocus = false): RenderElement {
  const { Box, Text } = ui
  const tail = label === null ? '' : ` · ${label}`
  const planLabel = label === null && row.isPlanOnly && !o.isPlan ? ` ${PLAN_ONLY_LABEL}` : ''
  const reasonLabel = label !== null || row.reason === undefined ? '' : ` (${row.reason})`
  const plus = row.plan === undefined || (isFocus && label !== null) ? '' : PLAN_PLUS
  const description = isFocus && label !== null ? '' : clip(`  ${row.description}`, o.columns - cells(row.text) - cells(plus) - cells(planLabel) - cells(reasonLabel) - cells(tail))
  return (
    <Box>
      <Text {...tokStyle(row.isKnown)}>{row.text}</Text>
      {description === '' ? null : (
        <Text dimColor wrap="truncate-end">
          {description}
        </Text>
      )}
      {plus === '' ? null : <Text dimColor>{plus}</Text>}
      {planLabel === '' ? null : <Text dimColor>{planLabel}</Text>}
      {reasonLabel === '' ? null : <Text dimColor>{reasonLabel}</Text>}
      {tail === '' ? null : (
        <Text dimColor wrap="truncate-end">
          {tail}
        </Text>
      )}
    </Box>
  )
}

function foot(ui: BandUi, o: BandOptions, parts: readonly Part[]): RenderElement {
  return partsRow(ui.Text, 'hint', o.isGone ? [FILES_GONE] : parts)
}

// Gone: a context row cannot be sent (its hook is gone); an inline one still expands.
const goneRow = (r: BandRow): BandRow => (r.isInline === true || !r.isKnown ? r : { ...r, body: '', reason: GONE_REASON })

export function renderBand(ui: BandUi, all: readonly BandRow[], o: BandOptions): RenderElement {
  if (o.mode === 'escaped') return renderEscaped(ui, all, o)
  const rows = o.isGone ? all.map(goneRow) : all
  const row = o.mode === 'focus' ? rows.find((r) => r.name === o.focus.name) : undefined
  return row === undefined ? renderCompact(ui, rows, o) : renderFocus(ui, rows, row, o)
}

// The caret token's sent text (up to 15 rows), the other tokens on one row; no Button.
// A cut names `?` only when the menu caps the rows and `?` would show the whole text; else the show command.
function renderFocus(ui: BandUi, rows: readonly BandRow[], row: BandRow, o: BandOptions): RenderElement {
  const { Box, Text } = ui
  const others = rows.filter((r) => r !== row)
  const roomOf = (budget: number): number => Math.max(0, Math.min(FOCUS_MAX, budget - 2 - (others.length > 0 ? 1 : 0)))
  const room = roomOf(o.budget)
  const need = needOf(row, o.isPlan, bodyWidth(o))
  const more: More = o.focus.isMenuOpen && !o.focus.isQuery && need <= roomOf(o.queryBudget) ? { kind: 'query', token: row.text } : showMore(o, row)
  return (
    <Box key="band" flexDirection="column">
      {tokenRow(ui, row, o, room, more, false, true)}
      {others.length === 0 ? null : partsRow(Text, 'also', alsoRow(others))}
      {foot(ui, o, row.isKnown ? focusFoot(row.text, o.prefix) : UNKNOWN_FOOT)}
    </Box>
  )
}

// A token's head and its body within `rows`; isHover = the body stays hidden until hovered (un-keyed Box: a keyed one is refused).
// A drawn body gets the receives label on the head; isFocus = the label replaces the description.
function tokenRow(ui: BandUi, row: BandRow, o: BandOptions, rows: number, more: More, isHover = false, isFocus = false): RenderElement {
  const { Box, Text } = ui
  const key = row.text.toLowerCase()
  const body = row.body === '' || rows < 1 ? null : planBody(Text, row, rows, key, o, more)
  return (
    <Box key={`row:${key}`} flexDirection="column">
      {drawHead(ui, row, o, body === null || isHover ? null : receivesLabel(row, o.isPlan), isFocus)}
      {body === null ? null : isHover ? (
        <Box marginLeft={2} flexDirection="column" display="none" hover={{ display: 'flex' }}>
          {body}
        </Box>
      ) : (
        <Box marginLeft={2} flexDirection="column">
          {body}
        </Box>
      )}
    </Box>
  )
}

// A body within `rows`: plan mode marks where the plan-mode text starts (dim label row), outside a dim row says it exists.
function planBody(Text: BandUi['Text'], row: BandRow, rows: number, key: string, o: BandOptions, more: More): RenderElement[] {
  const p = row.plan
  const width = bodyWidth(o)
  const isSent = isSentNow(row, o.isPlan)
  const whole = (n: number): RenderElement[] => bodyRows(Text, row.body, n, key, width, more, isSent)
  if (p === undefined || rows < (o.isPlan ? 3 : 2)) return whole(rows)
  if (!o.isPlan) {
    const note = (
      <Text key={`${key}:plan`} dimColor wrap="truncate-end">
        {planNote(p)}
      </Text>
    )
    return [...whole(rows - 1), note]
  }
  const mark = (label: string): RenderElement => (
    <Text key={`${key}:plan`} dimColor wrap="truncate-end">
      {label}
    </Text>
  )
  if (p.kind === 'replace') return [mark(PLAN_LABEL.instead), ...whole(rows - 1)]
  const sep = `\n\n${p.plan}`
  if (!row.body.endsWith(sep)) return whole(rows)
  const normal = row.body.slice(0, -sep.length)
  const [a, b] = shareRows([rowsOf(normal, width), rowsOf(p.plan, width)], rows - 1)
  return [...bodyRows(Text, normal, a ?? 1, `${key}:a`, width, null, isSent), mark(PLAN_LABEL.adds), ...bodyRows(Text, p.plan, b ?? 1, `${key}:b`, width, more, isSent)]
}

// `P/` in the message: nothing is substituted, so no bodies and no Button; one row per token says so.
function renderEscaped(ui: BandUi, rows: readonly BandRow[], o: BandOptions): RenderElement {
  const { Box, Text } = ui
  const shown = fitting(rows, o.budget)
  const reason = `  (${escapedReason(o.marker)})`
  return (
    <Box key="band" flexDirection="column">
      <Box key="head">
        <Text {...tokStyle(true)}>{o.marker}</Text>
        <Text dimColor wrap="truncate-end">
          {ESCAPED_HEAD}
        </Text>
      </Box>
      {shown.map((r) => (
        <Box key={`row:${r.text.toLowerCase()}`}>
          <Text {...tokStyle(r.isKnown)}>{r.text}</Text>
          <Text dimColor wrap="truncate-end">
            {reason}
          </Text>
        </Box>
      ))}
      {rows.length > shown.length ? <Text dimColor>{moreText(rows.length - shown.length)}</Text> : null}
      {partsRow(Text, 'hint', escapedFoot(o.marker))}
    </Box>
  )
}

// Header `placeholders N`, one keyed row per token, `K more placeholders` past the budget, a foot hint.
// 1-2 rows: bodies within the auto budget, a cut names the show command; 3+ rows: each body in a hidden hover Box.
function renderCompact(ui: BandUi, rows: readonly BandRow[], o: BandOptions): RenderElement {
  const { Box, Text } = ui
  const view = rows.length <= AUTO_MAX_ROWS ? fitRows(rows, o.autoBudget, bodyWidth(o), o.isPlan) : null
  const shown = view?.shown ?? fitting(rows, o.autoBudget)
  const hoverRows = Math.max(freeRows(o.budget, shown.length, rows.length), 1)
  const first = rows.find((r) => r.isKnown) ?? rows[0]
  return (
    <Box key="band" flexDirection="column">
      <Text key="head" dimColor>
        {`placeholders ${rows.length}${o.isPlan ? PLAN_HEAD : ''}`}
      </Text>
      {shown.map((row) => (view === null ? tokenRow(ui, row, o, hoverRows, showMore(o, row), true) : tokenRow(ui, row, o, view.alloc.get(row) ?? 0, showMore(o, row))))}
      {rows.length > shown.length ? <Text dimColor>{moreText(rows.length - shown.length)}</Text> : null}
      {foot(ui, o, compactFoot(first?.text ?? `${o.prefix}name`, o.prefix))}
    </Box>
  )
}
