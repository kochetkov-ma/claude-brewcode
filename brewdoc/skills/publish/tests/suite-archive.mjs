#!/usr/bin/env node
/**
 * suite-archive.mjs — `publish.mjs pack`: the BD01 allowlist and the BD-N03
 * produce-and-verify contract.
 *
 * Self-contained: every fixture tree, stub binary and output path is generated
 * inside one mkdtemp base, which is removed at the end. No network, no upload —
 * `pack` only builds and verifies an archive.
 *
 * Assertion policy: unconditional exact-equality / exact-size checks with a
 * description; no `if` gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLISH = join(HERE, '..', 'scripts', 'publish.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-publish-a-')));
const SITE = join(BASE, 'site');
const OUT = join(BASE, 'out', 'bundle.zip');
mkdirSync(join(BASE, 'out'), { recursive: true });

/** The BD01 fixture: publishable assets mixed with private and irrelevant material. */
const FIXTURE = {
  'index.html': '<h1>home</h1>',
  'about.html': '<h1>about</h1>',
  'css/site.css': 'body{color:#111}',
  'assets/logo.png': 'PNGDATA',
  'deep/nested/page.html': '<p>deep</p>',
  'notes.txt': 'release notes',
  '.env': 'API_KEY=sk-live-000',
  '.git/config': '[core]\n',
  '.DS_Store': 'junk',
  'node_modules/pkg.js': 'module.exports=1',
  'app.js.map': '{"version":3}',
  'build.sh': 'echo build',
};
for (const [rel, body] of Object.entries(FIXTURE)) {
  mkdirSync(dirname(join(SITE, rel)), { recursive: true });
  writeFileSync(join(SITE, rel), body);
}

const EXPECTED_KEPT = [
  'about.html', 'assets/logo.png', 'css/site.css', 'deep/nested/page.html', 'index.html', 'notes.txt',
];
const EXPECTED_SKIPPED = ['.DS_Store', '.env', '.git', 'app.js.map', 'build.sh', 'node_modules'];

// ── harness ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

function pack(args, extraEnv = {}) {
  const r = spawnSync('node', [PUBLISH, 'pack', ...args], {
    encoding: 'utf8', env: { ...process.env, ...extraEnv }, timeout: 30000,
  });
  const out = r.stdout || '';
  return {
    status: r.status,
    out,
    field: (key) => {
      const m = out.match(new RegExp(`^${key}: (.*)$`, 'm'));
      return m === null ? '' : m[1];
    },
    // Manifest body: the indented lines between the header and FILES:.
    entries: out.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.slice(2)).sort(),
  };
}

/** Archive contents as unzip sees them, directory entries dropped. */
function archived(zipPath) {
  const z = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  return (z.stdout || '').split('\n').map((s) => s.trim())
    .filter((s) => s !== '' && !s.endsWith('/')).sort();
}

// ── pack: allowlist, manifest, verified artifact (BD01 + BD-N03) ────────────
{
  const r = pack(['--dir', SITE, '--out', OUT]);
  check('pack.exit', r.status, 0, 'a clean bundle packs and verifies');
  check('pack.result', r.field('RESULT'), 'ok', 'nothing in the kept set is flagged');
  check('pack.manifest.entries', r.entries, EXPECTED_KEPT,
    'the printed manifest lists exactly the six publishable files');
  check('pack.manifest.count', r.field('FILES'), '6', 'FILES matches the manifest length');
  check('pack.entry', r.field('ENTRY'), 'index.html', 'index.html wins entry auto-detection');
  check('pack.skipped', r.field('SKIPPED').replace(/^\d+ \(|\)$/g, '').split(', ').filter((x) => x !== '').sort(),
    EXPECTED_SKIPPED, 'every excluded entry is named, not silently dropped');

  const listed = archived(OUT);
  check('pack.archive.set', listed, EXPECTED_KEPT,
    'the ARCHIVE contents equal the manifest — the regression this suite exists for');
  check('pack.archive.env', listed.includes('.env'), false, '.env is not in the archive');
  check('pack.archive.git', listed.filter((n) => n.startsWith('.git/')), [], 'no .git/ entry is archived');
  check('pack.archive.modules', listed.filter((n) => n.startsWith('node_modules/')), [],
    'no node_modules/ entry is archived');
  check('pack.archive.map', listed.includes('app.js.map'), false, 'source maps are outside the allowlist');
  check('pack.archive.sh', listed.includes('build.sh'), false, 'shell scripts are outside the allowlist');

  const bytes = existsSync(OUT) ? statSync(OUT).size : -1;
  check('pack.bytes.reported', r.field('BYTES'), String(bytes), 'BYTES equals the artifact size on disk');
  check('pack.bytes.zero', bytes === 0, false, 'the verified artifact is not the 0-byte BD-N03 archive');
}

// ── BD-N03: a pre-existing 0-byte output is the exact failure that was shipped ──
{
  writeFileSync(OUT, '');
  check('preexisting.zero.before', statSync(OUT).size, 0, 'the mktemp-style 0-byte file is in place');
  const r = pack(['--dir', SITE, '--out', OUT]);
  check('preexisting.exit', r.status, 0, 'pack removes the stale output instead of appending to it');
  check('preexisting.archive.set', archived(OUT), EXPECTED_KEPT, 'the rebuilt archive is complete');
}

// ── BD-N03: a failing `zip` must abort before anything is uploadable ─────────
{
  const stubDir = join(BASE, 'stub');
  mkdirSync(stubDir, { recursive: true });
  const stub = join(stubDir, 'zip');
  writeFileSync(stub, '#!/bin/sh\nexit 3\n');
  spawnSync('chmod', ['+x', stub]);
  const failOut = join(BASE, 'out', 'failed.zip');
  const r = pack(['--dir', SITE, '--out', failOut], { PATH: `${stubDir}:${process.env.PATH}` });
  check('zipfail.exit', r.status, 1, 'zip exit 3 is propagated as a hard failure');
  check('zipfail.result', r.field('RESULT'), 'fail', 'the block-level gate sees RESULT: fail');
  check('zipfail.manifest', r.out.includes('ARCHIVE MANIFEST'), false,
    'no manifest is printed, so no upload step is ever reached');
  check('zipfail.artifact', existsSync(failOut), false,
    'no partial archive is left behind for a later curl to pick up');
}

// ── entry resolution ────────────────────────────────────────────────────────
{
  const r = pack(['--dir', SITE, '--out', OUT, '--entry', 'about.html']);
  check('entry.override.exit', r.status, 0, 'an explicit entry inside the bundle is accepted');
  check('entry.override.value', r.field('ENTRY'), 'about.html', '--entry overrides index.html');
}
{
  const missOut = join(BASE, 'out', 'miss.zip');
  const r = pack(['--dir', SITE, '--out', missOut, '--entry', 'missing.html']);
  check('entry.missing.exit', r.status, 1, 'an entry outside the bundle is a hard failure');
  check('entry.missing.artifact', existsSync(missOut), false, 'nothing is written for a bad entry');
}
{
  const traversal = join(BASE, 'out', 'trav.zip');
  const r = pack(['--dir', SITE, '--out', traversal, '--entry', '../../etc/passwd']);
  check('entry.traversal.exit', r.status, 1, 'a traversal entry is rejected as data');
  check('entry.traversal.artifact', existsSync(traversal), false, 'nothing is written for a traversal entry');
}

// ── flagged entries need a human, and never auto-upload ─────────────────────
{
  const flagged = join(BASE, 'flagged');
  mkdirSync(flagged, { recursive: true });
  writeFileSync(join(flagged, 'index.html'), '<h1>hi</h1>');
  writeFileSync(join(flagged, 'secrets.json'), '{"k":"v"}');
  const out = join(BASE, 'out', 'flagged.zip');
  const r = pack(['--dir', flagged, '--out', out]);
  check('flagged.exit', r.status, 2, 'a surviving sensitive name exits 2, not 0');
  check('flagged.result', r.field('RESULT'), 'confirm', 'the caller is told to ask before uploading');
  check('flagged.list', r.field('SENSITIVE'), 'secrets.json', 'the flagged entry is named exactly');
  check('flagged.archive.set', archived(out), ['index.html', 'secrets.json'],
    'the archive is still built and verified — only the upload waits');
}

// ── refusals ────────────────────────────────────────────────────────────────
{
  const nohtml = join(BASE, 'nohtml');
  mkdirSync(nohtml, { recursive: true });
  writeFileSync(join(nohtml, 'readme.txt'), 'no pages here');
  const out = join(BASE, 'out', 'nohtml.zip');
  const r = pack(['--dir', nohtml, '--out', out]);
  check('nohtml.exit', r.status, 1, 'a bundle with no .html fails instead of guessing an entry');
  check('nohtml.artifact', existsSync(out), false, 'no archive survives the refusal');
}
{
  const empty = join(BASE, 'empty');
  mkdirSync(join(empty, '.git'), { recursive: true });
  writeFileSync(join(empty, '.git', 'HEAD'), 'ref: x');
  const out = join(BASE, 'out', 'empty.zip');
  const r = pack(['--dir', empty, '--out', out]);
  check('empty.exit', r.status, 1, 'a directory holding only excluded material fails');
  check('empty.artifact', existsSync(out), false, 'no empty archive is produced');
}
{
  const r = pack(['--dir', join(BASE, 'does-not-exist'), '--out', join(BASE, 'out', 'nope.zip')]);
  check('missingdir.exit', r.status, 1, 'a missing source directory fails');
}

// ── pre-fix baseline: what the shipped two lines actually did ───────────────
// These assert the DEFECT against real `zip`, so the suite documents (and keeps
// documenting) why the fix is shaped the way it is.
{
  const legacy = join(BASE, 'legacy.zip');
  writeFileSync(legacy, ''); // what `mktemp /tmp/brewpage-site-XXXXXX.zip` leaves behind
  const r = spawnSync('zip', ['-r', legacy, '.'], { cwd: SITE, encoding: 'utf8' });
  check('legacy.zip.status', r.status, 3, 'BD-N03: Info-ZIP exits 3 on the mktemp-created 0-byte file');
  check('legacy.zip.size', statSync(legacy).size, 0, 'BD-N03: the file curl would have uploaded is 0 bytes');
  rmSync(legacy, { force: true });

  const r2 = spawnSync('zip', ['-r', legacy, '.'], { cwd: SITE, encoding: 'utf8' });
  check('legacy.control.status', r2.status, 0, 'BD01 control: removing the file first makes zip succeed');
  check('legacy.control.set', archived(legacy), [
    '.DS_Store', '.env', '.git/config', 'about.html', 'app.js.map', 'assets/logo.png', 'build.sh',
    'css/site.css', 'deep/nested/page.html', 'index.html', 'node_modules/pkg.js', 'notes.txt',
  ], 'BD01: `zip -r .` archives every private and irrelevant entry, credentials included');
}

// ── report ─────────────────────────────────────────────────────────────────
console.log('suite-archive.mjs (pack: BD01 allowlist + BD-N03 produce-and-verify)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
