// Run: node --test brewmod-reminders/tests/remind.test.mjs (plain Node; `claude plugin test` runs *.test.ts only)
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from '../hooks/remind.mjs'
import { bodyOf, buildItem, classify, closedLabel, editText, expiredIds, formatWhen, itemName, matchId, parseItem, parseWhen, parseWhenNatural, patchBody, patchHeader, rangeOf, reopenPatch, sections, windowOf } from '../hooks/lib/items.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'hooks', 'remind.mjs')
const PROTO = '20261022-0803_post-hotfix-check.md'
const PROTO_PATH = (ctx) => join(ctx.proj, '.claude', 'scheduled', PROTO)
const NOW = '2026-10-22T09:00:00Z'
const item = (due, status, body = 'Check prod.') => `due: ${due}\nstatus: ${status}\n\n${body}\n`

const newCtx = (t) => {
  const ctx = { proj: mkdtempSync(join(tmpdir(), 'remind-p-')), cfg: mkdtempSync(join(tmpdir(), 'remind-c-')), plugin: mkdtempSync(join(tmpdir(), 'remind-r-')) }
  t.after(() => Object.values(ctx).forEach((d) => rmSync(d, { recursive: true, force: true })))
  return ctx
}
const put = (dir, name, text) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), text)
}
const sched = (ctx, name, text) => put(join(ctx.proj, '.claude', 'scheduled'), name, text)
const session = (ctx, interactive) => put(join(ctx.plugin, '.state'), 'session-s1.json', JSON.stringify({ isInteractive: interactive, ts: 1 }))

const call = (ctx, env, extra) =>
  new Promise((resolve) => {
    const payload = { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hi', source: 'user', cwd: ctx.proj, ...extra }
    const input = extra === 'garbage' ? '{not json' : JSON.stringify(payload)
    const base = { PATH: process.env.PATH, TZ: 'Europe/Lisbon', CLAUDE_PLUGIN_ROOT: ctx.plugin, CLAUDE_PROJECT_DIR: ctx.proj, CLAUDE_CONFIG_DIR: ctx.cfg, HOME: ctx.cfg, REMIND_NOW: NOW }
    const p = spawn('node', [SCRIPT], { env: { ...base, ...env } })
    let stdout = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.on('close', (rc) => {
      const text = JSON.parse(stdout).hookSpecificOutput?.additionalContext
      resolve({ rc, text, ids: text === undefined ? null : text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).split(' | ')[0]) })
    })
    p.stdin.end(input)
  })

const IDS = (...ids) => ({ rc: 0, ids })
const NONE = { rc: 0, ids: null }
const A = '20261021-0800_a'
const old = (ctx) => sched(ctx, `${A}.md`, item('2026-10-21T08:00:00Z', 'pending'))

const rows = [
  ['due item is offered', (c) => old(c), [{}], [IDS(A)]],
  ['future item is silent', (c) => sched(c, 'x.md', item('2026-10-23T08:00:00Z', 'pending')), [{}], [NONE]],
  ['done item is silent', (c) => sched(c, 'x.md', item('2026-10-21T08:00:00Z', 'done')), [{}], [NONE]],
  ['cancelled item is silent', (c) => sched(c, 'x.md', item('2026-10-21T08:00:00Z', 'cancelled')), [{}], [NONE]],
  ['naive due is listed as unreadable', (c) => sched(c, 'x.md', item('2026-10-21T08:00:00', 'pending')), [{}], [IDS('x')]],
  ['missing dir is silent', () => {}, [{}], [NONE]],
  ['README.md is skipped', (c) => sched(c, 'README.md', item('2026-10-21T08:00:00Z', 'pending')), [{}], [NONE]],
  ['body status: done is ignored', (c) => sched(c, 'x.md', item('2026-10-21T08:00:00Z', 'pending', 'status: done\ndone: 2026-10-21T09:00:00Z')), [{}], [IDS('x')]],
  ['fenced header parses', (c) => sched(c, 'x.md', '---\r\ndue: 2026-10-21T08:00:00Z\r\nstatus: pending\r\n---\r\nBody\r\n'), [{}], [IDS('x')]],
  ['global item is marked', (c) => put(join(c.cfg, 'reminders'), 'g.md', item('2026-10-21T08:00:00Z', 'pending')), [{}], [IDS('g (global)')]],
  ['source sdk is silent', old, [{ source: 'sdk' }], [NONE]],
  ['absent source + interactive session is offered', (c) => (old(c), session(c, true)), [{ source: undefined }], [IDS(A)]],
  ['absent source + non-interactive session is silent', (c) => (old(c), session(c, false)), [{ source: undefined }], [NONE]],
  ['absent source + no session file is silent', old, [{ source: undefined }], [NONE]],
  ['hand-off prompt is skipped and not marked offered', old, [{ prompt: 'Reminder helper. My request: <request>x</request>\nNow: y' }, {}], [NONE, IDS(A)]],
  ['slash prompt is skipped', old, [{ prompt: '/remind list' }], [NONE]],
  ['a **N expansion prompt is skipped and not marked offered', old, [{ prompt: 'Run reminder x (y, action): z' }, {}], [NONE, IDS(A)]],
  ['someday item is silent', (c) => sched(c, 'someday_x.md', item('none', 'pending')), [{}], [NONE]],
  ['a note-kind due item is offered', (c) => sched(c, 'x.md', 'due: 2026-10-21T08:00:00Z\nstatus: pending\nkind: note\n\nrenew domain\n'), [{}], [IDS('x')]],
  ['invalid session id is silent', old, [{ session_id: '../x' }], [NONE]],
  ['offered once per session', old, [{}, {}], [IDS(A), NONE]],
  ['re-offered after compact', old, [{}, { hook_event_name: 'SessionStart', source: 'compact', prompt: undefined }, {}], [IDS(A), NONE, IDS(A)]],
  ['other session still offered', old, [{}, { session_id: 's2' }], [IDS(A), IDS(A)]],
  ['live foreign claim hides the item', (c) => (old(c), put(join(c.proj, '.claude', 'scheduled', '.claims'), `${A}.json`, JSON.stringify({ session: 'o', at: Date.parse(NOW) - 3600000 }))), [{}], [NONE]],
  ['expired claim is offered again', (c) => (old(c), put(join(c.proj, '.claude', 'scheduled', '.claims'), `${A}.json`, JSON.stringify({ session: 'o', at: Date.parse(NOW) - 7 * 3600000 }))), [{}], [IDS(A)]],
  ['scheduled path is a file: fail open', (c) => put(join(c.proj, '.claude'), 'scheduled', 'not a dir'), [{}], [NONE]],
  ['garbage stdin: fail open', old, ['garbage'], [NONE]],
  ['absolute path prompt is offered', old, [{ prompt: '/Users/me/app.log shows a 500' }], [IDS(A)]],
  ['slash command with args is skipped', old, [{ prompt: '  /remind x' }], [NONE]],
  ['bare slash command is skipped', old, [{ prompt: '/help' }], [NONE]],
  ['BOM before an unfenced header is offered', (c) => sched(c, 'x.md', `\uFEFF${item('2026-10-21T08:00:00Z', 'pending')}`), [{}], [IDS('x')]],
  [
    'REMIND_GLOBAL_DIR overrides CLAUDE_CONFIG_DIR/reminders',
    (c) => (put(join(c.cfg, 'alt'), 'o.md', item('2026-10-21T08:00:00Z', 'pending')), put(join(c.cfg, 'reminders'), 'c.md', item('2026-10-21T08:00:00Z', 'pending'))),
    [{}],
    [IDS('o (global)')],
    (c) => ({ REMIND_GLOBAL_DIR: join(c.cfg, 'alt') }),
  ],
]

describe('offer rows', { concurrency: true }, () => {
  for (const [name, setup, extras, expected, envOf = () => ({})] of rows) {
    test(`GIVEN ${name} WHEN remind.mjs runs THEN the offered ids and rc are exact`, async (t) => {
      const ctx = newCtx(t)
      setup(ctx)
      const got = []
      for (const x of extras) {
        const { rc, ids } = await call(ctx, envOf(ctx), x)
        got.push({ rc, ids })
      }
      assert.deepEqual(got, expected, name)
    })
  }
})

test('GIVEN the prototype file verbatim WHEN remind.mjs runs THEN the offer text is exact', async (t) => {
  const ctx = newCtx(t)
  mkdirSync(join(ctx.proj, '.claude', 'scheduled'), { recursive: true })
  copyFileSync(join(HERE, 'fixtures', PROTO), PROTO_PATH(ctx))
  writeFileSync(join(ctx.proj, '.claude', 'reminders.json'), '{"git":"commit-push"}')
  writeFileSync(join(ctx.proj, '.claude', 'settings.json'), '{"hooks":{"SessionStart":[{"hooks":[{"command":"x/due-checks.sh"}]}]}}')
  const first = await call(ctx, {}, {})
  const expected = [
    'Reminders are due (1), stored as files:',
    `- ${PROTO.replace('.md', '')} | due Thu 22 Oct 09:03 Lisbon (08:03 UTC), 57 min ago | ▶ action | Post-hotfix prod check for v1.115.1 (main 24e2f198, deployed 2026-10-21 ~13:30Z) | ${PROTO_PATH(ctx)}`,
    "Start your reply with ONE line, in the user's language, saying what fired, before anything else; then continue with the steps below and answer their prompt as usual.",
    'Actions: tell the user in one line, in their language, what fired and offer for each: run now, snooze, mark done, or cancel. Never run one unasked. Say plainly when one is more than 24 h late.',
    'Run accepted: update_reminder {id, action:"start"}, read the file, carry out its body, then update_reminder {id, action:"done", result}. Snooze: {id, action:"snooze", until}; cancel: {id, action:"cancel"}.',
    'update_reminder unavailable -> edit the file header: `status: done` plus `done: <UTC now, YYYY-MM-DDTHH:MM:SSZ>` (cancel: `status: cancelled` plus `cancelled: <UTC>`); never touch the body.',
    "Git: after changing an item file, commit only that file and push following the repo's conventions; never stage anything else.",
    'Legacy: .claude/settings.json still registers the old due-checks.sh hook; tell the user to remove it, brewmod-reminders replaces it.',
  ].join('\n')
  assert.deepEqual({ rc: first.rc, text: first.text, state: readdirSync(join(ctx.plugin, '.state')) }, { rc: 0, text: expected, state: ['offered-s1.json'] }, 'exact offer and one marks file')
})

const pruneRows = [
  ['a due item is offered', old, ['notes.txt', 'offered-s1.json']],
  ['nothing is offered', (c) => sched(c, 'x.md', item('2026-10-23T08:00:00Z', 'pending')), ['notes.txt']],
]
for (const [name, setup, left] of pruneRows) {
  test(`GIVEN a 8-day-old foreign state file and ${name} WHEN the hook runs THEN it is pruned and the non-state file stays`, async (t) => {
    const ctx = newCtx(t)
    setup(ctx)
    const dir = join(ctx.plugin, '.state')
    put(dir, 'offered-zz.json', '{}')
    put(dir, 'notes.txt', 'keep')
    const old8 = new Date(Date.parse(NOW) - 8 * 86400000)
    utimesSync(join(dir, 'offered-zz.json'), old8, old8)
    await call(ctx, {}, {})
    assert.deepEqual(readdirSync(dir).sort(), left, name)
  })
}

const LIS = 'Europe/Lisbon'
const T0 = Date.parse('2026-03-01T00:00:00Z')
const when = [
  ['ISO with Z', '2026-10-22T08:00:00Z', 'UTC', { ok: true, ms: Date.parse('2026-10-22T08:00:00Z'), iso: '2026-10-22T08:00:00Z' }],
  ['ISO with offset', '2026-10-22T09:00:00+01:00', LIS, { ok: true, ms: Date.parse('2026-10-22T08:00:00Z'), iso: '2026-10-22T08:00:00Z' }],
  ['local before DST change (WET, +0)', '2026-03-28 09:00', LIS, { ok: true, ms: Date.parse('2026-03-28T09:00:00Z'), iso: '2026-03-28T09:00:00Z' }],
  ['local after DST change (WEST, +1)', '2026-03-30 09:00', LIS, { ok: true, ms: Date.parse('2026-03-30T08:00:00Z'), iso: '2026-03-30T08:00:00Z' }],
  ['local in the DST gap', '2026-03-29 01:30', LIS, { ok: false, error: '"2026-03-29 01:30" does not exist in Europe/Lisbon (DST gap)' }],
  ['relative hours', '+2h', LIS, { ok: true, ms: T0 + 7200000, iso: '2026-03-01T02:00:00Z' }],
  ['past is rejected', '2026-02-01 09:00', LIS, { ok: false, error: '2026-02-01T09:00:00Z is in the past' }],
  ['garbage is rejected', 'tomorrow', LIS, { ok: false, error: 'unrecognised time "tomorrow": use ISO with offset/Z, "YYYY-MM-DD HH:MM", "YYYY-MM-DD" (00:00 local), a weekday like "fri 14:00" or +<n>m|h|d|w' }],
  ['relative weeks', '+1w', LIS, { ok: true, ms: T0 + 7 * 86400000, iso: '2026-03-08T00:00:00Z' }],
  ['date only before the DST change (00:00 WET)', '2026-03-28', LIS, { ok: true, ms: Date.parse('2026-03-28T00:00:00Z'), iso: '2026-03-28T00:00:00Z' }],
  ['date only after the DST change (00:00 WEST)', '2026-03-30', LIS, { ok: true, ms: Date.parse('2026-03-29T23:00:00Z'), iso: '2026-03-29T23:00:00Z' }],
  ['date only in the past', '2026-02-01', LIS, { ok: false, error: '2026-02-01T00:00:00Z is in the past' }],
  ['unknown zone', '2026-10-22 09:00', 'Mars/Base', { ok: false, error: 'unknown time zone "Mars/Base"' }],
  ['relative beyond the date range', '+99999999d', LIS, { ok: false, error: '"+99999999d" is out of range' }],
]
test('GIVEN when inputs across the Lisbon DST change WHEN parseWhen and formatWhen run THEN results are exact', () => {
  const got = { parsed: when.map(([, s, tz]) => parseWhen(s, T0, tz)), formatted: formatWhen(Date.parse('2026-03-30T08:00:00Z'), LIS, T0) }
  assert.deepEqual(got, { parsed: when.map((r) => r[3]), formatted: 'Mon 30 Mar 09:00 Lisbon (08:00 UTC), in 29 d' }, 'parseWhen rows and formatWhen after the change')
})

const NAT_NOW = Date.parse('2026-10-24T22:30:00Z')
const natural = [
  ['tomorrow 9:00 across the DST end (25 Oct, +0 after)', 'tomorrow 9:00', LIS, { ok: true, ms: Date.parse('2026-10-25T09:00:00Z'), iso: '2026-10-25T09:00:00Z' }],
  ['today 23:30 equals now (22:30Z) so it is past', 'today 23:30', LIS, { ok: false, error: '2026-10-24T22:30:00Z is in the past' }],
  ['today 23:45 is 22:45Z, ahead', 'today 23:45', LIS, { ok: true, ms: Date.parse('2026-10-24T22:45:00Z'), iso: '2026-10-24T22:45:00Z' }],
  ['tomorrow with hour only', 'Tomorrow 7', 'UTC', { ok: true, ms: Date.parse('2026-10-25T07:00:00Z'), iso: '2026-10-25T07:00:00Z' }],
  ['plain forms pass through', '+30m', LIS, { ok: true, ms: NAT_NOW + 1800000, iso: '2026-10-24T23:00:00Z' }],
  ['unknown zone', 'tomorrow 9:00', 'Mars/Base', { ok: false, error: 'unknown time zone "Mars/Base"' }],
]
const WED = Date.parse('2026-10-21T12:00:00Z')
const FRI = Date.parse('2026-10-23T12:00:00Z')
const SAT = Date.parse('2026-10-24T22:30:00Z')
const weekdays = [
  ['Wed -> fri 14:00 is the same week (WEST, +1)', 'fri 14:00', WED, LIS, { ok: true, ms: Date.parse('2026-10-23T13:00:00Z'), iso: '2026-10-23T13:00:00Z' }],
  ['Fri -> fri is next week', 'fri 14:00', FRI, LIS, { ok: true, ms: Date.parse('2026-10-30T14:00:00Z'), iso: '2026-10-30T14:00:00Z' }],
  ['full name, case-insensitive, default 09:00 (after DST end, +0)', 'Monday', FRI, LIS, { ok: true, ms: Date.parse('2026-10-26T09:00:00Z'), iso: '2026-10-26T09:00:00Z' }],
  ['Lisbon week across the DST end (Sat 22:30Z is Sat 23:30 WEST -> sun 8)', 'sun 8', SAT, LIS, { ok: true, ms: Date.parse('2026-10-25T08:00:00Z'), iso: '2026-10-25T08:00:00Z' }],
  ['bad hour is rejected', 'fri 25:00', WED, LIS, { ok: false, error: 'invalid date/time "2026-10-23 25:00"' }],
]
test('GIVEN weekday names WHEN parseWhenNatural runs THEN it picks the next such day strictly after today', () => {
  assert.deepEqual(weekdays.map(([, s, now, tz]) => parseWhenNatural(s, now, tz)), weekdays.map((r) => r[4]), 'weekday rows')
})
test('GIVEN today/tomorrow wall times near the Lisbon DST end WHEN parseWhenNatural runs THEN the results are exact', () => {
  assert.deepEqual(natural.map(([, s, tz]) => parseWhenNatural(s, NAT_NOW, tz)), natural.map((r) => r[3]), 'natural rows')
})

test('GIVEN an offered item whose due line was snoozed WHEN the next prompt arrives THEN it is offered again once it is due', async (t) => {
  const ctx = newCtx(t)
  old(ctx)
  const first = (await call(ctx, {}, {})).ids
  sched(ctx, `${A}.md`, item('2026-10-22T08:30:00Z', 'pending'))
  const later = (await call(ctx, {}, {})).ids
  assert.deepEqual({ first, later }, { first: [A], later: [A] }, 'offered before and after the snooze moved due into the past')
})

const patches = [
  ['BOM and unfenced header (snooze)', '\uFEFFdue: A\nstatus: pending\n\nbody\n', { due: 'B', status: 'pending' }, '\uFEFFdue: B\nstatus: pending\n\nbody\n'],
  ['LF header and a mixed-EOL body', 'due: A\nstatus: pending\n\nline1\r\nline2\n', { status: 'done', done: 'Z' }, 'due: A\nstatus: done\ndone: Z\n\nline1\r\nline2\n'],
  ['CRLF file', 'due: A\r\nstatus: pending\r\n\r\nb\r\n', { status: 'done' }, 'due: A\r\nstatus: done\r\n\r\nb\r\n'],
  ['fenced header', '---\ndue: A\nstatus: pending\n---\nBody\n', { status: 'done', done: 'Z' }, '---\ndue: A\nstatus: done\ndone: Z\n---\nBody\n'],
]
test('GIVEN BOM, mixed-EOL and fenced item files WHEN patchHeader runs THEN only the header changes and parseItem reads the BOM file', () => {
  const got = { patched: patches.map(([, text, patch]) => patchHeader(text, patch)), bomStatus: parseItem('x.md', patches[0][1]).status }
  assert.deepEqual(got, { patched: patches.map((p) => p[3]), bomStatus: 'pending' }, 'patched texts and BOM status')
})

test('GIVEN remind.mjs imported in-process WHEN run gets an invalid session id THEN it returns {} and the import wrote nothing', () => {
  assert.deepEqual(run({ hook_event_name: 'UserPromptSubmit', session_id: '../x' }, {}), {}, 'import-safe module and fail-open run')
})

// NOW 2026-10-21 (Wed) 14:00Z; Lisbon is WEST until 25 Oct 01:00Z, so a local day starts at 23:00Z the day before, then at 00:00Z.
const W_NOW = Date.parse('2026-10-21T14:00:00Z')
const z = (iso) => Date.parse(iso)
const windows = [
  ['today', 'today', { from: z('2026-10-20T23:00:00Z'), to: z('2026-10-21T23:00:00Z') }],
  ['tomorrow', 'tomorrow', { from: z('2026-10-21T23:00:00Z'), to: z('2026-10-22T23:00:00Z') }],
  ['week ends Sunday 23:59 local (Mon 26 Oct 00:00 WET)', 'week', { from: W_NOW, to: z('2026-10-26T00:00:00Z') }],
  ['+3d', '+3d', { from: W_NOW, to: W_NOW + 3 * 86400000 }],
  ['+2w', '+2w', { from: W_NOW, to: W_NOW + 14 * 86400000 }],
  ['until a date runs through that local day', 'until 2026-10-25', { from: W_NOW, to: z('2026-10-26T00:00:00Z') }],
  ['an unknown word', 'soon', null],
  ['a bad until date', 'until 2026-13-45', null],
]
test('GIVEN window words WHEN windowOf runs in Lisbon THEN from and to are exact', () => {
  assert.deepEqual(windows.map(([, s]) => windowOf(s, W_NOW, LIS)), windows.map((r) => r[2]), 'window rows')
})

const ranges = [
  ['nothing', [undefined, undefined], { ok: true, from: -Infinity, to: Infinity }],
  ['a window word alone', ['week', undefined], { ok: true, from: W_NOW, to: z('2026-10-26T00:00:00Z') }],
  ['ISO from and to', ['2026-10-22T00:00:00Z', '2026-10-23T00:00:00Z'], { ok: true, from: z('2026-10-22T00:00:00Z'), to: z('2026-10-23T00:00:00Z') }],
  ['a date-only to runs through that day', ['2026-10-22', '2026-10-22'], { ok: true, from: z('2026-10-21T23:00:00Z'), to: z('2026-10-22T23:00:00Z') }],
  ['garbage', ['soon', undefined], { ok: false, error: 'unrecognised time "soon": use ISO with offset/Z, "YYYY-MM-DD HH:MM", "YYYY-MM-DD" (00:00 local), a weekday like "fri 14:00" or +<n>m|h|d|w' }],
]
test('GIVEN from/to values WHEN rangeOf runs in Lisbon THEN the range is exact', () => {
  assert.deepEqual(ranges.map(([, [a, b]]) => rangeOf(a, b, W_NOW, LIS)), ranges.map((r) => r[2]), 'range rows')
})

const N0 = Date.parse('2026-10-21T14:00:00Z')
const parsedRows = [
  ['prototype file without kind', PROTO, item('2026-10-22T08:03:00Z', 'pending'), { kind: 'action', someday: false, due: Date.parse('2026-10-22T08:03:00Z'), state: 'pending' }],
  ['note kind, due in the past', 'a.md', 'due: 2026-10-20T08:00:00Z\nstatus: pending\nkind: Note\n\nrenew\n', { kind: 'note', someday: false, due: Date.parse('2026-10-20T08:00:00Z'), state: 'due' }],
  ['unknown kind reads as action', 'a.md', 'due: 2026-10-20T08:00:00Z\nstatus: pending\nkind: weird\n\nx\n', { kind: 'action', someday: false, due: Date.parse('2026-10-20T08:00:00Z'), state: 'due' }],
  ['due none is someday', 'someday_x.md', 'due: NONE\nstatus: pending\n\nx\n', { kind: 'action', someday: true, due: null, state: 'someday' }],
  ['naive due stays unparseable', 'a.md', item('2026-10-21T08:00:00', 'pending'), { kind: 'action', someday: false, due: null, state: 'unparseable' }],
  ['done someday is done', 'someday_x.md', 'due: none\nstatus: done\n\nx\n', { kind: 'action', someday: true, due: null, state: 'done' }],
]
test('GIVEN kind and someday headers WHEN parseItem and classify run THEN kind, someday, due and state are exact', () => {
  const got = parsedRows.map(([, name, text]) => {
    const i = parseItem(name, text)
    return { kind: i.kind, someday: i.someday, due: i.due, state: classify(i, null, N0) }
  })
  assert.deepEqual(got, parsedRows.map((r) => r[3]), 'parse rows')
})

test('GIVEN dated, someday and colliding slugs WHEN itemName, buildItem and matchId run THEN names and files are exact', () => {
  const got = {
    dated: itemName(Date.parse('2026-10-22T08:03:00Z'), 'Check prod'),
    someday: itemName(null, 'Check prod'),
    file: [buildItem({ dueMs: null, text: ' x ', now: N0, kind: 'note' }), buildItem({ dueMs: N0, text: 'x', now: N0 })],
    match: matchId(['20261022-0803_check-prod', 'someday_check-prod'], 'check-prod'),
  }
  assert.deepEqual(got, {
    dated: '20261022-0803_check-prod.md',
    someday: 'someday_check-prod.md',
    file: ['due: none\nstatus: pending\nkind: note\ncreated: 2026-10-21T14:00:00Z\n\nx\n', 'due: 2026-10-21T14:00:00Z\nstatus: pending\ncreated: 2026-10-21T14:00:00Z\n\nx\n'],
    match: { error: 'ambiguous', candidates: ['20261022-0803_check-prod', 'someday_check-prod'] },
  }, 'names, built files and slug ambiguity')
})

const mk = (id, status, f = {}) => parseItem(`${id}.md`, `due: ${f.due ?? '2026-10-20T08:00:00Z'}\nstatus: ${status}\n${f.kind ? `kind: ${f.kind}\n` : ''}${f.created ? `created: ${f.created}\n` : ''}${f.done ? `done: ${f.done}\n` : ''}${f.cancelled ? `cancelled: ${f.cancelled}\n` : ''}\nbody\n`)
const bundle = [
  mk('f2', 'pending', { due: '2026-10-21T10:00:00Z' }),
  mk('f1', 'pending', { due: '2026-10-21T09:00:00Z' }),
  mk('w1', 'pending', { due: '2026-10-25T09:00:00Z' }),
  mk('s2', 'pending', { due: 'none', created: '2026-10-19T00:00:00Z' }),
  mk('s1', 'pending', { due: 'none', created: '2026-10-18T00:00:00Z' }),
  mk('h1', 'done', { done: '2026-10-20T00:00:00Z', kind: 'note' }),
  mk('h2', 'cancelled', { cancelled: '2026-10-21T00:00:00Z' }),
  mk('h3', 'done', { done: '2026-10-19T00:00:00Z' }),
  mk('x', 'weird'),
]
test('GIVEN fired, waiting, someday and closed items WHEN sections and closedLabel run THEN order and labels are exact', () => {
  const s = sections(bundle.map((item) => ({ item, state: classify(item, null, N0) })))
  const ids = (rows) => rows.map((r) => r.item.id)
  assert.deepEqual(
    { fired: ids(s.fired), running: ids(s.running), waiting: ids(s.waiting), someday: ids(s.someday), history: ids(s.history), labels: s.history.map((r) => closedLabel(r.item)) },
    { fired: ['f1', 'f2'], running: [], waiting: ['w1'], someday: ['s1', 's2'], history: ['h2', 'h1', 'h3'], labels: ['cancelled', 'shown', 'done'] },
    'sections and history labels',
  )
})

const old30 = '2026-09-20T00:00:00Z'
const expRows = [
  ['default 30 days', 30, ['d-old', 'c-old']],
  ['7 days', 7, ['d-old', 'c-old', 'd-mid']],
  ['invalid falls back to 30', Number.NaN, ['d-old', 'c-old']],
]
test('GIVEN old closed, recent closed, pending, someday and undated-closed items WHEN expiredIds runs THEN only old closed ids return', () => {
  const items = [
    mk('d-old', 'done', { done: old30 }),
    mk('c-old', 'cancelled', { cancelled: old30 }),
    mk('d-mid', 'done', { done: '2026-10-10T00:00:00Z' }),
    mk('d-new', 'done', { done: '2026-10-20T00:00:00Z' }),
    mk('d-bad', 'done', {}),
    mk('p', 'pending', { due: '2026-01-01T00:00:00Z' }),
    mk('s', 'pending', { due: 'none', created: '2025-01-01T00:00:00Z' }),
  ]
  assert.deepEqual(expRows.map(([, d]) => expiredIds(items, N0, d)), expRows.map((r) => r[2]), 'expired rows')
})

const edits = [
  ['reopen with a new time', 'due: A\nstatus: done\ndone: Z\nresult: ok\n\nb\n', patchHeader('due: A\nstatus: done\ndone: Z\nresult: ok\n\nb\n', reopenPatch(N0)), 'due: 2026-10-21T14:00:00Z\nstatus: pending\n\nb\n'],
  ['reopen keeps the old due', 'due: A\nstatus: cancelled\ncancelled: Z\n\nb\n', patchHeader('due: A\nstatus: cancelled\ncancelled: Z\n\nb\n', reopenPatch()), 'due: A\nstatus: pending\n\nb\n'],
  ['someday gets a date and kind', 'due: none\nstatus: pending\n\nb\n', editText('due: none\nstatus: pending\n\nb\n', { dueMs: N0, kind: 'note' }), 'due: 2026-10-21T14:00:00Z\nstatus: pending\nkind: note\n\nb\n'],
  ['dated goes someday with new text (CRLF)', 'due: A\r\nstatus: pending\r\n\r\nold\r\n', editText('due: A\r\nstatus: pending\r\n\r\nold\r\n', { dueMs: null, text: ' new ' }), 'due: none\r\nstatus: pending\r\n\r\nnew\r\n'],
  ['BOM and fenced body replace', '\uFEFF---\ndue: A\nstatus: pending\n---\nold\n', patchBody('\uFEFF---\ndue: A\nstatus: pending\n---\nold\n', 'new'), '\uFEFF---\ndue: A\nstatus: pending\n---\nnew\n'],
  ['no change returns the text', 'due: A\nstatus: pending\n\nb\n', editText('due: A\nstatus: pending\n\nb\n', {}), 'due: A\nstatus: pending\n\nb\n'],
]
test('GIVEN closed, someday, CRLF and fenced files WHEN reopen/edit helpers run THEN the new file texts are exact', () => {
  assert.deepEqual(edits.map((r) => r[2]), edits.map((r) => r[3]), 'edit rows')
})

const bodies = [
  ['plain header', 'due: A\nstatus: pending\n\nline1\nline2\n', 'line1\nline2'],
  ['fenced CRLF with BOM', '\uFEFF---\r\ndue: A\r\n---\r\nBody\r\n', 'Body'],
  ['no header lines', '\nonly body\n', 'only body'],
]
test('GIVEN plain, fenced and header-less files WHEN bodyOf runs THEN the trimmed body is exact', () => {
  assert.deepEqual(bodies.map(([, t]) => bodyOf(t)), bodies.map((r) => r[2]), 'body rows')
})

const T0Z = Date.parse(NOW)
const min = (n) => new Date(T0Z + n * 60000).toISOString()
const B = '20261022-0905_b'
const noSeed = () => {}
const seedB = (ctx) => sched(ctx, `${B}.md`, item('2026-10-22T09:05:00Z', 'pending'))
const LABEL = { [A]: 'A', [B]: 'B', none: 'none' }
const cooldownRows = [
  ['default 60 min: silent at +30, nudge at +61', {}, [[0, 'A', noSeed], [30, 'none', noSeed], [61, 'A', noSeed]]],
  ['5 min cooldown: nudge at +30', { CLAUDE_PLUGIN_OPTION_COOLDOWNMINUTES: '5' }, [[0, 'A', noSeed], [3, 'none', noSeed], [30, 'A', noSeed]]],
  ['0 min cooldown: every prompt', { CLAUDE_PLUGIN_OPTION_COOLDOWNMINUTES: '0' }, [[0, 'A', noSeed], [1, 'A', noSeed]]],
  ['an unusable option falls back to 60', { CLAUDE_PLUGIN_OPTION_COOLDOWNMINUTES: 'abc' }, [[0, 'A', noSeed], [30, 'none', noSeed], [61, 'A', noSeed]]],
  ['a newly fired item skips the cooldown and lists both', {}, [[0, 'A', noSeed], [10, 'AB', seedB]]],
]
for (const [name, env, steps] of cooldownRows) {
  test(`GIVEN ${name} WHEN prompts arrive at those minutes THEN each offers exactly the listed items`, async (t) => {
    const ctx = newCtx(t)
    old(ctx)
    const got = []
    for (const [m, , seed] of steps) {
      seed(ctx)
      const r = await call(ctx, { ...env, REMIND_NOW: min(m) }, {})
      got.push([m, (r.ids ?? ['none']).map((x) => LABEL[x]).join('')])
    }
    assert.deepEqual(got, steps.map(([m, want]) => [m, want]), name)
  })
}

test('GIVEN a fired note and a fired action WHEN remind.mjs runs THEN the note text is in full and the model is told to close it', async (t) => {
  const ctx = newCtx(t)
  sched(ctx, '20261021-0900_csv.md', 'due: 2026-10-21T09:00:00Z\nstatus: pending\nkind: note\n\nFinish the CSV export.\nEndpoint first.\n')
  sched(ctx, '20261021-0800_prod.md', item('2026-10-21T08:00:00Z', 'pending', 'Check prod.'))
  const r = await call(ctx, {}, {})
  const p = (n) => join(ctx.proj, '.claude', 'scheduled', n)
  assert.deepEqual(r.text.split('\n'), [
    'Reminders are due (2), stored as files:',
    `- 20261021-0800_prod | due Wed 21 Oct 09:00 Lisbon (08:00 UTC), 25 h ago | OVERDUE by 25 h | ▶ action | Check prod. | ${p('20261021-0800_prod.md')}`,
    `- 20261021-0900_csv | due Wed 21 Oct 10:00 Lisbon (09:00 UTC), 24 h ago | ✎ note | Finish the CSV export. | ${p('20261021-0900_csv.md')}`,
    '  | Finish the CSV export.',
    '  | Endpoint first.',
    "Start your reply with ONE line, in the user's language, saying what fired, before anything else; then continue with the steps below and answer their prompt as usual.",
    'Actions: tell the user in one line, in their language, what fired and offer for each: run now, snooze, mark done, or cancel. Never run one unasked. Say plainly when one is more than 24 h late.',
    'Notes (kind note, text above after "|"): show each note\'s full text to the user now, say it was just a reminder (nothing to execute), then call update_reminder {id, action:"done"} for it without asking, then answer their prompt as usual.',
    'Run accepted: update_reminder {id, action:"start"}, read the file, carry out its body, then update_reminder {id, action:"done", result}. Snooze: {id, action:"snooze", until}; cancel: {id, action:"cancel"}.',
    'update_reminder unavailable -> edit the file header: `status: done` plus `done: <UTC now, YYYY-MM-DDTHH:MM:SSZ>` (cancel: `status: cancelled` plus `cancelled: <UTC>`); never touch the body.',
  ], 'exact offer lines')
})

const PEND = '20261020-0800_pending'
const KEPT = ['20260901-0800_new-done.md', `${PEND}.md`, 'someday_s.md']
const OLD = ['20260702-0800_old-cancelled', '20260801-0800_old-done']
const expiredHead = (git, tail) =>
  `Expired reminder files (2), closed over 30 days ago; kept because .claude/reminders.json sets git: ${git}. Delete each file, then commit only these deletions${tail} following the repo's conventions; never stage anything else. Mention it to the user in one line.`
const cleanRows = [
  ['default 30 days', {}, '{}', KEPT, [], [], [PEND], []],
  ['keepDays 90', { CLAUDE_PLUGIN_OPTION_KEEPDAYS: '90' }, '{}', ['20260801-0800_old-done.md', ...KEPT], ['20260801-0800_old-done.json'], ['20260801-0800_g-done.md'], [PEND], []],
  ['an unusable keepDays falls back to 30', { CLAUDE_PLUGIN_OPTION_KEEPDAYS: '0' }, '{}', KEPT, [], [], [PEND], []],
  ['git commit keeps project files and offers them', {}, '{"git":"commit"}', [...OLD.map((n) => `${n}.md`), ...KEPT], [], [], [PEND, ...OLD], [expiredHead('commit', ' (no push)')]],
  ['git commit-push keeps project files and offers them', {}, '{"git":"commit-push"}', [...OLD.map((n) => `${n}.md`), ...KEPT], [], [], [PEND, ...OLD], [expiredHead('commit-push', ' and push')]],
]
for (const [name, env, config, files, claims, global, ids, heads] of cleanRows) {
  test(`GIVEN old and recent closed project and global items, pending, someday and a stale claim WHEN a prompt arrives with ${name} THEN the listed files, claims and offer remain`, async (t) => {
    const ctx = newCtx(t)
    const dir = join(ctx.proj, '.claude', 'scheduled')
    const gdir = join(ctx.cfg, 'reminders')
    put(join(ctx.proj, '.claude'), 'reminders.json', config)
    sched(ctx, '20260801-0800_old-done.md', item('2026-08-01T08:00:00Z', 'done', 'x').replace('status: done', 'status: done\ndone: 2026-08-01T09:00:00Z'))
    sched(ctx, '20260901-0800_new-done.md', item('2026-09-01T08:00:00Z', 'done', 'x').replace('status: done', 'status: done\ndone: 2026-10-10T09:00:00Z'))
    sched(ctx, '20260702-0800_old-cancelled.md', item('2026-07-02T08:00:00Z', 'cancelled', 'x').replace('status: cancelled', 'status: cancelled\ncancelled: 2026-07-02T09:00:00Z'))
    sched(ctx, `${PEND}.md`, item('2025-01-01T08:00:00Z', 'pending'))
    sched(ctx, 'someday_s.md', item('none', 'pending'))
    put(join(dir, '.claims'), '20260801-0800_old-done.json', JSON.stringify({ session: 'o', at: 1 }))
    put(gdir, '20260701-0800_g-old.md', item('2026-07-01T08:00:00Z', 'done', 'x').replace('status: done', 'status: done\ndone: 2026-07-01T09:00:00Z'))
    put(gdir, '20260801-0800_g-done.md', item('2026-08-01T08:00:00Z', 'done', 'x').replace('status: done', 'status: done\ndone: 2026-08-01T09:00:00Z'))
    const r = await call(ctx, env, {})
    const got = {
      files: readdirSync(dir).filter((n) => n !== '.claims').sort(),
      claims: readdirSync(join(dir, '.claims')),
      global: readdirSync(gdir),
      ids: r.ids,
      heads: r.text.split('\n').filter((l) => l.startsWith('Expired reminder files')),
    }
    assert.deepEqual(got, { files: [...files].sort(), claims, global, ids, heads }, name)
  })
}
