import { test, expect } from 'claude-code/testing'
import { assemble, compileDefs } from '../hooks/lib/assemble'
import { configDirOf, layerSpecs, loadRegistry, newRegistryCache, normalizeDir, toEditorEntries, type Def, type Roots } from '../hooks/lib/defs'
import { defaultDefs } from './fixtures'
import { CFG, PLUG, ROOT, defaultsTree, memIo, type Tree } from './layer-io'

const ROOTS: Roots = { pluginRoot: PLUG, root: ROOT, configDir: CFG }
const P_NATIVE = `${ROOT}/.claude/placeholders`
const P_LEGACY = `${ROOT}/.claude/brewtools/manager/prompts`
const G_NATIVE = `${CFG}/placeholders`
const G_LEGACY = `${CFG}/manager/prompts`

const load = (extra: Tree) => loadRegistry(memIo({ ...defaultsTree(), ...extra }).io, ROOTS, newRegistryCache())
const find = (defs: readonly Def[], name: string, when: string): Def | undefined => defs.find((d) => d.name === name && d.when === when)
const withBody = <T extends { body: string }>(d: T | undefined, body: string) => ({ ...d, body })

test('GIVEN only the shipped defaults WHEN the registry loads THEN it equals the parsed defaults and every source is default', async () => {
  const reg = await load({})

  expect([reg.defs, reg.issues, [...reg.sources]], 'registry').toEqual([
    defaultDefs(),
    [],
    [['+', 'default'], ['a', 'default'], ['m', 'default'], ['m.plan', 'default'], ['r', 'default'], ['rr', 'default']],
  ])
})

const PRECEDENCE: { title: string; tree: Tree; body: string; source: string }[] = [
  { title: 'global legacy alone', tree: { [`${G_LEGACY}/architect.md`]: 'GL' }, body: 'GL', source: 'global-legacy' },
  { title: 'global native alone', tree: { [`${G_NATIVE}/a.md`]: 'GN' }, body: 'GN', source: 'global' },
  { title: 'global native over global legacy', tree: { [`${G_LEGACY}/architect.md`]: 'GL', [`${G_NATIVE}/a.md`]: 'GN' }, body: 'GN', source: 'global' },
  { title: 'project legacy over global native', tree: { [`${G_NATIVE}/a.md`]: 'GN', [`${P_LEGACY}/architect.md`]: 'PL' }, body: 'PL', source: 'project-legacy' },
  { title: 'project native over project legacy', tree: { [`${P_LEGACY}/architect.md`]: 'PL', [`${P_NATIVE}/a.md`]: 'PN' }, body: 'PN', source: 'project' },
  { title: 'project native over global native', tree: { [`${G_NATIVE}/a.md`]: 'GN', [`${P_NATIVE}/a.md`]: 'PN' }, body: 'PN', source: 'project' },
  { title: 'project legacy over global legacy', tree: { [`${G_LEGACY}/architect.md`]: 'GL', [`${P_LEGACY}/architect.md`]: 'PL' }, body: 'PL', source: 'project-legacy' },
  { title: 'project legacy over everything below', tree: { [`${G_LEGACY}/architect.md`]: 'GL', [`${G_NATIVE}/a.md`]: 'GN', [`${P_LEGACY}/architect.md`]: 'PL' }, body: 'PL', source: 'project-legacy' },
]

for (const row of PRECEDENCE) {
  test(`GIVEN ${row.title} WHEN the registry loads THEN the winner's body is ${row.body} and the other fields stay the default's`, async () => {
    const reg = await load(row.tree)

    expect([find(reg.defs, 'a', 'always'), reg.sources.get('a')], 'def a and its source layer').toEqual([
      withBody(find(defaultDefs(), 'a', 'always'), row.body),
      row.source,
    ])
  })
}

const EMPTY: { title: string; tree: Tree; source: string }[] = [
  { title: 'an empty project native file over a project legacy text', tree: { [`${P_LEGACY}/architect.md`]: 'PL', [`${P_NATIVE}/a.md`]: '' }, source: 'project' },
  { title: 'an empty project legacy file over a global native text', tree: { [`${G_NATIVE}/a.md`]: 'GN', [`${P_LEGACY}/architect.md`]: '' }, source: 'project-legacy' },
  { title: 'an empty global legacy file alone', tree: { [`${G_LEGACY}/architect.md`]: '' }, source: 'global-legacy' },
  { title: 'a whitespace-only project legacy file', tree: { [`${P_LEGACY}/architect.md`]: ' \n\t\n' }, source: 'project-legacy' },
]

for (const row of EMPTY) {
  test(`GIVEN ${row.title} WHEN the registry loads and ++a is typed THEN the empty body wins and nothing is emitted`, async () => {
    const reg = await load(row.tree)

    expect(
      [find(reg.defs, 'a', 'always')?.body, reg.sources.get('a'), assemble(compileDefs(reg.defs), '++a', 'default')],
      'body, source layer, assembled output',
    ).toEqual(['', row.source, null])
  })
}

test('GIVEN a full override and a planmode override WHEN ++m is typed in both modes THEN each variant changes only its own mode', async () => {
  const plain = await load({})
  const full = await load({ [`${P_LEGACY}/full.md`]: 'FULL-OVR' })
  const plan = await load({ [`${P_LEGACY}/planmode.md`]: 'PLAN-OVR' })
  const out = (reg: { defs: readonly Def[] }, mode: string) => assemble(compileDefs(reg.defs), '++m', mode)
  const head = (mode: string) => out(plain, mode)?.split('\n\n')[0]

  expect(
    [out(full, 'default'), out(full, 'plan') === out(plain, 'plan'), out(plan, 'plan'), out(plan, 'default') === out(plain, 'default')],
    'outputs per override and mode',
  ).toEqual([`${head('default')}\n\nFULL-OVR`, true, `${head('plan')}\n\nPLAN-OVR`, true])
})

test('GIVEN a native file without front matter WHEN it overrides r THEN group, priority, order, header and legacy are inherited', async () => {
  const reg = await load({ [`${P_NATIVE}/r.md`]: 'MINE' })

  expect(find(reg.defs, 'r', 'always'), 'def r').toEqual(withBody(find(defaultDefs(), 'r', 'always'), 'MINE'))
})

test('GIVEN a native file with partial front matter WHEN it overrides r THEN only the named fields change', async () => {
  const reg = await load({ [`${P_NATIVE}/r.md`]: '---\norder: 7\nheader: "H {token}"\n---\nMINE' })

  expect(find(reg.defs, 'r', 'always'), 'def r').toEqual({ ...withBody(find(defaultDefs(), 'r', 'always'), 'MINE'), order: 7, header: 'H {token}' })
})

test('GIVEN new native files without defaults WHEN loaded THEN the stem names them and .plan marks the plan variant', async () => {
  const reg = await load({ [`${P_NATIVE}/foo.md`]: 'F', [`${G_NATIVE}/foo.plan.md`]: 'FP' })

  expect(
    reg.defs.filter((d) => d.name === 'foo'),
    'foo variants',
  ).toEqual([
    { name: 'foo', body: 'FP', insert: 'context', when: 'plan', order: 100, priority: 0, header: '' },
    { name: 'foo', body: 'F', insert: 'context', when: 'always', order: 100, priority: 0, header: '' },
  ])
})

test('GIVEN a foo plan variant and a foo always def WHEN ++foo is typed THEN the plan variant wins only in plan mode', async () => {
  const reg = await load({ [`${P_NATIVE}/foo.md`]: 'F', [`${P_NATIVE}/foo.plan.md`]: 'FP' })
  const c = compileDefs(reg.defs)

  expect([assemble(c, '++foo', 'plan'), assemble(c, '++foo', 'default')], 'outputs').toEqual(['FP', 'F'])
})

test('GIVEN a legacy file with an unknown name and a directory entry WHEN loaded THEN they are never read', async () => {
  const { io, calls } = memIo({
    ...defaultsTree(),
    [`${P_LEGACY}/random.md`]: 'X',
    [`${P_NATIVE}/sub/x.md`]: 'X',
    [`${P_NATIVE}/.hidden.md`]: 'X',
    [`${P_NATIVE}/notes.txt`]: 'X',
    [`${P_NATIVE}/dir.md/y.md`]: 'X',
  })
  const reg = await loadRegistry(io, ROOTS, newRegistryCache())

  expect([calls.read.filter((p) => p.startsWith(ROOT)), reg.defs.length], 'project reads, def count').toEqual([[], 6])
})

test('GIVEN a bad front matter and an empty explicit name WHEN loaded THEN issues name the layer and file and the good fields survive', async () => {
  const reg = await load({
    [`${P_NATIVE}/a.md`]: '---\nwhen: sometimes\nwat: 1\n---\nA2',
    [`${G_NATIVE}/z.md`]: '---\nname: ""\n---\nZ',
  })

  expect([reg.issues, find(reg.defs, 'a', 'always')?.body], 'issues and a body').toEqual([
    [
      'global/z.md: no name',
      "project/a.md: when: 'sometimes' is not always|plan|not-plan",
      "project/a.md: unknown key 'wat'",
    ],
    'A2',
  ])
})

test('GIVEN an unchanged listing WHEN the registry loads again THEN nothing is re-read and the same registry object returns', async () => {
  const { io, calls } = memIo(defaultsTree())
  const cache = newRegistryCache()
  const first = await loadRegistry(io, ROOTS, cache)
  const readsAfterFirst = calls.read.length
  const second = await loadRegistry(io, ROOTS, cache)

  expect([readsAfterFirst, calls.read.length, second === first], 'reads after first, reads after second, same object').toEqual([6, 6, true])
})

test('GIVEN one file whose mtime moves WHEN the registry loads again THEN only that file is re-read and the new text shows', async () => {
  const tree: Tree = { ...defaultsTree(), [`${P_NATIVE}/a.md`]: { raw: 'V1', mtimeMs: 5 } }
  const { io, calls } = memIo(tree)
  const cache = newRegistryCache()
  const first = await loadRegistry(io, ROOTS, cache)
  calls.read.length = 0
  tree[`${P_NATIVE}/a.md`] = { raw: 'V2', mtimeMs: 6 }
  const second = await loadRegistry(io, ROOTS, cache)

  expect([calls.read, find(first.defs, 'a', 'always')?.body, find(second.defs, 'a', 'always')?.body, second === first], 'reads, bodies, identity').toEqual([
    [`${P_NATIVE}/a.md`],
    'V1',
    'V2',
    false,
  ])
})

test('GIVEN a file that disappears WHEN the registry loads again THEN the default shows through', async () => {
  const tree: Tree = { ...defaultsTree(), [`${P_NATIVE}/a.md`]: 'V1' }
  const { io } = memIo(tree)
  const cache = newRegistryCache()
  await loadRegistry(io, ROOTS, cache)
  delete tree[`${P_NATIVE}/a.md`]
  const after = await loadRegistry(io, ROOTS, cache)

  expect(after.defs, 'defs').toEqual(defaultDefs())
})

test('GIVEN a symlinked override WHEN the registry loads again THEN it is re-read each time but the registry stays when the text is equal', async () => {
  const tree: Tree = { ...defaultsTree(), [`${P_NATIVE}/a.md`]: { raw: 'L', isLink: true } }
  const { io, calls } = memIo(tree)
  const cache = newRegistryCache()
  const first = await loadRegistry(io, ROOTS, cache)
  calls.read.length = 0
  const second = await loadRegistry(io, ROOTS, cache)

  expect([calls.read, second === first], 'reads, identity').toEqual([[`${P_NATIVE}/a.md`], true])
})

test('GIVEN a failing listing after a good load WHEN the registry loads again THEN it rejects and the cache keeps the good registry', async () => {
  const good = memIo(defaultsTree())
  const cache = newRegistryCache()
  const first = await loadRegistry(good.io, ROOTS, cache)
  const bad = { ...good.io, list: async () => Promise.reject(new Error('EACCES')) }
  const outcome = await loadRegistry(bad, ROOTS, cache).then(() => 'resolved', (err: Error) => err.message)

  expect([outcome, cache.registry === first], 'outcome, cache registry').toEqual(['EACCES', true])
})

test('GIVEN the config env and home WHEN the config dir is resolved THEN CLAUDE_CONFIG_DIR wins, normalised, else home/.claude', async () => {
  expect(
    [configDirOf('/a//b/./c/../d/', '/h'), configDirOf('', '/h/'), configDirOf(undefined, '/h'), configDirOf(undefined, undefined), configDirOf('rel/x/', '/h')],
    'config dirs',
  ).toEqual(['/a/b/d', '/h/.claude', '/h/.claude', undefined, 'rel/x'])
})

test('GIVEN odd paths WHEN normalised THEN absolute ones fold dots and slashes and others only lose trailing separators', async () => {
  expect([normalizeDir('/'), normalizeDir('/x/../..'), normalizeDir('/x//y/'), normalizeDir('C:\\u\\.claude\\')], 'paths').toEqual(['/', '/', '/x/y', 'C:\\u\\.claude'])
})

test('GIVEN all roots WHEN layer specs are built THEN they run low to high with legacy under native at each scope', async () => {
  expect(layerSpecs({ pluginRoot: '/p/', root: '/r/', configDir: '/c/' }).map((s) => `${s.id}:${s.kind}:${s.dir}`), 'specs').toEqual([
    'default:native:/p/placeholders',
    'global-legacy:legacy:/c/manager/prompts',
    'global:native:/c/placeholders',
    'project-legacy:legacy:/r/.claude/brewtools/manager/prompts',
    'project:native:/r/.claude/placeholders',
  ])
})

test('GIVEN no config dir and no root WHEN layer specs are built THEN only the defaults remain', async () => {
  expect(layerSpecs({ pluginRoot: '/p' }).map((s) => s.id), 'ids').toEqual(['default'])
})

test('GIVEN a registry with a plan variant and a duplicate name WHEN editor entries are built THEN the first def per name wins', async () => {
  const reg = await load({})

  expect(toEditorEntries(reg.defs).map((e) => e.name), 'names').toEqual(['+', 'a', 'm', 'r', 'rr'])
})
