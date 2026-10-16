#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const probes = readFileSync(join(STATUS_DIR, 'references/phase1-probes.md'), 'utf8');
const parking = [...probes.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1])
  .find(block => block.includes('echo "CONFLICT $f"'));
const row1 = skill.split('\n').find(line => line.startsWith('| 1 | `/brewcode:teams-setup`')) || '';

const stamped = generator => `---\nname: x\ngenerated_by: ${generator}\n---\n# Agent\n`;

function project(t, agents) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-foreign-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.claude/teams/core'), { recursive: true });
  mkdirSync(join(root, '.claude/agents'), { recursive: true });
  const rows = Object.keys(agents).map(name => `| \`${name}\` | domain | mission |`).join('\n');
  writeFileSync(join(root, '.claude/teams/core/team.md'),
    `# Team core\n\n## Agents\n\n| Agent | Domain | Mission |\n|-------|--------|---------|\n${rows}\n\n## Trace\n`);
  for (const [name, [file, body]] of Object.entries(agents)) writeFileSync(join(root, '.claude/agents', file), body);
  return root;
}

// Load-time token -> env ref: the path reaches bash via env, never spliced into the command text.
function teamLines(root, fence = parking) {
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', fence.replaceAll('${CLAUDE_SKILL_DIR}', '${SUBST_SKILL_DIR}')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root, CLAUDE_PROJECT_DIR: root, SUBST_SKILL_DIR: STATUS_DIR }, timeout: 10000,
  });
  return { status: result.status, lines: result.stdout.split('\n').filter(line => / team:/.test(line)) };
}

test('GIVEN a team whose domain members are all parked WHEN the parking probe runs THEN foreign-owned and intent-guard rows are no member', t => {
  const root = project(t, {
    alpha: ['alpha.md.disabled', stamped('brewcode:teams-setup')],
    beta: ['beta.md.disabled', '# unstamped member\n'],
    'task-tracker': ['task-tracker.md', '# task-board agent, unstamped\n'],
    'release-bot': ['release-bot.md', stamped('brewcode:e2e')],
    'intent-guard': ['intent-guard.md', stamped('brewcode:superreview-setup')],
  });
  assert.deepEqual(teamLines(root), { status: 0, lines: [
    'PARKED team:core alpha',
    'PARKED team:core beta',
    'FOREIGN team:core task-tracker (brewtools:task-board-setup)',
    'FOREIGN team:core release-bot (brewcode:e2e)',
  ] }, 'a disabled team must read all-PARKED: task-tracker and stamp-owned agents never move with toggle-team.sh (v6.5.7 row 1)');
});

test('GIVEN a live member stamped by teams-setup WHEN the parking probe runs THEN it stays LIVE so a half toggle reads partial', t => {
  const root = project(t, {
    alpha: ['alpha.md.disabled', stamped('brewcode:teams-setup')],
    gamma: ['gamma.md', stamped('brewcode:teams-setup')],
  });
  assert.deepEqual(teamLines(root), { status: 0, lines: ['PARKED team:core alpha', 'LIVE   team:core gamma'] },
    'only another generator\'s stamp or a reserved name excludes a member; a teams stamp never does');
});

test('GIVEN no agent-generator.sh at the filled skill dir WHEN the parking probe runs THEN it fails loudly instead of counting foreign rows', t => {
  const root = project(t, { 'task-tracker': ['task-tracker.md', '# unstamped\n'] });
  const result = spawnSync('bash', ['-c', parking.replaceAll('${CLAUDE_SKILL_DIR}', '${SUBST_SKILL_DIR}')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root, CLAUDE_PROJECT_DIR: root, SUBST_SKILL_DIR: join(root, 'nowhere') }, timeout: 10000,
  });
  assert.deepEqual({ status: result.status, failed: /^FAILED: no agent-generator\.sh at /m.test(result.stdout) }, { status: 1, failed: true },
    'an unfilled or wrong skill dir must stop the probe, never report task-tracker as a live member');
});

test('GIVEN the roster WHEN reading row 1 off-switch THEN it names the agent-generator.sh exclusion beside intent-guard', () => {
  const actual = {
    intentGuard: row1.includes('`intent-guard` is never parked'),
    foreign: row1.includes('`$BC/skills/teams-setup/scripts/agent-generator.sh` names as owned by another generator'),
    reading: probes.includes('| `FOREIGN team:<t> <agent> (<plugin>:<skill>)` | not a team member'),
  };
  assert.deepEqual(actual, { intentGuard: true, foreign: true, reading: true },
    'row 1 cell and the Phase 1b reading table must both exclude foreign-owned roster rows');
});
