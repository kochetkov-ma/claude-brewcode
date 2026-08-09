#!/usr/bin/env node
/**
 * suite-telemetry.mjs - assets/semble-stats.mjs (the measurement hook) and
 * semble-status.sh --section telemetry (the reader), plus the guidance
 * merge/unmerge/status round trip with the two new want rows present.
 *
 * Everything runs inside one mkdtemp base. The real repo .claude/ is never
 * touched: every project root is a temp dir and the scripts are staged into it.
 *
 * Assertion policy: unconditional exact-equality checks with a description.
 * No `> 0`, no "contains something" - the conversion numbers are asserted
 * exactly, because a metric nobody can check is worse than no metric.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  appendFileSync, chmodSync, statSync, realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SKILL = join(HERE, '..');
const SCRIPTS = join(SKILL, 'scripts');
const HOOK = join(SKILL, 'assets', 'semble-stats.mjs');

let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}
function trunc(s) {
  const str = String(s);
  return str.length > 600 ? `${str.slice(0, 600)}...` : str;
}
function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
    return;
  }
  failed++;
  results.push(`  FAIL  ${name}  (${message} | actual=${trunc(JSON.stringify(actual))}`
    + ` expected=${trunc(JSON.stringify(expected))})`);
}
function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e && e.message), raw: String(str).slice(0, 400) };
  }
}

// realpath: on macOS /var is a symlink to /private/var, and the scripts resolve
// the project root to its real path - the expectations must match that.
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-telemetry-')));
process.on('exit', () => {
  try { rmSync(BASE, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ── helpers ─────────────────────────────────────────────────────────────────
function newProject(name) {
  const p = join(BASE, name);
  mkdirSync(join(p, '.claude', 'semble'), { recursive: true });
  return p;
}
function telFile(p) { return join(p, '.claude', 'semble', 'telemetry.jsonl'); }

/** Fire one payload at the hook. Returns {status, stdout, stderr}. */
function fire(payload, cwdForProc) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: cwdForProc || BASE,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function lines(p) {
  if (!existsSync(telFile(p))) return [];
  return readFileSync(telFile(p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
/** A record with ts+sid dropped, so shapes can be compared exactly. */
function shape(rec) {
  const { ts, sid, ...rest } = rec;
  return rest;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function post(over) {
  return {
    session_id: 's1',
    transcript_path: '/tmp/t.jsonl',
    cwd: '/replaced-per-call',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rg -n foo src/' },
    tool_response: {},
    tool_use_id: 'toolu_x',
    ...over,
  };
}

/** semble-status.sh --section telemetry, run from inside a project. */
function reader(p, args) {
  const r = spawnSync('bash', [join(SCRIPTS, 'semble-status.sh'), ...args], {
    cwd: p, encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function readerJson(p, args) {
  const r = reader(p, ['--section', 'telemetry', '--json', ...args]);
  return { status: r.status, json: safeParse(r.stdout) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Neutral output on every event the hook handles
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = newProject('neutral');
  const cases = [
    ['PostToolUse/semble', post({ cwd: p, tool_name: 'mcp__semble_code__search', tool_input: { query: 'q' } })],
    ['PostToolUse/Bash', post({ cwd: p })],
    ['PostToolUse/Grep', post({ cwd: p, tool_name: 'Grep', tool_input: { pattern: 'foo' } })],
    ['PostToolUse/Glob', post({ cwd: p, tool_name: 'Glob', tool_input: { pattern: '**/*.ts' } })],
    ['PostToolUseFailure', post({ cwd: p, hook_event_name: 'PostToolUseFailure', error: 'boom' })],
    ['PostToolUse/unhandled-tool', post({ cwd: p, tool_name: 'Read', tool_input: { file_path: 'x' } })],
    ['PreToolUse/ignored', post({ cwd: p, hook_event_name: 'PreToolUse' })],
    ['unknown-event', post({ cwd: p, hook_event_name: 'PostToolBatch' })],
  ];
  for (const [label, payload] of cases) {
    const r = fire(payload);
    check(`1.neutral.${label}`, [r.status, r.stdout], [0, '{}\n'],
      'a pure observer replies with the neutral {} and exits 0 - it can never alter a tool call');
  }
  const empty = spawnSync(process.execPath, [HOOK], { input: '', encoding: 'utf8', cwd: BASE });
  check('1.neutral.empty-stdin', [empty.status, empty.stdout], [0, '{}\n'],
    'empty stdin is neutral, not a crash');
  const junk = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8', cwd: BASE });
  check('1.neutral.malformed-stdin', [junk.status, junk.stdout], [0, '{}\n'],
    'unparseable stdin is neutral, not a crash');
  const arr = spawnSync(process.execPath, [HOOK], { input: '[1,2]', encoding: 'utf8', cwd: BASE });
  check('1.neutral.array-stdin', [arr.status, arr.stdout], [0, '{}\n'],
    'a JSON array on stdin is not an object and is ignored');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Exact record shapes
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = newProject('shapes');
  fire(post({
    cwd: p, session_id: 'sA', tool_name: 'mcp__semble_code__search',
    tool_input: { query: 'q' }, tool_response: { results: [] }, duration_ms: 812,
  }));
  fire(post({
    cwd: p, session_id: 'sA', tool_name: 'mcp__semble_code__find_related',
    tool_input: { file_path: 'a.ts', line: 4 }, agent_id: 'ag_7', agent_type: 'general-purpose',
  }));
  fire(post({
    cwd: p, session_id: 'sB', hook_event_name: 'PostToolUseFailure',
    tool_name: 'mcp__semble_code__search', tool_input: { query: 'q' },
    error: 'not indexed', is_interrupt: false, duration_ms: 40,
  }));
  fire(post({ cwd: p, session_id: 'sA', tool_input: { command: "rg -n 'session persistence' src/" }, duration_ms: 120 }));
  fire(post({ cwd: p, session_id: 'sB', tool_name: 'Glob', tool_input: { pattern: '**/*.ts' }, agent_id: 'ag_9' }));
  const L = lines(p);
  check('2.count', L.length, 5, 'five recordable payloads produced exactly five lines');
  check('2.call.success.shape', shape(L[0]),
    { ev: 'call', src: 'stats', tool: 'mcp__semble_code__search', ok: true, ms: 812, agent: 'main' },
    'a successful main-session semble call, with duration_ms carried through as ms');
  check('2.call.sub.no-duration', shape(L[1]),
    { ev: 'call', src: 'stats', tool: 'mcp__semble_code__find_related', ok: true, agent: 'sub' },
    'no duration_ms in the payload => the ms key is OMITTED, never invented as 0');
  check('2.call.failed.shape', shape(L[2]),
    { ev: 'call', src: 'stats', tool: 'mcp__semble_code__search', ok: false, ms: 40, agent: 'main' },
    'PostToolUseFailure is the only place a failed semble call is observable => ok:false');
  check('2.search.bash.shape', shape(L[3]),
    { ev: 'search', src: 'stats', tool: 'Bash', q: "rg -n 'session persistence' src/", agent: 'main' },
    'the denominator record carries the command verbatim and no ms');
  check('2.search.glob.shape', shape(L[4]),
    { ev: 'search', src: 'stats', tool: 'Glob', q: '**/*.ts', agent: 'sub' },
    'Glob is a search tool by definition; agent_id alone marks it as a subagent call');
  check('2.sid', L.map((r) => r.sid), ['sA', 'sA', 'sB', 'sA', 'sB'],
    'sid is the payload session_id, verbatim');
  check('2.ts.iso', L.every((r) => ISO.test(r.ts)), true,
    'every ts is a new Date().toISOString() string');

  const q = newProject('shapes-q');
  fire(post({ cwd: q, tool_input: { command: 'rg ' + 'x'.repeat(400) } }));
  fire(post({ cwd: q, session_id: 's1' }));
  const M = lines(q);
  check('2.q.truncation', M[0].q.length, 120, 'q is truncated to 120 characters');
  check('2.sid.missing', shape(fireAndLast(newProject('shapes-nosid'), {
    hook_event_name: 'PostToolUse', tool_name: 'Grep', tool_input: { pattern: 'foo' },
  })), { ev: 'search', src: 'stats', tool: 'Grep', q: 'foo', agent: 'main' },
    'a payload with no session_id still records, with sid ""');
}

function fireAndLast(p, over) {
  fire({ cwd: p, ...over });
  const L = lines(p);
  return L[L.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. The search-shaped filter: real commands, accepted and rejected
// ═══════════════════════════════════════════════════════════════════════════
{
  const accept = [
    'rg -n foo src/',
    'grep -rn TODO .',
    "ugrep --include='*.ts' handler",
    'find . -name "*.mjs"',
    'bfs . -type f',
    'ls -la && rg session src/',
    'cat x.txt | grep foo',
    'egrep -c pattern file',
    'cd /tmp; find . -name x',
    '(rg foo)',
    'set -e\ngrep -rn bar .',       // the `m` flag: a search on a later line
    'npm run build || rg error log.txt',
  ];
  const reject = [
    'npm run build',
    'git status',
    'node --check x.mjs',
    'echo "grep is a tool"',        // grep not at a command boundary
    'ls -la',
    'docker compose up -d',
    'python3 -c "import re"',
    '',
  ];
  const p = newProject('filter-accept');
  for (const cmd of accept) fire(post({ cwd: p, tool_input: { command: cmd } }));
  check('3.accept.count', lines(p).length, accept.length,
    'every search-shaped Bash command is recorded in the denominator');
  check('3.accept.all-search', lines(p).every((r) => r.ev === 'search' && r.tool === 'Bash'), true,
    'and each one is a search record for Bash');

  const r = newProject('filter-reject');
  for (const cmd of reject) fire(post({ cwd: r, tool_input: { command: cmd } }));
  check('3.reject.count', lines(r).length, 0,
    'a Bash call that is not search-shaped writes nothing - the log must not fill with build noise');
  check('3.reject.no-file', existsSync(telFile(r)), false,
    'nothing recorded means no file is created at all');

  const t = newProject('filter-tools');
  fire(post({ cwd: t, tool_name: 'Grep', tool_input: { pattern: 'anything' } }));
  fire(post({ cwd: t, tool_name: 'Glob', tool_input: { pattern: '**/*' } }));
  fire(post({ cwd: t, tool_name: 'Read', tool_input: { file_path: join(t, 'a.mjs') } }));
  fire(post({ cwd: t, tool_name: 'Agent', tool_input: { prompt: 'find the handler' } }));
  fire(post({ cwd: t, tool_name: 'Write', tool_input: { file_path: 'a', content: 'grep' } }));
  check('3.tools', lines(t).filter((x) => x.ev === 'search').map((x) => x.tool), ['Grep', 'Glob'],
    'Grep and Glob always count as SEARCH; Write never does; Agent is deliberately excluded'
    + ' (it is a spawn, and the subagent\'s own calls already arrive tagged agent:"sub")');
  check('3.read-is-open', lines(t).filter((x) => x.ev === 'open').map((x) => [x.f, x.abs]),
    [['a.mjs', join(t, 'a.mjs')]],
    'a Read is never a search - it is an open record, the prefetch-conversion numerator,'
    + ' carrying BOTH the repo-relative and the absolute form');
  check('3.read-not-search', lines(t).some((x) => x.ev === 'search' && x.tool === 'Read'), false,
    'semble does not displace opening a known file, so Read must never enter the denominator');

  const ro = newProject('filter-read-nopath');
  fire(post({ cwd: ro, tool_name: 'Read', tool_input: {} }));
  fire(post({ cwd: ro, tool_name: 'Read', tool_input: { file_path: 42 } }));
  check('3.read-no-path', existsSync(telFile(ro)), false,
    'a Read with no usable file path writes nothing at all');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. A telemetry write failure leaves tool behaviour untouched
// ═══════════════════════════════════════════════════════════════════════════
{
  // .claude/semble is a FILE, so join(...)/telemetry.jsonl cannot be created.
  const p = join(BASE, 'unwritable');
  mkdirSync(join(p, '.claude'), { recursive: true });
  writeFileSync(join(p, '.claude', 'semble'), 'not a directory\n');
  const r = fire(post({ cwd: p, tool_name: 'mcp__semble_code__search', tool_input: { query: 'q' } }));
  check('4.write-failure.output', [r.status, r.stdout], [0, '{}\n'],
    'the append throws ENOTDIR, is swallowed, and the hook still replies {} and exits 0');
  check('4.write-failure.silent-stderr', r.stderr, '',
    'and it does not spam stderr - Claude Code surfaces hook stderr to the user');

  // A read-only directory: mkdir/append both fail.
  const q = join(BASE, 'readonly');
  mkdirSync(join(q, '.claude', 'semble'), { recursive: true });
  chmodSync(join(q, '.claude', 'semble'), 0o500);
  const r2 = fire(post({ cwd: q, tool_input: { command: 'rg -n foo .' } }));
  chmodSync(join(q, '.claude', 'semble'), 0o700);
  check('4.readonly-dir', [r2.status, r2.stdout], [0, '{}\n'],
    'an unwritable telemetry dir is a lost sample, never a broken tool call');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. The size guard
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = newProject('sizeguard');
  const filler = JSON.stringify({
    ts: '2026-01-01T00:00:00.000Z', ev: 'search', src: 'stats', sid: 'old',
    tool: 'Bash', q: 'x'.repeat(400), agent: 'main',
  });
  // 6 x 510000 = 3060000 bytes of prior records, over the 2 MB guard threshold.
  // The size is fixed by the fixture, so it is asserted exactly: 509-byte filler,
  // 1000 per chunk plus one newline each, six chunks.
  const chunk = new Array(1000).fill(filler).join('\n') + '\n';
  for (let i = 0; i < 6; i++) appendFileSync(telFile(p), chunk);
  const before = statSync(telFile(p)).size;
  check('5.guard.precondition', before, 3_060_000,
    'the fixture is exactly 3060000 bytes, over the 2 MB threshold the guard trips on');
  fire(post({ cwd: p, tool_input: { command: 'rg -n trigger .' } }));
  const after = lines(p);
  check('5.guard.trimmed', after.length, 1001,
    'the guard keeps the last 1000 lines and then appends the new one');
  check('5.guard.new-record-last', shape(after[after.length - 1]),
    { ev: 'search', src: 'stats', tool: 'Bash', q: 'rg -n trigger .', agent: 'main' },
    'the newest record survives the trim - a guard that drops the sample it was called for is useless');
  check('5.guard.kept-are-tail', after.slice(0, 1000).every((r) => r.sid === 'old'), true,
    'the retained 1000 are the previous tail, still valid JSON');
  check('5.guard.under-threshold-untouched', (() => {
    const q = newProject('sizeguard-small');
    appendFileSync(telFile(q), filler + '\n');
    fire(post({ cwd: q, tool_input: { command: 'rg -n x .' } }));
    return lines(q).length;
  })(), 2, 'a small file is never trimmed');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. The reader against a hand-built fixture with a KNOWN answer
// ═══════════════════════════════════════════════════════════════════════════
//
//   sA: nudge(main) @00 -> semble call @02  => converted
//   sB: nudge(sub)  @00 -> no call ever     => NOT converted
//   sC: no nudge         -> semble call @05 => unprompted
//   plus 2 skipped gates and 4 search records.
const FIXTURE = [
  { ts: '2026-01-01T00:00:00.000Z', ev: 'gate', src: 'reminder', sid: 'sA', fired: true, why: 'ok', phase: 'ready', enabled: true },
  { ts: '2026-01-01T00:00:00.001Z', ev: 'nudge', src: 'reminder', sid: 'sA', matcher: 'Bash', agent: 'main', q: 'rg session persistence' },
  { ts: '2026-01-01T00:00:01.000Z', ev: 'gate', src: 'reminder', sid: 'sB', fired: true, why: 'ok', phase: 'ready', enabled: true },
  { ts: '2026-01-01T00:00:01.001Z', ev: 'nudge', src: 'explore', sid: 'sB', matcher: 'Explore', agent: 'sub', q: 'where is auth' },
  { ts: '2026-01-01T00:00:02.000Z', ev: 'call', src: 'stats', sid: 'sA', tool: 'mcp__semble_code__search', ok: true, ms: 900, agent: 'main' },
  { ts: '2026-01-01T00:00:03.000Z', ev: 'call', src: 'stats', sid: 'sA', tool: 'mcp__semble_code__find_related', ok: true, agent: 'sub' },
  { ts: '2026-01-01T00:00:04.000Z', ev: 'gate', src: 'reminder', sid: 'sB', fired: false, why: 'throttled', phase: 'ready', enabled: true },
  { ts: '2026-01-01T00:00:04.500Z', ev: 'gate', src: 'reminder', sid: 'sC', fired: false, why: 'no-mcp', phase: 'verifying', enabled: true },
  { ts: '2026-01-01T00:00:05.000Z', ev: 'call', src: 'stats', sid: 'sC', tool: 'mcp__semble_code__search', ok: false, ms: 12, agent: 'main' },
  { ts: '2026-01-01T00:00:06.000Z', ev: 'search', src: 'stats', sid: 'sA', tool: 'Bash', q: 'rg -n foo', agent: 'main' },
  { ts: '2026-01-01T00:00:07.000Z', ev: 'search', src: 'stats', sid: 'sB', tool: 'Bash', q: 'grep -rn bar .', agent: 'sub' },
  { ts: '2026-01-01T00:00:08.000Z', ev: 'search', src: 'stats', sid: 'sB', tool: 'Grep', q: 'baz', agent: 'sub' },
  { ts: '2026-01-01T00:00:09.000Z', ev: 'search', src: 'stats', sid: 'sC', tool: 'Glob', q: '**/*.ts', agent: 'main' },
];
{
  const p = newProject('reader');
  writeFileSync(telFile(p), FIXTURE.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const { status, json: R } = readerJson(p, []);
  check('6.exit', status, 0, 'the reader always exits 0 - it has no verdict to fail');
  check('6.records', [R.present, R.records, R.malformed], [true, 13, 0],
    'all 13 fixture records parsed, none malformed');
  check('6.hooks', R.hooks, { reminder: 5, explore: 1, stats: 7 },
    'per-hook invocation counts: 5 reminder records, 1 explore, 7 from the stats hook');
  check('6.gate', R.gate, { fired: 2, skipped: 2, why: { ok: 2, throttled: 1, 'no-mcp': 1 } },
    'the gate fired twice and skipped twice, broken down by why');
  check('6.nudge', R.nudge, { total: 2, main: 1, sub: 1, unknown: 0 },
    'two nudges, one in the main session and one inside a subagent');
  check('6.call', R.call, { total: 3, main: 2, sub: 1, unknown: 0, failed: 1 },
    'three real semble calls, one of which failed');
  check('6.search', R.search, { total: 4, main: 2, sub: 2, unknown: 0 },
    'four search-shaped non-semble tool uses - the denominator');
  check('6.conversion', R.conversion,
    { sessionsWithNudge: 2, sessionsConverted: 1, conversionPct: 50, callsAfterNudge: 2, callsWithoutNudge: 1 },
    'sA nudged then called (converted), sB nudged and never called, sC called with no'
    + ' preceding nudge => 1 of 2 sessions convert, 2 calls follow a nudge, 1 is unprompted');
  check('6.window', R.window, { sid: null, last: null }, 'the default window is every record');

  const human = reader(p, ['--section', 'telemetry']);
  check('6.human.exit', human.status, 0, 'the human report exits 0 too');
  check('6.human.lines', [
    human.stdout.includes('gate:      2 fired / 2 skipped  [no-mcp=1 ok=2 throttled=1]'),
    human.stdout.includes('nudge:     2 total (main 1, sub 1)'),
    human.stdout.includes('call:      3 semble calls (main 2, sub 1) | 1 failed'),
    human.stdout.includes('search:    4 search-shaped non-semble (main 2, sub 2)'),
    human.stdout.includes('converted: 1/2 nudged sessions (50%) | 2 calls after a nudge, 1 unprompted'),
    human.stdout.includes('share:     42.9% of search-shaped tool use went through semble'),
  ], [true, true, true, true, true, true],
    'the terse human report states every number the JSON does (3/(3+4) = 42.9%)');

  const sidR = readerJson(p, ['--sid', 'sA']);
  check('6.sid.window', [sidR.json.records, sidR.json.window.sid], [5, 'sA'],
    '--sid narrows to the five sA records');
  check('6.sid.conversion', sidR.json.conversion,
    { sessionsWithNudge: 1, sessionsConverted: 1, conversionPct: 100, callsAfterNudge: 2, callsWithoutNudge: 0 },
    'inside sA alone the nudge converted, both calls followed it');
  check('6.sid.unknown-session', readerJson(p, ['--sid', 'nope']).json.records, 0,
    'an unknown sid is an empty window, not an error');

  const lastR = readerJson(p, ['--last', '4']);
  check('6.last.window', [lastR.json.records, lastR.json.window.last], [4, 4],
    '--last keeps only the newest 4 records');
  check('6.last.counts', [lastR.json.search.total, lastR.json.call.total, lastR.json.nudge.total],
    [4, 0, 0], 'the newest four are all search records');
  check('6.last.oversized', readerJson(p, ['--last', '999']).json.records, 13,
    '--last larger than the log is the whole log');
  check('6.sid+last', readerJson(p, ['--sid', 'sB', '--last', '2']).json.records, 2,
    '--last is applied after --sid');
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. The reader on absent / truncated / unknown-ev input
// ═══════════════════════════════════════════════════════════════════════════
{
  const absent = newProject('reader-absent');
  const a = reader(absent, ['--section', 'telemetry']);
  check('7.absent.exit', a.status, 0, 'an absent log is a normal state, not a failure');
  check('7.absent.message', a.stdout.includes('no telemetry yet'), true,
    'and it says so in plain words');
  const aj = readerJson(absent, []);
  check('7.absent.json', [aj.json.present, aj.json.records, aj.json.conversion.conversionPct],
    [false, 0, null], 'the JSON reports present:false with zeroed counters and a null rate');

  const empty = newProject('reader-empty');
  writeFileSync(telFile(empty), '');
  check('7.empty-file', readerJson(empty, []).json.records, 0,
    'an existing but empty file is present with zero records');

  const trunc2 = newProject('reader-truncated');
  writeFileSync(telFile(trunc2),
    JSON.stringify(FIXTURE[4]) + '\n' + JSON.stringify(FIXTURE[9]) + '\n'
    + '{"ts":"2026-01-01T00:00:10.000Z","ev":"call","src":"sta');
  const t = readerJson(trunc2, []);
  check('7.truncated', [t.status, t.json.records, t.json.malformed, t.json.call.total],
    [0, 2, 1, 1], 'a half-written final line is counted as malformed and skipped, the rest still counts');

  const future = newProject('reader-future');
  writeFileSync(future && telFile(future), [
    JSON.stringify(FIXTURE[4]),
    JSON.stringify({ ts: '2026-01-01T00:00:20.000Z', ev: 'rerank', src: 'stats', sid: 'sA', hits: 3 }),
    JSON.stringify({ ts: '2026-01-01T00:00:21.000Z', ev: 'rerank', src: 'stats', sid: 'sA', hits: 1 }),
    JSON.stringify({ ts: '2026-01-01T00:00:22.000Z', ev: 42, src: 'stats', sid: 'sA' }),
    '[1,2,3]',
  ].join('\n') + '\n');
  const f = readerJson(future, []);
  check('7.unknown-ev', [f.status, f.json.records, f.json.malformed, f.json.unknownEv, f.json.call.total],
    [0, 4, 1, { rerank: 2, 42: 1 }, 1],
    'records from a newer schema are counted by ev and skipped; a non-object line is malformed');

  const bad = reader(newProject('reader-badflag'), ['--section', 'telemetry', '--last', 'abc']);
  check('7.bad-last', bad.status, 2, '--last must be an integer - bad usage exits 2');
  const misplaced = reader(newProject('reader-misflag'), ['--section', 'state', '--sid', 'x']);
  check('7.misplaced-window-flag', misplaced.status, 2,
    '--sid outside --section telemetry is bad usage, not a silently ignored flag');
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Guidance merge / unmerge / status round trip with the new rows
// ═══════════════════════════════════════════════════════════════════════════
const GUIDANCE = join(SCRIPTS, 'semble-guidance.sh');
const STATS_MATCHER = 'mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read';
// The 5.0.0 want table: SessionStart, UserPromptSubmit, and the stats pair.
// PreToolUse/Bash, PreToolUse/Grep and SubagentStart/Explore were RETIRED with
// the two advisory hooks; §10 proves a v1-shaped file loses them on install.
const WANT_N = 4;

function guidance(p, args) {
  const r = spawnSync('bash', [GUIDANCE, ...args], { cwd: p, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function guidanceJson(p, args) {
  const r = guidance(p, [...args, '--json']);
  return { status: r.status, json: safeParse(r.stdout.trim().split('\n').pop()) };
}
function settingsOf(p) {
  const f = join(p, '.claude', 'settings.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}
{
  const p = newProject('guidance');
  const inst = guidance(p, ['install', '--part', 'all']);
  check('8.install.exit', inst.status, 0, 'a full guidance install succeeds in a bare project');
  check('8.install.stats-file', existsSync(join(p, '.claude', 'hooks', 'semble-stats.mjs')), true,
    'semble-stats.mjs is copied alongside the other three');

  const s = settingsOf(p);
  const abs = join(p, '.claude', 'hooks', 'semble-stats.mjs');
  const wantEntry = {
    matcher: STATS_MATCHER,
    hooks: [{ type: 'command', command: 'node', args: [abs], timeout: 5 }],
  };
  check('8.install.PostToolUse', s.hooks.PostToolUse, [wantEntry],
    'exactly one PostToolUse entry, matcher is the pipe list, timeout is 5 SECONDS');
  check('8.install.PostToolUseFailure', s.hooks.PostToolUseFailure, [wantEntry],
    'and the identical entry on PostToolUseFailure - a failed call fires only that event');
  check('8.install.matcher-is-exact-list', /^[a-zA-Z0-9_|]+$/.test(STATS_MATCHER), true,
    'the matcher is a pipe-only list, so Claude Code parses it as exact names under'
    + ' both the strict and the permissive rule, never as a regex');

  const st = guidanceJson(p, ['status']);
  check('8.status.counts',
    [st.json.hooks.wiredCount, st.json.hooks.wantCount, st.json.hooks.driftedCount,
      st.json.hooks.missingCount, st.json.hooks.duplicateCount, st.json.hooks.drift.length],
    [WANT_N, WANT_N, 0, 0, 0, 0], 'all four want rows are wired, nothing drifted or duplicated');
  check('8.status.stats-row', st.json.hooks.stats, { file: 'present', wired: true },
    'the stats hook reports its own file and wiring');
  check('8.status.rows',
    st.json.hooks.entries.map((e) => [e.event, e.matcher, e.script, e.state]),
    [['SessionStart', null, 'semble-session.mjs', 'wired'],
      ['UserPromptSubmit', null, 'semble-prefetch.mjs', 'wired'],
      ['PostToolUse', STATS_MATCHER, 'semble-stats.mjs', 'wired'],
      ['PostToolUseFailure', STATS_MATCHER, 'semble-stats.mjs', 'wired']],
    'the want table, in order, all wired');
  check('8.status.no-retired-rows',
    st.json.hooks.entries.some((e) => /reminder|explore/.test(e.script)), false,
    'the retired scripts are not want rows any more - they are ownership marks only');
  check('8.status.human-denominator',
    guidance(p, ['status']).stdout.includes('hooks ' + WANT_N + '/' + WANT_N + ' wired'), true,
    'the human line prints wiredCount/wantCount, never a hard-coded number');

  // Idempotence.
  const again = guidanceJson(p, ['install', '--part', 'hooks']);
  check('8.reinstall.no-change', again.json.changed, [],
    'a second install changes nothing - the merge reconciles, it does not append');
  check('8.reinstall.still-one', settingsOf(p).hooks.PostToolUse.length, 1,
    'and there is still exactly one PostToolUse entry');

  // Drift repair: the exact 5000-vs-5 bug, on the new row.
  const f = join(p, '.claude', 'settings.json');
  const drifted = JSON.parse(readFileSync(f, 'utf8'));
  drifted.hooks.PostToolUseFailure[0].hooks[0].timeout = 5000;
  writeFileSync(f, JSON.stringify(drifted, null, 2) + '\n');
  const dj = guidanceJson(p, ['status']);
  check('8.drift.detected',
    [dj.json.hooks.wiredCount, dj.json.hooks.driftedCount, dj.json.hooks.stats.wired],
    [WANT_N - 1, 1, false], 'timeout 5000 on the stats row is drifted, not wired - 83 minutes, not 5 seconds');
  check('8.drift.field', dj.json.hooks.drift,
    [{ event: 'PostToolUseFailure', matcher: STATS_MATCHER, script: 'semble-stats.mjs',
      field: 'timeout', expected: 5, actual: 5000 }],
    'the drift list names the exact field, expected and actual');
  guidance(p, ['install', '--part', 'hooks']);
  check('8.drift.repaired', guidanceJson(p, ['status']).json.hooks.wiredCount, WANT_N,
    're-running install rewrites the drifted row in place');

  // A foreign hook on the same event must survive both merge and unmerge.
  const withForeign = JSON.parse(readFileSync(f, 'utf8'));
  withForeign.hooks.PostToolUse.push({
    matcher: 'Write',
    hooks: [{ type: 'command', command: 'node', args: ['/opt/other/formatter.mjs'], timeout: 30 }],
  });
  withForeign.hooks.PostToolUse[0].hooks.push({ type: 'command', command: 'node', args: ['/opt/other/inline.mjs'] });
  writeFileSync(f, JSON.stringify(withForeign, null, 2) + '\n');
  guidance(p, ['install', '--part', 'hooks']);
  const kept = settingsOf(p);
  check('8.foreign.survives-merge',
    [kept.hooks.PostToolUse.length, kept.hooks.PostToolUse[0].hooks.length,
      kept.hooks.PostToolUse[1].matcher],
    [2, 2, 'Write'], 'foreign entries and foreign hooks inside a semble entry are never touched');

  const rm = guidance(p, ['remove', '--part', 'hooks']);
  check('8.remove.exit', rm.status, 0, 'unmerge succeeds');
  const after = settingsOf(p);
  check('8.remove.failure-event-gone', after.hooks.PostToolUseFailure, undefined,
    'PostToolUseFailure held only the semble hook, so the whole event array is deleted');
  check('8.remove.foreign-kept',
    [after.hooks.PostToolUse.length,
      after.hooks.PostToolUse.map((e) => e.hooks.flatMap((h) => h.args))],
    [2, [['/opt/other/inline.mjs'], ['/opt/other/formatter.mjs']]],
    'the semble hook is stripped per-hook: the entry survives for its foreign sibling');
  check('8.remove.file-gone', existsSync(join(p, '.claude', 'hooks', 'semble-stats.mjs')), false,
    'the .mjs is deleted after the settings, never before');
  check('8.remove.status', (() => {
    const z = guidanceJson(p, ['status']).json.hooks;
    return [z.wiredCount, z.missingCount, z.stats.file, z.stats.wired];
  })(), [0, WANT_N, 'missing', false], 'status agrees that nothing is wired any more');

  // Stale-path purge: an old install pointing at a different hooks dir.
  const q = newProject('guidance-stale');
  mkdirSync(join(q, '.claude'), { recursive: true });
  writeFileSync(join(q, '.claude', 'settings.json'), JSON.stringify({
    hooks: {
      PostToolUse: [{
        matcher: STATS_MATCHER,
        hooks: [{ type: 'command', command: 'node', args: ['/old/elsewhere/semble-stats.mjs'], timeout: 5 }],
      }],
    },
  }, null, 2) + '\n');
  check('8.stale.seen', guidanceJson(q, ['status']).json.hooks.staleEntries, 1,
    'a semble-stats.mjs at a foreign path is reported as a stale entry');
  guidance(q, ['install', '--part', 'hooks']);
  const purged = settingsOf(q);
  check('8.stale.purged',
    purged.hooks.PostToolUse.flatMap((e) => e.hooks.flatMap((h) => h.args)),
    [join(q, '.claude', 'hooks', 'semble-stats.mjs')],
    'install drops the stale path and leaves exactly the current one');
  check('8.stale.clean', guidanceJson(q, ['status']).json.hooks.staleEntries, 0,
    'and status confirms the purge');
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Hook + reader, end to end through the installed copy
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = newProject('e2e');
  guidance(p, ['install', '--part', 'hooks']);
  const installed = join(p, '.claude', 'hooks', 'semble-stats.mjs');
  const run = (payload) => spawnSync(process.execPath, [installed], {
    input: JSON.stringify(payload), encoding: 'utf8', cwd: p,
  });
  writeFileSync(telFile(p), JSON.stringify({
    ts: '2026-01-01T00:00:00.000Z', ev: 'nudge', src: 'reminder', sid: 'e2e',
    matcher: 'Bash', agent: 'main', q: 'rg -n handler src/',
  }) + '\n');
  const a = run(post({ cwd: p, session_id: 'e2e', tool_input: { command: 'rg -n handler src/' } }));
  const b = run(post({
    cwd: p, session_id: 'e2e', tool_name: 'mcp__semble_code__search',
    tool_input: { query: 'where is the handler' }, duration_ms: 640,
  }));
  check('9.installed.neutral', [a.status, a.stdout, b.status, b.stdout], [0, '{}\n', 0, '{}\n'],
    'the installed copy behaves exactly like the asset');
  const R = readerJson(p, []).json;
  check('9.e2e.conversion', R.conversion,
    { sessionsWithNudge: 1, sessionsConverted: 1, conversionPct: 100, callsAfterNudge: 1, callsWithoutNudge: 0 },
    'a nudge followed by a real semble call in the same session is one converted session'
    + ' - this is the whole point of the mechanism');
  check('9.e2e.denominator', [R.search.total, R.call.total], [1, 1],
    'one search-shaped Bash call and one semble call');
}

// ── report ──────────────────────────────────────────────────────────────────
for (const line of results) console.log(line);
console.log('');
console.log('| suite-telemetry | Value |');
console.log('|-----------------|-------|');
console.log(`| assertions | ${passed + failed} |`);
console.log(`| passed | ${passed} |`);
console.log(`| failed | ${failed} |`);
console.log(`| temp base | ${BASE} |`);
console.log(failed === 0 ? '✅ suite-telemetry passed' : `❌ suite-telemetry failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
