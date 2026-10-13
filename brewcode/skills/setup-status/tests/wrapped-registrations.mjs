#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const TOOLS = join(ROOT, 'brewtools');
const skill = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const probes = readFileSync(join(STATUS_DIR, 'references', 'phase1-probes.md'), 'utf8');
const rowNotes = readFileSync(join(STATUS_DIR, 'references', 'row-notes.md'), 'utf8');
const blocks = [...probes.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]);
const regBlock = blocks.find(b => b.includes('roster handler(s)'));
const routerBlock = blocks.find(b => b.includes('--probe'));
const LAUNCH = '"$CLAUDE_PROJECT_DIR/.claude/scripts/toolchain_preflight.py" exec node -- "$CLAUDE_PROJECT_DIR/.claude/hooks/';
const wrap = (script, timeout) => ({ type: 'command', command: `${LAUNCH}${script}"`, ...(timeout ? { timeout } : {}) });
// project-dusk .claude/settings.json hook shape, verbatim apart from the foreign SessionStart entry.
const DUSK = { hooks: {
  PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [wrap('docsync-track.mjs')] }],
  Stop: [{ hooks: [wrap('docsync-gate.mjs')] }],
  PreToolUse: [
    { hooks: [wrap('agent-deadline-guard.mjs', 5)], matcher: '.*' },
    { matcher: 'Agent', hooks: [wrap('agent-router.mjs', 5)] },
  ],
  SubagentStop: [{ hooks: [wrap('agent-deadline-cleanup.mjs', 3)] }],
} };

function project(t, settings) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-wrapped-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
  mkdirSync(join(root, 'profile'), { recursive: true });
  writeFileSync(join(root, '.claude', 'hooks', 'agent-router.mjs'), '// installed copy\n');
  if (settings) writeFileSync(join(root, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  return root;
}

function run(root, block) {
  const r = spawnSync('bash', ['-c', block.replace('BT=/abs/brewtools/root', `BT="${TOOLS}"`)], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_CONFIG_DIR: join(root, 'profile'), HOME: root },
  });
  assert.equal(r.status, 0, `shipped probe must run: ${r.stderr}`);
  return r.stdout.split('\n').filter(line => line.startsWith('REG project ') || /^\d+\|/.test(line));
}

test('REG and router probes read a wrapped registration as wired and custom, never missing', t => {
  // GIVEN: the project-dusk registrations, every hook command-only behind the project launcher.
  const root = project(t, DUSK);
  // WHEN: the shipped Phase 1 REG probe and the row-7 owner probe run.
  const reg = run(root, regBlock);
  const router = run(root, routerBlock);
  // THEN: every handler is listed with its event and a wrapped tag; the router probe counts it as wrapped.
  assert.deepEqual({ reg, router }, {
    reg: [
      'REG project PostToolUse Write|Edit|MultiEdit docsync-track.mjs wrapped=toolchain_preflight.py',
      'REG project Stop - docsync-gate.mjs wrapped=toolchain_preflight.py',
      'REG project PreToolUse .* agent-deadline-guard.mjs wrapped=toolchain_preflight.py',
      'REG project PreToolUse Agent agent-router.mjs wrapped=toolchain_preflight.py',
      'REG project SubagentStop - agent-deadline-cleanup.mjs wrapped=toolchain_preflight.py',
      `REG project 5 roster handler(s) .claude/settings.json`,
    ],
    router: ['0|0|0|0|yes|1'],
  }, 'a wrapped command-only registration must be detected, tagged and never read as missing');
});

test('REG and router probes still report a missing registration as missing and a direct one untagged', t => {
  // GIVEN: one project without router registration, one with the installer exec form.
  const missing = project(t, { hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'node', args: ['/foreign/keep.mjs'] }] }] } });
  const direct = project(t, { hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [
    { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs'], timeout: 5 },
  ] }] } });
  // WHEN: both probes run on each.
  const result = { missing: [...run(missing, regBlock), ...run(missing, routerBlock)], direct: [...run(direct, regBlock), ...run(direct, routerBlock)] };
  // THEN: the missing router reads 0 everywhere; the exec form is tier 1 with no wrapped tag.
  assert.deepEqual(result, {
    missing: ['REG project 0 roster handler(s) .claude/settings.json', '0|0|0|0|yes|0'],
    direct: ['REG project PreToolUse Agent agent-router.mjs', 'REG project 1 roster handler(s) .claude/settings.json', '1|0|0|0|yes|0'],
  }, 'a missing registration must stay missing, and the installer shape must stay untagged');
});

test('Phase 3 classifies a wrapped install as custom and report-only, never install or upgrade', () => {
  // GIVEN: the shipped classifier, the REG reading table and the docsync row notes.
  const rule3b = skill.split('\n').find(line => line.startsWith('| 3b |')) ?? 'NO RULE 3b';
  const regRow = probes.split('\n').find(line => line.startsWith('| a line ending in `wrapped=<launcher>` |')) ?? 'NO WRAPPED ROW';
  const forkNote = rowNotes.split('\n').find(line => line.startsWith('- A user fork (project-dusk shape)')) ?? 'NO FORK NOTE';
  // WHEN: the normative phrases are read. THEN: each is present verbatim.
  assert.deepEqual(
    [rule3b.includes('`current (custom)` on a `CURRENT`/`META` stamp'), rule3b.includes('never `install`/`upgrade`'),
      regRow.includes('never prescribes `install` or `upgrade`'), forkNote.includes('Rule 3b: `current (custom)`')],
    [true, true, true, true],
    'a wrapped registration must read current (custom) and never prescribe install or upgrade',
  );
});

test('semble-row reads custom hook rows as current custom', () => {
  // GIVEN: a guidance section fully wired, two rows of it through a project launcher.
  const guidance = { rule: 'managed', wiredCount: 4, wantCount: 4, customCount: 2, staleEntries: 0, absoluteCount: 0,
    retired: [], retiredWired: [], permissionsWired: true, ruleStampStale: false, content_version: '1.0.0', templateContentVersion: '1.0.0' };
  // WHEN: semble-row maps it.
  const r = spawnSync(process.execPath, [join(STATUS_DIR, 'scripts', 'semble-row.mjs'), '/tpl'], { input: JSON.stringify({ guidance }), encoding: 'utf8' });
  // THEN: the row is current custom, report-only.
  assert.deepEqual(r.stdout.split('\n')[0], 'ROW2 current custom', 'custom semble hook rows must read current, never install');
});
