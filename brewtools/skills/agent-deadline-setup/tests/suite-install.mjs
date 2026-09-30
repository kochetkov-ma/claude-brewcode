#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const RUNBOOK = join(HERE, '..', 'assets', 'INSTALL.md');
const SKILL = join(HERE, '..', 'SKILL.md');
const PORTABLE = '${CLAUDE_PROJECT_DIR}/.claude/hooks/';

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

const base = mkdtempSync(join(tmpdir(), 'deadline-install-'));
try {
  // GIVEN: project settings with a legacy deadline handler sharing an entry with a foreign handler.
  const project = join(base, 'moved-checkout');
  const settingsPath = join(project, '.claude', 'settings.json');
  mkdirSync(join(project, '.claude'), { recursive: true });
  const foreignHandler = { type: 'command', command: 'node', args: ['/foreign/co-handler.mjs'], timeout: 4 };
  const foreign = { matcher: 'Read', hooks: [{ type: 'command', command: 'node', args: ['/foreign/keep.mjs'], timeout: 4 }] };
  writeFileSync(settingsPath, JSON.stringify({ hooks: { PreToolUse: [
    { matcher: '.*', hooks: [
      { type: 'command', command: 'node', args: ['/old/checkout/.claude/hooks/agent-deadline-guard.mjs'], timeout: 5 },
      foreignHandler,
    ] },
    foreign,
  ] } }, null, 2));
  const block = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), '**EXECUTE** merge settings (project)');

  // WHEN: the canonical project merge runs twice.
  const first = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...process.env, ROOT: project }, timeout: 30000 });
  const firstBytes = readFileSync(settingsPath, 'utf8');
  const second = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...process.env, ROOT: project }, timeout: 30000 });
  const secondBytes = readFileSync(settingsPath, 'utf8');
  const parsed = JSON.parse(secondBytes);
  const handlers = Object.values(parsed.hooks).flat().flatMap(entry => entry.hooks || []);
  const args = handlers.flatMap(handler => handler.args || []);

  // THEN: portable args replace the legacy path, foreign hooks survive, and replay is byte-idempotent.
  assert.equal(first.status, 0, 'first deadline merge must exit successfully');
  assert.equal(second.status, 0, 'second deadline merge must exit successfully');
  assert.equal(args.filter(arg => arg === `${PORTABLE}agent-deadline-guard.mjs`).length, 1, 'guard must use one portable project arg');
  assert.equal(args.filter(arg => arg === `${PORTABLE}agent-deadline-cleanup.mjs`).length, 1, 'cleanup must use one portable project arg');
  assert.equal(args.some(arg => arg.startsWith('/old/checkout/')), false, 'legacy absolute checkout arg must be removed');
  assert.deepEqual(
    parsed.hooks.PreToolUse.find(entry => (entry.hooks || []).some(handler => (handler.args || []).includes('/foreign/co-handler.mjs')))?.hooks,
    [foreignHandler],
    'install must preserve the foreign co-handler inside a mixed matcher entry',
  );
  assert.deepEqual(parsed.hooks.PreToolUse.find(entry => entry.matcher === 'Read'), foreign, 'foreign hook entry must remain byte-equivalent as JSON');
  assert.equal(secondBytes, firstBytes, 'repeated project merge must be byte-idempotent');

  // GIVEN: the installed project has only the two desired portable entries.
  const skill = readFileSync(SKILL, 'utf8');
  const statusBlock = fencedBashBlockAfter(skill, '## Step 1 — STATUS FIRST, always');
  const statusEnv = { ...process.env, HOME: join(base, 'home'), CLAUDE_PROJECT_DIR: '', CLAUDE_SKILL_DIR: join(HERE, '..') };
  const nested = join(project, 'packages', 'fixture', 'deep');
  mkdirSync(nested, { recursive: true });

  // WHEN: the canonical status probe runs from a nested cwd against portable settings.
  const portableStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: it resolves the owning project and recognizes one guard plus one cleanup.
  assert.equal(portableStatus.status, 0, 'deadline status must exit successfully');
  assert.equal(portableStatus.stdout.includes(`project_root=${realpathSync(project)} root_resolved=yes`), true, 'deadline status must resolve project state above a nested cwd');
  assert.equal(portableStatus.stdout.includes('project: guard=no cleanup=no guard_refs=1 cleanup_refs=1 legacy_refs=0 settings_valid=yes'), true, 'deadline status must recognize one exact guard and one exact cleanup');

  // GIVEN: real installed assets and metadata written by the authoritative config producer,
  // with an older release version but the current runbook content_version.
  const hooksDir = join(project, '.claude', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  for (const script of ['agent-deadline-guard.mjs', 'agent-deadline-cleanup.mjs']) {
    writeFileSync(join(hooksDir, script), readFileSync(join(HERE, '..', 'assets', script)));
  }
  const configPath = join(project, '.claude', 'agent-deadline.json');
  const configBlock = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), '**EXECUTE** config write');
  const configWrite = spawnSync('bash', ['-c', configBlock], { encoding: 'utf8', env: { ...statusEnv, ROOT: project, RUNBOOK, MINUTES: '20', OVERRIDES: '{}', PLUGIN_VERSION: '1.0.0' }, timeout: 30000 });
  assert.equal(configWrite.status, 0, `authoritative deadline producer must write current CV: ${configWrite.stderr}`);
  const currentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(currentConfig.version, '1.0.0', 'fixture release provenance is older than the installed plugin');
  const settingsBeforeProbe = readFileSync(settingsPath, 'utf8');

  // WHEN: the actual skill probe reads producer-shaped installation metadata.
  const currentContent = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: matching CVs remain current despite older release provenance; status is read-only.
  assert.equal(currentContent.status, 0, 'deadline metadata status exits successfully');
  assert.match(currentContent.stdout, /project:.*config_version=1\.0\.0.*content_state=current/, 'matching installed content must not trigger an upgrade for release drift');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBeforeProbe, 'current status preserves all foreign settings byte-for-byte');

  // GIVEN: the producer-shaped config has a valid but older content version.
  writeFileSync(configPath, JSON.stringify({ ...currentConfig, content_version: '0.0.1' }));
  // WHEN: the canonical probe compares content metadata.
  const staleContent = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });
  // THEN: real content drift is stale, without touching settings.
  assert.equal(staleContent.status, 0, 'stale deadline metadata remains a readable status');
  assert.match(staleContent.stdout, /project:.*content_state=stale/, 'changed config content version reports stale');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBeforeProbe, 'stale status preserves foreign settings');

  // GIVEN: current config metadata but a changed installed cleanup hook CV.
  writeFileSync(configPath, JSON.stringify(currentConfig));
  const cleanupPath = join(hooksDir, 'agent-deadline-cleanup.mjs');
  const cleanupBytes = readFileSync(cleanupPath, 'utf8');
  writeFileSync(cleanupPath, cleanupBytes.replace(/content_version=[0-9.]+/, 'content_version=0.0.1'));
  // WHEN: status compares each installed hook with its own source asset.
  const staleHook = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });
  // THEN: the secondary hook cannot hide behind current config/guard metadata.
  assert.equal(staleHook.status, 0, 'secondary hook CV remains readable');
  assert.match(staleHook.stdout, /project:.*content_state=stale/, 'changed cleanup hook CV reports stale');
  assert.match(staleHook.stdout, /content_findings=agent-deadline-cleanup\.mjs:0\.0\.1->[0-9]+\.[0-9]+\.[0-9]+/, 'status names the stale secondary hook and both CVs');
  writeFileSync(cleanupPath, cleanupBytes);

  for (const [label, contentVersion] of [['missing', undefined], ['malformed', 'not-a-version']]) {
    // GIVEN: installed components with missing/malformed config CV.
    writeFileSync(configPath, JSON.stringify({ ...currentConfig, content_version: contentVersion }));
    // WHEN: status reads incomplete metadata.
    const partial = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });
    // THEN: no release-version fallback can manufacture a current result.
    assert.equal(partial.status, 0, `${label} deadline CV is reported without aborting`);
    assert.match(partial.stdout, /project:.*config_content_version=n\/a.*content_state=partial/, `${label} CV reports partial explicitly`);
    assert.equal(readFileSync(settingsPath, 'utf8'), settingsBeforeProbe, `${label} metadata probe never changes foreign settings`);
  }

  // GIVEN: current content that was deliberately disabled.
  writeFileSync(configPath, JSON.stringify({ ...currentConfig, enabled: false }));
  const disabledBytes = readFileSync(configPath, 'utf8');
  // WHEN: the canonical status probe runs.
  const disabledContent = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });
  // THEN: content freshness and enabled state stay independent, and neither file changes.
  assert.equal(disabledContent.status, 0, 'disabled deadline status succeeds');
  assert.match(disabledContent.stdout, /project:.*enabled=false.*content_state=current/, 'disabled setup stays disabled with current content');
  assert.equal(readFileSync(configPath, 'utf8'), disabledBytes, 'status does not re-enable or rewrite the disabled config');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBeforeProbe, 'disabled status leaves foreign settings untouched');

  // GIVEN: a malformed installed hook marker containing a valid-looking prefix.
  writeFileSync(cleanupPath, cleanupBytes.replace(/content_version=([0-9.]+)/, 'content_version=$1broken'));
  // WHEN: the canonical status reads its CV token.
  const malformedHook = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });
  // THEN: malformed metadata is partial, with no prefix-based freshness guess.
  assert.equal(malformedHook.status, 0, 'malformed hook metadata is reported without aborting');
  assert.match(malformedHook.stdout, /project:.*enabled=false.*content_state=partial/, 'malformed hook CV remains partial without re-enabling');
  writeFileSync(cleanupPath, cleanupBytes);

  // GIVEN: a legacy absolute guard entry appears beside the portable entries.
  parsed.hooks.PreToolUse.unshift({ matcher: '.*', hooks: [{ type: 'command', command: 'node', args: ['/legacy/.claude/hooks/agent-deadline-guard.mjs'], timeout: 5 }] });
  writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));

  // WHEN: status runs again.
  const legacyStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: it keeps the portable count and exposes the legacy entry separately.
  assert.equal(legacyStatus.status, 0, 'deadline status with a legacy path must exit successfully');
  assert.equal(legacyStatus.stdout.includes('guard_refs=1 cleanup_refs=1 legacy_refs=1 settings_valid=yes'), true, 'deadline status must recognize a legacy absolute project arg');

  // GIVEN: both portable handlers are present under the wrong events and matchers.
  writeFileSync(settingsPath, JSON.stringify({ hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: 'node', args: [`${PORTABLE}agent-deadline-cleanup.mjs`], timeout: 3 }] }],
    SubagentStop: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'node', args: [`${PORTABLE}agent-deadline-guard.mjs`], timeout: 5 }] }],
  } }, null, 2));

  // WHEN: status validates the full registration tuples.
  const miswiredStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: portable strings alone do not make swapped registrations effective.
  assert.equal(miswiredStatus.status, 0, 'deadline status with swapped registrations must exit successfully');
  assert.equal(miswiredStatus.stdout.includes('guard_refs=0 cleanup_refs=0 legacy_refs=2 settings_valid=yes'), true, 'deadline status must reject swapped events and wrong matchers');

  // GIVEN: two exact guards exist but the cleanup registration is missing.
  const exactGuard = { type: 'command', command: 'node', args: [`${PORTABLE}agent-deadline-guard.mjs`], timeout: 5 };
  writeFileSync(settingsPath, JSON.stringify({ hooks: {
    PreToolUse: [
      { matcher: '.*', hooks: [exactGuard] },
      { matcher: '.*', hooks: [exactGuard] },
    ],
  } }, null, 2));

  // WHEN: status counts each script independently.
  const duplicateGuardStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: two guards never aggregate into a false fully-wired result.
  assert.equal(duplicateGuardStatus.status, 0, 'deadline status with duplicate guards must exit successfully');
  assert.equal(duplicateGuardStatus.stdout.includes('guard_refs=2 cleanup_refs=0 legacy_refs=0 settings_valid=yes'), true, 'deadline status must expose duplicate-one/missing-other registrations');

  // GIVEN: both owned handlers have the correct identity except for their required timeouts.
  writeFileSync(settingsPath, JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: '.*', hooks: [{ ...exactGuard, timeout: 4 }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'node', args: [`${PORTABLE}agent-deadline-cleanup.mjs`], timeout: 5 }] }],
  } }, null, 2));

  // WHEN: status validates the timeout fields.
  const wrongTimeoutStatus = spawnSync('bash', ['-c', statusBlock], { cwd: nested, encoding: 'utf8', env: statusEnv, timeout: 30000 });

  // THEN: neither malformed owned handler is effective.
  assert.equal(wrongTimeoutStatus.status, 0, 'deadline status with wrong timeouts must exit successfully');
  assert.equal(wrongTimeoutStatus.stdout.includes('guard_refs=0 cleanup_refs=0 legacy_refs=2 settings_valid=yes'), true, 'deadline status must reject guard/cleanup timeouts other than 5/3');

  // GIVEN: uninstall sees an owned handler and a foreign handler in the same entry.
  writeFileSync(settingsPath, JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: '.*', hooks: [
      { type: 'command', command: 'node', args: [`${PORTABLE}agent-deadline-guard.mjs`], timeout: 5 },
      foreignHandler,
    ] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'node', args: [`${PORTABLE}agent-deadline-cleanup.mjs`], timeout: 3 }] }],
  } }, null, 2));
  const uninstallBlock = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), '## UNINSTALL  (settings entries + hook files; config and state kept)');

  // WHEN: the canonical uninstall block runs.
  const uninstall = spawnSync('bash', ['-c', uninstallBlock], { encoding: 'utf8', env: { ...process.env, ROOT: project }, timeout: 30000 });
  const uninstalled = JSON.parse(readFileSync(settingsPath, 'utf8'));

  // THEN: only owned handlers disappear and the foreign co-handler keeps its matcher entry.
  assert.equal(uninstall.status, 0, 'deadline uninstall must exit successfully');
  assert.deepEqual(uninstalled, { hooks: { PreToolUse: [{ matcher: '.*', hooks: [foreignHandler] }] } }, 'deadline uninstall must preserve a mixed entry foreign co-handler exactly');

  // GIVEN: global settings also contain a legacy owned handler beside a foreign co-handler.
  const globalHome = join(base, 'global-home');
  const globalSettings = join(globalHome, '.claude', 'settings.json');
  mkdirSync(join(globalHome, '.claude'), { recursive: true });
  writeFileSync(globalSettings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: '.*', hooks: [
    { type: 'command', command: 'node', args: ['/old/global/hooks/agent-deadline-guard.mjs'], timeout: 5 },
    foreignHandler,
  ] }] } }, null, 2));
  const globalBlock = fencedBlockAfter(readFileSync(RUNBOOK, 'utf8'), '**EXECUTE** merge settings (global');

  // WHEN: the canonical global merge runs.
  const globalInstall = spawnSync('bash', ['-c', globalBlock], { encoding: 'utf8', env: { ...process.env, HOME: globalHome }, timeout: 30000 });
  const globalParsed = JSON.parse(readFileSync(globalSettings, 'utf8'));
  const globalArgs = Object.values(globalParsed.hooks).flat().flatMap(entry => entry.hooks || []).flatMap(handler => handler.args || []);

  // THEN: global exact args are emitted and the mixed-entry foreign handler survives.
  assert.equal(globalInstall.status, 0, 'global deadline merge must exit successfully');
  assert.equal(globalArgs.filter(arg => arg === join(globalHome, '.claude', 'hooks', 'agent-deadline-guard.mjs')).length, 1, 'global guard must use one expanded scope arg');
  assert.equal(globalArgs.filter(arg => arg === join(globalHome, '.claude', 'hooks', 'agent-deadline-cleanup.mjs')).length, 1, 'global cleanup must use one expanded scope arg');
  assert.deepEqual(
    globalParsed.hooks.PreToolUse.find(entry => (entry.hooks || []).some(handler => (handler.args || []).includes('/foreign/co-handler.mjs')))?.hooks,
    [foreignHandler],
    'global install must preserve the foreign co-handler inside a mixed matcher entry',
  );
} finally {
  rmSync(base, { recursive: true, force: true });
}

process.stdout.write('agent-deadline installer tests passed\n');
