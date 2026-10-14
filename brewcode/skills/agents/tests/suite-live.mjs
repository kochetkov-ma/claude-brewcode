// Live check: the shipped references against the types file named by MODS_TYPES (run.sh gates it). Run: node --test <this file>.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const AGENTS = join(dirname(fileURLToPath(import.meta.url)), '..');

test('GIVEN the shipped references and the live types WHEN checked THEN rc 0 and a CLEAN verdict', () => {
  const r = spawnSync(
    process.execPath,
    [join(AGENTS, 'scripts', 'mods-ref-check.mjs'), process.env.MODS_TYPES, join(AGENTS, 'references')],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, `rc (stdout: ${r.stdout})`);
  assert.match(r.stdout.split('\n')[0], /^mods-ref-check: CLEAN (\d+)\/\1 \(verified_on [0-9.]+\)$/, 'verdict line');
});
