import { test, expect } from 'claude-code/testing'
import { configDirOf, issuesMessage, layerSpecs, loadRegistry, newRegistryCache, normalizeDir, toEditorEntries, type Def, type Roots } from '../hooks/lib/defs'
import { defaultDefs } from './fixtures'
import { CFG, PLUG, ROOT, defaultsTree, memIo, type Tree } from './layer-io'

const ROOTS: Roots = { pluginRoot: PLUG, root: ROOT, configDir: CFG }
const P_NATIVE = `${ROOT}/.claude/placeholders`
const P_LEGACY = `${ROOT}/.claude/brewtools/manager/prompts`
const G_NATIVE = `${CFG}/placeholders`
const G_LEGACY = `${CFG}/manager/prompts`

const load = (extra: Tree) => loadRegistry(memIo({ ...defaultsTree(), ...extra }).io, ROOTS, newRegistryCache())
const find = (defs: readonly Def[], name: string, isPlan = false): Def | undefined => defs.find((d) => d.name === name && d.isPlan === isPlan)
const withBody = <T extends { body: string }>(d: T | undefined, body: string) => ({ ...d, body })

test('GIVEN only the shipped defaults WHEN the registry loads THEN it equals the parsed defaults and every source is default', async () => {
  const reg = await load({})

  expect([reg.defs, reg.issues, [...reg.sources]], 'registry').toEqual([
    defaultDefs(),
    [],
    [['+', 'default'], ['+.plan', 'default'], ['a', 'default'], ['m', 'default'], ['m.plan', 'default'], ['r', 'default'], ['rr', 'default']],
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

    expect([find(reg.defs, 'a'), reg.sources.get('a')], 'def a and its source layer').toEqual([
      withBody(find(defaultDefs(), 'a'), row.body),
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
  test(`GIVEN ${row.title} WHEN the registry loads THEN the empty body wins`, async () => {
    const reg = await load(row.tree)

    expect([find(reg.defs, 'a')?.body, reg.sources.get('a')], 'body and source layer').toEqual(['', row.source])
  })
}

test('GIVEN a full override and a planmode override WHEN the registry loads THEN each variant changes only its own body', async () => {
  const bodies = (reg: { defs: readonly Def[] }) => [find(reg.defs, 'm')?.body, find(reg.defs, 'm', true)?.body]
  const plain = bodies(await load({}))

  expect(
    [bodies(await load({ [`${P_LEGACY}/full.md`]: 'FULL-OVR' })), bodies(await load({ [`${P_LEGACY}/planmode.md`]: 'PLAN-OVR' }))],
    'always and plan bodies per override',
  ).toEqual([['FULL-OVR', plain[1]], [plain[0], 'PLAN-OVR']])
})

test('GIVEN a native file without front matter WHEN it overrides r THEN group, priority, order, header and legacy are inherited', async () => {
  const reg = await load({ [`${P_NATIVE}/r.md`]: 'MINE' })

  expect(find(reg.defs, 'r'), 'def r').toEqual(withBody(find(defaultDefs(), 'r'), 'MINE'))
})

test('GIVEN a native file with partial front matter WHEN it overrides r THEN only the named fields change', async () => {
  const reg = await load({ [`${P_NATIVE}/r.md`]: '---\norder: 7\nheader: "H {token}"\n---\nMINE' })

  expect(find(reg.defs, 'r'), 'def r').toEqual({ ...withBody(find(defaultDefs(), 'r'), 'MINE'), order: 7, header: 'H {token}' })
})

test('GIVEN new native files without defaults WHEN loaded THEN the stem names them and .plan marks the plan part', async () => {
  const reg = await load({ [`${P_NATIVE}/foo.md`]: 'F', [`${G_NATIVE}/foo.plan.md`]: 'FP' })

  expect(
    reg.defs.filter((d) => d.name === 'foo'),
    'foo variants',
  ).toEqual([
    { name: 'foo', body: 'FP', insert: 'context', order: 100, priority: 0, header: '', isPlan: true },
    { name: 'foo', body: 'F', insert: 'context', order: 100, priority: 0, header: '', isPlan: false },
  ])
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

  expect([calls.read.filter((p) => p.startsWith(ROOT)), reg.defs.length], 'project reads, def count').toEqual([[], 7])
})

test('GIVEN a bad front matter and an empty explicit name WHEN loaded THEN issues name the layer and file and the good fields survive', async () => {
  const reg = await load({
    [`${P_NATIVE}/a.md`]: '---\nwhen: sometimes\nwat: 1\n---\nA2',
    [`${G_NATIVE}/z.md`]: '---\nname: ""\n---\nZ',
  })

  expect([reg.issues, find(reg.defs, 'a')?.body], 'issues and a body').toEqual([
    [
      'global/z.md: no name',
      "project/a.md: unknown key 'wat'",
      'project/a.md: when: sometimes is gone; sent in every mode',
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

  expect([readsAfterFirst, calls.read.length, second === first], 'reads after first, reads after second, same object').toEqual([7, 7, true])
})

test('GIVEN one file whose mtime moves WHEN the registry loads again THEN only that file is re-read and the new text shows', async () => {
  const tree: Tree = { ...defaultsTree(), [`${P_NATIVE}/a.md`]: { raw: 'V1', mtimeMs: 5 } }
  const { io, calls } = memIo(tree)
  const cache = newRegistryCache()
  const first = await loadRegistry(io, ROOTS, cache)
  calls.read.length = 0
  tree[`${P_NATIVE}/a.md`] = { raw: 'V2', mtimeMs: 6 }
  const second = await loadRegistry(io, ROOTS, cache)

  expect([calls.read, find(first.defs, 'a')?.body, find(second.defs, 'a')?.body, second === first], 'reads, bodies, identity').toEqual([
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

// ---- fail-soft loader: one bad file never costs the registry

const NAME_ISSUE = (file: string, name: string): string => `project/${file}: name '${name}' is not a placeholder name (1-32 of A-Z a-z 0-9 _, or punctuation only)`

test('GIVEN native files with hyphen, dot, 33-char and unicode names WHEN loaded THEN each is skipped with one issue and listed as skipped', async () => {
  const long = 'x'.repeat(33)
  const reg = await load({
    [`${P_NATIVE}/my-thing.md`]: 'A',
    [`${P_NATIVE}/foo.bar.md`]: 'B',
    [`${P_NATIVE}/${long}.md`]: 'C',
    [`${P_NATIVE}/caf\u00e9.md`]: 'D',
    [`${P_NATIVE}/good.md`]: 'G',
  })

  expect([reg.issues, reg.skipped, reg.defs.map((d) => d.name), [...reg.sources.keys()]], 'issues, skipped, names, sources').toEqual([
    [NAME_ISSUE('caf\u00e9.md', 'caf\u00e9'), NAME_ISSUE('foo.bar.md', 'foo.bar'), NAME_ISSUE('my-thing.md', 'my-thing'), NAME_ISSUE(`${long}.md`, long)],
    ['project/caf\u00e9.md', 'project/foo.bar.md', 'project/my-thing.md', `project/${long}.md`],
    ['+', '+', 'a', 'm', 'm', 'r', 'rr', 'good'],
    ['+', '+.plan', 'a', 'm', 'm.plan', 'r', 'rr', 'good'],
  ])
})

test('GIVEN a symbol name and a front matter name with a hyphen WHEN loaded THEN the symbol is kept and the hyphen name is skipped', async () => {
  const reg = await load({
    [`${P_NATIVE}/sym.md`]: '---\nname: "@@"\n---\nS',
    [`${P_NATIVE}/hy.md`]: '---\nname: "a-b"\n---\nH',
  })

  expect([reg.issues, reg.skipped, reg.defs.filter((d) => d.body === 'S' || d.body === 'H').map((d) => d.name)], 'issues, skipped, kept names').toEqual([
    [NAME_ISSUE('hy.md', 'a-b')],
    ['project/hy.md'],
    ['@@'],
  ])
})

test('GIVEN an unterminated front matter WHEN loaded THEN the file is skipped, never injected raw, and the default shows through', async () => {
  const reg = await load({ [`${P_NATIVE}/a.md`]: '---\nname: a\norder: 5\nBODY' })

  expect([reg.issues, reg.skipped, find(reg.defs, 'a')], 'issues, skipped, def a').toEqual([
    ['project/a.md: front matter is not closed'],
    ['project/a.md'],
    find(defaultDefs(), 'a'),
  ])
})

test('GIVEN blank lines before the opening front matter line WHEN loaded THEN the front matter is read and the body is clean', async () => {
  const reg = await load({ [`${P_NATIVE}/foo.md`]: '\n  \n---\norder: 5\n---\nBODY' })

  expect([reg.issues, reg.skipped, reg.defs.filter((d) => d.name === 'foo')], 'issues, skipped, foo').toEqual([
    [],
    [],
    [{ name: 'foo', body: 'BODY', insert: 'context', order: 5, priority: 0, header: '', isPlan: false }],
  ])
})

test('GIVEN one unreadable file next to good ones WHEN loaded THEN the registry resolves, the file is skipped and named in issues and skipped', async () => {
  const mem = memIo({ ...defaultsTree(), [`${P_NATIVE}/dangling.md`]: { raw: 'x', isLink: true }, [`${P_NATIVE}/foo.md`]: 'F' })
  const io = { ...mem.io, read: async (p: string) => (p.endsWith('/dangling.md') ? Promise.reject(new Error('ENOENT dangling')) : mem.io.read(p)) }
  const reg = await loadRegistry(io, ROOTS, newRegistryCache())

  expect([reg.issues, reg.skipped, reg.defs.filter((d) => d.name === 'foo').map((d) => d.body), reg.defs.length], 'issues, skipped, foo, def count').toEqual([
    ['project/dangling.md: unreadable (ENOENT dangling)'],
    ['project/dangling.md'],
    ['F'],
    8,
  ])
})

test('GIVEN an unreadable shipped default WHEN loaded THEN the load still rejects so the hook fails open', async () => {
  const mem = memIo(defaultsTree())
  const io = { ...mem.io, read: async (p: string) => (p.endsWith('/a.md') ? Promise.reject(new Error('EACCES')) : mem.io.read(p)) }
  const outcome = await loadRegistry(io, ROOTS, newRegistryCache()).then(() => 'resolved', (err: Error) => err.message)

  expect(outcome, 'outcome').toBe('EACCES')
})

test('GIVEN a still unreadable file WHEN the registry loads again THEN the same registry returns, and once readable the file appears', async () => {
  const tree: Tree = { ...defaultsTree(), [`${P_NATIVE}/dangling.md`]: { raw: '', isLink: true } }
  const mem = memIo(tree)
  let broken = true
  const io = { ...mem.io, read: async (p: string) => (broken && p.endsWith('/dangling.md') ? Promise.reject(new Error('EIO')) : mem.io.read(p)) }
  const cache = newRegistryCache()
  const first = await loadRegistry(io, ROOTS, cache)
  const second = await loadRegistry(io, ROOTS, cache)
  broken = false
  const third = await loadRegistry(io, ROOTS, cache)

  expect([second === first, third === first, third.skipped, third.defs.filter((d) => d.name === 'dangling').map((d) => d.body)], 'identity, recovery').toEqual([true, false, [], ['']])
})

test('GIVEN upper-case stems WHEN loaded THEN M.md overrides m field by field and Foo.plan.md is a plan part of foo', async () => {
  const reg = await load({ [`${P_NATIVE}/M.md`]: 'UP', [`${P_NATIVE}/Foo.md`]: 'F', [`${P_NATIVE}/Foo.plan.md`]: 'FP' })
  const m = reg.defs.filter((d) => d.name === 'm' && !d.isPlan)

  expect([m, reg.sources.get('m'), reg.sources.has('M'), reg.defs.filter((d) => d.name.toLowerCase() === 'foo').map((d) => [d.name, d.isPlan, d.body]), reg.issues], 'm, source, foo, issues').toEqual([
    [withBody(find(defaultDefs(), 'm'), 'UP')],
    'project',
    false,
    [['foo', false, 'F'], ['foo', true, 'FP']],
    ['project/Foo.plan.md: no plan: add; its text is added in plan mode'],
  ])
})

test('GIVEN a skipped file and a plain issue WHEN the session message is built THEN it names the first issue and lists the skipped files', async () => {
  const reg = await load({ [`${P_NATIVE}/a.md`]: '---\nwat: 1\n---\nA2', [`${P_NATIVE}/my-thing.md`]: 'X', [`${P_NATIVE}/bad.md`]: '---\nname: b' })

  expect([issuesMessage(reg), issuesMessage(await load({}))], 'messages').toEqual([
    "3 definition issue(s), first: project/a.md: unknown key 'wat'; skipped project/bad.md, project/my-thing.md · all: /placeholders status",
    null,
  ])
})
