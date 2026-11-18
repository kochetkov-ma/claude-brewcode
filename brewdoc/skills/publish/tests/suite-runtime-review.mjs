#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scripts = join(dirname(fileURLToPath(import.meta.url)), '../scripts');
const token = 'A'.repeat(32);
const reader = 'https://brewpage.app/fixture/Receipt001';
const ownerApi = 'https://brewpage.app/api/html/fixture/Receipt001';
const manageUrl = 'https://brewpage.app/manage/receipt#k=synthetic-capability';
const receipt = { link: reader, ownerLink: ownerApi, ownerToken: token, manageUrl, id: 'Receipt001', namespace: 'fixture', visibilityNotice: 'Unlisted fixture.', notices: [{ code: 'fixture-notice', message: 'Keep this visible.' }] };
const python = spawnSync('which', ['python3'], { encoding: 'utf8' }).stdout.trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'publish-runtime-review-'));
  const bin = join(root, 'bin'); mkdirSync(bin);
  const tmp = join(root, 'tmp'); mkdirSync(tmp);
  const traffic = join(root, 'traffic.jsonl');
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, TMPDIR: tmp, PATH: bin + ':' + process.env.PATH, TRAFFIC: traffic, EFFECT: join(root, 'effect.json'), OBSERVATION: join(root, 'first-party-observation.json'), RECEIPT: JSON.stringify(receipt) };
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),method=args[args.indexOf('-X')+1],url=args.find(x=>x.startsWith('https://'));
const proof=args.filter((v,i)=>args[i-1]==='-H'&&v.startsWith('@')).map(v=>fs.readFileSync(v.slice(1),'utf8'));
fs.appendFileSync(process.env.TRAFFIC,JSON.stringify({method,url,proof,args})+'\\n');
if(process.env.LOST_REPLY){
 const upload=args.find(value=>value.startsWith('file=@'));
 const payload=fs.readFileSync(args.includes('-d')?args[args.indexOf('-d')+1].slice(1):JSON.parse(upload.slice(6)));
 fs.writeFileSync(process.env.OBSERVATION,JSON.stringify({applied:process.env.LOST_REPLY==='created',endpoint:url,payloadSha256:require('node:crypto').createHash('sha256').update(payload).digest('hex'),receipt:process.env.LOST_REPLY==='created'?JSON.parse(process.env.RECEIPT):null}),{mode:0o600});
 process.exit(28);
}
if(method==='PUT'&&new URL(url).pathname.startsWith('/api/html/')){
 const payload=JSON.parse(fs.readFileSync(args[args.indexOf('-d')+1].slice(1),'utf8'));
 fs.writeFileSync(process.env.EFFECT,JSON.stringify({format:new URL(url).searchParams.get('format')||'markdown',content:payload.content}));
}
const status=process.env.HTTP_STATUS||(method==='GET'?'200':'201');
const data=Number(status)>=400?{status:Number(status),message:'Synthetic unavailable'}:method==='GET'?(url.endsWith('/api/limits')?{reach:process.env.PROFILE_REACH||'profile',customDomains:{enabled:true,limit:1}}:{entryFile:process.env.SITE_ENTRY||'landing.html'}):JSON.parse(process.env.RECEIPT);
process.stdout.write(JSON.stringify(data)+'\\nBP_HTTP_STATUS:'+status);
`, { mode: 0o700 });
  const run = (...args) => spawnSync('bash', [join(scripts, 'brewpage-run.sh'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
  const wire = () => readFileSync(traffic, 'utf8').trim().split('\n').map(JSON.parse);
  return { root, bin, tmp, traffic, env, run, wire, history: join(root, '.claude/brewpage-history.md') };
}

test('safe receipts retain exact private proof and legacy first-party ownership', () => {
  // GIVEN an isolated real runner, private history and deterministic response with a management capability.
  const f = fixture();
  try {
    const publish = ['publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', '<!doctype html><html><body>Fixture</body></html>'];
    // WHEN ordinary and explicitly owner-only outputs are requested, then old first-party row shapes are selected.
    const saved = f.run(...publish);
    const privateResult = f.run(...publish, '--private-output');
    const noSave = f.run(...publish, '--no-save');
    const data = readFileSync(f.history, 'utf8');
    const shapes = [
      `| date | [https://owned.brewpage.app/](https://owned.brewpage.app/) | \`${token}\` | 15d | html |\n`,
      `| date | [https://owned.brewpage.app/](https://owned.brewpage.app/) | \`${token}\` | 15d | html |  | \`{}\` |\n`,
      `| date | [${reader}](${reader}) | \`${token}\` | 15d | html |\n`,
    ];
    const selected = shapes.map(row => {
      writeFileSync(f.history, row, { mode: 0o600 });
      const result = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'next');
      return [result.status, f.wire().at(-1).proof, readFileSync(f.history, 'utf8').startsWith(row)];
    });
    // THEN ordinary output stays reader-safe, the distinct capability is retained and every old row reuses its owner.
    assert.deepEqual({ saved: [saved.status, saved.stdout], private: [privateResult.status, privateResult.stdout.includes('MANAGE: ' + manageUrl)],
      refused: [noSave.status, /requires --private-output/.test(noSave.stdout)], proof: [data.includes('`' + token + '`'), data.includes(manageUrl)], selected },
    { saved: [0, `OK ${reader}\nOWNER TOKEN SAVED\nVISIBILITY: Unlisted fixture.\nNOTICE: Keep this visible.\n`], private: [0, true], refused: [1, true], proof: [true, true],
      selected: shapes.map(() => [0, ['X-Owner-Token: ' + token + '\n'], true]) }, 'private capabilities survive while ordinary transcripts and old owner identity remain safe');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('an independently reconciled lost response closes only its operation without replaying a write', () => {
  // GIVEN a lost response and independent controlled first-party evidence of no write or an owned publication.
  const outcomes = [{ outcome: 'no-write', kind: 'html' }, { outcome: 'publication-owned', kind: 'html' },
    { outcome: 'publication-owned', kind: 'file', routing: 'files-to-html' }].map(({ outcome, kind, routing }) => {
    const f = fixture();
    try {
      const material = '<!doctype html><p>Original supplied content</p>';
      const input = join(f.root, 'supplied-page'); writeFileSync(input, material);
      const args = ['publish', kind, '--ns', 'fixture', '--password-file', '', ...(kind === 'file' ? ['--path', input] : ['--text', material])];
      f.env.LOST_REPLY = outcome === 'publication-owned' ? 'created' : 'not-created';
      const lost = f.run(...args);
      const status = f.run('owner-pending', '--private-output');
      const pending = JSON.parse(status.stdout).pending;
      assert.deepEqual([lost.status, status.status, pending.length], [1, 0, 1], 'one failed response has exactly one privately identified pending request');
      assert.deepEqual([pending[0].receiptAvailable, pending[0].localBinding], [false, 'recorded'], 'private status distinguishes an absent receipt from an available failed-save recovery');
      const entry = pending[0];
      const observed = JSON.parse(readFileSync(f.env.OBSERVATION, 'utf8'));
      assert.deepEqual([entry.request.endpoint, entry.request.payloadSha256, observed.applied], [observed.endpoint, observed.payloadSha256, outcome === 'publication-owned'], 'local fingerprint matches independent fixture observation, not a guessed reader address');
      const resolution = { schema: 'brewpage-reconciliation-v1', operationId: entry.operationId, outcome, request: entry.request,
        ...(routing ? { routing } : {}),
        evidence: { source: 'owner-verified-first-party', verifiedByOperator: true, reference: 'controlled-fixture/original-operation' },
        ...(outcome === 'publication-owned' ? { receipt: { origin: 'https://brewpage.app', ownerApi, readerUrl: reader, ownerToken: observed.receipt.ownerToken,
          id: 'Receipt001', namespace: 'fixture', ns: 'fixture', kind: 'html', type: 'html', isOwner: true, result: { isOwner: true, extras: { isOwner: true } },
          identity: { id: 'Receipt001', namespace: 'fixture', ns: 'fixture', kind: 'html', type: 'html' }, content: { isOwner: false, type: 'kv', identity: { ns: 'other' } }, manageUrl } } : {}) };
      const source = join(f.root, 'brewpage-reconciliation.json'); writeFileSync(source, JSON.stringify(resolution), { mode: 0o600 });
      // WHEN explicit private reconciliation records that finding, then a separately requested next publication begins.
      const reconciled = f.run('owner-reconcile', '--operation', entry.operationId, '--resolution-file', source, '--private-output');
      const after = f.run('owner-pending', '--private-output');
      const callsBeforeNext = f.wire().length;
      f.env.LOST_REPLY = '';
      const next = f.run(...args);
      const history = readFileSync(f.history, 'utf8');
      const records = history.split('\n').filter(line => line.startsWith('<!-- brewpage-resolution:')).map(line => JSON.parse(line.slice('<!-- brewpage-resolution:'.length, -4)));
      assert.match(records[0]?.resolutionSha256 ?? '', /^[a-f0-9]{64}$/, 'protected journal retains the exact external resolution digest');
      assert.deepEqual({ request: records[0].request, evidence: records[0].evidence }, { request: entry.request, evidence: resolution.evidence },
        'protected journal preserves the exact request and declared external provenance before clearing its fence');
      return { outcome, routing: records[0].routing ?? null, reconciliation: [reconciled.status, /did not authenticate/.test(reconciled.stdout), reconciled.stdout.includes(token)],
        after: JSON.parse(after.stdout), callsBeforeNext, next: [next.status, f.wire().length, f.wire().at(-1).proof],
        record: [records.length, records[0].operationId, records[0].outcome, records[0].verification, records[0].localRequestBound], capability: history.includes(manageUrl) };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN reconciliation itself sends nothing, retains provenance and reuses only an actually recovered owner.
  assert.deepEqual(outcomes.map(({ record, ...row }) => ({ ...row, record: [record[0], record[2], record[3], record[4]] })), [
    { outcome: 'no-write', routing: null, reconciliation: [0, true, false], after: { pending: [] }, callsBeforeNext: 1, next: [0, 2, []], record: [1, 'no-write', 'external-operator-attestation', true], capability: true },
    { outcome: 'publication-owned', routing: null, reconciliation: [0, true, false], after: { pending: [] }, callsBeforeNext: 1, next: [0, 2, ['X-Owner-Token: ' + token + '\n']], record: [1, 'publication-owned', 'external-operator-attestation', true], capability: true },
    { outcome: 'publication-owned', routing: 'files-to-html', reconciliation: [0, true, false], after: { pending: [] }, callsBeforeNext: 1, next: [0, 2, ['X-Owner-Token: ' + token + '\n']], record: [1, 'publication-owned', 'external-operator-attestation', true], capability: true },
  ], 'external findings close exact local fences without automatic retry, remint or invented service verification');
});

test('unresolved or mismatched findings cannot clear a marker and legacy closure preserves unrelated pending state', () => {
  // GIVEN a genuinely missing receipt, no recovered owner and a protected external-resolution input.
  const f = fixture();
  try {
    f.env.LOST_REPLY = 'not-created';
    const lost = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'Original');
    const status = f.run('owner-pending', '--private-output');
    const entries = JSON.parse(status.stdout).pending;
    assert.deepEqual([lost.status, status.status, entries.length], [1, 0, 1], 'negative fixtures begin with one witnessed lost-response operation');
    const original = entries[0];
    const before = readFileSync(f.history, 'utf8');
    const source = join(f.root, 'brewpage-reconciliation.json');
    const base = { schema: 'brewpage-reconciliation-v1', operationId: original.operationId, outcome: 'no-write', request: original.request,
      evidence: { source: 'owner-verified-first-party', verifiedByOperator: true, reference: 'controlled-fixture/definitive-result' } };
    const invalid = [ { ...base, outcome: 'unknown' }, { ...base, request: { ...base.request, payloadSha256: '0'.repeat(64) } },
      { ...base, evidence: { ...base.evidence, verifiedByOperator: false } }, token,
      { ...base, outcome: 'publication-owned', routing: 'files-to-html' },
      { ...base, outcome: 'publication-owned', receipt: { origin: 'https://brewpage.app', ownerApi, readerUrl: reader, ownerToken: token, identity: { id: 'Other001', namespace: 'fixture' } } },
      { ...base, outcome: 'publication-owned', receipt: { origin: 'https://brewpage.app', ownerApi, readerUrl: reader, ownerToken: token, result: { extras: { isOwner: false } } } },
      { ...base, outcome: 'publication-owned', receipt: { origin: 'https://brewpage.app', ownerApi, readerUrl: reader } } ];
    const owned = { origin: 'https://brewpage.app', ownerApi, readerUrl: reader, ownerToken: token };
    const flags = [false, null, 0, 1, 'false', 'true', [], {}];
    const locations = [flag => ({ isOwner: flag }), flag => ({ result: { isOwner: flag } }), flag => ({ result: { extras: { isOwner: flag } } })];
    invalid.push(...locations.flatMap(location => flags.map(flag => ({ ...base, outcome: 'publication-owned', receipt: { ...owned, ...location(flag) } }))));
    const identities = [{ kind: 'kv' }, { type: 'sites' }, { kind: 'html', type: 'json' }, { namespace: 'other' }, { ns: 'other' }, { id: 'Other001' },
      { kind: null }, { ns: null }, { kind: true }, { type: 1 }, { namespace: [] }];
    invalid.push(...identities.flatMap(identity => [{ ...base, outcome: 'publication-owned', receipt: { ...owned, identity } },
      { ...base, outcome: 'publication-owned', receipt: { ...owned, ...identity } }]));
    // WHEN incomplete evidence is rejected, then an explicitly externally bound legacy record is reconciled.
    const rejected = invalid.map(value => { writeFileSync(source, JSON.stringify(value), { mode: 0o600 }); const result = f.run('owner-reconcile', '--operation', original.operationId, '--resolution-file', source, '--private-output'); return [result.status, readFileSync(f.history, 'utf8')]; });
    assert.deepEqual(rejected, invalid.map(() => [1, before]), 'unknown outcomes, wrong payload, unverified assertions, raw keys and reader-only evidence leave bytes unchanged');
    const externalProof = join(f.root, 'external-owner-receipt.json');
    writeFileSync(externalProof, JSON.stringify({ origin: 'https://brewpage.app', ownerApi, readerUrl: reader, ownerToken: token, operationId: original.operationId }), { mode: 0o600 });
    const imported = f.run('owner-store', '--target', ownerApi, '--reader', reader, '--owner-token-file', externalProof);
    const afterImport = JSON.parse(f.run('owner-pending', '--private-output').stdout).pending;
    assert.deepEqual([imported.status, afterImport.map(row => row.operationId), f.wire().length], [0, [original.operationId], 1],
      'external proof import cannot bypass explicit request-bound reconciliation merely by carrying an operation ID');
    const other = 'f'.repeat(24);
    const legacy = readFileSync(f.history, 'utf8').split('\n').filter(line => !line.startsWith('<!-- brewpage-request:')).join('\n').replace('<!-- brewpage-owner-pending:' + original.operationId + ' -->', '<!-- brewpage-owner-pending -->') + '<!-- brewpage-owner-pending:' + other + ' -->\n';
    writeFileSync(f.history, legacy, { mode: 0o600 });
    const entry = JSON.parse(f.run('owner-pending', '--private-output').stdout).pending.find(row => row.operationId.startsWith('legacy-'));
    const external = { ...base, operationId: entry.operationId, binding: 'external-only' };
    writeFileSync(source, JSON.stringify(external), { mode: 0o600 });
    const missingFlag = f.run('owner-reconcile', '--operation', entry.operationId, '--resolution-file', source, '--private-output');
    const resolved = f.run('owner-reconcile', '--operation', entry.operationId, '--resolution-file', source, '--private-output', '--external-only');
    const remaining = JSON.parse(f.run('owner-pending', '--private-output').stdout).pending;
    const refused = f.run('preflight', 'file', '--path', source);
    const blocked = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'Still unresolved elsewhere');
    // THEN absence of a local witness is disclosed and unrelated pending operations remain protected.
    assert.deepEqual({ flags: [missingFlag.status, resolved.status, /no local request witness/.test(resolved.stdout)],
      remaining: remaining.map(row => [row.operationId, row.localBinding, row.receiptAvailable]), refusal: [refused.status, /reserved credential input/.test(refused.stdout)], blocked: blocked.status, calls: f.wire().length },
    { flags: [1, 0, true], remaining: [[other, 'unavailable', false]], refusal: [1, true], blocked: 1, calls: 1 },
    'legacy external attestation changes no unrelated row, performs no transport action and does not expose its protected evidence');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('uncertain creates retain their own pending state after an unrelated authorized success', () => {
  // GIVEN isolated first creates receiving actual definitive or uncertain HTTP statuses.
  const rows = [400, 503].map(status => {
    const f = fixture();
    try {
      const args = ['publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'fixture'];
      f.env.HTTP_STATUS = String(status);
      // WHEN an independently authorized later publication succeeds, then an unqualified new create is attempted.
      const first = f.run(...args);
      const proof = join(f.root, 'selected-owner.txt'); writeFileSync(proof, token + '\n', { mode: 0o600 });
      f.env.HTTP_STATUS = '201';
      const unrelated = f.run(...args, '--owner-token-file', proof);
      const next = f.run(...args);
      return { status, first: [first.status, /outcome unknown/.test(first.stdout)], unrelated: unrelated.status,
        next: next.status, pending: readFileSync(f.history, 'utf8').includes('<!-- brewpage-owner-pending:'), calls: f.wire().length };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN only definitive rejection clears its marker; an unrelated receipt cannot erase an unresolved operation.
  assert.deepEqual(rows, [
    { status: 400, first: [1, false], unrelated: 0, next: 0, pending: false, calls: 3 },
    { status: 503, first: [1, true], unrelated: 0, next: 1, pending: true, calls: 2 },
  ], 'actual status and operation-specific bookkeeping prevent an ambiguous create from silently replaying');
});

test('declined and failed saves retain identical reader facts and complete private recovery', () => {
  // GIVEN normal, explicitly private no-save and benign history-append failure fixtures.
  const rows = ['saved', 'no-save', 'append-failed'].map(mode => {
    const f = fixture();
    try {
      writeFileSync(join(f.bin, 'python3'), `#!/usr/bin/env node
const cp=require('node:child_process'),args=process.argv.slice(2);
if(process.env.FAIL_APPEND==='1'&&args[1]==='append')process.exit(1);
const stdio=['inherit','inherit','inherit'];
if(process.env.BREWPAGE_HISTORY_LOCK_FD){for(let i=3;i<9;i++)stdio.push('ignore');stdio.push(9);}
const result=cp.spawnSync(${JSON.stringify(python)},args,{stdio});process.exit(result.status??99);
`, { mode: 0o700 });
      f.env.FAIL_APPEND = mode === 'append-failed' ? '1' : '0';
      const flags = mode === 'no-save' ? ['--no-save', '--private-output'] : [];
      // WHEN one actual runner create receives the same typed receipt, regardless of the selected storage result.
      const result = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'fixture', ...flags);
      assert.equal(result.status, mode === 'append-failed' ? 1 : 0, 'benign dependency fixture reaches its intended save result: ' + result.stderr);
      const lookup = f.run('owner-recovery', '--private-output');
      assert.equal(lookup.status, mode === 'append-failed' ? 0 : 1, 'fresh private lookup reads only a pending workspace receipt');
      const paths = lookup.status === 0 ? [join(dirname(f.history), 'brewpage-recovery.json')] : [];
      const stored = paths.map(path => ({ mode: statSync(path).mode & 0o777, receipt: JSON.parse(lookup.stdout) }));
      stored.forEach(row => assert.match(row.receipt.operationId, /^[a-f0-9]{24}$/, 'protected receipt identifies its exact pending operation'));
      const expectedRecovery = { origin: 'https://brewpage.app', ownerApi, readerUrl: reader, ownerToken: token,
        operationId: stored[0]?.receipt.operationId, identity: { id: 'Receipt001', namespace: 'fixture', type: null, routingCohort: null,
          deliveryMode: null, modeLocked: null, hostingVersion: null, managementLink: null, manageUrl, entryFile: null, createdAt: null, expiresAt: null }, manageUrl };
      assert.deepEqual(stored, mode === 'append-failed' ? [{ mode: 0o600, receipt: expectedRecovery }] : [], 'protected fallback retains the full typed receipt with verified private storage');
      const privateReceipt = /^PRIVATE OWNER RECEIPT: (.+)$/m.exec(result.stdout)?.[1];
      const facts = result.stdout.split('\n').filter(line => /^(OK |VISIBILITY:|NOTICE: Keep)/.test(line));
      const calls = f.wire().length;
      f.env.FAIL_APPEND = '0';
      const recovered = paths.map(path => {
        const restored = f.run('owner-store', '--target', ownerApi, '--reader', reader, '--owner-token-file', path);
        const pending = readFileSync(f.history, 'utf8').includes('<!-- brewpage-owner-pending:');
        const next = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'another explicitly requested item');
        assert.equal(next.status, 0, 'fresh-process publication reuses imported proof: ' + next.stdout + next.stderr);
        return [restored.status, restored.stdout, pending, next.status, f.wire().length, f.wire().at(-1).proof, readFileSync(f.history, 'utf8').includes(manageUrl)];
      });
      assert.deepEqual(recovered, mode === 'append-failed' ? [[0, 'OWNER TOKEN SAVED\n', false, 0, 2, ['X-Owner-Token: ' + token + '\n'], true]] : [],
        'exact protected recovery resolves its own pending marker and reuses the owner in a new process');
      return { mode, status: result.status, facts, calls,
        disclosed: result.stdout.includes(token) || result.stdout.includes(manageUrl) || result.stdout.includes(f.history) || paths.some(path => result.stdout.includes(path)),
        privateToken: privateReceipt ? JSON.parse(privateReceipt).ownerToken : '' };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  // THEN every confirmed result carries the same safe facts and only explicit private delivery carries its new proof.
  const facts = [`OK ${reader}`, 'VISIBILITY: Unlisted fixture.', 'NOTICE: Keep this visible.'];
  assert.deepEqual(rows, [
    { mode: 'saved', status: 0, facts, calls: 1, disclosed: false, privateToken: '' },
    { mode: 'no-save', status: 0, facts, calls: 1, disclosed: true, privateToken: token },
    { mode: 'append-failed', status: 1, facts, calls: 1, disclosed: false, privateToken: '' },
  ], 'storage outcomes cannot suppress consequential reader notices, expose ordinary proof or replay a create');
});

test('reviewed HTML, domain and complete site replacements preserve requested effects', () => {
  // GIVEN harmless HTML and a site containing supported binary/text assets, a custom entry and private fixture credentials.
  const f = fixture();
  try {
    const proof = join(f.root, 'selected-owner.txt'); writeFileSync(proof, token + '\n', { mode: 0o600 });
    const site = join(f.root, 'site'); mkdirSync(site);
    const sources = { 'index.html': '<h1>Index</h1>', 'landing.html': '<h1>Landing</h1>', 'pages/A & B.html': '<h1>Existing spaced entry</h1>', 'theme.yaml': 'colour: blue\n', 'sound.ogg': Buffer.from('OggS\0fixture'), 'image.tiff': Buffer.from('II*\0fixture') };
    Object.entries(sources).forEach(([name, bytes]) => { mkdirSync(dirname(join(site, name)), { recursive: true }); writeFileSync(join(site, name), bytes); });
    const secretDir = join(f.root, '.claude'); mkdirSync(secretDir);
    const secret = join(secretDir, '.credentials.json'); writeFileSync(secret, '{"fixture":true}');
    const html = '<!doctype html><html><body>Exact supplied HTML</body></html>';
    // WHEN the selected owner creates HTML, replaces the site without an entry change and preflights a reserved store.
    const created = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', html, '--owner-token-file', proof, '--domain', 'example.org');
    const converted = f.run('update', 'html', '--target', ownerApi, '--password-file', '', '--owner-token-file', proof, '--text', html);
    assert.deepEqual([converted.status, JSON.parse(readFileSync(f.env.EFFECT, 'utf8'))], [0, { format: 'html', content: html }],
      'explicit whole HTML replaces a stored Markdown fixture through the documented format query without repairing supplied bytes');
    f.env.PROFILE_REACH = 'token';
    const unlinked = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', html, '--owner-token-file', proof, '--domain', 'example.org');
    const preflight = f.run('preflight', 'site-dir', '--path', site);
    const zip = /^CHECKED_PATH: (.+)$/m.exec(preflight.stdout)?.[1];
    assert.match(zip ?? '', /\/site\.zip$/, 'complete benign site passes preflight');
    const names = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
    const replaced = f.run('update', 'site-dir', '--target', 'https://brewpage.app/api/sites/fixture/Receipt001', '--password-file', '', '--owner-token-file', proof, '--path', site);
    f.env.SITE_ENTRY = 'pages/A & B.html';
    const spaced = f.run('update', 'site-dir', '--target', 'https://brewpage.app/api/sites/fixture/Receipt001', '--password-file', '', '--owner-token-file', proof, '--path', site);
    const refused = f.run('preflight', 'file', '--path', secret);
    const requests = f.wire();
    // THEN each separately requested replacement retains all supported assets and its verified existing entry.
    assert.deepEqual({ results: [created.status, unlinked.status, preflight.status, replaced.status, spaced.status, refused.status], names: [names.status, names.stdout.trim().split('\n').sort()],
      mcpFiles: /^MCP_FILES_PATH:/m.test(preflight.stdout), wire: requests.map(({ method, url }) => [method, url]), reserved: /reserved credential input/.test(refused.stdout) },
    { results: [0, 1, 0, 0, 0, 1], names: [0, Object.keys(sources).sort()], mcpFiles: false,
      wire: [['GET', 'https://brewpage.app/api/limits'], ['POST', 'https://brewpage.app/api/html?ns=fixture&ttl=15&domain=example.org&format=html&verbatim=true'], ['PUT', ownerApi + '?format=html&verbatim=true'], ['GET', 'https://brewpage.app/api/limits'], ['GET', 'https://brewpage.app/api/sites/fixture/Receipt001'], ['PUT', 'https://brewpage.app/api/sites/fixture/Receipt001?entry=landing.html'], ['GET', 'https://brewpage.app/api/sites/fixture/Receipt001'], ['PUT', 'https://brewpage.app/api/sites/fixture/Receipt001?entry=pages%2FA%20%26%20B.html']], reserved: true },
    'safe route selection preserves explicit HTML and site bytes without a second create or reserved transfer');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('domain receipts preserve actual serving state, returned address and next check', () => {
  // GIVEN returned pending, active-suspended and actually serving domain states from the controlled API.
  const states = [
    { status: 'pending_dns', suspended: false, serving: false, url: null, nextCheckAt: '2026-11-18T12:30:00Z' },
    { status: 'active', suspended: true, serving: false, url: null, nextCheckAt: null },
    { status: 'active', suspended: false, serving: true, url: 'https://example.org/', nextCheckAt: '2026-11-18T13:00:00Z' },
  ];
  const rows = states.map(state => {
    const f = fixture();
    try {
      const domain = { hostname: 'example.org', ...state, problem: null, nextStep: 'Follow the returned records.', records: [{ type: 'TXT', name: '_brewpage.example.org', value: 'public-dns-fixture' }] };
      f.env.RECEIPT = JSON.stringify({ ...receipt, link: domain.url ?? reader, customDomain: domain });
      const proof = join(f.root, 'selected-owner.txt'); writeFileSync(proof, token + '\n', { mode: 0o600 });
      // WHEN one authorized domain create finishes THEN its reader-safe projection retains the API facts verbatim.
      const result = f.run('publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', '<!doctype html><p>Fixture</p>', '--owner-token-file', proof, '--domain', 'example.org');
      const projected = JSON.parse(/^DOMAIN: (.+)$/m.exec(result.stdout)?.[1] ?? 'null');
      return { status: result.status, domain: projected, reader: result.stdout.split('\n').find(line => line.startsWith('OK ')),
        writes: f.wire().filter(row => row.method === 'POST').length, privateOutput: result.stdout.includes(token) || result.stdout.includes(manageUrl) };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  });
  assert.deepEqual(rows, states.map(state => ({ status: 0,
    domain: { hostname: 'example.org', ...state, problem: null, nextStep: 'Follow the returned records.', records: [{ type: 'TXT', name: '_brewpage.example.org', value: 'public-dns-fixture' }] },
    reader: 'OK ' + (state.url ?? reader), writes: 1, privateOutput: false })),
  'status alone never substitutes for actual serving/url, and DNS scheduling survives ordinary receipt formatting');
});
