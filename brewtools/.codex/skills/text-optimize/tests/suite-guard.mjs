#!/usr/bin/env node
/**
 * suite-guard.mjs - scripts/text-guard.sh: the BT-F15 snapshot + BT-F29b
 * refusal-to-write sub-gate.
 *
 * Self-contained: every git repo, target file and snapshot dir is generated
 * inside one mkdtemp base. The repo working tree is never touched - fixtures
 * are COPIED out of tests/ and only the copies are rewritten.
 *
 * Assertion policy: unconditional exact-equality / exact-size / exact-set
 * checks with a description; no `if` gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync, realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, '..', 'scripts', 'text-guard.sh');
const FIX_ORIG = join(HERE, 'fixture-rules.md');
const FIX_LOSSY = join(HERE, 'fixture-rules-lossy.md');
const FIX_LOSSLESS = join(HERE, 'fixture-rules-lossless.md');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'text-guard-')));

// ── harness ─────────────────────────────────────────────────────────────────
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

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

function guard(args, cwd, extra = {}) {
  const r = spawnSync('bash', [GUARD, ...args], {
    encoding: 'utf8', cwd, timeout: 20000,
    env: { ...process.env, CODEX_PROJECT_DIR: cwd, ...extra },
  });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

function sha(file) {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'MISSING';
}

function field(out, key) {
  const line = out.split('\n').find((l) => l.startsWith(`${key}: `));
  return line === undefined ? `NO_FIELD:${key}` : line.slice(key.length + 2);
}

// "  - kw:NEVER" bullet lines of a verify report, sorted for a set comparison.
function missingTokens(out) {
  return out.split('\n').filter((l) => l.startsWith('  - ')).map((l) => l.slice(4)).sort();
}

function git(repo, ...args) {
  return spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 20000 });
}

/** Fresh git repo with fixture-rules.md committed at `rules.md`. */
let repoSeq = 0;
function makeRepo({ commit = true, nested = false } = {}) {
  const repo = join(BASE, `repo-${repoSeq++}`);
  const rel = nested ? 'docs/rules.md' : 'rules.md';
  mkdirSync(join(repo, dirname(rel)), { recursive: true });
  writeFileSync(join(repo, rel), readFileSync(FIX_ORIG));
  if (commit) {
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'test');
    git(repo, 'add', '-A');
    git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'seed');
  }
  return { repo, rel, abs: join(repo, rel) };
}

// ── 1. snapshot: preconditions, permissions, gitignore ──────────────────────
{
  const { repo, rel, abs } = makeRepo();
  const res = guard(['snapshot', abs], repo);
  const runDir = field(res.out, 'RUN_DIR');
  const snap = join(runDir, 'orig', rel);

  check('snapshot.exit', res.status, 0, 'snapshot of a clean tree exits 0');
  check('snapshot.root', field(res.out, 'ROOT'), repo, 'ROOT is the resolved project root');
  check('snapshot.count', field(res.out, 'SNAPSHOT'), '1 files', 'exactly one file snapshotted');
  check('snapshot.rundir-prefix', runDir.startsWith(`${repo}/.codex/reports/`), true,
    'RUN_DIR lives under .codex/reports/');
  check('snapshot.rundir-suffix', runDir.endsWith('_text-optimize'), true,
    'RUN_DIR carries the _text-optimize suffix');
  check('snapshot.copy-bytes', sha(snap), sha(abs), 'the snapshot is byte-identical to the original');
  check('snapshot.mode.rundir', statSync(runDir).mode & 0o777, 0o700,
    'umask 077 makes RUN_DIR exactly 0700');
  check('snapshot.mode.orig', statSync(join(runDir, 'orig')).mode & 0o777, 0o700,
    'the orig/ subtree is exactly 0700');
  check('snapshot.mode.file', (statSync(snap).mode & 0o077), 0,
    'the snapshot file grants no group/other bits');
  check('snapshot.gitignore', readFileSync(join(repo, '.gitignore'), 'utf8').split('\n')
    .filter((l) => l === '.codex/reports/').length, 1,
    '.codex/reports/ is appended to .gitignore exactly once');

  // Idempotent: a second run must not duplicate the entry.
  const res2 = guard(['snapshot', abs], repo);
  check('snapshot.second.exit', res2.status, 0, 'a second snapshot of the same clean file exits 0');
  check('snapshot.gitignore.idempotent', readFileSync(join(repo, '.gitignore'), 'utf8').split('\n')
    .filter((l) => l === '.codex/reports/').length, 1,
    '.gitignore entry is not duplicated on re-run');
}

// ── 2. clean-tree guard (the interim zero-code requirement) ─────────────────
{
  const { repo, abs } = makeRepo();
  writeFileSync(abs, `${readFileSync(abs, 'utf8')}\nstray edit\n`);
  const before = sha(abs);
  const res = guard(['snapshot', abs], repo);
  check('dirty.exit', res.status, 3, 'a dirty target refuses the run with exit 3');
  check('dirty.names-path', res.err.includes('rules.md'), true, 'the refusal names the dirty path');
  check('dirty.no-rundir', existsSync(join(repo, '.codex', 'reports')), false,
    'nothing is written under .codex/reports/ on refusal');
  check('dirty.file-untouched', sha(abs), before, 'the target file is untouched by a refused run');

  const forced = guard(['snapshot', '--allow-dirty', abs], repo);
  check('dirty.allow-dirty.exit', forced.status, 0, '--allow-dirty accepts the same dirty target');
  check('dirty.allow-dirty.copy', sha(join(field(forced.out, 'RUN_DIR'), 'orig', 'rules.md')),
    sha(abs), '--allow-dirty still snapshots byte-identically');
}

// ── 3. no git = no recovery path ───────────────────────────────────────────
{
  const { repo, abs } = makeRepo({ commit: false });
  const res = guard(['snapshot', abs], repo);
  check('nogit.exit', res.status, 3, 'a non-git root refuses the run with exit 3');
  check('nogit.reason', res.err.includes('not a git repository'), true,
    'the refusal names the missing git recovery path');
  const forced = guard(['snapshot', '--allow-dirty', abs], repo);
  check('nogit.allow-dirty.exit', forced.status, 0, '--allow-dirty overrides the git precondition');
}

// ── 4. verify PASS: a lossless compression keeps every critical token ───────
{
  const { repo, rel, abs } = makeRepo();
  const runDir = field(guard(['snapshot', abs], repo).out, 'RUN_DIR');
  writeFileSync(abs, readFileSync(FIX_LOSSLESS));
  const compressed = sha(abs);
  const res = guard(['verify', '--run-dir', runDir, abs], repo);

  check('pass.exit', res.status, 0, 'a lossless compression passes the sub-gate');
  check('pass.gate', field(res.out, 'GATE'), 'PASS', 'GATE reads PASS');
  check('pass.missing', field(res.out, 'MISSING'), '0', 'zero critical tokens missing');
  check('pass.action', field(res.out, 'ACTION'), 'kept', 'the optimized file is kept');
  check('pass.failed-count', field(res.out, 'FILES_FAILED'), '0', 'no file failed');
  check('pass.file-kept', sha(abs), compressed, 'the compressed content survives a passing gate');
  check('pass.snapshot-intact', sha(join(runDir, 'orig', rel)), sha(FIX_ORIG),
    'the snapshot still holds the original');
}

// ── 5. BT-F15 REGRESSION: a lossy rewrite is caught and undone ─────────────
// Pre-fix there is no snapshot and no skill-owned gate at all: the rewrite is
// final and the original exists only in the agent's context. These asserts are
// the proof that both halves are now on disk.
{
  const { repo, rel, abs } = makeRepo();
  const origSha = sha(abs);
  const runDir = field(guard(['snapshot', abs], repo).out, 'RUN_DIR');
  writeFileSync(abs, readFileSync(FIX_LOSSY));
  check('loss.precondition', sha(abs) === origSha, false,
    'the lossy rewrite really did change the file before the gate ran');

  const res = guard(['verify', '--run-dir', runDir, abs], repo);
  check('loss.exit', res.status, 1, 'a dropped critical fact fails the gate with exit 1');
  check('loss.gate', field(res.out, 'GATE'), 'FAIL', 'GATE reads FAIL');
  check('loss.action', field(res.out, 'ACTION'), 'restored',
    'the refusal-to-write is executed, not warned about');
  check('loss.failed-count', field(res.out, 'FILES_FAILED'), '1', 'exactly one file failed');
  check('loss.missing-count', field(res.out, 'MISSING'), '4', 'exactly 4 critical tokens went missing');
  check('loss.missing-set', missingTokens(res.out),
    ['kw:NEVER', 'neg:!=stable', 'num:22', 'path:scripts/rollback.sh'],
    'the report names the dropped negation, prohibition, number and path');
  check('loss.restored', sha(abs), origSha, 'the target is byte-identical to the pre-edit original');
  check('loss.file-path', field(res.out, 'FILE'), rel, 'the report names the repo-relative path');
}

// ── 6. nested path, explicit --run-dir, restore and status ─────────────────
{
  const { repo, rel, abs } = makeRepo({ nested: true });
  const runDir = join(BASE, 'explicit-run');
  const snapRes = guard(['snapshot', '--run-dir', runDir, abs], repo);
  check('nested.rundir', field(snapRes.out, 'RUN_DIR'), runDir, '--run-dir is honoured verbatim');
  check('nested.copy', sha(join(runDir, 'orig', rel)), sha(FIX_ORIG),
    'a nested target is snapshotted at its relative path');

  const st = guard(['status', '--run-dir', runDir], repo);
  check('status.exit', st.status, 0, 'status of an existing run dir exits 0');
  check('status.count', field(st.out, 'SNAPSHOT'), '1 files', 'status counts exactly one snapshot');
  check('status.listing', st.out.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.trim()),
    [rel], 'status lists exactly the snapshotted relative path');

  writeFileSync(abs, 'obliterated\n');
  const rs = guard(['restore', '--run-dir', runDir, abs], repo);
  check('restore.exit', rs.status, 0, 'restore exits 0');
  check('restore.report', field(rs.out, 'RESTORED'), rel, 'restore names the path it put back');
  check('restore.bytes', sha(abs), sha(FIX_ORIG), 'restore is byte-identical to the original');
}

// ── 7. usage / state errors ────────────────────────────────────────────────
{
  const { repo, abs } = makeRepo();
  check('err.verify-no-rundir', guard(['verify', abs], repo).status, 2, 'verify without --run-dir exits 2');
  check('err.verify-no-snapshot',
    guard(['verify', '--run-dir', join(BASE, 'nope'), abs], repo).status, 2,
    'verify against a missing snapshot dir exits 2, never a silent pass');
  check('err.unknown-cmd', guard(['frobnicate'], repo).status, 2, 'an unknown command exits 2');
  check('err.no-args', guard([], repo).status, 2, 'a bare invocation exits 2 with usage');
  check('err.outside-root', guard(['snapshot', FIX_ORIG], repo).status, 2,
    'a target outside the project root exits 2');

  // A snapshot taken, then verify pointed at a file that was never snapshotted.
  const runDir = field(guard(['snapshot', abs], repo).out, 'RUN_DIR');
  const other = join(repo, 'other.md');
  writeFileSync(other, 'x\n');
  check('err.unsnapshotted-target', guard(['verify', '--run-dir', runDir, other], repo).status, 2,
    'verifying a file that was never snapshotted exits 2');
}

// ── report ─────────────────────────────────────────────────────────────────
console.log('suite-guard.mjs (BT-F15 snapshot + BT-F29b refusal-to-write gate)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
