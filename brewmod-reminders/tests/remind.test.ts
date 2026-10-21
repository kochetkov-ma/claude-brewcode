// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-21T14:00:00Z')
const ROOT = '/proj'
const CFG = '/cfg'
const SID = 'sess-1'
const TOOL = 'mcp__brewmod-reminders__'
const P_DIR = `${ROOT}/.claude/scheduled`
const G_DIR = `${CFG}/reminders`
const ENGINE = { type: 'engine', ref: 0 } as const

type Tree = Record<string, string>
const item = (due: string, title: string, status = 'pending', extra = ''): string => `due: ${due}\nstatus: ${status}\n${extra}\n${title}\n`

// Stubs beneath the mod: an in-memory file system over `tree`, fixed env and session, recorders for toasts, tools, command, submits.
function wire(on: On, tree: Tree) {
  const live = { root: ROOT, sid: SID }
  const ops = { vars: {} as Record<string, string>, live, writes: [] as [string, string][], toasts: [] as string[], tools: [] as string[], cmds: [] as unknown[], submits: [] as string[] }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_$, e) => ({ value: e.path in tree || Object.keys(tree).some((k) => k.startsWith(`${e.path}/`)) }) as never)
  on('fs.list', (_$, e) => {
    const names = new Map<string, string>()
    for (const k of Object.keys(tree)) {
      if (!k.startsWith(`${e.path}/`)) continue
      const rest = k.slice(e.path!.length + 1)
      names.set(rest.split('/')[0]!, rest.includes('/') ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) } as never
  })
  on('fs.read', (_$, e) => (e.path in tree ? { value: tree[e.path] } : { deny: 'ENOENT' }) as never)
  on('fs.write', (_$, e) => {
    ops.writes.push([e.path, e.text])
    tree[e.path] = e.text
    return { value: undefined } as never
  })
  const vars = ops.vars
  Object.assign(vars, { CLAUDE_CONFIG_DIR: CFG, HOME: '/home/u', TZ: 'Europe/Lisbon' })
  on('env.get', (_$, e) => ({ value: vars[e.name] }) as never)
  on('session.root', () => ({ value: live.root }) as never)
  on('session.id', () => ({ value: live.sid }) as never)
  on('ui.toast', (_$, e) => (ops.toasts.push(e.text), { value: undefined }) as never)
  on('command.register', (_$, e) => (ops.cmds.push(e), { value: { command: e.name } }) as never)
  on('tool.register', (_$, e) => (ops.tools.push(e.name), { value: { tool: `${TOOL}${e.name}` } }) as never)
  on('prompt.submit', (_$, e) => (ops.submits.push(e.text), { text: e.text }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.fill', () => ({ isFilled: true }) as never)
  on('ui.render', () => ENGINE as never)
  return ops
}

const start = ($: any, isInteractive = true) => $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive })
const remind = ($: any, args: string) => $.command.run({ command: 'remind', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)
const tool = ($: any, name: string, input: object) => $.tool.call({ tool: `${TOOL}${name}`, ...input } as never)

const HOTFIX = `${P_DIR}/20261021-0803_hotfix.md`
const LATER = `${P_DIR}/20261023-0800_later.md`
const GLOBAL = `${G_DIR}/20261022-0800_g.md`
const OLD = `${P_DIR}/20261020-0900_old.md`

test('GIVEN an interactive start WHEN session.start runs THEN the command, the three tools and the session state file are exact', async ($, on) => {
  mock.clock(on, { now: NOW })
  const tree: Tree = {}
  const ops = wire(on, tree)

  await start($)

  const state = Object.entries(tree).filter(([k]) => k.endsWith(`/.state/session-${SID}.json`)).map(([, v]) => v)
  expect({ cmd: (ops.cmds[0] as { name: string }).name, tools: ops.tools, state }, 'registrations and state').toEqual({
    cmd: 'remind',
    tools: ['list_reminders', 'add_reminder', 'update_reminder'],
    state: [`{"isInteractive":true,"ts":${NOW}}`],
  })
})

const gclaim = (session: string, at: number): string => JSON.stringify({ session, at })
type Run = ($: any) => Promise<{ text?: string; isError?: boolean }>
const NOW_LINE = 'Now: Wed 21 Oct 15:00 Lisbon (14:00 UTC)'
const WHERE = `project ${P_DIR} | global ${G_DIR}`
const L_HOT = '- 20261021-0803_hotfix | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago | Post-hotfix prod check'
const L_G = '- 20261022-0800_g (global) | Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | Global thing'
const L_RUN = '- 20261022-1000_run | Thu 22 Oct 11:00 Lisbon (10:00 UTC), in 20 h | Run task | running in session other since Wed 21 Oct 14:00 Lisbon (13:00 UTC), 1 h ago'
const L_LATER = '- 20261023-0800_later | Fri 23 Oct 09:00 Lisbon (08:00 UTC), in 42 h | Rotate keys'
const L_OLD = '- 20261020-0900_old | Tue 20 Oct 10:00 Lisbon (09:00 UTC), 29 h ago | Old task | done 2026-10-20T10:00:00Z | ok'
const NONE_ACTIVE = `No active reminders (none due); /remind show all lists the upcoming ones. ${WHERE}`
const shows: { name: string; run: Run; text: string }[] = [
  { name: '/remind', run: ($) => remind($, ''), text: [NOW_LINE, 'Active (1):', L_HOT, WHERE].join('\n') },
  { name: '/remind show active', run: ($) => remind($, 'show active'), text: [NOW_LINE, 'Active (1):', L_HOT, WHERE].join('\n') },
  { name: '/remind show (state omitted)', run: ($) => remind($, 'show'), text: [NOW_LINE, 'Active (1):', L_HOT, WHERE].join('\n') },
  { name: '/remind show all', run: ($) => remind($, 'show all'), text: [NOW_LINE, 'Open (4):', L_HOT, L_G, L_RUN, L_LATER, WHERE].join('\n') },
  { name: '/remind list (alias of show all)', run: ($) => remind($, 'list'), text: [NOW_LINE, 'Open (4):', L_HOT, L_G, L_RUN, L_LATER, WHERE].join('\n') },
  { name: '/remind show all global week', run: ($) => remind($, 'show all global week'), text: [NOW_LINE, 'Open (1):', L_G, WHERE].join('\n') },
  { name: '/remind show all project tomorrow', run: ($) => remind($, 'show all project tomorrow'), text: [NOW_LINE, 'Open (1):', L_RUN, WHERE].join('\n') },
  { name: '/remind show all +1d', run: ($) => remind($, 'show all +1d'), text: [NOW_LINE, 'Open (2):', L_G, L_RUN, WHERE].join('\n') },
  { name: '/remind show all until 2026-10-22', run: ($) => remind($, 'show all until 2026-10-22'), text: [NOW_LINE, 'Open (2):', L_G, L_RUN, WHERE].join('\n') },
  { name: '/remind show active global', run: ($) => remind($, 'show active global'), text: NONE_ACTIVE },
  { name: '/remind show done', run: ($) => remind($, 'show done'), text: [NOW_LINE, 'Done (last 10) (1):', L_OLD, WHERE].join('\n') },
  { name: 'list_reminders {scope project, from week}', run: ($) => tool($, 'list_reminders', { scope: 'project', from: 'week' }), text: [NOW_LINE, 'Open (2):', L_RUN, L_LATER, WHERE].join('\n') },
  { name: 'list_reminders {state active}', run: ($) => tool($, 'list_reminders', { state: 'active' }), text: [NOW_LINE, 'Active (1):', L_HOT, WHERE].join('\n') },
  { name: 'list_reminders {state done}', run: ($) => tool($, 'list_reminders', { state: 'done' }), text: [NOW_LINE, 'Done (last 10) (1):', L_OLD, WHERE].join('\n') },
  { name: 'list_reminders {from, to as dates}', run: ($) => tool($, 'list_reminders', { from: '2026-10-23', to: '2026-10-23' }), text: [NOW_LINE, 'Open (1):', L_LATER, WHERE].join('\n') },
  { name: 'list_reminders {state bogus}', run: ($) => tool($, 'list_reminders', { state: 'bogus' }), text: 'state is active, all or done' },
  {
    name: 'list_reminders {from garbage}',
    run: ($) => tool($, 'list_reminders', { from: 'soon' }),
    text: 'unrecognised time "soon": use ISO with offset/Z, "YYYY-MM-DD HH:MM", "YYYY-MM-DD" (00:00 local) or +<n>m|h|d|w',
  },
]
for (const { name, run, text } of shows) {
  test(`GIVEN project, global, running and finished items WHEN ${name} runs THEN the text is exact and no turn is handed off`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const tree: Tree = {
      [HOTFIX]: item('2026-10-21T08:03:00Z', 'Post-hotfix prod check'),
      [LATER]: item('2026-10-23T08:00:00Z', 'Rotate keys'),
      [GLOBAL]: item('2026-10-22T08:00:00Z', 'Global thing'),
      [`${P_DIR}/20261022-1000_run.md`]: item('2026-10-22T10:00:00Z', 'Run task'),
      [`${P_DIR}/.claims/20261022-1000_run.json`]: gclaim('other', NOW - 3600000),
      [OLD]: item('2026-10-20T09:00:00Z', 'Old task', 'done', 'done: 2026-10-20T10:00:00Z\nresult: ok\n'),
    }
    const ops = wire(on, tree)
    await start($)

    const out = await run($)
    await clock.advance(1000)

    expect({ text: out.text, submits: ops.submits }, name).toEqual({ text, submits: [] })
  })
}

const WHEN_RULE =
  'If the request names no time, ask the user ONE AskUserQuestion "When should it fire?" with 2-4 options you derive from this reminder\'s own context (e.g. post-deploy prod check: tonight 23:00 / tomorrow 09:00 / in 1 week; renew a domain: in 2 weeks / in 1 month; check nightly-run logs: tonight / tomorrow morning), each label showing its concrete local time, the best fit marked "(Recommended)"; free text stays available through Other; no fixed list. A scope question may share that AskUserQuestion as a second question. An answer like "in 1 week" becomes a date-only when (YYYY-MM-DD, fires 00:00 local that day).'
const ADD = { scope: 'project', when: 'tomorrow 9:00', text: 'Check prod.', slug: 'Check prod' }
const PREVIEW = [
  'Preview, nothing written: Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | project | 20261022-0800_check-prod',
  'Check prod.',
  'Show the user this time line, get their confirmation with ONE AskUserQuestion (add "Where to save?" with Project (Recommended) / Global when they gave no scope), then call add_reminder again with confirm:true and the final scope, time and text.',
].join('\n')
type AddRow = { name: string; input: object; text: string; writes: [string, string][]; tree?: Tree; tz?: string }
const LONG = 'x'.repeat(45)
const longName = (n: number): string => `20261022-0800_${n === 1 ? 'x'.repeat(40) : `${'x'.repeat(40 - `-${n}`.length)}-${n}`}`
const SAVED = (id: string): string => `saved ${id} (project) | due Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | ${P_DIR}/${id}.md`
const BODY = 'due: 2026-10-22T08:00:00Z\nstatus: pending\ncreated: 2026-10-21T14:00:00Z\n\nCheck prod.\n'
const rows: AddRow[] = [
  { name: 'no confirm', input: ADD, text: PREVIEW, writes: [] },
  { name: 'confirm', input: { ...ADD, confirm: true }, text: SAVED('20261022-0800_check-prod'), writes: [[`${P_DIR}/20261022-0800_check-prod.md`, BODY]] },
  { name: 'no when', input: { ...ADD, when: undefined, confirm: true }, text: `when is required: nothing is saved without a trigger time. ${WHEN_RULE}`, writes: [] },
  { name: 'a blank when', input: { ...ADD, when: '  ', confirm: true }, text: `when is required: nothing is saved without a trigger time. ${WHEN_RULE}`, writes: [] },
  {
    name: 'a date-only when (00:00 local) and confirm',
    input: { ...ADD, when: '2026-10-28', confirm: true },
    text: `saved 20261028-0000_check-prod (project) | due Wed 28 Oct 00:00 Lisbon (00:00 UTC), in 6 d | ${P_DIR}/20261028-0000_check-prod.md`,
    writes: [[`${P_DIR}/20261028-0000_check-prod.md`, 'due: 2026-10-28T00:00:00Z\nstatus: pending\ncreated: 2026-10-21T14:00:00Z\n\nCheck prod.\n']],
  },
  {
    name: 'a +1w when and confirm',
    input: { ...ADD, when: '+1w', confirm: true },
    text: `saved 20261028-1400_check-prod (project) | due Wed 28 Oct 14:00 Lisbon (14:00 UTC), in 7 d | ${P_DIR}/20261028-1400_check-prod.md`,
    writes: [[`${P_DIR}/20261028-1400_check-prod.md`, 'due: 2026-10-28T14:00:00Z\nstatus: pending\ncreated: 2026-10-21T14:00:00Z\n\nCheck prod.\n']],
  },
  { name: 'past time', input: { ...ADD, when: '2026-10-21 09:00', confirm: true }, text: '2026-10-21T08:00:00Z is in the past', writes: [] },
  { name: 'no scope', input: { ...ADD, scope: undefined }, text: 'scope is required: project or global', writes: [] },
  { name: 'a posix-style TZ env (:Europe/Lisbon)', input: { ...ADD, confirm: true }, tz: ':Europe/Lisbon', text: SAVED('20261022-0800_check-prod'), writes: [[`${P_DIR}/20261022-0800_check-prod.md`, BODY]] },
  { name: 'an invalid model tz', input: { ...ADD, tz: 'Lisbon', confirm: true }, text: 'unknown time zone "Lisbon"', writes: [] },
  {
    name: 'a 40-char slug whose name exists',
    input: { ...ADD, slug: LONG, confirm: true },
    tree: { [`${P_DIR}/${longName(1)}.md`]: 'taken' },
    text: SAVED(longName(2)),
    writes: [[`${P_DIR}/${longName(2)}.md`, BODY]],
  },
  {
    name: 'a 40-char slug with every name taken',
    input: { ...ADD, slug: LONG, confirm: true },
    tree: Object.fromEntries(Array.from({ length: 99 }, (_, k) => [`${P_DIR}/${longName(k + 1)}.md`, 'taken'])),
    text: `no free file name for "${'x'.repeat(40)}" at that time; use another slug`,
    writes: [],
  },
]
for (const { name, input, text, writes, tree = {}, tz } of rows) {
  test(`GIVEN add_reminder with ${name} WHEN the model calls it THEN the answer and the writes are exact`, async ($, on) => {
    mock.clock(on, { now: NOW })
    const ops = wire(on, tree)
    if (tz !== undefined) ops.vars.TZ = tz
    await start($)
    const before = ops.writes.length

    const out = await tool($, 'add_reminder', input)

    expect({ text: out.text, writes: ops.writes.slice(before).filter(([p]) => p.startsWith(P_DIR)) }, name).toEqual({ text, writes })
  })
}

const CLAIM = `${P_DIR}/.claims/20261021-0803_hotfix.json`
const HOT = item('2026-10-21T08:03:00Z', 'Hotfix')
const HOT_G = `${G_DIR}/20261021-0803_hotfix.md`
const HOT_TWO = `${G_DIR}/20261021-0803_hotfix-two.md`
const ID = '20261021-0803_hotfix'
const acts: { name: string; tree: Tree; run: Run; text: string; isError?: true; writes: [string, string][] }[] = [
  {
    name: 'a live claim of another session and start',
    tree: { [HOTFIX]: HOT, [CLAIM]: gclaim('other', NOW - 3600000) },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'start' }),
    text: `${ID} is running in session other since Wed 21 Oct 14:00 Lisbon (13:00 UTC), 1 h ago; do not run it or change it, tell the user`,
    isError: true,
    writes: [],
  },
  {
    name: 'a free item and start',
    tree: { [HOTFIX]: HOT },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'start' }),
    text: `started ${ID}; carry out the text below, then update_reminder {id, action:"done", result}.\ndue: 2026-10-21T08:03:00Z\nstatus: pending\n\nHotfix\n`,
    writes: [
      [`${P_DIR}/.claims/.gitignore`, '*\n'],
      [CLAIM, `{"session":"${SID}","at":${NOW}}`],
    ],
  },
  {
    name: 'an owned claim and done with a result',
    tree: { [HOTFIX]: HOT, [CLAIM]: gclaim(SID, NOW - 1000) },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'done', result: 'prod ok\nno errors' }),
    text: `done: Hotfix (${ID})`,
    writes: [
      [HOTFIX, 'due: 2026-10-21T08:03:00Z\nstatus: done\ndone: 2026-10-21T14:00:00Z\nresult: prod ok no errors\n\nHotfix\n'],
      [CLAIM, ''],
    ],
  },
  {
    name: '/remind cancel',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'cancel hotfix'),
    text: `cancelled: Hotfix (${ID})`,
    writes: [[HOTFIX, 'due: 2026-10-21T08:03:00Z\nstatus: cancelled\ncancelled: 2026-10-21T14:00:00Z\n\nHotfix\n']],
  },
  {
    name: '/remind snooze with tomorrow 9:00 (Lisbon WEST)',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'snooze hotfix tomorrow 9:00'),
    text: `snoozed: Hotfix (${ID}) until 2026-10-22T08:00:00Z`,
    writes: [[HOTFIX, 'due: 2026-10-22T08:00:00Z\nstatus: pending\n\nHotfix\n']],
  },
  {
    name: 'an item without a status header and done',
    tree: { [HOTFIX]: 'due: 2026-10-21T08:03:00Z\nnotes: x\n\nHotfix\n' },
    run: ($) => remind($, 'done hotfix'),
    text: `${ID} has no status header; add \`status: pending\` and \`due:\` first`,
    writes: [],
  },
  {
    name: '/remind cancel with an exact id in project and a prefix hit in global',
    tree: { [HOTFIX]: HOT, [HOT_TWO]: HOT },
    run: ($) => remind($, 'cancel hotfix'),
    text: `cancelled: Hotfix (${ID})`,
    writes: [[HOTFIX, 'due: 2026-10-21T08:03:00Z\nstatus: cancelled\ncancelled: 2026-10-21T14:00:00Z\n\nHotfix\n']],
  },
  {
    name: '/remind cancel with the same id in both folders',
    tree: { [HOTFIX]: HOT, [HOT_G]: HOT },
    run: ($) => remind($, 'cancel hotfix'),
    text: '"hotfix" exists in project and global: pass scope',
    writes: [],
  },
  {
    name: '/remind cancel global with the same id in both folders',
    tree: { [HOTFIX]: HOT, [HOT_G]: HOT },
    run: ($) => remind($, 'cancel global hotfix'),
    text: `cancelled: Hotfix (${ID} (global))`,
    writes: [[HOT_G, 'due: 2026-10-21T08:03:00Z\nstatus: cancelled\ncancelled: 2026-10-21T14:00:00Z\n\nHotfix\n']],
  },
]
for (const { name, tree, run, text, isError, writes } of acts) {
  test(`GIVEN ${name} WHEN it runs THEN the answer, the error flag, the writes and the hand-offs are exact`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const ops = wire(on, tree)
    await start($)
    const before = ops.writes.length

    const out = await run($)
    await clock.advance(1000)

    expect({ text: out.text, isError: out.isError, writes: ops.writes.slice(before), submits: ops.submits }, name).toEqual({ text, isError, writes, submits: [] })
  })
}

const handoffs: [string, string][] = [
  ['help me with prod tomorrow 9:00', 'help me with prod tomorrow 9:00'],
  ['list prod checks for friday 9:00', 'list prod checks for friday 9:00'],
  ['cancel the meeting at 9:00', 'cancel the meeting at 9:00'],
  ['done typo', 'done typo'],
]
for (const [args, request] of handoffs) {
  test(`GIVEN "/remind ${args}" WHEN it runs THEN the whole text is handed to the model`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const ops = wire(on, { [HOTFIX]: HOT })
    await start($)

    const out = await remind($, args)
    await clock.advance(250)

    expect({ text: out.text, firstLines: ops.submits.map((t) => t.split('\n')[0]) }, args).toEqual({
      text: `Handing this to Claude: ${request}`,
      firstLines: [`Reminder helper. My request: <request>${request}</request>`],
    })
  })
}

test('GIVEN the project root moved after the start WHEN /remind list runs THEN it reads the new root', async ($, on) => {
  const ops = wire(on, {})
  mock.clock(on, { now: NOW })
  await start($)
  ops.live.root = '/proj2'

  const out = await remind($, 'list')

  expect(out.text, 'list text').toEqual(`No open reminders. project /proj2/.claude/scheduled | global ${G_DIR}`)
})

test('GIVEN a /clear (new session id, no session.start) WHEN a turn completes THEN the session state file exists for the new id', async ($, on) => {
  const tree: Tree = {}
  const ops = wire(on, tree)
  mock.clock(on, { now: NOW })
  await start($)
  ops.live.sid = 'sess-2'

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)

  const states = Object.entries(tree).filter(([k]) => k.includes('/.state/')).map(([k, v]) => [k.split('/').pop(), v])
  expect(states, 'state files').toEqual([
    ['session-sess-1.json', `{"isInteractive":true,"ts":${NOW}}`],
    ['session-sess-2.json', `{"isInteractive":true,"ts":${NOW}}`],
  ])
})

test('GIVEN a free-text /remind WHEN it runs THEN the ack returns at once and the hand-off is submitted after 250 ms', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const ops = wire(on, {})
  await start($)

  const out = await remind($, 'global check prod tomorrow 9:00')
  const before = ops.submits.length
  await clock.advance(250)

  expect({ text: out.text, before, submits: ops.submits }, 'hand-off').toEqual({
    text: 'Handing this to Claude: check prod tomorrow 9:00',
    before: 0,
    submits: [
      [
        'Reminder helper. My request: <request>check prod tomorrow 9:00</request>',
        'Now: Wed 21 Oct 15:00 Lisbon (14:00 UTC), time zone Europe/Lisbon, UTC 2026-10-21T14:00:00Z. Times I give without a zone are in Europe/Lisbon.',
        'Scope: global.',
        `Use the ${TOOL}* tools. To add: add_reminder without confirm first (preview, writes nothing), show me its time line, ONE AskUserQuestion confirming the time (plus the scope when not given), then add_reminder with confirm:true. Every reminder needs a trigger time. ${WHEN_RULE} My pick of a time is the confirmation: then call add_reminder with confirm:true directly. To look or change: list_reminders (state active|all|done, from/to), update_reminder.`,
      ].join('\n'),
    ],
  })
})

const flat = (n: any): string[] => (n === null || typeof n !== 'object' ? (typeof n === 'string' ? [n] : []) : n.type === 'Text' ? [(n.children ?? []).flatMap(flat).join('')] : (n.children ?? []).flatMap(flat))

async function band($: any): Promise<string[]> {
  const ui = await $.ui.mount({
    plugin: 'brewmod-reminders',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 24, bodyColumns: 100, scroll: { bodyRows: 23, offset: 0 }, view: {} },
  })
  const rows = flat(await ui.drawn())
  await ui.unmount()
  return rows
}

const FOOT = '/remind  list · done · snooze'
const FRESH = `${P_DIR}/20261021-1359_fresh.md`
const RUN = `${P_DIR}/20261021-0800_run.md`
const bands: { name: string; tree: Tree; rows: string[] }[] = [
  { name: 'only upcoming items', tree: { [LATER]: item('2026-10-23T08:00:00Z', 'Rotate keys'), [GLOBAL]: item('2026-10-22T08:00:00Z', 'Global thing') }, rows: [] },
  {
    name: 'only a due item claimed by a live session',
    tree: { [RUN]: item('2026-10-21T08:00:00Z', 'Run task'), [`${P_DIR}/.claims/20261021-0800_run.json`]: gclaim('other', NOW - 1000) },
    rows: [],
  },
  {
    name: '2 due and 1 upcoming',
    tree: { [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix'), [FRESH]: item('2026-10-21T13:59:30Z', 'Fresh'), [LATER]: item('2026-10-23T08:00:00Z', 'Rotate keys') },
    rows: ['reminders · 2 due', '  Hotfix  6 h ago', '  Fresh  now', FOOT],
  },
  {
    name: '4 due',
    tree: {
      [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix'),
      [GLOBAL.replace('20261022', '20261020')]: item('2026-10-20T08:00:00Z', 'Global thing'),
      [`${P_DIR}/20261019-0800_x19.md`]: item('2026-10-19T08:00:00Z', 'Task 19'),
      [`${P_DIR}/20261018-0800_x18.md`]: item('2026-10-18T08:00:00Z', 'Task 18'),
    },
    rows: ['reminders · 4 due', '  Task 18  3 d ago', '  Task 19  2 d ago', '  Global thing  30 h ago (global)', `+1 more · ${FOOT}`],
  },
]
for (const { name, tree, rows } of bands) {
  test(`GIVEN ${name} WHEN the band is drawn THEN it shows exactly ${JSON.stringify(rows)}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    wire(on, tree)
    await start($)

    expect(await band($), 'band rows').toEqual(rows)
  })
}

test('GIVEN an item due in 30 s WHEN the 60 s tick fires THEN one toast names it, and the next tick adds none', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const ops = wire(on, { [LATER]: item('2026-10-21T14:00:30Z', 'Rotate keys') })
  await start($)

  await clock.advance(60_000)
  await clock.advance(60_000)

  expect(ops.toasts, 'toasts').toEqual(['reminder due: Rotate keys · /remind'])
})
