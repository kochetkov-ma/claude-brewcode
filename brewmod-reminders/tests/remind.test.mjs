// Run: node --test brewmod-reminders/tests/remind.test.mjs (plain Node; `claude plugin test` runs *.test.ts only)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatWhen, parseWhen, parseWhenNatural } from '../hooks/lib/items.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, '..', 'hooks', 'remind.mjs')
const PROTO = '20261022-0803_post-hotfix-check.md'
const PROTO_PATH = (ctx) => join(ctx.proj, '.claude', 'scheduled', PROTO)
const NOW = '2026-10-22T09:00:00Z'
const item = (due, status, body = 'Check prod.') => `due: ${due}\nstatus: ${status}\n\n${body}\n`

const put = (dir, name, text) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), text)
}
const sched = (ctx, name, text) => put(join(ctx.proj, '.claude', 'scheduled'), name, text)
const session = (ctx, interactive) => put(join(ctx.plugin, '.state'), 'session-s1.json', JSON.stringify({ isInteractive: interactive, ts: 1 }))

const call = (ctx, env, extra) => {
  const payload = { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hi', source: 'user', cwd: ctx.proj, ...extra }
  const input = extra === 'garbage' ? '{not json' : JSON.stringify(payload)
  const r = spawnSync('node', [SCRIPT], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: ctx.plugin, CLAUDE_PROJECT_DIR: ctx.proj, CLAUDE_CONFIG_DIR: ctx.cfg, HOME: ctx.cfg, REMIND_TZ: 'Europe/Lisbon', REMIND_NOW: NOW, ...env },
  })
  const parsed = JSON.parse(r.stdout)
  const text = parsed.hookSpecificOutput?.additionalContext
  return { rc: r.status, text, ids: text === undefined ? null : text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).split(' | ')[0]) }
}

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
  ['slash prompt is skipped', old, [{ prompt: '/remind list' }], [NONE]],
  ['invalid session id is silent', old, [{ session_id: '../x' }], [NONE]],
  ['offered once per session', old, [{}, {}], [IDS(A), NONE]],
  ['re-offered after compact', old, [{}, { hook_event_name: 'SessionStart', source: 'compact', prompt: undefined }, {}], [IDS(A), NONE, IDS(A)]],
  ['other session still offered', old, [{}, { session_id: 's2' }], [IDS(A), IDS(A)]],
  ['live foreign claim hides the item', (c) => (old(c), put(join(c.proj, '.claude', 'scheduled', '.claims'), `${A}.json`, JSON.stringify({ session: 'o', at: Date.parse(NOW) - 3600000 }))), [{}], [NONE]],
  ['expired claim is offered again', (c) => (old(c), put(join(c.proj, '.claude', 'scheduled', '.claims'), `${A}.json`, JSON.stringify({ session: 'o', at: Date.parse(NOW) - 7 * 3600000 }))), [{}], [IDS(A)]],
  ['scheduled path is a file: fail open', (c) => put(join(c.proj, '.claude'), 'scheduled', 'not a dir'), [{}], [NONE]],
  ['garbage stdin: fail open', old, ['garbage'], [NONE]],
]

for (const [name, setup, extras, expected] of rows) {
  test(`GIVEN ${name} WHEN remind.mjs runs THEN the offered ids and rc are exact`, () => {
    const ctx = { proj: mkdtempSync(join(tmpdir(), 'remind-p-')), cfg: mkdtempSync(join(tmpdir(), 'remind-c-')), plugin: mkdtempSync(join(tmpdir(), 'remind-r-')) }
    setup(ctx)
    const got = extras.map((x) => {
      const { rc, ids } = call(ctx, {}, x)
      return { rc, ids }
    })
    assert.deepEqual(got, expected, name)
  })
}

test('GIVEN the prototype file verbatim WHEN remind.mjs runs THEN the offer text is exact', () => {
  const ctx = { proj: mkdtempSync(join(tmpdir(), 'remind-p-')), cfg: mkdtempSync(join(tmpdir(), 'remind-c-')), plugin: mkdtempSync(join(tmpdir(), 'remind-r-')) }
  mkdirSync(join(ctx.proj, '.claude', 'scheduled'), { recursive: true })
  copyFileSync(join(HERE, 'fixtures', PROTO), PROTO_PATH(ctx))
  writeFileSync(join(ctx.proj, '.claude', 'reminders.json'), '{"git":"commit-push"}')
  writeFileSync(join(ctx.proj, '.claude', 'settings.json'), '{"hooks":{"SessionStart":[{"hooks":[{"command":"x/due-checks.sh"}]}]}}')
  const first = call(ctx, {}, {})
  const expected = [
    'Reminders are due (1), stored as files:',
    `- ${PROTO.replace('.md', '')} | due Thu 22 Oct 09:03 Lisbon (08:03 UTC), 57 min ago | Post-hotfix prod check for v1.115.1 (main 24e2f198, deployed 2026-10-21 ~13:30Z) | ${PROTO_PATH(ctx)}`,
    'Before anything else tell the user (in their language) these are due; for each offer: run now, snooze, mark done, or cancel. Never run one unasked. Say plainly when one is more than 24 h late.',
    'Run accepted: update_reminder {id, action:"start"}, read the file, carry out its body, then update_reminder {id, action:"done", result}. Snooze: {id, action:"snooze", until}; cancel: {id, action:"cancel"}.',
    'update_reminder unavailable -> edit the file header: `status: done` plus `done: <UTC now, YYYY-MM-DDTHH:MM:SSZ>` (cancel: `status: cancelled` plus `cancelled: <UTC>`); never touch the body.',
    "Git: after changing an item file, commit only that file and push following the repo's conventions; never stage anything else.",
    'Legacy: .claude/settings.json still registers the old due-checks.sh hook; tell the user to remove it, brewmod-reminders replaces it.',
  ].join('\n')
  assert.deepEqual({ rc: first.rc, text: first.text, state: readdirSync(join(ctx.plugin, '.state')) }, { rc: 0, text: expected, state: ['offered-s1.json'] }, 'exact offer and one marks file')
})

test('GIVEN a 8-day-old foreign state file WHEN the hook offers THEN it is pruned and fresh ones stay', () => {
  const ctx = { proj: mkdtempSync(join(tmpdir(), 'remind-p-')), cfg: mkdtempSync(join(tmpdir(), 'remind-c-')), plugin: mkdtempSync(join(tmpdir(), 'remind-r-')) }
  old(ctx)
  const dir = join(ctx.plugin, '.state')
  put(dir, 'offered-zz.json', '{}')
  put(dir, 'notes.txt', 'keep')
  const t = new Date(Date.parse(NOW) - 8 * 86400000)
  utimesSync(join(dir, 'offered-zz.json'), t, t)
  call(ctx, {}, {})
  assert.deepEqual(readdirSync(dir).sort(), ['notes.txt', 'offered-s1.json'], 'stale offered-zz.json removed, non-state file kept')
})

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
  ['garbage is rejected', 'tomorrow', LIS, { ok: false, error: 'unrecognised time "tomorrow": use ISO with offset/Z, "YYYY-MM-DD HH:MM" or +<n>m|h|d' }],
  ['unknown zone', '2026-10-22 09:00', 'Mars/Base', { ok: false, error: 'unknown time zone "Mars/Base"' }],
]
test('GIVEN when inputs across the Lisbon DST change WHEN parseWhen and formatWhen run THEN results are exact', () => {
  const got = when.map(([, s, tz]) => parseWhen(s, T0, tz))
  assert.deepEqual(got, when.map((r) => r[3]), 'parseWhen rows')
  assert.equal(formatWhen(Date.parse('2026-03-30T08:00:00Z'), LIS, T0), 'Mon 30 Mar 09:00 Lisbon (08:00 UTC), in 29 d', 'formatWhen after the change')
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
test('GIVEN today/tomorrow wall times near the Lisbon DST end WHEN parseWhenNatural runs THEN the results are exact', () => {
  assert.deepEqual(natural.map(([, s, tz]) => parseWhenNatural(s, NAT_NOW, tz)), natural.map((r) => r[3]), 'natural rows')
})

test('GIVEN an offered item whose due line was snoozed WHEN the next prompt arrives THEN it is offered again once it is due', () => {
  const ctx = { proj: mkdtempSync(join(tmpdir(), 'remind-p-')), cfg: mkdtempSync(join(tmpdir(), 'remind-c-')), plugin: mkdtempSync(join(tmpdir(), 'remind-r-')) }
  old(ctx)
  const first = call(ctx, {}, {}).ids
  sched(ctx, `${A}.md`, item('2026-10-22T08:30:00Z', 'pending'))
  const later = call(ctx, {}, {}).ids
  assert.deepEqual({ first, later }, { first: [A], later: [A] }, 'offered before and after the snooze moved due into the past')
})
