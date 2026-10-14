import { test, expect } from 'claude-code/testing'
import { compileMatchers, matches, nameKind, scanDraft, validatePrefix, type Matchers, type PlaceholderToken } from '../hooks/lib/match'

const NAMES = ['m', 'a', 'r', 'rr', '+']
const tokens = (text: string, prefix = '++') => scanDraft(compileMatchers(prefix, NAMES), text).tokens

test('GIVEN a draft with known and unknown tokens WHEN scanned THEN spans carry exact offsets in order', async () => {
  const out = tokens('use ++m and ++zzz, then ++rr!')

  expect(out, 'tokens').toEqual([
    { text: '++m', name: 'm', isKnown: true, start: 4, end: 7 },
    { text: '++zzz', name: 'zzz', isKnown: false, start: 12, end: 17 },
    { text: '++rr', name: 'rr', isKnown: true, start: 24, end: 28 },
  ])
})

test('GIVEN cron and manager tokens WHEN scanned THEN the symbolic and word spans do not overlap', async () => {
  const out = tokens('+++ ++m')

  expect(out, 'tokens').toEqual([
    { text: '+++', name: '+', isKnown: true, start: 0, end: 3 },
    { text: '++m', name: 'm', isKnown: true, start: 4, end: 7 },
  ])
})

test('GIVEN mixed-case and trailing non-ASCII WHEN scanned THEN names are lowercase and the boundary is ASCII-only', async () => {
  const out = tokens('++M ++mé')

  expect(out, 'tokens').toEqual([
    { text: '++M', name: 'm', isKnown: true, start: 0, end: 3 },
    { text: '++m', name: 'm', isKnown: true, start: 4, end: 7 },
  ])
})

test('GIVEN glued r and rr WHEN scanned THEN only the first token is known and the second is blocked by the plus before it', async () => {
  const out = tokens('++r++rr')

  expect(out, 'tokens').toEqual([{ text: '++r', name: 'r', isKnown: true, start: 0, end: 3 }])
})

test('GIVEN r then rr WHEN scanned THEN both spans exist (exclusivity is an assemble concern)', async () => {
  const out = tokens('++r ++rr')

  expect(out.map((t) => t.name), 'names').toEqual(['r', 'rr'])
})

for (const text of ['i++', 'C++ code', '--flag', 'x++y', 'for (i=0;i<n;i++) {}', 'a ++ b', '++ m', 'x++m', 'C+++', 'é+++', '+++5', '++++', '+++m']) {
  test(`GIVEN the collision draft ${JSON.stringify(text)} WHEN scanned THEN no token is found`, async () => {
    expect(tokens(text), 'tokens').toEqual([])
  })
}

test('GIVEN a doubled word name WHEN scanned THEN it is one unknown token', async () => {
  const out = tokens('++mm ++mx_1')

  expect(out, 'tokens').toEqual([
    { text: '++mm', name: 'mm', isKnown: false, start: 0, end: 4 },
    { text: '++mx_1', name: 'mx_1', isKnown: false, start: 5, end: 11 },
  ])
})

test('GIVEN the custom prefix @@ WHEN scanned THEN only @@ tokens count and the default prefix is inert', async () => {
  const out = tokens('@@m x@@m @@mm ++m', '@@')

  expect(out, 'tokens').toEqual([
    { text: '@@m', name: 'm', isKnown: true, start: 0, end: 3 },
    { text: '@@mm', name: 'mm', isKnown: false, start: 9, end: 13 },
  ])
})

test('GIVEN an empty draft or one without the prefix WHEN scanned THEN the view is empty', async () => {
  expect([tokens(''), tokens('plain text')], 'views').toEqual([[], []])
})

for (const prefix of ['$$', '^^', '\\\\', '[]', '--', '{{', '||', '..', '*?', '()', '//']) {
  test(`GIVEN the regex-special prefix ${JSON.stringify(prefix)} WHEN scanned THEN known and symbolic names match and a glued prefix does not`, async () => {
    const out = tokens(`${prefix}m ${prefix}+ x${prefix}m`, prefix)

    expect(out, 'tokens').toEqual([
      { text: `${prefix}m`, name: 'm', isKnown: true, start: 0, end: prefix.length + 1 },
      { text: `${prefix}+`, name: '+', isKnown: true, start: prefix.length + 2, end: 2 * prefix.length + 3 },
    ])
  })
}

test('GIVEN a symbolic name WHEN matched THEN Unicode letters, digits, marks and the name chars block it', async () => {
  const ms = compileMatchers('++', ['+'])
  const hits = ['+++', '+++!', '+++‍', 'x +++ y', 'é+++', '字+++字', '+++5', '++++', '+++́'].map((t) => matches(ms, t, '+'))

  expect(hits, 'matches per draft').toEqual([true, true, true, true, false, false, false, false, false])
})

test('GIVEN a word name WHEN matched THEN the check is case-insensitive and unknown names are false', async () => {
  const ms = compileMatchers('++', NAMES)

  expect([matches(ms, '++RR', 'rr'), matches(ms, '++RR', 'RR'), matches(ms, '++rr', 'zz')], 'results').toEqual([true, true, false])
})

test('GIVEN names of both kinds and junk WHEN classified THEN word, symbol or null', async () => {
  expect(['m', 'rr', 'a_1', '+', '*!', 'A'.repeat(32), 'A'.repeat(33), '', 'a b', 'é'].map(nameKind), 'kinds').toEqual(
    ['word', 'word', 'word', 'symbol', 'symbol', 'word', null, null, null, null],
  )
})

test('GIVEN a junk name in the definition list WHEN compiled THEN it is skipped silently', async () => {
  const out = scanDraft(compileMatchers('++', ['m', 'bad name', '']), '++m ++bad').tokens

  expect(out.map((t) => [t.name, t.isKnown]), 'tokens').toEqual([['m', true], ['bad', false]])
})

test('GIVEN assorted prefix values WHEN validated THEN valid ones pass and the rest fall back to ++ with a warning', async () => {
  const rows = ['++', '@@', '/!', 'ab', '+', '+++++++++', '_+', '', '  ', 123, null, undefined].map(validatePrefix)

  expect(rows, 'results').toEqual([
    { prefix: '++', warning: null },
    { prefix: '@@', warning: null },
    { prefix: '/!', warning: 'prefix starting with / clashes with slash commands' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: 'prefix must be 2-8 ASCII punctuation characters (not _), using ++' },
    { prefix: '++', warning: null },
  ])
})

test('GIVEN the 8-char boundary prefix WHEN validated THEN it is accepted', async () => {
  expect(validatePrefix('!"#$%&\'(').prefix, 'prefix').toBe('!"#$%&\'(')
})

// Oracle: the original O(n*m) scan, kept verbatim to pin the pointer-walk to byte-identical output.
function scanDraftOracle(ms: Matchers, text: string): PlaceholderToken[] {
  if (!text.includes(ms.prefix)) return []
  const out: PlaceholderToken[] = []
  for (const m of ms.byName.values()) {
    for (const hit of text.matchAll(m.scan)) {
      const start = hit.index ?? 0
      out.push({ text: hit[0], name: m.name, isKnown: true, start, end: start + hit[0].length })
    }
  }
  const known = out.slice()
  for (const hit of text.matchAll(ms.unknown)) {
    const start = hit.index ?? 0
    const end = start + hit[0].length
    const name = (hit[1] ?? '').toLowerCase()
    if (ms.byName.has(name) || known.some((k) => start < k.end && end > k.start)) continue
    out.push({ text: hit[0], name, isKnown: false, start, end })
  }
  return out.sort((a, b) => a.start - b.start)
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('GIVEN 600 seeded random drafts over three prefixes WHEN scanned THEN every result equals the O(n*m) oracle', async () => {
  const random = rng(20261014)
  const rows = [
    { prefix: '++', pieces: ['++', '+++', '+', 'm', 'M', 'a', 'r', 'rr', 'RR', 'zz', 'q_1', 'x', '1', '_', 'é', ' ', ' ', '\n', '-'] },
    { prefix: '@@', pieces: ['@@', '@', '@@@', 'm', 'rr', 'zz', 'x', '_', ' ', ' ', '+', '.'] },
    { prefix: '!?', pieces: ['!?', '!', '?', '!?!?', 'm', 'a', 'rr', 'qq', 'é', ' ', ' ', '+'] },
  ]
  const actual: PlaceholderToken[][] = []
  const expected: PlaceholderToken[][] = []
  for (let i = 0; i < 600; i++) {
    const row = rows[i % rows.length] as (typeof rows)[number]
    const ms = compileMatchers(row.prefix, NAMES)
    const length = Math.floor(random() * 200)
    const draft = Array.from({ length }, () => row.pieces[Math.floor(random() * row.pieces.length)]).join('')
    actual.push(scanDraft(ms, draft).tokens)
    expected.push(scanDraftOracle(ms, draft))
  }
  const flat = expected.flat()

  expect([flat.filter((t) => t.isKnown).length, flat.filter((t) => !t.isKnown).length], 'corpus covers known and unknown spans [known, unknown]').toEqual([258, 394])
  expect(actual, 'scanDraft vs oracle, seed 20261014').toEqual(expected)
})

test('GIVEN a dense draft with known spans in a different matcher order WHEN scanned THEN the walk still equals the oracle', async () => {
  const ms = compileMatchers('++', ['+', 'rr', 'r', 'm', 'a'])
  const draft = '++m ++zz ++rr ++q +++ ++r ++a ++mm +++ ++rrr '

  expect(scanDraft(ms, draft).tokens, 'tokens').toEqual(scanDraftOracle(ms, draft))
})
