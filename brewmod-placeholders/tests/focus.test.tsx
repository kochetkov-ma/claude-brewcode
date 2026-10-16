import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BAND, PLUG, ROOT, STATE_FILE, bandProps, bandTexts, bootBand, box, defaultsTree, mountBand, spansOf, textsOf, typed, type Tree } from './layer-io'
import { defaultDefs } from './fixtures'
import { bandState, budgets, receivesLabel, treeRows, wrapRows, type BandRow } from '../hooks/lib/band'
import { caretFocus, isMenuOpen } from '../hooks/lib/editor'
import { DEFAULT_ENTRIES } from '../hooks/lib/editor-state'
import { compileMatchers, markerOf, scanDraft } from '../hooks/lib/match'
import { assembleDraft, injectedContext } from '../hooks/lib/sent'

// ---- pure: wrap, caret, menu, state, budget

test('GIVEN lines, a long word, spaces and wide characters WHEN pre-wrapped THEN rows follow greedy word wrap, never exceed the width and trailing spaces add no row', async () => {
  const cases: [string, number][] = [['', 10], ['abc def', 7], ['abc def', 6], ['aaaa bbbb cccc', 9], ['x'.repeat(25), 10], ['ab ' + 'x'.repeat(12), 10], ['  - item', 4], ['日本語', 5], ['a'.repeat(9) + ' ', 9], ['abc def  ', 7], [' '.repeat(12), 9], ['x'.repeat(97) + '  ', 98]]

  expect(cases.map(([l, w]) => wrapRows(l, w)), 'rows').toEqual([
    [''],
    ['abc def'],
    ['abc', 'def'],
    ['aaaa bbbb', 'cccc'],
    ['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)],
    ['ab', 'x'.repeat(10), 'xx'],
    ['  -', 'item'],
    ['日本', '語'],
    ['a'.repeat(9)],
    ['abc def'],
    [''],
    ['x'.repeat(97)],
  ])
})

const row = (body: string, extra: Partial<BandRow> = {}): BandRow => ({ text: '++x', name: 'x', isKnown: true, description: 'X', body, ...extra })

test('GIVEN rows sent now, with a plan part, cut, not sent, empty and unknown WHEN the receives label is built THEN it says sent now, or is null when nothing is sent', async () => {
  const cases: BandRow[] = [
    row('a\nb\nc'),
    row('p1\n\np2', { plan: 'p2' }),
    row('c1\n...[truncated]', { reason: 'cut at 9000 chars' }),
    row('', { reason: 'not sent: ++rr wins' }),
    row('t', { reason: 'not sent: plugin files removed' }),
    row(''),
    row('', { isKnown: false }),
  ]

  expect(cases.map((r) => receivesLabel(r)), 'labels').toEqual([
    'Claude receives these lines now:',
    'Claude receives these lines now:',
    'Claude receives these lines now (cut at 9000 chars):',
    null,
    null,
    null,
    null,
  ])
})

const MS = compileMatchers('++', DEFAULT_ENTRIES.map((e) => e.name))

test('GIVEN a draft with ++r? and ++m WHEN the caret stands at each offset THEN the token holding it (end and one past a ? included) is focused', async () => {
  const text = 'x ++r? ++m y'
  const view = scanDraft(MS, text)

  expect(Array.from({ length: text.length + 1 }, (_, c) => [c, caretFocus(view, text, c)]), 'focus per caret').toEqual([
    [0, { name: null, isQuery: false }],
    [1, { name: null, isQuery: false }],
    [2, { name: 'r', isQuery: true }],
    [3, { name: 'r', isQuery: true }],
    [4, { name: 'r', isQuery: true }],
    [5, { name: 'r', isQuery: true }],
    [6, { name: 'r', isQuery: true }],
    [7, { name: 'm', isQuery: false }],
    [8, { name: 'm', isQuery: false }],
    [9, { name: 'm', isQuery: false }],
    [10, { name: 'm', isQuery: false }],
    [11, { name: null, isQuery: false }],
    [12, { name: null, isQuery: false }],
  ])
})

test('GIVEN drafts and carets WHEN the menu is checked THEN it is open only while our typeahead has rows for the word before the caret', async () => {
  const cases: [string, number][] = [['++r', 3], ['++rr', 4], ['++r?', 4], ['++r ', 4], ['say ++', 6], ['++r go', 3], ['++a', 3], ['++r go', 6], ['@@r', 3]]

  expect(cases.map(([t, c]) => isMenuOpen('++', t, c, DEFAULT_ENTRIES)), 'menu open').toEqual([true, false, false, false, true, true, false, false, false])
})

const tok = (name: string) => ({ text: `++${name}`, name, isKnown: true, start: 0, end: name.length + 2 })

test('GIVEN every input combination WHEN the band state is picked THEN hidden beats escaped beats focus beats compact', async () => {
  const one = { tokens: [tok('r')] }
  const esc = { tokens: [tok('r')], isEscaped: true as const }
  const cases = [
    { hasSurvey: true, draft: '++/ ++r', view: esc, focus: 'r' },
    { hasSurvey: false, draft: '', view: one, focus: 'r' },
    { hasSurvey: false, draft: '++/ ++r', view: esc, focus: 'r' },
    { hasSurvey: false, draft: '++/', view: { tokens: [], isEscaped: true as const }, focus: null },
    { hasSurvey: false, draft: 'plain', view: { tokens: [] }, focus: null },
    { hasSurvey: false, draft: '++r', view: one, focus: 'r' },
    { hasSurvey: false, draft: null, view: one, focus: 'r' },
    { hasSurvey: false, draft: '++r go', view: one, focus: 'm' },
    { hasSurvey: false, draft: '++r go', view: one, focus: null },
  ]

  expect(cases.map(bandState), 'states').toEqual(['hidden', 'hidden', 'escaped', 'escaped', 'hidden', 'focus', 'focus', 'compact', 'compact'])
})

test('GIVEN terminal heights, fullscreen and the menu WHEN budgets are computed THEN an open menu caps budget and autoBudget at max(3, rows/2 - 6) outside fullscreen and queryBudget stays uncapped', async () => {
  const cases: [number, boolean, boolean][] = [[24, false, false], [24, false, true], [40, false, false], [40, false, true], [16, false, true], [40, true, true]]

  expect(cases.map(([rows, full, menu]) => budgets(rows, full, menu)), 'budgets').toEqual([
    { budget: 12, autoBudget: 9, queryBudget: 12 },
    { budget: 6, autoBudget: 6, queryBudget: 12 },
    { budget: 28, autoBudget: 15, queryBudget: 28 },
    { budget: 14, autoBudget: 14, queryBudget: 28 },
    { budget: 3, autoBudget: 3, queryBudget: 6 },
    { budget: 30, autoBudget: 15, queryBudget: 30 },
  ])
})

// ---- sent.ts: an escaped draft sends nothing

const D = defaultDefs()

test('GIVEN an escaped draft WHEN it is assembled THEN nothing is injected or expanded and every token names the marker', async () => {
  const draft = assembleDraft('++/ ++m go ++r', D, '++', false)
  const back = assembleDraft('go ++m ++\\', D, '++', true)

  expect({ draft, back: back.tokens.map((t) => t.reason), injected: [injectedContext(D, '++', '++/ ++m', 'default'), injectedContext(D, '++', 'go ++m ++\\', 'plan')], markers: [markerOf('++', 'go ++m ++\\'), markerOf('++', 'c++/java ++m'), markerOf('@@', '@@/ x'), markerOf('++', 'plain')] }, 'escaped assembly').toStrictEqual({
    draft: {
      prompt: '++/ ++m go ++r',
      context: '',
      tokens: [
        { token: '++m', name: 'm', kind: 'context', text: '', isSent: false, reason: 'not sent: ++/ in this message' },
        { token: '++r', name: 'r', kind: 'context', text: '', isSent: false, reason: 'not sent: ++/ in this message' },
      ],
    },
    back: ['not sent: ++\\ in this message'],
    injected: ['', ''],
    markers: ['++\\', null, '@@/', null],
  })
})

// ---- through the engine: prompt.edit writes the focus atom, the band draws it

const lines = (name: string, n: number): string => Array.from({ length: n }, (_, i) => `${name}-line-${i + 1}`).join('\n')
const file = (name: string, description: string, body: string): string => `---\nname: "${name}"\ndescription: "${description}"\n---\n${body}`
const TREE: Tree = {
  ...defaultsTree(),
  [`${ROOT}/.claude/placeholders/yy.md`]: file('yy', 'Why mode', 'YY BODY'),
  [`${ROOT}/.claude/placeholders/long.md`]: file('long', 'Long mode', lines('long', 40)),
}

const boot = ($: any, on: On, tree: Tree = TREE) => bootBand($, on, { tree })
// A bare caret move (arrow, Home, End): no input, start == end == landing.
const move = ($: any, to: number) => $.prompt.edit({ origin: { kind: 'composer' }, text: box.text, cursor: box.cursor, start: to, end: to, inputText: '' })

// The ++r text as sent, one row per source line (a blank line draws as ' '): no line is joined or split at 98 cells.
const R_ROWS = [
  'User typed `++r` — Two-phase review discipline is active for this turn:',
  ' ',
  '[REVIEW DISCIPLINE: DOUBLE-CHECK]',
  'Every significant change: multi-agent review (matching reviewer expert, else',
  'general-purpose), simplification pass first.',
  '1) Review - finding = defect with path:line + evidence (failing command/input).',
  '2) Double-check - reproduce each finding.',
  '3) Fix - confirmed findings only.',
  'Big review -> split by area, never one long pass. Brief each: goal + area +',
  "acceptance, what's covered (don't re-litigate), who consumes the verdict;",
  'return verdict first, then findings.',
]
// Focus head: the token, then the receives label instead of the description.
const RECV = ' · Claude receives these lines now:'
const R_FOOT = 'close: move the caret off ++r · send as typed: ++/'
const LONG = Array.from({ length: 40 }, (_, i) => `long-line-${i + 1}`)

test('GIVEN ++r typed while ++rr is offered WHEN the band mounts at 24, 30 and 40 rows THEN the cut row names ? only where ? would show the whole text', async ($, on) => {
  await boot($, on)
  await typed($, '++r')

  expect([await bandTexts($, 24), await bandTexts($, 30), await bandTexts($, 40)], 'focus under the menu').toEqual([
    ['++r', RECV, ...R_ROWS.slice(0, 3), '... 8 more lines · whole text: /placeholders show ++r', R_FOOT],
    ['++r', RECV, ...R_ROWS.slice(0, 6), '... 5 more lines · type ? after ++r to see all', R_FOOT],
    ['++r', RECV, ...R_ROWS, R_FOOT],
  ])
})

test('GIVEN ++r? typed WHEN the band mounts at 24 rows THEN the menu is closed, FOCUS takes 10 rows and the cut row names the show command', async ($, on) => {
  await boot($, on)
  await typed($, '++r?')

  expect(await bandTexts($, 24), 'query focus').toEqual(['++r', RECV, ...R_ROWS.slice(0, 9), '... 2 more lines · whole text: /placeholders show ++r', R_FOOT])
})

test('GIVEN ++r? typed and the caret moved between ++r and ? WHEN the band mounts at 24 and 30 rows THEN the menu caps FOCUS and the cut row names the show command, never ?', async ($, on) => {
  await boot($, on)
  await typed($, '++r?')
  await move($, 3)

  expect([await bandTexts($, 24), await bandTexts($, 30)], 'caret before the ?').toEqual([
    ['++r', RECV, ...R_ROWS.slice(0, 3), '... 8 more lines · whole text: /placeholders show ++r', R_FOOT],
    ['++r', RECV, ...R_ROWS.slice(0, 6), '... 5 more lines · whole text: /placeholders show ++r', R_FOOT],
  ])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`GIVEN a 40-line placeholder under the caret on ${surface} WHEN the band mounts at 40 and 24 rows THEN at most 15 rows show and the last one names the show command`, async ($, on) => {
    await boot($, on)
    await typed($, 'see ++long')
    const foot = 'close: move the caret off ++long · send as typed: ++/'

    expect([await bandTexts($, 40, surface), await bandTexts($, 24, surface)], 'capped long focus').toEqual([
      ['++long', RECV, ...LONG.slice(0, 14), '... 26 more lines · whole text: /placeholders show ++long', foot],
      ['++long', RECV, ...LONG.slice(0, 9), '... 31 more lines · whole text: /placeholders show ++long', foot],
    ])
  })
}

test('GIVEN two tokens and the caret on the second WHEN the band mounts at 40 and 24 rows THEN the focused text shows, the other token sits on one also row and the band keeps its budget', async ($, on) => {
  await boot($, on)
  await typed($, 'see ++yy and ++long')
  const foot = 'close: move the caret off ++long · send as typed: ++/'

  expect([await bandTexts($, 40), await bandTexts($, 24)], 'focus with another token').toEqual([
    ['++long', RECV, ...LONG.slice(0, 14), '... 26 more lines · whole text: /placeholders show ++long', 'also: ++yy', foot],
    ['++long', RECV, ...LONG.slice(0, 8), '... 32 more lines · whole text: /placeholders show ++long', 'also: ++yy', foot],
  ])
})

// Auto view at 45 rows: 15 rows, ++long gets 10 of them; the cut row names the show command.
const COMPACT = ['placeholders 2', '++yy', '  Why mode', RECV, 'YY BODY', '++long', '  Long mode', RECV, ...LONG.slice(0, 9), '... 31 more lines · whole text: /placeholders show ++long', 'more: put the caret on ++yy · send as typed: ++/ · help: /placeholders help']

test('GIVEN a draft typed past its tokens WHEN Left lands on ++yy, then on the space, then End leaves the draft THEN compact, focus, compact', async ($, on) => {
  await boot($, on)
  await typed($, 'check ++yy then ++long go')
  const compact1 = await bandTexts($, 45)
  await move($, 10)
  const focused = await bandTexts($, 45)
  await move($, 11)
  const off = await bandTexts($, 45)
  await move($, 25)

  expect({ compact1, focused, off, compact2: await bandTexts($, 45) }, 'band per caret').toEqual({
    compact1: COMPACT,
    focused: ['++yy', RECV, 'YY BODY', 'also: ++long', 'close: move the caret off ++yy · send as typed: ++/'],
    off: COMPACT,
    compact2: COMPACT,
  })
})

test('GIVEN an unknown token under the caret WHEN the band mounts THEN it says unknown and points to the list', async ($, on) => {
  await boot($, on)
  await typed($, 'go ++nope')

  expect(await bandTexts($, 40), 'unknown focus').toEqual(['++nope', '  unknown placeholder', 'names: /placeholders list'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`GIVEN ++/ in a draft with tokens and the caret on one on ${surface} WHEN the band mounts THEN ESCAPED wins: no bodies, no Button, every token not sent`, async ($, on) => {
    await boot($, on)
    await typed($, '++/ ++yy ++long')

    expect(await bandTexts($, 40, surface), 'escaped band').toEqual([
      '++/',
      '  placeholders off: this message is sent exactly as typed',
      '++yy',
      '  (not sent: ++/ in this message)',
      '++long',
      '  (not sent: ++/ in this message)',
      'turn back on: delete ++/',
    ])
  })
}

test('GIVEN ++/ and twelve unknown tokens WHEN the escaped band mounts at 24 rows THEN nine token rows show and the last row counts the rest', async ($, on) => {
  await boot($, on)
  await typed($, `++/ ${Array.from({ length: 12 }, (_, i) => `++u${i + 1}`).join(' ')}`)

  expect(await bandTexts($, 24), 'escaped band at its budget').toEqual([
    '++/',
    '  placeholders off: this message is sent exactly as typed',
    ...Array.from({ length: 9 }, (_, i) => [`++u${i + 1}`, '  (not sent: ++/ in this message)']).flat(),
    '... 3 more placeholders',
    'turn back on: delete ++/',
  ])
})

test('GIVEN a mounted escaped band WHEN one edit deletes the first marker and leaves the other THEN the same band names the marker left', async ($, on) => {
  await boot($, on)
  await typed($, 'x ++yy ++/ ++\\')
  const ui = await mountBand($, 24)
  const before = await textsOf(ui)
  await typed($, 'x ++yy ++\\')
  const after = await textsOf(ui)
  await ui.unmount()

  expect({ before, after }, 'marker per edit').toEqual({
    before: ['++/', '  placeholders off: this message is sent exactly as typed', '++yy', '  (not sent: ++/ in this message)', 'turn back on: delete ++/'],
    after: ['++\\', '  placeholders off: this message is sent exactly as typed', '++yy', '  (not sent: ++\\ in this message)', 'turn back on: delete ++\\'],
  })
})

test('GIVEN the backslash marker typed WHEN the band mounts on desktop, which has no draft THEN the escape rows name the marker the edit saw', async ($, on) => {
  await boot($, on)
  await typed($, 'go ++yy ++\\')

  expect(await bandTexts($, 24, 'desktop'), 'desktop escaped band').toEqual(['++\\', '  placeholders off: this message is sent exactly as typed', '++yy', '  (not sent: ++\\ in this message)', 'turn back on: delete ++\\'])
})

test('GIVEN only the marker, or the backslash marker WHEN the band mounts THEN the escape rows name the marker typed', async ($, on) => {
  await boot($, on)
  await typed($, '++/')
  const alone = await bandTexts($, 24)
  await typed($, 'go ++yy ++\\')

  expect({ alone, back: await bandTexts($, 24) }, 'escape markers').toEqual({
    alone: ['++/', '  placeholders off: this message is sent exactly as typed', 'turn back on: delete ++/'],
    back: ['++\\', '  placeholders off: this message is sent exactly as typed', '++yy', '  (not sent: ++\\ in this message)', 'turn back on: delete ++\\'],
  })
})

test('GIVEN the plugin files gone from the start WHEN ++r is focused THEN its row says not sent and the foot is the reload line', async ($, on) => {
  const tree: Tree = Object.fromEntries(Object.entries(defaultsTree()).filter(([k]) => !k.startsWith(`${PLUG}/placeholders/`)))
  await boot($, on, tree)
  await typed($, '++r')

  expect(await bandTexts($, 40), 'gone focus').toEqual(['++r', '  Two-phase review: review every significant change, then doubl…', ' (not sent: plugin files removed)', 'plugin files removed (updated?) · run /reload-plugins'])
})

test('GIVEN edits and caret moves WHEN prompt.edit runs THEN the view and focus atoms are written only when they change', async ($, on) => {
  const writes: unknown[] = []
  on('state.set', (_$, e, next) => {
    writes.push({ key: e.key, value: e.value })
    return next(e)
  })
  await boot($, on)

  await typed($, 'go ++r')
  await typed($, 'go ++r')
  await move($, 3)
  await move($, 1)
  await move($, 2)
  await typed($, 'go ++r?')

  expect(writes, 'state writes').toEqual([
    { key: 'view', value: { tokens: [{ text: '++r', name: 'r', isKnown: true, start: 3, end: 6 }] } },
    { key: 'focus', value: { name: 'r', isQuery: false, isMenuOpen: true } },
    { key: 'focus', value: { name: 'r', isQuery: false, isMenuOpen: false } },
    { key: 'focus', value: { name: null, isQuery: false, isMenuOpen: false } },
    { key: 'focus', value: { name: 'r', isQuery: true, isMenuOpen: false } },
  ])
})

// ---- prompt.change: a taken typeahead row, a recall or an undo changes the box without prompt.edit

// The compact ++r band at 40 rows: caret past the token and its space.
const ACCEPTED_R = ['placeholders 1', '++r', '  Two-phase review: review every significant change, then dou…', RECV, ...R_ROWS, 'more: put the caret on ++r · send as typed: ++/ · help: /placeholders help']
// The box as the engine left it, then the event it raises for that change.
const changed = ($: any, text: string, origin: object) => {
  box.text = text
  box.cursor = text.length
  return $.prompt.change({ text, cursor: text.length, origin })
}

test('GIVEN an empty box WHEN a taken typeahead row leaves ++r and a space (origin engine) THEN the band draws without another key, as for the typed draft', async ($, on) => {
  await boot($, on)
  const before = await bandTexts($, 40)
  await changed($, '++r ', { kind: 'engine' })
  const accepted = await bandTexts($, 40)
  await typed($, '++r ')

  expect({ before, accepted, typed: await bandTexts($, 40) }, 'band before and after the accept').toEqual({ before: [], accepted: ACCEPTED_R, typed: ACCEPTED_R })
})

test('GIVEN an empty box WHEN a history recall puts fix ++m back (caret at its end) THEN the band focuses ++m', async ($, on) => {
  await boot($, on)
  await changed($, 'fix ++m', { kind: 'history' })

  expect(await bandTexts($, 40), 'recalled focus band').toEqual(['++m', RECV, M_HEAD, ' ', ...M_BODY, '... 16 more lines · whole text: /placeholders show ++m', M_NOTE, M_FOOT])
})

test('GIVEN box changes from the engine, history, undo and a plugin fill WHEN prompt.change runs THEN the atoms follow every change and are written only when they change', async ($, on) => {
  const writes: unknown[] = []
  on('state.set', (_$, e, next) => {
    writes.push({ key: e.key, value: e.value })
    return next(e)
  })
  await boot($, on)

  await changed($, '++r ', { kind: 'engine' })
  await changed($, '++r ', { kind: 'engine' })
  await changed($, '/placeholders show ++m', { kind: 'plugin', name: 'brewmod-placeholders' })
  await changed($, '++m', { kind: 'history' })
  await changed($, '', { kind: 'undo' })

  expect(writes, 'state writes').toEqual([
    { key: 'view', value: { tokens: [{ text: '++r', name: 'r', isKnown: true, start: 0, end: 3 }] } },
    { key: 'focus', value: { name: null, isQuery: false, isMenuOpen: false } },
    { key: 'view', value: { tokens: [{ text: '++m', name: 'm', isKnown: true, start: 19, end: 22 }] } },
    { key: 'focus', value: { name: 'm', isQuery: false, isMenuOpen: false } },
    { key: 'view', value: { tokens: [] } },
    { key: 'focus', value: { name: null, isQuery: false, isMenuOpen: false } },
  ])
})

// ---- plan part: m.plan.md (`plan: add`) = an addition joined to the m.md body in plan mode (design-a2 sections 1-2)

// The first rows of the ++m text as sent (source lines, a blank line as ' '); m.md's body is 32 rows at 98 cells, m.plan.md's addition 29.
const M_HEAD = 'User typed `++m` — Manager mode is active for this turn:'
const MP_HEAD = 'User typed `++m` — Manager + Plan Mode is active for this turn:'
const M_BODY = [
  '[ROLE: MANAGER]',
  ' ',
  'Manage; never code/build/test/hand-debug: the main context is for orchestration.',
  ' ',
  'Protocol: 1) TaskList; graph exists -> reuse it, else TaskCreate the full graph',
  'before any work. 2) addBlockedBy/addBlocks only for real data-handoffs, else',
  'parallel. 3) TaskUpdate owner, then launch. 4) Validate reports, integrate;',
  'completed only when truly done; failure -> follow-up task + re-delegate. 5) all',
  'code written -> final task: simplify, strip over-engineering.',
  'No Task tools (CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unset) -> same numbered graph',
  'in the plan or .claude/features/<task>.md.',
]
const M_ADDITION = [
  '[ADDON: PLAN MODE]',
  ' ',
  'Stay read-only: no code, board/task-state writes, installation or',
  'configuration. Read-only expert exploration is allowed.',
  ' ',
  'Include in the plan (English, token economy):',
]
// Compact head: the description gives way to plan + and the receives label.
const M_DESC = '  Manager mode: orchestrate and delegate, never code i…'
const M_FOOT = 'close: move the caret off ++m · send as typed: ++/'
const M_NOTE = 'not sent now · plan mode adds 18 lines'
const PLAN_TREE: Tree = { ...TREE, [STATE_FILE]: JSON.stringify({ mode: 'plan', ts: 1 }) }
const XX = {
  [`${ROOT}/.claude/placeholders/xx.md`]: file('xx', 'Ex mode', 'XX BODY'),
  [`${ROOT}/.claude/placeholders/xx.plan.md`]: '---\nname: "xx"\ndescription: "Ex mode"\nwhen: plan\n---\nXX PLAN\nSECOND',
}

test('GIVEN plan mode and ++m under the caret WHEN the band mounts THEN the head says what Claude receives, then the normal rows, a plan-colour plan mode adds: row and the addition, each cut on its own', async ($, on) => {
  await boot($, on, PLAN_TREE)
  await typed($, '++m')
  const ui = await mountBand($, 40)
  const mark = (await ui.findAll({ type: 'Text' })).find((t: { text: string }) => t.text === 'plan mode adds:')?.props
  await ui.unmount()

  expect({ texts: await bandTexts($, 40), mark }, 'plan focus').toEqual({
    texts: ['++m', RECV, MP_HEAD, ' ', ...M_BODY.slice(0, 4), '... 23 more lines', 'plan mode adds:', ...M_ADDITION, '... 12 more lines · whole text: /placeholders show ++m', M_FOOT],
    mark: { color: 'planMode', wrap: 'truncate-end' },
  })
})

test('GIVEN default mode and ++m WHEN the band mounts focused and compact THEN the compact row carries plan +, the focus head says what Claude receives and both end with a plan-colour not-sent-now plan note', async ($, on) => {
  await boot($, on)
  await typed($, '++m')
  const focused = await bandTexts($, 40)
  await typed($, '++m ')

  expect({ focused, compact: await bandTexts($, 40) }, 'default mode').toEqual({
    focused: ['++m', RECV, M_HEAD, ' ', ...M_BODY, '... 16 more lines · whole text: /placeholders show ++m', M_NOTE, M_FOOT],
    compact: ['placeholders 1', '++m', M_DESC, ' plan +', RECV, M_HEAD, ' ', ...M_BODY.slice(0, 8), '... 19 more lines · whole text: /placeholders show ++m', M_NOTE, 'more: put the caret on ++m · send as typed: ++/ · help: /placeholders help'],
  })
})

test('GIVEN plan mode and a compact band WHEN it mounts THEN the head says plan mode and ++m shares its rows with the addition', async ($, on) => {
  await boot($, on, PLAN_TREE)
  await typed($, '++yy ++m ')

  expect(await bandTexts($, 40), 'plan compact').toEqual([
    'placeholders 2', ' · plan mode',
    '++yy',
    '  Why mode',
    RECV,
    'YY BODY',
    '++m',
    M_DESC,
    ' plan +',
    RECV,
    MP_HEAD,
    ' ',
    ...M_BODY.slice(0, 2),
    '... 25 more lines',
    'plan mode adds:',
    ...M_ADDITION.slice(0, 3),
    '... 15 more lines · whole text: /placeholders show ++m',
    'more: put the caret on ++yy · send as typed: ++/ · help: /placeholders help',
  ])
})

test('GIVEN an old plan file without plan: add WHEN focused in plan mode and in default mode THEN its text is added, or a plan-mode note', async ($, on) => {
  const tree: Tree = { ...TREE, ...XX }
  on('turn.complete', (_$, e) => ({ text: e.answer }) as never)
  await boot($, on, tree)
  await typed($, '++xx')
  const normal = await bandTexts($, 40)
  tree[STATE_FILE] = JSON.stringify({ mode: 'plan', ts: 2 })
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
  await typed($, '++xx')
  const foot = 'close: move the caret off ++xx · send as typed: ++/'

  expect({ normal, plan: await bandTexts($, 40) }, 'old plan file added').toEqual({
    normal: ['++xx', RECV, 'XX BODY', 'not sent now · plan mode adds 2 lines', foot],
    plan: ['++xx', RECV, 'XX BODY', 'plan mode adds:', 'XX PLAN', 'SECOND', foot],
  })
})

// ---- body need: a plan note takes a row; plan mode's `adds` mark takes the blank separator row

const planAdd = (name: string, body: string): string => `---\nname: "${name}"\ndescription: "${name} plan"\nplan: add\n---\n${body}`
const NEED: Tree = {
  ...TREE,
  [`${ROOT}/.claude/placeholders/pp.md`]: file('pp', 'Pp mode', 'P1\nP2\nP3'),
  [`${ROOT}/.claude/placeholders/pp.plan.md`]: planAdd('pp', 'PA\nPB'),
  [`${ROOT}/.claude/placeholders/one.md`]: file('one', 'One mode', 'O1'),
  [`${ROOT}/.claude/placeholders/one.plan.md`]: planAdd('one', 'OA'),
  [`${ROOT}/.claude/placeholders/nn.md`]: file('nn', 'Nn mode', 'N1\nN2'),
  [`${ROOT}/.claude/placeholders/nn.plan.md`]: planAdd('nn', 'PA\nPB'),
  [`${ROOT}/.claude/placeholders/nnn.md`]: file('nnn', 'Nnn mode', 'NNN'),
}
const compactFoot = (token: string) => `more: put the caret on ${token} · send as typed: ++/ · help: /placeholders help`

test('GIVEN short bodies with a plan addition in default mode WHEN the compact band mounts THEN each body shows whole and keeps its plan note', async ($, on) => {
  await boot($, on, NEED)
  await typed($, '++pp ')
  const pp = await bandTexts($, 40)
  await typed($, '++one ')

  expect({ pp, one: await bandTexts($, 40) }, 'whole bodies, plan notes kept').toEqual({
    pp: ['placeholders 1', '++pp', '  Pp mode', ' plan +', RECV, 'P1', 'P2', 'P3', 'not sent now · plan mode adds 2 lines', compactFoot('++pp')],
    one: ['placeholders 1', '++one', '  One mode', ' plan +', RECV, 'O1', 'not sent now · plan mode adds 1 line', compactFoot('++one')],
  })
})

test('GIVEN an old 2-line plan text without plan: add WHEN the compact band mounts in plan mode THEN it is added under the normal text', async ($, on) => {
  await boot($, on, { ...TREE, ...XX, [STATE_FILE]: JSON.stringify({ mode: 'plan', ts: 1 }) })
  await typed($, '++xx ')

  expect(await bandTexts($, 40), 'old plan file added').toEqual(['placeholders 1', ' · plan mode', '++xx', '  Ex mode', ' plan +', RECV, 'XX BODY', 'plan mode adds:', 'XX PLAN', 'SECOND', compactFoot('++xx')])
})

test('GIVEN plan mode, ++nn with a 2-line addition under the caret and the menu open WHEN the band mounts at 19 and 18 rows THEN ? is named exactly where it would show all 5 rows', async ($, on) => {
  await boot($, on, { ...NEED, [STATE_FILE]: JSON.stringify({ mode: 'plan', ts: 1 }) })
  await typed($, '++nn')
  const foot = 'close: move the caret off ++nn · send as typed: ++/'

  expect([await bandTexts($, 19), await bandTexts($, 18)], 'query hint at the boundary').toEqual([
    ['++nn', RECV, '... 5 more lines · type ? after ++nn to see all', foot],
    ['++nn', RECV, '... 5 more lines · whole text: /placeholders show ++nn', foot],
  ])
})

test('GIVEN a body whose last source line wraps past the cut WHEN the compact band mounts in 40 columns THEN the cut row counts source lines, not wrapped rows, and a row too narrow for the count keeps the show command whole', async ($, on) => {
  await boot($, on, { ...TREE, [`${ROOT}/.claude/placeholders/wrap.md`]: file('wrap', 'Wrap mode', `a\nb\nc\n${'word '.repeat(30).trim()}`) })
  await typed($, '++wrap ')

  expect([await bandTexts($, 18, 'terminal', 60), await bandTexts($, 18, 'terminal', 40)], 'two source lines hidden').toEqual([
    ['placeholders 1', '++wrap', '  Wrap mode', RECV, 'a', 'b', '... 2 more lines · whole text: /placeholders show ++wrap', compactFoot('++wrap')],
    ['placeholders 1', '++wrap', RECV, 'a', 'b', '/placeholders show ++wrap', compactFoot('++wrap')],
  ])
})

// ---- fullscreen slot: maxRows = the engine's bottom slot; an outer plan-effort row arrives as maxRows - 1, an inner one is counted beneath

const fsRows = async ($: any, maxRows: number): Promise<number> => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', viewport: { columns: 102, rows: 48, isFullscreen: true }, props: bandProps(maxRows) })
  const rows = treeRows(await ui.drawn())
  await ui.unmount()
  return rows
}
const SLOTS = [6, 5, 14, 13]

test('GIVEN fullscreen plan mode and ++m WHEN focus, compact and escaped bands mount at slots 6 and 14 alone and 5 and 13 under an outer row THEN focus and compact fill the slot exactly and escaped takes 3 rows', async ($, on) => {
  await boot($, on, PLAN_TREE)
  const drawn: Record<string, number[]> = {}
  for (const [state, draft] of [['focus', '++m'], ['compact', '++m '], ['escaped', '++/ ++m']] as const) {
    await typed($, draft)
    drawn[state] = []
    for (const slot of SLOTS) drawn[state].push(await fsRows($, slot))
  }

  expect(drawn, 'rows drawn per slot').toEqual({ focus: [6, 5, 14, 13], compact: [6, 5, 14, 13], escaped: [3, 3, 3, 3] })
})

test('GIVEN fullscreen plan mode and an inner mod row beneath WHEN focus and compact ++m bands mount at slots 6 and 14 THEN the row plus the band fill the slot exactly', async ($, on) => {
  await bootBand($, on, { tree: PLAN_TREE }, (o) =>
    o('ui.render', { component: 'AbovePrompt' }, async ($$, e, next) => $$.ui.resolve(e).Box({ flexDirection: 'column', children: [$$.ui.resolve(e).Text({ color: 'warning', wrap: 'truncate-end', children: 'PLAN ROW' }), await next(e)] })),
  )
  const drawn: Record<string, number[]> = {}
  for (const [state, draft] of [['focus', '++m'], ['compact', '++m ']] as const) {
    await typed($, draft)
    drawn[state] = [await fsRows($, 6), await fsRows($, 14)]
  }

  expect(drawn, 'rows drawn per slot, the inner row included').toEqual({ focus: [6, 14], compact: [6, 14] })
})

// ---- colour rule: every row sent now is bold (theme text; a plan addition plan colour), plan-mode labels plan colour, explanations dim

const styled = async ($: any): Promise<{ sent: string[]; plansent: string[]; plan: string[]; dim: string[]; act: string[] }> => {
  const ui = await mountBand($, 40)
  const runs = await spansOf(ui)
  await ui.unmount()
  const of = (k: string): string[] => runs.filter(([s]) => s === k).map(([, t]) => t)
  return { sent: of('sent'), plansent: of('plansent'), plan: of('plan'), dim: of('dim'), act: of('act') }
}

test('GIVEN plan mode and ++m focused WHEN the band mounts THEN the normal rows are bold text colour, the addition bold plan colour, its label plan colour, the rest dim and the actions underlined', async ($, on) => {
  await boot($, on, PLAN_TREE)
  await typed($, '++m')

  expect(await styled($), 'plan focus styles').toEqual({
    sent: [MP_HEAD, ' ', ...M_BODY.slice(0, 4)],
    plansent: M_ADDITION,
    plan: ['plan mode adds:'],
    dim: [RECV, '... 23 more lines', '... 12 more lines · whole text: ', 'close: ', ' · send as typed: '],
    act: ['/placeholders show ++m', 'move the caret off ++m', '++/'],
  })
})

// The compact +++ rows at the default width: its head and the first wrapped lines of the cron text.
const PLUS_ROWS = [
  'User typed `+++` — Anti-drift cron is active for this turn:',
  ' ',
  '# [ADDON: ANTI-DRIFT CRON]',
  ' ',
  "Now: announce and create one unique session cron for the current task, hourly unless the user's",
  'interval differs, using available native scheduling tools. Record its task-specific prompt,',
  'schedule ID, timezone, tick count and stop rule. If scheduling is unavailable, report the gap',
  'without claiming a schedule exists.',
  ' ',
]

test('GIVEN default mode WHEN ++m (plan part not sent), +++ and ++/ ++m (escaped) bands mount THEN only the ++m and +++ normal rows are bold text colour', async ($, on) => {
  await boot($, on)
  const out: Record<string, string[]> = {}
  for (const draft of ['++m', '+++', '++/ ++m']) {
    await typed($, draft)
    out[draft] = (await styled($)).sent
  }

  expect(out, 'sent rows per draft').toEqual({ '++m': [M_HEAD, ' ', ...M_BODY], '+++': PLUS_ROWS, '++/ ++m': [] })
})
