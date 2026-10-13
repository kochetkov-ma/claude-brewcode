#!/usr/bin/env node
// keep-catalog locale fixture: private mktemp dir under TMPDIR removed on exit, never a fixed /tmp path.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REF = readFileSync(process.env.KEEP_CATALOG || join(dirname(fileURLToPath(import.meta.url)), '../references/keep-catalog.md'), 'utf8');
const start = REF.indexOf('### Locale hazard');
const fence = (/```bash\n([\s\S]*?)```/.exec(REF.slice(start)) || [null, 'exit 9\n'])[1];
const base = realpathSync(mkdtempSync(join(tmpdir(), 'ctxslim-fixture-')));
const tmp = join(base, 'tmpdir');
mkdirSync(tmp);
writeFileSync(join(base, 'fence.sh'), fence);

// GIVEN the locale-hazard fence WHEN it runs under a private TMPDIR THEN it counts 9 runs and leaves nothing behind.
const r = spawnSync('bash', [join(base, 'fence.sh')], { encoding: 'utf8', timeout: 30000, env: { ...process.env, TMPDIR: tmp } });
const fixed = REF.split('\n').filter((l) => (l.match(/\/tmp\b/g) || []).length !== (l.match(/\$\{TMPDIR:-\/tmp\}/g) || []).length);
const actual = { status: r.status, python: (r.stdout || '').split('\n')[0], leftovers: readdirSync(tmp), fixed };
rmSync(base, { recursive: true, force: true });
assert.deepEqual(actual, { status: 0, python: '9', leftovers: [], fixed: [] },
  'fixture runs from its own mktemp dir, removes it, and keep-catalog has no fixed /tmp path');
console.log('suite-fixtures.mjs: 1 passed');
