#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const RUNBOOK = join(HERE, '..', 'assets', 'INSTALL.md');
const HOOK = join(HERE, '..', 'assets', 'agent-router.mjs');
const SKILL = join(HERE, '..', 'SKILL.md');
const PORTABLE = '${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs';
// What a 5.6.0-6.4.0 strict install pinned; today ANY explicit tier-2 model is drift.
const LEGACY_PINNED_MODEL = 'claude-haiku-4-5-20251001';

// Mirrors the hook's per-project state dir name: p-<sha1(real root)[0..16]>.
function stateDirName(root) {
  return `p-${createHash('sha1').update(realpathSync(root)).digest('hex').slice(0, 16)}`;
}

function fencedBlockAfter(source, marker) {
  const markerAt = source.indexOf(marker);
  assert.equal(markerAt >= 0, true, `runbook must contain ${marker}`);
  const start = source.indexOf('```\n', markerAt);
  assert.equal(start >= 0, true, `runbook must fence ${marker}`);
  const end = source.indexOf('\n```', start + 4);
  assert.equal(end >= 0, true, `runbook must close ${marker}`);
  return source.slice(start + 4, end);
}

function fencedBashBlockAfter(source, marker) {
  const markerAt = source.indexOf(marker);
  assert.equal(markerAt >= 0, true, `skill must contain ${marker}`);
  const start = source.indexOf('```bash\n', markerAt);
  assert.equal(start >= 0, true, `skill must fence ${marker}`);
  const end = source.indexOf('\n```', start + 8);
  assert.equal(end >= 0, true, `skill must close ${marker}`);
  return source.slice(start + 8, end);
}

const base = mkdtempSync(join(tmpdir(), 'router-install-'));
try {
  // GIVEN: project settings with a legacy router handler sharing an entry with a foreign handler.
  const project = join(base, 'moved-checkout');
  const settingsPath = join(project, '.claude', 'settings.json');
  mkdirSync(join(project, '.claude'), { recursive: true });
  const foreignHandler = { type: 'command', command: 'node', args: ['/foreign/co-handler.mjs'], timeout: 4 };
  const foreign = { matcher: 'Read', hooks: [{ type: 'command', command: 'node', args: ['/foreign/keep.mjs'], timeout: 4 }] };
  writeFileSync(settingsPath, JSON.stringify({ hooks: { PreToolUse: [
    { matcher: 'Agent', hooks: [
      { type: 'command', command: 'node', args: ['/old/checkout/.claude/hooks/agent-router.mjs'], timeout: 5 },
      foreignHandler,
    ] },
    foreign,
  ] } }, null, 2));
  const block = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), '**EXECUTE** merge settings.');
  const env = { ...process.env, ROOT: project, RUNBOOK, LEVEL: 'fast' };

  // WHEN: the canonical project merge runs twice.
  const first = spawnSync('bash', ['-c', block], { encoding: 'utf8', env, timeout: 30000 });
  const firstBytes = readFileSync(settingsPath, 'utf8');
  const second = spawnSync('bash', ['-c', block], { encoding: 'utf8', env, timeout: 30000 });
  const secondBytes = readFileSync(settingsPath, 'utf8');
  const parsed = JSON.parse(secondBytes);
  const handlers = Object.values(parsed.hooks).flat().flatMap(entry => entry.hooks || []);
  const args = handlers.flatMap(handler => handler.args || []);

  // THEN: the portable arg replaces the legacy path, foreign hooks survive, and replay is byte-idempotent.
  assert.equal(first.status, 0, 'first router merge must exit successfully');
  assert.equal(second.status, 0, 'second router merge must exit successfully');
  assert.equal(args.filter(arg => arg === PORTABLE).length, 1, 'router must use one portable project arg');
  assert.equal(args.some(arg => arg.startsWith('/old/checkout/')), false, 'legacy absolute checkout arg must be removed');
  assert.deepEqual(
    parsed.hooks.PreToolUse.find(entry => (entry.hooks || []).some(handler => (handler.args || []).includes('/foreign/co-handler.mjs')))?.hooks,
    [foreignHandler],
    'install must preserve the foreign co-handler inside a mixed matcher entry',
  );
  assert.deepEqual(parsed.hooks.PreToolUse.find(entry => entry.matcher === 'Read'), foreign, 'foreign hook entry must remain byte-equivalent as JSON');
  assert.equal(secondBytes, firstBytes, 'repeated project merge must be byte-idempotent');

  // GIVEN: the installed project has only the desired portable tier-1 entry.
  const skill = readFileSync(SKILL, 'utf8');
  const statusBlock = fencedBashBlockAfter(skill, '## Step 1 — STATUS FIRST, always');
  const statusEnv = { ...process.env, HOME: join(base, 'home'), CLAUDE_PROJECT_DIR: '', CLAUDE_SKILL_DIR: join(HERE, '..'), CLAUDE_PLUGIN_ROOT: join(HERE, '..', '..', '..') };
  const nested = join(project, 'packages', 'fixture', 'deep');
  mkdirSync(nested, { recursive: true });

  // WHEN: the canonical status probe runs from a nested cwd against portable settings.
  const portableStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: it resolves the owning project and recognizes the exact tier-1 entry.
  assert.equal(portableStatus.status, 0, 'router status must exit successfully');
  assert.equal(portableStatus.stdout.includes(`project_root=${realpathSync(project)} root_resolved=yes`), true, 'router status must resolve project state above a nested cwd');
  assert.equal(portableStatus.stdout.includes('tier1_refs=1 legacy_refs=0 tier2_refs=0 settings_valid=yes'), true, 'router status must recognize the exact portable tier-1 tuple');

  // GIVEN: a legacy absolute router entry appears beside the portable entry.
  parsed.hooks.PreToolUse.unshift({ matcher: 'Agent', hooks: [{ type: 'command', command: 'node', args: ['/legacy/.claude/hooks/agent-router.mjs'], timeout: 5 }] });
  writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));

  // WHEN: status runs again.
  const legacyStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: it keeps the portable count and exposes the legacy entry separately.
  assert.equal(legacyStatus.status, 0, 'router status with a legacy path must exit successfully');
  assert.equal(legacyStatus.stdout.includes('tier1_refs=1 legacy_refs=1 tier2_refs=0 settings_valid=yes'), true, 'router status must recognize a legacy absolute project arg');

  // GIVEN: portable tier 1 and the tier-2 marker are registered under PostToolUse/Read.
  writeFileSync(settingsPath, JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Read', hooks: [
    { type: 'command', command: 'node', args: [PORTABLE], timeout: 5 },
    { type: 'agent', prompt: 'judge', statusMessage: 'agent-router: checking agent fit' },
  ] }] } }, null, 2));

  // WHEN: status validates the full registration tuples.
  const miswiredStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: matching markers under the wrong event and matcher are not reported as effective.
  assert.equal(miswiredStatus.status, 0, 'router status with misplaced handlers must exit successfully');
  assert.equal(miswiredStatus.stdout.includes('tier1_refs=0 legacy_refs=2 tier2_refs=0 settings_valid=yes'), true, 'router status must reject PostToolUse/Read registrations');

  const judgePrompt = readFileSync(join(HERE, '..', 'assets', 'judge-prompt.md'), 'utf8');
  const exactTier1 = { type: 'command', command: 'node', args: [PORTABLE], timeout: 5 };
  const exactTier2 = {
    type: 'agent',
    prompt: judgePrompt,
    timeout: 30,
    statusMessage: 'agent-router: checking agent fit',
  };
  const canonicalStrict = [
    { matcher: 'Agent', hooks: [exactTier1] },
    { matcher: 'Agent', hooks: [exactTier2] },
    { matcher: 'StructuredOutput', hooks: [exactTier1] },
  ];
  const writeRouterSettings = (tier1, tier2) => writeFileSync(settingsPath, JSON.stringify({ hooks: {
    PreToolUse: [
      { matcher: 'Agent', hooks: [tier1] },
      ...(tier2 ? [{ matcher: 'Agent', hooks: [tier2] }] : []),
    ],
  } }, null, 2));
  const probe = () => {
    const result = spawnSync(process.execPath, [HOOK, '--probe', settingsPath], { encoding: 'utf8', timeout: 30000 });
    return { stdout: result.stdout, stderr: result.stderr, status: result.status };
  };

  // GIVEN: a 5.6.0-6.4.0 strict install: absolute tier-1 path, tier 2 pinned to a dated model id.
  writeRouterSettings(
    { type: 'command', command: 'node', args: ['/old/checkout/.claude/hooks/agent-router.mjs'], timeout: 5 },
    { ...exactTier2, prompt: 'old judge prompt', model: LEGACY_PINNED_MODEL },
  );

  // WHEN: the probe reads it, then the canonical merge replays at strict and the probe reads again.
  const legacyProbe = probe();
  const strictMerge = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...env, LEVEL: 'strict' }, timeout: 30000 });
  const strictSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const strictProbe = probe();

  // THEN: both old handlers are drift; upgrade writes the three exact entries, tier 2 without a model key.
  assert.deepEqual(legacyProbe, { stdout: '0|2|0|0|yes\n', stderr: '', status: 0 }, 'probe must report a pinned-model tier 2 and an absolute tier-1 path as legacy');
  assert.equal(strictMerge.status, 0, 'strict merge over a legacy install must exit successfully');
  assert.deepEqual(strictSettings, { hooks: { PreToolUse: canonicalStrict } }, 'strict merge must write tier 1, a model-less tier 2 and the heartbeat, replacing the legacy handlers');
  assert.deepEqual(strictProbe, { stdout: '1|0|1|1|yes\n', stderr: '', status: 0 }, 'probe must accept exactly what the installer writes at strict');

  // WHEN: the merge replays at fast.
  const fastMerge = spawnSync('bash', ['-c', block], { encoding: 'utf8', env, timeout: 30000 });
  const fastSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const fastProbe = probe();

  // THEN: tier 2 and the heartbeat are gone together.
  assert.equal(fastMerge.status, 0, 'fast merge over a strict install must exit successfully');
  assert.deepEqual(fastSettings, { hooks: { PreToolUse: [canonicalStrict[0]] } }, 'fast merge must leave the tier-1 entry only');
  assert.deepEqual(fastProbe, { stdout: '1|0|0|0|yes\n', stderr: '', status: 0 }, 'probe must report tier 1 only at fast');

  // GIVEN: the exact tier-1 handler is duplicated.
  writeFileSync(settingsPath, JSON.stringify({ hooks: { PreToolUse: [
    { matcher: 'Agent', hooks: [exactTier1] },
    { matcher: 'Agent', hooks: [exactTier1] },
  ] } }, null, 2));

  // WHEN: status counts exact registrations without collapsing duplicates.
  const duplicateTier1Status = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: the duplicate is visible and therefore non-effective under the documented contract.
  assert.equal(duplicateTier1Status.status, 0, 'router status with duplicate tier 1 must exit successfully');
  assert.equal(duplicateTier1Status.stdout.includes('tier1_refs=2 legacy_refs=0 tier2_refs=0 settings_valid=yes'), true, 'router status must expose duplicate exact tier-1 handlers');

  for (const [name, tier1, tier2, expected] of [
    ['tier1Timeout', { ...exactTier1, timeout: 4 }, null, '0|1|0|0|yes\n'],
    ['tier2EmptyPrompt', exactTier1, { ...exactTier2, prompt: '' }, '1|1|0|0|yes\n'],
    ['tier2WrongPrompt', exactTier1, { ...exactTier2, prompt: `${judgePrompt}\nstale` }, '1|1|0|0|yes\n'],
    ['tier2ExplicitModel', exactTier1, { ...exactTier2, model: LEGACY_PINNED_MODEL }, '1|1|0|0|yes\n'],
    ['tier2WrongTimeout', exactTier1, { ...exactTier2, timeout: 29 }, '1|1|0|0|yes\n'],
    ['tier2WrongStatus', exactTier1, { ...exactTier2, statusMessage: 'agent-router: stale status' }, '1|1|0|0|yes\n'],
  ]) {
    // GIVEN: one owned handler differs from its canonical full identity.
    writeRouterSettings(tier1, tier2);

    // WHEN: the probe validates the malformed registration.
    const result = probe();

    // THEN: the malformed handler is legacy and cannot count as effective.
    assert.deepEqual(result, { stdout: expected, stderr: '', status: 0 }, `${name} must be surfaced as a non-effective owned handler`);
  }

  // GIVEN: settings.json that does not parse.
  writeFileSync(settingsPath, '{ "hooks": ');

  // WHEN: the probe reads it.
  const brokenProbe = probe();

  // THEN: nothing is counted and the file is reported invalid.
  assert.deepEqual(brokenProbe, { stdout: '0|0|0|0|no\n', stderr: '', status: 0 }, 'probe must report unparsable settings as invalid');

  // GIVEN: uninstall sees tier 1, tier 2, the heartbeat, and a foreign handler sharing the tier entry.
  writeFileSync(settingsPath, JSON.stringify({ hooks: { PreToolUse: [
    { matcher: 'Agent', hooks: [exactTier1, exactTier2, foreignHandler] },
    canonicalStrict[2],
  ] } }, null, 2));
  const uninstallBlock = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), '## UNINSTALL  (settings entries + hook file; config and markers kept)');

  // WHEN: the canonical uninstall block runs.
  const uninstall = spawnSync('bash', ['-c', uninstallBlock], { encoding: 'utf8', env: { ...process.env, ROOT: project }, timeout: 30000 });
  const uninstalled = JSON.parse(readFileSync(settingsPath, 'utf8'));

  // THEN: only owned handlers disappear and the foreign co-handler keeps its matcher entry.
  assert.equal(uninstall.status, 0, 'router uninstall must exit successfully');
  assert.deepEqual(uninstalled, { hooks: { PreToolUse: [{ matcher: 'Agent', hooks: [foreignHandler] }] } }, 'router uninstall must preserve a mixed entry foreign co-handler exactly');

  // GIVEN: two projects on one TMPDIR, each with router state; the first also has a config.
  const stateTmp = join(base, 'state-tmp');
  const other = join(base, 'other-project');
  const stateEnv = { ...process.env, TMPDIR: stateTmp, TMP: stateTmp, TEMP: stateTmp, CLAUDE_PROJECT_DIR: '' };
  const configPath = join(project, '.claude', 'brewtools', 'agent-router.json');
  mkdirSync(stateTmp, { recursive: true });
  mkdirSync(join(project, '.claude', 'brewtools'), { recursive: true });
  mkdirSync(join(other, '.claude', 'brewtools'), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ level: 'strict' }));
  writeFileSync(join(other, '.claude', 'brewtools', 'agent-router.json'), JSON.stringify({ level: 'strict' }));
  for (const cwd of [project, other]) {
    spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ session_id: 'S1', cwd, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: {} }), encoding: 'utf8', env: stateEnv, timeout: 30000 });
  }
  const stateRoot = join(stateTmp, 'brewtools-agent-router');
  const stateBefore = readdirSync(stateRoot).sort();
  const purgeBlock = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), "## PURGE  (uninstall + config + this project's tmp state)");

  // WHEN: the canonical purge block runs for the first project.
  const purge = spawnSync('bash', ['-c', purgeBlock], { encoding: 'utf8', env: { ...stateEnv, ROOT: project, RUNBOOK }, timeout: 30000 });

  // THEN: its config and its own state dir are gone; the other project's state dir is untouched.
  assert.equal(purge.status, 0, 'router purge must exit successfully');
  assert.deepEqual(stateBefore, [stateDirName(project), stateDirName(other)].sort(), 'both projects must own a separate state dir before purge');
  assert.deepEqual(
    { config: existsSync(configPath), state: readdirSync(stateRoot) },
    { config: false, state: [stateDirName(other)] },
    'router purge must remove only this project config and state dir',
  );
} finally {
  rmSync(base, { recursive: true, force: true });
}

process.stdout.write('agent-router installer tests passed\n');
