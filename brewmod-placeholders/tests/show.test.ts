import { test, expect, mock } from 'claude-code/testing'
import { CFG, PLUG, ROOT, ROOTS, TOOL, boot, defaultsTree, memIo, run, wireAll, type Tree } from './layer-io'
import { bodyOf, golden } from './fixtures'
import { loadRegistry, newRegistryCache, type Registry } from '../hooks/lib/defs'
import { block } from '../hooks/lib/command'
import { compileMatchers } from '../hooks/lib/match'
import { fillText, fullText, helpText, parseArgs, queryNames, shownDirs, statusText, type Action } from '../hooks/lib/show'
import { isMenuOpen } from '../hooks/lib/editor'
import { DEFAULT_ENTRIES } from '../hooks/lib/editor-state'

const NAMES = ['m', 'a', 'r', 'rr', '+']
const DIRS = { global: '~/.claude/placeholders', project: '.claude/placeholders' }
const WIRED_DIRS = { global: `${CFG}/placeholders`, project: '.claude/placeholders' }
const P_DIR = `${ROOT}/.claude/placeholders`
const G_DIR = `${CFG}/placeholders`
// Frozen hook output (brewtools v6.7.0): what each built-in sends alone, per mode.
const spec = (id: string): string => golden(id) ?? `NULL ${id}`
const M_SENT = spec('spec-1')
const M_PLAN_SENT = spec('spec-2')
const A_SENT = spec('spec-3')
const R_SENT = spec('spec-4')
const RR_SENT = spec('spec-5')
const PLUS_SENT = spec('x07-cron-default')
const PLUS_ADD = bodyOf('+.plan')
const load = (tree: Tree): Promise<Registry> => loadRegistry(memIo(tree).io, ROOTS, newRegistryCache())
const heads = (text: string): string[] => text.split('\n').filter((l) => /^`[^`]/.test(l))

const STATUS_FOOT = [
  'Caret on a token: the band shows up to 15 rows of what it sends · whole text: `/placeholders show ++r`, or `++r?` alone + Enter twice · `/placeholders list` for all',
  'Send one message as typed: put `++/` anywhere in it',
  '`plan +`: its `<name>.plan.md` adds text in Plan mode; `<name>.md` is sent in every mode',
  'Add, change, remove: `/placeholders <your words>` in any language, e.g. `/placeholders add ++db: use the staging DB`',
  'Where: global = all projects (`~/.claude/placeholders`), project = this one (`.claude/placeholders`, wins over global); start with `global` or `project`, or just say it',
  'Commands (`list`, `show`, `help`) are only faster; plain words work too · full help: `/placeholders help`',
]

const LIST_DEFAULTS = [
  '5 placeholders · full text as sent · plan mode off',
  '`+++` · plugin · plan +',
  block('normal:', PLUS_SENT.split('\n')),
  block('plan mode adds:', PLUS_ADD.split('\n')),
  '`++a` · plugin',
  block('normal:', A_SENT.split('\n')),
  '`++m` · plugin · plan +',
  block('normal:', M_SENT.split('\n')),
  block('plan mode adds:', bodyOf('m.plan').split('\n')),
  '`++r` · plugin',
  block('normal:', R_SENT.split('\n')),
  '`++rr` · plugin',
  block('normal:', RR_SENT.split('\n')),
  'Add, change, remove: `/placeholders <your words>`',
].join('\n')

// ---- grammar

const CASES: [string, Action][] = [
  ['', { kind: 'status' }],
  ['  status ', { kind: 'status' }],
  ['статус', { kind: 'status' }],
  ['show', { kind: 'status' }],
  ['global', { kind: 'status' }],
  ['Project', { kind: 'status' }],
  ['help', { kind: 'help' }],
  ['?', { kind: 'help' }],
  ['--help', { kind: 'help' }],
  ['справка', { kind: 'help' }],
  ['помощь пожалуйста', { kind: 'help' }],
  ['list', { kind: 'list' }],
  ['ls', { kind: 'list' }],
  ['всё', { kind: 'list' }],
  ['покажи все', { kind: 'list' }],
  ['show all', { kind: 'list' }],
  ['список', { kind: 'list' }],
  ['show r m', { kind: 'show', names: ['r', 'm'] }],
  ['Show R', { kind: 'show', names: ['r'] }],
  ['show ++r ++m', { kind: 'show', names: ['r', 'm'] }],
  ['покажи мне ++m и ++r', { kind: 'show', names: ['m', 'r'] }],
  ['show me ++m and ++r', { kind: 'show', names: ['m', 'r'] }],
  ['выведи полностью ++r', { kind: 'show', names: ['r'] }],
  ['что такое ++rr?', { kind: 'show', names: ['rr'] }],
  ['what is r?', { kind: 'show', names: ['r'] }],
  ["what's ++a", { kind: 'show', names: ['a'] }],
  ['++r?', { kind: 'show', names: ['r'] }],
  ['a r', { kind: 'show', names: ['a', 'r'] }],
  ['show all ++r', { kind: 'show', names: ['r'] }],
  ['+++', { kind: 'show', names: ['+'] }],
  ['show ++zz', { kind: 'show', names: ['zz'] }],
  ['сделай ++r короче', { kind: 'claude', request: 'сделай ++r короче', scope: null }],
  ['покажи и измени ++r', { kind: 'claude', request: 'покажи и измени ++r', scope: null }],
  ['rm a', { kind: 'claude', request: 'rm a', scope: null }],
  ['global add ++db: use staging', { kind: 'claude', request: 'global add ++db: use staging', scope: 'global' }],
  ['project make ++r shorter', { kind: 'claude', request: 'project make ++r shorter', scope: 'project' }],
  ['what can you do', { kind: 'claude', request: 'what can you do', scope: null }],
  ['++r show me the diff', { kind: 'claude', request: '++r show me the diff', scope: null }],
  ['объясни разницу между ++r и ++rr', { kind: 'claude', request: 'объясни разницу между ++r и ++rr', scope: null }],
  ['help ++r', { kind: 'claude', request: 'help ++r', scope: null }],
  ['show zz', { kind: 'claude', request: 'show zz', scope: null }],
]

test('GIVEN RU and EN wordings WHEN /placeholders args are parsed THEN each lands on its grammar row', async () => {
  expect(CASES.map(([args]) => [args, parseArgs(args, '++', NAMES)]), 'actions').toEqual(CASES)
})

test('GIVEN a custom prefix WHEN args are parsed THEN its tokens are shown and ++ is an unknown word', async () => {
  expect([parseArgs('show @@r', '@@', NAMES), parseArgs('show ++r', '@@', NAMES)], 'actions').toEqual([
    { kind: 'show', names: ['r'] },
    { kind: 'claude', request: 'show ++r', scope: null },
  ])
})

test('GIVEN user names that are cue words WHEN show takes them bare or prefixed THEN bare ones turn into other commands and prefixed ones show', async () => {
  const names = ['fix', 'docs', 'all', 'it', '!']

  expect(names.map((n) => [n, parseArgs(`show ${n}`, '++', names).kind, parseArgs(`show ++${n}`, '++', names).kind]), 'kinds').toEqual([
    ['fix', 'claude', 'show'],
    ['docs', 'help', 'show'],
    ['all', 'list', 'show'],
    ['it', 'status', 'show'],
    ['!', 'status', 'show'],
  ])
})

// ---- P1: a prompt of only `++name?` items

test('GIVEN prompts WHEN checked for query-only items THEN only ++name? items, spaces and commas count', async () => {
  const ms = compileMatchers('++', NAMES)
  const texts = ['++r?', '++r? ++m?', '++r?, ++m?', '  ++r?  ', '++r? ++r?', '++zz?', '+++?', 'check ++r?', '++r', '++r? please', '++r ++m?', '++r??', '', '?', 'should I use ++rr?']

  expect(texts.map((t) => [t, queryNames(ms, t)]), 'names').toEqual([
    ['++r?', ['r']],
    ['++r? ++m?', ['r', 'm']],
    ['++r?, ++m?', ['r', 'm']],
    ['  ++r?  ', ['r']],
    ['++r? ++r?', ['r']],
    ['++zz?', ['zz']],
    ['+++?', ['+']],
    ['check ++r?', null],
    ['++r', null],
    ['++r? please', null],
    ['++r ++m?', null],
    ['++r??', null],
    ['', null],
    ['?', null],
    ['should I use ++rr?', null],
  ])
})

// ---- dirs, status, help

test('GIVEN config dirs under and outside HOME WHEN shown THEN HOME becomes ~ and the project dir is relative', async () => {
  expect(
    [
      shownDirs({ pluginRoot: PLUG, configDir: '/Users/x/.claude-d' }, '/Users/x'),
      shownDirs({ pluginRoot: PLUG, configDir: '/Users/x/.claude-d' }, '/Users/x/'),
      shownDirs({ pluginRoot: PLUG, configDir: '/cfg' }, '/home/u'),
      shownDirs({ pluginRoot: PLUG }, '/home/u'),
    ],
    'dirs',
  ).toEqual([
    { global: '~/.claude-d/placeholders', project: '.claude/placeholders' },
    { global: '~/.claude-d/placeholders', project: '.claude/placeholders' },
    { global: '/cfg/placeholders', project: '.claude/placeholders' },
    { global: '(no config dir)', project: '.claude/placeholders' },
  ])
})

test('GIVEN the plugin defaults WHEN the status is built THEN one row per name carries its plan tag and the foot names every way to the full text', async () => {
  const out = statusText(await load(defaultsTree()), '++', DIRS)

  expect(out.split('\n'), 'status').toEqual([
    '5 placeholders · type ++name anywhere in a prompt',
    '```',
    '+++   plugin  plan +  Anti-drift cron for the current task; plan mode plans it as a step',
    '++a   plugin          Architecture-first: delegate the design to expert agents before implementing',
    '++m   plugin  plan +  Manager mode: orchestrate and delegate, never code in the main context',
    '++r   plugin          Two-phase review: review every significant change, then double-check each finding',
    '++rr  plugin          Anti-regression review: regression, project standard and functional correctness axes',
    '```',
    ...STATUS_FOOT,
  ])
})

test('GIVEN user layers, a plan part from another layer and a bad key WHEN the status is built THEN each name shows its own layers and the issue sits inside the block', async () => {
  const tree: Tree = {
    ...defaultsTree(),
    [`${P_DIR}/rel.md`]: '---\ndescription: "Release checklist"\n---\nCHECK',
    [`${P_DIR}/bad.md`]: '---\nwat: 1\n---\nB',
    [`${G_DIR}/a.md`]: '---\ndescription: "My architect"\n---\nMINE',
    [`${G_DIR}/m.plan.md`]: '---\nplan: add\n---\nOTHER',
  }

  const out = statusText(await load(tree), '++', DIRS)

  expect(out.split('\n').slice(0, 13), 'rows and issues').toEqual([
    '7 placeholders · type ++name anywhere in a prompt',
    '```',
    '+++    plugin   plan +           Anti-drift cron for the current task; plan mode plans it as a step',
    '++a    global                    My architect',
    '++bad  project                   -',
    '++m    plugin   plan + (global)  Manager mode: orchestrate and delegate, never code in the main context',
    '++r    plugin                    Two-phase review: review every significant change, then double-check each finding',
    '++rel  project                   Release checklist',
    '++rr   plugin                    Anti-regression review: regression, project standard and functional correctness axes',
    '',
    'issues (1):',
    "  project/bad.md: unknown key 'wat'",
    '```',
  ])
})

test('GIVEN old when:, plan: and orphan plan files WHEN the status is built THEN one warning per file sits in the issues block', async () => {
  const tree: Tree = {
    ...defaultsTree(),
    [`${P_DIR}/wp.md`]: '---\nwhen: plan\n---\nWP',
    [`${P_DIR}/pk.md`]: '---\nplan: add\n---\nPK',
    [`${P_DIR}/db.md`]: 'DB',
    [`${P_DIR}/db.plan.md`]: '---\nwhen: plan\n---\nSTEPS',
    [`${G_DIR}/solo.plan.md`]: '---\nplan: add\n---\nSOLO',
  }

  const out = statusText(await load(tree), '++', DIRS).split('\n')

  expect(out.slice(out.indexOf('') + 1, out.indexOf('```', 2)), 'issues').toEqual([
    'issues (4):',
    '  project/db.plan.md: no plan: add; its text is added in plan mode',
    '  project/pk.md: plan: is for pk.plan.md; ignored',
    '  project/wp.md: when: plan is gone; sent in every mode',
    '  global/solo.plan.md: no solo.md; sent in every mode',
  ])
})

test('GIVEN the default prefix WHEN the help is built THEN every topic line and both doc links come back', async () => {
  expect(helpText('++', DIRS).split('\n'), 'help').toEqual([
    'placeholders help · a placeholder is a short token (++name) that adds saved text to your prompt',
    'Use: type `++m` anywhere in a prompt; Tab completes; the band above the prompt shows what each token sends.',
    'Caret on a token (arrows, Home, End): the band shows up to 15 rows of what it sends; `?` right after the token only makes room for those rows while the name menu is open.',
    'Whole text, printed in the chat, not sent to Claude: `/placeholders show ++r` (several: `/placeholders show ++r ++m`) · or `++r?` alone in a message: Enter fills that command, Enter again prints it · all: `/placeholders list`.',
    'Send as typed: `++/` (or `++\\`) anywhere in a message turns every placeholder in it off; the marker stays in the text.',
    'Plan mode: `<name>.md` is sent in every mode; an optional `<name>.plan.md` (`plan: add`) adds its text in Plan mode (`++m`, `+++`), marked `plan +`. One review per message: `++rr` wins over `++r`.',
    'Add, change, remove: `/placeholders <your words, any language>`; Claude drafts, asks once, saves. E.g. `/placeholders add ++db: use the staging DB` · `/placeholders global make ++r shorter` · `/placeholders удали ++db` · `/placeholders add a plan-mode part to ++db: plan first, then build`.',
    'Remove: `/placeholders remove ++db` (both parts) · `/placeholders удали план у ++db` (plan part only) · removing your override brings the built-in back; built-ins cannot be removed.',
    'Where: global = all projects, `~/.claude/placeholders/<name>.md`; project = this project, `.claude/placeholders/<name>.md`, wins over global; plugin defaults sit below both. A first word `global` or `project` decides, else your words do; unclear -> one question, Global first. A change keeps its layer; a remove asks when the name is in both.',
    'Files: `<name>.md` = optional front matter (description, insert: context|inline, order, group, priority, header) + the text; `<name>.plan.md` = its Plan mode addition. Edit by hand any time; the next prompt reads it.',
    'Prefix: `/config` -> Placeholder prefix (2-8 punctuation characters, default `++`).',
    'Commands: `/placeholders` status · `list` · `show ++<name> ...` · `help` · anything else goes to Claude. Commands are shortcuts; plain words work too.',
    'Docs: https://doc-claude.brewcode.app/mods/placeholders/',
    'README: https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-placeholders',
  ])
})

test('GIVEN a custom prefix WHEN the help is built THEN tokens use it and ++ stays only as the stated default', async () => {
  const out = helpText('@@', DIRS)

  expect({ head: out.split('\n')[0], plusRuns: out.split('++').length - 1 }, 'custom prefix').toEqual({
    head: 'placeholders help · a placeholder is a short token (@@name) that adds saved text to your prompt',
    plusRuns: 1,
  })
})

// ---- show and list

test('GIVEN a context placeholder WHEN shown THEN its header and body come back in one fence under normal:', async () => {
  const out = fullText(await load(defaultsTree()), ['r'], '++', false)

  expect(out, 'show r').toBe(['++r · full text as sent · plan mode off', '`++r` · plugin', block('normal:', R_SENT.split('\n'))].join('\n'))
})

test('GIVEN ++m with an added plan-mode part WHEN shown in plan mode THEN one fence holds what plan mode sends: the plan header, the normal body and the part', async () => {
  const out = fullText(await load(defaultsTree()), ['m'], '++', true)

  expect(out, 'show m in plan mode').toBe(['++m · full text as sent · plan mode on', '`++m` · plugin · plan +', block('normal + plan mode part:', M_PLAN_SENT.split('\n'))].join('\n'))
})

test('GIVEN a normal text and an added part that fit alone but not joined WHEN shown in both modes THEN the cut note follows the joined length', async () => {
  const reg = await load({
    ...defaultsTree(),
    [`${P_DIR}/big.md`]: `---\ndescription: "Big"\n---\n${'x'.repeat(5000)}`,
    [`${P_DIR}/big.plan.md`]: `---\nwhen: plan\nplan: add\n---\n${'y'.repeat(5000)}`,
  })

  const outs = { off: fullText(reg, ['big'], '++', false), on: fullText(reg, ['big'], '++', true) }

  expect(outs, 'cut notes').toEqual({
    off: ['++big · full text as sent · plan mode off', '`++big` · project · plan +', block('normal:', ['x'.repeat(5000)]), block('plan mode adds: (cut at 9000 chars when sent)', ['y'.repeat(5000)])].join('\n'),
    on: ['++big · full text as sent · plan mode on', '`++big` · project · plan +', block('normal + plan mode part: (cut at 9000 chars when sent)', ['x'.repeat(5000), '', 'y'.repeat(5000)])].join('\n'),
  })
})

test('GIVEN +++ and an old full-text m.plan override WHEN shown THEN each prints its normal text and its plan-mode addition', async () => {
  const reg = await load({ ...defaultsTree(), [`${G_DIR}/m.plan.md`]: 'OTHER' })

  const out = fullText(reg, ['+', 'm'], '++', false)

  expect(out, 'show + m').toBe(
    [
      '+++, ++m · full text as sent · plan mode off',
      '`+++` · plugin · plan +',
      block('normal:', PLUS_SENT.split('\n')),
      block('plan mode adds:', PLUS_ADD.split('\n')),
      '`++m` · plugin · plan + (global)',
      block('normal:', M_SENT.split('\n')),
      block('plan mode adds:', ['OTHER']),
    ].join('\n'),
  )
})

test('GIVEN inline, empty, oversized and unknown names WHEN shown THEN each gets its label and the unknown one the names hint', async () => {
  const reg = await load({
    ...defaultsTree(),
    [`${P_DIR}/sig.md`]: '---\ninsert: inline\n---\nSIGNED',
    [`${P_DIR}/e.md`]: '---\ndescription: "E"\n---\n',
    [`${P_DIR}/big.md`]: `---\ndescription: "Big"\n---\n${'x'.repeat(9001)}`,
  })

  const out = fullText(reg, ['sig', 'e', 'big', 'zz'], '++', false)

  expect(out, 'show').toBe(
    [
      '++sig, ++e, ++big, ++zz · full text as sent · plan mode off',
      '`++sig` · project · inline',
      block('replaces the token with:', ['SIGNED']),
      '`++e` · project',
      'normal: (empty, sends nothing)',
      '`++big` · project',
      block('normal: (cut at 9000 chars when sent)', ['x'.repeat(9001)]),
      'unknown: `++zz` · names: /placeholders list',
    ].join('\n'),
  )
})

test('GIVEN an inline def with a stale when: plan and an empty inline def WHEN shown THEN the first replaces the token and the empty one stays as typed', async () => {
  const reg = await load({ ...defaultsTree(), [`${P_DIR}/pl.md`]: '---\ninsert: inline\nwhen: plan\n---\nPLANTEXT', [`${P_DIR}/em.md`]: '---\ninsert: inline\n---\n' })

  const out = fullText(reg, ['pl', 'em'], '++', true)

  expect(out, 'show pl em').toBe(
    ['++pl, ++em · full text as sent · plan mode on', '`++pl` · project · inline', block('replaces the token with:', ['PLANTEXT']), '`++em` · project · inline', 'stays as typed (empty)'].join('\n'),
  )
})

test('GIVEN the defaults WHEN listed THEN every name gets its full text in name order and the foot says how to change them', async () => {
  expect(fullText(await load(defaultsTree()), null, '++', false), 'list').toBe(LIST_DEFAULTS)
})

// ---- through the hooks

const submit = ($: any, text: string, kind = 'composer', extra: object = {}) => $.prompt.submit({ text, origin: { kind }, wait: false, ...extra } as never)

test('GIVEN /placeholders show r WHEN it runs THEN the full text answers at once and nothing reaches Claude', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, defaultsTree())
  await boot($)

  const out = await run($, 'show r')
  await clock.advance(1000)

  expect({ text: out.text, submits: ops.submits.map((x) => x.text) }, 'show r').toEqual({
    text: ['++r · full text as sent · plan mode off', '`++r` · plugin', block('normal:', R_SENT.split('\n'))].join('\n'),
    submits: [],
  })
})

test('GIVEN RU and EN show wordings WHEN /placeholders runs THEN each prints its names at once with no hand-off', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, defaultsTree())
  await boot($)

  const outs = [await run($, 'покажи мне ++m и ++r'), await run($, 'show me ++m and ++r'), await run($, 'выведи полностью ++r')]
  await clock.advance(1000)

  expect({ heads: outs.map((o: any) => [o.text.split('\n')[0], ...heads(o.text)]), submits: ops.submits.map((x) => x.text) }, 'shows').toEqual({
    heads: [
      ['++m, ++r · full text as sent · plan mode off', '`++m` · plugin · plan +', '`++r` · plugin'],
      ['++m, ++r · full text as sent · plan mode off', '`++m` · plugin · plan +', '`++r` · plugin'],
      ['++r · full text as sent · plan mode off', '`++r` · plugin'],
    ],
    submits: [],
  })
})

test('GIVEN help, list and no args WHEN /placeholders runs THEN help, the full list and the status answer with the real config dir', async ($, on) => {
  wireAll(on, defaultsTree())
  await boot($)

  const [help, list, status] = [await run($, 'help'), await run($, 'list'), await run($, '')]

  expect({ help: help.text, list: list.text, status: status.text.split('\n').slice(-2, -1) }, 'answers').toEqual({
    help: helpText('++', WIRED_DIRS),
    list: LIST_DEFAULTS,
    status: ['Where: global = all projects (`/cfg/placeholders`), project = this one (`.claude/placeholders`, wins over global); start with `global` or `project`, or just say it'],
  })
})

test('GIVEN the placeholders_help tool WHEN the model calls it THEN the help text is the result', async ($, on) => {
  wireAll(on, defaultsTree())
  await boot($)

  const out = await $.tool.call({ tool: `${TOOL}placeholders_help` } as never)

  expect(out, 'tool result').toEqual({ result: helpText('++', WIRED_DIRS), text: helpText('++', WIRED_DIRS) })
})

test('GIVEN a typed prompt of only ++r? ++m? WHEN it is submitted THEN it is dropped, nothing reaches Claude and the box gets the show command with a trailing space', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, defaultsTree())
  await boot($)

  const out = await submit($, '++r? ++m?')
  await clock.advance(1)

  expect({ out, submits: ops.submits.map((x) => x.text), fills: ops.fills, runs: ops.runs }, 'P1').toEqual({
    out: { drop: '++r? ++m? = /placeholders show ++r ++m · not sent to Claude · press Enter to print it' },
    submits: [],
    fills: [{ text: '/placeholders show ++r ++m ', mode: 'replace', origin: { kind: 'plugin', name: 'brewmod-placeholders' } }],
    runs: [],
  })
})

test('GIVEN the P1 fill and the same line typed by hand WHEN the name menu is checked at the end of each THEN only the hand-typed token opens it', async () => {
  const filled = fillText('++', ['r'])
  const typedLines = ['/placeholders show ++', '/placeholders show ++r']

  expect({ filled, fillMenu: isMenuOpen('++', filled, filled.length, DEFAULT_ENTRIES), typedMenus: typedLines.map((t) => isMenuOpen('++', t, t.length, DEFAULT_ENTRIES)) }, 'menu after fill vs typed').toEqual({
    filled: '/placeholders show ++r ',
    fillMenu: false,
    typedMenus: [true, true],
  })
})

test('GIVEN user names that are cue words WHEN ++fix? ++all? ++!? is submitted and the filled line runs THEN the fill carries prefixed tokens and prints those three', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, {
    ...defaultsTree(),
    [`${P_DIR}/fix.md`]: '---\ndescription: "Fix"\n---\nFIX',
    [`${P_DIR}/all.md`]: '---\ndescription: "All"\n---\nALL',
    [`${P_DIR}/!.md`]: '---\ndescription: "Bang"\n---\nBANG',
  })
  await boot($)

  const out = await submit($, '++fix? ++all? ++!?')
  await clock.advance(1)
  const fill = (ops.fills[0] as { text: string }).text
  const shown = await run($, fill.slice('/placeholders '.length))
  await clock.advance(1000)

  expect({ out, fill, shown: shown.text, submits: ops.submits.map((x) => x.text) }, 'prefixed fill').toEqual({
    out: { drop: '++fix? ++all? ++!? = /placeholders show ++fix ++all ++! · not sent to Claude · press Enter to print it' },
    fill: '/placeholders show ++fix ++all ++! ',
    shown: ['++fix, ++all, ++! · full text as sent · plan mode off', '`++fix` · project', block('normal:', ['FIX']), '`++all` · project', block('normal:', ['ALL']), '`++!` · project', block('normal:', ['BANG'])].join('\n'),
    submits: [],
  })
})

test('GIVEN a question around a token, an escaped query, a bridge query and a query with an image WHEN submitted THEN each is sent as typed and the box is left alone', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, defaultsTree())
  await boot($)

  const outs = [
    await submit($, 'should I use ++rr?'),
    await submit($, '++/ ++r?'),
    await submit($, '++r?', 'bridge'),
    await submit($, '++m?', 'composer', { attachments: [{ type: 'image', mediaType: 'image/png' }] }),
  ]
  await clock.advance(1)

  expect({ outs, submits: ops.submits.map((x) => x.text), fills: ops.fills }, 'not intercepted').toEqual({
    outs: [{ text: 'should I use ++rr?' }, { text: '++/ ++r?' }, { text: '++r?' }, { text: '++m?' }],
    submits: ['should I use ++rr?', '++/ ++r?', '++r?', '++m?'],
    fills: [],
  })
})

test('GIVEN a build without the model tools WHEN ++r? alone is submitted THEN it is sent as typed and nothing is filled', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const ops = wireAll(on, defaultsTree(), { denyTools: true })
  await boot($)

  const out = await submit($, '++r?')
  await clock.advance(1)

  expect({ out, submits: ops.submits.map((x) => x.text), fills: ops.fills }, 'old build').toEqual({ out: { text: '++r?' }, submits: ['++r?'], fills: [] })
})

test('GIVEN a build without the mod tools WHEN status and help are built THEN neither offers the ++r? hand-off, only the show command', async () => {
  const status = statusText(await load(defaultsTree()), '++', DIRS, false).split('\n')
  const help = helpText('++', DIRS, false).split('\n')

  expect([status[status.length - 6], help[3]], 'whole-text lines').toEqual([
    'Caret on a token: the band shows up to 15 rows of what it sends · whole text: `/placeholders show ++r` · `/placeholders list` for all',
    'Whole text, printed in the chat, not sent to Claude: `/placeholders show ++r` (several: `/placeholders show ++r ++m`) · all: `/placeholders list`.',
  ])
})

test('GIVEN a build without the model tools WHEN /placeholders and /placeholders help run THEN both texts equal the no-hand-off variants', async ($, on) => {
  wireAll(on, defaultsTree(), { denyTools: true })
  await boot($)

  const [status, help] = [(await run($, '')).text, (await run($, 'help')).text]

  expect({ status, help }, 'whole status and help texts, no hand-off').toEqual({
    status: statusText(await load(defaultsTree()), '++', WIRED_DIRS, false),
    help: helpText('++', WIRED_DIRS, false),
  })
})
