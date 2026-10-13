#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const REFS = join(ROOT, 'brewtools/skills/task-board-setup/references');
const upgrade = readFileSync(join(REFS, '10-upgrade.md'), 'utf8');
const probe = upgrade.slice(upgrade.indexOf('(the PROBE BLOCK')).match(/```bash\n([\s\S]*?)\n```/)[1]
  .replace('<absolute path resolved in P0>', '$CLAUDE_PROJECT_DIR');
const agentTpl = readFileSync(join(REFS, '02-task-tracker-agent.md'), 'utf8');
const CEILING = Number(readFileSync(join(ROOT, 'brewcode/skills/teams-setup/scripts/verify-team.sh'), 'utf8')
  .match(/if \(chars > (\d+)\) fail\(`description is/)[1]);
const tplDescription = agentTpl.match(/^description: "(.*)"$/m)[1];
const LEGACY_DESC = 'Owns the file-based task board under .claude/features/ -- create/move/close tasks, groom the backlog, keep board.md + PROGRESS.md in sync on every transition. Triggers: add a task, close task.';

function board(t, tracker, description) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'task-board-probe-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    '.claude/features/board.md': '# Board\n',
    '.claude/features/TRACKER.md': tracker,
    '.claude/agents/task-tracker.md': `---\nname: task-tracker\ndescription: "${description}"\nmodel: sonnet\n---\n\n# task-tracker\n`,
  };
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  }
  return root;
}

function rows(root, labels) {
  const r = spawnSync('bash', ['-c', probe], { cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, HOME: root, CLAUDE_PROJECT_DIR: root } });
  assert.equal(r.status, 0, `probe block must succeed: ${r.stderr}`);
  return r.stdout.split('\n').filter(line => labels.includes(line.replace(/^\S+\s+/, ''))).map(l => l.replace(/\s+/, ' '));
}

const OWN_SECTIONS = '# TRACKER\n\n## 10. Spec layer\n\n| in/out | status |\n\n## 11. Ownership\n\nOwners.\n';
const METHOD_AT_12 = `${OWN_SECTIONS}\n## 12. Domain methodology and session anti-drift\n\nSee METHODOLOGY.md and ANTI-DRIFT.md.\n`;

test('GIVEN a TRACKER whose own section 11 pushed methodology to 12 WHEN the U1 probe runs THEN 2m and 2s read MARK-OK by title', t => {
  // GIVEN: the brewpage shape, a hand-added `## 11. Ownership`, methodology installed as section 12.
  const root = board(t, METHOD_AT_12, tplDescription);
  // WHEN: the shipped U1 PROBE BLOCK runs.
  const got = rows(root, ['2s', '2m']);
  // THEN: both title-matched rows are found regardless of their section number.
  assert.deepEqual(got, ['MARK-OK 2s', 'MARK-OK 2m'], 'a renumbered section must never be re-inserted on every upgrade');
});

test('GIVEN a TRACKER without the methodology section WHEN the U1 probe runs THEN 2m reads PATCH', t => {
  // GIVEN: section 11 is the user's own, no methodology section anywhere.
  const root = board(t, `${OWN_SECTIONS}\nMETHODOLOGY.md ANTI-DRIFT.md\n`, tplDescription);
  // WHEN: the shipped U1 PROBE BLOCK runs.
  const got = rows(root, ['2m']);
  // THEN: the missing section is still detected.
  assert.deepEqual(got, ['PATCH 2m'], 'a missing methodology section must stay a PATCH row');
});

test('GIVEN the shipped task-tracker template WHEN its description is read THEN it fits the verify-team.sh ceiling with no spec token', () => {
  // GIVEN: ref 02's template and the teams ceiling. WHEN: the description value is measured.
  const got = { ceiling: CEILING, fits: Array.from(tplDescription).length <= CEILING, token: tplDescription.includes('{{'),
    whenToUse: /\n## When to use\n\n.*Triggers: .*session progress\.\n<example>.*\{\{SPEC_TRIGGERS\}\}\n/.test(agentTpl) };
  // THEN: <=100 chars, no placeholder, triggers + examples + spec token live in the body.
  assert.deepEqual(got, { ceiling: 100, fits: true, token: false, whenToUse: true },
    `task-tracker description must stay within the teams ceiling (${Array.from(tplDescription).length} chars: ${tplDescription})`);
});

test('GIVEN a pre-6.5.6 task-tracker with a long description WHEN the U1 probe runs THEN 1d reads PATCH, the template reads MARK-OK', t => {
  // GIVEN: one board with the legacy trigger-laden description, one with the template's.
  const legacy = board(t, METHOD_AT_12, LEGACY_DESC);
  const current = board(t, METHOD_AT_12, tplDescription);
  // WHEN: the shipped U1 PROBE BLOCK runs on both.
  const got = { legacy: rows(legacy, ['1d']), current: rows(current, ['1d']) };
  // THEN: only the over-ceiling description is a PATCH row.
  assert.deepEqual(got, { legacy: ['PATCH 1d'], current: ['MARK-OK 1d'] }, 'row 1d must key on the decoded description length');
});
