#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const VALIDATOR = join(ROOT, '.codex', 'scripts', 'validate-compat.mjs');
const SKILL = join(ROOT, 'brewcode', '.codex', 'skills', 'teams-setup', 'SKILL.md');
const MODES = ['status', 'install', 'upgrade', 'enable', 'disable', 'uninstall', 'purge'];
const SHARED_GATES = [
  'PLAN — brewcode:teams-setup',
  'Every mutating mode requires `request_user_input` approval',
  'The user must approve the final roster',
  'so the create-only emitter atomically creates the absent guard before the full `verify-team.sh` bootstrap check',
  '### C5-C7: independent review',
];
const base = mkdtempSync(join(tmpdir(), 'codex-teams-contract-'));

function validate(file) {
  return spawnSync(process.execPath, [VALIDATOR, '--check-native-teams', file], {
    encoding: 'utf8',
    timeout: 30000,
  });
}

try {
  // GIVEN: the freshly generated native teams projection.
  const source = readFileSync(SKILL, 'utf8');

  // WHEN: the complete projection is checked.
  const positive = validate(SKILL);

  // THEN: the complete seven-mode contract passes.
  assert.equal(positive.status, 0, 'complete native teams projection must pass its control-flow contract');
  for (const mode of MODES) {
    assert.equal(source.includes(`## Mode: ${mode}`), true, `native teams projection must contain the ${mode} mode section`);
  }

  // WHEN: each mode section is removed independently.
  for (const mode of MODES) {
    const mutant = join(base, `${mode}.md`);
    writeFileSync(mutant, source.replace(`## Mode: ${mode}`, `## Removed mode: ${mode}`));
    const result = validate(mutant);

    // THEN: the checker fails closed and attributes the missing mode.
    assert.equal(result.status, 1, `projection without ${mode} must fail`);
    assert.equal(result.stderr.includes(`mode ${mode} missing`), true, `failure must identify omitted ${mode} control flow`);
  }

  // WHEN: each shared approval/review gate is removed independently.
  for (const [index, gate] of SHARED_GATES.entries()) {
    const mutant = join(base, `shared-${index}.md`);
    writeFileSync(mutant, source.replace(gate, `REMOVED-${index}`));
    const result = validate(mutant);

    // THEN: the checker rejects the incomplete projection.
    assert.equal(result.status, 1, `projection without shared gate ${index} must fail`);
    assert.equal(result.stderr.includes('missing'), true, `shared gate ${index} failure must name a missing contract`);
  }
} finally {
  rmSync(base, { recursive: true, force: true });
}

process.stdout.write('generate-compat native teams tests passed\n');
