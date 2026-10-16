#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModDefault } from '../scripts/mod-default.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const CRON_PLAN = join(ROOT, 'brewtools', '.codex', 'skills', 'manager-setup', 'references', 'cron-plan.md');
const DIST_CRON_PLAN = join(ROOT, '.codex', 'plugins', 'brewtools', 'skills', 'manager-setup', 'references', 'cron-plan.md');
const CRON = join(ROOT, 'brewtools', '.codex', 'skills', 'manager-setup', 'references', 'cron.md');
const DIST_CRON = join(ROOT, '.codex', 'plugins', 'brewtools', 'skills', 'manager-setup', 'references', 'cron.md');

const tests = [
  ['GIVEN the plus mod default and its plan part WHEN joined THEN they equal the generated cron-plan.md bytes', () => {
    const joined = `${readModDefault('+')}\n\n${readModDefault('+.plan')}\n`;
    assert.equal(joined, readFileSync(CRON_PLAN, 'utf8'), 'generated brewtools cron-plan.md');
    assert.equal(joined, readFileSync(DIST_CRON_PLAN, 'utf8'), 'distribution cron-plan.md');
  }],
  ['GIVEN the plus mod default WHEN read THEN it equals the generated cron.md bytes sent outside Plan mode', () => {
    const plus = `${readModDefault('+')}\n`;
    assert.equal(plus, readFileSync(CRON, 'utf8'), 'generated brewtools cron.md');
    assert.equal(plus, readFileSync(DIST_CRON, 'utf8'), 'distribution cron.md');
  }],
  ['GIVEN a mod default WHEN read THEN front matter is stripped and the body starts at the addon heading', () => {
    assert.deepEqual([readModDefault('+').split('\n')[0], readModDefault('+.plan').split('\n')[0]], ['# [ADDON: ANTI-DRIFT CRON]', '# [ADDON: ANTI-DRIFT CRON PLAN]'], 'first body lines');
  }],
  ['GIVEN an unknown default name WHEN read THEN it throws naming the missing file', () => {
    assert.throws(
      () => readModDefault('no-such-default'),
      { message: `brewmod-placeholders default not found: ${join(ROOT, 'brewmod-placeholders', 'placeholders', 'no-such-default.md')}` },
      'missing default error',
    );
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok - ${name}`); } catch (error) { failed += 1; console.error(`not ok - ${name}\n${error.message}`); }
}
process.exit(failed ? 1 : 0);
