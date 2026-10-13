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
const source = ['SKILL.md', 'references/phase2-stamps.md'].map(f => readFileSync(join(STATUS_DIR, f), 'utf8')).join('\n');
const stamps = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes("<<'STAMPS'"));
const upgrade = readFileSync(join(TOOLS, 'skills/task-board-setup/references/10-upgrade.md'), 'utf8');
const fenceAfter = heading => upgrade.slice(upgrade.indexOf(heading)).match(/```bash\n([\s\S]*?)\n```/)[1];
const restampBlock = fenceAfter('## U5b. RESTAMP');
const gateBlock = fenceAfter('**Stamp gate**');
const producer = readFileSync(join(TOOLS, 'skills/task-board-setup/SKILL.md'), 'utf8');
const CV = producer.match(/brewcode-meta:.*?content_version=([^\s>]+)/)[1];
const PV = JSON.parse(readFileSync(join(TOOLS, '.claude-plugin/plugin.json'), 'utf8')).version;
const MARK = `<!-- brewcode-meta: version=${PV} content_version=${CV} generated_by=brewtools:task-board-setup -->`;
const FM = `---\ndoc_type: llm\nversion: "${PV}"\ncontent_version: "${CV}"\ngenerated_by: "brewtools:task-board-setup"\nlast_updated: "2026-10-01"\n---\n`;
// yasna-bot shape: four hand-written control files with no frontmatter, eight generator-stamped ones.
const BARE = {
  '.claude/features/board.md': '# Yasna Task Board\n\n> Canonical task list.\n\n## Progress (WIP)\n\n| id | task |\n|----|------|\n| T-1 | ship |\n',
  '.claude/features/TRACKER.md': '# TRACKER -- procedure\n\n> Read before touching any task.\n',
  '.claude/features/INDEX.md': '# Docs Index\n\n> Task board: [board.md](board.md).\n',
  '.claude/features/backlog/README.md': 'backlog/ -- ungroomed inbox, no heading on line 1\n',
};
const STAMPED = ['.claude/features/PROGRESS.md', '.claude/features/METHODOLOGY.md', '.claude/features/ANTI-DRIFT.md',
  '.claude/features/task-graph.md', '.claude/agents/task-tracker.md', '.claude/rules/tasks.md',
  '.claude/skills/task-board/SKILL.md', '.claude/skills/task-spec/SKILL.md'];

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'task-board-restamp-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = { ...BARE, ...Object.fromEntries(STAMPED.map(f => [f, `${FM}\n# ${f}\n`])) };
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  }
  return root;
}

function bash(root, command) {
  const r = spawnSync('bash', ['-c', command], { cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, HOME: root, CLAUDE_PROJECT_DIR: root, TASK_SPEC_MODE: 'on' } });
  assert.equal(r.status, 0, `shipped block must succeed: ${r.stderr}`);
  return r.stdout;
}

const PENDING_SLOT = '<label of every PATCH / ABSENT line the U1 PROBE BLOCK prints when re-run right now, space-separated; empty when none>';
const fill = (block, pending = '') => block.replace('<absolute path resolved in P0>', '$CLAUDE_PROJECT_DIR').replace(PENDING_SLOT, pending)
  .replace('<PLUGIN_VERSION from the SKILL.md block>', PV).replace('<CONTENT_VERSION from the same block>', CV)
  .replace('<LAST_UPDATED from the same block>', '2026-10-13');
const readStamps = root => bash(root, stamps.replace('PLUGIN_ROOT=/abs/root/printed/by/phase0', `PLUGIN_ROOT="${TOOLS}"`)
  .replace('PLUGIN=brewcode ', 'PLUGIN=brewtools ').replaceAll('${CLAUDE_SKILL_DIR}', STATUS_DIR))
  .split('\n').filter(line => /^(CURRENT|LEGACY-NONE|OWNER-\w+|BEHIND)\s+\.claude\/features\/(board|TRACKER|INDEX|backlog\/README)\.md/.test(line))
  .map(line => line.replace(/\s+\(.*$/, '').replace(/\s+/, ' '));

test('GIVEN frontmatter-less control files WHEN upgrade restamps THEN setup-status reads them current, bodies intact', t => {
  // GIVEN: the yasna-bot board, four control files without frontmatter.
  const root = fixture(t);
  // WHEN: setup-status reads stamps, U5b restamps twice, the U6 gate runs, setup-status reads again.
  const before = readStamps(root);
  const first = bash(root, fill(restampBlock));
  const afterFirst = Object.fromEntries(Object.keys(BARE).map(f => [f, readFileSync(join(root, f), 'utf8')]));
  const second = bash(root, fill(restampBlock));
  const afterSecond = Object.fromEntries(Object.keys(BARE).map(f => [f, readFileSync(join(root, f), 'utf8')]));
  const gate = bash(root, fill(gateBlock)).trim().split('\n').pop();
  const after = readStamps(root);
  // THEN: unstamped before; one marker line after the heading (or on line 1), idempotent, gate clean, all current.
  const marked = Object.fromEntries(Object.entries(BARE).map(([f, body]) => [f, body.startsWith('# ')
    ? body.replace(/\n/, `\n${MARK}\n`) : `${MARK}\n${body}`]));
  assert.deepEqual(
    { before, restamp: first.trim().split('\n').slice(-2), afterFirst, afterSecond, gate, after },
    {
      before: Object.keys(BARE).flatMap(f => [`OWNER-NONE ${f}`, `LEGACY-NONE ${f}`]),
      restamp: ['restamped=12 absent-or-skipped=0 miss=0', '✅ restamp clean'],
      afterFirst: marked,
      afterSecond: marked,
      gate: `OK  every control artifact stamped ${PV} / ${CV}`,
      after: Object.keys(BARE).map(f => `CURRENT ${f}`),
    },
    'an FM-less control file must gain exactly one marker line, read as CURRENT, and stay byte-stable on rerun',
  );
});

test('GIVEN an FM-less control file never restamped WHEN the U6 gate and setup-status read it THEN both still flag it', t => {
  // GIVEN: the yasna-bot board before any 6.5.6 upgrade.
  const root = fixture(t);
  // WHEN: the U6 gate and setup-status run without U5b.
  const gate = bash(root, fill(gateBlock)).trim().split('\n');
  // THEN: every unstamped file is a MISS for the gate and LEGACY-NONE for setup-status.
  assert.deepEqual(
    { misses: gate.filter(line => line.startsWith('MISS stale marker:')).length, last: gate.pop(), stamps: readStamps(root) },
    { misses: 4, last: '❌ 4 artifact(s) still stale -- re-run U5b', stamps: Object.keys(BARE).flatMap(f => [`OWNER-NONE ${f}`, `LEGACY-NONE ${f}`]) },
    'an unstamped control file must never read current',
  );
});

test('GIVEN declined content rows WHEN headless upgrade reaches U5b and the U6 gate THEN nothing is restamped and both print PARTIAL', t => {
  // GIVEN: the yasna-bot board with rows 2m and 7 left PATCH (declined or unasked).
  const root = fixture(t);
  const files = [...Object.keys(BARE), ...STAMPED];
  const before = Object.fromEntries(files.map(f => [f, readFileSync(join(root, f), 'utf8')]));
  // WHEN: U5b and the stamp gate run with that pending list.
  const restamp = bash(root, fill(restampBlock, '2m 7')).trim().split('\n');
  const gate = bash(root, fill(gateBlock, '2m 7')).trim().split('\n');
  const after = Object.fromEntries(files.map(f => [f, readFileSync(join(root, f), 'utf8')]));
  // THEN: no byte moved, both blocks name the pending rows, setup-status still reads the anchor stale.
  assert.deepEqual(
    { restamp, gate, after, stamps: readStamps(root) },
    {
      restamp: ['PARTIAL content rows still pending: 2m 7', 'restamp withheld -- stamps stay at the previous version until every pending row lands'],
      gate: ['PARTIAL restamp withheld by U5b, stamps intentionally behind -- pending: 2m 7'],
      after: before,
      stamps: Object.keys(BARE).flatMap(f => [`OWNER-NONE ${f}`, `LEGACY-NONE ${f}`]),
    },
    'a pending content row must withhold every stamp so setup-status never reads a partial upgrade as current',
  );
});
