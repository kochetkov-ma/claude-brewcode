#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const source = ['SKILL.md', 'references/phase1-probes.md', 'references/phase2-stamps.md', 'references/task-tools-offer.md', 'references/run-list.md']
  .map(f => readFileSync(join(STATUS_DIR, f), 'utf8')).join('\n');
const notes = readFileSync(join(STATUS_DIR, 'references/row-notes.md'), 'utf8');
const ROOTS = { $BC: 'brewcode', $BT: 'brewtools', $BD: 'brewdoc' };
const rosterIds = source.split('\n').filter(line => /^\| \d+ \| `\/brew/.test(line)).map(line => line.split('|')[1].trim());
const section = notes.split('\n## ').find(part => part.startsWith('Disabled rows with drifted assets')) || '';
const rows = Object.fromEntries(section.split('\n').filter(line => /^\| \d+ /.test(line)).map(line => {
  const cells = line.split(/(?<!\\)\|/).map(cell => cell.trim());
  return [cells[1].split(' ')[0], { upgrade: cells[2], command: cells[3], evidence: cells[4] }];
}));

const EXPECTED = {
  1: 'refused', 2: 'keeps', 3: 'refused', 4: 'refused', 6: 'keeps', 7: 'keeps',
  8: 'keeps', 9: 'refused', 10: 'keeps', 11: 'keeps', 12: 'keeps',
};

test('GIVEN the row notes WHEN reading the disabled-drift table THEN all 11 roster rows say whether upgrade keeps the off-switch', () => {
  const actual = Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, row.upgrade]));
  assert.deepEqual({ ids: Object.keys(rows), upgrade: actual }, { ids: rosterIds, upgrade: EXPECTED },
    'one shared rule for every setup: a disabled row with drifted assets needs its owner\'s upgrade-while-disabled answer (sweep-finagra loud row 2)');
});

test('GIVEN the disabled-drift table WHEN reading each Command THEN keeps rows prescribe upgrade alone and refused rows wrap it in enable/disable', () => {
  const shape = Object.fromEntries(Object.entries(rows).map(([id, row]) => {
    const verbs = [...row.command.matchAll(/`\/brew[a-z]+:[a-z-]+ (enable|upgrade|disable)\b/g)].map(m => m[1]);
    return [id, verbs.join('>')];
  }));
  const want = Object.fromEntries(Object.entries(EXPECTED).map(([id, v]) => [id, v === 'keeps' ? 'upgrade' : 'enable>upgrade>disable']));
  assert.deepEqual(shape, want, 'a drifted disabled row must end disabled: upgrade where it keeps the switch, else enable -> upgrade -> disable');
});

test('GIVEN each row\'s cited owner evidence WHEN reading the owner file THEN the cited text is present verbatim', () => {
  const found = Object.fromEntries(Object.entries(rows).map(([id, row]) => {
    const m = row.evidence.match(/^`(\$B[CTD])\/([^`]+)`: "(.+)"$/);
    return [id, !!m && readFileSync(join(ROOT, ROOTS[m[1]], m[2]), 'utf8').includes(m[3])];
  }));
  assert.deepEqual(found, Object.fromEntries(Object.keys(EXPECTED).map(id => [id, true])),
    'the keeps/refused answer must be backed by the owner skill\'s current bytes');
});

test('GIVEN SKILL.md WHEN reading the disabled prescription THEN no rule offers bare enable for a drifted row and Phase 4 routes through the shared rule', () => {
  const actual = {
    staleEnable: source.includes('still offer `enable`'),
    sharedRule: source.includes('### Disabled rows — the shared Command rule'),
    commandCell: /`disabled` -> the Phase 3 disabled-row rule/.test(source),
    runList: source.includes('A `disabled` row with drift is listed in its stage'),
  };
  assert.deepEqual(actual, { staleEnable: false, sharedRule: true, commandCell: true, runList: true },
    'disabled + drifted assets -> upgrade (keeps disabled), enable only optional (6.5.3 defect b)');
});
