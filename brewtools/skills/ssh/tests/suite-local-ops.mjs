#!/usr/bin/env node
/**
 * Suite: claude-local-ops.sh (BT-F11).
 * Contract: server rows are written to the "## SSH Servers" table and nowhere else;
 * the file is resolved from the project root, never from cwd.
 * Runs entirely inside an isolated temp dir; never touches the repo tree.
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SCRIPT = join(HERE, '..', 'scripts', 'claude-local-ops.sh');

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(`  FAIL  ${name}  (${message} | actual=${a} expected=${e})`);
  }
}

/** Fresh isolated project root; CLAUDE_PROJECT_DIR points at it. */
function newRoot(content) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ssh-local-ops-')));
  if (content !== null) writeFileSync(join(root, 'CLAUDE.local.md'), content);
  return root;
}

function run(root, args, { cwd = root, env = {} } = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    timeout: 20000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

const read = (root) => readFileSync(join(root, 'CLAUDE.local.md'), 'utf8');
const lines = (s) => s.split('\n');

// Fixture reproducing the reported trigger: a foreign pipe table BEFORE the SSH table.
const FOREIGN_FIRST = `# Local Configuration

## GitHub Configuration

| Key | Value |
|---|---|
| account | kochetkov-ma |

## SSH Servers

| Name | Host | User | Port | Key | Default |
|------|------|------|------|-----|---------|

> Connect via: \`/brewtools:ssh connect to <name>\`
`;

// ── 1. add writes into the SSH table, not the first table in the file ──────
{
  const root = newRoot(FOREIGN_FIRST);
  const r = run(root, ['add', 'vps-main', '10.0.0.1', 'deploy', '22', '~/.ssh/id_ed25519_vps']);
  const out = read(root);
  check('add.exit', r.status, 0, 'add into an anchored SSH table exits 0');
  check('add.stdout', r.stdout, 'ADDED=vps-main\nDEFAULT=*\n', 'add reports the row and the first-server default flag');
  check(
    'add.foreign-table-intact',
    out.split('## SSH Servers')[0],
    FOREIGN_FIRST.split('## SSH Servers')[0],
    'everything above the SSH heading is byte-identical after add',
  );
  check(
    'add.row-position',
    lines(out).indexOf('| vps-main | 10.0.0.1 | deploy | 22 | ~/.ssh/id_ed25519_vps | * |'),
    12,
    'the row lands directly under the SSH table separator (0-based line 12)',
  );
  check('add.row-count', lines(out).filter((l) => l.startsWith('| vps-main |')).length, 1, 'exactly one row written');

  const rd = run(root, ['read']);
  check(
    'read.after-add',
    rd.stdout,
    'FILE=exists\nSERVER=vps-main\nvps-main_HOST=10.0.0.1\nvps-main_USER=deploy\nvps-main_PORT=22\nvps-main_KEY=~/.ssh/id_ed25519_vps\nvps-main_DEFAULT=*\n',
    'read sees the server it just added (the both-ways failure is gone)',
  );

  const ls = run(root, ['list']);
  check('list.after-add', ls.stdout, 'SERVER_COUNT=1\nSERVER=vps-main (default)\n', 'list sees the server');
  rmSync(root, { recursive: true, force: true });
}

// ── 2. second add appends after the first, still inside the SSH table ──────
{
  const root = newRoot(FOREIGN_FIRST);
  run(root, ['add', 'vps-main', '10.0.0.1', 'deploy', '22', 'k1']);
  const r = run(root, ['add', 'vps-two', '10.0.0.2', 'deploy', '2222', 'k2']);
  const out = read(root);
  check('add2.exit', r.status, 0, 'second add exits 0');
  check('add2.stdout', r.stdout, 'ADDED=vps-two\nDEFAULT=\n', 'second server gets no default flag');
  check(
    'add2.table',
    lines(out).filter((l) => l.startsWith('| vps-')),
    ['| vps-main | 10.0.0.1 | deploy | 22 | k1 | * |', '| vps-two | 10.0.0.2 | deploy | 2222 | k2 |  |'],
    'both rows, in insertion order, inside the SSH table',
  );
  const sd = run(root, ['set-default', 'vps-two']);
  check('set-default.exit', sd.status, 0, 'set-default exits 0');
  check(
    'set-default.table',
    lines(read(root)).filter((l) => l.startsWith('| vps-')),
    ['| vps-main | 10.0.0.1 | deploy | 22 | k1 |  |', '| vps-two | 10.0.0.2 | deploy | 2222 | k2 | * |'],
    'set-default moves the flag and rewrites only SSH rows',
  );
  check(
    'set-default.foreign-intact',
    read(root).split('## SSH Servers')[0],
    FOREIGN_FIRST.split('## SSH Servers')[0],
    'the GitHub table is untouched by set-default',
  );
  rmSync(root, { recursive: true, force: true });
}

// ── 3. missing SSH section: refuse, do not append blind ────────────────────
{
  const noSection = '# Local Configuration\n\n## GitHub Configuration\n\n| Key | Value |\n|---|---|\n| account | x |\n';
  const root = newRoot(noSection);
  const r = run(root, ['add', 'vps-main', '10.0.0.1', 'deploy', '22', 'k1']);
  check('missing.exit', r.status, 1, 'add exits 1 when the SSH Servers table is absent');
  check(
    'missing.stdout',
    r.stdout,
    `ERROR: '## SSH Servers' table not found in ${join(root, 'CLAUDE.local.md')} -- refusing to append blind.\n`,
    'the refusal names the missing section and the resolved file',
  );
  check('missing.file-unchanged', read(root), noSection, 'the file is byte-identical after the refusal');
  rmSync(root, { recursive: true, force: true });
}

// ── 4. duplicate detection is scoped to the SSH table ──────────────────────
{
  const collide = FOREIGN_FIRST.replace('| account | kochetkov-ma |', '| vps-main | kochetkov-ma |');
  const root = newRoot(collide);
  const r = run(root, ['add', 'vps-main', '10.0.0.1', 'deploy', '22', 'k1']);
  check('dup.foreign-row-not-a-duplicate', r.status, 0, 'a same-named row in a foreign table does not block add');
  const again = run(root, ['add', 'vps-main', '10.0.0.9', 'deploy', '22', 'k9']);
  check('dup.real-duplicate-exit', again.status, 1, 'a real duplicate in the SSH table exits 1');
  check(
    'dup.real-duplicate-stdout',
    again.stdout,
    "ERROR: Server 'vps-main' already exists. Use 'update' to modify.\n",
    'the duplicate error names the server',
  );
  check(
    'dup.row-count',
    lines(read(root)).filter((l) => l.startsWith('| vps-main | 10.0.0.')).length,
    1,
    'the duplicate attempt wrote nothing',
  );
  rmSync(root, { recursive: true, force: true });
}

// ── 5. file is resolved from the project root, never from cwd ─────────────
{
  const root = newRoot(FOREIGN_FIRST);
  const sub = join(root, 'services', 'api');
  mkdirSync(sub, { recursive: true });
  const r = run(root, ['add', 'vps-main', '10.0.0.1', 'deploy', '22', 'k1'], { cwd: sub });
  check('cwd.exit', r.status, 0, 'add from a subdirectory exits 0');
  check(
    'cwd.row-in-root-file',
    lines(read(root)).filter((l) => l.startsWith('| vps-main |')).length,
    1,
    'the row landed in the project-root CLAUDE.local.md',
  );
  check('cwd.no-stray-file', readdirSync(sub), [], 'no stray CLAUDE.local.md is created in the subdirectory');
  rmSync(root, { recursive: true, force: true });
}

// ── 6. git-toplevel fallback when CLAUDE_PROJECT_DIR is unset ─────────────
{
  const root = newRoot(FOREIGN_FIRST);
  spawnSync('git', ['init', '-q'], { cwd: root });
  const sub = join(root, 'deep', 'nested');
  mkdirSync(sub, { recursive: true });
  const r = spawnSync('bash', [SCRIPT, 'add', 'vps-main', '10.0.0.1', 'deploy', '22', 'k1'], {
    cwd: sub,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
    timeout: 20000,
  });
  check('git.exit', r.status, 0, 'add resolves the root via git rev-parse when CLAUDE_PROJECT_DIR is empty');
  check(
    'git.row-in-root-file',
    lines(read(root)).filter((l) => l.startsWith('| vps-main |')).length,
    1,
    'the row landed in the git-toplevel CLAUDE.local.md',
  );
  check('git.no-stray-file', readdirSync(sub), [], 'no stray file in the nested cwd');
  rmSync(root, { recursive: true, force: true });
}

// ── 7. bootstrap: no file yet -> init writes the section, then the row ────
{
  const root = newRoot(null);
  const r = run(root, ['add', 'vps-main', '10.0.0.1', 'deploy', '22', 'k1']);
  check('init.exit', r.status, 0, 'add on a missing file bootstraps and exits 0');
  check(
    'init.row',
    lines(read(root)).filter((l) => l.startsWith('| vps-main |')),
    ['| vps-main | 10.0.0.1 | deploy | 22 | k1 | * |'],
    'the bootstrapped file carries exactly one row',
  );
  // `update` appends a "## Server: NAME" section; a later add must still hit the SSH table
  run(root, ['update', 'vps-main', 'Debian 12', '6.1.0', '24.0.7', '100G', '/opt']);
  const r2 = run(root, ['add', 'vps-two', '10.0.0.2', 'deploy', '22', 'k2']);
  check('init.add-after-update-exit', r2.status, 0, 'add after update exits 0');
  check(
    'init.add-after-update-rows',
    lines(read(root)).filter((l) => l.startsWith('| vps-')),
    ['| vps-main | 10.0.0.1 | deploy | 22 | k1 | * |', '| vps-two | 10.0.0.2 | deploy | 22 | k2 |  |'],
    'the row goes to the SSH table, not into the "## Server:" property table',
  );
  check(
    'init.property-table-intact',
    lines(read(root)).filter((l) => l.startsWith('| OS |')),
    ['| OS | Debian 12 |'],
    'the per-server property table is untouched',
  );
  rmSync(root, { recursive: true, force: true });
}

console.log(results.join('\n'));
console.log(`\nsuite-local-ops: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
