import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const safe = 'skills/brewpage-publish-safe';
const regular = ['brewdoc/skills/publish', 'skills/brewpage-publish', 'openclaw/brewpage-publish'];
const syntheticToken = 'A'.repeat(32);
const syntheticManagement = 'https://brewpage.app/manage/html/fixture/Receipt001#k=synthetic-fake-capability';
const reader = 'https://brewpage.app/fixture/Receipt001';
const endpoint = 'https://brewpage.app/api/html/fixture/Receipt001';
const publish = ['publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'Fixture text'];
const update = ['update', 'html', '--target', reader, '--password-file', '', '--text', 'Changed fixture'];

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'brewpage-safe-test-')));
  const folder = name => { const path = join(root, name); mkdirSync(path, { mode: 0o700 }); return path; };
  const project = folder('workspace');
  const bin = folder('bin');
  const home = folder('home');
  const state = folder('state');
  const stateBase = process.platform === 'darwin' ? join(home, 'Library', 'Application Support') : state;
  const store = join(stateBase, 'brewpage-publish-safe');
  const controls = join(root, 'controls.json');
  const traffic = join(root, 'traffic.jsonl');
  const env = { ...process.env, HOME: home, XDG_STATE_HOME: state, TMPDIR: folder('tmp'), CLAUDE_PROJECT_DIR: project,
    PATH: bin + ':' + process.env.PATH, TRAFFIC: traffic, SYNTHETIC_OWNER: syntheticToken, SYNTHETIC_RECEIPT: JSON.stringify({ link: reader, ownerLink: endpoint,
      id: 'Receipt001', namespace: 'fixture', ownerToken: syntheticToken, manageUrl: syntheticManagement }) };
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(${JSON.stringify(controls)}, 'utf8'));
const args = process.argv.slice(2);
const method = args[args.indexOf('-X') + 1];
if (fixture.CHECK_ENV && (process.env.BREWPAGE_FIXTURE_AMBIENT || args[0] !== '-q' || !args.includes('=https'))) process.exit(94);
if (fixture.CHECK_PASSWORD && (method === 'POST' || method === 'PUT')) {
  const headerPath = args.find(arg => arg.startsWith('@') && arg.endsWith('password-header.txt'))?.slice(1);
  if (!headerPath || fs.readFileSync(headerPath, 'utf8') !== 'X-Password: ' + fixture.CHECK_PASSWORD + '\\n' || (fs.statSync(headerPath).mode & 511) !== 384) process.exit(93);
}
if (fixture.WIRE_DIGEST) {
  const index = args.indexOf('--data-binary');
  if (index < 0) process.exit(95);
  const body = fs.readFileSync(args[index + 1].slice(1));
  fs.writeFileSync(fixture.WIRE_DIGEST, require('node:crypto').createHash('sha256').update(body).digest('hex'));
}
const receipt = JSON.parse(fixture.SYNTHETIC_RECEIPT);
const ownerHeader = args.find(arg => arg.startsWith('@') && (arg.endsWith('owner-token.txt') || arg.endsWith('owner-header.txt')));
const proof = ownerHeader ? fs.readFileSync(ownerHeader.slice(1), 'utf8').trim() : '';
const status = fixture.TEST_HTTP_STATUS || (method === 'PUT' ? '200' : '201');
const url = args.find(arg => arg.startsWith('https://'));
if (args.includes('-sI')) {
  process.stdout.write(fixture.REDIRECT_URL ? '308\\n' + fixture.REDIRECT_URL : '404\\n');
  process.exit(0);
}
if (!url.startsWith('https://brewpage.app/api/')) process.exit(99);
if (method === 'GET' && url.endsWith('/owner-check')) {
  const [type, namespace, id] = receipt.ownerLink.split('/').slice(-3);
  const owner = fixture.HOST_CHECK ? JSON.parse(fixture.HOST_CHECK) : { isOwner: proof === 'X-Owner-Token: ' + fixture.SYNTHETIC_OWNER, type, namespace, id };
  process.stdout.write(JSON.stringify(owner) + '\\nBP_HTTP_STATUS:200');
  process.exit(0);
}
fs.appendFileSync(fixture.TRAFFIC, JSON.stringify([method, url, proof === 'X-Owner-Token: ' + fixture.SYNTHETIC_OWNER]) + '\\n');
if (fixture.DAMAGE_HISTORY) {
  const root = fixture.DAMAGE_HISTORY;
  const slot = fs.readdirSync(root)[0];
  fs.chmodSync(root + '/' + slot + '/brewpage-history.md', 0o644);
}
const secretText = receipt.ownerToken + ' ' + receipt.manageUrl;
receipt.notices = [{ code: 'fixture', message: secretText }];
receipt.message = secretText;
process.stdout.write(JSON.stringify(receipt) + '\\nBP_HTTP_STATUS:' + status);
`, { mode: 0o700 });
  const run = (variant, args, extra = {}, cwd = project) => {
    const launch = { ...env, ...extra };
    const settings = Object.fromEntries(['TRAFFIC', 'SYNTHETIC_OWNER', 'SYNTHETIC_RECEIPT', 'TEST_HTTP_STATUS', 'WIRE_DIGEST', 'DAMAGE_HISTORY', 'CHECK_PASSWORD', 'CHECK_ENV', 'HOST_CHECK', 'REDIRECT_URL'].map(key => [key, launch[key]]));
    writeFileSync(controls, JSON.stringify(settings), { mode: 0o600 });
    return spawnSync('bash', [join(repo, variant, 'scripts/brewpage-run.sh'), ...args], { cwd, env: launch, encoding: 'utf8', timeout: 10000 });
  };
  return { root, env, project, store, run,
  traffic: () => existsSync(traffic) ? readFileSync(traffic, 'utf8').trim().split('\n').map(JSON.parse) : [],
  savedDir: () => join(store, readdirSync(store)[0]) };
}

function disclosure(result) {
  return [syntheticToken, syntheticManagement].map(value => (result.stdout + result.stderr).includes(value));
}

test('Skillstore Safe saves and recovers exact ownership without exposing capabilities', () => {
  // GIVEN isolated native user storage and synthetic REST receipts.
  const first = fixture();
  const fallback = fixture();
  try {
    // WHEN separate processes publish, update, restore a fallback and update again.
    const created = first.run(safe, publish);
    const updated = first.run(safe, update);
    const refused = first.run(safe, [...publish, '--private-output', syntheticToken]);
    const failedSave = fallback.run(safe, publish, { DAMAGE_HISTORY: fallback.store });
    const fallbackPath = join(fallback.savedDir(), 'brewpage-recovery.json');
    const historyPath = join(fallback.savedDir(), 'brewpage-history.md');
    assert.equal(statSync(fallbackPath).mode & 0o777, 0o600, 'the fallback is owner-only');
    assert.equal(JSON.parse(readFileSync(fallbackPath, 'utf8')).ownerToken === syntheticToken, true, 'the exact proof survives protected storage failure');
    chmodSync(historyPath, 0o600);
    const blocked = fallback.run(safe, update);
    const recovered = fallback.run(safe, ['owner-recover']);
    const receiptConsumed = !existsSync(fallbackPath);
    const recoveryUpdate = fallback.run(safe, update);
    // THEN the runner performs only exact authorized writes and keeps recovery in private application state.
    const results = [created, updated, refused, failedSave, blocked, recovered, recoveryUpdate];
    assert.deepEqual(results.map(r => [r.status, disclosure(r)]), [0, 0, 1, 1, 1, 0, 0].map(status => [status, [false, false]]), 'no completed or failed command exposes a capability');
    assert.deepEqual([first.traffic(), fallback.traffic()], Array.from({ length: 2 }, () => [
      ['POST', 'https://brewpage.app/api/html?ns=fixture&ttl=15&format=markdown', false], ['PUT', endpoint + '?verbatim=true', true],
    ]), 'both processes target the exact receipt with automatically stored proof');
    assert.deepEqual([statSync(first.savedDir()).mode & 0o777, statSync(join(first.savedDir(), 'brewpage-history.md')).mode & 0o777,
      existsSync(join(first.project, '.claude')), receiptConsumed, recovered.stdout],
    [0o700, 0o600, false, true, 'OWNER TOKEN RECOVERED\n'], 'private user state is verified and fallback is consumed after recovery');
  } finally { for (const f of [first, fallback]) rmSync(f.root, { recursive: true, force: true }); }
});

test('Skillstore Safe refuses unsafe storage and inconsistent receipts without logging them', () => {
  // GIVEN a protected store with incorrect permissions and a separate valid-looking error body.
  const blocked = fixture();
  const error = fixture();
  try {
    mkdirSync(blocked.store, { recursive: true, mode: 0o755 });
    // WHEN the user requests publish in each workspace.
    const unavailable = blocked.run(safe, publish);
    const rejected = error.run(safe, publish, { TEST_HTTP_STATUS: '503' });
    const retry = error.run(safe, publish);
    // THEN no unsafe upload dispatches and an inconsistent receipt stays pending.
    assert.deepEqual([[unavailable.status, blocked.traffic().length], [rejected.status, retry.status, error.traffic().length],
      [unavailable, rejected, retry].map(disclosure), [rejected, retry].map(r => r.stdout.startsWith('OK '))],
    [[1, 0], [1, 1, 1], Array(3).fill([false, false]), [false, false]], 'storage and transport failures close safely before any repeat write');
  } finally { for (const f of [blocked, error]) rmSync(f.root, { recursive: true, force: true }); }
});

test('regular skills deliver declined-history receipts only to a protected file', () => {
  // GIVEN three regular skill distributions and isolated synthetic anonymous creates.
  const deliveries = regular.map(variant => {
    const f = fixture();
    try {
      // WHEN history is declined without, then with, an owner-only receipt directory outside the workspace.
      const refused = f.run(variant, [...publish, '--no-save', '--private-output']);
      const receipts = join(f.root, 'receipts');
      mkdirSync(receipts, { mode: 0o700 });
      const result = f.run(variant, [...publish, '--no-save', '--receipt-dir', receipts, '--private-output']);
      const file = join(receipts, 'brewpage-recovery.json');
      return [refused.status, result.status, result.stdout.includes('OWNER RECOVERY SAVED\n'), [refused, result].map(disclosure), f.traffic().length,
        statSync(file).mode & 0o777, JSON.parse(readFileSync(file, 'utf8')).ownerToken === syntheticToken];
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN only the protected receipt file holds owner capabilities; stdout never does.
  assert.deepEqual(deliveries, Array(3).fill([1, 0, true, [[false, false], [false, false]], 1, 0o600, true]),
    'regular declined-history receipts stay in an owner-only file');
});

test('uncertain creates stay bound to their exact request and selected authority', () => {
  // GIVEN first-owner and reused-owner attempts with missing definitive receipts.
  const cases = [false, true].map(reuse => {
    const f = fixture();
    try {
      const setup = reuse ? f.run(safe, publish).status : 0;
      const payload = '{\n  "label": "fixture"\n}\n';
      const wireDigest = join(f.root, 'wire-digest');
      const unknown = f.run(safe, ['publish', 'json', '--ns', 'fixture', '--password-file', '', '--text', payload], { TEST_HTTP_STATUS: '503', WIRE_DIGEST: wireDigest });
      const pendingPath = join(f.savedDir(), 'brewpage-pending-create.json');
      const pending = JSON.parse(readFileSync(pendingPath, 'utf8'));
      const status = JSON.parse(f.run(safe, ['owner-pending']).stdout);
      const attempt = status.pending[0];
      const blocked = f.run(safe, publish);
      const callsWhilePending = f.traffic().length;
      const file = join(f.savedDir(), 'brewpage-reconciliation.json');
      const evidence = { source: 'owner-verified-first-party', verifiedByOperator: true, reference: 'Synthetic first-party operator finding' };
      const record = { schema: 'brewpage-safe-reconciliation-v1', operationId: attempt.operationId, requestSha256: attempt.requestSha256,
        evidence, outcome: reuse ? 'publication-owned' : 'no-write' };
      const protectedReceipt = { origin: 'https://brewpage.app', ownerApi: 'https://brewpage.app/api/json/fixture/Receipt002', readerUrl: 'https://fixture-abcde12345.brewpage.app/',
        ownerToken: syntheticToken, operationId: attempt.operationId, identity: { id: 'Receipt002', namespace: 'fixture' } };
      const contradictory = reuse ? { ...record, receipt: { ...protectedReceipt, ownerToken: 'B'.repeat(32) } } : { ...record, requestSha256: '0'.repeat(64) };
      // WHEN the runner receives mismatched and then verified outcomes in separate processes.
      writeFileSync(file, JSON.stringify(contradictory), { mode: 0o600 });
      const rejected = f.run(safe, ['owner-reconcile']);
      const otherReader = 'https://brewpage.app/fixture/Different001';
      writeFileSync(file, JSON.stringify({ ...record, outcome: 'publication-owned', receipt: { ...protectedReceipt, readerUrl: otherReader } }));
      const badReader = f.run(safe, ['owner-reconcile']);
      const wrongTarget = f.run(safe, ['update', 'json', '--target', otherReader, '--password-file', '', '--text', payload]);
      writeFileSync(file, JSON.stringify(reuse ? { ...record, receipt: protectedReceipt } : record));
      const reconciled = f.run(safe, ['owner-reconcile']);
      const fresh = f.run(safe, publish);
      // THEN neither failure nor recovery dispatches a repeat write and the exact proof stays private.
      return { setup, unknown: unknown.status, blocked: blocked.status, rejected: rejected.status, reconciled: reconciled.status, fresh: fresh.status,
        wire: [pending.request.payloadSha256, readFileSync(wireDigest, 'utf8')], permission: statSync(f.savedDir()).mode & 0o777,
        pending: [status.pending.length, attempt.receiptAvailable, existsSync(pendingPath), existsSync(file)],
        readers: [badReader.status, wrongTarget.status], calls: [callsWhilePending, f.traffic().length, f.traffic().at(-1)[2]],
        leak: [unknown, blocked, rejected, badReader, wrongTarget, reconciled, fresh].some(r => disclosure(r).some(Boolean)) };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  const digest = createHash('sha256').update('{\n  "label": "fixture"\n}\n').digest('hex');
  assert.deepEqual(cases, [false, true].map(reuse => ({ setup: 0, unknown: 1, blocked: 1, rejected: 1, reconciled: 0, fresh: 0,
    wire: [digest, digest], permission: 0o700, pending: [1, false, false, false], readers: [1, 1], calls: [reuse ? 2 : 1, reuse ? 3 : 2, reuse], leak: false })),
  'every POST journals exact payload bytes, and only a verified request and owner match closes that attempt');
});

test('contradictory response authority never poisons saved proof', () => {
  // GIVEN a saved synthetic owner and possible invalid update receipt fields.
  const conflictingProof = 'B'.repeat(32);
  const cases = [
    [update, 'PUT', { ownerToken: conflictingProof }],
    [publish, 'POST', { result: { action: 'created', extras: { isOwner: false } } }],
    [publish, 'POST', { type: 'json' }],
    [update, 'PUT', { link: 'https://brewpage.app/fixture/Different001' }],
    [update, 'PUT', { link: 'https://brewpage.app/manage/html/fixture/Receipt001' }],
    [update, 'PUT', { link: 'https://example.test/fixture/Receipt001' }],
    [update, 'PUT', { link: 'https://wrong-abcde12345.brewpage.app/' }],
  ];
  const decisions = cases.map(([action, method, conflict]) => {
    const f = fixture();
    try {
      const first = f.run(safe, publish);
      const receipt = { ...JSON.parse(f.env.SYNTHETIC_RECEIPT), ...conflict };
      // WHEN a contradictory receipt is returned and another explicit update uses a correct receipt.
      const bad = f.run(safe, action, { SYNTHETIC_RECEIPT: JSON.stringify(receipt) });
      const recover = f.run(safe, ['owner-recover']);
      const valid = f.run(safe, update);
      return [method, first.status, bad.status, recover.status, valid.status, /^OK /m.test(bad.stdout),
        (bad.stdout + bad.stderr).includes(conflictingProof), disclosure(bad), f.traffic().map(row => [row[0], row[2]])];
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN existing proof remains usable without importing any contradictory response.
  assert.deepEqual(decisions, cases.map(([, method]) => [method, 0, 1, 1, 0, false, false, [false, false], [['POST', false], [method, true], ['PUT', true]]]),
    'conflicting tokens, ownership flags, types and reader links fail without replacing the verified original owner');
});

test('Safe limits launchers, Git discovery, and the private password snapshot', () => {
  // GIVEN trusted test tools, an owner-only password and a separate Git-backed state fixture.
  const f = fixture();
  const blocked = fixture();
  try {
    const python = spawnSync('which', ['python3'], { encoding: 'utf8' }).stdout.trim();
    const runnerBin = f.env.PATH.split(':')[0];
    const trustedCommand = "'" + python.replaceAll("'", "'\\''") + "'";
    writeFileSync(join(runnerBin, 'python3'), `#!/bin/bash\n[ "$1" = -I ] && [ "$2" = -S ] || exit 93\nexec ${trustedCommand} "$@"\n`, { mode: 0o700 });
    const workspaceBin = join(f.project, 'bin'); mkdirSync(workspaceBin);
    writeFileSync(join(workspaceBin, 'python3'), '#!/bin/sh\nexit 99\n', { mode: 0o700 });
    const nested = join(f.project, 'nested'); mkdirSync(nested);
    mkdirSync(join(f.project, '.claude'));
    const linkedBin = join(f.root, 'linked-bin'); mkdirSync(linkedBin);
    symlinkSync(join(workspaceBin, 'python3'), join(linkedBin, 'python3'));
    const password = 'synthetic-visitor-pass';
    const source = join(f.root, 'visitor-proof.txt');
    writeFileSync(source, password + '\n', { mode: 0o600 });
    const gitRoot = process.platform === 'darwin' ? blocked.env.HOME : blocked.root;
    assert.equal(spawnSync('git', ['init', '-q', gitRoot]).status, 0, 'the restricted state fixture is in an actual local Git repository');
    // WHEN the user selects a valid password, a readable-by-others password, and a Git-backed state location.
    const options = [...publish.slice(0, 4), '--password-file', source, '--text', 'Fixture text'];
    const allowed = f.run(safe, options, { CLAUDE_PROJECT_DIR: '', PATH: `.:${linkedBin}:${workspaceBin}:${f.env.PATH}`,
      CHECK_PASSWORD: password, CHECK_ENV: '1', BREWPAGE_FIXTURE_AMBIENT: 'sentinel' }, nested);
    chmodSync(source, 0o644);
    const unsafePassword = f.run(safe, options);
    const unsafeGit = blocked.run(safe, publish, { GIT_CEILING_DIRECTORIES: gitRoot });
    // THEN only the verified descriptor reaches a file-backed header and Git overrides cannot hide unsafe state.
    assert.deepEqual([allowed.status, unsafePassword.status, unsafeGit.status, f.traffic().length, blocked.traffic().length,
      [allowed, unsafePassword, unsafeGit].some(result => (result.stdout + result.stderr).includes(password))],
    [0, 1, 1, 1, 0, false], 'isolated tool startup and private inputs permit one bounded request');
  } finally { for (const item of [f, blocked]) rmSync(item.root, { recursive: true, force: true }); }
});

test('Safe reviews exact archive metadata and rejects credential-like or opaque bytes', () => {
  // GIVEN authorized public site content, a skipped multiline name and one reviewable asset.
  const f = fixture();
  try {
    const site = join(f.project, 'site'); mkdirSync(site);
    writeFileSync(join(site, 'index.html'), '<h1>Approved fixture</h1>');
    writeFileSync(join(site, 'token-guide.md'), 'Fixture documentation');
    writeFileSync(join(site, 'skipped\ntext.txt'), 'Fixture');
    const options = ['publish', 'site-dir', '--ns', 'fixture', '--password-file', '', '--path', site];
    const receipt = JSON.stringify({ ...JSON.parse(f.env.SYNTHETIC_RECEIPT), ownerLink: 'https://brewpage.app/api/sites/fixture/Receipt001',
      link: 'https://fixture-abcde12345.brewpage.app/', fileCount: 2 });
    const fixtureKey = 'synthetic-only-credential-101';
    // WHEN the user reviews a checked ZIP and separate selected inputs contain a fixture key or nested compression.
    const review = f.run(safe, options);
    const manifest = JSON.parse(review.stdout.split('\n')[1]);
    const digest = /^REVIEW_SHA256: ([a-f0-9]{64})$/m.exec(review.stdout)?.[1];
    assert.match(digest ?? '', /^[a-f0-9]{64}$/, 'verified manifest identifies exact review bytes');
    const inline = f.run(safe, [...publish.slice(0, -1), `{"api_key":"${fixtureKey}"}`]);
    const nested = join(site, 'opaque.txt'); writeFileSync(nested, gzipSync('Synthetic compressed file'));
    const opaque = f.run(safe, options); rmSync(nested);
    const captured = join(site, 'fixture.txt'); writeFileSync(captured, `{"api_key":"${fixtureKey}"}`);
    const credential = f.run(safe, options); rmSync(captured);
    const password = 'entry';
    const passwordFile = join(f.root, 'visitor-source.txt');
    writeFileSync(passwordFile, password + '\n', { mode: 0o600 });
    const protectedOptions = options.slice();
    protectedOptions[protectedOptions.indexOf('--password-file') + 1] = passwordFile;
    const sent = f.run(safe, [...protectedOptions, '--confirmed', '--review-sha256', digest], { SYNTHETIC_RECEIPT: receipt, CHECK_PASSWORD: password });
    // THEN only the reviewed clean ZIP reaches the API and arbitrary skipped text does not enter the manifest.
    assert.deepEqual([manifest.entries, manifest.entry, manifest.skipped, review.stdout.includes('text.txt'),
      [review, inline, opaque, credential, sent].map(r => r.status), f.traffic().length,
      [inline, opaque, credential].some(r => (r.stdout + r.stderr).includes(fixtureKey))],
    [['index.html', 'token-guide.md'], 'index.html', 1, false, [2, 1, 1, 1, 0], 1, false],
    'escaped manifest data and bounded content checks apply to the actual uploaded snapshot');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Safe verifies subdomain ownership before showing a reader or updating the bound item', () => {
  // GIVEN an owned subdomain receipt, a different item on the same namespace, and a foreign merge.
  const f = fixture();
  const foreign = fixture();
  try {
    const link = 'https://fixture-abcde12345.brewpage.app/';
    const response = { ...JSON.parse(f.env.SYNTHETIC_RECEIPT), link };
    const receipt = JSON.stringify(response);
    const mismatch = JSON.stringify({ isOwner: true, type: 'html', namespace: 'fixture', id: 'Different001' });
    const wrong = { SYNTHETIC_RECEIPT: receipt, HOST_CHECK: mismatch };
    const correct = { SYNTHETIC_RECEIPT: receipt };
    const initial = f.run(safe, publish, wrong);
    const blockedRecovery = f.run(safe, ['owner-recover'], wrong);
    const recovered = f.run(safe, ['owner-recover'], correct);
    const history = join(f.savedDir(), 'brewpage-history.md');
    const retained = readFileSync(history, 'utf8');
    const legacyAlias = retained.split('\n').filter(line => line.includes(link)).join('\n').replaceAll(link, 'https://example.test/legacy');
    writeFileSync(history, retained + legacyAlias + '\n');
    // WHEN the saved reader is used and a duplicate offers a reader without owner proof.
    const replacement = ['update', 'html', '--target', link, '--password-file', '', '--text', 'Updated fixture'];
    const blockedUpdate = f.run(safe, replacement, wrong);
    const updated = f.run(safe, replacement, correct);
    const merge = JSON.stringify({ ...response, ownerToken: null, result: { action: 'merged', extras: { isOwner: false } } });
    const noProof = foreign.run(safe, publish, { SYNTHETIC_RECEIPT: merge, TEST_HTTP_STATUS: '200' });
    const proven = foreign.run(safe, publish, { SYNTHETIC_RECEIPT: merge, TEST_HTTP_STATUS: '200', REDIRECT_URL: link });
    // THEN only a matching first-party item or public redirect can confirm the reader, with prior private data preserved.
    assert.deepEqual([[initial, blockedRecovery, recovered, blockedUpdate, updated, noProof, proven].map(r => [r.status, /^OK /m.test(r.stdout), disclosure(r)]),
      f.traffic().map(row => row[0]), foreign.traffic().length, readFileSync(history, 'utf8').includes(legacyAlias)],
    [[[1, false, [false, false]], [1, false, [false, false]], [0, false, [false, false]], [1, false, [false, false]],
      [0, true, [false, false]], [1, false, [false, false]], [0, true, [false, false]]], ['POST', 'PUT'], 2, true],
    'an inconsistent host cannot cause a wrong write and a legacy custom-host row does not poison a valid saved owner');
  } finally { for (const item of [f, foreign]) rmSync(item.root, { recursive: true, force: true }); }
});
