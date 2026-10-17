#!/usr/bin/env node
// Row 12 CONV probe (phase1-probes.md) run as shipped under zsh -f (Bash-tool shell) and bash -e -o pipefail.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const probes = readFileSync(join(STATUS_DIR, 'references/phase1-probes.md'), 'utf8');
const fence = [...probes.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes('echo "CONV docs='));

function project(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'setup-status-conv-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.claude'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    if (body === 'DIR') mkdirSync(join(root, rel));
    else if (body.startsWith('LINK:')) symlinkSync(body.slice(5), join(root, rel));
    else writeFileSync(join(root, rel), body);
  }
  return root;
}

function run(shell, root) {
  const args = shell === 'zsh' ? ['-f', '-c', fence] : ['-e', '-o', 'pipefail', '-c', fence];
  const r = spawnSync(shell, args, { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root }, timeout: 10000 });
  return { rc: r.status, stdout: r.stdout, stderr: r.stderr };
}

const EMPTY = { rc: 0, stdout: 'CONV docs=0 owned=0 rule=absent names=\nOK\n', stderr: '' };

test('GIVEN zsh on PATH and the shipped CONV fence WHEN reading it THEN the precondition holds', () => {
  assert.deepEqual({ zsh: spawnSync('zsh', ['-f', '--version']).error, fence: typeof fence }, { zsh: undefined, fence: 'string' },
    'CI plugins shard installs zsh; phase1-probes.md must ship one fence printing the CONV line');
});

test('GIVEN no .claude/convention dir WHEN the CONV fence runs under zsh -f THEN it prints the zero line, never "no matches found"', t => {
  assert.deepEqual(run('zsh', project(t, {})), EMPTY, 'an unmatched bare *.md glob aborted the probe under zsh (e2e P7)');
});

test('GIVEN an empty .claude/convention dir WHEN the CONV fence runs under zsh -f and bash THEN both print the zero line', t => {
  const root = project(t, { '.claude/convention': 'DIR' });
  assert.deepEqual({ zsh: run('zsh', root), bash: run('bash', root) }, { zsh: EMPTY, bash: EMPTY },
    'a dir with no *.md is a normal row-12 answer in both shells');
});

test('GIVEN generated, hand-written, linked, hidden and non-md entries WHEN the CONV fence runs under zsh -f and bash THEN both count only visible *.md files', t => {
  const root = project(t, {
    '.claude/convention/reference-patterns.md': '---\ngenerated_by: "brewcode:convention-setup"\n---\n# Patterns\n',
    '.claude/convention/hand-notes.md': '# Hand-written\n',
    '.claude/convention/link.md': 'LINK:hand-notes.md',
    '.claude/convention/.hidden.md': '# hidden\n',
    '.claude/convention/notes.txt': 'not a doc\n',
    '.claude/convention/archive.md': 'DIR',
    '.claude/rules/convention.md': '# rule\n',
  });
  const want = { rc: 0, stdout: 'CONV docs=3 owned=1 rule=live names=hand-notes.md link.md reference-patterns.md\nOK\n', stderr: '' };
  assert.deepEqual({ zsh: run('zsh', root), bash: run('bash', root) }, { zsh: want, bash: want },
    'same set and order as the former bash glob: dotfiles, dirs and non-md skipped, a symlinked doc counted');
});
