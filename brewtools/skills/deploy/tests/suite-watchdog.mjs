#!/usr/bin/env node
/**
 * suite-watchdog.mjs — BT-F30 regression: the deploy scripts must work on a
 * PATH with no GNU coreutils `timeout`, which is the stock macOS shape.
 *
 * The sandbox PATH holds ONLY a curated bin dir (symlinks to the tools the
 * scripts genuinely call, plus a `gh` stub) — no `timeout`, no `gtimeout`, on
 * Linux as well as macOS. Pre-fix, `timeout 30 gh ...` exits 127 there and both
 * scripts report `WF_STATUS=api_unavailable` / `LAST_RUN=unknown` for a healthy
 * API. Post-fix they run under the built-in watchdog and report real data.
 *
 * Self-contained: one mkdtemp base, no network, no real `gh`, nothing outside
 * the base is read or written.
 *
 * Assertion policy: unconditional exact-equality / exact-size checks with a
 * description; no `if` gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..');
const SCRIPTS = join(SKILL, 'scripts');
const LIB = join(SCRIPTS, 'lib', 'deploy-common.sh');
const DISCOVER = join(SCRIPTS, 'workflow-discover.sh');
const LOCAL_OPS = join(SCRIPTS, 'deploy-local-ops.sh');

// ── harness ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(`  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
  }
}

// ── sandbox ────────────────────────────────────────────────────────────────
const BASE = mkdtempSync(join(tmpdir(), 'deploy-watchdog-'));
const BIN = join(BASE, 'bin');
const REPO = join(BASE, 'repo');
const WF_DIR = join(REPO, '.github', 'workflows');
mkdirSync(BIN, { recursive: true });
mkdirSync(WF_DIR, { recursive: true });

// Exactly the external commands the two scripts and the watchdog invoke.
// `timeout`/`gtimeout` are deliberately absent: that IS the BT-F30 condition.
const TOOLS = ['bash', 'jq', 'grep', 'sed', 'awk', 'sort', 'tr', 'basename', 'dirname', 'find', 'mktemp', 'mv', 'wc', 'cat', 'sleep'];
const resolved = [];
for (const t of TOOLS) {
  const w = spawnSync('/usr/bin/which', [t], { encoding: 'utf8' });
  const p = (w.stdout || '').trim().split('\n')[0];
  if (p) { symlinkSync(p, join(BIN, t)); resolved.push(t); }
}
check('sandbox.tools', resolved, TOOLS, 'every external tool the scripts call resolves on this machine');

const GH_STUB = `#!/bin/bash
args="$*"
case "$args" in
  *"workflow list"*)  echo '[{"name":"Docs","state":"active"},{"name":"Deploy Docs","state":"active"}]' ;;
  *"workflow view"*)  echo "active" ;;
  *"run list"*--jq*)  echo "success (2026-08-16)" ;;
  *"run list"*)       echo '[{"workflowName":"Docs","status":"completed","conclusion":"success","createdAt":"2026-08-16T10:00:00Z","headBranch":"main"}]' ;;
  *"repo view"*)      echo "fixture-repo" ;;
  *)                  echo "STUB_UNHANDLED: $args" >&2; exit 1 ;;
esac
`;
writeFileSync(join(BIN, 'gh'), GH_STUB);
chmodSync(join(BIN, 'gh'), 0o755);

writeFileSync(join(WF_DIR, 'docs.yml'), 'name: Docs\non:\n  push:\n    tags:\n      - "v*.*.*"\n');
writeFileSync(join(WF_DIR, 'deploy-docs.yml'), 'name: Deploy Docs\non:\n  workflow_dispatch:\n');

const SANDBOX_PATH = BIN;
function envFor(extra = {}) {
  return { PATH: SANDBOX_PATH, HOME: BASE, ...extra };
}

function runScript(script, args = [], extra = {}, cwd = REPO) {
  const r = spawnSync('/bin/bash', [script, ...args], { encoding: 'utf8', env: envFor(extra), cwd, timeout: 60000 });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

function lib(code, extra = {}) {
  const r = spawnSync('/bin/bash', ['-c', `. "${LIB}"\n${code}`], { encoding: 'utf8', env: envFor(extra), cwd: REPO, timeout: 60000 });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

// ── 1. no watchdog binary is visible in the sandbox ────────────────────────
check('sandbox.no-timeout', lib('command -v timeout || echo ABSENT').out, 'ABSENT',
  'GNU timeout is not on the sandbox PATH — the exact stock-macOS shape');
check('sandbox.no-gtimeout', lib('command -v gtimeout || echo ABSENT').out, 'ABSENT',
  'coreutils gtimeout is not on the sandbox PATH either');
check('backend.bash', lib('ght_backend').out, 'bash',
  'with neither binary present ght_backend selects the built-in watchdog');
check('backend.override.none', lib('ght_backend', { DEPLOY_TIMEOUT_BIN: 'none' }).out, 'bash',
  'DEPLOY_TIMEOUT_BIN=none forces the built-in watchdog');
check('backend.override.missing', lib('ght_backend', { DEPLOY_TIMEOUT_BIN: '/no/such/timeout' }).out, 'bash',
  'an override naming a non-existent binary falls back to the watchdog, never to an unbounded run');

// ── 2. ght exit-code contract ──────────────────────────────────────────────
check('ght.success', lib('ght 5 true; echo $?').out, '0', 'a succeeding command keeps exit 0');
check('ght.exit3', lib('ght 5 bash -c "exit 3"; echo $?').out, '3', "a failing command's own status is preserved");
check('ght.missing', lib('ght 5 no-such-binary-xyz 2>/dev/null; echo $?').out, '127',
  'a missing command still yields 127 — distinguishable, not swallowed');
check('ght.stdout', lib('ght 5 echo hello').out, 'hello', 'the child\'s stdout reaches the caller through the watchdog');
check('ght.argv-intact', lib('ght 5 bash -c \'printf "%s|" "$@"\' _ "a b" "c;d"').out, 'a b|c;d|',
  'each argument stays one argv element — nothing is re-parsed by a shell');

{
  const t0 = Date.now();
  const r = lib('ght 1 sleep 30; echo $?');
  const elapsed = Date.now() - t0;
  check('ght.timeout.code', r.out, '124', 'a command past its bound exits 124, the GNU convention');
  check('ght.timeout.bounded', elapsed < 10000, true, `the bound was actually enforced (${elapsed} ms, budget 10000 ms)`);
}

check('reason.ok', lib('ght_reason 0').out, 'ok', 'rc 0 classifies as ok');
check('reason.timeout', lib('ght_reason 124').out, 'timeout', 'rc 124 classifies as timeout');
check('reason.no_tool', lib('ght_reason 127').out, 'no_tool', 'rc 127 classifies as no_tool, never as an API outage');
check('reason.failed', lib('ght_reason 1').out, 'failed', 'any other rc classifies as failed');

// ── 3. BT-F30 regression: workflow-discover.sh on a coreutils-free PATH ────
// Pre-fix this block prints WF_STATUS=api_unavailable and RUNS=api_unavailable
// for a perfectly healthy API, because `timeout` itself was missing.
{
  const r = runScript(DISCOVER);
  const lines = r.out.split('\n');
  check('discover.exit', r.status, 0, 'discovery exits 0 without any coreutils timeout');
  check('discover.watchdog', lines.filter((l) => l.startsWith('WATCHDOG=')), ['WATCHDOG=bash'],
    'the chosen watchdog is reported exactly once');
  check('discover.count', lines.filter((l) => l.startsWith('WORKFLOW_COUNT=')), ['WORKFLOW_COUNT=2'],
    'both fixture workflow files are counted');
  check('discover.status', lines.filter((l) => l.startsWith('WF_STATUS')).sort(),
    ['WF_STATUS_Deploy_Docs=active', 'WF_STATUS_Docs=active'],
    'BT-F30: real API state is reported — pre-fix this was the single line WF_STATUS=api_unavailable');
  check('discover.no-false-sentinel', lines.filter((l) => l.includes('api_unavailable')), [],
    'no api_unavailable sentinel is emitted while the API is answering');
  check('discover.runs', lines.filter((l) => l.startsWith('RUN: ')),
    ['RUN: Docs | completed/success | main | 2026-08-16T10:00:00Z'],
    'the recent-runs block renders the stub payload instead of a sentinel');
}

// ── 4. gh genuinely missing is NOT the same report ─────────────────────────
{
  const bare = join(BASE, 'bin-nogh');
  mkdirSync(bare, { recursive: true });
  for (const t of TOOLS) symlinkSync(join(BIN, t), join(bare, t));
  const r = spawnSync('/bin/bash', [DISCOVER], { encoding: 'utf8', env: { PATH: bare, HOME: BASE }, cwd: REPO, timeout: 60000 });
  const lines = (r.stdout || '').trim().split('\n');
  check('nogh.status', lines.filter((l) => l.startsWith('WF_STATUS')), ['WF_STATUS=no_tool'],
    'a missing gh reports no_tool — the operator is told the tool is absent, not that GitHub is down');
  check('nogh.runs', lines.filter((l) => l.startsWith('RUNS=')), ['RUNS=no_tool'],
    'the runs block classifies the same cause the same way');
}

// ── 5. deploy-local-ops.sh writes real cells, not "unknown" ───────────────
{
  const seed = runScript(LOCAL_OPS, ['add-github', 'kochetkov-ma', 'fixture-repo', 'ghcr.io']);
  check('localops.seed', seed.out, 'ADDED=github-config', 'the config file is seeded before workflows are appended');
  const r = runScript(LOCAL_OPS, ['add-workflows', 'fixture-repo']);
  check('localops.exit', r.status, 0, 'add-workflows exits 0 on a coreutils-free PATH');
  const md = existsSync(join(REPO, 'CLAUDE.local.md')) ? readFileSync(join(REPO, 'CLAUDE.local.md'), 'utf8') : `NOT_WRITTEN(${r.err})`;
  const rows = md.split('\n').filter((l) => l.startsWith('| Docs |') || l.startsWith('| Deploy Docs |'));
  check('localops.rows', rows, [
    '| Deploy Docs | deploy-docs.yml | workflow_dispatch | active | success (2026-08-16) |',
    '| Docs | docs.yml | push | active | success (2026-08-16) |',
  ], 'BT-F30: both rows carry real state, in glob order — pre-fix every cell read "unknown"');
  check('localops.no-unknown', md.split('\n').filter((l) => l.includes('unknown')), [],
    'no cell falls back to the ambiguous "unknown" sentinel');
}

// ── 6. no bare `timeout N` survives anywhere in the skill ─────────────────
{
  const bareTimeout = /(^|[|;&(\s])timeout\s+\d+/;
  for (const [label, file] of [
    ['discover', DISCOVER], ['localops', LOCAL_OPS], ['lib', LIB], ['skill', join(SKILL, 'SKILL.md')],
  ]) {
    const offending = readFileSync(file, 'utf8').split('\n')
      .filter((l) => bareTimeout.test(l) && !l.includes('ght'));
    check(`bare-timeout.${label}`, offending, [],
      'every bounded call goes through ght; a bare `timeout N` is the BT-F30 defect itself');
  }
}

// ── report ─────────────────────────────────────────────────────────────────
console.log('suite-watchdog.mjs (BT-F30: portable watchdog + honest sentinels)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
