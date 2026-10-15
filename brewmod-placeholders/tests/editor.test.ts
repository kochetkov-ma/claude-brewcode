import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { EMPTY_VIEW, MAX_DECORATED_CHARS, highlight, sameView, suggest } from '../hooks/lib/editor'
import { DEFAULT_ENTRIES, editorMatchers, getEditorEntries, setEditorEntries } from '../hooks/lib/editor-state'
import { compileMatchers } from '../hooks/lib/match'
import { defaultDefs } from './fixtures'
import { BAND, ROOT, bandProps, core, defaultsTree, spyWrites, typed, wire, type Tree } from './layer-io'

const ms = (prefix = '++') => compileMatchers(prefix, DEFAULT_ENTRIES.map((e) => e.name))
const DRAFT = 'use ++m and ++zzz, then ++rr!'

const KNOWN_M = { text: '++m', name: 'm', isKnown: true, start: 4, end: 7 }
const UNKNOWN_ZZZ = { text: '++zzz', name: 'zzz', isKnown: false, start: 12, end: 17 }
const KNOWN_RR = { text: '++rr', name: 'rr', isKnown: true, start: 24, end: 28 }

test('GIVEN known and unknown tokens WHEN highlighted THEN decorations carry exact offsets, colors and underline only on known', async () => {
  const out = highlight(ms(), DRAFT)

  expect(out, 'highlight').toEqual({
    view: { tokens: [KNOWN_M, UNKNOWN_ZZZ, KNOWN_RR] },
    decorations: [
      { start: 4, end: 7, color: 'suggestion', underline: true },
      { start: 12, end: 17, color: 'warning' },
      { start: 24, end: 28, color: 'suggestion', underline: true },
    ],
  })
})

test('GIVEN a custom prefix WHEN highlighted THEN only that prefix is scanned', async () => {
  const out = highlight(ms('@@'), '++m @@m @@zz')

  expect(out, 'highlight').toEqual({
    view: {
      tokens: [
        { text: '@@m', name: 'm', isKnown: true, start: 4, end: 7 },
        { text: '@@zz', name: 'zz', isKnown: false, start: 8, end: 12 },
      ],
    },
    decorations: [
      { start: 4, end: 7, color: 'suggestion', underline: true },
      { start: 8, end: 12, color: 'warning' },
    ],
  })
})

test('GIVEN a draft without the prefix WHEN highlighted THEN view and decorations are empty', async () => {
  expect(highlight(ms(), 'plain text, no tokens +m'), 'highlight').toEqual({ view: { tokens: [] }, decorations: [] })
})

test('GIVEN a token followed by combining marks, ZWJ or variation selectors WHEN highlighted THEN the run ends on the grapheme edge', async () => {
  const runs = (text: string) => highlight(ms(), text).decorations.map((d) => [d.start, d.end])

  expect(
    [runs('a ++r\u0301 b'), runs('a ++r\u0301\u0302'), runs('a ++r\u200D'), runs('a ++r\uFE0F'), runs('a ++r\u0301b'), runs('a ++r')],
    'runs',
  ).toEqual([[[2, 6]], [[2, 7]], [[2, 6]], [[2, 6]], [[2, 6]], [[2, 5]]])
})

test('GIVEN a draft of exactly the cap WHEN highlighted THEN it is decorated; one char more is not', async () => {
  const atCap = '++m' + ' '.repeat(MAX_DECORATED_CHARS - 3)
  const overCap = atCap + ' '

  expect(atCap.length, 'at-cap length').toBe(20000)
  expect(highlight(ms(), atCap), 'at cap').toEqual({
    view: { tokens: [{ text: '++m', name: 'm', isKnown: true, start: 0, end: 3 }] },
    decorations: [{ start: 0, end: 3, color: 'suggestion', underline: true }],
  })
  expect(highlight(ms(), overCap), 'over cap').toEqual({ view: { tokens: [] }, decorations: [] })
})

test('GIVEN views WHEN compared THEN text, name and known flag decide and offsets do not', async () => {
  const base = { tokens: [KNOWN_M] }

  expect(sameView(base, { tokens: [{ ...KNOWN_M }] }), 'equal copy').toBe(true)
  expect(sameView(base, EMPTY_VIEW), 'length differs').toBe(false)
  expect(sameView(base, { tokens: [{ ...KNOWN_M, start: 5, end: 8 }] }), 'offset shifted').toBe(true)
  expect(sameView(base, { tokens: [{ ...KNOWN_M, isKnown: false }] }), 'known flipped').toBe(false)
  expect(sameView(base, { tokens: [{ ...KNOWN_M, text: '++M' }] }), 'case differs').toBe(false)
  expect(sameView(EMPTY_VIEW, { tokens: [] }), 'both empty').toBe(true)
  expect(sameView({ ...base, isEscaped: true, escapedBy: '++/' }, { ...base, isEscaped: true, escapedBy: '++\\' }), 'other marker').toBe(false)
})

test('GIVEN drafts with both escape markers WHEN highlighted THEN the view names the first marker typed', async () => {
  const r = { text: '++r', name: 'r', isKnown: true, start: 2, end: 5 }

  expect([highlight(ms(), 'x ++r ++/ ++\\').view, highlight(ms(), 'x ++r ++\\ ++/').view], 'views').toEqual([
    { tokens: [r], isEscaped: true, escapedBy: '++/' },
    { tokens: [r], isEscaped: true, escapedBy: '++\\' },
  ])
})

test('GIVEN the bare prefix WHEN suggested THEN every default name is a row with its description', async () => {
  const rows = suggest('++', '++', DEFAULT_ENTRIES)

  expect(rows, 'rows').toEqual(DEFAULT_ENTRIES.map((e) => ({ text: `++${e.name} `, label: `++${e.name}`, description: e.description })))
})

test('GIVEN a partial token WHEN suggested THEN only extensions remain and an exact match is excluded', async () => {
  expect(suggest('++', '++r', DEFAULT_ENTRIES), 'r -> rr only').toEqual([
    { text: '++rr ', label: '++rr', description: DEFAULT_ENTRIES[3]?.description },
  ])
  expect(suggest('++', '++rr', DEFAULT_ENTRIES), 'exact rr').toEqual([])
  expect(suggest('++', '+++', DEFAULT_ENTRIES), 'exact cron').toEqual([])
  expect(suggest('++', '++RR', DEFAULT_ENTRIES), 'exact, other case').toEqual([])
  expect(suggest('++', '++R', DEFAULT_ENTRIES).map((r) => r.label), 'partial, other case').toEqual(['++rr'])
  expect(suggest('++', '++x', DEFAULT_ENTRIES), 'no name starts with x').toEqual([])
})

test('GIVEN a space after the caret WHEN suggested THEN rows end without their own space', async () => {
  const rows = suggest('++', '++r', DEFAULT_ENTRIES, true)

  expect(rows, 'rows').toEqual([{ text: '++rr', label: '++rr', description: DEFAULT_ENTRIES[3]?.description }])
})

test('GIVEN a custom prefix WHEN suggested THEN rows use it and a foreign token gives none', async () => {
  const entries = [{ name: 'deploy', description: 'ship it' }, { name: 'dev' }]

  expect(suggest('@@', '@@d', entries), 'custom prefix').toEqual([
    { text: '@@deploy ', label: '@@deploy', description: 'ship it' },
    { text: '@@dev ', label: '@@dev', description: 'dev' },
  ])
  expect(suggest('@@', '++d', entries), 'other prefix').toEqual([])
  expect(suggest('@@', '(@@d', entries), 'token not starting with the prefix').toEqual([])
})

test('GIVEN repeated names WHEN suggested THEN the first entry wins and no row repeats', async () => {
  const rows = suggest('++', '++m', [{ name: 'm', description: 'first' }, { name: 'M', description: 'second' }, { name: 'mx' }])

  expect(rows, 'rows').toEqual([
    { text: '++mx ', label: '++mx', description: 'mx' },
  ])
  expect(suggest('++', '++', [{ name: 'm', description: 'first' }, { name: 'M', description: 'second' }]), 'dedup at bare prefix').toEqual([
    { text: '++m ', label: '++m', description: 'first' },
  ])
})

test('GIVEN the shipped definitions WHEN compared with the default entries THEN names and descriptions match the first file per name', async () => {
  const shipped = new Map([...defaultDefs()].reverse().map((d) => [d.name, d.description]))

  expect([...shipped.keys()].sort(), 'names').toEqual(DEFAULT_ENTRIES.map((e) => e.name).sort())
  expect(DEFAULT_ENTRIES.map((e) => [e.name, e.description]).sort(), 'descriptions').toEqual([...shipped.entries()].sort())
})

test('GIVEN the entries setter WHEN names change THEN matchers rebuild once per new array and per prefix', async () => {
  const before = getEditorEntries()
  const a = editorMatchers('++')
  const again = editorMatchers('++')
  const other = editorMatchers('@@')
  const next = [{ name: 'ship' }]
  setEditorEntries(next)
  const rebuilt = editorMatchers('@@')
  const names = [...rebuilt.byName.keys()]
  setEditorEntries(before)

  expect(again === a, 'same entries and prefix reuse').toBe(true)
  expect(other === a, 'new prefix rebuilds').toBe(false)
  expect(names, 'new entries compiled').toEqual(['ship'])
  expect(getEditorEntries() === before, 'restored').toBe(true)
})

// --- through the engine: prompt.edit / prompt.autocomplete hooks of the loaded module ---

test('GIVEN a draft with tokens WHEN prompt.edit runs THEN the box is unchanged and decorations are appended', async ($, on) => {
  core(on)

  const out = await typed($, DRAFT)

  expect(out, 'edit result').toEqual({
    text: DRAFT,
    cursor: 29,
    decorations: [
      { start: 4, end: 7, color: 'suggestion', underline: true },
      { start: 12, end: 17, color: 'warning' },
      { start: 24, end: 28, color: 'suggestion', underline: true },
    ],
  })
})

test('GIVEN a lower hook that decorates WHEN prompt.edit runs THEN its runs stay first and mine follow', async ($, on) => {
  on('prompt.edit', (_$, e) => ({ text: e.inputText, cursor: e.inputText.length, decorations: [{ start: 0, end: 1, bold: true }] }))

  const out = await typed($, 'x ++a')

  expect(out, 'edit result').toEqual({
    text: 'x ++a',
    cursor: 5,
    decorations: [
      { start: 0, end: 1, bold: true },
      { start: 2, end: 5, color: 'suggestion', underline: true },
    ],
  })
})

test('GIVEN a draft without the prefix WHEN prompt.edit runs THEN the answer is exactly the lower one', async ($, on) => {
  core(on)

  const out = await typed($, 'no tokens here')

  expect(out, 'edit result').toEqual({ text: 'no tokens here', cursor: 14 })
})

test('GIVEN a draft above the cap WHEN prompt.edit runs THEN no decoration is added', async ($, on) => {
  core(on)

  const out = await typed($, '++m' + ' '.repeat(MAX_DECORATED_CHARS - 2))

  expect(out, 'edit result').toEqual({ text: '++m' + ' '.repeat(MAX_DECORATED_CHARS - 2), cursor: MAX_DECORATED_CHARS + 1 })
})

test('GIVEN a sequence of edits WHEN prompt.edit runs THEN the view atom is written only when the token view changes', async ($, on) => {
  core(on)
  const writes = spyWrites(on)

  await typed($, '++m go')
  await typed($, '++m go')
  await typed($, '++m go on')
  await typed($, '++m go on ++zz')
  await typed($, '++m go on ++zz')
  await typed($, 'plain')
  await typed($, 'plain again')
  await typed($, '++m' + ' '.repeat(MAX_DECORATED_CHARS))

  const m = { text: '++m', name: 'm', isKnown: true, start: 0, end: 3 }
  expect(writes, 'view writes').toEqual([
    { tokens: [m] },
    { tokens: [m, { text: '++zz', name: 'zz', isKnown: false, start: 10, end: 14 }] },
    { tokens: [] },
  ])
})

test('GIVEN both escape markers WHEN one edit deletes the first THEN the view is written again with the marker left', async ($, on) => {
  core(on)
  const writes = spyWrites(on)

  await typed($, 'x ++r ++/ ++\\')
  await typed($, 'x ++r ++\\')

  const r = { text: '++r', name: 'r', isKnown: true, start: 2, end: 5 }
  expect(writes, 'view writes').toEqual([
    { tokens: [r], isEscaped: true, escapedBy: '++/' },
    { tokens: [r], isEscaped: true, escapedBy: '++\\' },
  ])
})

test('GIVEN the first edit has no tokens WHEN prompt.edit runs THEN the empty view is written once', async ($, on) => {
  core(on)
  const writes = spyWrites(on)

  await typed($, 'plain')
  await typed($, 'plainer')

  expect(writes, 'view writes').toEqual([{ tokens: [] }])
})

test('GIVEN a custom prefix WHEN prompt.edit runs THEN it drives the highlight with the fixed colors', { options: { prefix: '@@' } }, async ($, on) => {
  core(on)

  const out = await typed($, '++m @@m @@zz')

  expect(out, 'edit result').toEqual({
    text: '++m @@m @@zz',
    cursor: 12,
    decorations: [
      { start: 4, end: 7, color: 'suggestion', underline: true },
      { start: 8, end: 12, color: 'warning' },
    ],
  })
})

test('GIVEN an invalid prefix WHEN prompt.edit runs THEN the default prefix is used', { options: { prefix: 'ab' } }, async ($, on) => {
  core(on)

  const out = await typed($, '++m')

  expect(out, 'edit result').toEqual({ text: '++m', cursor: 3, decorations: [{ start: 0, end: 3, color: 'suggestion', underline: true }] })
})

const complete = ($: { prompt: unknown }, token: string) =>
  ($.prompt as any).autocomplete({ text: token, cursor: token.length, token, start: 0 })

test('GIVEN the bare prefix WHEN prompt.autocomplete runs THEN the engine rows come first and the five defaults follow', async ($, on) => {
  on('prompt.autocomplete', () => ({ suggestions: [{ text: 'engine' }] }))

  const out = await complete($, '++')

  expect(out, 'suggestions').toEqual({
    suggestions: [{ text: 'engine' }, ...DEFAULT_ENTRIES.map((e) => ({ text: `++${e.name} `, label: `++${e.name}`, description: e.description }))],
  })
})

test('GIVEN an exact name WHEN prompt.autocomplete runs THEN no row is added', async ($, on) => {
  on('prompt.autocomplete', () => ({ suggestions: [] }))

  expect(await complete($, '++rr'), 'exact rr').toEqual({ suggestions: [] })
  expect(await complete($, '+++'), 'exact cron').toEqual({ suggestions: [] })
})

test('GIVEN a token that is not two punctuation chars WHEN prompt.autocomplete runs THEN the hook is not asked', async ($, on) => {
  on('prompt.autocomplete', () => ({ suggestions: [{ text: 'engine' }] }))

  expect(await complete($, 'ab'), 'word token').toEqual({ suggestions: [{ text: 'engine' }] })
  expect(await complete($, '+m'), 'single punctuation').toEqual({ suggestions: [{ text: 'engine' }] })
})

test('GIVEN a custom prefix WHEN prompt.autocomplete runs THEN only that prefix completes', { options: { prefix: '@@' } }, async ($, on) => {
  on('prompt.autocomplete', () => ({ suggestions: [] }))

  expect(await complete($, '@@r'), 'custom').toEqual({
    suggestions: [{ text: '@@rr ', label: '@@rr', description: DEFAULT_ENTRIES[3]?.description }],
  })
  expect(await complete($, '++r'), 'default prefix ignored').toEqual({ suggestions: [] })
})

test('GIVEN a refused state write WHEN prompt.edit runs twice THEN the highlight still lands and the write is retried', async ($, on) => {
  core(on)
  const attempts: unknown[] = []
  on('state.set', (_$, e) => {
    attempts.push(e.value)
    return { deny: 'state down' }
  })

  const first = await typed($, '++m')
  const second = await typed($, '++m')

  const m = { text: '++m', name: 'm', isKnown: true, start: 0, end: 3 }
  expect(first, 'first edit').toEqual({ text: '++m', cursor: 3, decorations: [{ start: 0, end: 3, color: 'suggestion', underline: true }] })
  expect(second, 'second edit').toEqual(first)
  expect(attempts, 'write attempts').toEqual([{ tokens: [m] }, { tokens: [m] }])
})

// --- prompt.autocomplete: space after the caret, registry refresh ---

const HAND = `${ROOT}/.claude/placeholders/hand.md`
const startedTree = (): Tree => ({ ...defaultsTree(), [`${ROOT}/.claude/placeholders/seed.md`]: '---\nname: "seed"\ndescription: "Seed mode"\n---\nSEED' })

test('GIVEN a space right after the caret WHEN prompt.autocomplete runs THEN the row has no trailing space of its own', async ($, on) => {
  on('prompt.autocomplete', () => ({ suggestions: [] }))

  const out = await ($.prompt as any).autocomplete({ text: 'x ++r y', cursor: 5, token: '++r', start: 2 })

  expect(out, 'suggestions').toEqual({ suggestions: [{ text: '++rr', label: '++rr', description: DEFAULT_ENTRIES[3]?.description }] })
})

test('GIVEN a definition file made by hand WHEN a prefixed token is completed THEN the typeahead knows it, at most once a second', async ($, on) => {
  const tree = startedTree()
  wire(on, { tree })
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  const clock = mock.clock(on, { now: 0 })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const ask = () => ($.prompt as any).autocomplete({ text: '++ha', cursor: 4, token: '++ha', start: 0 })

  const first = await ask()
  tree[HAND] = '---\nname: "hand"\ndescription: "Hand made"\n---\nHAND'
  await clock.advance(999)
  const tooSoon = await ask()
  await clock.advance(1)
  const later = await ask()

  expect([first, tooSoon, later], 'rows at 0 ms, 999 ms, 1000 ms').toEqual([
    { suggestions: [] },
    { suggestions: [] },
    { suggestions: [{ text: '++hand ', label: '++hand', description: 'Hand made' }] },
  ])
})

test('GIVEN a registry read that fails WHEN a prefixed token is completed THEN the known rows still come back', { options: {} }, async ($, on) => {
  wire(on, { tree: startedTree(), fail: 'list' })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  mock.clock(on, { now: 0 })

  const out = await ($.prompt as any).autocomplete({ text: '++r', cursor: 3, token: '++r', start: 0 })

  expect(out, 'suggestions').toEqual({ suggestions: [{ text: '++rr ', label: '++rr', description: DEFAULT_ENTRIES[3]?.description }] })
})

// --- ui.render PromptHint: the band draws again when the box turns empty or non-empty ---

const HINT = { plugin: 'brewmod-placeholders', component: 'PromptHint' } as const
const hintProps = (isDraft: boolean) => ({ isDraft, isWorking: false, hint: '? for shortcuts' })

// Counts the band draws that reach the engine's own bottom: a draw the mod passes through is a count.
const drawCounts = (on: On) => {
  const counts = { band: 0, hint: 0 }
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
  on('ui.render', ($$, e) => {
    if (e.component === 'AbovePrompt') counts.band += 1
    if (e.component === 'PromptHint') counts.hint += 1
    return $$.ui.resolve(e).Text({ children: 'ENGINE' })
  })
  return counts
}

test('GIVEN a hint line drawn with a draft and then without WHEN the flip is seen THEN the band is drawn again once', async ($, on) => {
  const counts = drawCounts(on)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal', props: bandProps() })
  const first = await $.ui.mount({ ...HINT, surface: 'terminal', props: hintProps(true) })
  const afterFirst = counts.band
  const second = await $.ui.mount({ ...HINT, surface: 'terminal', props: hintProps(true) })
  const afterSame = counts.band
  const third = await $.ui.mount({ ...HINT, surface: 'terminal', props: hintProps(false) })

  expect([afterFirst, afterSame, counts.band], 'band draws after first hint, same draft, flipped draft').toEqual([1, 1, 2])
  for (const ui of [band, first, second, third]) await ui.unmount()
})
