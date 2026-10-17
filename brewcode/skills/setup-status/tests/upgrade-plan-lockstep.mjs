#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DELEGATES, ORDER, SCOPED, STAGES } from '../scripts/upgrade-plan.mjs';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(join(STATUS_DIR, rel), 'utf8');
const SKILL = read('SKILL.md');
const numeric = (a, b) => a - b;
const roster = SKILL.split('\n').filter(line => /^\| \d+ \| `\/brew/.test(line)).map(line => line.split('|').map(cell => cell.trim()));
const rosterIds = roster.map(cells => Number(cells[1]));
const stageTable = read('references/run-list.md').split('\n').map(line => /^\| (\d+) \*\*[^*]+\*\* \| ([^|]+) \|/.exec(line)).filter(Boolean)
  .map(match => ({ stage: Number(match[1]), rows: [...match[2].matchAll(/(\d+) [a-z][a-z-]*/g)].map(row => Number(row[1])) }));
const phase0b = (SKILL.split('### Phase 0b')[1] ?? '').split(/\n## /)[0];
const delegating = (/rows (\d+(?:, \d+)*(?:,? and \d+)?)/.exec(phase0b)?.[1] ?? '').match(/\d+/g)?.map(Number) ?? [];

test('GIVEN the run-list stage table WHEN reading stages 1-7 THEN upgrade-plan STAGES and ORDER hold the same rows in the same order', () => {
  assert.deepEqual({ stages: stageTable.map(row => row.stage), rows: stageTable.map(row => row.rows), order: stageTable.flatMap(row => row.rows) },
    { stages: [1, 2, 3, 4, 5, 6, 7], rows: STAGES, order: ORDER },
    'references/run-list.md stage table == STAGES (stage n = STAGES[n - 1]) and ORDER = their concatenation');
});

test('GIVEN the SKILL.md roster WHEN comparing row ids THEN ORDER holds each roster row exactly once', () => {
  assert.deepEqual([...ORDER].sort(numeric), [...rosterIds].sort(numeric),
    'a roster row missing from ORDER exits rc 1 in upgrade-plan and drops the whole offer');
});

test('GIVEN Phase 0b WHEN reading the rows sent to manual at spawn depth 1 THEN DELEGATES lists exactly them', () => {
  assert.deepEqual([...DELEGATES].sort(numeric), [...delegating].sort(numeric),
    'SKILL.md Phase 0b "sends rows ... (owners that delegate)" == DELEGATES');
});

test('GIVEN the roster anchors WHEN reading which rows install per scope THEN SCOPED lists exactly those naming GLOBAL', () => {
  assert.deepEqual(SCOPED, roster.filter(cells => cells[4].includes('GLOBAL/')).map(cells => Number(cells[1])),
    'rows with a global twin of the anchor take a scope token (project|global) in Phase 3b');
});
