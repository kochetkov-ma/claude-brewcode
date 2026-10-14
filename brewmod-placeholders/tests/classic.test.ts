import { test, expect } from 'claude-code/testing'
import { BREWTOOLS_SPLIT, JOINER } from '../hooks/lib/assemble'
import { VECTORS } from './parity/golden.generated'
import { CFG, ROOT, defaultsTree, vectorTree, wire, type Tree } from './layer-io'

const vec = (id: string): string => {
  const v = VECTORS.find((x) => x.id === id)
  return v?.expected ?? `MISSING ${id}`
}
const M = vec('spec-1')
const A = vec('spec-3')
const R = vec('spec-4')
const RR = vec('spec-5')
const AT_M = vec('p01-m')
const AT_A_RR = vec('p03-a-rr')
const SENTINEL = '\nBREWTOOLS-SENTINEL'

// Brewtools' real output with a marker on every block: a no-op mod would leave the markers in.
const marked = (expected: string): string => expected.split(BREWTOOLS_SPLIT).map((b) => b + SENTINEL).join(JOINER)
const send = ($: { classic: { UserPromptSubmit: (e: never) => Promise<unknown> } }, prompt: string, mode?: string) =>
  $.classic.UserPromptSubmit({ prompt, permission_mode: mode } as never)

const GROUPS_WITH_BREWTOOLS = VECTORS.filter((v) => v.prefix === '++')

for (const v of GROUPS_WITH_BREWTOOLS) {
  test(`GIVEN vector ${v.id} and brewtools' marked output below WHEN the mod runs THEN additionalContext is the golden string exactly once`, async ($, on) => {
    const bottom = v.expected === null ? {} : { additionalContext: [marked(v.expected)] }
    wire(on, { tree: vectorTree(v), bottom })

    const out = await send($, v.prompt, v.mode ?? undefined)

    expect(out, `${v.id}: result`).toEqual(v.expected === null ? {} : { additionalContext: [v.expected] })
  })

  test(`GIVEN vector ${v.id} and no brewtools WHEN the mod runs THEN it injects the golden string once`, async ($, on) => {
    wire(on, { tree: vectorTree(v), bottom: {} })

    const out = await send($, v.prompt, v.mode ?? undefined)

    expect(out, `${v.id}: result`).toEqual(v.expected === null ? {} : { additionalContext: [v.expected] })
  })
}

const MULTI: { prompt: string; blocks: string[] }[] = [
  { prompt: '++a ++r', blocks: [A, R] },
  { prompt: '++m ++rr', blocks: [M, RR] },
  { prompt: '++r ++rr ++a ++m', blocks: [M, A, RR] },
]

for (const row of MULTI) {
  test(`GIVEN brewtools' blocks for ${row.prompt} WHEN the mod runs THEN one block per token remains, in brewtools' order`, async ($, on) => {
    const bottom = { additionalContext: [row.blocks.map((b) => marked(b)).join(JOINER)] }
    wire(on, { tree: defaultsTree(), bottom })

    const out = await send($, row.prompt, 'default')

    expect(out, 'result').toEqual({ additionalContext: [row.blocks.join(JOINER)] })
  })
}

test('GIVEN foreign entries around brewtools WHEN the mod runs THEN they stay in place and the block is replaced once', async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: { additionalContext: ['F1', marked(M), 'F2'] } })

  expect(await send($, '++m', 'default'), 'result').toEqual({ additionalContext: ['F1', M, 'F2'] })
})

test('GIVEN only foreign entries WHEN the mod runs THEN its text is appended once after them', async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: { additionalContext: ['F1'] } })

  expect(await send($, '++m', 'default'), 'result').toEqual({ additionalContext: ['F1', M] })
})

test('GIVEN a result with other keys and no context WHEN the mod runs THEN the keys stay and the context is added', async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: { sessionTitle: 'T' } })

  expect(await send($, '++m', 'default'), 'result').toEqual({ sessionTitle: 'T', additionalContext: [M] })
})

test('GIVEN prefix @@ and a mixed prompt WHEN brewtools answers its ++ token THEN each token appears exactly once', { options: { prefix: '@@' } }, async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: { additionalContext: [marked(A)] } })

  expect(await send($, '@@m ++a', 'default'), 'result').toEqual({ additionalContext: [marked(A), AT_M] })
})

test('GIVEN prefix @@ and the same name under both prefixes WHEN both run THEN brewtools keeps ++m and the mod adds @@m', { options: { prefix: '@@' } }, async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: { additionalContext: [M] } })

  expect(await send($, '@@m ++m', 'default'), 'result').toEqual({ additionalContext: [M, AT_M] })
})

test('GIVEN prefix @@ and two mod tokens beside a brewtools one WHEN run THEN the mod text is one entry after brewtools', { options: { prefix: '@@' } }, async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: { additionalContext: [R] } })

  expect(await send($, '@@a @@rr ++r', 'default'), 'result').toEqual({ additionalContext: [R, AT_A_RR] })
})

test('GIVEN prefix @@ and a ++ only prompt WHEN run THEN brewtools stays untouched and no file is touched', { options: { prefix: '@@' } }, async ($, on) => {
  const w = wire(on, { tree: defaultsTree(), bottom: { additionalContext: [M] } })

  expect([await send($, '++m', 'default'), w.calls], 'result and fs calls').toEqual([{ additionalContext: [M] }, { exists: [], list: [], read: [] }])
})

for (const fail of ['exists', 'list', 'read', 'root'] as const) {
  test(`GIVEN ${fail} fails while the registry loads WHEN the mod runs THEN brewtools' answer and foreign entries stay untouched`, async ($, on) => {
    const bottom = { additionalContext: ['F1', marked(M), 'F2'] }
    wire(on, { tree: defaultsTree(), bottom, fail })

    expect(await send($, '++m', 'default'), 'result').toEqual(bottom)
  })
}

test('GIVEN the env lookup has no answer at all WHEN the mod runs THEN brewtools stays untouched', async ($, on) => {
  const bottom = { additionalContext: [marked(M)] }
  on('classic.UserPromptSubmit', () => bottom)
  on('session.root', () => ({ value: ROOT }))

  expect(await send($, '++m', 'default'), 'result').toEqual(bottom)
})

test('GIVEN the mod suppresses ++a but brewtools emits it WHEN ++m ++a runs THEN ++m is the mod and ++a stays brewtools', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/a.md`]: '' }
  wire(on, { tree, bottom: { additionalContext: [[marked(M), marked(A)].join(JOINER)] } })

  expect(await send($, '++m ++a', 'default'), 'result').toEqual({ additionalContext: [[M, marked(A)].join(JOINER)] })
})

test('GIVEN a prompt without the prefix or a synthetic delivery WHEN the mod runs THEN it touches no file and the result is untouched', async ($, on) => {
  const w = wire(on, { tree: defaultsTree(), bottom: { additionalContext: ['F1'] } })

  expect(
    [await send($, 'hello world', 'default'), await send($, '<task-notification>++m', 'default'), w.calls],
    'results and fs calls',
  ).toEqual([{ additionalContext: ['F1'] }, { additionalContext: ['F1'] }, { exists: [], list: [], read: [] }])
})

test('GIVEN two prompts in a row WHEN nothing changed on disk THEN the second one reads no file again', async ($, on) => {
  const w = wire(on, { tree: defaultsTree(), bottom: {} })
  await send($, '++m', 'default')
  const afterFirst = w.calls.read.length
  await send($, '++a', 'default')

  expect([afterFirst, w.calls.read.length], 'reads after first and second').toEqual([6, 6])
})

test('GIVEN a user-defined placeholder in the project layer WHEN its prompt runs THEN it is expanded and typeahead offers it', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/foo.md`]: '---\ndescription: "Foo thing"\n---\nFOO TEXT' }
  wire(on, { tree, bottom: {} })

  on('prompt.autocomplete', () => ({ suggestions: [] }))

  const out = await send($, 'use ++foo now', 'default')
  const rows = await ($.prompt as any).autocomplete({ text: '++f', cursor: 3, token: '++f', start: 0 })

  expect([out, rows], 'expansion and typeahead').toEqual([
    { additionalContext: ['FOO TEXT'] },
    { suggestions: [{ text: '++foo ', label: '++foo', description: 'Foo thing' }] },
  ])
})

test('GIVEN a global-scope legacy override WHEN CLAUDE_CONFIG_DIR points at it THEN the mod expands the override', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${CFG}/manager/prompts/architect.md`]: '```\nGLOBAL A\n```' }
  wire(on, { tree, bottom: {} })

  const out = await send($, '++a', 'default')

  expect(out, 'result').toEqual({ additionalContext: [A.replace(/\n\n[\s\S]*$/, '\n\nGLOBAL A')] })
})

test('GIVEN CLAUDE_CONFIG_DIR unset WHEN a prompt runs THEN the global layer is read under HOME/.claude', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), ['/home/u/.claude/manager/prompts/architect.md']: 'HOME A' }
  wire(on, { tree, env: { HOME: '/home/u' }, bottom: {} })

  const out = await send($, '++a', 'default')

  expect(out, 'result').toEqual({ additionalContext: [A.replace(/\n\n[\s\S]*$/, '\n\nHOME A')] })
})

test('GIVEN PostToolBatch and a prompt in plan mode WHEN the hooks run THEN results pass through untouched', async ($, on) => {
  wire(on, { tree: defaultsTree(), bottom: {} })

  expect([await $.classic.PostToolBatch({ tool_calls: [], permission_mode: 'plan' } as never), await send($, 'plain', 'plan')], 'results').toEqual([{}, {}])
})

test('GIVEN an invalid prefix WHEN the session starts THEN a toast warns and ++ still expands', { options: { prefix: 'ab' } }, async ($, on) => {
  const w = wire(on, { tree: defaultsTree(), bottom: {} })
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const out = await send($, '++m', 'default')

  expect([w.toasts, out], 'toasts and result').toEqual([
    ['placeholders: prefix must be 2-8 ASCII punctuation characters (not _), using ++'],
    { additionalContext: [M] },
  ])
})

test('GIVEN a broken definition file WHEN the session starts THEN one toast names the first issue', async ($, on) => {
  const tree: Tree = { ...defaultsTree(), [`${ROOT}/.claude/placeholders/a.md`]: '---\nwat: 1\n---\nA2' }
  const w = wire(on, { tree, bottom: {} })
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  expect(w.toasts, 'toasts').toEqual(["placeholders: 1 definition issue(s), first: project/a.md: unknown key 'wat'"])
})

test('GIVEN a valid setup WHEN the session starts THEN there is no toast and the registry is already read', async ($, on) => {
  const w = wire(on, { tree: defaultsTree(), bottom: {} })
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  expect([w.toasts, w.calls.read.length], 'toasts and reads').toEqual([[], 6])
})
