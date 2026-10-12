#!/usr/bin/env node
// Policy text pins: another setup's marker block (e.g. semble's in CLAUDE.md) is never compressed away.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(here, '../SKILL.md'), 'utf8').split('\n');
const agent = readFileSync(join(here, '../../../agents/text-optimizer.md'), 'utf8').split('\n');

// GIVEN the skill Iron Rules WHEN a marker block is in a target THEN the rule keeps it whole and names its owner.
assert.deepEqual(skill.filter(l => l.startsWith('| Owned blocks |')), [
  "| Owned blocks | A block delimited by another tool's begin/end markers (e.g. `<!-- BEGIN brewcode:semble -->` .. `<!-- END brewcode:semble -->`) is owned by that setup, whose upgrade re-creates it: never compress, move, dedup or delete it, both marker lines included; report it as `managed by <setup>` |",
], 'THEN Iron Rules carry the marker-block preservation row verbatim');

// GIVEN the writer agent WHEN it optimizes a file directly THEN its own preserve list carries the same rule.
const at = agent.findIndex(l => l.startsWith("A block between another tool's begin/end markers"));
assert.deepEqual(agent.slice(at, at + 2), [
  "A block between another tool's begin/end markers (e.g. `<!-- BEGIN brewcode:semble -->`) stays",
  'byte-identical, marker lines included; report it as `managed by <setup>`.',
], 'THEN text-optimizer.md states the marker-block rule verbatim');
console.log('suite-policy: PASS');
