import { test, expect, mock } from 'claude-code/testing'
import { block, definitionFile, handoffText, listTool, normalizeName, removeTool, saveTool, type CmdIo } from '../hooks/lib/command'
import { CFG, PLUG, ROOT, ROOTS, TOOL, boot, cmdRig, regOf, run, wireAll, type Rig, type RigOpts, type Tree } from './layer-io'

const P_DIR = `${ROOT}/.claude/placeholders`
const G_DIR = `${CFG}/placeholders`
const P_LEGACY = `${ROOT}/.claude/brewtools/manager/prompts`

const fm = (fields: string, body: string): string => `---\n${fields}\n---\n${body}`
const defaults = (): Tree => ({
  [`${PLUG}/placeholders/m.md`]: fm('name: "m"\ndescription: "Manager mode"\nlegacy: full', 'MGR'),
  [`${PLUG}/placeholders/m.plan.md`]: fm('name: "m"\ndescription: "Manager plan"\nwhen: plan\nlegacy: planmode', 'MGR+PLAN'),
  [`${PLUG}/placeholders/a.md`]: fm('name: "a"\ndescription: "Architect"\nlegacy: architect', 'ARCH'),
})

// The command tests' small defaults (m, its plan part, a) under the extra files.
const rig = (extra: Tree, opts: RigOpts = {}): Rig => cmdRig({ ...defaults(), ...extra }, opts)

// ---- block

test('GIVEN a backtick run in the lines WHEN a block is built THEN the fence is longer than the run', async () => {
  expect(block('h', ['x ```` y'], ['f']), 'block').toBe(['h', '`````', 'x ```` y', '`````', 'f'].join('\n'))
})

// ---- hand-off text and tool descriptions

test('GIVEN a request without a scope WHEN the hand-off text is built THEN it is four short lines naming the request, the ask-first rule, the scope rule and the tools', async () => {
  expect(handoffText('I want one for release checklists', '++'), 'hand-off').toBe(
    `Placeholder helper. My request: <request>I want one for release checklists</request>\nAsk first: no save_placeholder or remove_placeholder call before I answered your one AskUserQuestion about that exact change in this turn, even if my request is explicit (only a remove of a name with files: none skips it).\nScope: not given; infer it from my words outside the placeholder text, else ask "Where to save?" in the same dialog, Global first; a change keeps its layer, a remove uses the layer that holds it.\nUse the ${TOOL}* tools (list_placeholders first); a placeholder is inserted into prompts as ++name (not in this message: ++/).`,
  )
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

test('GIVEN the defaults WHEN the list tool runs THEN one entry per name prints layer, files, when, plan kind, description, text and plan-mode text', async () => {
  const r = rig({})

  const out = await listTool(r.io, ROOTS, await regOf(r), '++')

  expect(out, 'list').toEqual({
    text: '## ++a · layer: plugin · files: none · when: always · plan: none · Architect\nARCH\n\n## ++m · layer: plugin · files: none · when: always · plan: replace · Manager mode\nMGR\n### plan mode sends instead · layer: plugin\nMGR+PLAN',
    registry: null,
  })
})

// ---- save tool

test('GIVEN a new name WHEN save runs THEN the project file holds front matter and body and the registry knows it', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: '++Rel', description: 'Release checklist', text: 'Check the notes.', scope: 'project' }, '++')

  expect([out.text, r.writes, out.registry?.defs.map((d) => d.name)], 'text, writes, names').toEqual([
    'saved ++rel (project): .claude/placeholders/rel.md',
    [[`${P_DIR}/rel.md`, '---\ndescription: "Release checklist"\n---\nCheck the notes.\n']],
    ['a', 'm', 'm', 'rel'],
  ])
})

test('GIVEN a plugin default WHEN save changes it THEN an own-layer override is written and wins', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'a', description: 'Architect v2', text: 'NEW ARCH', scope: 'project' })

  expect([out.registry?.defs.find((d) => d.name === 'a'), out.registry?.sources.get('a')], 'effective def and layer').toEqual([
    { name: 'a', body: 'NEW ARCH', insert: 'context', when: 'always', order: 100, priority: 0, header: '', legacy: 'architect', description: 'Architect v2' },
    'project',
  ])
})

test('GIVEN a global file shadowed by a project file WHEN save runs with scope global THEN the note names the winning layer', async () => {
  const r = rig({ [`${P_DIR}/x.md`]: 'PX' })

  const out = await saveTool(r.io, ROOTS, { name: 'x', description: 'd', text: 'GX', scope: 'global' })

  expect(out.text, 'text').toBe(`saved ++x (global): ${G_DIR}/x.md; note: the project layer wins over global`)
})

test('GIVEN a plan stem WHEN save runs THEN the file is a plan-only variant of its base name', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'rel.plan', description: 'Plan release', text: 'PLAN IT', scope: 'project' })

  expect(out.registry?.defs.find((d) => d.body === 'PLAN IT'), 'def').toEqual({ name: 'rel', body: 'PLAN IT', insert: 'context', when: 'plan', order: 100, priority: 0, header: '', description: 'Plan release' })
})

test('GIVEN bad input WHEN save runs THEN a readable error comes back and nothing is written', async () => {
  const r = rig({})
  const bad = [
    await saveTool(r.io, ROOTS, { name: '../x', description: 'd', text: 'T', scope: 'project' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: '  ', scope: 'project' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: '', text: 'T', scope: 'project' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'T', scope: 'team' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'T', when: 'never', scope: 'project' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'a\n```\nb\n```\nc', scope: 'project' }),
    await saveTool(r.io, { pluginRoot: PLUG, configDir: CFG }, { name: 'ok', description: 'd', text: 'T', scope: 'project' }),
    await saveTool(r.io, ROOTS, { name: 'ok', description: 'd', text: 'T' }),
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
      "scope is required: 'global' or 'project'",
    ],
    [true, true, true, true, true, true, true, true],
    [],
  ])
})

test('GIVEN roots without a config dir WHEN save runs with scope global THEN it is refused and nothing is written', async () => {
  const r = rig({})

  const out = await saveTool(r.io, { pluginRoot: PLUG, root: ROOT }, { name: 'ok', description: 'd', text: 'T', scope: 'global' })

  expect({ out, writes: r.writes }, 'result and writes').toEqual({ out: { text: 'no config directory (CLAUDE_CONFIG_DIR and HOME are unset)', registry: null, isError: true }, writes: [] })
})

test('GIVEN an existing symlink or directory under the target name WHEN save runs THEN it is refused and nothing is written', async () => {
  const r = rig({ [`${P_DIR}/ln.md`]: { raw: 'L', isLink: true }, [`${P_DIR}/dr.md/inner.md`]: 'D' })

  const outs = [await saveTool(r.io, ROOTS, { name: 'ln', description: 'd', text: 'T', scope: 'project' }), await saveTool(r.io, ROOTS, { name: 'DR', description: 'd', text: 'T', scope: 'project' })]

  expect([outs.map((o) => o.text), outs.map((o) => o.isError), r.writes], 'texts, flags, writes').toEqual([
    [`refused, ${P_DIR}/ln.md is not a plain file`, `refused, ${P_DIR}/dr.md is not a plain file`],
    [true, true],
    [],
  ])
})

test('GIVEN a write that fails WHEN save runs THEN the failure text comes back and the registry stays null', async () => {
  const r = rig({})
  const broken: CmdIo = { ...r.io, write: async () => Promise.reject(new Error('EROFS')) }

  const out = await saveTool(broken, ROOTS, { name: 'x', description: 'd', text: 'T', scope: 'project' })

  expect(out, 'result').toEqual({ text: 'failed: EROFS', registry: null, isError: true })
})

// ---- remove tool

test('GIVEN a global own file WHEN remove runs with scope global THEN that file goes', async () => {
  const r = rig({ [`${G_DIR}/g.md`]: 'G' })

  const out = await removeTool(r.io, ROOTS, { name: '++g', scope: 'global' }, '++')

  expect([out.text, r.removed], 'text and removed').toEqual([`removed ++g (global): ${G_DIR}/g.md · ++g is no longer defined`, [`${G_DIR}/g.md`]])
})

test('GIVEN a default, a legacy file, a file in the other layer and an unknown name WHEN remove runs THEN each is refused and nothing is removed', async () => {
  const r = rig({ [`${P_LEGACY}/full.md`]: 'L', [`${G_DIR}/a.md`]: 'GA' })
  const outs = [
    await removeTool(r.io, ROOTS, { name: 'm.plan' }),
    await removeTool(r.io, ROOTS, { name: 'm' }),
    await removeTool(r.io, ROOTS, { name: 'a', scope: 'project' }),
    await removeTool(r.io, ROOTS, { name: 'nope' }),
    await removeTool(r.io, ROOTS, { name: 'x y' }),
  ]

  expect([outs.map((o) => o.text), r.removed], 'texts and removed').toEqual([
    [
      '++m is built in and cannot be removed · change what it sends: /placeholders change ++m ...',
      `++m comes from a brewtools file (${P_LEGACY}/full.md) · delete it by hand if you no longer need it`,
      '++a has no project file; it is in the global layer',
      'unknown placeholder ++nope',
      'bad name',
    ],
    [],
  ])
})

test('GIVEN both parts in project WHEN remove runs with part normal THEN only the normal file goes and the plan-mode part stays', async () => {
  const r = rig({ [`${P_DIR}/db.md`]: 'DB', [`${P_DIR}/db.plan.md`]: fm('when: plan\nplan: add', 'STEPS') })

  const out = await removeTool(r.io, ROOTS, { name: 'db', part: 'normal' })

  expect({ text: out.text, removed: r.removed }, 'text and removed').toEqual({
    text: 'removed ++db (project): .claude/placeholders/db.md · ++db keeps only its plan-mode part',
    removed: [`${P_DIR}/db.md`],
  })
})

test('GIVEN an invalid part or scope WHEN remove runs THEN each is refused with its own text and nothing is removed', async () => {
  const r = rig({ [`${P_DIR}/db.md`]: 'DB' })

  const outs = [await removeTool(r.io, ROOTS, { name: 'db', part: 'both' }), await removeTool(r.io, ROOTS, { name: 'db', scope: 'team' })]

  expect({ outs, removed: r.removed }, 'results and removed').toEqual({
    outs: [
      { text: "part must be 'all', 'normal' or 'plan'", registry: null, isError: true },
      { text: "scope must be 'project' or 'global'", registry: null, isError: true },
    ],
    removed: [],
  })
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

const lines = (t: string | undefined): string[] => (t ?? '').split('\n')

test('GIVEN a started session WHEN session.start runs THEN the command and the four tools are registered', async ($, on) => {
  const ops = wireAll(on, { ...defaults() })

  await boot($)

  expect([ops.cmds, ops.tools.map((t: any) => [t.name, t.isDeferred])], 'command and tools').toEqual([
    [{ name: 'placeholders', description: 'Show, list or explain your placeholders; or say in any words what to add, change or remove', argumentHint: '[show ++<names> | list | help | any words]' }],
    [['list_placeholders', false], ['save_placeholder', false], ['remove_placeholder', false], ['placeholders_help', false]],
  ])
})

test('GIVEN prefix @@ WHEN session.start registers the command and the tools THEN every token they name uses @@ and none uses ++', { options: { prefix: '@@' } }, async ($, on) => {
  const ops = wireAll(on, { ...defaults() })

  await boot($)

  expect(
    {
      hint: (ops.cmds[0] as any)?.argumentHint,
      counts: ops.tools.map((t: any) => [t.name, t.description.split('++').length - 1, t.description.split('@@').length - 1]),
      questions: ops.tools.map((t: any) => t.description.match(/"Save \S+ as drafted\?"/)?.[0] ?? null),
    },
    'prefixed specs',
  ).toEqual({
    hint: '[show @@<names> | list | help | any words]',
    counts: [['list_placeholders', 0, 1], ['save_placeholder', 0, 3], ['remove_placeholder', 0, 4], ['placeholders_help', 0, 4]],
    questions: [null, '"Save @@<name> as drafted?"', null, null],
  })
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

  const out = await run($, '')
  await clock.advance(1000)

  expect([lines(out.text)[0], ops.submits], 'head and submits').toEqual(['2 placeholders · type ++name anywhere in a prompt', []])
})

test('GIVEN a request WHEN command.run runs THEN the short ack with the status returns and the hand-off is submitted as the user after 250 ms', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() })
  await boot($)

  const out = await run($, 'I want one for release checklists')
  const before = ops.submits.length
  await clock.advance(250)

  expect([lines(out.text).slice(0, 2), before, ops.submits], 'ack, submits before, submits after').toEqual([
    ['asking Claude to help with your placeholder ...', '2 placeholders · type ++name anywhere in a prompt'],
    0,
    [{ text: handoffText('I want one for release checklists', '++'), origin: { kind: 'plugin', name: 'brewmod-placeholders', asUser: true } }],
  ])
})

test('GIVEN a text that starts with a removed subcommand WHEN command.run runs THEN it goes to the model too', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() })
  await boot($)

  await run($, 'rm a')
  await clock.advance(250)

  expect(ops.submits.map((s: any) => s.text), 'submitted').toEqual([handoffText('rm a', '++')])
})

test('GIVEN a submit that is refused WHEN the hand-off fires THEN the text is put into the prompt box instead', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() }, { denySubmit: true })
  await boot($)

  await run($, 'x')
  await clock.advance(250)

  expect(ops.fills, 'fills').toEqual([{ text: handoffText('x', '++'), mode: 'replace', origin: { kind: 'plugin', name: 'brewmod-placeholders' } }])
})

test('GIVEN no tools on this build WHEN command.run gets a request THEN the status and the version note come back and nothing is submitted', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, { ...defaults() }, { denyTools: true })
  await boot($)

  const out = await run($, 'I want one')
  await clock.advance(1000)

  expect([lines(out.text).slice(-1), ops.submits], 'last line and submits').toEqual([['needs Claude Code 2.1.300+ for the dialog'], []])
})

test('GIVEN the save tool called by the model WHEN the hook answers THEN the file is written, the text returns and the typeahead knows the name', async ($, on) => {
  const ops = wireAll(on, { ...defaults() })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  await boot($)
  const ask = () => ($.prompt as any).autocomplete({ text: '++fr', cursor: 4, token: '++fr', start: 0 })

  const before = await ask()
  const out = await $.tool.call({ tool: `${TOOL}save_placeholder`, name: 'fresh', description: 'Fresh one', text: 'hello there', scope: 'project' } as never)
  const after = await ask()

  expect([before, out.text, ops.writes, after], 'typeahead before, text, writes, typeahead after').toEqual([
    { suggestions: [] },
    'saved ++fresh (project): .claude/placeholders/fresh.md',
    [[`${P_DIR}/fresh.md`, '---\ndescription: "Fresh one"\n---\nhello there\n']],
    { suggestions: [{ text: '++fresh ', label: '++fresh', description: 'Fresh one' }] },
  ])
})

test('GIVEN the config dir under HOME WHEN the model saves global and project and removes the global one THEN the lines show ~ and the project-relative path, the files use absolute ones', async ($, on) => {
  const ops = wireAll(on, { ...defaults() }, { env: { HOME: '/home/u' } })
  await boot($)
  const tool = (name: string, input: object) => $.tool.call({ tool: `${TOOL}${name}`, ...input } as never)

  const texts = [
    (await tool('save_placeholder', { name: 'db', description: 'Staging DB', text: 'use the staging DB', scope: 'global' })).text,
    (await tool('save_placeholder', { name: 'lint', description: 'Lint first', text: 'run the linter', scope: 'project' })).text,
    (await tool('remove_placeholder', { name: 'db' })).text,
  ]

  expect({ texts, writes: ops.writes.map((w) => w[0]), ran: ops.ran }, 'shown and real paths').toEqual({
    texts: [
      'saved ++db (global): ~/.claude/placeholders/db.md',
      'saved ++lint (project): .claude/placeholders/lint.md',
      'removed ++db (global): ~/.claude/placeholders/db.md · ++db is no longer defined',
    ],
    writes: ['/home/u/.claude/placeholders/db.md', `${P_DIR}/lint.md`],
    ran: [['rm', '--', '/home/u/.claude/placeholders/db.md']],
  })
})

test('GIVEN the list tool called by the model WHEN the hook answers THEN the effective placeholders come back', async ($, on) => {
  wireAll(on, { ...defaults() })
  await boot($)

  const out = await $.tool.call({ tool: `${TOOL}list_placeholders` } as never)

  expect((out.text ?? '').split('\n\n')[0], 'first entry').toBe('## ++a · layer: plugin · files: none · when: always · plan: none · Architect\nARCH')
})

test('GIVEN the file system denies a call WHEN command.run runs THEN the catch handler answers readable text', async ($, on) => {
  wireAll(on, { ...defaults() }, { fail: 'exists' })

  const out = await run($, '')

  expect(out.text, 'failure text').toBe('failed: brewmod-placeholders: $.fs.exists: EACCES')
})
