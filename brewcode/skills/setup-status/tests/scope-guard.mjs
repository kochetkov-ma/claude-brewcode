#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const GUARDS = ['brewcode/skills/teams-setup/scripts/scope-guard.sh', 'brewtools/skills/task-board-setup/scripts/scope-guard.sh',
  'brewdoc/skills/memory-sync-setup/scripts/scope-guard.sh'].map(p => join(ROOT, p));
const GUARD = GUARDS[0];
const RULE = 'is a defect to report, never to apply';
const UPGRADES = {
  'brewcode/skills/teams-setup/SKILL.md': '`.claude/teams/{TEAM_NAME}/`',
  'brewtools/skills/task-board-setup/SKILL.md': '`.claude/features/`',
  'brewtools/skills/task-board-setup/references/10-upgrade.md': '`.claude/features/`',
  'brewdoc/skills/memory-sync-setup/SKILL.md': '`.claude/skills/memory-sync/`',
  'brewcode/skills/convention-setup/SKILL.md': '`.claude/convention/`',
  'brewcode/skills/superreview-setup/SKILL.md': '`.claude/skills/superreview/`',
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} must succeed: ${r.stderr}`);
}

function repo(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'scope-guard-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  for (const [file, body] of [['src/App.java', 'class App {}\n'], ['src/AppTest.java', 'class AppTest {}\n'], ['.claude/teams/t/team.md', '# t\n'], ['notes.md', 'dirty before\n']]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), body);
  }
  git(dir, 'add', '.');
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  writeFileSync(join(dir, 'notes.md'), 'dirty before the run\n');
  return dir;
}

const guard = (...args) => {
  const r = spawnSync('bash', [GUARD, ...args], { encoding: 'utf8' });
  return { rc: r.status, out: r.stdout.trim().split('\n').map(l => l.replace(/ -> .*$/, '')) };
};

test('GIVEN a setup run that edits application source WHEN the scope gate checks THEN it fails naming each path', t => {
  // GIVEN: a repo already dirty on notes.md, snapshotted before the run.
  const dir = repo(t);
  const snap = guard('snapshot', dir, 'teams-upgrade');
  // WHEN: the run edits its own team.md plus application source and a test (the conductor incident), and the gate runs.
  writeFileSync(join(dir, '.claude/teams/t/team.md'), '# t upgraded\n');
  writeFileSync(join(dir, 'src/App.java'), 'class App { /* edited */ }\n');
  writeFileSync(join(dir, 'src/AppTest.java'), 'class AppTest { /* edited */ }\n');
  const check = guard('check', dir, 'teams-upgrade', '.claude/teams/t/', '.claude/agents/');
  // THEN: the pre-existing dirty file is not blamed; both source edits are; the gate fails.
  assert.deepEqual({ snap, check }, {
    snap: { rc: 0, out: ['SCOPE snapshot 1 dirty path(s)'] },
    check: { rc: 1, out: ['OUTSIDE src/App.java', 'OUTSIDE src/AppTest.java',
      '❌ SCOPE 2 path(s) outside the owned set changed: a defect to report, never to keep'] },
  }, 'edits outside the owned paths must fail the scope gate by path');
});

test('GIVEN a setup run that touches only owned paths WHEN the scope gate checks THEN it passes; no git -> n/a', t => {
  // GIVEN: a snapshotted repo, and a plain dir with no git.
  const dir = repo(t);
  guard('snapshot', dir, 'teams-upgrade');
  const plain = realpathSync(mkdtempSync(join(tmpdir(), 'scope-guard-plain-')));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  // WHEN: only team.md and a new agent change, then the gate runs; and the plain dir is snapshotted.
  writeFileSync(join(dir, '.claude/teams/t/team.md'), '# t upgraded\n');
  mkdirSync(join(dir, '.claude/agents'), { recursive: true });
  writeFileSync(join(dir, '.claude/agents/a.md'), '---\nname: a\n---\n');
  const check = guard('check', dir, 'teams-upgrade', '.claude/teams/t/', '.claude/agents/');
  const none = guard('snapshot', plain, 'teams-upgrade');
  // THEN: the owned run passes; without git the gate says so instead of guessing.
  assert.deepEqual({ check, none }, {
    check: { rc: 0, out: ['SCOPE ok: only owned paths changed (.claude/teams/t/ .claude/agents/)'] },
    none: { rc: 0, out: [`SCOPE n/a (no git at ${plain}): check the changed files by hand`] },
  }, 'owned-only changes must pass and a non-git target must report n/a');
});

test('every generator upgrade carries the normative scope rule and the guard copies stay identical', () => {
  // GIVEN: the five generator upgrade texts and the three shipped guard copies.
  const texts = Object.entries(UPGRADES).map(([file, owned]) => {
    const line = readFileSync(join(ROOT, file), 'utf8').split('\n').find(l => l.includes('**Scope (normative):** `upgrade` edits only this setup')) ?? 'NO SCOPE RULE';
    return [file, line.includes(owned), line.includes(RULE)];
  });
  const copies = GUARDS.map(p => readFileSync(p, 'utf8'));
  // WHEN/THEN: each names its owned paths and the defect rule; the copies are byte-equal.
  assert.deepEqual({ texts, same: copies.every(c => c === copies[0]) },
    { texts: Object.keys(UPGRADES).map(f => [f, true, true]), same: true },
    'every generator upgrade must pin its owned paths and treat any other change as a defect');
});
