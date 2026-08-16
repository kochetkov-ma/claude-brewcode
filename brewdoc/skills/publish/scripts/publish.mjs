#!/usr/bin/env node
/**
 * publish.mjs — build and verify the SITE bundle for brewdoc:publish.
 *
 * Never touches the network. It produces (or inspects) an archive and either
 * hands back a verified artifact or leaves nothing behind; the caller runs
 * `curl` only when this exits 0, so an unverified bundle can never be uploaded.
 *
 *   pack    --dir <abs-dir> --out <abs.zip> [--entry <name>]
 *   inspect --zip <abs.zip>                 [--entry <name>]
 *
 * Exit codes:
 *   0  archive verified, manifest printed, nothing sensitive  -> upload
 *   2  archive verified, but flagged entries remain           -> ask the user first
 *   1  failure; any partial archive produced here is removed  -> never upload
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, lstatSync, existsSync, rmSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

/** Publishable web assets. Allowlist by design: an unknown extension is dropped, never shipped. */
const ALLOWED_EXT = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.xml', '.webmanifest',
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf',
  '.txt', '.md', '.pdf',
  '.mp4', '.webm', '.mp3', '.wav',
]);

/** Names that stay out even when the extension is allowed. */
const EXCLUDED_DIRS = new Set(['node_modules', 'vendor', '__pycache__', 'dist-cache']);

/** Entries that still need a human OK if they survive the allowlist. */
const SENSITIVE_RE = /(^|\/)(\.env|id_rsa|id_ed25519)|secret|credential|password|token|\.(pem|key|p12|pfx|crt|map)$/i;

const ENTRY_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

function die(msg) {
  console.log(`FAILED: ${msg}`);
  console.log('RESULT: fail');
  process.exit(1);
}

function parseArgs(argv) {
  const out = { mode: argv[0] };
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k.startsWith('--') || v === undefined) die(`bad argument near "${k}"`);
    out[k.slice(2)] = v;
  }
  return out;
}

function validateEntry(entry) {
  if (entry === undefined) return undefined;
  if (!ENTRY_RE.test(entry) || entry.split('/').includes('..')) {
    die(`entry "${entry}" is not a plain relative file name`);
  }
  return entry;
}

/** Recursively collect allowlisted regular files, relative to root, sorted. */
function collect(root) {
  const kept = [];
  const skipped = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = relative(root, abs);
      const st = lstatSync(abs);
      if (name.startsWith('.') || EXCLUDED_DIRS.has(name)) { skipped.push(rel); continue; }
      if (st.isSymbolicLink()) { skipped.push(rel); continue; }
      if (st.isDirectory()) { walk(abs); continue; }
      if (!st.isFile()) { skipped.push(rel); continue; }
      if (!ALLOWED_EXT.has(extname(name).toLowerCase())) { skipped.push(rel); continue; }
      if (/[\r\n]/.test(rel)) { skipped.push(rel); continue; }
      kept.push(rel);
    }
  };
  walk(root);
  return { kept: kept.sort(), skipped: skipped.sort() };
}

function resolveEntry(names, requested) {
  if (requested !== undefined) {
    if (!names.includes(requested)) die(`entry "${requested}" is not in the archive`);
    return requested;
  }
  if (names.includes('index.html')) return 'index.html';
  const html = names.filter((n) => n.toLowerCase().endsWith('.html') || n.toLowerCase().endsWith('.htm'));
  if (html.length === 0) die('no .html file in the bundle — refusing to guess an entry file');
  return html[0];
}

function requireTool(bin) {
  const probe = spawnSync(bin, ['-h'], { encoding: 'utf8' });
  if (probe.error && probe.error.code === 'ENOENT') die(`${bin} required`);
}

/** `unzip -Z1` listing; returns file names (directory entries dropped). */
function listArchive(zipPath) {
  const t = spawnSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  if (t.status !== 0) return null;
  const z = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (z.status !== 0) return null;
  return (z.stdout || '').split('\n').map((s) => s.trim()).filter((s) => s !== '' && !s.endsWith('/')).sort();
}

/** The one manifest format, and the only place the exit code is decided. */
function report(names, bytes, entry, skipped, zipPath, unexpected = []) {
  console.log(`ARCHIVE MANIFEST — ${basename(zipPath)}`);
  for (const n of names) console.log(`  ${n}`);
  console.log(`FILES: ${names.length}`);
  console.log(`BYTES: ${bytes}`);
  console.log(`ENTRY: ${entry}`);
  console.log(`SKIPPED: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`);
  if (unexpected.length) console.log(`UNEXPECTED: ${unexpected.join(', ')}`);
  const flagged = names.filter((n) => SENSITIVE_RE.test(n));
  if (flagged.length) console.log(`SENSITIVE: ${flagged.join(', ')}`);
  if (unexpected.length || flagged.length) {
    console.log('RESULT: confirm');
    process.exit(2);
  }
  console.log('RESULT: ok');
  process.exit(0);
}

function pack(args) {
  const dir = args.dir;
  const out = args.out;
  if (!dir || !out) die('pack needs --dir and --out');
  if (!out.endsWith('.zip')) die('--out must end with .zip');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`not a directory: ${dir}`);
  const entryArg = validateEntry(args.entry);
  requireTool('zip');
  requireTool('unzip');

  const { kept, skipped } = collect(dir);
  if (kept.length === 0) die(`no publishable files under ${dir} after the allowlist filter`);
  const entry = resolveEntry(kept, entryArg);

  // BD-N03: `mktemp` leaves a 0-byte file that Info-ZIP reads as a corrupt
  // archive and exits 3. Start from no file at all, every time.
  rmSync(out, { force: true });

  const z = spawnSync('zip', ['-q', '-X', '-@', out], {
    cwd: dir, input: `${kept.join('\n')}\n`, encoding: 'utf8',
  });
  if (z.error || z.status !== 0) {
    rmSync(out, { force: true });
    die(`zip exited ${z.status === null ? 'abnormally' : z.status} — no archive produced`);
  }

  if (!existsSync(out) || statSync(out).size === 0) {
    rmSync(out, { force: true });
    die('zip produced no usable archive');
  }
  const bytes = statSync(out).size;
  const listed = listArchive(out);
  if (listed === null) { rmSync(out, { force: true }); die('archive failed its integrity check'); }
  if (listed.join('\n') !== kept.join('\n')) {
    rmSync(out, { force: true });
    die(`archive contents differ from the selected file set (in archive: ${listed.length}, selected: ${kept.length})`);
  }
  report(listed, bytes, entry, skipped, out);
}

function inspect(args) {
  const zipPath = args.zip;
  if (!zipPath) die('inspect needs --zip');
  if (!existsSync(zipPath) || !statSync(zipPath).isFile()) die(`not a file: ${zipPath}`);
  const entryArg = validateEntry(args.entry);
  requireTool('unzip');

  const bytes = statSync(zipPath).size;
  if (bytes === 0) die('archive is 0 bytes');
  const listed = listArchive(zipPath);
  if (listed === null) die('archive failed its integrity check');
  if (listed.length === 0) die('archive contains no files');
  const entry = resolveEntry(listed, entryArg);

  // A supplied ZIP is not rewritten — anything outside the allowlist is surfaced
  // for a human decision instead of being silently uploaded.
  const unexpected = listed.filter((n) => !ALLOWED_EXT.has(extname(n).toLowerCase()));
  report(listed, bytes, entry, [], zipPath, unexpected);
}

const args = parseArgs(process.argv.slice(2));
if (args.mode === 'pack') pack(args);
else if (args.mode === 'inspect') inspect(args);
else die('usage: publish.mjs pack --dir <dir> --out <zip> [--entry <name>] | inspect --zip <zip> [--entry <name>]');
