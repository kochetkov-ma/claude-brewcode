import { test, expect, mock } from 'claude-code/testing'
import { NEEDS_NEW_CC, TOOLS, block, definitionFile, handoffText, isStatusRequest, listTool, normalizeName, removeTool, saveTool, statusText, type CmdIo } from '../hooks/lib/command'
import { loadRegistry, newRegistryCache, type Roots } from '../hooks/lib/defs'
import { CFG, PLUG, ROOT, memFs, wire, type Tree } from './layer-io'

const ROOTS: Roots = { pluginRoot: PLUG, root: ROOT, configDir: CFG }
const FENCE = '```'
const P_DIR = `${ROOT}/.claude/placeholders`
const G_DIR = `${CFG}/placeholders`
const P_LEGACY = `${ROOT}/.claude/brewtools/manager/prompts`
const TOOL = 'mcp__brewmod-placeholders__'

const fm = (fields: string, body: string): string => `---\n${fields}\n---\n${body}`
const defaults = (): Tree => ({
  [`${PLUG}/placeholders/m.md`]: fm('name: "m"\ndescription: "Manager mode"\nlegacy: full', 'MGR'),
  [`${PLUG}/placeholders/m.plan.md`]: fm('name: "m"\ndescription: "Manager plan"\nwhen: plan\nlegacy: planmode', 'MGR+PLAN'),
  [`${PLUG}/placeholders/a.md`]: fm('name: "a"\ndescription: "Architect"\nlegacy: architect', 'ARCH'),
})

type Rig = { io: CmdIo; tree: Tree; writes: [string, string][]; removed: string[] }
type RigOpts = { real?: Record<string, string>; links?: string[]; rmExit?: number; rmErr?: string }

// In-memory CmdIo over a mutable tree: write adds a file, remove deletes it, stat answers file/dir/missing with optional realPath overrides.
function rig(extra: Tree, opts: RigOpts = {}): Rig {
  const tree: Tree = { ...defaults(), ...extra }
  const fs = memFs(tree)
  const writes: [string, string][] = []
  const removed: string[] = []
  const io: CmdIo = {
    exists: async (p) => fs.exists(p),
    list: async (p) => fs.list(p),
    read: async (p) => fs.read(p),
    write: async (p, t) => {
      writes.push([p, t])
      tree[p] = t
    },
    stat: async (p) => {
      const real = opts.real?.[p] ?? p
      const isFile = p in tree
      const isDir = Object.keys(tree).some((k) => k.startsWith(`${p}/`))
      return isFile ? { kind: 'file', isLink: opts.links?.includes(p) === true, realPath: real } : isDir ? { kind: 'dir', isLink: false, realPath: real } : undefined
    },
    remove: async (p) => {
      removed.push(p)
      const exitCode = opts.rmExit ?? 0
      delete tree[exitCode === 0 ? p : '']
      return { exitCode, stderr: opts.rmErr ?? '' }
    },
  }
  return { io, tree, writes, removed }
}

const reg = (r: Rig) => loadRegistry(r.io, ROOTS, newRegistryCache())

// ---- which words show the status

test('GIVEN the status words in any case or none WHEN checked THEN each is a status request', async () => {
  expect(['', '  ', 'status', 'HELP', ' List '].map(isStatusRequest), 'status requests').toEqual([true, true, true, true, true])
})

test('GIVEN the removed subcommands and free text WHEN checked THEN none is a status request', async () => {
  expect(['show m', 'add foo text', 'edit m', 'rm m', 'list all of them', 'a placeholder for release checklists'].map(isStatusRequest), 'status requests').toEqual([false, false, false, false, false, false])
})

// ---- status block

test('GIVEN the plugin defaults only WHEN the status is built THEN the count, one row per placeholder and the add-or-change line come back', async () => {
  const out = statusText(await reg(rig({})), '++')

  expect(out, 'status').toBe(
    ['3 placeholders: type ++name in any prompt', FENCE, '++a       plugin          Architect', '++m       plugin          Manager mode', '++m.plan  plugin          Manager plan', FENCE, 'add or change: /placeholders <what you want>'].join('\n'),
  )
})

test('GIVEN a project file, a global override and a project legacy file WHEN the status is built THEN each row names its winning layer', async () => {
  const r = rig({
    [`${P_DIR}/rel.md`]: fm('description: "Release checklist"', 'CHECK'),
    [`${G_DIR}/a.md`]: fm('description: "My architect"', 'MINE'),
    [`${P_LEGACY}/full.md`]: 'LEGACY',
  })

  const out = statusText(await reg(r), '++')

  expect(out, 'status').toBe(
    [
      '4 placeholders: type ++name in any prompt',
      FENCE,
      '++a       global          My architect',
      '++m       project-legacy  Manager mode',
      '++m.plan  plugin          Manager plan',
      '++rel     project         Release checklist',
      FENCE,
      'add or change: /placeholders <what you want>',
    ].join('\n'),
  )
})

test('GIVEN a definition file with a bad key WHEN the status is built THEN the issue is listed inside the block', async () => {
  const out = statusText(await reg(rig({ [`${P_DIR}/a.md`]: '---\nwat: 1\n---\nA2' })), '++')

  expect(out, 'status').toBe(
    [
      '3 placeholders: type ++name in any prompt',
      FENCE,
      '++a       project         Architect',
      '++m       plugin          Manager mode',
      '++m.plan  plugin          Manager plan',
      '',
      'issues (1):',
      "  project/a.md: unknown key 'wat'",
      FENCE,
      'add or change: /placeholders <what you want>',
    ].join('\n'),
  )
})

test('GIVEN a custom prefix WHEN the status is built THEN the rows and the head use it', async () => {
  const out = statusText(await reg(rig({})), '@@')

  expect(out.split('\n').slice(0, 3), 'head and first row').toEqual(['3 placeholders: type @@name in any prompt', FENCE, '@@a       plugin          Architect'])
})

test('GIVEN a backtick run in the lines WHEN a block is built THEN the fence is longer than the run', async () => {
  expect(block('h', ['x ```` y'], ['f']), 'block').toBe(['h', '`````', 'x ```` y', '`````', 'f'].join('\n'))
})

// ---- hand-off text and tool descriptions

test('GIVEN a request WHEN the hand-off text is built THEN it is two short lines naming the request and the tools', async () => {
  expect(handoffText('I want one for release checklists', '++'), 'hand-off').toBe(
    `Placeholder helper. My request: <request>I want one for release checklists</request>\nUse the ${TOOL}* tools (list_placeholders first); a placeholder is inserted into prompts as ++name.`,
  )
})

test('GIVEN the tool specs WHEN listed THEN there are exactly the three names and the dialog rules sit in the save and remove descriptions', async () => {
  expect(
    [TOOLS.map((t) => t.name), TOOLS[1].description.includes('AskUserQuestion exactly once'), TOOLS[2].description.includes('AskUserQuestion exactly once')],
    'names and dialog rules',
  ).toEqual([['list_placeholders', 'save_placeholder', 'remove_placeholder'], true, true])
})

// ---- normalizeName, definitionFile

test('GIVEN names WHEN normalized THEN words, symbol runs and .plan stems pass lowercased, everything else is null', async () => {
  expect(['Rel_1', '+++', 'm.plan', '../x', 'a b', '', 'x'.repeat(33), '.plan'].map(normalizeName), 'normalized').toEqual(['rel_1', '+++', 'm.plan', null, null, null, null, null])
})

test('GIVEN a description with quotes and a plain text WHEN the file is built THEN front matter and body come back exactly', async () => {
  expect(definitionFile('Say "hi"', undefined, ' hello \n'), 'file').toBe('---\ndescription: "Say \\"hi\\""\n---\nhello\n')
})

test('GIVEN when plan WHEN the file is built THEN the when line follows the description', async () => {
  expect(definitionFile('d', 'plan', 'T'), 'file').toBe('---\ndescription: "d"\nwhen: plan\n---\nT\n')
})

test('GIVEN a fence marker or empty text WHEN the file is built THEN it is refused (a fence pair reads back as its inside)', async () => {
  expect([definitionFile('d', undefined, 'a\n```\nb\n```\nc'), definitionFile('d', undefined, '  ')], 'files').toEqual([null, null])
})

// ---- list tool

test('GIVEN the defaults WHEN the list tool runs THEN every placeholder prints with layer, when, description and body', async () => {
  const out = listTool(await reg(rig({})))

  expect(out, 'list').toEqual({
    text: '## a (layer: plugin, when: always) Architect\nARCH\n\n## m (layer: plugin, when: always) Manager mode\nMGR\n\n## m.plan (layer: plugin, when: plan) Manager plan\nMGR+PLAN',
    registry: null,
  })
})

// ---- save tool

test('GIVEN a new name WHEN save runs THEN the project file holds front matter and body and the registry knows it', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: '++Rel', description: 'Release checklist', text: 'Check the notes.' }, '++')

  expect([out.text, r.writes, out.registry?.defs.map((d) => d.name)], 'text, writes, names').toEqual([
    `saved ++rel (project): ${P_DIR}/rel.md`,
    [[`${P_DIR}/rel.md`, '---\ndescription: "Release checklist"\n---\nCheck the notes.\n']],
    ['a', 'm', 'm', 'rel'],
  ])
})

test('GIVEN scope global WHEN save runs THEN the file lands in the config dir', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'g1', description: 'd', text: 'T', scope: 'global' })

  expect([out.text, r.writes.map((w) => w[0])], 'text and paths').toEqual([`saved ++g1 (global): ${G_DIR}/g1.md`, [`${G_DIR}/g1.md`]])
})

test('GIVEN a plugin default WHEN save changes it THEN an own-layer override is written and wins', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'a', description: 'Architect v2', text: 'NEW ARCH' })

  expect([out.registry?.defs.find((d) => d.name === 'a'), out.registry?.sources.get('a')], 'effective def and layer').toEqual([
    { name: 'a', body: 'NEW ARCH', insert: 'context', when: 'always', order: 100, priority: 0, header: '', legacy: 'architect', description: 'Architect v2' },
    'project',
  ])
})

test('GIVEN a global file shadowed by a project file WHEN save --global runs THEN the note names the winning layer', async () => {
  const r = rig({ [`${P_DIR}/x.md`]: 'PX' })

  const out = await saveTool(r.io, ROOTS, { name: 'x', description: 'd', text: 'GX', scope: 'global' })

  expect(out.text, 'text').toBe(`saved ++x (global): ${G_DIR}/x.md; note: the project layer wins over global`)
})

test('GIVEN a plan stem WHEN save runs THEN the file is a plan-only variant of its base name', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'rel.plan', description: 'Plan release', text: 'PLAN IT' })

  expect(out.registry?.defs.find((d) => d.body === 'PLAN IT'), 'def').toEqual({ name: 'rel', body: 'PLAN IT', insert: 'context', when: 'plan', order: 100, priority: 0, header: '', description: 'Plan release' })
})

test('GIVEN bad input WHEN save runs THEN a readable error comes back and nothing is written', async () => {
  const r = rig({})
  const bad = [
    await saveTool(r.io, ROOTS, { name: '../x', description: 'd', text: 'T' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: '  ' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: '', text: 'T' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'T', scope: 'team' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'T', when: 'never' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'a\n```\nb\n```\nc' }),
    await saveTool(r.io, { pluginRoot: PLUG, configDir: CFG }, { name: 'ok', description: 'd', text: 'T' }),
  ]

  expect([bad.map((b) => b.text), bad.map((b) => b.isError), r.writes], 'errors, flags, writes').toEqual([
    [
      'bad name: use lowercase letters, digits, underscore (1-32) or punctuation only, optional .plan suffix',
      'text is empty',
      'description is empty',
      "scope must be 'project' or 'global'",
      "when must be 'always', 'plan' or 'not-plan'",
      'that text holds a ``` or ~~~ fence marker or opens with a --- line, which the definition format cannot carry',
      'no project root for this session',
    ],
    [true, true, true, true, true, true, true],
    [],
  ])
})

test('GIVEN an existing symlink or directory under the target name WHEN save runs THEN it is refused and nothing is written', async () => {
  const r = rig({ [`${P_DIR}/ln.md`]: { raw: 'L', isLink: true }, [`${P_DIR}/dr.md/inner.md`]: 'D' })

  const outs = [await saveTool(r.io, ROOTS, { name: 'ln', description: 'd', text: 'T' }), await saveTool(r.io, ROOTS, { name: 'DR', description: 'd', text: 'T' })]

  expect([outs.map((o) => o.text), outs.map((o) => o.isError), r.writes], 'texts, flags, writes').toEqual([
    [`refused, ${P_DIR}/ln.md is not a plain file`, `refused, ${P_DIR}/dr.md is not a plain file`],
    [true, true],
    [],
  ])
})

test('GIVEN a write that fails WHEN save runs THEN the failure text comes back and the registry stays null', async () => {
  const r = rig({})
  const broken: CmdIo = { ...r.io, write: async () => Promise.reject(new Error('EROFS')) }

  const out = await saveTool(broken, ROOTS, { name: 'x', description: 'd', text: 'T' })

  expect(out, 'result').toEqual({ text: 'failed: EROFS', registry: null, isError: true })
})

// ---- remove tool

test('GIVEN an own project file over a default WHEN remove runs THEN the file goes and the default serves again', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' })

  const out = await removeTool(r.io, ROOTS, { name: 'a' })

  expect([out.text, r.removed], 'text and removed').toEqual([`removed (project): ${P_DIR}/a.md; ++a is now served by the plugin layer`, [`${P_DIR}/a.md`]])
})

test('GIVEN a global own file WHEN remove runs with scope global THEN that file goes', async () => {
  const r = rig({ [`${G_DIR}/g.md`]: 'G' })

  const out = await removeTool(r.io, ROOTS, { name: '++g', scope: 'global' }, '++')

  expect([out.text, r.removed], 'text and removed').toEqual([`removed (global): ${G_DIR}/g.md; ++g is no longer defined`, [`${G_DIR}/g.md`]])
})

test('GIVEN a default, a legacy file, a higher layer and an unknown name WHEN remove runs THEN each is refused and nothing is removed', async () => {
  const r = rig({ [`${P_LEGACY}/full.md`]: 'L', [`${G_DIR}/a.md`]: 'GA' })
  const outs = [
    await removeTool(r.io, ROOTS, { name: 'm.plan' }),
    await removeTool(r.io, ROOTS, { name: 'm' }),
    await removeTool(r.io, ROOTS, { name: 'a' }),
    await removeTool(r.io, ROOTS, { name: 'nope' }),
    await removeTool(r.io, ROOTS, { name: 'x y' }),
  ]

  expect([outs.map((o) => o.text), r.removed], 'texts and removed').toEqual([
    ['refused, m.plan is a plugin default and has no project file', 'refused, m comes from a brewtools project-legacy file, which is never removed here', 'no project file for a; it comes from the global layer', "unknown placeholder 'nope'", 'bad name'],
    [],
  ])
})

test('GIVEN a real path outside the own dir or a symlink WHEN remove runs THEN it is refused and rm never runs', async () => {
  const tree = { [`${P_DIR}/a.md`]: 'MINE', [`${P_DIR}/b.md`]: 'B' }
  const escape = rig(tree, { real: { [`${P_DIR}/a.md`]: '/outside/a.md' } })
  const link = rig(tree, { links: [`${P_DIR}/b.md`] })

  const a = await removeTool(escape.io, ROOTS, { name: 'a' })
  const b = await removeTool(link.io, ROOTS, { name: 'b' })

  expect([a.text, b.text, escape.removed, link.removed], 'texts and removed').toEqual([`refused, ${P_DIR}/a.md is not a plain file inside ${P_DIR}`, `refused, ${P_DIR}/b.md is not a plain file inside ${P_DIR}`, [], []])
})

test('GIVEN an rm that exits non-zero WHEN remove runs THEN the failure text comes back', async () => {
  const r = rig({ [`${P_DIR}/a.md`]: 'MINE' }, { rmExit: 1, rmErr: 'busy\n' })

  const out = await removeTool(r.io, ROOTS, { name: 'a' })

  expect(out, 'result').toEqual({ text: 'rm failed (exit 1): busy', registry: null, isError: true })
})

// ---- through the hooks: registration, command.run, tool.call

const call = (args: string) => ({ command: 'placeholders', args, origin: { kind: 'composer' } as const, presentation: { isFullscreen: false, columns: 80 } })

type Ops = { cmds: unknown[]; tools: unknown[]; writes: [string, string][]; ran: string[][]; submits: unknown[]; fills: unknown[] }

function wireAll(on: Parameters<typeof wire>[0], tree: Tree, opts: { denyTools?: boolean; denySubmit?: boolean; fail?: 'exists' | 'env' } = {}): Ops {
  const fs = memFs(tree)
  const ops: Ops = { cmds: [], tools: [], writes: [], ran: [], submits: [], fills: [] }
  wire(on, { tree, ...(opts.fail === undefined ? {} : { fail: opts.fail }) })
  on('session.start', () => ({ cwd: ROOT }))
  on('command.register', (_$, e) => (ops.cmds.push(e), { value: { command: e.name } }) as never)
  on('tool.register', (_$, e) => {
    ops.tools.push(e)
    return (opts.denyTools === true ? { deny: 'no tools' } : { value: { tool: `${TOOL}${e.name}` } }) as never
  })
  on('fs.write', (_$, e) => {
    ops.writes.push([e.path, e.text])
    tree[e.path] = e.text
    return { value: undefined } as never
  })
  on('fs.stat', (_$, e) => {
    const isFile = e.path in tree
    const value = isFile || fs.exists(e.path) ? { kind: isFile ? 'file' : 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: e.path } : undefined
    return (value === undefined ? { deny: 'ENOENT' } : { value }) as never
  })
  on('process.run', (_$, e) => {
    ops.ran.push([...e.argv])
    delete tree[e.argv[2] ?? '']
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  // No bottom answers prompt.submit: the engine's refusal inside the hand-off.
  const submitBottoms = opts.denySubmit === true ? [] : [(e: { text: string; origin: unknown }) => (ops.submits.push({ text: e.text, origin: e.origin }), { text: e.text })]
  submitBottoms.forEach((bottom) => on('prompt.submit', (_$, e) => bottom(e)))
  on('prompt.fill', (_$, e) => {
    ops.fills.push(e)
    return { isFilled: true } as never
  })
  return ops
}

const boot = ($: any) => $.session.start({ cwd: ROOT, surface: null, isInteractive: false })
const lines = (t: string | undefined): string[] => (t ?? '').split('\n')

test('GIVEN a started session WHEN session.start runs THEN the command and the three tools are registered', async ($, on) => {
  const ops = wireAll(on, { ...defaults() })

  await boot($)

  expect([ops.cmds, ops.tools.map((t: any) => [t.name, t.isDeferred])], 'command and tools').toEqual([
    [{ name: 'placeholders', description: 'Show your placeholders; say what to add, change or remove', argumentHint: '[what you want]' }],
    [['list_placeholders', false], ['save_placeholder', false], ['remove_placeholder', false]],
  ])
})

test('GIVEN a tool registration that is refused WHEN session.start runs THEN the session still starts', async ($, on) => {
  wireAll(on, { ...defaults() }, { denyTools: true })

  const out = await boot($)

  expect(out, 'session.start result').toEqual({ cwd: ROOT })
})

test('GIVEN no args WHEN command.run runs THEN the status comes back and nothing is handed off', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() })
  await boot($)

  const out = await $.command.run(call(''))
  await clock.advance(1000)

  expect([lines(out.text)[0], ops.submits], 'head and submits').toEqual(['3 placeholders: type ++name in any prompt', []])
})

test('GIVEN a request WHEN command.run runs THEN the short ack with the status returns and the hand-off is submitted as the user after 250 ms', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() })
  await boot($)

  const out = await $.command.run(call('I want one for release checklists'))
  const before = ops.submits.length
  await clock.advance(250)

  expect([lines(out.text).slice(0, 2), before, ops.submits], 'ack, submits before, submits after').toEqual([
    ['asking Claude to help with your placeholder ...', '3 placeholders: type ++name in any prompt'],
    0,
    [{ text: handoffText('I want one for release checklists', '++'), origin: { kind: 'plugin', name: 'brewmod-placeholders', asUser: true } }],
  ])
})

test('GIVEN a text that starts with a removed subcommand WHEN command.run runs THEN it goes to the model too', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() })
  await boot($)

  await $.command.run(call('rm a'))
  await clock.advance(250)

  expect(ops.submits.map((s: any) => s.text), 'submitted').toEqual([handoffText('rm a', '++')])
})

test('GIVEN a submit that is refused WHEN the hand-off fires THEN the text is put into the prompt box instead', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() }, { denySubmit: true })
  await boot($)

  await $.command.run(call('x'))
  await clock.advance(250)

  expect(ops.fills, 'fills').toEqual([{ text: handoffText('x', '++'), mode: 'replace', origin: { kind: 'plugin', name: 'brewmod-placeholders' } }])
})

test('GIVEN no tools on this build WHEN command.run gets a request THEN the status and the version note come back and nothing is submitted', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() }, { denyTools: true })
  await boot($)

  const out = await $.command.run(call('I want one'))
  await clock.advance(1000)

  expect([lines(out.text).slice(-1), ops.submits], 'last line and submits').toEqual([[NEEDS_NEW_CC], []])
})

test('GIVEN the save tool called by the model WHEN the hook answers THEN the file is written, the text returns and the typeahead knows the name', async ($, on) => {
  const ops = wireAll(on, { ...defaults() })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  await boot($)
  const ask = () => ($.prompt as any).autocomplete({ text: '++fr', cursor: 4, token: '++fr', start: 0 })

  const before = await ask()
  const out = await $.tool.call({ tool: `${TOOL}save_placeholder`, name: 'fresh', description: 'Fresh one', text: 'hello there' } as never)
  const after = await ask()

  expect([before, out.text, ops.writes, after], 'typeahead before, text, writes, typeahead after').toEqual([
    { suggestions: [] },
    `saved ++fresh (project): ${P_DIR}/fresh.md`,
    [[`${P_DIR}/fresh.md`, '---\ndescription: "Fresh one"\n---\nhello there\n']],
    { suggestions: [{ text: '++fresh ', label: '++fresh', description: 'Fresh one' }] },
  ])
})

test('GIVEN the remove tool called by the model WHEN the file is inside the own dir THEN process.run gets rm with the resolved path', async ($, on) => {
  const ops = wireAll(on, { ...defaults(), [`${P_DIR}/a.md`]: 'MINE' })
  await boot($)

  const out = await $.tool.call({ tool: `${TOOL}remove_placeholder`, name: 'a' } as never)

  expect([out.text, ops.ran], 'text and argv').toEqual([`removed (project): ${P_DIR}/a.md; ++a is now served by the plugin layer`, [['rm', '--', `${P_DIR}/a.md`]]])
})

test('GIVEN the list tool called by the model WHEN the hook answers THEN the effective placeholders come back', async ($, on) => {
  wireAll(on, { ...defaults() })
  await boot($)

  const out = await $.tool.call({ tool: `${TOOL}list_placeholders` } as never)

  expect((out.text ?? '').split('\n\n')[0], 'first entry').toBe('## a (layer: plugin, when: always) Architect\nARCH')
})

test('GIVEN the file system denies a call WHEN command.run runs THEN the catch handler answers readable text', async ($, on) => {
  wireAll(on, { ...defaults() }, { fail: 'exists' })

  const out = await $.command.run(call(''))

  expect(out.text, 'failure text').toBe('failed: brewmod-placeholders: $.fs.exists: EACCES')
})
