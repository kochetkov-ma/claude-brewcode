#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKETPLACE = 'claude-brewcode-codex-local';
const REMOTE_MARKETPLACE = 'claude-brewcode';
const REMOTE_VERSION = '4.0.5';
const LOCAL_VERSION = '4.0.6';
const PLUGINS = ['brewcode', 'brewdoc', 'brewtools'];
const RETIRED_AGENTS = ['brewcode-bc-rules-organizer.toml'];
const action = process.argv[2] || 'check';
let injected = false;

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) {
    const detail = capture ? `: ${(result.stderr || result.stdout || '').trim()}` : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail}`);
  }
  return result.stdout || '';
}

function mutate(label, operation) {
  operation();
  if (!injected && process.env.CODEX_COMPAT_TEST_FAIL_STEP === label) {
    injected = true;
    throw new Error(`Injected mutation failure after ${label}`);
  }
}

function parseJson(value, label) {
  try { return JSON.parse(value); }
  catch (error) { throw new Error(`${label} returned invalid JSON: ${error.message}`); }
}

function pluginState() {
  const value = parseJson(run('codex', ['plugin', 'list', '--json'], { capture: true }), 'codex plugin list');
  return Array.isArray(value.installed) ? value.installed.filter(item => item.installed) : [];
}

function managedPlugins(values = pluginState()) {
  return values.filter(item => PLUGINS.includes(item.name) && item.installed).map(item => ({
    pluginId: item.pluginId,
    name: item.name,
    marketplaceName: item.marketplaceName,
    version: String(item.version),
    enabled: item.enabled === true,
    installed: true
  }));
}

function agentPlans() {
  const targetRoot = path.join(os.homedir(), '.codex', 'agents');
  const plans = [];
  for (const plugin of PLUGINS) {
    const pluginRoot = path.join(ROOT, plugin);
    const sourceRoot = path.join(pluginRoot, '.codex', 'agents');
    for (const name of fs.readdirSync(sourceRoot).filter(value => value.endsWith('.toml')).sort()) {
      plans.push({
        target: path.join(targetRoot, `${plugin}-${name}`),
        content: fs.readFileSync(path.join(sourceRoot, name), 'utf8').replaceAll('{{PLUGIN_ROOT}}', pluginRoot)
      });
    }
  }
  if (plans.length !== 4) throw new Error(`Expected 4 managed agents, found ${plans.length}`);
  return plans;
}

function retiredAgentPlans() {
  const targetRoot = path.join(os.homedir(), '.codex', 'agents');
  return RETIRED_AGENTS.map(name => ({ target: path.join(targetRoot, name), content: null, retired: true }));
}

function snapshotAgents(plans) {
  return plans.map(plan => {
    const exists = fs.existsSync(plan.target);
    return { ...plan, exists, previous: exists ? fs.readFileSync(plan.target) : null, mode: exists ? fs.statSync(plan.target).mode & 0o777 : null };
  });
}

function preflightAgents(snapshot, replace) {
  const conflicts = snapshot.filter(item => item.exists && !item.retired && !replace);
  if (conflicts.length) throw new Error(`Managed agent targets already exist; no changes were made:\n${conflicts.map(item => item.target).join('\n')}`);
}

function installAgents(snapshot) {
  for (const item of snapshot) {
    if (item.retired) {
      mutate(`agent:remove:${path.basename(item.target)}`, () => fs.rmSync(item.target, { force: true }));
      continue;
    }
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    const temporary = `${item.target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, item.content, { encoding: 'utf8', mode: 0o644 });
    mutate(`agent:write:${path.basename(item.target)}`, () => fs.renameSync(temporary, item.target));
  }
}

function restoreAgents(snapshot, errors) {
  for (const item of snapshot) {
    try {
      if (item.exists) {
        fs.mkdirSync(path.dirname(item.target), { recursive: true });
        fs.writeFileSync(item.target, item.previous, { mode: item.mode });
        fs.chmodSync(item.target, item.mode);
      } else fs.rmSync(item.target, { force: true });
      fs.rmSync(`${item.target}.tmp-${process.pid}`, { force: true });
    } catch (error) { errors.push(`agent ${item.target}: ${error.message}`); }
  }
}

function validate() {
  run('node', [path.join(ROOT, '.codex', 'scripts', 'validate-compat.mjs')]);
  run('node', [path.join(ROOT, '.codex', 'tests', 'hooks.test.mjs')]);
}

function assertRestorable(snapshot) {
  const disabled = snapshot.filter(item => !item.enabled);
  if (disabled.length) throw new Error(`Codex plugin CLI cannot restore disabled state exactly; no changes were made:\n${disabled.map(item => item.pluginId).join('\n')}`);
  const unsupportedLocal = snapshot.filter(item => item.marketplaceName === MARKETPLACE && item.version !== LOCAL_VERSION);
  if (unsupportedLocal.length) throw new Error(`Local marketplace snapshot cannot restore these versions exactly; no changes were made:\n${unsupportedLocal.map(item => `${item.pluginId} version=${item.version}`).join('\n')}`);
}

function verifyPluginSnapshot(expected, errors) {
  try {
    const current = new Map(managedPlugins().map(item => [item.pluginId, item]));
    const expectedIds = new Set(expected.map(item => item.pluginId));
    for (const item of expected) {
      const actual = current.get(item.pluginId);
      if (!actual || actual.version !== item.version || actual.enabled !== item.enabled) {
        errors.push(`plugin snapshot mismatch for ${item.pluginId}: expected version=${item.version} enabled=${item.enabled}`);
      }
    }
    for (const item of current.values()) if (!expectedIds.has(item.pluginId)) errors.push(`unexpected managed plugin after rollback: ${item.pluginId}`);
  } catch (error) { errors.push(`verify plugin snapshot: ${error.message}`); }
}

function rollbackPlugins(snapshot, marketplaceAdded, errors) {
  try {
    for (const item of managedPlugins()) {
      try { run('codex', ['plugin', 'remove', item.pluginId]); }
      catch (error) { errors.push(`remove ${item.pluginId}: ${error.message}`); }
    }
  } catch (error) { errors.push(`read current plugin state: ${error.message}`); }
  for (const item of snapshot) {
    try { run('codex', ['plugin', 'add', item.pluginId]); }
    catch (error) { errors.push(`restore ${item.pluginId}: ${error.message}`); }
  }
  if (marketplaceAdded) {
    try { run('codex', ['plugin', 'marketplace', 'remove', MARKETPLACE]); }
    catch (error) { errors.push(`remove marketplace ${MARKETPLACE}: ${error.message}`); }
  }
  verifyPluginSnapshot(snapshot, errors);
}

function validateMigrationConflicts(conflicts) {
  const unknown = conflicts.filter(item => item.marketplaceName !== REMOTE_MARKETPLACE || item.version !== REMOTE_VERSION || !item.enabled);
  if (unknown.length) {
    throw new Error(`Migration only accepts enabled Brewcode 4.0.5 plugins from ${REMOTE_MARKETPLACE}; no changes were made:\n${unknown.map(item => `${item.pluginId} version=${item.version} enabled=${item.enabled}`).join('\n')}`);
  }
}

if (!['check', 'install', 'update', 'migrate', 'agents'].includes(action)) {
  process.stderr.write('Usage: install-update.mjs [check|install|update|migrate|agents]\n');
  process.exit(2);
}

try {
  const skipValidation = process.env.CODEX_COMPAT_TEST_SKIP_VALIDATION === '1';
  if (skipValidation && !process.env.MOCK_CODEX_STATE) throw new Error('Test validation bypass requires MOCK_CODEX_STATE');
  if (!skipValidation) validate();
  if (action === 'check') {
    run('codex', ['plugin', 'marketplace', 'list']);
    run('codex', ['plugin', 'list']);
    process.exit(0);
  }

  const agentsBefore = snapshotAgents([...agentPlans(), ...retiredAgentPlans()]);
  preflightAgents(agentsBefore, action === 'update' || action === 'migrate');
  if (action === 'agents') {
    try { installAgents(agentsBefore); }
    catch (error) {
      const errors = [];
      restoreAgents(agentsBefore, errors);
      throw new Error(`${error.message}\nAgent rollback: ${errors.length ? errors.join('; ') : 'complete'}`);
    }
    process.stdout.write('Installed 4 Codex agent TOMLs and removed retired agents. Start a new Codex session.\n');
    process.exit(0);
  }

  const marketplaceBefore = run('codex', ['plugin', 'marketplace', 'list', '--json'], { capture: true });
  const pluginsBefore = managedPlugins();
  assertRestorable(pluginsBefore);
  const unavailableSnapshots = pluginsBefore.filter(item => item.marketplaceName !== MARKETPLACE && !marketplaceBefore.includes(item.marketplaceName));
  if (unavailableSnapshots.length) throw new Error(`Rollback marketplace is unavailable; no changes were made:\n${unavailableSnapshots.map(item => item.marketplaceName).join('\n')}`);
  const remoteConflicts = pluginsBefore.filter(item => item.marketplaceName !== MARKETPLACE);
  if (action === 'migrate') validateMigrationConflicts(remoteConflicts);
  else if (remoteConflicts.length) {
    process.stderr.write(`ERROR: Conflicting plugins require the transactional migration command. No changes were made.\nRun: node .codex/scripts/install-update.mjs migrate\n`);
    process.exit(3);
  }

  let marketplaceAdded = false;
  try {
    if (!marketplaceBefore.includes(MARKETPLACE)) {
      mutate('marketplace:add', () => {
        run('codex', ['plugin', 'marketplace', 'add', ROOT]);
        marketplaceAdded = true;
      });
    }
    for (const item of pluginsBefore) mutate(`plugin:remove:${item.pluginId}`, () => run('codex', ['plugin', 'remove', item.pluginId]));
    for (const plugin of PLUGINS) {
      const pluginId = `${plugin}@${MARKETPLACE}`;
      mutate(`plugin:add:${pluginId}`, () => run('codex', ['plugin', 'add', pluginId, '--json']));
    }
    installAgents(agentsBefore);
    const expected = PLUGINS.map(name => ({ pluginId: `${name}@${MARKETPLACE}`, name, marketplaceName: MARKETPLACE, version: LOCAL_VERSION, enabled: true, installed: true }));
    const verificationErrors = [];
    verifyPluginSnapshot(expected, verificationErrors);
    if (verificationErrors.length) throw new Error(verificationErrors.join('; '));
  } catch (error) {
    const errors = [];
    rollbackPlugins(pluginsBefore, marketplaceAdded, errors);
    restoreAgents(agentsBefore, errors);
    throw new Error(`${error.message}\nRollback: ${errors.length ? errors.join('; ') : 'complete'}`);
  }

  process.stdout.write(`Installed exact Codex ${LOCAL_VERSION} plugins and 4 agents (${action}); retired agents removed. Review hook definitions with /hooks, then start a new session.\n`);
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exit(1);
}
