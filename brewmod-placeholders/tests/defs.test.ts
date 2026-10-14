import { test, expect } from 'claude-code/testing'
import { PLACEHOLDER_FILES } from './parity/golden.generated'
import { extractFenced, parseDefinition, parseFrontMatter, parseLegacy, toDef } from '../hooks/lib/defs'

test('GIVEN no fence WHEN extracting THEN the whole text is trimmed', async () => {
  expect(extractFenced('\n  plain  \n'), 'text').toBe('plain')
})

test('GIVEN a fence with an info string WHEN extracting THEN the info string is dropped', async () => {
  expect(extractFenced('x\n```md\nbody\n```\ny'), 'text').toBe('body')
})

test('GIVEN several fences of both kinds WHEN extracting THEN blocks join with a blank line and outside text is gone', async () => {
  expect(extractFenced('a\n```\nA\n\n```\nb\n~~~\nB\n~~~\nc'), 'text').toBe('A\n\nB')
})

test('GIVEN a non-last block with trailing blank lines WHEN extracting THEN all trailing newlines of that block go', async () => {
  expect(extractFenced('```\nA\n\n\n```\n```\nB\n```'), 'text').toBe('A\n\nB')
})

test('GIVEN CRLF fences WHEN extracting THEN carriage returns survive inside and only the ends are trimmed', async () => {
  expect([extractFenced('```\r\nfoo\r\n```\r\n'), extractFenced('```\r\nA\r\n```\r\n```\r\nB\r\n```')], 'texts').toEqual(['foo', 'A\r\n\nB'])
})

test('GIVEN a BOM before an unfenced text or a fence WHEN extracting THEN trim eats it or the fence ignores it', async () => {
  expect([extractFenced('﻿plain\n'), extractFenced('﻿```\nx\n```\n')], 'texts').toEqual(['plain', 'x'])
})

test('GIVEN a tilde fence closed by a backtick fence WHEN extracting THEN it still closes (fences are not paired)', async () => {
  expect(extractFenced('~~~\nfoo\n```\n'), 'text').toBe('foo')
})

test('GIVEN an inline triple backtick in a body WHEN extracting THEN the block ends there (brewtools behaviour)', async () => {
  expect(extractFenced('```\nuse ```x``` inline\n```\n'), 'text').toBe('use')
})

test('GIVEN an unclosed fence WHEN extracting THEN no block forms and the whole text is trimmed', async () => {
  expect(extractFenced('```\nonly open\n'), 'text').toBe('```\nonly open')
})

test('GIVEN an empty or whitespace file WHEN extracting THEN the result is empty (suppress)', async () => {
  expect([extractFenced(''), extractFenced(' \n\t\n')], 'texts').toEqual(['', ''])
})

test('GIVEN a full front matter WHEN parsed THEN every field is typed and the body is the text', async () => {
  const raw = '---\nname: "x"\ndescription: \'It\'\'s fine\'\ninsert: inline\nwhen: not-plan\norder: 5\ngroup: g\npriority: 2\nheader: "A \\"q\\" \\u2014 {token}"\nlegacy: old # note\n---\nbody\n'

  expect(parseDefinition(raw), 'parsed').toEqual({
    meta: {
      name: 'x', description: "It's fine", insert: 'inline', when: 'not-plan', order: 5, group: 'g', priority: 2,
      header: 'A "q" — {token}', legacy: 'old',
    },
    text: 'body',
    hasFrontMatter: true,
    issues: [],
  })
})

test('GIVEN a bare symbolic name WHEN parsed THEN name is the punctuation run', async () => {
  expect(parseDefinition('---\nname: +\n---\nb').meta, 'meta').toEqual({ name: '+' })
})

test('GIVEN CRLF and a BOM around the front matter WHEN parsed THEN fields and body come out clean', async () => {
  const out = parseDefinition('﻿---\r\nname: m\r\norder: 20\r\n---\r\nline1\r\nline2\r\n')

  expect(out, 'parsed').toEqual({ meta: { name: 'm', order: 20 }, text: 'line1\r\nline2', hasFrontMatter: true, issues: [] })
})

test('GIVEN no front matter WHEN parsed THEN meta is empty and the whole file goes through extractFenced', async () => {
  expect(parseDefinition('```\nraw\n```\n'), 'parsed').toEqual({ meta: {}, text: 'raw', hasFrontMatter: false, issues: [] })
})

test('GIVEN an unterminated front matter WHEN parsed THEN it is plain text', async () => {
  expect(parseDefinition('---\nname: x\nbody'), 'parsed').toEqual({ meta: {}, text: '---\nname: x\nbody', hasFrontMatter: false, issues: [] })
})

test('GIVEN bad values and stray lines WHEN parsed THEN they become issues and the good fields survive', async () => {
  const out = parseFrontMatter('name: ok\nwhen: sometimes\ninsert: later\norder: 1.5\npriority: x\nwat: 1\nnot a pair\n# comment\n\n')

  expect(out, 'result').toEqual({
    meta: { name: 'ok' },
    issues: [
      "when: 'sometimes' is not always|plan|not-plan",
      "insert: 'later' is not context|inline",
      "order: '1.5' is not an integer",
      "priority: 'x' is not an integer",
      "unknown key 'wat'",
      'line 7: not a key: value pair',
    ],
  })
})

test('GIVEN an empty body after front matter WHEN parsed THEN the text is empty (suppress)', async () => {
  expect(parseDefinition('---\nname: m\n---\n').text, 'text').toBe('')
})

test('GIVEN a legacy override with leading dashes WHEN parsed THEN no front matter is read', async () => {
  expect(parseLegacy('---\nname: x\n---\nhello'), 'parsed').toEqual({ meta: {}, text: '---\nname: x\n---\nhello', hasFrontMatter: false, issues: [] })
})

test('GIVEN a partial meta and a base WHEN completed THEN fields inherit per field and the body is the new text', async () => {
  const base = { name: 'r', group: 'review', priority: 1, order: 40, header: 'H {token}', legacy: 'review-double', when: 'always' as const }

  expect(toDef({ meta: { order: 7 }, text: 'T', hasFrontMatter: false, issues: [] }, base), 'def').toEqual({
    name: 'r', body: 'T', insert: 'context', when: 'always', order: 7, priority: 1, header: 'H {token}', group: 'review', legacy: 'review-double',
  })
})

test('GIVEN neither a name nor a base WHEN completed THEN null; with only a name THEN built-in defaults apply', async () => {
  const bare = { meta: {}, text: 'T', hasFrontMatter: false, issues: [] }

  expect([toDef(bare), toDef({ ...bare, meta: { name: 'z' } })], 'defs').toEqual([
    null,
    { name: 'z', body: 'T', insert: 'context', when: 'always', order: 100, priority: 0, header: '' },
  ])
})

test('GIVEN the shipped m.plan.md WHEN parsed THEN it carries name m, when plan, legacy planmode and starts with the m body', async () => {
  const m = parseDefinition(PLACEHOLDER_FILES['m'] ?? '')
  const plan = parseDefinition(PLACEHOLDER_FILES['m.plan'] ?? '')

  expect([plan.meta.name, plan.meta.when, plan.meta.legacy, plan.issues, plan.text.startsWith(m.text + '\n\n')], 'm.plan facts').toEqual(
    ['m', 'plan', 'planmode', [], true],
  )
})

test('GIVEN every shipped definition WHEN parsed THEN there are no front-matter issues and no empty body', async () => {
  const rows = Object.entries(PLACEHOLDER_FILES).map(([k, raw]) => {
    const p = parseDefinition(raw)
    return [k, p.hasFrontMatter, p.issues.length, p.text.length > 0]
  })

  expect(rows, 'rows').toEqual([['+', true, 0, true], ['a', true, 0, true], ['m', true, 0, true], ['m.plan', true, 0, true], ['r', true, 0, true], ['rr', true, 0, true]])
})
