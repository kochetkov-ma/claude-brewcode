import { test, expect, mock } from 'claude-code/testing'
import { handoffText, listTool, removeTool, saveTool } from '../hooks/lib/command'
import { loadRegistry, newRegistryCache, type Roots } from '../hooks/lib/defs'
import { injectedContext, planParts, sentText } from '../hooks/lib/sent'
import { CFG, PLUG, ROOT, ROOTS, TOOL, boot, cmdRig, defaultsTree, regOf, run, wireAll, type Rig, type Tree } from './layer-io'
import { bodyOf } from './fixtures'

const P_DIR = `${ROOT}/.claude/placeholders`
const G_DIR = `${CFG}/placeholders`
const G_LEGACY = `${CFG}/manager/prompts`
const fm = (fields: string, body: string): string => `---\n${fields}\n---\n${body}\n`
const DB = fm('description: "Staging DB"', 'GLOBAL DB')
const DB_PLAN = fm('description: "Staging DB"\nplan: add', 'LIST STEPS')
const M_BODY = bodyOf('m')
const ASK_FIRST_LINE = 'Ask first: no save_placeholder or remove_placeholder call before I answered your one AskUserQuestion about that exact change in this turn, even if my request is explicit (only a remove of a name with files: none skips it).'
const NO_SCOPE_LINE = 'Scope: not given; infer it from my words outside the placeholder text, else ask "Where to save?" in the same dialog, Global first; a change keeps its layer, a remove uses the layer that holds it.'
const TOOLS_LINE = `Use the ${TOOL}* tools (list_placeholders first); a placeholder is inserted into prompts as ++name (not in this message: ++/).`

// The real defaults under the extra files.
const rig = (extra: Tree): Rig => cmdRig({ ...defaultsTree(), ...extra })

// ---- hand-off

test('GIVEN a hand-off naming user and built-in tokens WHEN the prompt hook reads it THEN nothing is injected and an @@ prefix escapes with @@/', async () => {
  const r = rig({ [`${G_DIR}/ship.md`]: DB })
  const defs = (await regOf(r)).defs

  expect(
    { plain: injectedContext(defs, '++', handoffText('remove the plan part of ++ship and ++r', '++'), 'default'), plan: injectedContext(defs, '++', handoffText('удали ++m', '++', 'global'), 'plan'), at: handoffText('x', '@@').split('\n')[3] },
    'escaped hand-off',
  ).toEqual({ plain: '', plan: '', at: `Use the ${TOOL}* tools (list_placeholders first); a placeholder is inserted into prompts as @@name (not in this message: @@/).` })
})

test('GIVEN a first word global, project or none WHEN /placeholders hands off THEN the ask-first line comes before the scope line that follows that word', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, defaultsTree())
  await boot($)

  for (const args of ['global add ++db: always use the staging DB', 'project add ++lint: run npm run lint first', 'add ++db2: use the replica']) {
    await run($, args)
    await clock.advance(250)
  }

  expect(ops.submits.map((x) => x.text), 'hand-offs').toEqual([
    `Placeholder helper. My request: <request>global add ++db: always use the staging DB</request>\n${ASK_FIRST_LINE}\nScope: global (I said it; skip only the Where question).\n${TOOLS_LINE}`,
    `Placeholder helper. My request: <request>project add ++lint: run npm run lint first</request>\n${ASK_FIRST_LINE}\nScope: project (I said it; skip only the Where question).\n${TOOLS_LINE}`,
    `Placeholder helper. My request: <request>add ++db2: use the replica</request>\n${ASK_FIRST_LINE}\n${NO_SCOPE_LINE}\n${TOOLS_LINE}`,
  ])
})

const SAVE_DESCRIPTION =
  "Never call this tool before the user answered your one AskUserQuestion about this exact save in this turn, even when the request is explicit. Create or change a placeholder file; never use Write. Call list_placeholders first. name: lowercase letters, digits, underscore, no prefix. text: the user's words verbatim when given, else your draft; a change starts from its text in list_placeholders. planText: a plan-mode part, added to the text only in Plan mode (file <name>.plan.md); draft one only when the user mentions plan mode (plan, plan mode, planning, план, планир, режим плана) or the name already has one. A change picks the part by words: plan part, plan mode, план, в режиме плана -> planText only; normal, обычн, основн -> text only; both, оба -> both; else text. An omitted part stays as it is. scope (required): a first word global or project wins; else infer it only from the words outside the placeholder's own text (global: global, everywhere, all projects, глобально, везде, во всех проектах; project: project, this project, here, this repo, в проекте, здесь, локально); a change keeps its layer from list_placeholders (global-legacy = global, project-legacy = project). That one AskUserQuestion call holds these questions in this order: 1. header \"Placeholder\", question exactly \"Save ++<name> as drafted?\" (never a layer in it) with the text, options \"Save as drafted (Recommended)\" / \"Change it\" (Other = a different name or text; apply it and save without asking again). 2. Only with a plan-mode part: header \"Plan mode\", question \"Add this plan-mode part to ++<name>?\", the draft as the first option's preview, options \"Add it (Recommended)\" / \"No plan part\". 3. Only when the scope is unclear (no word, or a new override of a plugin default): header \"Where\", question \"Where to save ++<name>?\", options \"Global (Recommended)\" (all your projects) then \"Project\" (only this project; wins over global). Only with no AskUserQuestion tool at all: save as drafted, scope global unless a word outside the text says project. Then say where it was saved."
const REMOVE_DESCRIPTION =
  "Never call this tool before the user answered your one AskUserQuestion about this exact removal in this turn, even when the request is explicit; only a name with files: none in list_placeholders skips the question (a plugin default or legacy brewtools file: nothing is removed; relay the result). Remove a placeholder file from the global or project layer; never use Bash rm. The wording is free (remove, delete, drop, удали, убери, сотри). Call list_placeholders first. part: all (default; <name>.md and <name>.plan.md), plan (the plan-mode part only: plan part, plan mode, план, в режиме плана), normal (the normal text only). scope: a first word global or project wins; else omit it and the tool takes the one layer holding the file. Question 1, header \"Remove\": \"Remove ++<name> (<layer>)?\", options \"Remove it (Recommended)\" / \"Keep it\"; when it has a plan-mode part and no part was named: \"Remove ++<name> (<layer>)? It has a plan-mode part.\", options \"Both parts (Recommended)\" / \"Only the plan-mode part\" / \"Keep it\"; when the plan part was named: \"Remove the plan-mode part of ++<name> (<layer>)?\", options \"Remove it (Recommended)\" / \"Keep it\". When list_placeholders shows files in both layers and no scope was given, add question 2 in the same call: header \"Where\", \"Remove ++<name> from where?\", options \"Global\" / \"Project\". Then say what is served afterwards (the result says it)."

test('GIVEN the tools registered at session start WHEN their specs are read THEN save requires scope, has planText, remove has part and both descriptions read exactly as pinned', async ($, on) => {
  const ops = wireAll(on, defaultsTree())
  await boot($)
  const save = ops.tools.find((t) => t.name === 'save_placeholder')
  const remove = ops.tools.find((t) => t.name === 'remove_placeholder')

  expect(
    {
      saveRequired: save?.inputSchema.required,
      saveProps: Object.keys(save?.inputSchema.properties ?? {}),
      scopeEnum: save?.inputSchema.properties.scope.enum,
      removeRequired: remove?.inputSchema.required,
      partEnum: remove?.inputSchema.properties.part.enum,
      save: save?.description,
      remove: remove?.description,
    },
    'specs',
  ).toEqual({
    saveRequired: ['name', 'description', 'scope'],
    saveProps: ['name', 'description', 'text', 'planText', 'scope'],
    scopeEnum: ['global', 'project'],
    removeRequired: ['name'],
    partEnum: ['all', 'normal', 'plan'],
    save: SAVE_DESCRIPTION,
    remove: REMOVE_DESCRIPTION,
  })
})

test('GIVEN no scope WHEN the model calls save_placeholder THEN it is refused and nothing is written', async ($, on) => {
  const ops = wireAll(on, defaultsTree())
  await boot($)

  const out = await $.tool.call({ tool: `${TOOL}save_placeholder`, name: 'db', description: 'Staging DB', text: 'use staging' } as never)

  expect({ out, writes: ops.writes }, 'refused').toEqual({ out: { result: "scope is required: 'global' or 'project'", text: "scope is required: 'global' or 'project'", isError: true }, writes: [] })
})

// ---- save

test('GIVEN scope global and scope project WHEN save runs THEN each file lands in its own layer dir', async () => {
  const r = rig({})

  const outs = [
    await saveTool(r.io, ROOTS, { name: 'db', description: 'Staging DB', text: 'always use the staging DB', scope: 'global' }),
    await saveTool(r.io, ROOTS, { name: 'lint', description: 'Lint first', text: 'run npm run lint first', scope: 'project' }),
  ]

  expect({ texts: outs.map((o) => o.text), writes: r.writes }, 'saved').toEqual({
    texts: [`saved ++db (global): ${G_DIR}/db.md`, 'saved ++lint (project): .claude/placeholders/lint.md'],
    writes: [
      [`${G_DIR}/db.md`, fm('description: "Staging DB"', 'always use the staging DB')],
      [`${P_DIR}/lint.md`, fm('description: "Lint first"', 'run npm run lint first')],
    ],
  })
})

test('GIVEN a new name with a plan-mode part WHEN save runs THEN both files are written and plan mode sends the text plus the part', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'ship', description: 'Ship it', text: 'run the tests', planText: 'also list the release steps', scope: 'global' })
  const defs = out.registry?.defs ?? []

  expect(
    { text: out.text, writes: r.writes, normal: sentText('ship', defs, '++', false).text, plan: sentText('ship', defs, '++', true).text },
    'saved with part',
  ).toEqual({
    text: `saved ++ship (global): ${G_DIR}/ship.md, ${G_DIR}/ship.plan.md`,
    writes: [
      [`${G_DIR}/ship.md`, fm('description: "Ship it"', 'run the tests')],
      [`${G_DIR}/ship.plan.md`, fm('description: "Ship it"\nplan: add', 'also list the release steps')],
    ],
    normal: 'run the tests',
    plan: 'run the tests\n\nalso list the release steps',
  })
})

test('GIVEN an existing global name WHEN save gets only planText THEN only the plan file is written and the normal text stays', async () => {
  const r = rig({ [`${G_DIR}/db.md`]: DB })

  const out = await saveTool(r.io, ROOTS, { name: 'db', description: 'Staging DB', planText: 'LIST STEPS', scope: 'global' })

  expect({ text: out.text, writes: r.writes, plan: sentText('db', out.registry?.defs ?? [], '++', true).text }, 'plan part only').toEqual({
    text: `saved the plan-mode part of ++db (global): ${G_DIR}/db.plan.md`,
    writes: [[`${G_DIR}/db.plan.md`, DB_PLAN]],
    plan: 'GLOBAL DB\n\nLIST STEPS',
  })
})

test('GIVEN the built-in ++m WHEN save changes only its plan part in global THEN plan mode keeps the built-in header and normal text and adds the new part', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: 'm', description: 'Manager plan', planText: 'NEW PLAN PART', scope: 'global' })

  expect({ text: out.text, plan: sentText('m', out.registry?.defs ?? [], '++', true).text }, 'm plan part').toEqual({
    text: `saved the plan-mode part of ++m (global): ${G_DIR}/m.plan.md`,
    plan: `User typed \`++m\` — Manager + Plan Mode is active for this turn:\n\n${M_BODY}\n\nNEW PLAN PART`,
  })
})

test('GIVEN a plan part for an unknown name, a .plan name, an empty text or an inline base WHEN save runs THEN each is refused and nothing is written', async () => {
  const r = rig({ [`${G_DIR}/il.md`]: fm('description: "il"\ninsert: inline', 'IL') })

  const outs = [
    await saveTool(r.io, ROOTS, { name: 'nope', description: 'd', planText: 'P', scope: 'global' }),
    await saveTool(r.io, ROOTS, { name: 'x.plan', description: 'd', text: 'T', planText: 'P', scope: 'global' }),
    await saveTool(r.io, ROOTS, { name: 'x', description: 'd', text: ' ', planText: '', scope: 'global' }),
    await saveTool(r.io, ROOTS, { name: 'il', description: 'd', planText: 'P', scope: 'global' }),
    await saveTool(r.io, ROOTS, { name: 'il', description: 'd', text: 'T', planText: 'P', scope: 'project' }),
  ]

  expect({ texts: outs.map((o) => o.text), errors: outs.map((o) => o.isError), writes: r.writes }, 'refused').toEqual({
    texts: [
      '++nope has no text yet: send text too',
      'planText needs the name without .plan',
      'text is empty',
      'a plan-mode part needs a normal text that is not inline',
      'a plan-mode part needs a normal text that is not inline',
    ],
    errors: [true, true, true, true, true],
    writes: [],
  })
})

test('GIVEN a global text with a stale when: not-plan WHEN a project save brings text, a plan-mode part and a stale when THEN no file carries when and plan mode adds the part', async () => {
  const r = rig({ [`${G_DIR}/db.md`]: fm('description: "Staging DB"\nwhen: not-plan', 'GLOBAL DB') })

  const out = await saveTool(r.io, ROOTS, { name: 'db', description: 'Project DB', text: 'PROJECT DB', planText: 'plan the migration', when: 'plan', scope: 'project' } as never)
  const defs = out.registry?.defs ?? []

  expect({ text: out.text, writes: r.writes, kind: planParts(defs, 'db').kind, plan: injectedContext(defs, '++', 'go ++db', 'plan') }, 'no when').toEqual({
    text: 'saved ++db (project): .claude/placeholders/db.md, .claude/placeholders/db.plan.md',
    writes: [
      [`${P_DIR}/db.md`, fm('description: "Project DB"', 'PROJECT DB')],
      [`${P_DIR}/db.plan.md`, fm('description: "Project DB"\nplan: add', 'plan the migration')],
    ],
    kind: 'add',
    plan: 'PROJECT DB\n\nplan the migration',
  })
})

test('GIVEN the built-in +++ WHEN save overrides its text in global with a stale when THEN the file has no when and default mode sends it under the built-in header', async () => {
  const r = rig({})

  const out = await saveTool(r.io, ROOTS, { name: '+', description: 'Cron always', when: 'always', text: 'plan the cron', scope: 'global' } as never)

  expect({ text: out.text, writes: r.writes, sent: injectedContext(out.registry?.defs ?? [], '++', 'go +++', 'default') }, 'override').toEqual({
    text: `saved +++ (global): ${G_DIR}/+.md`,
    writes: [[`${G_DIR}/+.md`, fm('description: "Cron always"', 'plan the cron')]],
    sent: 'User typed `+++` — Anti-drift cron is active for this turn:\n\nplan the cron',
  })
})

// ---- remove

test('GIVEN both parts only in global WHEN the model removes without a scope THEN both files go from global and the name is gone', async ($, on) => {
  const ops = wireAll(on, { ...defaultsTree(), [`${G_DIR}/ship.md`]: DB, [`${G_DIR}/ship.plan.md`]: DB_PLAN })
  await boot($)

  const out = await $.tool.call({ tool: `${TOOL}remove_placeholder`, name: 'ship' } as never)

  expect({ text: out.text, ran: ops.ran }, 'removed').toEqual({
    text: `removed ++ship (global): ${G_DIR}/ship.md, ${G_DIR}/ship.plan.md · ++ship is no longer defined`,
    ran: [['rm', '--', `${G_DIR}/ship.md`], ['rm', '--', `${G_DIR}/ship.plan.md`]],
  })
})

test('GIVEN a name in both layers WHEN remove runs without a scope, then with project THEN it first asks where, then removes the project file and the global one serves', async () => {
  const r = rig({ [`${G_DIR}/two.md`]: DB, [`${P_DIR}/two.md`]: DB })

  const first = await removeTool(r.io, ROOTS, { name: 'two' })
  const removedBefore = [...r.removed]
  const second = await removeTool(r.io, ROOTS, { name: '++two', scope: 'project' })

  expect({ first, removedBefore, second: second.text, removed: r.removed }, 'both layers').toEqual({
    first: { text: '++two is in both layers (global and project): ask "Remove ++two from where?" (Global / Project), then call remove_placeholder again with scope', registry: null, isError: true },
    removedBefore: [],
    second: 'removed ++two (project): .claude/placeholders/two.md · the global ++two is served now',
    removed: [`${P_DIR}/two.md`],
  })
})

test('GIVEN a name with a plan part WHEN remove runs with part plan or the name.plan THEN only the plan file goes and the normal text stays', async () => {
  const a = rig({ [`${G_DIR}/db.md`]: DB, [`${G_DIR}/db.plan.md`]: DB_PLAN })
  const b = rig({ [`${G_DIR}/db.md`]: DB, [`${G_DIR}/db.plan.md`]: DB_PLAN })

  const texts = [(await removeTool(a.io, ROOTS, { name: 'db', part: 'plan' })).text, (await removeTool(b.io, ROOTS, { name: 'db.plan' })).text]

  expect({ texts, removed: [a.removed, b.removed] }, 'plan part').toEqual({
    texts: Array(2).fill(`removed the plan-mode part of ++db (global): ${G_DIR}/db.plan.md · ++db keeps its normal text`),
    removed: [[`${G_DIR}/db.plan.md`], [`${G_DIR}/db.plan.md`]],
  })
})

test('GIVEN user overrides of built-ins WHEN they are removed THEN the built-in text or plan part is back', async () => {
  const r = rig({ [`${P_DIR}/r.md`]: 'MY R', [`${G_DIR}/m.plan.md`]: fm('description: "M plan"\nwhen: plan\nplan: add', 'MY PLAN') })

  const texts = [(await removeTool(r.io, ROOTS, { name: 'r' })).text, (await removeTool(r.io, ROOTS, { name: 'm', part: 'plan' })).text]

  expect(texts, 'built-ins back').toEqual([
    'removed ++r (project): .claude/placeholders/r.md · the built-in ++r is back',
    `removed the plan-mode part of ++m (global): ${G_DIR}/m.plan.md · the built-in plan-mode part of ++m is back`,
  ])
})

test('GIVEN a built-in, a legacy brewtools file and a name without a plan part WHEN remove runs THEN each is refused with its own text and nothing goes', async () => {
  const r = rig({ [`${G_LEGACY}/architect.md`]: 'OLD ARCH', [`${G_DIR}/db.md`]: DB })

  const outs = [await removeTool(r.io, ROOTS, { name: '++r' }, '++'), await removeTool(r.io, ROOTS, { name: 'a' }), await removeTool(r.io, ROOTS, { name: 'db', part: 'plan' })]

  expect({ texts: outs.map((o) => o.text), errors: outs.map((o) => o.isError), removed: r.removed }, 'refused').toEqual({
    texts: [
      '++r is built in and cannot be removed · change what it sends: /placeholders change ++r ...',
      `++a comes from a brewtools file (${G_LEGACY}/architect.md) · delete it by hand if you no longer need it`,
      '++db has no plan-mode part',
    ],
    errors: [true, true, true],
    removed: [],
  })
})

// ---- list

test('GIVEN a name with files in both layers and a global plan part WHEN the list tool runs THEN its entry shows both layers, the plan kind and both texts', async () => {
  const r = rig({ [`${G_DIR}/db.md`]: DB, [`${G_DIR}/db.plan.md`]: DB_PLAN, [`${P_DIR}/db.md`]: fm('description: "Project DB"', 'PROJECT DB') })

  const out = await listTool(r.io, ROOTS, await regOf(r), '++')

  expect(out.text.split('\n\n').find((e) => e.startsWith('## ++db')), 'db entry').toBe(
    '## ++db · layer: project · files: global (db.md, db.plan.md), project (db.md) · plan: add · Project DB\nPROJECT DB\n### plan mode adds · layer: global\nLIST STEPS',
  )
})

test('GIVEN claude launched in HOME so the project dir is the global one WHEN list, save with scope project and remove run THEN it is one global layer: no project row, no wins note, no Where question', async () => {
  const roots: Roots = { pluginRoot: PLUG, root: '/home/u', configDir: '/home/u/.claude' }
  const r = rig({ '/home/u/.claude/placeholders/db.md': DB })

  const list = await listTool(r.io, roots, await loadRegistry(r.io, roots, newRegistryCache()), '++')
  const saved = await saveTool(r.io, roots, { name: 'db', description: 'Staging DB', text: 'NEW DB', scope: 'project' }, '++', '/home/u')
  const removed = await removeTool(r.io, roots, { name: 'db' }, '++', '/home/u')

  expect(
    { entry: list.text.split('\n\n').find((e) => e.startsWith('## ++db')), saved: saved.text, removed: removed.text, writes: r.writes, rm: r.removed },
    'one layer',
  ).toEqual({
    entry: '## ++db · layer: global · files: global (db.md) · plan: none · Staging DB\nGLOBAL DB',
    saved: 'saved ++db (global): ~/.claude/placeholders/db.md',
    removed: 'removed ++db (global): ~/.claude/placeholders/db.md · ++db is no longer defined',
    writes: [['/home/u/.claude/placeholders/db.md', fm('description: "Staging DB"', 'NEW DB')]],
    rm: ['/home/u/.claude/placeholders/db.md'],
  })
})
