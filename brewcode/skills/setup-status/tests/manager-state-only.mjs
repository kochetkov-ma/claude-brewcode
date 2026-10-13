#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const skill = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const probes = readFileSync(join(STATUS_DIR, 'references/phase1-probes.md'), 'utf8');
const notes = readFileSync(join(STATUS_DIR, 'references/row-notes.md'), 'utf8');
const owner = readFileSync(join(ROOT, 'brewtools/skills/manager-setup/SKILL.md'), 'utf8');
const phase3 = skill.slice(skill.indexOf('## Phase 3'));
const rule = id => phase3.split('\n').find(line => line.startsWith(`| ${id} | `)) || '';
const row8 = notes.slice(notes.indexOf('## Row 8 manager'), notes.indexOf('## Row 9'));

test('GIVEN manager-setup WHEN reading its upgrade, enable and uninstall THEN a state.json-only project is a wall never installed', () => {
  const actual = {
    upgradeAbort: owner.includes("if (!arr.some(has) && !fs.existsSync(guard)) { console.error('ABORT: the wall is not installed in this project — run install instead'); process.exit(1); }"),
    enableRoutes: owner.includes('In a project with no wall installed it prints `notInstalled:true`'),
    uninstallKeepsState: owner.includes('Kept: `state.json`, the prompt-text overrides'),
  };
  assert.deepEqual(actual, { upgradeAbort: true, enableRoutes: true, uninstallKeepsState: true },
    'the owner refuses upgrade/enable without guard and registration, and uninstall leaves state.json behind');
});

test('GIVEN state.json present, no guard and no REG line WHEN classifying row 8 THEN it is missing with install, never disabled with upgrade', () => {
  const actual = {
    rule2NeedsWall: rule(2).includes('`.hard != true` beside the copied guard or a row-8 `REG` line'),
    rule3Missing: rule(3).includes('row 8 also with `state.json` present but guard and helper MISS and no row-8 `REG` line')
      && rule(3).includes('row 8 *Found* `state.json only, wall not installed`, Command `install`'),
    rosterCell: skill.includes('`state.json` alone is no wall: Phase 3 rule 3'),
    probeTable: probes.includes('`state.json` alone is Phase 3 rule 3 `missing`'),
    rowNote: notes.includes('`state.json` with no guard, no helper and no `REG` line = `missing`, never `disabled`'),
  };
  assert.deepEqual(actual, { rule2NeedsWall: true, rule3Missing: true, rosterCell: true, probeTable: true, rowNote: true },
    'brewai-hub 6.5.6 sweep: "disabled, files behind" prescribed manager-setup upgrade, which aborts "wall not installed"');
});

test('GIVEN the row 8 note WHEN reading its cited owner evidence THEN the quoted text is in manager-setup verbatim', () => {
  const quote = row8.match(/`\$BT\/skills\/manager-setup\/SKILL\.md`: "([^"]+)"/)[1];
  assert.deepEqual({ quote, present: owner.includes(quote) },
    { quote: 'A project with no wall installed aborts and is told to run `install`', present: true },
    'the install-not-upgrade remedy must be backed by the owner skill bytes');
});
