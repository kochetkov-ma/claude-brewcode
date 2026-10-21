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
  const ops = { vars: {} as Record<string, string>, live, writes: [] as [string, string][], toasts: [] as string[], notifies: [] as [string, string | undefined][], tools: [] as string[], cmds: [] as unknown[], submits: [] as string[] }
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
  on('ui.notify', (_$, e) => (ops.notifies.push([e.text, e.title]), { value: { isSent: true, channel: 'kitty' } }) as never)
  on('ui.render', () => ENGINE as never)
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  on('prompt.edit', (_$, e) => ({ text: e.text, cursor: e.cursor }) as never)
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
const SOMEDAY = `${P_DIR}/someday_semble.md`
const L_HOT = '- 1 ▶ 20261021-0803_hotfix | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago | Post-hotfix prod check'
const L_G = '- ▶ 20261022-0800_g (global) | Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | Global thing'
const L_RUN = '- ▶ 20261022-1000_run | Thu 22 Oct 11:00 Lisbon (10:00 UTC), in 20 h | Run task | running in session other since Wed 21 Oct 14:00 Lisbon (13:00 UTC), 1 h ago'
const L_LATER = '- ▶ 20261023-0800_later | Fri 23 Oct 09:00 Lisbon (08:00 UTC), in 42 h | Rotate keys'
const L_SD = '- ✎ someday_semble | no date (someday) | Try semble'
const L_OLD = '- ✓ ▶ 20261020-0900_old | done Tue 20 Oct 11:00 Lisbon (10:00 UTC), 28 h ago | Old task | ok'
const L_SHOWN = '- ✓ ✎ 20261020-1000_note | shown Tue 20 Oct 12:00 Lisbon (11:00 UTC), 27 h ago | Read me'
const L_CANC = '- ✗ ▶ 20261019-1000_gone | cancelled Mon 19 Oct 11:00 Lisbon (10:00 UTC), 2 d ago | Gone'
const FIRED = ['Fired (1):', L_HOT, '1 someday · /remind all']
const ALL = ['Fired (1):', L_HOT, 'Waiting (3):', L_G, L_RUN, L_LATER, 'Someday (1):', L_SD]
const HIST = ['History (last 20) (3):', L_SHOWN, L_OLD, L_CANC]
const NONE_FIRED = `No fired reminders; /remind all lists the waiting ones. ${WHERE}`
const shows: { name: string; run: Run; text: string }[] = [
  { name: '/remind', run: ($) => remind($, ''), text: [NOW_LINE, ...FIRED, WHERE].join('\n') },
  { name: '/remind show active', run: ($) => remind($, 'show active'), text: [NOW_LINE, ...FIRED, WHERE].join('\n') },
  { name: '/remind show (state omitted)', run: ($) => remind($, 'show'), text: [NOW_LINE, ...FIRED, WHERE].join('\n') },
  { name: '/remind all', run: ($) => remind($, 'all'), text: [NOW_LINE, ...ALL, WHERE].join('\n') },
  { name: '/remind show all', run: ($) => remind($, 'show all'), text: [NOW_LINE, ...ALL, WHERE].join('\n') },
  { name: '/remind list (alias of all)', run: ($) => remind($, 'list'), text: [NOW_LINE, ...ALL, WHERE].join('\n') },
  { name: '/remind all global week', run: ($) => remind($, 'all global week'), text: [NOW_LINE, 'Waiting (1):', L_G, WHERE].join('\n') },
  { name: '/remind show all project tomorrow', run: ($) => remind($, 'show all project tomorrow'), text: [NOW_LINE, 'Fired (1):', L_HOT, 'Waiting (1):', L_RUN, WHERE].join('\n') },
  { name: '/remind all +1d', run: ($) => remind($, 'all +1d'), text: [NOW_LINE, 'Fired (1):', L_HOT, 'Waiting (2):', L_G, L_RUN, WHERE].join('\n') },
  { name: '/remind show all until 2026-10-22', run: ($) => remind($, 'show all until 2026-10-22'), text: [NOW_LINE, 'Fired (1):', L_HOT, 'Waiting (2):', L_G, L_RUN, WHERE].join('\n') },
  { name: '/remind show active global', run: ($) => remind($, 'show active global'), text: NONE_FIRED },
  { name: '/remind someday', run: ($) => remind($, 'someday'), text: [NOW_LINE, 'Someday (1):', L_SD, WHERE].join('\n') },
  { name: '/remind history', run: ($) => remind($, 'history'), text: [NOW_LINE, ...HIST, WHERE].join('\n') },
  { name: '/remind show done (alias of history)', run: ($) => remind($, 'show done'), text: [NOW_LINE, ...HIST, WHERE].join('\n') },
  { name: '/remind history global', run: ($) => remind($, 'history global'), text: `No closed reminders yet. ${WHERE}` },
  { name: 'list_reminders {scope project, from week}', run: ($) => tool($, 'list_reminders', { scope: 'project', from: 'week' }), text: [NOW_LINE, 'Fired (1):', L_HOT, 'Waiting (2):', L_RUN, L_LATER, WHERE].join('\n') },
  { name: 'list_reminders {state active}', run: ($) => tool($, 'list_reminders', { state: 'active' }), text: [NOW_LINE, ...FIRED, WHERE].join('\n') },
  { name: 'list_reminders {state someday}', run: ($) => tool($, 'list_reminders', { state: 'someday' }), text: [NOW_LINE, 'Someday (1):', L_SD, WHERE].join('\n') },
  { name: 'list_reminders {state done}', run: ($) => tool($, 'list_reminders', { state: 'done' }), text: [NOW_LINE, ...HIST, WHERE].join('\n') },
  { name: 'list_reminders {default state}', run: ($) => tool($, 'list_reminders', {}), text: [NOW_LINE, ...ALL, WHERE].join('\n') },
  { name: 'list_reminders {from, to as dates}', run: ($) => tool($, 'list_reminders', { from: '2026-10-23', to: '2026-10-23' }), text: [NOW_LINE, 'Fired (1):', L_HOT, 'Waiting (1):', L_LATER, WHERE].join('\n') },
  { name: 'list_reminders {state bogus}', run: ($) => tool($, 'list_reminders', { state: 'bogus' }), text: 'state is active, all, someday or done' },
  {
    name: 'list_reminders {from garbage}',
    run: ($) => tool($, 'list_reminders', { from: 'soon' }),
    text: 'unrecognised time "soon": use ISO with offset/Z, "YYYY-MM-DD HH:MM", "YYYY-MM-DD" (00:00 local), a weekday like "fri 14:00" or +<n>m|h|d|w',
  },
]
for (const { name, run, text } of shows) {
  test(`GIVEN fired, waiting, running, someday and closed items WHEN ${name} runs THEN the text is exact and no turn is handed off`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const tree: Tree = {
      [HOTFIX]: item('2026-10-21T08:03:00Z', 'Post-hotfix prod check'),
      [LATER]: item('2026-10-23T08:00:00Z', 'Rotate keys'),
      [GLOBAL]: item('2026-10-22T08:00:00Z', 'Global thing'),
      [`${P_DIR}/20261022-1000_run.md`]: item('2026-10-22T10:00:00Z', 'Run task'),
      [`${P_DIR}/.claims/20261022-1000_run.json`]: gclaim('other', NOW - 3600000),
      [SOMEDAY]: item('none', 'Try semble', 'pending', 'kind: note\n'),
      [OLD]: item('2026-10-20T09:00:00Z', 'Old task', 'done', 'done: 2026-10-20T10:00:00Z\nresult: ok\n'),
      [`${P_DIR}/20261020-1000_note.md`]: item('2026-10-20T10:00:00Z', 'Read me', 'done', 'kind: note\ndone: 2026-10-20T11:00:00Z\n'),
      [`${P_DIR}/20261019-1000_gone.md`]: item('2026-10-19T10:00:00Z', 'Gone', 'cancelled', 'cancelled: 2026-10-19T10:00:00Z\n'),
    }
    const ops = wire(on, tree)
    await start($)

    const out = await run($)
    await clock.advance(1000)

    expect({ text: out.text, submits: ops.submits }, name).toEqual({ text, submits: [] })
  })
}

const CAL = 'Today is Wed 21 Oct 2026 15:00 Europe/Lisbon; next days: Thu 22 Oct, Fri 23 Oct, Sat 24 Oct, Sun 25 Oct, Mon 26 Oct, Tue 27 Oct, Wed 28 Oct, Thu 29 Oct. Use these weekday/date pairs verbatim in options.'
const WHEN_RULE =
  'If the request names no time, ask ONE AskUserQuestion "When should it fire?" with 2-3 options you derive from this reminder\'s own context (e.g. post-deploy prod check: tonight 23:00 / tomorrow 09:00 / in 1 week; renew a domain: in 2 weeks / in 1 month; check nightly-run logs: tonight / tomorrow morning), each label showing its concrete local time, the best fit marked "(Recommended)", plus a last option "No date (someday)" (answer -> when:"someday": it never fires and shows only when the user asks); free text stays available through Other; no fixed list. A kind (action or note) or scope (project or global) that is still unclear joins that same AskUserQuestion as extra questions; ask nothing else. An answer like "in 1 week" becomes a date-only when (YYYY-MM-DD, fires 00:00 local that day).'
const KIND_RULE =
  'kind is required: action (Claude does the work when the user runs it, e.g. "check the prod logs") or note (only tells the user, closes once shown, e.g. "reply to Ana"). Infer it from the request; ask only when it is unclear, as an extra question in the same single AskUserQuestion as the time.'
const ADD = { scope: 'project', kind: 'action', when: 'tomorrow 9:00', text: 'Check prod.', slug: 'Check prod' }
type AddRow = { name: string; input: object; text: string; writes: [string, string][]; tree?: Tree; tz?: string }
const LONG = 'x'.repeat(45)
const longName = (n: number): string => `20261022-0800_${n === 1 ? 'x'.repeat(40) : `${'x'.repeat(40 - `-${n}`.length)}-${n}`}`
const SAVED = (id: string, due = 'due Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h', kind = '▶ action', scope = 'project'): string =>
  `saved ${id} (${scope}) | ${kind} | ${due} | ${P_DIR}/${id}.md\nchange it by saying so · /remind cancel ${id}`
const BODY = 'due: 2026-10-22T08:00:00Z\nstatus: pending\nkind: action\ncreated: 2026-10-21T14:00:00Z\n\nCheck prod.\n'
const rows: AddRow[] = [
  { name: 'time, kind and scope given', input: ADD, text: SAVED('20261022-0800_check-prod'), writes: [[`${P_DIR}/20261022-0800_check-prod.md`, BODY]] },
  { name: 'a stray confirm flag', input: { ...ADD, confirm: false }, text: SAVED('20261022-0800_check-prod'), writes: [[`${P_DIR}/20261022-0800_check-prod.md`, BODY]] },
  {
    name: 'kind note',
    input: { ...ADD, kind: 'note' },
    text: SAVED('20261022-0800_check-prod', undefined, '✎ note'),
    writes: [[`${P_DIR}/20261022-0800_check-prod.md`, BODY.replace('kind: action', 'kind: note')]],
  },
  {
    name: 'when someday',
    input: { ...ADD, when: 'Someday' },
    text: SAVED('someday_check-prod', 'someday (no date)'),
    writes: [[`${P_DIR}/someday_check-prod.md`, 'due: none\nstatus: pending\nkind: action\ncreated: 2026-10-21T14:00:00Z\n\nCheck prod.\n']],
  },
  { name: 'no when', input: { ...ADD, when: undefined }, text: `when is required: nothing is saved without a trigger time. ${CAL} ${WHEN_RULE}`, writes: [] },
  { name: 'a blank when', input: { ...ADD, when: '  ' }, text: `when is required: nothing is saved without a trigger time. ${CAL} ${WHEN_RULE}`, writes: [] },
  { name: 'no kind', input: { ...ADD, kind: undefined }, text: KIND_RULE, writes: [] },
  { name: 'a bogus kind', input: { ...ADD, kind: 'task' }, text: KIND_RULE, writes: [] },
  { name: 'no when and no kind', input: { ...ADD, when: undefined, kind: undefined }, text: `when is required: nothing is saved without a trigger time. ${CAL} ${WHEN_RULE} ${KIND_RULE}`, writes: [] },
  {
    name: 'a date-only when (00:00 local)',
    input: { ...ADD, when: '2026-10-28' },
    text: SAVED('20261028-0000_check-prod', 'due Wed 28 Oct 00:00 Lisbon (00:00 UTC), in 6 d'),
    writes: [[`${P_DIR}/20261028-0000_check-prod.md`, BODY.replace('2026-10-22T08:00:00Z', '2026-10-28T00:00:00Z')]],
  },
  {
    name: 'a +1w when',
    input: { ...ADD, when: '+1w' },
    text: SAVED('20261028-1400_check-prod', 'due Wed 28 Oct 14:00 Lisbon (14:00 UTC), in 7 d'),
    writes: [[`${P_DIR}/20261028-1400_check-prod.md`, BODY.replace('2026-10-22T08:00:00Z', '2026-10-28T14:00:00Z')]],
  },
  { name: 'past time', input: { ...ADD, when: '2026-10-21 09:00' }, text: '2026-10-21T08:00:00Z is in the past', writes: [] },
  { name: 'no scope', input: { ...ADD, scope: undefined }, text: 'scope is required: project or global', writes: [] },
  { name: 'a posix-style TZ env (:Europe/Lisbon)', input: ADD, tz: ':Europe/Lisbon', text: SAVED('20261022-0800_check-prod'), writes: [[`${P_DIR}/20261022-0800_check-prod.md`, BODY]] },
  { name: 'an invalid model tz', input: { ...ADD, tz: 'Lisbon' }, text: 'unknown time zone "Lisbon"', writes: [] },
  {
    name: 'a 40-char slug whose name exists',
    input: { ...ADD, slug: LONG },
    tree: { [`${P_DIR}/${longName(1)}.md`]: 'taken' },
    text: SAVED(longName(2)),
    writes: [[`${P_DIR}/${longName(2)}.md`, BODY]],
  },
  {
    name: 'a 40-char slug with every name taken',
    input: { ...ADD, slug: LONG },
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
const CANCELLED = 'due: 2026-10-21T08:03:00Z\nstatus: cancelled\ncancelled: 2026-10-21T14:00:00Z\n\nHotfix\n'
const CLOSED = item('2026-10-21T08:03:00Z', 'Hotfix', 'done', 'done: 2026-10-21T10:00:00Z\nresult: ok\n')
const CSV = `${P_DIR}/20261021-0900_csv.md`
const NOTE_LINE = 'Reminder helper. My request: <request>run 20261021-0900_csv</request>'
const STAMP = 'Now: Wed 21 Oct 15:00 Lisbon (14:00 UTC), time zone Europe/Lisbon, UTC 2026-10-21T14:00:00Z. Times I give without a zone are in Europe/Lisbon.'
const acts: { name: string; tree: Tree; run: Run; text: string; isError?: true; writes: [string, string][]; submits?: string[] }[] = [
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
  { name: '/remind cancel', tree: { [HOTFIX]: HOT }, run: ($) => remind($, 'cancel hotfix'), text: `cancelled: Hotfix (${ID})`, writes: [[HOTFIX, CANCELLED]] },
  { name: '/remind cancel 1 (fired number)', tree: { [HOTFIX]: HOT }, run: ($) => remind($, 'cancel 1'), text: `cancelled: Hotfix (${ID})`, writes: [[HOTFIX, CANCELLED]] },
  {
    name: '/remind done 1 (fired number)',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'done 1'),
    text: `done: Hotfix (${ID})`,
    writes: [[HOTFIX, 'due: 2026-10-21T08:03:00Z\nstatus: done\ndone: 2026-10-21T14:00:00Z\n\nHotfix\n']],
  },
  { name: '/remind done 5 (no such number)', tree: { [HOTFIX]: HOT }, run: ($) => remind($, 'done 5'), text: 'no fired reminder 5; /remind shows the numbered list', writes: [] },
  {
    name: '/remind snooze with tomorrow 9:00 (Lisbon WEST)',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'snooze hotfix tomorrow 9:00'),
    text: `snoozed: Hotfix (${ID}) until 2026-10-22T08:00:00Z`,
    writes: [[HOTFIX, 'due: 2026-10-22T08:00:00Z\nstatus: pending\n\nHotfix\n']],
  },
  {
    name: '/remind snooze 1 +1h',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'snooze 1 +1h'),
    text: `snoozed: Hotfix (${ID}) until 2026-10-21T15:00:00Z`,
    writes: [[HOTFIX, 'due: 2026-10-21T15:00:00Z\nstatus: pending\n\nHotfix\n']],
  },
  {
    name: '/remind snooze on a someday item gives it a date',
    tree: { [SOMEDAY]: item('none', 'Try semble') },
    run: ($) => remind($, 'snooze semble tomorrow 9:00'),
    text: 'snoozed: Try semble (someday_semble) until 2026-10-22T08:00:00Z',
    writes: [[SOMEDAY, 'due: 2026-10-22T08:00:00Z\nstatus: pending\n\nTry semble\n']],
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
    writes: [[HOTFIX, CANCELLED]],
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
    writes: [[HOT_G, CANCELLED]],
  },
  {
    name: '/remind reopen with a new time',
    tree: { [HOTFIX]: CLOSED },
    run: ($) => remind($, 'reopen hotfix +1d'),
    text: `reopened: Hotfix (${ID}) due 2026-10-22T14:00:00Z`,
    writes: [[HOTFIX, 'due: 2026-10-22T14:00:00Z\nstatus: pending\n\nHotfix\n']],
  },
  {
    name: 'update_reminder reopen without a time',
    tree: { [HOTFIX]: CLOSED },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'reopen' }),
    text: `reopened: Hotfix (${ID}) due 2026-10-21T08:03:00Z`,
    writes: [[HOTFIX, 'due: 2026-10-21T08:03:00Z\nstatus: pending\n\nHotfix\n']],
  },
  { name: 'reopen of an open item', tree: { [HOTFIX]: HOT }, run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'reopen' }), text: `${ID} is not closed`, isError: true, writes: [] },
  { name: '/remind reopen 1 (a number)', tree: { [HOTFIX]: HOT }, run: ($) => remind($, 'reopen 1'), text: 'reopen takes a name: /remind history lists the closed ones', writes: [] },
  {
    name: 'update_reminder edit of text, kind and time',
    tree: { [HOTFIX]: HOT },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'edit', text: ' Hotfix and DB pool ', kind: 'note', when: '2026-10-28' }),
    text: `Reminder updated ▶ action → ✎ note · project · ${ID}\n- ▶ project | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago  Hotfix\n+ ✎ project | Wed 28 Oct 00:00 Lisbon (00:00 UTC), in 6 d  Hotfix and DB pool`,
    writes: [[HOTFIX, 'due: 2026-10-28T00:00:00Z\nstatus: pending\nkind: note\n\nHotfix and DB pool\n']],
  },
  {
    name: 'update_reminder edit to someday',
    tree: { [HOTFIX]: HOT },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'edit', when: 'someday' }),
    text: `Reminder updated ▶ action · project · ${ID}\n- ▶ project | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago  Hotfix\n+ ▶ project | no date (someday)  Hotfix`,
    writes: [[HOTFIX, 'due: none\nstatus: pending\n\nHotfix\n']],
  },
  {
    name: 'update_reminder edit moves project to global',
    tree: { [HOTFIX]: HOT },
    run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'edit', scope: 'global' }),
    text: `Reminder updated ▶ action · project → global · ${ID}\n- ▶ project | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago  Hotfix\n+ ▶ global | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago  Hotfix`,
    writes: [
      [HOT_G, HOT],
      [HOTFIX, CANCELLED],
    ],
  },
  { name: 'update_reminder edit with nothing to change', tree: { [HOTFIX]: HOT }, run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'edit' }), text: 'nothing to change: pass text, kind, when or scope', isError: true, writes: [] },
  { name: 'update_reminder edit with a bogus kind', tree: { [HOTFIX]: HOT }, run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'edit', kind: 'task' }), text: 'kind is action or note', isError: true, writes: [] },
  { name: 'update_reminder edit of a closed item', tree: { [HOTFIX]: CLOSED }, run: ($) => tool($, 'update_reminder', { id: 'hotfix', action: 'edit', kind: 'note' }), text: `${ID} is already done`, isError: true, writes: [] },
  {
    name: '/remind run 1 on an action',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'run 1'),
    text: 'Running Hotfix (action): handing it to Claude',
    writes: [],
    submits: [
      [
        `Reminder helper. My request: <request>run ${ID}</request>`,
        `Run reminder ${ID} (Hotfix, action): Hotfix`,
        `This is an action: call update_reminder {id:"${ID}", action:"start"}, carry out its text above, then update_reminder {id:"${ID}", action:"done", result:<one line>}.`,
      ].join('\n'),
    ],
  },
  {
    name: '/remind run by slug on a note with extra words',
    tree: { [CSV]: item('2026-10-21T09:00:00Z', 'Finish CSV', 'pending', 'kind: note\n') },
    run: ($) => remind($, 'run csv only the endpoint'),
    text: 'Running Finish CSV (note): handing it to Claude',
    writes: [],
    submits: [
      [
        NOTE_LINE,
        'Run reminder 20261021-0900_csv (Finish CSV, note): Finish CSV',
        'This is a note: show me its full text above, say it was just a reminder (nothing to execute), then call update_reminder {id:"20261021-0900_csv", action:"done"}.',
        'My extra words: only the endpoint',
      ].join('\n'),
    ],
  },
  {
    name: '/remind run on an item another session runs',
    tree: { [HOTFIX]: HOT, [CLAIM]: gclaim('other', NOW - 3600000) },
    run: ($) => remind($, 'run hotfix'),
    text: `${ID} is already running in another session since Wed 21 Oct 14:00 Lisbon (13:00 UTC), 1 h ago`,
    writes: [],
  },
  { name: '/remind run on a closed item', tree: { [HOTFIX]: CLOSED }, run: ($) => remind($, 'run hotfix'), text: `${ID} is already done; /remind reopen ${ID} brings it back`, writes: [] },
  {
    name: '/remind edit 1 <change>',
    tree: { [HOTFIX]: HOT },
    run: ($) => remind($, 'edit 1 make it a note'),
    text: `Handing this edit to Claude: ${ID}`,
    writes: [],
    submits: [
      [
        `Reminder helper. My request: <request>edit ${ID}: make it a note</request>`,
        STAMP,
        `Edit reminder ${ID} (Hotfix, action, project): make it a note`,
        `Call ${TOOL}update_reminder {id:"${ID}", action:"edit"} with only what changes: text, kind (action|note), when (a time, or "someday" for no date), scope (the folder to move it to; from_scope:"project" is where it is now). Show me the old and new lines it returns.`,
      ].join('\n'),
    ],
  },
]
for (const { name, tree, run, text, isError, writes, submits = [] } of acts) {
  test(`GIVEN ${name} WHEN it runs THEN the answer, the error flag, the writes and the hand-offs are exact`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const ops = wire(on, tree)
    await start($)
    const before = ops.writes.length

    const out = await run($)
    await clock.advance(1000)

    expect({ text: out.text, isError: out.isError, writes: ops.writes.slice(before), submits: ops.submits }, name).toEqual({ text, isError, writes, submits })
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
        CAL,
        'Scope: global.',
        `Use the ${TOOL}* tools. To add: add_reminder saves at once (no preview, no confirm) when time, kind and scope are clear; then show me its confirmation line. Every reminder needs a trigger time and a kind (action or note; infer it from my words). ${WHEN_RULE} To look: list_reminders (state active|all|someday|done, from/to); to change: update_reminder (start|done|snooze|cancel|edit|reopen).`,
      ].join('\n'),
    ],
  })
})

const kids = (n: any): any[] => n.children ?? n.props?.children ?? []
const flat = (n: any): string[] =>
  n === null || typeof n !== 'object'
    ? typeof n === 'string'
      ? [n]
      : []
    : n.type === 'Text'
      ? [kids(n).flatMap(flat).join('')]
      : n.type === 'Button'
        ? [`${n.props.hotkey}: ${n.props.label}`]
        : kids(n).flatMap(flat)

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

const FOOT = (n: number, more = ''): string => `press ${n > 1 ? `1-${n}` : '1'} then Enter to run · ${more}** to pick · /remind all · snooze · done`
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
    rows: ['reminders · 2 fired', '1: ▶ Hotfix  6 h ago', '2: ▶ Fresh  now', FOOT(2)],
  },
  {
    name: '4 due',
    tree: {
      [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix'),
      [GLOBAL.replace('20261022', '20261020')]: item('2026-10-20T08:00:00Z', 'Global thing'),
      [`${P_DIR}/20261019-0800_x19.md`]: item('2026-10-19T08:00:00Z', 'Task 19'),
      [`${P_DIR}/20261018-0800_x18.md`]: item('2026-10-18T08:00:00Z', 'Task 18'),
    },
    rows: ['reminders · 4 fired', '1: ▶ Task 18  3 d ago', '2: ▶ Task 19  2 d ago', '3: ▶ Global thing  30 h ago (global)', FOOT(3, '+1 more · ')],
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

const helpLine = async ($: any): Promise<string> => (await remind($, 'help')).text.split('\n').at(-1) as string
const ticks: { name: string; options: { notify?: boolean }; notifies: [string, string | undefined][]; before: string; after: string }[] = [
  { name: 'notify on (default)', options: {} as { notify?: boolean }, notifies: [['reminder fired: Rotate keys', 'Reminders']], before: 'Desktop alert: on, last none sent yet', after: 'Desktop alert: on, last sent via kitty' },
  { name: 'notify off', options: { notify: false }, notifies: [], before: 'Desktop alert: off (/config -> Reminder desktop alert)', after: 'Desktop alert: off (/config -> Reminder desktop alert)' },
]
for (const { name, options, notifies, before, after } of ticks) {
  test(`GIVEN ${name} and an item due in 30 s WHEN the 60 s tick fires THEN one toast and the alerts are exact, and /remind help reports the alert`, { options }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const ops = wire(on, { [LATER]: item('2026-10-21T14:00:30Z', 'Rotate keys') })
    await start($)
    const helpBefore = await helpLine($)

    await clock.advance(60_000)
    await clock.advance(60_000)

    expect({ toasts: ops.toasts, notifies: ops.notifies, helpBefore, helpAfter: await helpLine($) }, name).toEqual({ toasts: ['reminder fired: Rotate keys · ** to pick'], notifies, helpBefore: before, helpAfter: after })
  })
}

const FRESH_ID = '20261021-1359_fresh'
const PICK_TREE = (): Tree => ({
  [HOTFIX]: item('2026-10-21T08:03:00Z', 'Post-hotfix prod check'),
  [FRESH]: item('2026-10-21T13:59:30Z', 'Fresh', 'pending', 'kind: note\n'),
  [SOMEDAY]: item('none', 'Try semble', 'pending', 'kind: note\n'),
  [LATER]: item('2026-10-23T08:00:00Z', 'Rotate keys'),
})
const R1 = { text: '**1', label: '**1  ▶ Post-hotfix prod check', description: '6 h ago' }
const R2 = { text: '**2', label: '**2  ✎ Fresh', description: 'now' }
const RDIV = { text: '**', label: '── someday ──' }
const RSD = { text: '**someday_semble', label: '✎ Try semble', description: 'someday' }
const picks: [string, string, { suggestions: unknown[] }][] = [
  ['the bare prefix', '**', { suggestions: [R1, R2, RDIV, RSD] }],
  ['a digit filter', '**2', { suggestions: [R2] }],
  ['a name filter', '**sem', { suggestions: [RSD] }],
  ['a token after a space', 'run **', { suggestions: [R1, R2, RDIV, RSD].map((r) => (r === RDIV ? { ...r, text: '**' } : r)) }],
  ['a token glued to a word', 'x**', { suggestions: [] }],
  ['a markdown bold opener', '**bold', { suggestions: [] }],
  ['a triple star', '***', { suggestions: [] }],
]
for (const [name, text, expected] of picks) {
  test(`GIVEN 2 fired and 1 someday WHEN the box holds ${name} (${JSON.stringify(text)}) THEN the picker rows are exact`, async ($, on) => {
    mock.clock(on, { now: NOW })
    wire(on, PICK_TREE())
    await start($)
    const token = text.split(' ').pop() as string

    const r = await ($ as any).prompt.autocomplete({ text, cursor: text.length, token, start: text.length - token.length } as never)

    expect(r, name).toEqual(expected)
  })
}

const RUN_HOT = [
  `Run reminder ${ID} (Post-hotfix prod check, action): Post-hotfix prod check`,
  `This is an action: call update_reminder {id:"${ID}", action:"start"}, carry out its text above, then update_reminder {id:"${ID}", action:"done", result:<one line>}.`,
].join('\n')
const noteBlock = (id: string, title: string): string =>
  [`Run reminder ${id} (${title}, note): ${title}`, `This is a note: show me its full text above, say it was just a reminder (nothing to execute), then call update_reminder {id:"${id}", action:"done"}.`].join('\n')
const RUN_FRESH = noteBlock(FRESH_ID, 'Fresh')
const submitRows: [string, string, string, string][] = [
  ['one number', '**1', 'composer', RUN_HOT],
  ['a note number', '**2', 'composer', RUN_FRESH],
  ['two numbers with extra words', '**1 **2 only now', 'composer', `${RUN_HOT}\n\n${RUN_FRESH}\nMy extra words: only now`],
  ['a number with extra words', '**1 only the last hour', 'composer', `${RUN_HOT}\nMy extra words: only the last hour`],
  ['a token mid-text', 'please **2 thanks', 'composer', `${RUN_FRESH}\nMy extra words: please thanks`],
  ['a someday id', '**someday_semble', 'composer', noteBlock('someday_semble', 'Try semble')],
  ['bold markdown', 'a **bold** word', 'composer', 'a **bold** word'],
  ['a starred number', '**2**', 'composer', '**2**'],
  ['a number glued to text', '**1**x', 'composer', '**1**x'],
  ['an unknown number', 'use **9 now', 'composer', 'use **9 now'],
  ['a glued prefix', 'x**1', 'composer', 'x**1'],
  ['a non-typed origin', '**1', 'plugin', '**1'],
]
for (const [name, text, kind, expected] of submitRows) {
  test(`GIVEN 2 fired and 1 someday WHEN ${name} (${JSON.stringify(text)}, origin ${kind}) is submitted THEN the text sent is exact`, async ($, on) => {
    mock.clock(on, { now: NOW })
    const ops = wire(on, PICK_TREE())
    await start($)

    await $.prompt.submit({ text, origin: { kind }, wait: false } as never)

    expect(ops.submits, name).toEqual([expected])
  })
}

test('GIVEN a draft with a fired number, a bold word and an unknown number WHEN the box is edited THEN only the fired number is decorated', async ($, on) => {
  mock.clock(on, { now: NOW })
  wire(on, PICK_TREE())
  await start($)
  const text = 'run **1 and **bold** and **7 and **2'

  const r = await ($ as any).prompt.edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText: '2' } as never)

  expect((r as { decorations?: unknown }).decorations, 'decorations').toEqual([
    { start: 4, end: 7, bold: true, color: 'warning' },
    { start: 33, end: 36, bold: true, color: 'warning' },
  ])
})
