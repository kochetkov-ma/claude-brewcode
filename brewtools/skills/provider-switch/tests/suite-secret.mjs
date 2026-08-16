#!/usr/bin/env node
/**
 * suite-secret.mjs - BT-F02: the API key never becomes model-visible text.
 *
 * Every scenario gets its own temp HOME; the real ~/.zshrc is never opened. A distinctive
 * sentinel stands in for the key, and the central check walks the WHOLE temp tree afterwards
 * and asserts that the exact set of files containing the sentinel is the allowlist (the
 * destination ~/.zshrc plus the user-created key file) - a leak into a backup, a temp file or
 * a log fails the check by set inequality. stdout and stderr are asserted secret-free too.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, chmodSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunner, makeBase } from './harness.mjs';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SCRIPTS = join(HERE, '..', 'scripts');
const READ_SECRET = join(SCRIPTS, 'read-secret.sh');
const WRITE_ALIAS = join(SCRIPTS, 'write-alias.sh');

const { check, report } = createRunner('suite-secret');
const BASE = makeBase('prv-secret-');

const SENTINEL = 'sk-BREWCODE-SENTINEL-9f3a2c1d7e-DO-NOT-LEAK';
const NASTY = `sk-a'b$(whoami)\`id\`"c;d`;

// Provider keys must never bleed in from the developer's own shell.
const CLEAN_ENV = { ...process.env };
for (const k of ['DEEPSEEK_API_KEY', 'ZAI_API_KEY', 'DASHSCOPE_API_KEY', 'MINIMAX_API_KEY', 'OPENROUTER_API_KEY']) {
  delete CLEAN_ENV[k];
}

function world(name) {
  const root = join(BASE, name);
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const run = (script, args, extraEnv = {}) => spawnSync('bash', [script, ...args], {
    env: { ...CLEAN_ENV, HOME: home, ...extraEnv },
    encoding: 'utf8',
  });
  run(WRITE_ALIAS, ['init']);
  return { root, home, run };
}

/** Every file under `dir` whose bytes contain `needle`, as repo-style relative paths. */
function filesContaining(dir, needle, root) {
  const hits = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      hits.push(...filesContaining(p, needle, root));
      continue;
    }
    if (!entry.isFile()) continue;
    if (readFileSync(p, 'utf8').includes(needle)) hits.push(relative(root, p));
  }
  return hits.sort();
}

const mode = (p) => (statSync(p).mode & 0o777).toString(8);
const fingerprint = (v) => createHash('sha256').update(v).digest('hex').slice(0, 12);
const kv = (out, key) => {
  const line = out.split('\n').find((l) => l.startsWith(`${key}=`));
  return line === undefined ? null : line.slice(key.length + 1);
};

// ── 1. env source: happy path, no leak ──────────────────────────────────────
{
  const w = world('env-ok');
  const r = w.run(READ_SECRET, ['env:DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY'], { DEEPSEEK_API_KEY: SENTINEL });

  check('env.exit', r.status, 0, 'read-secret.sh exits 0 for an exported env var');
  check('env.stdout.last', r.stdout.trim().split('\n').pop(), 'OK read-secret', 'final stdout line is the OK marker');
  check('env.stdout.leak', r.stdout.includes(SENTINEL), false, 'the secret never reaches stdout');
  check('env.stderr.leak', r.stderr.includes(SENTINEL), false, 'the secret never reaches stderr');
  check('env.stderr.empty', r.stderr, '', 'nothing is written to stderr on success');
  check('env.bytes', kv(r.stdout, 'BYTES'), String(SENTINEL.length), 'BYTES equals the exact key length');
  check('env.fingerprint', kv(r.stdout, 'FINGERPRINT'), fingerprint(SENTINEL), 'FINGERPRINT equals sha256(key)[:12]');
  check('env.source', kv(r.stdout, 'SOURCE'), 'env:DEEPSEEK_API_KEY', 'SOURCE echoes the source spec, not the value');
  check('env.dest', kv(r.stdout, 'DEST'), 'DEEPSEEK_API_KEY', 'DEST echoes the destination variable');

  const zshrc = readFileSync(join(w.home, '.zshrc'), 'utf8');
  check('env.export-line', zshrc.includes(`export DEEPSEEK_API_KEY='${SENTINEL}'`), true,
    'the key is stored single-quoted in ~/.zshrc');
  check('env.zshrc-mode', mode(join(w.home, '.zshrc')), '600', '~/.zshrc is left owner-only');
  check('env.tree-leak', filesContaining(w.root, SENTINEL, w.root), ['home/.zshrc'],
    'the ONLY file in the whole tree containing the secret is the destination ~/.zshrc');
}

// ── 2. file source: happy path, permission gate, no leak ────────────────────
{
  const w = world('file-ok');
  const keyFile = join(w.home, 'deepseek.key');
  writeFileSync(keyFile, `${SENTINEL}\n`);
  chmodSync(keyFile, 0o600);

  const r = w.run(READ_SECRET, [`file:${keyFile}`, 'DEEPSEEK_API_KEY']);
  check('file.exit', r.status, 0, 'a mode-600 file is accepted');
  check('file.stdout.leak', r.stdout.includes(SENTINEL), false, 'the secret never reaches stdout');
  check('file.stderr.leak', r.stderr.includes(SENTINEL), false, 'the secret never reaches stderr');
  check('file.bytes', kv(r.stdout, 'BYTES'), String(SENTINEL.length), 'the trailing newline is stripped, not counted');
  check('file.tree-leak', filesContaining(w.root, SENTINEL, w.root), ['home/.zshrc', 'home/deepseek.key'],
    'only the user-created key file and the destination ~/.zshrc hold the secret');
}

{
  const w = world('file-lax-perms');
  const keyFile = join(w.home, 'deepseek.key');
  writeFileSync(keyFile, SENTINEL);
  chmodSync(keyFile, 0o644);

  const r = w.run(READ_SECRET, [`file:${keyFile}`, 'DEEPSEEK_API_KEY']);
  check('perm.exit', r.status, 1, 'a group/world readable key file is refused');
  check('perm.reason', r.stdout.includes('group/world accessible'), true, 'the refusal names the reason');
  check('perm.remedy', r.stdout.includes(`chmod 600 ${keyFile}`), true, 'the refusal prints the exact fix');
  check('perm.leak', (r.stdout + r.stderr).includes(SENTINEL), false, 'the refusal is secret-free');
  check('perm.no-write', readFileSync(join(w.home, '.zshrc'), 'utf8').includes('DEEPSEEK_API_KEY'), false,
    'nothing is written to ~/.zshrc when the source is refused');
}

// ── 3. shell-metacharacter key survives the round trip ──────────────────────
{
  const w = world('nasty');
  const r = w.run(READ_SECRET, ['env:ZAI_API_KEY', 'ZAI_API_KEY'], { ZAI_API_KEY: NASTY });
  check('nasty.exit', r.status, 0, 'a key holding quotes, $, backticks and ; is accepted');

  const zshrc = readFileSync(join(w.home, '.zshrc'), 'utf8');
  const expected = `export ZAI_API_KEY='sk-a'\\''b$(whoami)\`id\`"c;d'`;
  check('nasty.export-line', zshrc.split('\n').find((l) => l.startsWith('export ZAI_API_KEY=')), expected,
    "the stored line single-quotes the value with ' doubled as '\\''");

  // Sourcing it back must yield the byte-identical value, with no expansion of $() or backticks.
  const back = spawnSync('bash', ['-c', `set -a; . "$1"; printf '%s' "$ZAI_API_KEY"`, 'bash', join(w.home, '.zshrc')],
    { env: { ...CLEAN_ENV, HOME: w.home }, encoding: 'utf8' });
  check('nasty.roundtrip', back.stdout, NASTY, 'sourcing ~/.zshrc restores the exact key, nothing expanded');
  check('nasty.roundtrip.exit', back.status, 0, 'the generated ~/.zshrc is valid shell');
}

// ── 4. missing / malformed sources fail loudly and non-secretly ─────────────
{
  const w = world('env-missing');
  const r = w.run(READ_SECRET, ['env:DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY']);
  check('missing.exit', r.status, 1, 'an unset env var is a hard failure');
  check('missing.reason', r.stdout.includes('$DEEPSEEK_API_KEY is unset or empty'), true, 'the failure names the variable');
  check('missing.template', r.stdout.includes("export DEEPSEEK_API_KEY='<your-key>'"), true,
    'the failure prints the placeholder command, never a value');
}

{
  const w = world('env-empty');
  const r = w.run(READ_SECRET, ['env:DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY'], { DEEPSEEK_API_KEY: '' });
  check('empty.exit', r.status, 1, 'an empty env var is a hard failure');
}

{
  const w = world('file-missing');
  const r = w.run(READ_SECRET, [`file:${join(w.home, 'nope.key')}`, 'DEEPSEEK_API_KEY']);
  check('nofile.exit', r.status, 1, 'a missing key file is a hard failure');
  check('nofile.remedy', r.stdout.includes('umask 077; printf'), true, 'the failure prints how to create the file');
}

{
  const w = world('ctrl-chars');
  const r = w.run(READ_SECRET, ['env:DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY'], { DEEPSEEK_API_KEY: 'sk-a\tb' });
  check('ctrl.exit', r.status, 1, 'a value with control characters is refused');
  check('ctrl.reason', r.stdout.includes('control characters'), true, 'the refusal names the reason');
}

{
  const w = world('bad-args');
  const bad = w.run(READ_SECRET, ['env:DEEPSEEK_API_KEY', 'lower-case'], { DEEPSEEK_API_KEY: SENTINEL });
  check('args.dest.exit', bad.status, 1, 'a non-uppercase destination variable is refused');
  const scheme = w.run(READ_SECRET, [`${w.home}/x.key`, 'DEEPSEEK_API_KEY']);
  check('args.scheme.exit', scheme.status, 1, 'a source without an env:/file: scheme is refused');
  const none = w.run(READ_SECRET, []);
  check('args.none.exit', none.status, 1, 'no arguments is a hard failure');
  check('args.none.usage', none.stdout.includes('Usage: read-secret.sh'), true, 'usage is printed on no arguments');
}

// ── 5. write-alias.sh still refuses a key on argv / a tty ───────────────────
{
  const w = world('argv-guard');
  const r = w.run(WRITE_ALIAS, ['set-key', 'DEEPSEEK_API_KEY'], {});
  check('argv.exit', r.status, 1, 'set-key with no stdin value fails');
  check('argv.no-write', readFileSync(join(w.home, '.zshrc'), 'utf8').includes('DEEPSEEK_API_KEY'), false,
    'a failed set-key writes nothing');
}

// ── 6. the SKILL.md contract itself carries no key-collection instruction ───
{
  const skill = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
  check('skill.no-key-value-placeholder', skill.includes("printf '%s' 'KEY_VALUE'"), false,
    'the model is no longer told to compose a Bash line containing the key');
  check('skill.no-auq-for-key', skill.includes('AUQ: "Enter your <PRV> API key'), false,
    'the AskUserQuestion key prompt is gone');
  check('skill.read-secret-wired', skill.includes('scripts/read-secret.sh'), true,
    'Step 3 routes the key through read-secret.sh');
  check('skill.status-terminal', skill.includes('`status` is TERMINAL'), true,
    'BT-F20: status is documented as terminal');
  check('skill.no-autoinstall', skill.includes('auto-proceed to P3'), false,
    'BT-F20: the zero-config auto-install fallthrough is gone');
}

report();
