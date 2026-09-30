#!/usr/bin/env node
// Integrated context-slim recovery consumes text-guard ownership checkpoints.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contextGuard = join(here, '../scripts/context-guard.sh');
const contextScan = join(here, '../scripts/context-scan.sh');
const textGuard = join(here, '../../text-optimize/scripts/text-guard.sh');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'context-guard-')));
const homeFixture = join(base, 'home');
mkdirSync(homeFixture);
let count = 0;
function run(script, args, root, extraEnv = {}) {
  const result = spawnSync('bash', [script, ...args], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, HOME: homeFixture, CLAUDE_PROJECT_DIR: root, ...extraEnv },
  });
  return { status: result.status, stdout: result.stdout, output: `${result.stdout}${result.stderr}` };
}
function fixture(name) {
  const root = join(base, name);
  mkdirSync(root);
  const target = join(root, 'rules.md');
  const original = 'runtime 22; NEVER drop scripts/rollback.sh\n';
  writeFileSync(target, original);
  const runDir = join(base, `${name}-snapshot`);
  const snapshot = run(contextGuard, ['snapshot', '--allow-dirty', '--run-dir', runDir, target], root);
  assert.equal(snapshot.status, 0, 'GIVEN snapshot succeeds before optimizing draft');
  return { root, target, original, runDir };
}
try {
  // GIVEN owned draft proof, WHEN context verification fails, THEN recover and report exact bytes.
  {
    const f = fixture('owned');
    writeFileSync(f.target, 'runtime\n');
    assert.equal(run(textGuard, ['checkpoint', '--run-dir', f.runDir, f.target], f.root).status, 0,
      'owned draft producer emits matching checkpoint');
    const result = run(contextGuard, ['verify', '--run-dir', f.runDir, f.target], f.root);
    assert.equal(result.status, 1, 'failed semantic gate exits 1 after successful recovery');
    assert.equal(readFileSync(f.target, 'utf8'), f.original, 'owned draft recovers original bytes');
    assert.equal(result.output.includes('back at its pre-edit bytes'), true,
      'successful consumer recovery reports original bytes');
    count++;
  }
  // GIVEN later concurrent edits, WHEN rollback is requested, THEN preserve them and report refusal.
  {
    const f = fixture('concurrent');
    writeFileSync(f.target, 'runtime\n');
    assert.equal(run(textGuard, ['checkpoint', '--run-dir', f.runDir, f.target], f.root).status, 0,
      'checkpoint precedes concurrent writer');
    const current = 'runtime\nconcurrent user change\n';
    writeFileSync(f.target, current);
    const result = run(contextGuard, ['verify', '--run-dir', f.runDir, f.target], f.root);
    assert.equal(result.status, 1, 'failed gate with refused recovery exits 1');
    assert.equal(readFileSync(f.target, 'utf8'), current, 'consumer preserves all concurrent bytes');
    assert.equal(result.output.includes('recovery incomplete'), true, 'consumer reports incomplete recovery');
    assert.equal(result.output.includes('back at its pre-edit bytes'), false,
      'consumer never claims unsafe recovery succeeded');
    const rollback = run(contextGuard, ['rollback', '--run-dir', f.runDir], f.root);
    assert.equal(rollback.status, 1, 'explicit rollback still refuses changed draft');
    assert.equal(readFileSync(f.target, 'utf8'), current, 'explicit rollback preserves concurrent bytes');
    count++;
  }
  // GIVEN no ownership checkpoint, WHEN restoring, THEN refuse instead of overwriting current files.
  {
    const f = fixture('unproven');
    const current = 'unowned draft\n';
    writeFileSync(f.target, current);
    const result = run(contextGuard, ['restore', '--run-dir', f.runDir, f.target], f.root);
    assert.equal(result.status, 1, 'restore without ownership proof refuses with exit 1');
    assert.equal(readFileSync(f.target, 'utf8'), current, 'unproven draft bytes are preserved');
    assert.equal(result.output.includes('restoration refused'), true, 'consumer describes refused restoration');
    count++;
  }
  // GIVEN damaged snapshot evidence, WHEN restoring an owned draft, THEN refuse before writes.
  {
    const f = fixture('damaged');
    const current = 'optimizer draft\n';
    writeFileSync(f.target, current);
    assert.equal(run(textGuard, ['checkpoint', '--run-dir', f.runDir, f.target], f.root).status, 0,
      'owned draft proof exists before snapshot corruption');
    writeFileSync(join(f.runDir, 'orig/rules.md'), 'corrupt snapshot\n');
    const result = run(contextGuard, ['restore', '--run-dir', f.runDir, f.target], f.root);
    assert.equal(result.status, 1, 'corrupted snapshot refuses recovery');
    assert.equal(readFileSync(f.target, 'utf8'), current, 'corrupt evidence cannot overwrite draft');
    assert.equal(result.output.includes('SNAPSHOT CHECKSUM MISMATCH'), true,
      'consumer names damaged snapshot evidence');
    count++;
  }
  // GIVEN actual scanner failure WHEN partial JSON reaches state THEN no false savings or publication.
  {
    const root = join(base, 'scanner-state');
    const rules = join(root, '.claude/rules');
    mkdirSync(rules, { recursive: true });
    writeFileSync(join(rules, 'policy.md'), '# Policy\nNEVER change runtime 22 or scripts/rollback.sh.\n');
    const completeScan = run(contextScan, ['--root', root], root);
    assert.equal(completeScan.status, 0, 'GIVEN real scanner emits a complete baseline');
    const complete = JSON.parse(completeScan.stdout);
    assert.deepEqual(complete.scan_issues, [], 'GIVEN baseline contains complete discovery evidence');
    assert.deepEqual(complete.files.map(file => file.path), [join(rules, 'policy.md')],
      'GIVEN baseline measures the exact rule source');
    assert.equal(complete.totals.grand.tokens, Math.floor(Buffer.byteLength('# Policy\nNEVER change runtime 22 or scripts/rollback.sh.\n') / 4),
      'GIVEN complete baseline has the exact positive token proxy before simulated discovery loss');
    const before = join(base, 'complete-scan.json');
    writeFileSync(before, completeScan.stdout);
    const published = run(contextGuard, ['state', '--mode', 'slim', '--before', before, '--after', before], root);
    assert.equal(published.status, 0, 'GIVEN complete scans can publish ratchet state');
    const state = join(root, '.claude/brewtools/context-slim/state.json');
    const previous = readFileSync(state);
    assert.equal(JSON.parse(previous).achieved_ratio_pct, 0, 'GIVEN unchanged complete scans report zero savings');
    const findCommand = spawnSync('bash', ['-c', 'command -v find'], { encoding: 'utf8' });
    assert.equal(findCommand.status, 0, 'GIVEN real find exists for the controlled scanner fault');
    const bin = join(base, 'scanner-bin');
    mkdirSync(bin);
    const findShim = join(bin, 'find');
    writeFileSync(findShim, '#!/usr/bin/env bash\nif [ "$1" = "-L" ] && [ "$2" = "$SCAN_FAIL_PATH" ]; then echo "fixture discovery failed" >&2; exit 7; fi\nexec "$SCAN_REAL_FIND" "$@"\n');
    chmodSync(findShim, 0o755);
    const failedScan = run(contextScan, ['--root', root], root, {
      PATH: `${bin}:${process.env.PATH}`, SCAN_REAL_FIND: findCommand.stdout.trim(), SCAN_FAIL_PATH: rules,
    });
    assert.equal(failedScan.status, 2, 'WHEN actual scanner loses rule discovery THEN it exits incomplete');
    const partial = JSON.parse(failedScan.stdout);
    assert.deepEqual(partial.files, [], 'GIVEN the partial scan actually omits the measured rule');
    assert.equal(partial.totals.grand.tokens, 0, 'GIVEN partial totals would falsely suggest complete savings');
    assert.deepEqual(partial.scan_issues, [{ root: 'project', path: rules, kind: 'discovery-incomplete',
      exit_status: 7, detail: 'fixture discovery failed' }], 'GIVEN real producer records the discovery failure');
    const after = join(base, 'partial-scan.json');
    writeFileSync(after, failedScan.stdout);
    const rejectedAfter = run(contextGuard, ['state', '--mode', 'slim', '--before', before, '--after', after], root);
    assert.equal(rejectedAfter.status, 2, 'THEN state rejects actual partial remeasurement instead of publishing 100 percent savings');
    assert.equal(rejectedAfter.output.includes('STATE: written'), false, 'THEN rejected remeasurement reports no publication');
    assert.deepEqual(readFileSync(state), previous, 'THEN existing ratchet state remains byte-exact after partial remeasurement');
    const rejectedBefore = run(contextGuard, ['state', '--mode', 'slim', '--before', after, '--after', before], root);
    assert.equal(rejectedBefore.status, 2, 'THEN state also rejects partial baseline inventory');
    assert.deepEqual(readFileSync(state), previous, 'THEN invalid baseline preserves existing state bytes');
    const unpublished = join(root, 'unpublished/state.json');
    const rejectedFresh = run(contextGuard, ['state', '--mode', 'slim', '--before', before, '--after', after, '--out', unpublished], root);
    assert.equal(rejectedFresh.status, 2, 'THEN partial scans cannot create new state');
    assert.equal(existsSync(unpublished), false, 'THEN no false ratchet file is created');
    assert.equal(existsSync(dirname(unpublished)), false, 'THEN rejection occurs before state-directory creation');

    // GIVEN missing completeness evidence WHEN consuming saved JSON THEN require a fresh valid scan.
    const missingIssues = { ...complete };
    delete missingIssues.scan_issues;
    const missingPath = join(base, 'missing-scan-evidence.json');
    writeFileSync(missingPath, JSON.stringify(missingIssues));
    const rejectedMissing = run(contextGuard, ['state', '--mode', 'slim', '--before', missingPath, '--after', before], root);
    assert.equal(rejectedMissing.status, 2, 'THEN a missing scan_issues field cannot silently imply completeness');
    assert.deepEqual(readFileSync(state), previous, 'THEN missing evidence preserves prior state byte-exact');

    // GIVEN malformed completeness evidence WHEN consuming saved JSON THEN reject before publication.
    const malformedPath = join(base, 'malformed-scan-evidence.json');
    writeFileSync(malformedPath, JSON.stringify({ ...complete, scan_issues: {} }));
    const rejectedMalformed = run(contextGuard, ['state', '--mode', 'slim', '--before', before, '--after', malformedPath], root);
    assert.equal(rejectedMalformed.status, 2, 'THEN malformed scan_issues cannot publish a successful ratchet');
    assert.equal(rejectedMalformed.output.includes('STATE: written'), false, 'THEN malformed evidence reports no publication');
    assert.deepEqual(readFileSync(state), previous, 'THEN malformed evidence preserves prior state byte-exact');

    // GIVEN inconsistent totals WHEN metrics are consumed THEN reject unsupported savings.
    const badTotalsPath = join(base, 'inconsistent-scan-totals.json');
    writeFileSync(badTotalsPath, JSON.stringify({ ...complete, totals: { ...complete.totals,
      grand: { ...complete.totals.grand, tokens: 0 } } }));
    const rejectedTotals = run(contextGuard, ['state', '--mode', 'slim', '--before', before, '--after', badTotalsPath], root);
    assert.equal(rejectedTotals.status, 2, 'THEN scanner totals must equal the inventory tokens consumed');
    assert.deepEqual(readFileSync(state), previous, 'THEN inconsistent totals cannot replace prior state');
    count++;
  }
  console.log(`context-guard integrated recovery and scanner-state closure: ${count} scenarios passed`);
} finally {
  rmSync(base, { recursive: true, force: true });
}
