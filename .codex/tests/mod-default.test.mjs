#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModDefault } from '../scripts/mod-default.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const CRON_PLAN = join(ROOT, 'brewtools', '.codex', 'skills', 'manager-setup', 'references', 'cron-plan.md');
const DIST_CRON_PLAN = join(ROOT, '.codex', 'plugins', 'brewtools', 'skills', 'manager-setup', 'references', 'cron-plan.md');

const tests = [
  ['GIVEN the plus mod default WHEN read THEN it equals the generated cron-plan.md bytes', () => {
    assert.equal(`${readModDefault('+')}\n`, readFileSync(CRON_PLAN, 'utf8'), 'generated brewtools cron-plan.md');
    assert.equal(`${readModDefault('+')}\n`, readFileSync(DIST_CRON_PLAN, 'utf8'), 'distribution cron-plan.md');
  }],
  ['GIVEN a mod default WHEN read THEN front matter is stripped and the body starts at the addon heading', () => {
    assert.equal(readModDefault('+').split('\n')[0], '# [ADDON: ANTI-DRIFT CRON PLAN]', 'first body line');
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
