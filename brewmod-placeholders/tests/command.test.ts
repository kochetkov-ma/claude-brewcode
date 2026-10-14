import { test, expect } from 'claude-code/testing'
import { runCommand, USAGE, normalizeName, type CmdIo, type CmdResult } from '../hooks/lib/command'
import type { Roots } from '../hooks/lib/defs'
import { CFG, PLUG, ROOT, memFs, wire, type Tree } from './layer-io'

const ROOTS: Roots = { pluginRoot: PLUG, root: ROOT, configDir: CFG }
const P_DIR = `${ROOT}/.claude/placeholders`
const G_DIR = `${CFG}/placeholders`
const P_LEGACY = `${ROOT}/.claude/brewtools/manager/prompts`
const G_LEGACY = `${CFG}/manager/prompts`

const fm = (fields: string, body: string): string => `---\n${fields}\n---\n${body}`
const defaults = (): Tree => ({
  [`${PLUG}/placeholders/m.md`]: fm('name: "m"\ndescription: "Manager mode"\nlegacy: full', 'MGR'),
  [`${PLUG}/placeholders/m.plan.md`]: fm('name: "m"\ndescription: "Manager plan"\nwhen: plan\nlegacy: planmode', 'MGR+PLAN'),
  [`${PLUG}/placeholders/a.md`]: fm('name: "a"\ndescription: "Architect"\nlegacy: architect', 'ARCH'),
})

type Rig = { io: CmdIo; tree: Tree; writes: [string, string][]; removed: string[]; stats: string[] }
type RigOpts = { real?: Record<string, string>; links?: string[]; rmExit?: number; rmErr?: string }

// In-memory CmdIo over a mutable tree: write adds a file, remove deletes it, stat answers file/dir/missing with optional realPath overrides.
function rig(extra: Tree, opts: RigOpts = {}): Rig {
  const tree: Tree = { ...defaults(), ...extra }
  const fs = memFs(tree)
  const writes: [string, string][] = []
  const removed: string[] = []
  const stats: string[] = []
  const io: CmdIo = {
    exists: async (p) => fs.exists(p),
    list: async (p) => fs.list(p),
    read: async (p) => fs.read(p),
    write: async (p, t) => {
      writes.push([p, t])
      tree[p] = t
    },
    stat: async (p) => {
      stats.push(p)
      const real = opts.real?.[p] ?? p
      const isFile = p in tree
      const isDir = Object.keys(tree).some((k) => k.startsWith(`${p}/`))
      return isFile ? { kind: 'file', isLink: opts.links?.includes(p) === true, realPath: real } : isDir ? { kind: 'dir', isLink: false, realPath: real } : undefined
    },
    remove: async (p) => {
      removed.push(p)
      const exitCode = opts.rmExit ?? 0
      if (exitCode === 0) delete tree[p]
      return { exitCode, stderr: opts.rmErr ?? '' }
    },
  }
  return { io, tree, writes, removed, stats }
}

const run = (r: Rig, args: string, roots: Roots = ROOTS): Promise<CmdResult> => runCommand(r.io, roots, args)
const names = (res: CmdResult): string[] => (res.registry?.defs ?? []).map((d) => d.name)

// ---- list

test('GIVEN the plugin defaults only WHEN list runs THEN every stem shows its plugin layer and description in name order', async () => {
  const out = await run(rig({}), 'list')

  expect(out, 'list result').toEqual({
    text: ['placeholders (3):', 'a       plugin          Architect', 'm       plugin          Manager mode', 'm.plan  plugin          Manager plan'].join('\n'),
    registry: null,
  })
})

test('GIVEN a project legacy, a global legacy and a project native file WHEN list runs THEN each row names its winning layer', async () => {
  const r = rig({
    [`${P_LEGACY}/full.md`]: 'PL',
    [`${G_LEGACY}/architect.md`]: 'GL',
    [`${P_DIR}/mine.md`]: 'MY',
  })

  const out = await run(r, 'list')

  expect(out.text, 'list text').toBe(
    [
      'placeholders (4):',
      'a       global-legacy   Architect',
      'm       project-legacy  Manager mode',
      'm.plan  plugin          Manager plan',
      'mine    project         -',
    ].join('\n'),
  )
})

test('GIVEN a global native override WHEN list runs THEN that stem reads global', async () => {
  const out = await run(rig({ [`${G_DIR}/a.md`]: 'GN' }), 'list')

  expect(out.text.split('\n')[1], 'row of a').toBe('a       global          Architect')
})

test('GIVEN a definition file with a bad key WHEN list runs THEN the issue is listed under the table', async () => {
  const out = await run(rig({ [`${P_DIR}/bad.md`]: fm('name: "bad"\nwhen: sometimes', 'B') }), 'list')

  expect(out.text.split('\n').slice(-2), 'issues block').toEqual(['issues (1):', "  project/bad.md: when: 'sometimes' is not always|plan|not-plan"])
})

// ---- show

test('GIVEN the plugin defaults WHEN show m runs THEN the plain text and the plan variant print with layer and metadata', async () => {
  const out = await run(rig({}), 'show m')

  expect(out, 'show result').toEqual({
    text: [
      '== m (layer: plugin, when: always, insert: context, order: 100) ==',
      'MGR',
      '',
      '== m.plan (layer: plugin, when: plan, insert: context, order: 100) ==',
      'MGR+PLAN',
    ].join('\n'),
    registry: null,
  })
})

test('GIVEN a project legacy override of m WHEN show m runs THEN the effective text is the legacy one and the layer says project-legacy', async () => {
  const out = await run(rig({ [`${P_LEGACY}/full.md`]: 'LEGACY TEXT' }), 'show M')

  expect(out.text.split('\n').slice(0, 2), 'first block').toEqual(['== m (layer: project-legacy, when: always, insert: context, order: 100) ==', 'LEGACY TEXT'])
})

test('GIVEN the plan stem WHEN show m.plan runs THEN only that variant prints', async () => {
  const out = await run(rig({}), 'show m.plan')

  expect(out.text, 'show text').toBe('== m.plan (layer: plugin, when: plan, insert: context, order: 100) ==\nMGR+PLAN')
})

test('GIVEN an unknown or a malformed name WHEN show runs THEN a readable refusal comes back', async () => {
  const r = rig({})

  const rows = [await run(r, 'show zzz'), await run(r, 'show ../x')]

  expect(
    rows.map((x) => x.text),
    'refusals',
  ).toEqual(["placeholders: unknown placeholder 'zzz'; /placeholders list shows the defined ones", `placeholders: bad name '../x'\n${USAGE}`])
})

// ---- add

test('GIVEN no own file WHEN add runs THEN the project file holds the text and the rescan returns the new registry', async () => {
  const r = rig({})

  const out = await run(r, 'add Fresh  keep it short\nsecond line')

  expect([r.writes, out.text, names(out)], 'writes, text, names').toEqual([
    [[`${P_DIR}/fresh.md`, 'keep it short\nsecond line\n']],
    `added fresh (project): ${P_DIR}/fresh.md`,
    ['a', 'm', 'm', 'fresh'],
  ])
})

test('GIVEN the global keyword WHEN add runs THEN the file lands in the config dir', async () => {
  const r = rig({})

  const out = await run(r, 'add zed global GTEXT')

  expect([r.writes, out.text], 'writes and text').toEqual([[[`${G_DIR}/zed.md`, 'GTEXT\n']], `added zed (global): ${G_DIR}/zed.md`])
})

test('GIVEN a symbol name and a plan variant WHEN add runs THEN both are accepted', async () => {
  const r = rig({})

  const out = [await run(r, 'add !! BANG'), await run(r, 'add m.plan PLAN TEXT')]

  expect(r.writes, 'writes').toEqual([
    [`${P_DIR}/!!.md`, 'BANG\n'],
    [`${P_DIR}/m.plan.md`, 'PLAN TEXT\n'],
  ])
  expect(
    out.map((x) => x.text.split('\n')[0]),
    'texts',
  ).toEqual([`added !! (project): ${P_DIR}/!!.md`, `added m.plan (project): ${P_DIR}/m.plan.md`])
})

test('GIVEN a global file shadowed by a project file WHEN add global runs THEN the note names the winning layer', async () => {
  const out = await run(rig({ [`${P_DIR}/a.md`]: 'PN' }), 'add a global GN')

  expect(out.text, 'text').toBe(`added a (global): ${G_DIR}/a.md\nnote: the effective layer is project, which wins over global`)
})

const BAD_NAMES = ['a/b', '../x', 'a.b', '.hidden', 'a/', 'x'.repeat(33), '.plan', 'é', 'a\\b', 'a:b']

for (const bad of BAD_NAMES) {
  test(`GIVEN the name ${JSON.stringify(bad)} WHEN add runs THEN it is refused and nothing is written`, async () => {
    const r = rig({})

    const out = await run(r, `add ${bad} text`)

    expect([out, r.writes], 'result and writes').toEqual([{ text: `placeholders: bad name '${bad}'\n${USAGE}`, registry: null }, []])
  })
}

test('GIVEN valid and invalid spellings WHEN names are normalized THEN only file-safe lowercase names pass', async () => {
  const table = ['Abc', 'a_1', '+', '++', '@#', 'm.plan', 'a b', 'a/b', '', '..', '"q"', 'x'.repeat(32)]

  expect(table.map(normalizeName), 'normalized').toEqual(['abc', 'a_1', '+', '++', '@#', 'm.plan', null, null, null, null, null, 'x'.repeat(32)])
})

test('GIVEN an existing own file WHEN add runs THEN it is refused without a write', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'OLD' })

  const out = await run(r, 'add a NEW')

  expect([out, r.writes], 'result and writes').toEqual([{ text: `placeholders: ${P_DIR}/a.md already exists; /placeholders edit a prints it`, registry: null }, []])
})

const CANNOT = 'placeholders: that text holds a ``` or ~~~ fence marker or opens with a --- line, which the definition format cannot carry; write the file by hand'

test('GIVEN text with a fence, or a leading front matter WHEN add runs THEN it is refused without a write', async () => {
  const r = rig({})

  const rows = [await run(r, 'add f ```\ncode\n```'), await run(r, 'add h ~~~\ncode\n~~~'), await run(r, 'add g ---\nname: "g"\n---\nbody')]

  expect([rows, r.writes], 'refusals and writes').toEqual([Array.from({ length: 3 }, () => ({ text: CANNOT, registry: null })), []])
})

test('GIVEN add without text or without a name WHEN it runs THEN the usage text comes back', async () => {
  const r = rig({})

  const rows = [await run(r, 'add onlyname'), await run(r, 'add onlyname global'), await run(r, 'add')]

  expect(
    rows.map((x) => x.text),
    'texts',
  ).toEqual([`placeholders: add needs text\n${USAGE}`, `placeholders: add needs text\n${USAGE}`, `placeholders: bad name ''\n${USAGE}`])
})

test('GIVEN no project root WHEN add runs THEN a readable error replaces the write', async () => {
  const r = rig({})

  const out = await run(r, 'add x text', { pluginRoot: PLUG, configDir: CFG })

  expect([out, r.writes], 'result and writes').toEqual([{ text: 'placeholders: no project root for this session', registry: null }, []])
})

// ---- edit

test('GIVEN a legacy-sourced placeholder WHEN edit runs THEN the project override is seeded from the effective text', async () => {
  const r = rig({ [`${P_LEGACY}/full.md`]: 'LEGACY TEXT' })

  const out = await run(r, 'edit m')

  expect([r.writes, out.text, out.registry?.sources.get('m')], 'writes, text, source').toEqual([
    [[`${P_DIR}/m.md`, 'LEGACY TEXT\n']],
    `created (project) from project-legacy text: ${P_DIR}/m.md\nedit it; changes apply from the next prompt`,
    'project',
  ])
})

test('GIVEN a plugin default WHEN edit global runs THEN the global file is seeded and the path printed', async () => {
  const r = rig({})

  const out = await run(r, 'edit a global')

  expect([r.writes, out.text], 'writes and text').toEqual([
    [[`${G_DIR}/a.md`, 'ARCH\n']],
    `created (global) from plugin text: ${G_DIR}/a.md\nedit it; changes apply from the next prompt`,
  ])
})

test('GIVEN an existing own file WHEN edit runs THEN only its path is printed and nothing is written', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' })

  const out = await run(r, 'edit a')

  expect([out, r.writes], 'result and writes').toEqual([{ text: `exists (project): ${P_DIR}/a.md\nedit it; changes apply from the next prompt`, registry: null }, []])
})

test('GIVEN an unknown name WHEN edit runs THEN it is refused and add is suggested', async () => {
  const r = rig({})

  const out = await run(r, 'edit nope')

  expect([out, r.writes], 'result and writes').toEqual([{ text: "placeholders: unknown placeholder 'nope'; /placeholders add creates a new one", registry: null }, []])
})

test('GIVEN an effective body that would read back as front matter WHEN edit runs THEN it is refused without a write', async () => {
  const r = rig({ [`${P_LEGACY}/full.md`]: '---\nkey: v\n---\nrest' })

  const out = await run(r, 'edit m')

  expect([out.registry, out.text, r.writes], 'registry, text and writes').toEqual([null, CANNOT, []])
})

// ---- rm

test('GIVEN a project file WHEN rm runs THEN rm gets the resolved path and the registry falls back to the plugin default', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' })

  const out = await run(r, 'rm a')

  expect([r.removed, out.text, out.registry?.sources.get('a')], 'removed, text, source').toEqual([
    [`${P_DIR}/a.md`],
    `removed (project): ${P_DIR}/a.md\na is now served by the plugin layer`,
    'default',
  ])
})

test('GIVEN a global file WHEN rm global runs THEN only the global file goes', async () => {
  const r = rig({ [`${G_DIR}/zed.md`]: 'Z', [`${P_DIR}/zed.md`]: 'P' })

  const out = await run(r, 'rm zed global')

  expect([r.removed, out.text], 'removed and text').toEqual([[`${G_DIR}/zed.md`], `removed (global): ${G_DIR}/zed.md\nzed is now served by the project layer`])
})

test('GIVEN a file that was the only definition WHEN rm runs THEN the text says it is no longer defined', async () => {
  const out = await run(rig({ [`${P_DIR}/solo.md`]: 'S' }), 'rm solo')

  expect(out.text, 'text').toBe(`removed (project): ${P_DIR}/solo.md\nsolo is no longer defined`)
})

test('GIVEN a plugin default without an own file WHEN rm runs THEN it is refused and nothing is removed', async () => {
  const r = rig({})

  const out = await run(r, 'rm m')

  expect([out, r.removed], 'result and removed').toEqual([
    { text: 'placeholders: refused, m is a plugin default and has no project file; /placeholders edit m overrides it', registry: null },
    [],
  ])
})

test('GIVEN legacy files in both scopes WHEN rm runs THEN they are refused and never removed', async () => {
  const r = rig({ [`${P_LEGACY}/full.md`]: 'PL', [`${G_LEGACY}/architect.md`]: 'GL' })

  const rows = [await run(r, 'rm m'), await run(r, 'rm a global')]

  expect([rows.map((x) => x.text), r.removed, Object.keys(r.tree).filter((k) => k.includes('/manager/prompts') || k.includes('brewtools'))], 'refusals').toEqual([
    [
      'placeholders: refused, m comes from a brewtools project-legacy file, which this command never removes',
      'placeholders: refused, a comes from a brewtools global-legacy file, which this command never removes',
    ],
    [],
    [`${P_LEGACY}/full.md`, `${G_LEGACY}/architect.md`],
  ])
})

test('GIVEN a file defined only in the other scope WHEN rm runs THEN the text names that layer and nothing is removed', async () => {
  const r = rig({ [`${G_DIR}/a.md`]: 'GN' })

  const out = await run(r, 'rm a')

  expect([out.text, r.removed], 'text and removed').toEqual(['placeholders: no project file for a; it comes from the global layer', []])
})

test('GIVEN a file whose real path escapes the own dir WHEN rm runs THEN it is refused and rm never runs', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' }, { real: { [`${P_DIR}/a.md`]: '/etc/passwd' } })

  const out = await run(r, 'rm a')

  expect([out, r.removed], 'result and removed').toEqual([{ text: `placeholders: refused, ${P_DIR}/a.md is not a plain file inside ${P_DIR}`, registry: null }, []])
})

test('GIVEN a sibling directory that only shares the dir prefix WHEN rm runs THEN the prefix match is not enough', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' }, { real: { [`${P_DIR}/a.md`]: `${P_DIR}-evil/a.md` } })

  const out = await run(r, 'rm a')

  expect([out.registry, r.removed], 'registry and removed').toEqual([null, []])
})

test('GIVEN a symbolic link inside the own dir WHEN rm runs THEN it is refused', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' }, { links: [`${P_DIR}/a.md`] })

  const out = await run(r, 'rm a')

  expect([out.text, r.removed], 'text and removed').toEqual([`placeholders: refused, ${P_DIR}/a.md is not a plain file inside ${P_DIR}`, []])
})

test('GIVEN an own dir that is itself a link WHEN the file resolves inside its real location THEN rm removes the real file', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' }, { real: { [P_DIR]: '/dotfiles/ph', [`${P_DIR}/a.md`]: '/dotfiles/ph/a.md' } })

  const out = await run(r, 'rm a')

  expect([r.removed, out.registry === null], 'removed and registry flag').toEqual([['/dotfiles/ph/a.md'], false])
})

test('GIVEN a failing rm WHEN rm runs THEN the exit code and stderr come back and the registry stays null', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' }, { rmExit: 1, rmErr: 'denied\n' })

  const out = await run(r, 'rm a')

  expect(out, 'result').toEqual({ text: 'placeholders: rm failed (exit 1): denied', registry: null })
})

test('GIVEN an unknown name WHEN rm runs THEN it is refused', async () => {
  const out = await run(rig({}), 'rm nope')

  expect(out.text, 'text').toBe("placeholders: unknown placeholder 'nope'")
})

test('GIVEN a traversal name WHEN rm runs THEN the name is refused before any file system call', async () => {
  const r = rig({ [`${ROOT}/secret.md`]: 'S' })

  const out = await run(r, 'rm ../../secret')

  expect([out, r.removed, r.stats], 'result, removed, stats').toEqual([{ text: `placeholders: bad name '../../secret'\n${USAGE}`, registry: null }, [], []])
})

// ---- usage and failure

test('GIVEN no subcommand, help or an unknown one WHEN run THEN the usage text comes back', async () => {
  const r = rig({})

  const rows = [await run(r, ''), await run(r, '  help'), await run(r, 'frobnicate x')]

  expect(
    rows.map((x) => x.text),
    'texts',
  ).toEqual([USAGE, USAGE, `placeholders: unknown subcommand 'frobnicate'\n${USAGE}`])
})

test('GIVEN a file system that fails WHEN any subcommand runs THEN readable text comes back and nothing throws', async () => {
  const r = rig({})
  const broken: CmdIo = { ...r.io, exists: async () => Promise.reject(new Error('EACCES boom')) }

  const rows = await Promise.all(['list', 'show m', 'add x t', 'edit m', 'rm m'].map((a) => runCommand(broken, ROOTS, a)))

  expect(rows, 'results').toEqual(Array.from({ length: 5 }, () => ({ text: 'placeholders: failed: EACCES boom', registry: null })))
})

test('GIVEN a write that fails WHEN add runs THEN the failure text comes back and the registry stays null', async () => {
  const r = rig({})
  const broken: CmdIo = { ...r.io, write: async () => Promise.reject(new Error('EROFS')) }

  const out = await runCommand(broken, ROOTS, 'add x t')

  expect(out, 'result').toEqual({ text: 'placeholders: failed: EROFS', registry: null })
})

// ---- through the hooks: registration, command.run, rescan into the editor entries

const call = (args: string) => ({ command: 'placeholders', args, origin: { kind: 'composer' } as const, presentation: { isFullscreen: false, columns: 80 } })

type Ops = { spec: unknown[]; writes: [string, string][]; ran: string[][] }

function wireCmd(on: Parameters<typeof wire>[0], tree: Tree, opts: { fail?: 'exists' | 'root' | 'env'; denyRegister?: boolean; real?: Record<string, string> } = {}): Ops {
  const fs = memFs(tree)
  const ops: Ops = { spec: [], writes: [], ran: [] }
  wire(on, { tree, bottom: {}, ...(opts.fail === undefined ? {} : { fail: opts.fail }) })
  on('session.start', () => ({ cwd: ROOT }))
  on('command.register', (_$, e) => {
    ops.spec.push(e)
    return (opts.denyRegister === true ? { deny: 'refused' } : { value: { command: e.name } }) as never
  })
  on('fs.write', (_$, e) => {
    ops.writes.push([e.path, e.text])
    tree[e.path] = e.text
    return { value: undefined } as never
  })
  on('fs.stat', (_$, e) => {
    const isFile = e.path in tree
    const isDir = fs.exists(e.path) && !isFile
    const value = isFile || isDir ? { kind: isFile ? 'file' : 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: opts.real?.[e.path] ?? e.path } : undefined
    return (value === undefined ? { deny: 'ENOENT' } : { value }) as never
  })
  on('process.run', (_$, e) => {
    ops.ran.push([...e.argv])
    delete tree[e.argv[2] ?? '']
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  return ops
}

test('GIVEN a started session WHEN session.start runs THEN the placeholders command is registered with its hint', async ($, on) => {
  const ops = wireCmd(on, { ...defaults() })

  await $.session.start({ cwd: ROOT, surface: null, isInteractive: false })

  expect(ops.spec, 'registered specs').toEqual([
    { name: 'placeholders', description: 'List, show, add, edit and remove placeholder definitions', argumentHint: '[list|show|add|edit|rm] [name] [global] [text]' },
  ])
})

test('GIVEN a registration that is refused WHEN session.start runs THEN the session still starts', async ($, on) => {
  wireCmd(on, { ...defaults() }, { denyRegister: true })

  const out = await $.session.start({ cwd: ROOT, surface: null, isInteractive: false })

  expect(out, 'session.start result').toEqual({ cwd: ROOT })
})

test('GIVEN list through command.run WHEN the hook answers THEN the text is the table', async ($, on) => {
  wireCmd(on, { ...defaults() })

  const out = await $.command.run(call('list'))

  expect(out.text, 'text').toBe(['placeholders (3):', 'a       plugin          Architect', 'm       plugin          Manager mode', 'm.plan  plugin          Manager plan'].join('\n'))
})

test('GIVEN add through command.run WHEN it succeeds THEN the file is written and the typeahead knows the new name', async ($, on) => {
  const ops = wireCmd(on, { ...defaults() })
  const ask = () => ($.prompt as any).autocomplete({ text: '++fr', cursor: 4, token: '++fr', start: 0 })
  on('prompt.autocomplete', () => ({ suggestions: [] }))

  const before = await ask()
  const out = await $.command.run(call('add fresh hello there'))
  const after = await ask()

  expect([before, out.text, ops.writes, after], 'typeahead before, text, writes, typeahead after').toEqual([
    { suggestions: [] },
    `added fresh (project): ${P_DIR}/fresh.md`,
    [[`${P_DIR}/fresh.md`, 'hello there\n']],
    { suggestions: [{ text: '++fresh ', label: '++fresh', description: 'fresh' }] },
  ])
})

test('GIVEN rm through command.run WHEN the file is inside the own dir THEN process.run gets rm with the resolved path', async ($, on) => {
  const tree = { ...defaults(), [`${P_DIR}/a.md`]: 'MINE' }
  const ops = wireCmd(on, tree)

  const out = await $.command.run(call('rm a'))

  expect([out.text, ops.ran], 'text and argv').toEqual([`removed (project): ${P_DIR}/a.md\na is now served by the plugin layer`, [['rm', '--', `${P_DIR}/a.md`]]])
})

test('GIVEN rm through command.run WHEN the real path escapes THEN process.run is never called', async ($, on) => {
  const tree = { ...defaults(), [`${P_DIR}/a.md`]: 'MINE' }
  const ops = wireCmd(on, tree, { real: { [`${P_DIR}/a.md`]: '/outside/a.md' } })

  const out = await $.command.run(call('rm a'))

  expect([out.text, ops.ran], 'text and argv').toEqual([`placeholders: refused, ${P_DIR}/a.md is not a plain file inside ${P_DIR}`, []])
})

test('GIVEN the file system denies a call WHEN command.run runs THEN readable text comes back instead of an error', async ($, on) => {
  wireCmd(on, { ...defaults() }, { fail: 'exists' })

  const out = await $.command.run(call('list'))

  expect(out.text?.startsWith('placeholders: failed: '), 'failure text').toBe(true)
})

test('GIVEN no session root WHEN command.run adds THEN the project-root text comes back', async ($, on) => {
  wireCmd(on, { ...defaults() }, { fail: 'root' })

  const out = await $.command.run(call('add x text'))

  expect(out.text, 'text').toBe('placeholders: no project root for this session')
})

test('GIVEN the env lookup is denied WHEN command.run runs THEN the catch handler answers readable text', async ($, on) => {
  wireCmd(on, { ...defaults() }, { fail: 'env' })

  const out = await $.command.run(call('list'))

  expect(out.text, 'text').toBe('placeholders: failed: brewmod-placeholders: $.env.get: EACCES')
})
