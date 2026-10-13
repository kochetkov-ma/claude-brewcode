#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = join(STATUS_DIR, 'scripts/fence-run.sh');
const source = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const PROBE = 'd=$(dirname "$0"); echo "DIR $d"; echo "MODE $(ls -ld "$d" | cut -c1-10)"; echo "ARGS $*"; exit 7\n';

function run(env) {
  return spawnSync('bash', [RUNNER, 'a1', 'b2'], { input: PROBE, encoding: 'utf8', env, timeout: 10000 });
}

function parse(stdout) {
  return Object.fromEntries(stdout.trim().split('\n').map(line => [line.split(' ')[0], line.slice(line.indexOf(' ') + 1)]));
}

test('GIVEN a private TMPDIR WHEN fence-run.sh runs a fence THEN it runs from a 0700 mktemp dir under TMPDIR, keeps the rc and removes the dir', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-fence-')));
  try {
    const r = run({ ...process.env, TMPDIR: base });
    const out = parse(r.stdout);
    assert.deepEqual({
      status: r.status, under: dirname(out.DIR || '') === base, prefix: /^setup-status\.[A-Za-z0-9]{6}$/.test((out.DIR || '').split('/').pop()),
      mode: out.MODE, args: out.ARGS, gone: !existsSync(out.DIR || base), left: readdirSync(base),
    }, { status: 7, under: true, prefix: true, mode: 'drwx------', args: 'a1 b2', gone: true, left: [] },
    `helper scripts must never sit in a shared or world-readable dir (6.5.3 defect c; stderr: ${r.stderr})`);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('GIVEN TMPDIR unset WHEN fence-run.sh runs a fence THEN it falls back to a 0700 dir under /tmp and removes it', () => {
  const env = { ...process.env };
  delete env.TMPDIR;
  const r = run(env);
  const out = parse(r.stdout);
  assert.deepEqual({ status: r.status, parent: dirname(out.DIR || ''), mode: out.MODE, gone: !existsSync(out.DIR || '/tmp') },
    { status: 7, parent: '/tmp', mode: 'drwx------', gone: true }, `\${TMPDIR:-/tmp} fallback, private and cleaned (stderr: ${r.stderr})`);
});

test('GIVEN SKILL.md, references and scripts WHEN scanning for /tmp THEN only the ${TMPDIR:-/tmp} fallback appears and the fence rule names fence-run.sh', () => {
  const files = ['SKILL.md', ...readdirSync(join(STATUS_DIR, 'references')).map(f => `references/${f}`),
    ...readdirSync(join(STATUS_DIR, 'scripts')).map(f => `scripts/${f}`)];
  const fixed = files.filter(f => {
    const body = readFileSync(join(STATUS_DIR, f), 'utf8');
    return (body.match(/\/tmp\b/g) || []).length !== (body.match(/\$\{TMPDIR:-\/tmp\}/g) || []).length;
  });
  const actual = { fixed, rule: source.includes('## Running the fences'), heredoc: source.includes('bash "${CLAUDE_SKILL_DIR}/scripts/fence-run.sh" <<\'FENCE\'') };
  assert.deepEqual(actual, { fixed: [], rule: true, heredoc: true }, 'no fixed /tmp path; a fence saved as a file goes through fence-run.sh');
});
