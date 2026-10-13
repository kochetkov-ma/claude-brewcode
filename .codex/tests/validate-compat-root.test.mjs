#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VALIDATOR_INPUTS = ['.agents', '.codex', 'brewcode', 'brewdoc', 'brewtools'];
const SKIPPED = new Set(['node_modules', '__pycache__', '.DS_Store']);
const STALE_ARTIFACT = '- task-board-setup Codex variant contains a stale foreign-assistant artifact';

function checkoutUnderClaudeParent() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'validate-compat-root-')));
  const root = path.join(base, '.claude', 'worktrees', 'agent-fixture');
  for (const entry of VALIDATOR_INPUTS) {
    fs.cpSync(path.join(ROOT, entry), path.join(root, entry), { recursive: true, verbatimSymlinks: true, filter: source => !SKIPPED.has(path.basename(source)) });
  }
  return { base, root };
}

function validate(root) {
  return spawnSync('node', [path.join(root, '.codex', 'scripts', 'validate-compat.mjs')], { cwd: root, encoding: 'utf8' });
}

const tests = [];
const test = (name, body) => tests.push([name, body]);

test('GIVEN a checkout under a .claude/ parent WHEN validate-compat runs THEN it passes', () => {
  const fixture = checkoutUnderClaudeParent();
  const result = validate(fixture.root);
  assert.equal(result.status, 0, `validator must not flag the parent path:\n${result.stderr}`);
  assert.match(result.stdout, /^Codex compatibility validation passed: 3 plugins, /, 'pass banner');
  fs.rmSync(fixture.base, { recursive: true, force: true });
});

test('GIVEN a .claude/ dir inside the task-board-setup Codex variant WHEN validate-compat runs THEN it fails on that artifact only', () => {
  const fixture = checkoutUnderClaudeParent();
  for (const variant of [['brewtools', '.codex', 'skills'], ['.codex', 'plugins', 'brewtools', 'skills']]) {
    const artifact = path.join(fixture.root, ...variant, 'task-board-setup', '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, '{}\n');
  }
  const result = validate(fixture.root);
  assert.equal(result.status, 1, `in-repo artifact must fail:\n${result.stdout}`);
  assert.deepEqual(result.stderr.trim().split('\n'), [STALE_ARTIFACT, STALE_ARTIFACT], 'exactly the stale-artifact error, once per variant');
  fs.rmSync(fixture.base, { recursive: true, force: true });
});

for (const [name, body] of tests) {
  body();
  process.stdout.write(`ok - ${name}\n`);
}
process.stdout.write(`validate-compat-root: ${tests.length} tests passed.\n`);
