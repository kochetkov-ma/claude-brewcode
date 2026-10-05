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
  'const data = args[args.indexOf("-d") + 1];',
  'fs.writeFileSync(process.env.CURL_ARGS + ".payload", args.includes("-d") ? (data.startsWith("@") ? fs.readFileSync(data.slice(1)) : data) : "");',
  'process.stdout.write(process.env.CURL_RESPONSE);',
].join('\n'));
chmodSync(mock, 0o755);
function run(code, suffix, extraEnv = {}) {
  return spawnSync('bash', ['-c', 'set -euo pipefail\n. "$LIB"\n' + code], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, LIB: lib, CLAUDE_SKILL_DIR: join(here, '..'), CLAUDE_PROJECT_DIR: root, PATH: bin + ':' + process.env.PATH,
      CURL_ARGS: join(base, 'args-' + suffix), CURL_HEADERS: join(base, 'headers-' + suffix),
      CURL_RESPONSE: JSON.stringify({ link: 'https://example.invalid/result', ownerToken: 'fixture-owner' }), ...extraEnv },
  });
}
function prepare() {
  const result = run('bp_prepare', 'prepare');
  assert.equal(result.status, 0, 'GIVEN private invocation allocation succeeds');
  const dir = result.stdout.trim();
  assert.equal(statSync(dir).mode & 0o777, 0o700, 'THEN invocation directory is private');
  return dir;
}
function begin(dir, mode, delivery = '') {
  return "bp_begin mysite 15 '' '" + basename(dir) + "' " + mode + " '" + delivery + "'";
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
  const protectedResult = run(begin(protectedRun, 'file', 'subdomain') + '\nbp_post https://example.invalid/upload > /dev/null', 'file');
  assert.equal(protectedResult.status, 0, 'THEN file password request succeeds');
  assert.equal(readFileSync(join(base, 'headers-file'), 'utf8'), 'X-Password: ' + password + '\n',
    'THEN fake curl reads exact header contents from private file');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'headers-file.modes'), 'utf8')), [0o600],
    'THEN supplied password header payload is private at consumer read time');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-file'), 'utf8')),
    ['-s', '-X', 'POST', 'https://example.invalid/upload', '-H', '@' + protectedRun + '/password-header.txt', '-H', 'X-Delivery-Mode: subdomain'],
    'THEN password bytes stay file-only alongside the explicit delivery header');
  assert.equal(protectedResult.stdout + protectedResult.stderr, '', 'THEN helper logs no password or response');
  assert.equal(existsSync(protectedRun), false, 'THEN password transport files are cleaned on completion');
  assert.equal(readFileSync(passwordSource, 'utf8'), password + '\n', 'THEN explicit user password source is preserved');

  // GIVEN valid delivery choices WHEN posting THEN only the creation header changes.
  for (const mode of ['path', 'subdomain']) {
    const modeRun = prepare();
    const outcome = run(begin(modeRun, 'none', mode) + '\nbp_post https://example.invalid/upload > /dev/null', mode);
    assert.equal(outcome.status, 0, 'THEN valid delivery choice succeeds');
    assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-' + mode), 'utf8')),
      ['-s', '-X', 'POST', 'https://example.invalid/upload', '-H', 'X-Delivery-Mode: ' + mode],
      'THEN creation carries exact delivery header');
  }
  // GIVEN invalid delivery input WHEN beginning THEN fail before curl and clean only our run.
  const invalidRun = prepare();
  const invalid = run(begin(invalidRun, 'none', 'invalid') + ' || exit 1\nbp_post https://example.invalid/upload', 'invalid');
  assert.equal(invalid.status, 1, 'THEN invalid delivery mode fails');
  assert.equal(existsSync(join(base, 'args-invalid')), false, 'THEN invalid mode never reaches curl');
  assert.equal(existsSync(invalidRun), false, 'THEN invalid mode cleans its inputs');

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
    .replaceAll('{ns}', 'my').replaceAll('{days}', '15')
    .replaceAll('{run_id}', basename(callerRun)).replaceAll('{password_mode}', 'none').replaceAll('{delivery_mode}', '');
  const callerResult = run(caller, 'caller');
  assert.equal(callerResult.status, 0, 'THEN actual shipped caller succeeds with fake curl');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-caller'), 'utf8')),
    ['-s', '-X', 'POST', 'https://brewpage.app/api/html?ns=my&ttl=15&format=markdown',
      '-H', 'Content-Type: application/json', '-d', '@' + callerRun + '/payload.json'],
    'THEN the my profile namespace reaches upload with the existing file-backed payload');
  assert.equal(callerResult.stdout, 'OK https://example.invalid/result\n', 'THEN caller exposes URL only');
  assert.equal(callerResult.stderr, '', 'THEN caller emits no response or owner token in errors');
  assert.equal(existsSync(callerRun), false, 'THEN actual caller cleans its owned run');
  const history = readFileSync(join(root, '.claude/brewpage-history.md'), 'utf8');
  assert.equal(history.split('`fixture-owner`').length - 1, 1, 'THEN response owner token is consumed into history exactly once');

  // GIVEN shipped callers and OLD/NEW winners WHEN publishing THEN exact server identity wins.
  const variants = [
    { name: 'brewdoc', path: join(here, '../SKILL.md'), history: '.claude/brewpage-history.md' },
    { name: 'standalone', path: join(here, '../../../../skills/brewpage-publish/SKILL.md'), history: '.claude/brewpage-history.md' },
    { name: 'openclaw', path: join(here, '../../../../openclaw/brewpage-publish/SKILL.md'), history: 'brewpage-history.md' },
  ];
  const responses = [
    { link: 'https://fixture123.brewpage.app/', ownerToken: 'private-new-owner', ownerLink: 'https://brewpage.app/api/html/public/Fixture123',
      id: 'Fixture123', namespace: 'public', routingCohort: 'new-v1', deliveryMode: 'subdomain', modeLocked: false, hostingVersion: 1 },
    { link: 'https://brewpage.app/public/Legacy1234', ownerToken: 'private-old-owner' },
    { link: 'https://brewpage.app/public/LegacyNull', ownerToken: 'private-null-owner', routingCohort: 'old', deliveryMode: null, hostingVersion: null },
  ];
  for (const variant of variants) {
    const source = readFileSync(variant.path, 'utf8');
    const shippedBlocks = [...source.matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
    for (const block of shippedBlocks) assert.equal(spawnSync('bash', ['-n'], { input: block }).status, 0,
      'THEN every variant Bash block parses');
    const uploadBlocks = shippedBlocks.filter(block => block.includes('RESPONSE=$('));
    assert.equal(uploadBlocks.length, variant.name === 'openclaw' ? 4 : 5, 'THEN existing upload formats remain unchanged');
    assert.equal(uploadBlocks.every(block => block.includes(variant.name === 'brewdoc' ? "'{delivery_mode}'" : '"${DELIVERY_H[@]}"')), true,
      'THEN every existing upload block carries the optional header');
    const html = shippedBlocks.find(block => block.includes('api/html?'));
    for (const mode of ['', 'path', 'subdomain']) for (const [index, response] of responses.entries()) {
      const owned = prepare();
      writeFileSync(join(owned, 'brewpage-content.md'), 'Fixture markdown\n');
      const suffix = variant.name + '-' + (mode || 'default') + '-' + index;
      const code = html.replaceAll('{ns}', 'public').replaceAll('{days}', '15').replaceAll('{ttl}', '15')
        .replaceAll('{run_id}', basename(owned)).replaceAll('{password_mode}', 'none')
        .replaceAll('{delivery_mode}', mode).replaceAll('{content}', 'Fixture markdown');
      const outcome = run((variant.name === 'brewdoc' ? '' : 'set +u\n') + code, suffix,
        { PASSWORD: '', DELIVERY_MODE: mode, CURL_RESPONSE: JSON.stringify(response) });
      assert.equal(outcome.status, 0, 'THEN shipped HTML caller succeeds: ' + suffix + ' ' + outcome.stderr);
      assert.equal(outcome.stdout, 'OK ' + response.link + '\n', 'THEN returned winner URL retains exact root slash or OLD form');
      assert.equal(outcome.stderr, '', 'THEN caller emits no response secrets');
      const args = JSON.parse(readFileSync(join(base, 'args-' + suffix), 'utf8'));
      assert.deepEqual(args.filter(value => value.startsWith('X-Delivery-Mode:')),
        mode ? ['X-Delivery-Mode: ' + mode] : [], 'THEN only explicit requests carry a mode header even when winner differs');
      assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-' + suffix + '.payload'), 'utf8')),
        { content: variant.name === 'brewdoc' ? 'Fixture markdown\n' : 'Fixture markdown' },
        'THEN routing metadata does not enter authored HTML payload');
      const privateHistory = readFileSync(join(root, variant.history), 'utf8');
      assert.equal(privateHistory.includes('[' + response.link + '](' + response.link + ')'), true,
        'THEN history stores exact server winner URL');
      assert.equal(privateHistory.includes('`' + response.ownerToken + '`'), true, 'THEN owner token stays in per-tool history');
      assert.equal(outcome.stdout.includes(response.ownerToken), false, 'THEN no token enters output');
      const projection = Object.fromEntries(['id', 'namespace', 'type', 'routingCohort', 'deliveryMode', 'modeLocked', 'hostingVersion', 'managementLink']
        .map(key => [key, response[key] ?? null]));
      assert.equal(privateHistory.includes('`' + JSON.stringify(projection) + '`'), true,
        'THEN exact winner metadata, including OLD nulls, is retained');
      const cleanup = run("[ ! -d '" + owned + "' ] || { bp_run_dir '" + basename(owned) + "'; bp_cleanup; }", suffix + '-cleanup');
      assert.equal(cleanup.status, 0, 'THEN fixture cleanup succeeds');
      assert.equal(existsSync(owned), false, 'THEN fixture allocation is cleaned without changing portable history location');
    }
    // GIVEN invalid mode in the shipped HTML caller WHEN executed THEN reject before curl.
    const invalidOwned = prepare();
    writeFileSync(join(invalidOwned, 'brewpage-content.md'), 'Fixture markdown\n');
    const invalidCode = html.replaceAll('{ns}', 'public').replaceAll('{days}', '15').replaceAll('{ttl}', '15')
      .replaceAll('{run_id}', basename(invalidOwned)).replaceAll('{password_mode}', 'none')
      .replaceAll('{delivery_mode}', 'invalid').replaceAll('{content}', 'Fixture markdown');
    const bad = run(invalidCode, variant.name + '-invalid', { PASSWORD: '', DELIVERY_MODE: 'invalid' });
    assert.equal(bad.status, 1, 'THEN shipped invalid mode rejects');
    assert.equal(existsSync(join(base, 'args-' + variant.name + '-invalid')), false, 'THEN shipped invalid mode never uploads');
    const cleanup = run("[ ! -d '" + invalidOwned + "' ] || { bp_run_dir '" + basename(invalidOwned) + "'; bp_cleanup; }", variant.name + '-invalid-cleanup');
    assert.equal(cleanup.status, 0, 'THEN invalid fixture cleanup succeeds');

    // GIVEN a rejected response with a token WHEN rendering failure THEN reveal no response body.
    const rejectedOwned = prepare();
    writeFileSync(join(rejectedOwned, 'brewpage-content.md'), 'Fixture markdown\n');
    const rejectedCode = html.replaceAll('{ns}', 'public').replaceAll('{days}', '15').replaceAll('{ttl}', '15')
      .replaceAll('{run_id}', basename(rejectedOwned)).replaceAll('{password_mode}', 'none')
      .replaceAll('{delivery_mode}', '').replaceAll('{content}', 'Fixture markdown');
    const rejected = run((variant.name === 'brewdoc' ? '' : 'set +u\n') + rejectedCode, variant.name + '-rejected',
      { PASSWORD: '', DELIVERY_MODE: '', CURL_RESPONSE: JSON.stringify({ ownerToken: 'error-private-owner' }) });
    assert.equal(rejected.stdout, 'FAILED: publish rejected (no .link in response)\n', 'THEN failure prints only its safe explanation');
    assert.equal(rejected.stderr, '', 'THEN no rejected-response token appears in errors');
    const rejectedCleanup = run("[ ! -d '" + rejectedOwned + "' ] || { bp_run_dir '" + basename(rejectedOwned) + "'; bp_cleanup; }", variant.name + '-rejected-cleanup');
    assert.equal(rejectedCleanup.status, 0, 'THEN rejected fixture cleanup succeeds');
  }
  console.log('PASS publish isolation: credentials, concurrent ownership, mode headers, exact OLD/NEW winner URLs and shipped callers');
} finally {
  rmSync(base, { recursive: true, force: true });
}
