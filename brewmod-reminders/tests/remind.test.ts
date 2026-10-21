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
  const ops = { writes: [] as [string, string][], toasts: [] as string[], tools: [] as string[], cmds: [] as unknown[], submits: [] as string[] }
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
  const vars: Record<string, string> = { CLAUDE_CONFIG_DIR: CFG, HOME: '/home/u', TZ: 'Europe/Lisbon' }
  on('env.get', (_$, e) => ({ value: vars[e.name] }) as never)
  on('session.root', () => ({ value: ROOT }) as never)
  on('session.id', () => ({ value: SID }) as never)
  on('ui.toast', (_$, e) => (ops.toasts.push(e.text), { value: undefined }) as never)
  on('command.register', (_$, e) => (ops.cmds.push(e), { value: { command: e.name } }) as never)
  on('tool.register', (_$, e) => (ops.tools.push(e.name), { value: { tool: `${TOOL}${e.name}` } }) as never)
  on('prompt.submit', (_$, e) => (ops.submits.push(e.text), { text: e.text }))
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

test('GIVEN project, global and finished items WHEN /remind list runs THEN the text is grouped, exact, and no turn is handed off', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const tree: Tree = {
    [HOTFIX]: item('2026-10-21T08:03:00Z', 'Post-hotfix prod check'),
    [LATER]: item('2026-10-23T08:00:00Z', 'Rotate keys'),
    [GLOBAL]: item('2026-10-22T08:00:00Z', 'Global thing'),
    [OLD]: item('2026-10-20T09:00:00Z', 'Old task', 'done', 'done: 2026-10-20T10:00:00Z\nresult: ok\n'),
  }
  const ops = wire(on, tree)
  await start($)

  const out = await remind($, 'list')
  await clock.advance(1000)

  expect({ text: out.text, submits: ops.submits }, 'list text and submits').toEqual({
    text: [
      'Now: Wed 21 Oct 15:00 Lisbon (14:00 UTC)',
      'Due (1):',
      '- 20261021-0803_hotfix | Wed 21 Oct 09:03 Lisbon (08:03 UTC), 6 h ago | Post-hotfix prod check',
      'Pending (2):',
      '- 20261022-0800_g (global) | Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | Global thing',
      '- 20261023-0800_later | Fri 23 Oct 09:00 Lisbon (08:00 UTC), in 42 h | Rotate keys',
      'Done (last 10) (1):',
      '- 20261020-0900_old | Tue 20 Oct 10:00 Lisbon (09:00 UTC), 29 h ago | Old task | done 2026-10-20T10:00:00Z | ok',
      `project ${P_DIR} | global ${G_DIR}`,
    ].join('\n'),
    submits: [],
  })
})

const ADD = { scope: 'project', when: 'tomorrow 9:00', text: 'Check prod.', slug: 'Check prod' }
const PREVIEW = [
  'Preview, nothing written: Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | project | 20261022-0800_check-prod',
  'Check prod.',
  'Show the user this time line, get their confirmation with ONE AskUserQuestion (add "Where to save?" with Project (Recommended) / Global when they gave no scope), then call add_reminder again with confirm:true and the final scope, time and text.',
].join('\n')
const rows: [string, object, string, [string, string][]][] = [
  ['no confirm', ADD, PREVIEW, []],
  [
    'confirm',
    { ...ADD, confirm: true },
    `saved 20261022-0800_check-prod (project) | due Thu 22 Oct 09:00 Lisbon (08:00 UTC), in 18 h | ${P_DIR}/20261022-0800_check-prod.md`,
    [[`${P_DIR}/20261022-0800_check-prod.md`, 'due: 2026-10-22T08:00:00Z\nstatus: pending\ncreated: 2026-10-21T14:00:00Z\n\nCheck prod.\n']],
  ],
  ['past time', { ...ADD, when: '2026-10-21 09:00', confirm: true }, '2026-10-21T08:00:00Z is in the past', []],
  ['no scope', { ...ADD, scope: undefined }, 'scope is required: project or global', []],
]
for (const [name, input, text, writes] of rows) {
  test(`GIVEN add_reminder with ${name} WHEN the model calls it THEN the answer and the writes are exact`, async ($, on) => {
    mock.clock(on, { now: NOW })
    const ops = wire(on, {})
    await start($)
    const before = ops.writes.length

    const out = await tool($, 'add_reminder', input)

    expect({ text: out.text, writes: ops.writes.slice(before).filter(([p]) => p.startsWith(P_DIR)) }, name).toEqual({ text, writes })
  })
}

const CLAIM = `${P_DIR}/.claims/20261021-0803_hotfix.json`

test('GIVEN a live claim of another session WHEN start is called THEN it is refused with who and since when, and nothing is written', async ($, on) => {
  mock.clock(on, { now: NOW })
  const ops = wire(on, { [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix'), [CLAIM]: JSON.stringify({ session: 'other', at: NOW - 3600000 }) })
  await start($)
  const before = ops.writes.length

  const out = await tool($, 'update_reminder', { id: 'hotfix', action: 'start' })

  expect({ text: out.text, isError: out.isError, writes: ops.writes.length - before }, 'refusal').toEqual({
    text: '20261021-0803_hotfix is running in session other since Wed 21 Oct 14:00 Lisbon (13:00 UTC), 1 h ago',
    isError: true,
    writes: 0,
  })
})

test('GIVEN a free item WHEN start is called THEN the claim and its .gitignore are written and the text returns', async ($, on) => {
  mock.clock(on, { now: NOW })
  const ops = wire(on, { [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix') })
  await start($)
  const before = ops.writes.length

  const out = await tool($, 'update_reminder', { id: 'hotfix', action: 'start' })

  expect({ text: out.text, writes: ops.writes.slice(before) }, 'start').toEqual({
    text: 'started 20261021-0803_hotfix; carry out the text below, then update_reminder {id, action:"done", result}.\ndue: 2026-10-21T08:03:00Z\nstatus: pending\n\nHotfix\n',
    writes: [
      [`${P_DIR}/.claims/.gitignore`, '*\n'],
      [CLAIM, `{"session":"${SID}","at":${NOW}}`],
    ],
  })
})

test('GIVEN an owned claim WHEN done is called with a result THEN the header is patched, the claim emptied and the body untouched', async ($, on) => {
  mock.clock(on, { now: NOW })
  const ops = wire(on, { [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix'), [CLAIM]: JSON.stringify({ session: SID, at: NOW - 1000 }) })
  await start($)
  const before = ops.writes.length

  const out = await tool($, 'update_reminder', { id: 'hotfix', action: 'done', result: 'prod ok\nno errors' })

  expect({ text: out.text, writes: ops.writes.slice(before) }, 'done').toEqual({
    text: `20261021-0803_hotfix: done | ${HOTFIX}`,
    writes: [
      [HOTFIX, 'due: 2026-10-21T08:03:00Z\nstatus: done\ndone: 2026-10-21T14:00:00Z\nresult: prod ok no errors\n\nHotfix\n'],
      [CLAIM, ''],
    ],
  })
})

test('GIVEN /remind snooze with tomorrow 9:00 WHEN it runs THEN the due line moves to 08:00Z (Lisbon WEST), the status stays pending and no turn is handed off', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const ops = wire(on, { [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix') })
  await start($)
  const before = ops.writes.length

  const out = await remind($, 'snooze hotfix tomorrow 9:00')
  await clock.advance(1000)

  expect({ text: out.text, writes: ops.writes.slice(before), submits: ops.submits }, 'snooze').toEqual({
    text: `20261021-0803_hotfix: snoozed until 2026-10-22T08:00:00Z | ${HOTFIX}`,
    writes: [[HOTFIX, 'due: 2026-10-22T08:00:00Z\nstatus: pending\n\nHotfix\n']],
    submits: [],
  })
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
        `Use the ${TOOL}* tools. To add: add_reminder without confirm first (preview, writes nothing), show me its time line, ONE AskUserQuestion confirming the time (plus the scope when not given), then add_reminder with confirm:true. To look or change: list_reminders, update_reminder.`,
      ].join('\n'),
    ],
  })
})

const flat = (n: any): string[] => (n === null || typeof n !== 'object' ? (typeof n === 'string' ? [n] : []) : n.type === 'Text' ? [(n.children ?? []).flatMap(flat).join('')] : (n.children ?? []).flatMap(flat))

test('GIVEN one due and four upcoming items WHEN the band is drawn THEN it shows the counts, 3 rows, +2 more and the /remind hint', async ($, on) => {
  mock.clock(on, { now: NOW })
  const tree: Tree = { [HOTFIX]: item('2026-10-21T08:03:00Z', 'Hotfix'), [GLOBAL]: item('2026-10-22T08:00:00Z', 'Global thing') }
  for (const d of [24, 25, 26]) tree[`${P_DIR}/202610${d}-0800_x${d}.md`] = item(`2026-10-${d}T08:00:00Z`, `Task ${d}`)
  wire(on, tree)
  await start($)

  const ui = await $.ui.mount({
    plugin: 'brewmod-reminders',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 24, bodyColumns: 100, scroll: { bodyRows: 23, offset: 0 }, view: {} },
  })

  expect(flat(await ui.drawn()), 'band rows').toEqual([
    'reminders · 1 due · 4 upcoming',
    '  Hotfix  6 h ago',
    '  Global thing  in 18 h (global)',
    '  Task 24  in 3 d',
    '+2 more · /remind  list · done · snooze · or say what to add',
  ])
  await ui.unmount()
})

test('GIVEN an item due in 30 s WHEN the 60 s tick fires THEN one toast names it, and the next tick adds none', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const ops = wire(on, { [LATER]: item('2026-10-21T14:00:30Z', 'Rotate keys') })
  await start($)

  await clock.advance(60_000)
  await clock.advance(60_000)

  expect(ops.toasts, 'toasts').toEqual(['reminder due: Rotate keys · /remind'])
})
