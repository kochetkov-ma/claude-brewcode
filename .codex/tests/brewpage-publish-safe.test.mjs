import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
    PATH: bin + ':' + process.env.PATH, TRAFFIC: traffic, SYNTHETIC_RECEIPT: JSON.stringify({ link: reader, ownerLink: endpoint,
      id: 'Receipt001', namespace: 'fixture', ownerToken: syntheticToken, manageUrl: syntheticManagement }) };
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const method = args[args.indexOf('-X') + 1];
const receipt = JSON.parse(process.env.SYNTHETIC_RECEIPT);
const ownerHeader = args.find(arg => arg.startsWith('@') && arg.endsWith('owner-token.txt'));
const proof = ownerHeader ? fs.readFileSync(ownerHeader.slice(1), 'utf8').trim() : '';
const status = process.env.TEST_HTTP_STATUS || (method === 'PUT' ? '200' : '201');
const url = args.find(arg => arg.startsWith('https://'));
if (!url.startsWith('https://brewpage.app/api/')) process.exit(99);
fs.appendFileSync(process.env.TRAFFIC, JSON.stringify([method, url, proof === 'X-Owner-Token: ' + receipt.ownerToken]) + '\\n');
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
