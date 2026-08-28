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
const LIFECYCLE = join(ROOT, 'brewcode', '.codex', 'skills', 'teams-setup', 'tests', 'suite-lifecycle.mjs');
const PARKED_CONFLICT = join(
  ROOT, 'brewcode', '.codex', 'skills', 'teams-setup', 'tests', 'suite-parked-conflict.mjs',
);
const MODES = ['status', 'install', 'upgrade', 'enable', 'disable', 'uninstall', 'purge'];
const SHARED_GATES = [
  'PLAN — brewcode:teams-setup',
  'Every mutating mode requires `request_user_input` approval',
  'An absent `trace.jsonl` is valid before the first event or after cleanup',
  'Before any team mutation, run the read-only, offline preflight `python3 -I -S scripts/prepare-tokenizer.py check`',
  'Only after that approval, run `python3 -I -S scripts/prepare-tokenizer.py prepare && python3 -I -S scripts/prepare-tokenizer.py check`',
  '`verify-team.sh` and token counts use isolated `prepare-tokenizer.py run count-tokens.py` without network, installation, fallback, host Python injection, or an unverified runtime',
  'The user must approve the final roster',
  'so the create-only emitter atomically creates the absent guard before the full `verify-team.sh` bootstrap check',
  'resolve `REPORT_ROOT` from the narrowest applicable durable project guidance',
  'Every slash-separated segment must match `^[A-Za-z0-9._-]+$`',
  'Equal-specificity conflicting report-root directives -> STOP',
  'Enforce every live or parked domain member description as one nonempty line of at most 100 characters',
  'legacy-absent gets no guard mention',
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
  const lifecycle = readFileSync(LIFECYCLE, 'utf8');

  // WHEN: the complete projection is checked.
  const positive = validate(SKILL);

  // THEN: the complete seven-mode contract passes.
  assert.equal(positive.status, 0, 'complete native teams projection must pass its control-flow contract');
  assert.equal(
    lifecycle.includes("'references', 'framework-files.md'")
      && !lifecycle.includes("'references', 'framework-files.toml'"),
    true,
    'projected lifecycle must retain the Markdown framework authority path',
  );
  const lifecycleResult = spawnSync(process.execPath, [LIFECYCLE], { encoding: 'utf8', timeout: 30000 });
  assert.equal(lifecycleResult.status, 0,
    `projected lifecycle must remain executable: ${lifecycleResult.stdout}${lifecycleResult.stderr}`);
  const parkedResult = spawnSync(process.execPath, [PARKED_CONFLICT], { encoding: 'utf8', timeout: 30000 });
  assert.equal(parkedResult.status, 0,
    `projected parked-conflict suite must remain executable: ${parkedResult.stdout}${parkedResult.stderr}`);
  for (const mode of MODES) {
    assert.equal(source.includes(`## Mode: ${mode}`), true, `native teams projection must contain the ${mode} mode section`);
  }
  const tokenizerCheckAt = source.indexOf('python3 -I -S scripts/prepare-tokenizer.py check');
  const tokenizerPrepareAt = source.indexOf('python3 -I -S scripts/prepare-tokenizer.py prepare');
  assert.equal(
    tokenizerCheckAt >= 0 && tokenizerCheckAt < tokenizerPrepareAt,
    true,
    'read-only tokenizer check must precede the explicitly approved prepare path',
  );

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
