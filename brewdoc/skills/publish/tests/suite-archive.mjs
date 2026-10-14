#!/usr/bin/env node
// `publish.mjs pack`: BD01 allowlist + BD-N03 produce-and-verify; all fixtures in one mkdtemp base, removed at end.
// No network/upload; unconditional exact-equality/size checks with descriptions, no `if` gating asserts.
import { spawn, spawnSync } from 'node:child_process';
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

/** JSON capped at 2000 chars: a 3.3 MB FAIL line once cut the whole CI step log after it. */
function show(value) {
  const s = JSON.stringify(value) ?? String(value);
  return s.length > 2000 ? `${s.slice(0, 2000)}…(${s.length} chars)` : s;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(`  FAIL  ${name}  (${message} | actual=${show(actual)} expected=${show(expected)})`);
  }
}

function pack(args, extraEnv = {}) {
  const r = spawnSync('node', [PUBLISH, 'pack', ...args], {
    encoding: 'utf8', env: { ...process.env, ...extraEnv }, timeout: 30000, maxBuffer: 64 * 1024 * 1024,
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
  const z = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return (z.stdout || '').split('\n').map((s) => s.trim())
    .filter((s) => s !== '' && !s.endsWith('/')).sort();
}

// Any throw still ends in a FAIL line and the summary, so CI shows the cause.
try {
  for (const [rel, body] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(SITE, rel)), { recursive: true });
    writeFileSync(join(SITE, rel), body);
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

  // ── failure causes: a child's error/signal is named, never read as its exit status ──
  {
    // GIVEN a site whose name list just passes 1 MiB (Node's default maxBuffer) with few files: 754-byte paths
    // (three 250-byte components, under macOS PATH_MAX 1024). A zip that never reads it always gets EPIPE.
    const big = join(BASE, 'big');
    const deep = `p/${'a'.repeat(250)}/${'b'.repeat(250)}`;
    const bigNames = ['index.html', ...Array.from({ length: 1400 }, (_, i) => `${deep}/${String(i).padStart(5, '0')}${'c'.repeat(240)}.html`)];
    mkdirSync(join(big, deep), { recursive: true });
    for (const rel of bigNames) writeFileSync(join(big, rel), '<p>x</p>');
    check('cause.given.list', Buffer.byteLength(`${bigNames.join('\n')}\n`), 1057011, 'GIVEN the list is 1057011 bytes (> 1 MiB = 16x pipe)');

    // One fake `bin` per case, first on PATH; pack() outcome = [exit, full stdout, archive left on disk].
    const fakeBin = (bin, tag, body) => {
      const dir = join(BASE, `fake-${bin}-${tag}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, bin), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      return { PATH: `${dir}:${process.env.PATH}` };
    };
    const packOutcome = (dir, name, env) => {
      const out = join(BASE, 'out', name);
      const r = pack(['--dir', dir, '--out', out], env);
      return [r.status, r.out, existsSync(out)];
    };

    // WHEN zip exits 0 without reading the list THEN the pipe error is named, not "zip exited 0".
    check('cause.zip.epipe', packOutcome(big, 'epipe.zip', fakeBin('zip', 'epipe', 'exit 0')),
      [1, 'FAILED: zip failed (EPIPE) — no archive produced\nRESULT: fail\n', false], 'EPIPE named, no manifest, no archive');

    // WHEN zip exits 3 without reading the list THEN its own status wins over the EPIPE it caused.
    check('cause.zip.status', packOutcome(big, 'exit3.zip', fakeBin('zip', 'exit3', 'exit 3')),
      [1, 'FAILED: zip exited 3 — no archive produced\nRESULT: fail\n', false], 'non-zero status named, no manifest, no archive');

    // WHEN zip reads the list, then dies on a signal THEN the signal is named.
    check('cause.zip.signal', packOutcome(SITE, 'zip-kill.zip', fakeBin('zip', 'kill', 'cat > /dev/null\nkill -9 $$')),
      [1, 'FAILED: zip killed by SIGKILL — no archive produced\nRESULT: fail\n', false], 'signal named, no manifest, no archive');

    // WHEN unzip dies on a signal during verification THEN the check is reported unfinished and the archive removed.
    check('cause.unzip.signal', packOutcome(SITE, 'unzip-kill.zip', fakeBin('unzip', 'kill', 'kill -9 $$')),
      [1, 'FAILED: archive could not be checked: unzip killed by SIGKILL\nRESULT: fail\n', false], 'unfinished check != corrupt archive');

    // WHEN real zip/unzip pack the >1 MiB site THEN the unzip listing fits its buffer and the site verifies.
    const bigOut = join(BASE, 'out', 'big.zip');
    const r = pack(['--dir', big, '--out', bigOut]);
    check('cause.bigsite', [r.status, r.entries, r.field('RESULT'), archived(bigOut)], [0, bigNames, 'ok', bigNames],
      'a valid many-file site is not misread as an integrity failure (was ENOBUFS)');

    // WHEN the reader stalls 1 s before draining a >1 MiB manifest THEN no byte is lost (was cut at ~128 KB, exit 0).
    const givenZip = join(BASE, 'given-big.zip');
    const zipped = spawnSync('zip', ['-q', '-X', '-@', givenZip], { cwd: big, input: `${bigNames.join('\n')}\n` });
    check('cause.given.zip', zipped.status, 0, 'GIVEN real zip builds the >1 MiB-manifest archive');
    const slow = await new Promise((done) => {
      const child = spawn('node', [PUBLISH, 'inspect', '--zip', givenZip]);
      const chunks = [];
      child.stdout.on('data', (c) => chunks.push(c));
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), 1000);
      child.on('error', (err) => done([null, String(err)]));
      child.on('close', (status) => done([status, Buffer.concat(chunks).toString('utf8')]));
    });
    const manifest = ['ARCHIVE MANIFEST — given-big.zip', ...bigNames.map((n) => `  ${n}`), `FILES: ${bigNames.length}`,
      `BYTES: ${statSync(givenZip, { throwIfNoEntry: false })?.size}`, 'ENTRY: index.html', 'SKIPPED: 0', 'RESULT: ok', ''].join('\n');
    check('cause.slowreader', slow, [0, manifest], 'a lagging pipe reader still gets the whole manifest and RESULT line');
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
  // Asserts the DEFECT against real `zip`: keeps documenting why the fix is shaped this way.
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
} catch (err) {
  failed++;
  results.push(`  FAIL  suite.crash  (uncaught before the summary: ${show(err?.stack ?? err)})`);
} finally {
  console.log('suite-archive.mjs (pack: BD01 allowlist + BD-N03 produce-and-verify)');
  for (const line of results) console.log(line);
  console.log(`  ${passed} passed, ${failed} failed`);
  rmSync(BASE, { recursive: true, force: true });
  process.exitCode = failed === 0 ? 0 : 1;
}
