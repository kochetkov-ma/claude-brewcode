#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

// Sandboxed HOME; global config /dev/null, or a temp one whose excludes file holds `ignore`: the user's never leaks in.
function gitEnv(t, ignore = '') {
  const cfg = realpathSync(mkdtempSync(join(tmpdir(), 'scope-guard-cfg-')));
  t.after(() => rmSync(cfg, { recursive: true, force: true }));
  writeFileSync(join(cfg, 'ignore'), ignore);
  writeFileSync(join(cfg, 'gitconfig'), `[core]\n\texcludesFile = ${join(cfg, 'ignore')}\n`);
  return { ...process.env, HOME: cfg, XDG_CONFIG_HOME: join(cfg, 'xdg'),
    GIT_CONFIG_GLOBAL: ignore ? join(cfg, 'gitconfig') : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}

function git(env, cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} must succeed: ${r.stderr}`);
}

function write(dir, file, body) {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), body);
}

function repo(t, env, extra = []) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'scope-guard-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(env, dir, 'init', '-q');
  for (const [file, body] of [['src/App.java', 'class App {}\n'], ['src/AppTest.java', 'class AppTest {}\n'], ['.claude/teams/t/team.md', '# t\n'], ['notes.md', 'dirty before\n'], ...extra]) {
    write(dir, file, body);
  }
  git(env, dir, 'add', '.');
  git(env, dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  writeFileSync(join(dir, 'notes.md'), 'dirty before the run\n');
  return dir;
}

const guard = (env, ...args) => {
  const r = spawnSync('bash', [GUARD, ...args], { env, encoding: 'utf8' });
  return { rc: r.status, out: r.stdout.trim().split('\n').map(l => l.replace(/ -> .*$/, '')) };
};

test('GIVEN a setup run that edits application source WHEN the scope gate checks THEN it fails naming each path', t => {
  // GIVEN: a repo already dirty on notes.md, snapshotted before the run.
  const env = gitEnv(t);
  const dir = repo(t, env);
  const snap = guard(env, 'snapshot', dir, 'teams-upgrade');
  // WHEN: the run edits its own team.md plus application source and a test (the conductor incident), and the gate runs.
  writeFileSync(join(dir, '.claude/teams/t/team.md'), '# t upgraded\n');
  writeFileSync(join(dir, 'src/App.java'), 'class App { /* edited */ }\n');
  writeFileSync(join(dir, 'src/AppTest.java'), 'class AppTest { /* edited */ }\n');
  const check = guard(env, 'check', dir, 'teams-upgrade', '.claude/teams/t/', '.claude/agents/');
  // THEN: the pre-existing dirty file is not blamed; both source edits are; the gate fails.
  assert.deepEqual({ snap, check }, {
    snap: { rc: 0, out: ['SCOPE snapshot 1 dirty path(s)'] },
    check: { rc: 1, out: ['OUTSIDE src/App.java', 'OUTSIDE src/AppTest.java',
      '❌ SCOPE 2 path(s) outside the owned set changed: a defect to report, never to keep'] },
  }, 'edits outside the owned paths must fail the scope gate by path');
});

test('GIVEN a setup run that touches only owned paths WHEN the scope gate checks THEN it passes; no git -> n/a', t => {
  // GIVEN: a snapshotted repo, and a plain dir with no git.
  const env = gitEnv(t);
  const dir = repo(t, env);
  guard(env, 'snapshot', dir, 'teams-upgrade');
  const plain = realpathSync(mkdtempSync(join(tmpdir(), 'scope-guard-plain-')));
  t.after(() => rmSync(plain, { recursive: true, force: true }));
  // WHEN: only team.md and a new agent change, then the gate runs; and the plain dir is snapshotted.
  writeFileSync(join(dir, '.claude/teams/t/team.md'), '# t upgraded\n');
  mkdirSync(join(dir, '.claude/agents'), { recursive: true });
  writeFileSync(join(dir, '.claude/agents/a.md'), '---\nname: a\n---\n');
  const check = guard(env, 'check', dir, 'teams-upgrade', '.claude/teams/t/', '.claude/agents/');
  const none = guard(env, 'snapshot', plain, 'teams-upgrade');
  // THEN: the owned run passes; without git the gate says so instead of guessing.
  assert.deepEqual({ check, none }, {
    check: { rc: 0, out: ['SCOPE ok: only owned paths changed (.claude/teams/t/ .claude/agents/)'] },
    none: { rc: 0, out: [`SCOPE n/a (no git at ${plain}): check the changed files by hand`] },
  }, 'owned-only changes must pass and a non-git target must report n/a');
});

test('GIVEN a global gitignore hiding .claude/ WHEN the run writes there outside its owned paths THEN the gate names each file', t => {
  // GIVEN: core.excludesFile ignores .claude/ (the maintainer's machine); an ignored report and rule predate the snapshot.
  const env = gitEnv(t, '.claude/\n');
  const dir = repo(t, env);
  write(dir, '.claude/reports/old.md', '# old report\n');
  write(dir, '.claude/rules/style.md', '# style\n');
  const snap = guard(env, 'snapshot', dir, 'teams-upgrade');
  // WHEN: owned writes, one rule edit, one new skill, setup state beside runtime files (semble state.json,
  // docsync config.json), plus a log and files under the skipped worktrees/ and node_modules/.
  write(dir, '.claude/teams/t/team.md', '# t upgraded\n');
  write(dir, '.claude/agents/a.md', '---\nname: a\n---\n');
  write(dir, '.claude/rules/style.md', '# style, rewritten\n');
  write(dir, '.claude/skills/rogue/SKILL.md', '---\nname: rogue\n---\n');
  write(dir, '.claude/semble/state.json', '{"phase":"ready"}\n');
  write(dir, '.claude/docsync/config.json', '{"enabled":true}\n');
  write(dir, '.claude/logs/brewcode.log', 'hook line\n');
  write(dir, '.claude/skills/rogue/node_modules/m.js', 'export {};\n');
  write(dir, '.claude/worktrees/w/notes.md', '# worktree\n');
  const check = guard(env, 'check', dir, 'teams-upgrade', '.claude/teams/t/', '.claude/agents/');
  // THEN: the ignored rule and team count as dirty (the report is runtime); every new non-runtime file is blamed.
  assert.deepEqual({ snap, check }, {
    snap: { rc: 0, out: ['SCOPE snapshot 3 dirty path(s)'] },
    check: { rc: 1, out: ['OUTSIDE .claude/docsync/config.json', 'OUTSIDE .claude/rules/style.md',
      'OUTSIDE .claude/semble/state.json', 'OUTSIDE .claude/skills/rogue/SKILL.md',
      '❌ SCOPE 4 path(s) outside the owned set changed: a defect to report, never to keep'] },
  }, 'a gitignore must never hide a non-runtime write under .claude/ from the scope gate');
});

// Every runtime path the guard skips, written as hooks, Claude Code and concurrent sessions do mid-run.
function runtimeWrites(dir, pre = '') {
  appendFileSync(join(dir, `${pre}.claude/semble/telemetry.jsonl`), '{"ev":"open"}\n');
  appendFileSync(join(dir, `${pre}.claude/logs/brewcode.log`), 'hook line\n');
  for (const [file, body] of [['docsync/state-s1.jsonl', '{"ev":"edit"}\n'], ['docsync/state.jsonl', '{"ev":"edit"}\n'],
    ['agent-return-state/a1.json', '{}\n'], ['plans/LATEST.md', '# plan\n'], ['reports/20261016-000000_x/report.md', '# r\n'],
    ['tmp/scratch.txt', 'scratch\n'], ['scheduled_tasks.lock', '1\n'], ['scheduled_tasks.json', '[]\n'],
    ['settings.local.json', '{"permissions":{"allow":["Bash(ls:*)"]}}\n'], ['tasks/cfg/brewcode.state.json', '{}\n'],
    ['tasks/cfg/brewcode.state.json.tmp', '{}\n'], ['worktrees/w/notes.md', '# wt\n']]) {
    write(dir, `${pre}.claude/${file}`, body);
  }
}

test('GIVEN hooks and Claude Code write runtime files mid-run WHEN the scope gate checks THEN only owned paths count', t => {
  // GIVEN: semble's dir gitignored by the project (as semble-setup writes it), the rest plain untracked;
  // and the same tree with a global gitignore hiding .claude/. Telemetry and a log predate each snapshot.
  const run = (env) => {
    const dir = repo(t, env, [['.gitignore', '.claude/semble/\n']]);
    write(dir, '.claude/semble/telemetry.jsonl', '{"ev":"start"}\n');
    write(dir, '.claude/logs/brewcode.log', 'start\n');
    const snap = guard(env, 'snapshot', dir, 'teams-upgrade');
    // WHEN: every runtime path changes beside one owned edit, then the gate runs.
    runtimeWrites(dir);
    write(dir, '.claude/teams/t/team.md', '# t upgraded\n');
    return { snap, check: guard(env, 'check', dir, 'teams-upgrade', '.claude/teams/t/', '.claude/agents/') };
  };
  const pass = (n) => ({ snap: { rc: 0, out: [`SCOPE snapshot ${n} dirty path(s)`] },
    check: { rc: 0, out: ['SCOPE ok: only owned paths changed (.claude/teams/t/ .claude/agents/)'] } });
  // THEN: both pass; the hidden tree also snapshots its ignored team.md, never a runtime file.
  assert.deepEqual({ plain: run(gitEnv(t)), hidden: run(gitEnv(t, '.claude/\n')) }, { plain: pass(1), hidden: pass(2) },
    'runtime writes under either listing must never fail the scope gate');
});

test('GIVEN a project root in a subdir WHEN runtime files change in its and the top config dir THEN the gate passes', t => {
  // GIVEN: a global gitignore hiding every .claude/, root = sub/, top-level telemetry and log predate the snapshot.
  const env = gitEnv(t, '.claude/\n');
  const dir = repo(t, env, [['sub/README.md', '# sub\n']]);
  write(dir, '.claude/semble/telemetry.jsonl', '{"ev":"start"}\n');
  write(dir, '.claude/logs/brewcode.log', 'start\n');
  write(dir, 'sub/.claude/semble/telemetry.jsonl', '{"ev":"start"}\n');
  write(dir, 'sub/.claude/logs/brewcode.log', 'start\n');
  const snap = guard(env, 'snapshot', join(dir, 'sub'), 'teams-upgrade');
  // WHEN: runtime writes land in both config dirs beside one owned team write, then the gate runs.
  runtimeWrites(dir);
  runtimeWrites(dir, 'sub/');
  write(dir, 'sub/.claude/teams/t/team.md', '# t\n');
  const check = guard(env, 'check', join(dir, 'sub'), 'teams-upgrade', 'sub/.claude/teams/t/');
  // THEN: only the dirty notes.md and the ignored top team.md are snapshotted; the check passes.
  assert.deepEqual({ snap, check }, {
    snap: { rc: 0, out: ['SCOPE snapshot 2 dirty path(s)'] },
    check: { rc: 0, out: ['SCOPE ok: only owned paths changed (sub/.claude/teams/t/)'] },
  }, 'runtime writes in the top config dir must never fail a subdir root gate');
});

test('GIVEN a file git cannot read WHEN the gate snapshots or checks THEN it fails as unhashable and blames no path', t => {
  // GIVEN: four unchanged ignored rules snapshotted under a global gitignore hiding .claude/.
  const env = gitEnv(t, '.claude/\n');
  const dir = repo(t, env);
  for (const f of ['a0', 'b', 'c', 'd']) write(dir, `.claude/rules/${f}.md`, `# ${f}\n`);
  const snap = guard(env, 'snapshot', dir, 'teams-upgrade');
  // WHEN: a new rule sorted among them is unreadable; the gate checks, then a second run tries to snapshot.
  write(dir, '.claude/rules/a1.md', '# locked\n');
  chmodSync(join(dir, '.claude/rules/a1.md'), 0o000);
  assert.throws(() => readFileSync(join(dir, '.claude/rules/a1.md')), { code: 'EACCES' },
    'precondition: the locked rule must be unreadable to this user (run as non-root)');
  const check = guard(env, 'check', dir, 'teams-upgrade', '.claude/teams/t/');
  const resnap = guard(env, 'snapshot', dir, 'teams-again');
  const recheck = guard(env, 'check', dir, 'teams-again', '.claude/teams/t/');
  // THEN: both fail loudly with no OUTSIDE line, and the failed snapshot leaves no file behind.
  const failed = { rc: 1, out: ['❌ SCOPE cannot hash the tree (git error above): nothing judged, run it again'] };
  assert.deepEqual({ snap, check, resnap, recheck }, {
    snap: { rc: 0, out: ['SCOPE snapshot 6 dirty path(s)'] }, check: failed, resnap: failed,
    recheck: { rc: 1, out: ["❌ SCOPE no snapshot for 'teams-again': run snapshot before the setup writes"] },
  }, 'an unhashable file must fail the gate without blaming unchanged paths');
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
