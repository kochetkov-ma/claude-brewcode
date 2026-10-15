import { test, expect } from 'claude-code/testing'
import { PLACEHOLDER_FILES } from './parity/golden.generated'
import { extractFenced, parseDefinition, parseFrontMatter, parseLegacy, resolveDefs, toDef, toEditorEntries, type LayerFiles, type LayerKind } from '../hooks/lib/defs'

const layer = (id: string, kind: LayerKind, files: Record<string, string>): LayerFiles => ({ id, kind, files: new Map(Object.entries(files)) })

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

test('GIVEN an unterminated front matter WHEN parsed THEN nothing is taken as a body and the file is flagged skipped', async () => {
  expect(parseDefinition('---\nname: x\nbody'), 'parsed').toEqual({ meta: {}, text: '', hasFrontMatter: true, issues: ['front matter is not closed'], skip: true })
})

test('GIVEN a lone opening dash line or blank lines before the opening line WHEN parsed THEN the first is unclosed, the second is front matter', async () => {
  expect([parseDefinition('---').skip, parseDefinition('\n \n---\nname: x\n---\nb')], 'parsed').toEqual([
    true,
    { meta: { name: 'x' }, text: 'b', hasFrontMatter: true, issues: [] },
  ])
})

test('GIVEN a body whose first line is not a dash line WHEN parsed THEN a later dash line is plain text', async () => {
  expect(parseDefinition('intro\n---\nname: x\n---\nb'), 'parsed').toEqual({ meta: {}, text: 'intro\n---\nname: x\n---\nb', hasFrontMatter: false, issues: [] })
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

test('GIVEN the shipped m.plan.md WHEN parsed THEN it is the plan add part of m: own header, legacy planmode, only the addon text', async () => {
  const plan = parseDefinition(PLACEHOLDER_FILES['m.plan'] ?? '')

  expect({ meta: plan.meta, issues: plan.issues, head: plan.text.slice(0, 18) }, 'm.plan facts').toEqual({
    meta: {
      name: 'm',
      description: 'Manager mode in Plan mode: the manager text plus the plan addon',
      insert: 'context',
      when: 'plan',
      plan: 'add',
      order: 20,
      header: 'User typed `{token}` — Manager + Plan Mode is active for this turn:',
      legacy: 'planmode',
    },
    issues: [],
    head: '[ADDON: PLAN MODE]',
  })
})

test('GIVEN plan values add, replace, quoted and unknown WHEN the front matter is parsed THEN add and replace are kept and the rest is an issue', async () => {
  expect(['plan: add', 'plan: replace', 'plan: "add"', 'plan: later', 'plan:'].map(parseFrontMatter), 'parsed').toEqual([
    { meta: { plan: 'add' }, issues: [] },
    { meta: { plan: 'replace' }, issues: [] },
    { meta: { plan: 'add' }, issues: [] },
    { meta: {}, issues: ["plan: 'later' is not add|replace"] },
    { meta: {}, issues: ["plan: '' is not add|replace"] },
  ])
})

test('GIVEN a base def with plan add WHEN an override without the key is completed THEN every field but plan is inherited', async () => {
  const base = { name: 'm', when: 'plan' as const, order: 20, header: 'H', legacy: 'planmode', plan: 'add' as const }

  expect([toDef(parseDefinition('OLD FULL TEXT'), base), toDef(parseLegacy('LEGACY'), base), toDef(parseDefinition('---\nplan: add\n---\nNEW'), base)], 'defs').toEqual([
    { name: 'm', body: 'OLD FULL TEXT', insert: 'context', when: 'plan', order: 20, priority: 0, header: 'H', legacy: 'planmode' },
    { name: 'm', body: 'LEGACY', insert: 'context', when: 'plan', order: 20, priority: 0, header: 'H', legacy: 'planmode' },
    { name: 'm', body: 'NEW', insert: 'context', when: 'plan', order: 20, priority: 0, header: 'H', legacy: 'planmode', plan: 'add' },
  ])
})

test('GIVEN a plan add part overridden by a legacy file in one stack and by a native file without the key in another WHEN layers resolve THEN both overrides replace, a new add part keeps add and the misplaced key is an issue', async () => {
  const defaults = layer('default', 'native', { m: '---\nname: m\nlegacy: full\n---\nM', 'm.plan': '---\nname: m\nwhen: plan\nplan: add\nlegacy: planmode\n---\nADD', x: '---\nplan: add\n---\nX' })
  const legacy = resolveDefs([defaults, layer('global-legacy', 'legacy', { planmode: 'PM' }), layer('project', 'native', { 'db.plan': '---\nplan: add\n---\nDB ADD' })])
  const native = resolveDefs([defaults, layer('project', 'native', { 'm.plan': '---\nheader: "N {token}"\n---\nNATIVE' })])
  const m = { name: 'm', body: 'M', insert: 'context', when: 'always', order: 100, priority: 0, header: '', legacy: 'full' }
  const x = { name: 'x', body: 'X', insert: 'context', when: 'always', order: 100, priority: 0, header: '', plan: 'add' }
  const issues = ['default/x.md: plan: add needs when: plan; sent as a normal text']

  expect({ legacy: { defs: legacy.defs, issues: legacy.issues }, native: { defs: native.defs, issues: native.issues } }, 'resolved').toStrictEqual({
    legacy: {
      defs: [m, { name: 'm', body: 'PM', insert: 'context', when: 'plan', order: 100, priority: 0, header: '', legacy: 'planmode' }, x, { name: 'db', body: 'DB ADD', insert: 'context', when: 'plan', order: 100, priority: 0, header: '', plan: 'add' }],
      issues,
    },
    native: { defs: [m, { name: 'm', body: 'NATIVE', insert: 'context', when: 'plan', order: 100, priority: 0, header: 'N {token}', legacy: 'planmode' }, x], issues },
  })
})

test('GIVEN every shipped definition WHEN parsed THEN there are no front-matter issues and no empty body', async () => {
  const rows = Object.entries(PLACEHOLDER_FILES).map(([k, raw]) => {
    const p = parseDefinition(raw)
    return [k, p.hasFrontMatter, p.issues.length, p.text.length > 0]
  })

  expect(rows, 'rows').toEqual([['+', true, 0, true], ['a', true, 0, true], ['m', true, 0, true], ['m.plan', true, 0, true], ['r', true, 0, true], ['rr', true, 0, true]])
})

test('GIVEN a meta that sets every field and a base with other values WHEN completed THEN the meta wins field by field', async () => {
  const base = { name: 'b', insert: 'inline' as const, when: 'plan' as const, order: 1, group: 'bg', priority: 1, header: 'bh', legacy: 'bl', description: 'bd' }
  const meta = { name: 'n', insert: 'context' as const, when: 'not-plan' as const, order: -5, group: 'mg', priority: -2, header: 'mh', legacy: 'ml', description: 'md' }

  expect(toDef({ meta, text: 'T', hasFrontMatter: true, issues: [] }, base), 'def').toEqual({
    name: 'n', body: 'T', insert: 'context', when: 'not-plan', order: -5, group: 'mg', priority: -2, header: 'mh', legacy: 'ml', description: 'md',
  })
})

test('GIVEN a meta with a name only and a full base WHEN completed THEN every other field is inherited, insert and description included', async () => {
  const base = { insert: 'inline' as const, when: 'plan' as const, order: 1, group: 'bg', priority: 1, header: 'bh', legacy: 'bl', description: 'bd' }

  expect(toDef({ meta: { name: 'n' }, text: 'T', hasFrontMatter: true, issues: [] }, base), 'def').toEqual({
    name: 'n', body: 'T', insert: 'inline', when: 'plan', order: 1, group: 'bg', priority: 1, header: 'bh', legacy: 'bl', description: 'bd',
  })
})

test('GIVEN negative, signed and zero integers WHEN parsed THEN a leading minus and zero pass while a plus sign is an issue', async () => {
  expect(parseFrontMatter('order: -5\npriority: 0\nname: x'), 'negative').toEqual({ meta: { order: -5, priority: 0, name: 'x' }, issues: [] })
  expect(parseFrontMatter('order: +5').issues, 'plus').toEqual(["order: '+5' is not an integer"])
})

test('GIVEN a plan part in the global layer, its normal text in the project and a plan-only name WHEN editor entries are built THEN the normal def names the entry and only the plan-only name is plan only', async () => {
  const { defs } = resolveDefs([layer('global', 'native', { 'db.plan': '---\nplan: add\n---\nDB ADD', 'po.plan': 'PO' }), layer('project', 'native', { db: '---\ndescription: "Db"\n---\nDB' })])

  expect(toEditorEntries(defs), 'entries').toEqual([
    { name: 'db', body: 'DB', planOnly: false, description: 'Db' },
    { name: 'po', body: 'PO', planOnly: true },
  ])
})
