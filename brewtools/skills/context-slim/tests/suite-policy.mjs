#!/usr/bin/env node
// Policy text pins: another setup's marker block in CLAUDE.md is preserved, never slimmed away.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ref = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../references/dedup-arbitration.md'), 'utf8');
const lines = ref.split('\n');

// GIVEN the dedup policy WHEN a marker block is found THEN the rule keeps it whole and reports its owner.
const at = lines.findIndex(l => l.startsWith("A block delimited by another tool's begin/end markers"));
assert.deepEqual(lines.slice(at, at + 4), [
  "A block delimited by another tool's begin/end markers (e.g. `<!-- BEGIN brewcode:semble -->` ..",
  '`<!-- END brewcode:semble -->`) is owned by that setup: never compress, move or delete it, both marker',
  'lines included - its upgrade re-creates a removed block. Dedup against it from the other copy; report it',
  'as `managed by <setup>` (here `brewcode:semble-setup`).',
], 'THEN section 1 states the marker-block preservation rule verbatim');

// GIVEN the worked patterns WHEN scanning for the retired delete instruction THEN none remains.
assert.deepEqual([...ref.matchAll(/delete the rest of the block|Delete\s+the block/g)].map(m => m[0]), [],
  'THEN no row tells the slimmer to delete a generator marker block');
assert.deepEqual([...ref.matchAll(/`managed by brewcode:semble-setup`/g)].length, 1,
  'THEN worked pattern 2 keeps the semble block and names its owner');
console.log('suite-policy: PASS');
