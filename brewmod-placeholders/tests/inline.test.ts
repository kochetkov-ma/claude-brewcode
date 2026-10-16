import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { compileDefs } from '../hooks/lib/compiled'
import { compileMatchers } from '../hooks/lib/match'
import { expandInline, inlineBodies, isInlineSubmit, unknownMessage, unknownTokens } from '../hooks/lib/inline'
import { CFG, ROOT, core, defaultsTree, memFs, spyWrites, typed, wire, type Tree } from './layer-io'
import { def } from './fixtures'

const file = (name: string, insert: string, when: string, body: string): string => `---\nname: "${name}"\ninsert: ${insert}\nwhen: ${when}\n---\n${body}`
const at = (name: string, raw: string): Tree => ({ [`${ROOT}/.claude/placeholders/${name}.md`]: raw })

const TREE: Tree = {
  ...defaultsTree(),
  ...at('ii', file('ii', 'inline', 'always', 'II BODY')),
  ...at('jj', file('jj', 'inline', 'always', 'JJ BODY ++ii')),
  ...at('jx', file('jx', 'inline', 'always', 'JX also ++cc')),
  ...at('pp', file('pp', 'inline', 'plan', 'PP BODY')),
  ...at('nn', file('nn', 'inline', 'not-plan', 'NN BODY')),
  ...at('ee', file('ee', 'inline', 'always', '')),
  ...at('cc', file('cc', 'context', 'always', 'CC CONTEXT')),
  ...at('dual', file('dual', 'inline', 'always', 'DUAL INLINE')),
  ...at('dual.ctx', file('dual', 'context', 'always', 'DUAL CONTEXT')),
}

type Seen = { text: string; origin: unknown; wait: boolean }
const bottomSubmit = (on: On): Seen[] => {
  const seen: Seen[] = []
  on('prompt.submit', (_$, e) => {
    seen.push({ text: e.text, origin: e.origin, wait: e.wait })
    return { text: e.text }
  })
  return seen
}
const submit = ($: { prompt: unknown }, text: string, origin: unknown = { kind: 'composer' }, extra: object = {}) =>
  ($.prompt as any).submit({ text, origin, wait: false, ...extra })
const EMPTY_VIEW = { tokens: [] }

// ---- origins

for (const kind of ['composer', 'bridge', 'sdk'] as const) {
  test(`GIVEN origin ${kind} and an inline token WHEN the prompt is submitted THEN the text below carries the body and the origin is kept`, async ($, on) => {
    wire(on, { tree: TREE })
    const seen = bottomSubmit(on)

    await submit($, 'say ++ii now', { kind })

    expect(seen, 'bottom saw').toEqual([{ text: 'say II BODY now', origin: { kind }, wait: false }])
  })
}

for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'peer-send-message', 'projects-relay', 'engine'] as const) {
  test(`GIVEN origin ${kind} WHEN a prompt with an inline token is submitted THEN the text is untouched and no file is read`, async ($, on) => {
    const w = wire(on, { tree: TREE })
    const seen = bottomSubmit(on)

    await submit($, 'say ++ii now', { kind })

    expect([seen, w.calls], 'bottom saw and fs calls').toEqual([[{ text: 'say ++ii now', origin: { kind }, wait: false }], { exists: [], list: [], read: [] }])
  })
}

test('GIVEN a plugin origin WHEN a prompt with an inline token is submitted THEN the text is untouched', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++ii', { kind: 'plugin', name: 'other' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['++ii'])
})

test('GIVEN a slash command WHEN it is submitted with an inline token in its arguments THEN the line is untouched', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '/review ++ii', { kind: 'composer' }, { command: { name: 'review', args: '++ii' } })

  expect(seen.map((s) => s.text), 'texts').toEqual(['/review ++ii'])
})

test('GIVEN an isMeta prompt from the composer WHEN submitted THEN the text is untouched', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++ii', { kind: 'composer' }, { isMeta: true })

  expect(seen.map((s) => s.text), 'texts').toEqual(['++ii'])
})

// ---- when: always, bodies, single pass

test('GIVEN inline defs for always, plan and not-plan WHEN a prompt with all three is submitted THEN only the always one is expanded', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++pp ++ii ++nn', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['++pp II BODY ++nn'])
})

test('GIVEN a body that holds another token WHEN expanded THEN the inserted text is never scanned again', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++jj and ++II', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['JJ BODY ++ii and II BODY'])
})

test('GIVEN an inline def with an empty body WHEN its token is submitted THEN the token stays verbatim', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, 'a ++ee b', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['a ++ee b'])
})

test('GIVEN a context token and an unknown token WHEN submitted THEN both stay verbatim', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++cc ++m ++nope', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['++cc ++m ++nope'])
})

test('GIVEN a prompt without the prefix WHEN submitted THEN no file is read and the text is untouched', async ($, on) => {
  const w = wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, 'plain text', { kind: 'composer' })

  expect([seen.map((s) => s.text), w.calls], 'texts and fs calls').toEqual([['plain text'], { exists: [], list: [], read: [] }])
})

test('GIVEN two submissions WHEN nothing changed on disk THEN the second reads no file again', async ($, on) => {
  const w = wire(on, { tree: TREE })
  bottomSubmit(on)
  await submit($, '++ii', { kind: 'composer' })
  const afterFirst = w.calls.read.length
  await submit($, '++ii again', { kind: 'composer' })

  expect([afterFirst > 0, w.calls.read.length], 'first read something, second nothing new').toEqual([true, afterFirst])
})

test('GIVEN a custom prefix WHEN a prompt with both prefixes is submitted THEN only that prefix expands', { options: { prefix: '@@' } }, async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++ii @@ii', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['++ii II BODY'])
})

// ---- fail open

for (const fail of ['exists', 'list', 'read', 'root'] as const) {
  test(`GIVEN ${fail} fails while the registry loads WHEN a prompt is submitted THEN it passes down untouched`, async ($, on) => {
    wire(on, { tree: TREE, fail })
    const seen = bottomSubmit(on)

    await submit($, 'say ++ii now', { kind: 'composer' })

    expect(seen.map((s) => s.text), 'texts').toEqual(['say ++ii now'])
  })
}

test('GIVEN the env lookup has no answer at all WHEN a prompt is submitted THEN it passes down untouched', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  const seen = bottomSubmit(on)

  await submit($, '++ii', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['++ii'])
})

// ---- view reset

test('GIVEN a composer submission WHEN it passes THEN the view atom is written empty once', async ($, on) => {
  wire(on, { tree: TREE })
  bottomSubmit(on)
  const writes = spyWrites(on)

  await submit($, 'plain', { kind: 'composer' })

  expect(writes, 'state writes').toEqual([EMPTY_VIEW])
})

for (const kind of ['bridge', 'sdk', 'task-notification', 'peer', 'scheduled-trigger'] as const) {
  test(`GIVEN origin ${kind} WHEN a prompt is submitted THEN the person's draft view is not touched`, async ($, on) => {
    wire(on, { tree: TREE })
    bottomSubmit(on)
    const writes = spyWrites(on)

    await submit($, 'plain', { kind })

    expect(writes, 'state writes').toEqual([])
  })
}

test('GIVEN a refused state write WHEN a composer prompt with an inline token is submitted THEN the expansion still lands', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)
  on('state.set', () => ({ deny: 'state down' }))

  await submit($, '++ii', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'texts').toEqual(['II BODY'])
})

test('GIVEN a token typed, submitted and typed again WHEN prompt.edit runs THEN the second draft is written again (view not stale)', async ($, on) => {
  wire(on, { tree: TREE })
  core(on)
  bottomSubmit(on)
  const writes = spyWrites(on)
  const m = { text: '++m', name: 'm', isKnown: true, start: 0, end: 3 }

  await typed($, '++m')
  await submit($, '++m', { kind: 'composer' })
  await typed($, '++m')

  expect(writes, 'state writes').toEqual([{ tokens: [m] }, EMPTY_VIEW, { tokens: [m] }])
})

// ---- no double insertion (the context half is the command hook's: tests/inject-parity.mjs)

test('GIVEN an inline token and a context token WHEN submitted THEN only the inline text is rewritten and the context token stays for the command hook', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++ii ++cc', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'submit text').toEqual(['II BODY ++cc'])
})

test('GIVEN a name defined both inline and as context WHEN submitted THEN the text stays so the token is inserted once, as context', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++dual', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'submit text').toEqual(['++dual'])
})

test('GIVEN an inline body that carries a context token WHEN submitted THEN the expanded text keeps the token for the command hook', async ($, on) => {
  wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, 'use ++jx now', { kind: 'composer' })

  expect(seen.map((s) => s.text), 'submit text').toEqual(['use JX also ++cc now'])
})

// ---- warnUnknown toast

test('GIVEN unknown tokens and the default option WHEN the prompt is submitted THEN one toast names them once each and the text is untouched', async ($, on) => {
  const w = wire(on, { tree: TREE })
  const seen = bottomSubmit(on)

  await submit($, '++m ++foo ++Foo ++bar')

  expect([w.toasts, seen.map((s) => s.text)], 'toasts and submit text').toEqual([['unknown ++foo, ++bar · sent as typed · names: /placeholders list'], ['++m ++foo ++Foo ++bar']])
})

test('GIVEN only known tokens or no prefix WHEN submitted THEN there is no toast', async ($, on) => {
  const w = wire(on, { tree: TREE })
  bottomSubmit(on)

  await submit($, '++m ++ii ++pp')
  await submit($, 'hello')

  expect(w.toasts, 'toasts').toEqual([])
})

test('GIVEN a toast the engine refuses WHEN unknown tokens are submitted THEN the text still goes on', async ($, on) => {
  const fs = memFs(defaultsTree())
  const fix = (p: string): string => p.replace(/^.*\/brewmod-placeholders\/placeholders/, '/PLUG/placeholders')
  on('fs.exists', (_$, e) => ({ value: fs.exists(fix(e.path)) }) as never)
  on('fs.list', (_$, e) => ({ value: fs.list(fix(e.path ?? '')) }) as never)
  on('fs.read', (_$, e) => ({ value: fs.read(fix(e.path)) }) as never)
  on('env.get', (_$, e) => ({ value: ({ HOME: '/home/u', CLAUDE_CONFIG_DIR: CFG } as Record<string, string>)[e.name] }) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('ui.toast', () => ({ deny: 'ui down' }) as never)
  const seen = bottomSubmit(on)

  await submit($, '++m ++foo')

  expect(seen.map((s) => s.text), 'submit text').toEqual(['++m ++foo'])
})

for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'auto-continuation'] as const) {
  test(`GIVEN origin ${kind} WHEN a prompt with an unknown token is submitted THEN there is no toast`, async ($, on) => {
    const w = wire(on, { tree: TREE })
    bottomSubmit(on)

    await submit($, '++m ++foo', { kind })

    expect(w.toasts, 'toasts').toEqual([])
  })
}

for (const kind of ['composer', 'bridge', 'sdk'] as const) {
  test(`GIVEN origin ${kind} WHEN a prompt with an unknown token is submitted THEN one toast names it`, async ($, on) => {
    const w = wire(on, { tree: TREE })
    bottomSubmit(on)

    await submit($, '++foo', { kind })

    expect(w.toasts, 'toasts').toEqual(['unknown ++foo · sent as typed · names: /placeholders list'])
  })
}

test('GIVEN a slash command prompt WHEN it is submitted with an unknown token THEN there is no toast', async ($, on) => {
  const w = wire(on, { tree: TREE })
  bottomSubmit(on)

  await submit($, '/x ++foo', { kind: 'composer' }, { command: { name: 'x', args: '++foo' } })

  expect(w.toasts, 'toasts').toEqual([])
})

test('GIVEN a code-like prompt WHEN it is submitted THEN no toast names ++i, ++count or a token in code', async ($, on) => {
  const w = wire(on, { tree: TREE })
  bottomSubmit(on)

  await submit($, 'fix for (i = 0; i < n; ++i) and a[++j] and ++k; then `++tick` and\n```\n++blk\n```\nplus ++typo')

  expect(w.toasts, 'toasts').toEqual(['unknown ++typo · sent as typed · names: /placeholders list'])
})

test('GIVEN a custom prefix WHEN a prompt holds unknown tokens of both prefixes THEN only the custom ones are named', { options: { prefix: '@@' } }, async ($, on) => {
  const w = wire(on, { tree: TREE })
  bottomSubmit(on)

  await submit($, '@@zz ++yy')

  expect(w.toasts, 'toasts').toEqual(['unknown @@zz · sent as typed · names: /placeholders list'])
})

test('GIVEN an unknown token inside an inline body WHEN the prompt is submitted THEN the toast reads the expanded text', async ($, on) => {
  const w = wire(on, { tree: { ...TREE, ...at('bb', file('bb', 'inline', 'always', 'BB ++nope')) } })
  bottomSubmit(on)

  await submit($, 'x ++bb')

  expect(w.toasts, 'toasts').toEqual(['unknown ++nope · sent as typed · names: /placeholders list'])
})

// ---- pure helpers

test('GIVEN eight unknown tokens WHEN the message is built THEN five are named and the rest counted', async () => {
  const ms = compileMatchers('++', ['m'])
  const names = unknownTokens(ms, '++a ++b ++c ++d ++e ++f ++g ++h ++A')

  expect([names.length, unknownMessage(names)], 'count and message').toEqual([8, 'unknown ++a, ++b, ++c, ++d, ++e and 3 more · sent as typed · names: /placeholders list'])
})

test('GIVEN known and unknown tokens and a word glued to the prefix WHEN scanned THEN only standalone unknown ones are listed', async () => {
  const ms = compileMatchers('++', ['m'])

  expect(unknownTokens(ms, 'i++x ++m ++q a+++b'), 'unknown').toEqual(['++q'])
})

test('GIVEN fences, backticks, closers and an unclosed backtick WHEN scanned THEN only a standalone token outside code is unknown', async () => {
  const ms = compileMatchers('++', ['m'])
  const text = '~~~\n++a\n~~~ `++b` ++c) ++d] ++e[0] ++f; ++g, `++h ++i'

  expect(unknownTokens(ms, text), 'unknown').toEqual(['++g', '++h', '++i'])
})

test('GIVEN defs with every insert and when combination WHEN the inline bodies are built THEN only an inline always def of a context-free name remains', async () => {
  const defs = [
    def({ name: 'A', insert: 'inline', when: 'always', body: 'a' }),
    def({ name: 'a', insert: 'inline', when: 'always', body: 'second' }),
    def({ name: 'b', insert: 'inline', when: 'plan', body: 'b' }),
    def({ name: 'c', insert: 'inline', when: 'not-plan', body: 'c' }),
    def({ name: 'd', insert: 'inline', when: 'always', body: '' }),
    def({ name: 'e', insert: 'context', when: 'always', body: 'e' }),
    def({ name: 'f', insert: 'inline', when: 'always', body: 'f-inline' }),
    def({ name: 'f', insert: 'context', when: 'plan', body: 'f-context' }),
  ]

  expect([...inlineBodies(defs)], 'bodies').toEqual([['a', 'a']])
})

test('GIVEN a symbol-named inline def, overlapping words and adjacent tokens WHEN expanded THEN one pass replaces each token once', async () => {
  const c = compileDefs([def({ name: '@', insert: 'inline', body: 'AT' }), def({ name: 'r', insert: 'inline', body: 'R' }), def({ name: 'rr', insert: 'inline', body: 'RR' })])

  expect(expandInline(c, '++@ ++rr ++r,++@!'), 'expanded').toBe('AT RR R,AT!')
})

test('GIVEN no eligible token WHEN expanded THEN the helper answers null', async () => {
  const c = compileDefs([def({ name: 'r', insert: 'inline', when: 'plan', body: 'R' })])

  expect([expandInline(c, '++r'), expandInline(c, 'no prefix'), expandInline(compileDefs([]), '++r')], 'results').toEqual([null, null, null])
})

test('GIVEN a dollar sign in a body WHEN expanded THEN it is inserted literally', async () => {
  const c = compileDefs([def({ name: 'p', insert: 'inline', body: "cost $& $1 $'" })])

  expect(expandInline(c, 'x ++p'), 'expanded').toBe("x cost $& $1 $'")
})

test('GIVEN every origin kind WHEN checked THEN only composer, bridge and sdk without command or isMeta qualify', async () => {
  const kinds = ['composer', 'bridge', 'sdk', 'task-notification', 'peer', 'plugin', 'engine']

  expect(kinds.map((kind) => isInlineSubmit({ origin: { kind } })), 'qualifying kinds').toEqual([true, true, true, false, false, false, false])
  expect([isInlineSubmit({ origin: { kind: 'composer' }, command: { name: 'x', args: '' } }), isInlineSubmit({ origin: { kind: 'composer' }, isMeta: true })], 'blocked').toEqual([false, false])
})
