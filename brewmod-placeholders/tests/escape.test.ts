import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { highlight, sameView } from '../hooks/lib/editor'
import { DEFAULT_ENTRIES } from '../hooks/lib/editor-state'
import { compileMatchers, escapeMarkers, isEscaped, markerOf } from '../hooks/lib/match'
import { ROOT, core, defaultsTree, spyWrites, typed, wire, type Tree } from './layer-io'

const ms = (prefix = '++') => compileMatchers(prefix, DEFAULT_ENTRIES.map((e) => e.name))
const KNOWN_M = { text: '++m', name: 'm', isKnown: true, start: 4, end: 7 }

// [prefix, text, escaped]: `P/` or `P\` anywhere, never glued to a letter, digit, mark, `_` or a prefix char on its left.
const VECTORS: [string, string, boolean][] = [
  ['++', '++/ ++m go', true],
  ['++', 'go ++m ++\\', true],
  ['++', 'fix `++/` later ++r', true],
  ['++', '++/', true],
  ['++', '(++/)', true],
  ['++', 'line\n++\\', true],
  ['++', '++/x', true],
  ['++', '++//', true],
  ['++', 'c++/java ++m', false],
  ['++', '+++/ go', false],
  ['++', '++ / ++m', false],
  ['++', 'please check ++r?', false],
  ['++', 'С++/CLI ++m', false],
  ['++', 'é++/', false],
  ['++', '_++/', false],
  ['++', '1++\\', false],
  ['++', 'á++/', false],
  ['++', '+/ ++ /', false],
  ['++', '', false],
  ['@@', '@@/ @@m', true],
  ['@@', '++/ @@m', false],
  ['@@', '@@@/', false],
  ['--', 'a --\\ b', true],
  ['--', 'a--/', false],
  ['$$', 'x $$/', true],
  ['[[', '[[\\', true],
  ['^^', 'w^^/', false],
  ['\\\\', '\\\\/', true],
  ['\\\\', '\\\\\\', true],
]

test('GIVEN escape vectors WHEN checked THEN P/ and P\\ escape only when not glued on the left', async () => {
  const got = VECTORS.map(([p, text]) => [p, text, isEscaped(p, text)])

  expect(got, 'escaped per vector').toEqual(VECTORS)
})

test('GIVEN a prefix WHEN its escape markers are built THEN they are P/ and P\\', async () => {
  expect([escapeMarkers('++'), escapeMarkers('@@')], 'markers').toEqual([['++/', '++\\'], ['@@/', '@@\\']])
})

// [prefix, text, first unglued marker | null]
const MARKERS: [string, string, string | null][] = [
  ['++', '++/ ++m go', '++/'],
  ['++', 'go ++m ++\\', '++\\'],
  ['++', 'c++/java then ++\\ x ++/', '++\\'],
  ['++', 'c++/java ++m', null],
  ['++', 'plain', null],
  ['@@', '@@/ @@m', '@@/'],
  ['@@', '++/ @@m', null],
]

test('GIVEN marker rows WHEN markerOf and isEscaped run on the bare prefix and three times on one compiled matchers THEN every call names the first unglued marker', async () => {
  const got = MARKERS.map(([p, text]) => {
    const c = compileMatchers(p, ['m'])
    return [p, text, markerOf(p, text), markerOf(c, text), markerOf(c, text), markerOf(c, text), isEscaped(c, text)]
  })

  expect(got, 'marker per row and call').toEqual(MARKERS.map(([p, text, m]) => [p, text, m, m, m, m, m !== null]))
})

test('GIVEN an escaped draft WHEN highlighted THEN markers are bold warning, every token dim and struck through, and the view is escaped', async () => {
  const out = highlight(ms(), '++/ ++m ++zz ++\\')

  expect(out, 'highlight').toEqual({
    view: {
      tokens: [
        { text: '++m', name: 'm', isKnown: true, start: 4, end: 7 },
        { text: '++zz', name: 'zz', isKnown: false, start: 8, end: 12 },
      ],
      isEscaped: true,
      escapedBy: '++/',
    },
    decorations: [
      { start: 0, end: 3, color: 'warning', bold: true },
      { start: 4, end: 7, dimColor: true, strikethrough: true },
      { start: 8, end: 12, dimColor: true, strikethrough: true },
      { start: 13, end: 16, color: 'warning', bold: true },
    ],
  })
})

test('GIVEN only the marker WHEN highlighted THEN the view is escaped with no tokens', async () => {
  expect(highlight(ms(), 'send ++/ as is'), 'highlight').toEqual({
    view: { tokens: [], isEscaped: true, escapedBy: '++/' },
    decorations: [{ start: 5, end: 8, color: 'warning', bold: true }],
  })
})

test('GIVEN a glued marker WHEN highlighted THEN tokens keep their normal paint and the view is not escaped', async () => {
  expect(highlight(ms(), 'c++/java ++m'), 'highlight').toEqual({
    view: { tokens: [{ text: '++m', name: 'm', isKnown: true, start: 9, end: 12 }] },
    decorations: [{ start: 9, end: 12, color: 'suggestion', underline: true }],
  })
})

test('GIVEN a custom prefix WHEN highlighted THEN only its own marker escapes', async () => {
  const out = [highlight(ms('@@'), '++/ @@m').view, highlight(ms('@@'), '@@\\ @@m').view]

  expect(out, 'views').toEqual([
    { tokens: [{ text: '@@m', name: 'm', isKnown: true, start: 4, end: 7 }] },
    { tokens: [{ text: '@@m', name: 'm', isKnown: true, start: 4, end: 7 }], isEscaped: true, escapedBy: '@@\\' },
  ])
})

test('GIVEN views that differ only in the escape flag WHEN compared THEN they differ', async () => {
  const plain = { tokens: [KNOWN_M] }
  const escaped = { tokens: [KNOWN_M], isEscaped: true as const }

  expect([sameView(plain, escaped), sameView(escaped, { tokens: [{ ...KNOWN_M }], isEscaped: true }), sameView({ tokens: [] }, { tokens: [], isEscaped: true })], 'same?').toEqual([false, true, false])
})

// --- through the engine ---

test('GIVEN a marker typed after a token WHEN prompt.edit runs THEN the escaped view is written and the paint switches', async ($, on) => {
  core(on)
  const writes = spyWrites(on)

  await typed($, 'x ++m')
  const out = await typed($, 'x ++m ++/')

  expect([writes, out], 'state writes and edit result').toEqual([
    [{ tokens: [{ text: '++m', name: 'm', isKnown: true, start: 2, end: 5 }] }, { tokens: [{ text: '++m', name: 'm', isKnown: true, start: 2, end: 5 }], isEscaped: true, escapedBy: '++/' }],
    { text: 'x ++m ++/', cursor: 9, decorations: [{ start: 2, end: 5, dimColor: true, strikethrough: true }, { start: 6, end: 9, color: 'warning', bold: true }] },
  ])
})

const file = (name: string, insert: string, body: string): string => `---\nname: "${name}"\ninsert: ${insert}\n---\n${body}`
const TREE: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/ii.md`]: file('ii', 'inline', 'II BODY') }
const submit = ($: { prompt: unknown }, text: string) => ($.prompt as any).submit({ text, origin: { kind: 'composer' }, wait: false })
const bottomSubmit = (on: On): string[] => {
  const seen: string[] = []
  on('prompt.submit', (_$, e) => {
    seen.push(e.text)
    return { text: e.text }
  })
  return seen
}

for (const text of ['++/ say ++ii and ++nope', 'say ++ii and ++nope ++\\']) {
  test(`GIVEN an escaped message ${JSON.stringify(text)} WHEN submitted THEN it goes on verbatim, no toast, no file read, the band view is reset`, async ($, on) => {
    const w = wire(on, { tree: TREE })
    const seen = bottomSubmit(on)
    const writes = spyWrites(on)

    await submit($, text)

    expect([seen, w.toasts, w.calls, writes], 'bottom saw, toasts, fs calls, state writes').toEqual([[text], [], { exists: [], list: [], read: [] }, [{ tokens: [] }]])
  })
}

test('GIVEN a glued marker WHEN submitted THEN the inline token expands and the unknown one is toasted', async ($, on) => {
  const w = wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, 'c++/java ++ii ++nope')

  expect([seen, w.toasts], 'bottom saw and toasts').toEqual([['c++/java II BODY ++nope'], ['unknown ++nope · sent as typed · names: /placeholders list']])
})

test('GIVEN a custom prefix WHEN the other prefix marker is submitted THEN its inline token still expands', { options: { prefix: '@@' } }, async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++/ @@ii')
  await submit($, '@@/ @@ii')

  expect(seen, 'bottom saw').toEqual(['++/ II BODY', '@@/ @@ii'])
})
