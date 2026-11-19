import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const traffic = join(root, 'traffic.jsonl');
  const env = { ...process.env, HOME: home, XDG_STATE_HOME: state, TMPDIR: folder('tmp'), CLAUDE_PROJECT_DIR: project,
    PATH: bin + ':' + process.env.PATH, TRAFFIC: traffic, SYNTHETIC_OWNER: syntheticToken, SYNTHETIC_RECEIPT: JSON.stringify({ link: reader, ownerLink: endpoint,
      id: 'Receipt001', namespace: 'fixture', ownerToken: syntheticToken, manageUrl: syntheticManagement }) };
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.WIRE_DIGEST) {
  const index = args.indexOf('--data-binary');
  if (index < 0) process.exit(95);
  const body = fs.readFileSync(args[index + 1].slice(1));
  fs.writeFileSync(process.env.WIRE_DIGEST, require('node:crypto').createHash('sha256').update(body).digest('hex'));
}
const method = args[args.indexOf('-X') + 1];
const receipt = JSON.parse(process.env.SYNTHETIC_RECEIPT);
const ownerHeader = args.find(arg => arg.startsWith('@') && arg.endsWith('owner-token.txt'));
const proof = ownerHeader ? fs.readFileSync(ownerHeader.slice(1), 'utf8').trim() : '';
const status = process.env.TEST_HTTP_STATUS || (method === 'PUT' ? '200' : '201');
const url = args.find(arg => arg.startsWith('https://'));
if (!url.startsWith('https://brewpage.app/api/')) process.exit(99);
fs.appendFileSync(process.env.TRAFFIC, JSON.stringify([method, url, proof === 'X-Owner-Token: ' + process.env.SYNTHETIC_OWNER]) + '\\n');
if (process.env.DAMAGE_HISTORY) {
  const root = process.env.DAMAGE_HISTORY;
  const slot = fs.readdirSync(root)[0];
  fs.chmodSync(root + '/' + slot + '/brewpage-history.md', 0o644);
}
const secretText = receipt.ownerToken + ' ' + receipt.manageUrl;
receipt.notices = [{ code: 'fixture', message: secretText }];
receipt.message = secretText;
process.stdout.write(JSON.stringify(receipt) + '\\nBP_HTTP_STATUS:' + status);
`, { mode: 0o700 });
  return { root, env, project, store, run: (variant, args, extra = {}) => spawnSync('bash', [join(repo, variant, 'scripts/brewpage-run.sh'), ...args],
    { cwd: project, env: { ...env, ...extra }, encoding: 'utf8', timeout: 10000 }),
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

test('regular skills retain standard private receipt delivery', () => {
  // GIVEN three regular skill distributions and isolated synthetic anonymous creates.
  const deliveries = regular.map(variant => {
    const f = fixture();
    try {
      // WHEN an explicit private receipt is requested on the regular runner.
      const result = f.run(variant, [...publish, '--no-save', '--private-output']);
      return [result.status, result.stdout.startsWith('NOTICE: owner receipt was not saved'), disclosure(result), f.traffic().length];
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN the normal opt-in channel can still deliver both owner capabilities.
  assert.deepEqual(deliveries, Array(3).fill([0, true, [true, true], 1]), 'regular anonymous private receipts retain the released behavior');
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
      const protectedReceipt = { origin: 'https://brewpage.app', ownerApi: 'https://brewpage.app/api/json/fixture/Receipt002', readerUrl: 'https://brewpage.app/fixture/Receipt002',
        ownerToken: syntheticToken, operationId: attempt.operationId, identity: { id: 'Receipt002', namespace: 'fixture' } };
      const contradictory = reuse ? { ...record, receipt: { ...protectedReceipt, ownerToken: 'B'.repeat(32) } } : { ...record, requestSha256: '0'.repeat(64) };
      // WHEN the runner receives mismatched and then verified outcomes in separate processes.
      writeFileSync(file, JSON.stringify(contradictory), { mode: 0o600 });
      const rejected = f.run(safe, ['owner-reconcile']);
      writeFileSync(file, JSON.stringify(reuse ? { ...record, receipt: protectedReceipt } : record));
      const reconciled = f.run(safe, ['owner-reconcile']);
      const fresh = f.run(safe, publish);
      // THEN neither failure nor recovery dispatches a repeat write and the exact proof stays private.
      return { setup, unknown: unknown.status, blocked: blocked.status, rejected: rejected.status, reconciled: reconciled.status, fresh: fresh.status,
        wire: [pending.request.payloadSha256, readFileSync(wireDigest, 'utf8')], permission: statSync(f.savedDir()).mode & 0o777,
        pending: [status.pending.length, attempt.receiptAvailable, existsSync(pendingPath), existsSync(file)],
        calls: [callsWhilePending, f.traffic().length, f.traffic().at(-1)[2]], leak: [unknown, blocked, rejected, reconciled, fresh].some(r => disclosure(r).some(Boolean)) };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  const digest = createHash('sha256').update('{\n  "label": "fixture"\n}\n').digest('hex');
  assert.deepEqual(cases, [false, true].map(reuse => ({ setup: 0, unknown: 1, blocked: 1, rejected: 1, reconciled: 0, fresh: 0,
    wire: [digest, digest], permission: 0o700, pending: [1, false, false, false], calls: [reuse ? 2 : 1, reuse ? 3 : 2, reuse], leak: false })),
  'every POST journals exact payload bytes, and only a verified request and owner match closes that attempt');
});

test('contradictory response authority never poisons saved proof', () => {
  // GIVEN a saved synthetic owner and possible invalid update receipt fields.
  const conflictingProof = 'B'.repeat(32);
  const cases = [
    [update, 'PUT', { ownerToken: conflictingProof }],
    [publish, 'POST', { result: { action: 'created', extras: { isOwner: false } } }],
    [publish, 'POST', { type: 'json' }],
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
      return [method, first.status, bad.status, recover.status, valid.status,
        (bad.stdout + bad.stderr).includes(conflictingProof), disclosure(bad), f.traffic().map(row => [row[0], row[2]])];
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN existing proof remains usable without importing any contradictory response.
  assert.deepEqual(decisions, cases.map(([, method]) => [method, 0, 1, 1, 0, false, [false, false], [['POST', false], [method, true], ['PUT', true]]]),
    'conflicting tokens, ownership flags and types are rejected without replacing the verified original owner');
});
