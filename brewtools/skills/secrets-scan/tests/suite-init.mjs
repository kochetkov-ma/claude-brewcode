#!/usr/bin/env node
/**
 * suite-init.mjs (BT-F03 / BT-F04) - scripts/scan-init.sh.
 *
 * Covers the report-privacy half of BT-F03 (owner-only report dir, owner-only
 * file list, `.claude/reports/` ignored before anything is written) and the
 * file-list half of BT-F04 (a tracked-then-ignored file is still in the chunk).
 *
 * Self-contained: every git repo is created inside one mkdtemp base with
 * GIT_CONFIG_GLOBAL/GIT_CONFIG_SYSTEM pinned to /dev/null and HOME redirected,
 * so this machine's global excludes file cannot change the outcome. No network.
 *
 * Assertion policy: unconditional exact-equality of full strings, full arrays
 * and exact octal modes with a description; no `if` gates.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync, realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const INIT = join(HERE, '..', 'scripts', 'scan-init.sh');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'secscan-init-')));
const HOME = join(BASE, 'home');
mkdirSync(HOME, { recursive: true });

const GIT_ENV = {
  HOME,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
};

const APPENDED_BLOCK = '\n# brewtools:secrets-scan - reports name credential locations\n.claude/reports/\n';

// ── harness ────────────────────────────────────────────────────────────────
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
    return;
  }
  failed++;
  results.push(
    `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
  );
}

function git(cwd, ...args) {
  spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
}

function makeRepo(name, files, gitignore) {
  const root = join(BASE, name);
  mkdirSync(root, { recursive: true });
  git(root, 'init', '-q');
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  git(root, 'add', '-A');
  writeFileSync(join(root, '.gitignore'), gitignore);
  git(root, 'add', '.gitignore');
  return root;
}

function runInit(cwd) {
  const r = spawnSync('bash', [INIT], {
    cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, timeout: 15000,
  });
  const out = (r.stdout || '').trim().split('\n').pop() || '';
  const fields = Object.fromEntries(out.split('|').map((kv) => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i), kv.slice(i + 1)];
  }));
  return { fields, status: r.status, stdout: r.stdout || '' };
}

const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const lines = (p) => readFileSync(p, 'utf8').split('\n').filter((s) => s.length > 0);

// ── repo A: nothing ignores .claude/reports/ yet ───────────────────────────
const REPO_A = makeRepo('repo-a', {
  'src/a.ts': 'export const a = 1;\n',
  'img/logo.png': 'PNG-fake\n',
  'package-lock.json': '{}\n',
  'node_modules/x.js': 'module.exports = 1;\n',
  'dist/bundle.js': 'var b = 1;\n',
  'secret.env': 'K=v\n',
}, 'secret.env\n');

const A = runInit(REPO_A);
check('init.a.exit', A.status, 0, 'a valid git repo exits 0');
check('init.a.fields', Object.keys(A.fields), ['DIR', 'REPO', 'TS', 'TOTAL', 'GITIGNORE'],
  'the summary line carries exactly these five fields, in this order');
check('init.a.repo', A.fields.REPO, REPO_A, 'REPO is the git toplevel, not the cwd');
check('init.a.gitignore', A.fields.GITIGNORE, 'appended',
  'a repo that ignores nothing gets .claude/reports/ appended before any report exists');
check('init.a.gitignore.body', readFileSync(join(REPO_A, '.gitignore'), 'utf8'),
  `secret.env\n${APPENDED_BLOCK}`,
  'the append preserves the existing content and adds one commented rule');

check('init.a.total', A.fields.TOTAL, '3', 'binary, lockfile, vendor and build paths are filtered out');
check('init.a.list', lines(join(A.fields.DIR, 'files.txt')), ['.gitignore', 'secret.env', 'src/a.ts'],
  'a tracked-but-gitignored file (secret.env) stays in the chunk - git ls-files still returns it');

check('init.a.dirmode', mode(A.fields.DIR), '700', 'the report dir is owner-only');
check('init.a.listmode', mode(join(A.fields.DIR, 'files.txt')), '600', 'the file list is owner-only');

// second run must not append twice
const A2 = runInit(REPO_A);
check('init.a.idempotent', A2.fields.GITIGNORE, 'already-ignored',
  'a second run sees the rule it wrote and does nothing');
check('init.a.idempotent.body', readFileSync(join(REPO_A, '.gitignore'), 'utf8'),
  `secret.env\n${APPENDED_BLOCK}`, 'the second run leaves .gitignore byte-identical');

// ── repo B: .claude/ already ignored ───────────────────────────────────────
const REPO_B = makeRepo('repo-b', { 'src/b.ts': 'export const b = 2;\n' }, '.claude/\n');
const B = runInit(REPO_B);
check('init.b.gitignore', B.fields.GITIGNORE, 'already-ignored',
  'a broader .claude/ rule already covers the reports dir');
check('init.b.gitignore.body', readFileSync(join(REPO_B, '.gitignore'), 'utf8'), '.claude/\n',
  'an already-ignored repo keeps .gitignore byte-identical');
check('init.b.total', B.fields.TOTAL, '2', 'the tracked file list is .gitignore + src/b.ts');

// ── repo C: not a git repo ─────────────────────────────────────────────────
const REPO_C = join(BASE, 'plain-dir');
mkdirSync(REPO_C, { recursive: true });
const C = runInit(REPO_C);
check('init.c.exit', C.status, 1, 'a non-git directory exits 1');
check('init.c.stdout', C.stdout, 'ERROR: Not git repo\n', 'and says so before creating anything');

// ── report ─────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('\n=== secrets-scan scan-init TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
