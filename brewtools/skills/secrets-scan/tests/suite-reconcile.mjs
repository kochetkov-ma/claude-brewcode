#!/usr/bin/env node
/**
 * suite-reconcile.mjs (BT-F04) - scripts/reconcile.mjs.
 *
 * The invariant under test: `assigned == union(scanned, skipped)`. A chunk that
 * loses files, invents files, or returns unparsable JSON must be reported, not
 * merged - that is the difference between "no findings" and "never looked".
 *
 * Self-contained: every list and payload is written into one mkdtemp base and
 * removed at the end. No repo, HOME or network access.
 *
 * Assertion policy: unconditional exact-equality of the FULL parsed stdout
 * object (or an exact status code) with a description; no `if` gates.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECONCILE = join(HERE, '..', 'scripts', 'reconcile.mjs');
const BASE = mkdtempSync(join(tmpdir(), 'secscan-recon-'));

const ASSIGNED = ['src/a.ts', 'src/b.ts', 'docs/c.md', 'bin/d.png'];
const ASSIGNED_FILE = join(BASE, 'assigned-1.txt');
writeFileSync(ASSIGNED_FILE, `${ASSIGNED.join('\n')}\n`);

let seq = 0;
function payloadFile(obj) {
  seq += 1;
  const f = join(BASE, `agent-${seq}.json`);
  writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
}

// ── harness ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
    return;
  }
  failed++;
  results.push(
    `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
  );
}

function run(args) {
  const r = spawnSync(process.execPath, [RECONCILE, ...args], { encoding: 'utf8', timeout: 8000 });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function verdict(obj) {
  return JSON.parse(run([ASSIGNED_FILE, payloadFile(obj)]).stdout);
}

function code(obj) {
  return run([ASSIGNED_FILE, payloadFile(obj)]).status;
}

// ── complete chunk ─────────────────────────────────────────────────────────
const COMPLETE = {
  agent: 1,
  scanned: ['src/a.ts', 'src/b.ts', 'docs/c.md'],
  skipped: [{ path: 'bin/d.png', reason: 'binary' }],
  findings: [],
};
check('recon.ok', verdict(COMPLETE), {
  status: 'OK', agent: 1, assigned: 4, accounted: 4, missing: [], extra: [],
}, 'scanned + skipped covering the assigned list exactly is OK');
check('recon.ok.code', code(COMPLETE), 0, 'an OK verdict exits 0');

// ── dropped file: the BT-F04 hole ──────────────────────────────────────────
const DROPPED = { agent: 2, scanned: ['src/a.ts', 'src/b.ts'], skipped: [], findings: [] };
check('recon.missing', verdict(DROPPED), {
  status: 'MISMATCH', agent: 2, assigned: 4, accounted: 2,
  missing: ['bin/d.png', 'docs/c.md'], extra: [],
}, 'files that appear in neither array are named in missing[], sorted');
check('recon.missing.code', code(DROPPED), 1, 'a MISMATCH verdict exits 1');

// ── invented file ──────────────────────────────────────────────────────────
check('recon.extra', verdict({
  agent: 3,
  scanned: ['src/a.ts', 'src/b.ts', 'docs/c.md', 'bin/d.png', 'src/z.ts'],
  skipped: [],
  findings: [],
}), {
  status: 'MISMATCH', agent: 3, assigned: 4, accounted: 5, missing: [], extra: ['src/z.ts'],
}, 'a path outside the chunk is reported in extra[] - the agent left its scope');

// ── duplicates collapse, they do not fake coverage ─────────────────────────
check('recon.duplicates', verdict({
  agent: 4,
  scanned: ['src/a.ts', 'src/a.ts', 'src/a.ts', 'src/b.ts'],
  skipped: [{ path: 'src/a.ts', reason: 'dupe' }],
  findings: [],
}), {
  status: 'MISMATCH', agent: 4, assigned: 4, accounted: 2,
  missing: ['bin/d.png', 'docs/c.md'], extra: [],
}, 'four repeats of one path account for one path, not four');

// ── malformed payloads ─────────────────────────────────────────────────────
check('recon.prose', JSON.parse(run([ASSIGNED_FILE, payloadFile(
  'Here is the JSON you asked for:\n{"agent":5,"scanned":[],"skipped":[],"findings":[]}',
)]).stdout), {
  status: 'MALFORMED', reason: 'unparsable agent JSON: SyntaxError', agent: null,
}, 'prose wrapped around the JSON is MALFORMED, never a silently empty chunk');

check('recon.prose.code', run([ASSIGNED_FILE, payloadFile('not json at all')]).status, 2,
  'a MALFORMED verdict exits 2');

check('recon.noscanned', verdict({ agent: 6, skipped: [], findings: [] }), {
  status: 'MALFORMED', reason: 'scanned[] or skipped[] missing', agent: 6,
}, 'a payload without scanned[] is MALFORMED, and keeps the agent number');

check('recon.noskipped', verdict({ agent: 7, scanned: ASSIGNED, findings: [] }), {
  status: 'MALFORMED', reason: 'scanned[] or skipped[] missing', agent: 7,
}, 'a payload without skipped[] is MALFORMED even when scanned[] covers everything');

check('recon.skippedshape', verdict({
  agent: 8, scanned: ['src/a.ts', 'src/b.ts', 'docs/c.md'], skipped: [{ reason: 'binary' }], findings: [],
}), {
  status: 'MALFORMED', reason: 'skipped[] entry without a path', agent: 8,
}, 'a skipped[] entry with no path cannot account for anything');

check('recon.wrongtype', verdict({ agent: 9, scanned: 'src/a.ts', skipped: [], findings: [] }), {
  status: 'MALFORMED', reason: 'scanned[] or skipped[] missing', agent: 9,
}, 'a string where scanned[] belongs is MALFORMED, not a one-file chunk');

// ── empty chunk is a legitimate OK ─────────────────────────────────────────
const EMPTY_ASSIGNED = join(BASE, 'assigned-empty.txt');
writeFileSync(EMPTY_ASSIGNED, '\n\n');
check('recon.empty', JSON.parse(run([EMPTY_ASSIGNED, payloadFile({
  agent: 10, scanned: [], skipped: [], findings: [],
})]).stdout), {
  status: 'OK', agent: 10, assigned: 0, accounted: 0, missing: [], extra: [],
}, 'blank lines in the assigned list are not paths; an empty chunk reconciles OK');

// ── CLI errors ─────────────────────────────────────────────────────────────
check('recon.usage', JSON.parse(run([]).stdout), { status: 'USAGE' }, 'no arguments reports USAGE');
check('recon.usage.code', run([]).status, 2, 'no arguments exits 2');
check('recon.nolist', JSON.parse(run([join(BASE, 'absent.txt'), payloadFile(COMPLETE)]).stdout), {
  status: 'MALFORMED', reason: 'assigned list unreadable', agent: null,
}, 'an unreadable assigned list is MALFORMED, never an empty assignment');

// ── report ─────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('\n=== secrets-scan reconcile (BT-F04) TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
