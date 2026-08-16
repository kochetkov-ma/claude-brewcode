#!/usr/bin/env node
/**
 * suite-redact.mjs (BT-F03) - scripts/redact.mjs.
 *
 * Self-contained: fixtures are written into one mkdtemp base and removed at the
 * end; the repo working tree, HOME and the real report dirs are never touched.
 *
 * Every fixture value is FAKE and assembled from fragments, so no line of this
 * source file matches the scanner's own patterns.
 *
 * Assertion policy: unconditional exact-equality of the FULL parsed stdout
 * object (or an exact string / exact boolean) with a description; no `if` gates
 * which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REDACT = join(HERE, '..', 'scripts', 'redact.mjs');

// ── fake secrets, assembled so this file never matches a scanner pattern ────
const PW_KEY = ['pass', 'word'].join('');
const PWD_KEY = ['p', 'wd'].join('');
const TOKEN_KEY = ['api', '_', 'to', 'ken'].join('');
const FAKE_PW = 'sw0rdfish-not-real';
const FAKE_TOKEN = 'abc123fake';
const FAKE_AWS = `AKIA${'TESTFAKE0000000A'}`;
const FAKE_URL = `${'postgres'}://u:pw@db.example/x`;
const FAKE_KEY_LINE = `${'-----BEGIN RSA '}PRIVATE KEY-----MIIFAKE`;

const FIXTURE_LINES = [
  '#!/usr/bin/env bash',                       // 1
  `${PW_KEY}=${FAKE_PW}`,                      // 2
  `${TOKEN_KEY}: "${FAKE_TOKEN}"`,             // 3
  `aws_access_key_id = ${FAKE_AWS}`,           // 4
  `db_url = "${FAKE_URL}"`,                    // 5
  FAKE_KEY_LINE,                               // 6
  `${PW_KEY}=process.env.DB_PW`,               // 7
  'const answer = 42',                         // 8
  `${PWD_KEY}=ab`,                             // 9
  `${PWD_KEY}=z`,                              // 10
  `${PW_KEY}=\${DB_PW}`,                       // 11
];

const BASE = mkdtempSync(join(tmpdir(), 'secscan-redact-'));
const FIXTURE = join(BASE, 'config.env');
writeFileSync(FIXTURE, `${FIXTURE_LINES.join('\n')}\n`);

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
  const r = spawnSync(process.execPath, [REDACT, ...args], { encoding: 'utf8', timeout: 8000 });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function parsed(args) {
  return JSON.parse(run(args).stdout);
}

// ── per-line classification ────────────────────────────────────────────────
check('redact.password', parsed([FIXTURE, '2']), {
  path: FIXTURE, line: 2, status: 'OK', category: 'Passwords',
  match_len: 18, sha256_12: '0310acebc17d', preview: 'sw0r***',
}, 'a hardcoded password yields length + fingerprint + 4-char preview, no value');

check('redact.token', parsed([FIXTURE, '3']), {
  path: FIXTURE, line: 3, status: 'OK', category: 'Tokens',
  match_len: 10, sha256_12: '396323685202', preview: 'abc1***',
}, 'a quoted api token is unquoted before hashing and classed Tokens');

check('redact.aws', parsed([FIXTURE, '4']), {
  path: FIXTURE, line: 4, status: 'OK', category: 'AWS',
  match_len: 20, sha256_12: 'bc6b0920472c', preview: 'AKIA***',
}, 'an AKIA key id is matched as a whole 20-char token');

check('redact.dburl', parsed([FIXTURE, '5']), {
  path: FIXTURE, line: 5, status: 'OK', category: 'DB URLs',
  match_len: 28, sha256_12: 'e4c8f0ba7510', preview: 'post***',
}, 'a credentialed connection string is hashed whole, not split at its password');

check('redact.privatekey', parsed([FIXTURE, '6']), {
  path: FIXTURE, line: 6, status: 'OK', category: 'Keys',
  match_len: 38, sha256_12: 'bfcd1d28ff71', preview: '----***',
}, 'a PRIVATE KEY header takes the whole line as the matched value');

check('redact.envref', parsed([FIXTURE, '7']), {
  path: FIXTURE, line: 7, status: 'SKIP_ENV_REF', category: 'Passwords',
}, 'process.env indirection is a reference, reported as SKIP_ENV_REF with no fingerprint');

check('redact.envref.brace', parsed([FIXTURE, '11']), {
  path: FIXTURE, line: 11, status: 'SKIP_ENV_REF', category: 'Passwords',
}, '${VAR} interpolation is also SKIP_ENV_REF');

check('redact.nomatch', parsed([FIXTURE, '8']), {
  path: FIXTURE, line: 8, status: 'NO_MATCH',
}, 'an ordinary assignment produces NO_MATCH and no fields');

// ── preview can never reveal the whole value ───────────────────────────────
check('redact.short2', parsed([FIXTURE, '9']), {
  path: FIXTURE, line: 9, status: 'OK', category: 'Passwords',
  match_len: 2, sha256_12: 'fb8e20fc2e4c', preview: 'a***',
}, 'a 2-char value reveals exactly 1 char');

check('redact.short1', parsed([FIXTURE, '10']), {
  path: FIXTURE, line: 10, status: 'OK', category: 'Passwords',
  match_len: 1, sha256_12: '594e519ae499', preview: '***',
}, 'a 1-char value reveals nothing');

// ── the leak gate: no stream may carry the raw value ───────────────────────
for (const [name, line, secret] of [
  ['password', '2', FAKE_PW],
  ['token', '3', FAKE_TOKEN],
  ['aws', '4', FAKE_AWS],
  ['dburl', '5', FAKE_URL],
  ['privatekey', '6', FAKE_KEY_LINE],
]) {
  const r = run([FIXTURE, line]);
  check(`noleak.${name}`, `${r.stdout}${r.stderr}`.includes(secret), false,
    `neither stdout nor stderr repeats the ${name} value`);
}

// ── exit codes ─────────────────────────────────────────────────────────────
check('exit.ok', run([FIXTURE, '2']).status, 0, 'a redacted finding exits 0');
check('exit.nomatch', run([FIXTURE, '8']).status, 1, 'NO_MATCH exits 1');
check('exit.envref', run([FIXTURE, '7']).status, 1, 'SKIP_ENV_REF exits 1');
check('exit.nofile', run([join(BASE, 'absent.env'), '2']).status, 2, 'a missing file exits 2');
check('exit.noline', run([FIXTURE, '999']).status, 2, 'a line past EOF exits 2');
check('exit.usage', run([]).status, 2, 'no arguments exits 2');

check('status.nofile', parsed([join(BASE, 'absent.env'), '2']), {
  status: 'NO_FILE', path: join(BASE, 'absent.env'),
}, 'a missing file reports NO_FILE with the path');
check('status.noline', parsed([FIXTURE, '999']), {
  status: 'NO_LINE', path: FIXTURE, line: 999,
}, 'a line past EOF reports NO_LINE');
check('status.usage', parsed([]), { status: 'USAGE' }, 'no arguments reports USAGE');

// ── report ─────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('\n=== secrets-scan redact (BT-F03) TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
