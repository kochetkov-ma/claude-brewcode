#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SKILL_DIR = join(HERE, '..');
const RUNBOOK = join(SKILL_DIR, 'assets', 'INSTALL.md');

function blockAfter(source, marker, fence) {
  const markerAt = source.indexOf(marker);
  assert.equal(markerAt >= 0, true, `source contains ${marker}`);
  const start = source.indexOf(fence, markerAt);
  assert.equal(start >= 0, true, `source fences ${marker}`);
  const end = source.indexOf('\n```', start + fence.length);
  assert.equal(end >= 0, true, `source closes ${marker}`);
  return source.slice(start + fence.length, end);
}

const base = mkdtempSync(join(tmpdir(), 'return-status-'));
try {
  // GIVEN: actual copied hook assets, two owned registrations, and an unrelated co-handler.
  const project = join(base, 'project');
  const hooksDir = join(project, '.claude', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  for (const script of ['agent-return-budget.mjs', 'agent-return-contract.mjs', 'agent-return-guard.mjs']) {
    writeFileSync(join(hooksDir, script), readFileSync(join(SKILL_DIR, 'assets', script)));
  }
  const settingsPath = join(project, '.claude', 'settings.json');
  const foreign = { type: 'command', command: 'node', args: ['/foreign/keep.mjs'], timeout: 4 };
  writeFileSync(settingsPath, JSON.stringify({ env: { KEEP: 'yes' }, hooks: {
    SubagentStart: [{ hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-return-contract.mjs'], timeout: 5 }, foreign] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-return-guard.mjs'], timeout: 5 }] }],
  } }));
  const settingsBefore = readFileSync(settingsPath, 'utf8');
  const env = { ...process.env, HOME: join(base, 'home'), CLAUDE_SKILL_DIR: SKILL_DIR, ROOT: project, RUNBOOK, PASS_TOKENS: '1000', FILE_TOKENS: '2500', PLUGIN_VERSION: '1.0.0' };
  const configBlock = blockAfter(readFileSync(RUNBOOK, 'utf8'), '**EXECUTE** config write', '```\n');
  const producer = spawnSync('bash', ['-c', configBlock], { cwd: project, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(producer.status, 0, `authoritative return config producer succeeds: ${producer.stderr}`);
  const configPath = join(project, '.claude', 'agent-return.json');
  const currentConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(currentConfig.version, '1.0.0', 'fixture retains deliberately older release provenance');
  const statusBlock = blockAfter(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'), '## Step 1 — STATUS FIRST, always', '```bash\n');
  const probe = () => spawnSync('bash', ['-c', statusBlock], { cwd: project, env, encoding: 'utf8', timeout: 30000 });

  // WHEN: the actual consumer probes producer-shaped current content with older provenance.
  const current = probe();
  // THEN: release drift does not invent staleness, and all settings remain intact.
  assert.equal(current.status, 0, 'current return status exits successfully');
  assert.match(current.stdout, /project: hook_files=3\/3 settings_refs=2 enabled=true.*config_version=1\.0\.0.*content_state=current/, 'matching CV reports current despite the older release');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, 'status preserves foreign settings byte-for-byte');

  // GIVEN: valid stale content metadata.
  writeFileSync(configPath, JSON.stringify({ ...currentConfig, content_version: '0.0.1' }));
  // WHEN: status compares the current runbook and installed metadata.
  const stale = probe();
  // THEN: content drift is surfaced and settings remain untouched.
  assert.equal(stale.status, 0, 'stale content status exits successfully');
  assert.match(stale.stdout, /project:.*content_state=stale/, 'changed config CV reports stale');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, 'stale probe preserves unrelated settings');

  // GIVEN: current config but a stale shared module marker.
  writeFileSync(configPath, JSON.stringify(currentConfig));
  const budgetPath = join(hooksDir, 'agent-return-budget.mjs');
  const budgetBytes = readFileSync(budgetPath, 'utf8');
  writeFileSync(budgetPath, budgetBytes.replace(/content_version=[0-9.]+/, 'content_version=0.0.1'));
  // WHEN: the consumer compares every installed asset, including the unregistered library.
  const staleLibrary = probe();
  // THEN: a current guard alone cannot hide stale shared runtime code.
  assert.equal(staleLibrary.status, 0, 'shared library CV remains readable');
  assert.match(staleLibrary.stdout, /project:.*content_state=stale/, 'changed shared-module CV reports stale');
  assert.match(staleLibrary.stdout, /content_findings=agent-return-budget\.mjs:0\.0\.1->[0-9]+\.[0-9]+\.[0-9]+/, 'status names the stale shared module and both CVs');
  writeFileSync(budgetPath, budgetBytes);

  for (const [label, contentVersion] of [['missing', undefined], ['malformed', 'not-a-version']]) {
    // GIVEN: installed hooks with incomplete metadata.
    writeFileSync(configPath, JSON.stringify({ ...currentConfig, content_version: contentVersion }));
    // WHEN: status reads missing/malformed content metadata.
    const partial = probe();
    // THEN: older release metadata cannot substitute for the missing CV.
    assert.equal(partial.status, 0, `${label} CV remains a readable status`);
    assert.match(partial.stdout, /project:.*config_content_version=n\/a.*content_state=partial/, `${label} CV is explicitly partial`);
    assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, `${label} metadata leaves foreign settings unchanged`);
  }

  // GIVEN: a deliberately disabled current installation.
  writeFileSync(configPath, JSON.stringify({ ...currentConfig, enabled: false }));
  const disabledBefore = readFileSync(configPath, 'utf8');
  // WHEN: status reads content metadata.
  const disabled = probe();
  // THEN: off-switch state is preserved and reported alongside current content.
  assert.equal(disabled.status, 0, 'disabled return status succeeds');
  assert.match(disabled.stdout, /project:.*enabled=false.*content_state=current/, 'current metadata does not re-enable the setup');
  assert.equal(readFileSync(configPath, 'utf8'), disabledBefore, 'disabled config stays byte-identical');
  assert.equal(readFileSync(settingsPath, 'utf8'), settingsBefore, 'disabled probe preserves foreign settings');

  // GIVEN: a malformed hook marker with a valid-looking prefix.
  writeFileSync(budgetPath, budgetBytes.replace(/content_version=([0-9.]+)/, 'content_version=$1broken'));
  // WHEN: the actual consumer reads the metadata token.
  const malformedLibrary = probe();
  // THEN: missing valid CV is partial, while disabled state stays independent.
  assert.equal(malformedLibrary.status, 0, 'malformed library metadata status succeeds');
  assert.match(malformedLibrary.stdout, /project:.*enabled=false.*content_state=partial/, 'malformed library CV is partial without re-enabling');
} finally {
  rmSync(base, { recursive: true, force: true });
}
process.stdout.write('agent-return status tests passed\n');
