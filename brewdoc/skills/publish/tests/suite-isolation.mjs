#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, statSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '../scripts/brewpage-lib.sh');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'publish-isolation-')));
const root = join(base, 'project');
const bin = join(base, 'bin');
mkdirSync(root); mkdirSync(bin);
const mock = join(bin, 'curl');
writeFileSync(mock, [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const args = process.argv.slice(2);',
  'fs.writeFileSync(process.env.CURL_ARGS, JSON.stringify(args));',
  'const headers = args.filter((value, index) => args[index - 1] === "-H" && value.startsWith("@"));',
  'fs.writeFileSync(process.env.CURL_HEADERS, Buffer.concat(headers.map(value => fs.readFileSync(value.slice(1)))));',
  'fs.writeFileSync(process.env.CURL_HEADERS + ".modes", JSON.stringify(headers.map(value => fs.statSync(value.slice(1)).mode & 0o777)));',
  'process.stdout.write(JSON.stringify({link:"https://example.invalid/result",ownerToken:"fixture-owner"}));',
].join('\n'));
chmodSync(mock, 0o755);
function run(code, suffix) {
  return spawnSync('bash', ['-c', 'set -euo pipefail\n. "$LIB"\n' + code], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, LIB: lib, CLAUDE_SKILL_DIR: join(here, '..'), CLAUDE_PROJECT_DIR: root, PATH: bin + ':' + process.env.PATH,
      CURL_ARGS: join(base, 'args-' + suffix), CURL_HEADERS: join(base, 'headers-' + suffix) },
  });
}
function prepare() {
  const result = run('bp_prepare', 'prepare');
  assert.equal(result.status, 0, 'GIVEN private invocation allocation succeeds');
  const dir = result.stdout.trim();
  assert.equal(statSync(dir).mode & 0o777, 0o700, 'THEN invocation directory is private');
  return dir;
}
function begin(dir, mode) {
  return "bp_begin mysite 15 '' '" + basename(dir) + "' " + mode;
}
try {
  // GIVEN stale shared password WHEN explicit mode is none THEN curl receives no password.
  const stale = join(root, '.claude/tmp/brewpage-password.txt');
  mkdirSync(dirname(stale), { recursive: true });
  writeFileSync(stale, 'stale-password');
  const noPassword = prepare();
  const result = run(begin(noPassword, 'none') + '\nbp_post https://example.invalid/upload > /dev/null', 'none');
  assert.equal(result.status, 0, 'THEN explicit no-password request succeeds through fake curl');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-none'), 'utf8')), ['-s', '-X', 'POST', 'https://example.invalid/upload'],
    'THEN stale source creates no password header');
  assert.equal(readFileSync(stale, 'utf8'), 'stale-password', 'THEN unrelated shared source is preserved');
  assert.equal(existsSync(noPassword), false, 'THEN successful run cleans only its inputs');

  // GIVEN password file WHEN posting THEN curl reads exact private bytes without argv/log exposure.
  const protectedRun = prepare();
  const password = 'fixture-$(id)-пароль';
  const passwordSource = join(base, 'source-password.txt');
  writeFileSync(passwordSource, password + '\n', { mode: 0o600 });
  writeFileSync(join(protectedRun, 'brewpage-password-source.txt'), passwordSource + '\n');
  const protectedResult = run(begin(protectedRun, 'file') + '\nbp_post https://example.invalid/upload > /dev/null', 'file');
  assert.equal(protectedResult.status, 0, 'THEN file password request succeeds');
  assert.equal(readFileSync(join(base, 'headers-file'), 'utf8'), 'X-Password: ' + password + '\n',
    'THEN fake curl reads exact header contents from private file');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'headers-file.modes'), 'utf8')), [0o600],
    'THEN supplied password header payload is private at consumer read time');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-file'), 'utf8')), ['-s', '-X', 'POST', 'https://example.invalid/upload', '-H', '@' + protectedRun + '/password-header.txt'],
    'THEN curl arguments contain only header path');
  assert.equal(protectedResult.stdout + protectedResult.stderr, '', 'THEN helper logs no password or response');
  assert.equal(existsSync(protectedRun), false, 'THEN password transport files are cleaned on completion');
  assert.equal(readFileSync(passwordSource, 'utf8'), password + '\n', 'THEN explicit user password source is preserved');

  // GIVEN simultaneous shells WHEN preparing THEN each run owns a distinct directory.
  const parallel = run([
    '(r=$(bp_prepare); printf "%s\\n" "$r" > "$BP_TMPDIR/first-run"; bp_begin mysite 15 "" "${r##*/}" none; sleep 0.1) &',
    'first=$!',
    '(r=$(bp_prepare); printf "%s\\n" "$r" > "$BP_TMPDIR/second-run"; bp_begin mysite 15 "" "${r##*/}" none; sleep 0.1) &',
    'second=$!', 'wait "$first"', 'wait "$second"',
  ].join('\n'), 'parallel');
  assert.equal(parallel.status, 0, 'THEN simultaneous invocation preludes both succeed');
  const paths = ['first-run', 'second-run'].map(name => readFileSync(join(root, '.claude/tmp', name), 'utf8').trim());
  assert.equal(new Set(paths).size, 2, 'THEN concurrent runs own distinct directories');
  assert.deepEqual(paths.map(existsSync), [false, false], 'THEN both shells clean their own invocation directories');

  // GIVEN another prepared run WHEN cancellation/failure cleans ours THEN preserve other owner.
  const cancelled = prepare();
  const other = prepare();
  writeFileSync(join(other, 'source.txt'), 'other owner');
  const cancel = run("bp_run_dir '" + basename(cancelled) + "'; bp_cleanup", 'cancel');
  assert.equal(cancel.status, 0, 'THEN pre-upload cancellation cleanup succeeds');
  assert.equal(existsSync(cancelled), false, 'THEN cancellation removes its owned directory');
  assert.equal(readFileSync(join(other, 'source.txt'), 'utf8'), 'other owner', 'THEN cancellation preserves concurrent inputs');
  const failed = prepare();
  const failure = run(begin(failed, 'file') + ' || exit 1', 'failure');
  assert.equal(failure.status, 1, 'THEN missing explicit password fails without upload');
  assert.equal(existsSync(failed), false, 'THEN failure cleans invocation inputs');
  assert.equal(readFileSync(join(other, 'source.txt'), 'utf8'), 'other owner', 'THEN failure preserves unrelated run');

  const skill = readFileSync(join(here, '../SKILL.md'), 'utf8');
  assert.equal(skill.indexOf('before the first tool action') < skill.indexOf('### Step 1:'), true,
    'THEN PLAN instruction precedes all workflow actions');
  const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
  for (const block of blocks) assert.equal(spawnSync('bash', ['-n'], { input: block }).status, 0,
    'THEN every shipped Bash block parses');
  // GIVEN actual shipped markdown caller WHEN consuming fixture inputs THEN helper completes without secret output.
  const callerRun = prepare();
  writeFileSync(join(callerRun, 'brewpage-content.md'), 'Fixture markdown\n');
  const caller = blocks.find(block => block.includes('api/html?'))
    .replaceAll('{ns}', 'mysite').replaceAll('{days}', '15')
    .replaceAll('{run_id}', basename(callerRun)).replaceAll('{password_mode}', 'none');
  const callerResult = run(caller, 'caller');
  assert.equal(callerResult.status, 0, 'THEN actual shipped caller succeeds with fake curl');
  assert.equal(callerResult.stdout, 'OK https://example.invalid/result\n', 'THEN caller exposes URL only');
  assert.equal(callerResult.stderr, '', 'THEN caller emits no response or owner token in errors');
  assert.equal(existsSync(callerRun), false, 'THEN actual caller cleans its owned run');
  const history = readFileSync(join(root, '.claude/brewpage-history.md'), 'utf8');
  assert.equal(history.split('`fixture-owner`').length - 1, 1, 'THEN response owner token is consumed into history exactly once');
  console.log('PASS publish isolation: stale source, file-only curl headers, concurrent ownership, cancellation/failure and PLAN');
} finally {
  rmSync(base, { recursive: true, force: true });
}
