#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RULES_SH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'rules.sh');
const META = 'doc_type: llm\nversion: "6.5.6"\ngenerated_by: "brewcode:rules"\nlast_updated: "2026-10-13"\n';
const TABLE = '\n# Rules\n\n| # | Avoid | Instead | Why |\n|---|-------|---------|-----|\n| 1 | a | b | c |\n';

function project(t, files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rules-validate-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(root, '.codex', 'rules'), { recursive: true });
    writeFileSync(join(root, '.codex', 'rules', name), body);
  }
  const r = spawnSync('bash', [RULES_SH, 'validate'], { cwd: root, encoding: 'utf8' });
  return { code: r.status, lines: `${r.stdout}${r.stderr}`.trim().split('\n') };
}

test('GIVEN main rule files deliberately path-scoped (allure-server, brewai-hub shapes) WHEN validate runs THEN rc 0 with a warning per file', t => {
  const actual = project(t, {
    'avoid.md': `---\n${META}paths:\n  - "**/*.java"\n  - "**/*.gradle"\n---\n${TABLE}`,
    'best-practice.md': `---\npaths:\n  - "**/*"\n${META}---\n${TABLE}`,
  });
  assert.deepEqual(actual, { code: 0, lines: [
    '=== Validate Rules Structure ===',
    '! avoid.md is main but path-scoped: loads only when Codex touches a matching file (remove paths: to load it at session start)',
    'V avoid.md valid (frontmatter + metadata + table)',
    '! best-practice.md is main but path-scoped: loads only when Codex touches a matching file (remove paths: to load it at session start)',
    'V best-practice.md valid (frontmatter + metadata + table)',
  ] }, 'Codex honours paths: on any .codex/rules/*.md; a scoped main file is a choice, not an error');
});

test('GIVEN unscoped main files and broken specialized files WHEN validate runs THEN the specialized gates still fail rc 1', t => {
  const actual = project(t, {
    'avoid.md': `---\n${META}---\n${TABLE}`,
    'best-practice.md': `---\n${META}---\n${TABLE}`,
    'test-avoid.md': `---\n${META}---\n${TABLE}`,
    'sql-best-practice.md': `---\n${META}paths: ["**/*"]\n---\n${TABLE}`,
  });
  assert.deepEqual(actual, { code: 1, lines: [
    '=== Validate Rules Structure ===',
    'V avoid.md valid (frontmatter + metadata + table)',
    'V best-practice.md valid (frontmatter + metadata + table)',
    'X test-avoid.md is specialized but missing paths',
    'X sql-best-practice.md is specialized but claims repo-wide paths -> it loads into every request',
  ] }, 'relaxing main files must not relax the specialized-file contract');
});
