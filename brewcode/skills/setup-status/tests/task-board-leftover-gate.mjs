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
const blockOf = ref => {
  const text = readFileSync(join(REFS, ref), 'utf8');
  return text.slice(text.indexOf('**Leftover-placeholder gate**')).match(/```bash\n([\s\S]*?)\n```/)[1];
};
const UPGRADE_BLOCK = blockOf('10-upgrade.md');
const INSTALL_BLOCK = blockOf('12-verify-report.md');
const fill = block => block.replace('<absolute path resolved in P0>', '$CLAUDE_PROJECT_DIR');
const gate = fill(UPGRADE_BLOCK);
const SECRET = '${{ secrets.DEPLOY_KEY }}';
// The 15 files refs 02-05, 08, 09, 11 emit, all resolved; their live task text quotes CI expressions.
const GENERATED = {
  '.claude/features/board.md': `# Board\n\n| id | title |\n|----|-------|\n| T-ci-1 | rotate ${SECRET} |\n`,
  '.claude/features/TRACKER.md': '# TRACKER\n',
  '.claude/features/INDEX.md': '# INDEX\n',
  '.claude/features/PROGRESS.md': `# PROGRESS\n\nNOW: T-ci-1 rotate ${SECRET}\n`,
  '.claude/features/backlog/README.md': '# backlog\n',
  '.claude/features/METHODOLOGY.md': '# METHODOLOGY\n\n`gh workflow run ci.yml -f ref=${{ github.ref }}`\n',
  '.claude/features/ANTI-DRIFT.md': '# ANTI-DRIFT\n',
  '.claude/features/task-graph.md': `# task-graph\n\n- T-ci-1 rotate ${SECRET}\n`,
  '.claude/agents/task-tracker.md': '# task-tracker\n',
  '.claude/rules/tasks.md': '# tasks\n',
  '.claude/skills/task-board/SKILL.md': '# task-board\n',
  '.claude/skills/task-spec/SKILL.md': '# task-spec\n',
  '.claude/features/TASK_TEMPLATE.md': '# TASK\n',
  '.claude/features/specs/SPEC_TEMPLATE.md': '# SPEC\n',
  '.claude/features/specs/DESIGN_TEMPLATE.md': '# DESIGN\n',
};
// User data: a card per lifecycle folder, a /task-spec doc, a user file in a generated skill dir.
const USER = {
  '.claude/features/backlog/rotate-keys.md': `Use ${SECRET} in deploy.yml\n`,
  '.claude/features/todo/T-ci-1.md': `---\nid: T-ci-1\n---\n\nenv:\n  KEY: ${SECRET}\n`,
  '.claude/features/progress/T-ci-2.md': '---\nid: T-ci-2\n---\n\nHelm {{ .Values.image.tag }}, mustache {{NAME}}\n',
  '.claude/features/closed/T-ci-0.md': `---\nid: T-ci-0\n---\n\n${SECRET}\n`,
  '.claude/features/specs/T-ci-1-spec.md': `# Spec\n\n${SECRET} and the {{DOMAINS}} token, quoted\n`,
  '.claude/skills/task-board/notes.md': '{{LANG}} is the language token\n',
};

function target(t, files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'task-board-leftover-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  }
  return root;
}

function run(root, block = gate) {
  const r = spawnSync('bash', ['-c', block], { cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, HOME: root, CLAUDE_PROJECT_DIR: root } });
  return { rc: r.status, out: r.stdout.trim().split('\n').map(l => l.replaceAll(`${root}/`, '')), err: r.stderr };
}

test('GIVEN user cards, a spec doc and live board text quoting ${{ secrets.X }} WHEN the U6 leftover gate runs THEN it prints OK', t => {
  // GIVEN: resolved generated controls whose live text quotes a secret, plus user data in every data folder.
  const root = target(t, { ...GENERATED, ...USER });
  // WHEN: the shipped U6 leftover-placeholder block runs.
  const got = run(root);
  // THEN: no user quote counts as a leftover, so the unattended upgrade is not failed by its own gate.
  assert.deepEqual(got, { rc: 0, out: ['OK  no leftover placeholders'], err: '' },
    'a card or control quoting ${{ secrets.X }} must never read as an unresolved generator token');
});

test('GIVEN unresolved tokens of both families in generated files WHEN the U6 leftover gate runs THEN it names exactly those lines', t => {
  // GIVEN: the same user data, plus four generated files carrying a real leftover each.
  const root = target(t, { ...GENERATED, ...USER,
    '.claude/agents/task-tracker.md': '# task-tracker\n{{CMD_DECOMPOSED_NOTE}}\n',
    '.claude/rules/tasks.md': '# tasks\n\nFirst kebab segment = a repo domain { {{DOMAINS}} }\n',
    '.claude/features/TASK_TEMPLATE.md': '---\nversion: "{PLUGIN_VERSION}"\n---\n',
    '.claude/features/specs/SPEC_TEMPLATE.md': '# SPEC\n\n{{SPEC_RULES}}\n',
  });
  // WHEN: the shipped U6 leftover-placeholder block runs.
  const got = run(root);
  // THEN: every generated hit is named by path:line, no user file appears.
  assert.deepEqual(got, { rc: 0, out: [
    'MISS leftover placeholders:',
    '.claude/agents/task-tracker.md:2:{{CMD_DECOMPOSED_NOTE}}',
    '.claude/rules/tasks.md:3:First kebab segment = a repo domain { {{DOMAINS}} }',
    '.claude/features/TASK_TEMPLATE.md:2:version: "{PLUGIN_VERSION}"',
    '.claude/features/specs/SPEC_TEMPLATE.md:3:{{SPEC_RULES}}',
  ], err: '' }, 'a leftover in any generated file, unstamped templates included, must stay a MISS');
});

test('GIVEN the install P5 and upgrade U6 references WHEN their leftover gate blocks are read THEN they are byte-identical', () => {
  // GIVEN/WHEN: both shipped blocks, extracted from their references.
  // THEN: one gate, two carriers: a fix to either must land in both.
  assert.equal(INSTALL_BLOCK, UPGRADE_BLOCK, '12-verify-report.md P5 and 10-upgrade.md U6 leftover gates must never drift apart');
});

test('GIVEN a fresh SPEC_MODE=off install whose sweep migrated a doc quoting ${{ secrets.X }} WHEN the P5 leftover gate runs THEN it prints OK', t => {
  // GIVEN: the 12 baseline files (no task-spec, no spec templates), a swept board row and a migrated todo card.
  const baseline = Object.fromEntries(Object.entries(GENERATED).filter(([f]) => !/task-spec|specs\//.test(f)));
  const root = target(t, { ...baseline,
    '.claude/features/todo/T-ci-3.md': `---\nid: T-ci-3\nstatus: todo\n---\n\n## Context\n\nMigrated from docs/deploy.md: \`KEY: ${SECRET}\`\n`,
  });
  // WHEN: the shipped P5 leftover-placeholder block from 12-verify-report.md runs.
  const got = run(root, fill(INSTALL_BLOCK));
  // THEN: the migrated user doc is not scanned and absent spec files are skipped, so the install passes.
  assert.deepEqual(got, { rc: 0, out: ['OK  no leftover placeholders'], err: '' },
    'a migrated doc quoting ${{ secrets.X }} must never fail a fresh install');
});

test('GIVEN a TARGET holding no generated file WHEN the U6 leftover gate runs THEN it fails loudly instead of printing OK', t => {
  // GIVEN: user data only, nothing the generator emits.
  const root = target(t, USER);
  // WHEN: the shipped U6 leftover-placeholder block runs.
  const got = run(root);
  // THEN: an empty scan is a gate that did not run, never a pass.
  assert.deepEqual(got, { rc: 1, out: ['MISS no generated file found -- gate did NOT run'], err: '' },
    'scanning zero generated files must never print OK');
});
