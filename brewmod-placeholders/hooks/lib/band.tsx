// Pure band rendering: view + registry entries + sent texts -> rows -> tree. Zero I/O; atoms and `$` stay in register.ts.
import type { ElementTable, RenderElement } from 'claude-code'
import { FILES_GONE } from './defs'
import { KNOWN_COLOR, UNKNOWN_COLOR, type CaretFocus, type EditorEntry } from './editor'
import type { PlaceholderView } from './match'
import { PLAN_LABEL, REASON, escapedReason, type PlanParts, type Sent } from './sent'

// body = exact text the token sends; headLines = its leading header lines; reason = why it is not sent (plan-only has its own flag); plan = its plan-mode addon.
export type BandRow = { text: string; name: string; isKnown: boolean; description: string; body: string; isPlanOnly: boolean; isInline?: boolean; headLines?: number; reason?: string; plan?: RowPlan }
// A plan-mode text beside the normal one: add = plan is the addition, replace = plan is the whole plan-mode text.
export type RowPlan = { kind: 'add' | 'replace'; plan: string }
export type BandMode = 'hidden' | 'escaped' | 'focus' | 'compact'
// mode = bandState's pick; marker = the escape typed; budget = rows when opened, autoBudget = rows before, queryBudget = rows once `?` closes the menu; columns = bodyColumns.
export type BandOptions = {
  mode: Exclude<BandMode, 'hidden'>
  focus: CaretFocus
  prefix: string
  marker: string
  isExpanded: boolean
  isPlan: boolean
  isGone: boolean
  onToggle: () => unknown
  budget: number
  autoBudget: number
  queryBudget: number
  columns: number
}
export type BandUi = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

// Default TUI: maxRows = terminal height and the prompt box + footer take 8 rows more (45-row probe: 37 fit, 38 clip); +4 for a wrapped draft or a spinner.
const BAND_RESERVE = 12
const BAND_MAX = 30
const BAND_MIN = 6
const AUTO_MAX = 15
const AUTO_SHARE = 0.4
// Up to this many token rows show their bodies before the band is opened.
const AUTO_MAX_ROWS = 2
// An open typeahead reserves rows under the box that maxRows does not subtract (80x24: 6 rows fit, 120x40: 14).
const MENU_RESERVE = 6
const MENU_MIN = 3
export const FOCUS_MAX = 15

// Opened band: fullscreen -> the engine's bottom-slot rows, else the terminal height less the reserve; always 6..30 (fullscreen up to maxRows).
export const bandBudget = (maxRows: number, isFullscreen: boolean): number =>
  isFullscreen ? Math.min(BAND_MAX, maxRows) : Math.max(BAND_MIN, Math.min(BAND_MAX, maxRows - BAND_RESERVE))

// Band before it is opened: min(15, 40% of the terminal rows), at least 6, never above the opened budget.
export const autoBudget = (maxRows: number, isFullscreen: boolean): number =>
  Math.min(bandBudget(maxRows, isFullscreen), isFullscreen ? AUTO_MAX : Math.max(BAND_MIN, Math.min(AUTO_MAX, Math.floor(maxRows * AUTO_SHARE))))

// The budgets; outside fullscreen an open menu caps budget and autoBudget, else the band's top rows are pushed into scrollback.
export function budgets(maxRows: number, isFullscreen: boolean, isMenuOpen: boolean): { budget: number; autoBudget: number; queryBudget: number } {
  const cap = isMenuOpen && !isFullscreen ? Math.max(MENU_MIN, Math.floor(maxRows / 2) - MENU_RESERVE) : Number.POSITIVE_INFINITY
  const open = bandBudget(maxRows, isFullscreen)
  return { budget: Math.min(open, cap), autoBudget: Math.min(autoBudget(maxRows, isFullscreen), cap), queryBudget: open }
}

// Precedence: hidden > escaped > focus > compact; the opened Button turns compact into the expanded band.
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

const HEAD_STYLE = { bold: true } as const
const BODY_STYLE = { dimColor: true } as const

// Whole source lines of a body while their pre-wrapped rows fit `rows`; a cut adds one row counting the rows left, plus `more`.
function bodyRows(Text: BandUi['Text'], body: string, rows: number, key: string, width: number, headLines = 0, more = ''): RenderElement[] {
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
      <Text key={`${key}:${i}:${j}`} {...(i < headLines ? HEAD_STYLE : BODY_STYLE)} wrap="truncate-end">
        {p === '' ? ' ' : p}
      </Text>
    )),
  )
  if (used < total) {
    out.push(
      <Text key={`${key}:more`} dimColor wrap="truncate-end">
        {`... +${total - used} lines${more}`}
      </Text>,
    )
  }
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
      ...(s !== undefined && s.headLines > 0 ? { headLines: s.headLines } : {}),
      ...(reason !== null && reason !== REASON.planOnly ? { reason } : {}),
      ...(pp?.kind === 'add' || pp?.kind === 'replace' ? { plan: { kind: pp.kind, plan: pp.plan } } : {}),
    })
  }
  return rows
}

// Every band string; P = the prefix, token = the first or focused token as typed.
export const TOGGLE_KEYS = 'ctrl+x → tab → enter'
const showHint = (token: string): string => ` · /placeholders show ${token}`
const queryHint = (token: string): string => ` · type ? after ${token} for more`
const compactFoot = (token: string, prefix: string): string => `more: put the caret on ${token} · send as typed: ${prefix}/ · /placeholders help`
const focusFoot = (token: string, prefix: string): string => `move the caret off ${token} to close · send as typed: ${prefix}/`
const UNKNOWN_FOOT = 'names: /placeholders list'
const alsoRow = (tokens: readonly string[]): string => `also: ${tokens.join(' ')}`
const moreText = (hidden: number): string => `... +${hidden} more placeholders`
const ESCAPED_HEAD = '  placeholders off: this message is sent exactly as typed'
const escapedFoot = (marker: string): string => `delete ${marker} to turn them back on`
const PLAN_HEAD = ' · plan mode'
const PLAN_PLUS = ` ${PLAN_LABEL.plus}`
// The band knows plan mode only after a prompt (state file), so the note says when the text is sent.
const planNote = (p: RowPlan): string => `+ plan-mode ${p.kind === 'add' ? 'part' : 'text'}, ${p.plan.split('\n').length} lines · sent in plan mode`

export const toggleLabel = (isExpanded: boolean): string => `${isExpanded ? 'Hide text' : 'Show text'}  ${TOGGLE_KEYS}`

// Body rows sit 2 cells in.
const bodyWidth = (o: BandOptions): number => Math.max(o.columns - 2, 1)
// Token rows that fit `budget` beside the band head, the foot and a `+K more` row.
const fitting = (rows: readonly BandRow[], budget: number): readonly BandRow[] => (rows.length + 2 <= budget ? rows : rows.slice(0, Math.max(budget - 3, 0)))
// Rows left for bodies once the head, the foot, `shown` token rows and a `+K more` row past them are drawn.
const freeRows = (budget: number, shown: number, total: number): number => budget - 2 - shown - (shown < total ? 1 : 0)

type Fit = { shown: readonly BandRow[]; alloc: ReadonlyMap<BandRow, number>; isCut: boolean }

// Token rows that fit `budget`, the body rows each shown row gets, and whether a body got fewer than it needs.
// Fewer free rows than bodies: the last token rows fold into `+K more` (one stays), so the band never passes `budget`.
function fitRows(rows: readonly BandRow[], budget: number, width: number): Fit {
  let shown = fitting(rows, budget)
  while (shown.length > 1 && freeRows(budget, shown.length, rows.length) < shown.filter((r) => r.body !== '').length) shown = shown.slice(0, -1)
  const bodies = shown.filter((r) => r.body !== '')
  const needs = bodies.map((r) => rowsOf(r.body, width))
  const give = shareRows(needs, freeRows(budget, shown.length, rows.length))
  return { shown, alloc: new Map(bodies.map((r, i) => [r, give[i] ?? 0])), isCut: needs.some((n, i) => (give[i] ?? 0) < n) }
}

// A token's one line: the description gives way so the token and its labels stay whole.
function drawHead(ui: BandUi, row: BandRow, o: BandOptions): RenderElement {
  const { Box, Text } = ui
  const planLabel = row.isPlanOnly && !o.isPlan ? ` ${PLAN_ONLY_LABEL}` : ''
  const reasonLabel = row.reason === undefined ? '' : ` (${row.reason})`
  const plus = row.plan === undefined ? '' : PLAN_PLUS
  const description = clip(`  ${row.description}`, o.columns - cells(row.text) - cells(plus) - cells(planLabel) - cells(reasonLabel))
  return (
    <Box>
      <Text color={row.isKnown ? KNOWN_COLOR : UNKNOWN_COLOR}>{row.text}</Text>
      <Text color={row.isKnown ? undefined : UNKNOWN_COLOR} dimColor={row.isKnown} wrap="truncate-end">
        {description}
      </Text>
      {plus === '' ? null : <Text dimColor>{plus}</Text>}
      {planLabel === '' ? null : <Text dimColor>{planLabel}</Text>}
      {reasonLabel === '' ? null : row.reason?.startsWith('not sent') === true ? <Text color={UNKNOWN_COLOR}>{reasonLabel}</Text> : <Text dimColor>{reasonLabel}</Text>}
    </Box>
  )
}

function foot(ui: BandUi, o: BandOptions, text: string): RenderElement {
  const { Text } = ui
  return o.isGone ? (
    <Text key="hint" color={UNKNOWN_COLOR} wrap="truncate-end">
      {FILES_GONE}
    </Text>
  ) : (
    <Text key="hint" dimColor wrap="truncate-end">
      {text}
    </Text>
  )
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
  const need = rowsOf(row.body, bodyWidth(o)) + (row.plan === undefined ? 0 : 1)
  const more = o.focus.isMenuOpen && !o.focus.isQuery && need <= roomOf(o.queryBudget) ? queryHint(row.text) : showHint(o.prefix + row.name)
  return (
    <Box key="band" flexDirection="column">
      {tokenRow(ui, row, o, room, more)}
      {others.length === 0 ? null : (
        <Text key="also" dimColor wrap="truncate-end">
          {alsoRow(others.map((r) => r.text))}
        </Text>
      )}
      {foot(ui, o, row.isKnown ? focusFoot(row.text, o.prefix) : UNKNOWN_FOOT)}
    </Box>
  )
}

// A token's head and its body within `rows`; isHover = the body stays hidden until hovered (un-keyed Box: a keyed one is refused).
function tokenRow(ui: BandUi, row: BandRow, o: BandOptions, rows: number, more: string, isHover = false): RenderElement {
  const { Box, Text } = ui
  const key = row.text.toLowerCase()
  const body = row.body === '' || rows < 1 ? null : planBody(Text, row, rows, key, o, more)
  return (
    <Box key={`row:${key}`} flexDirection="column">
      {drawHead(ui, row, o)}
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

// A body within `rows`: plan mode marks where the plan-mode text starts (bold row), outside a dim row says it exists.
function planBody(Text: BandUi['Text'], row: BandRow, rows: number, key: string, o: BandOptions, more: string): RenderElement[] {
  const p = row.plan
  const width = bodyWidth(o)
  const whole = (n: number): RenderElement[] => bodyRows(Text, row.body, n, key, width, row.headLines, more)
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
    <Text key={`${key}:plan`} bold color="planMode" wrap="truncate-end">
      {label}
    </Text>
  )
  if (p.kind === 'replace') return [mark(PLAN_LABEL.instead), ...whole(rows - 1)]
  const sep = `\n\n${p.plan}`
  if (!row.body.endsWith(sep)) return whole(rows)
  const normal = row.body.slice(0, -sep.length)
  const [a, b] = shareRows([rowsOf(normal, width), rowsOf(p.plan, width)], rows - 1)
  return [...bodyRows(Text, normal, a ?? 1, `${key}:a`, width, row.headLines), mark(PLAN_LABEL.adds), ...bodyRows(Text, p.plan, b ?? 1, `${key}:b`, width, 0, more)]
}

// `P/` in the message: nothing is substituted, so no bodies and no Button; one row per token says so.
function renderEscaped(ui: BandUi, rows: readonly BandRow[], o: BandOptions): RenderElement {
  const { Box, Text } = ui
  const shown = fitting(rows, o.budget)
  const reason = `  (${escapedReason(o.marker)})`
  return (
    <Box key="band" flexDirection="column">
      <Box key="head">
        <Text color={UNKNOWN_COLOR} bold>
          {o.marker}
        </Text>
        <Text dimColor wrap="truncate-end">
          {ESCAPED_HEAD}
        </Text>
      </Box>
      {shown.map((r) => (
        <Box key={`row:${r.text.toLowerCase()}`}>
          <Text dimColor>{r.text}</Text>
          <Text dimColor wrap="truncate-end">
            {reason}
          </Text>
        </Box>
      ))}
      {rows.length > shown.length ? <Text dimColor>{moreText(rows.length - shown.length)}</Text> : null}
      <Text key="hint" dimColor wrap="truncate-end">
        {escapedFoot(o.marker)}
      </Text>
    </Box>
  )
}

// Header (count + toggle Button: 3+ rows with a body, or 1-2 rows whose auto view cuts a body the opened budget shows more of), one keyed row per token, `+K more` past the budget, a foot hint.
// Collapsed 3+ rows -> each body in a hidden hover Box.
function renderCompact(ui: BandUi, rows: readonly BandRow[], o: BandOptions): RenderElement {
  const { Box, Text, Button } = ui
  const width = bodyWidth(o)
  const auto = rows.length <= AUTO_MAX_ROWS
  const small = fitRows(rows, o.autoBudget, width)
  const toggle = auto ? small.isCut && o.budget > o.autoBudget : rows.some((r) => r.body !== '')
  const isExpanded = toggle && o.isExpanded
  // Collapsed 3+ rows: hover bodies take no rows until hovered, so only the token rows are fitted.
  const view = isExpanded ? fitRows(rows, o.budget, width) : auto ? small : null
  const shown = view?.shown ?? fitting(rows, o.autoBudget)
  // Nothing left to open: a cut names the command that prints the whole text.
  const isFinal = isExpanded || !toggle
  const hoverRows = Math.max(freeRows(o.budget, shown.length, rows.length), 1)
  const first = rows.find((r) => r.isKnown) ?? rows[0]
  return (
    <Box key="band" flexDirection="column">
      <Box key="head">
        <Text dimColor>{`placeholders ${rows.length}${o.isPlan ? PLAN_HEAD : ''} `}</Text>
        {toggle ? <Button key="toggle" label={toggleLabel(isExpanded)} onPress={o.onToggle} /> : null}
      </Box>
      {shown.map((row) =>
        view === null ? tokenRow(ui, row, o, hoverRows, showHint(o.prefix + row.name), true) : tokenRow(ui, row, o, view.alloc.get(row) ?? 0, isFinal ? showHint(o.prefix + row.name) : ''),
      )}
      {rows.length > shown.length ? <Text dimColor>{moreText(rows.length - shown.length)}</Text> : null}
      {foot(ui, o, compactFoot(first?.text ?? `${o.prefix}name`, o.prefix))}
    </Box>
  )
}
