#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_HOME = os.homedir();
const LOCAL_MARKETPLACE = 'claude-brewcode-codex-local';
const REMOTE_MARKETPLACE = 'claude-brewcode';
const PLUGINS = ['brewcode', 'brewdoc', 'brewtools'];
const RETIRED_AGENT = 'brewcode-bc-rules-organizer.toml';

for (const relative of ['.codex/scripts/validate-compat.mjs', '.codex/tests/hooks.test.mjs']) {
  const result = spawnSync('node', [path.join(ROOT, relative)], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const fakeCodex = `#!/usr/bin/env node
const fs = require('node:fs');
const stateFile = process.env.MOCK_CODEX_STATE;
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
if (args[0] !== 'plugin') process.exit(64);
if (args[1] === 'marketplace' && args[2] === 'list') {
  process.stdout.write(JSON.stringify({ marketplaces: [{ name: '${REMOTE_MARKETPLACE}' }, ...(state.localMarketplace ? [{ name: '${LOCAL_MARKETPLACE}' }] : [])] }));
} else if (args[1] === 'marketplace' && args[2] === 'add') {
  state.localMarketplace = true; save();
} else if (args[1] === 'marketplace' && args[2] === 'remove') {
  state.localMarketplace = false; save();
} else if (args[1] === 'list') {
  process.stdout.write(JSON.stringify({ installed: state.plugins, available: [] }));
} else if (args[1] === 'remove') {
  state.plugins = state.plugins.filter(value => value.pluginId !== args[2]); save();
} else if (args[1] === 'add') {
  const pluginId = args[2];
  const [name, marketplaceName] = pluginId.split('@');
  const version = marketplaceName === '${LOCAL_MARKETPLACE}' ? '4.0.6' : '4.0.5';
  state.plugins = state.plugins.filter(value => value.pluginId !== pluginId);
  state.plugins.push({ pluginId, name, marketplaceName, version, installed: true, enabled: true });
  save();
  process.stdout.write(JSON.stringify({ pluginId, version }));
} else process.exit(64);
`;

function remotePlugins(version = '4.0.5') {
  return PLUGINS.map(name => ({
    pluginId: `${name}@${REMOTE_MARKETPLACE}`,
    name,
    marketplaceName: REMOTE_MARKETPLACE,
    version,
    installed: true,
    enabled: true
  }));
}

function managedAgentNames() {
  const names = [];
  for (const plugin of PLUGINS) {
    const sourceRoot = path.join(ROOT, plugin, '.codex', 'agents');
    for (const name of fs.readdirSync(sourceRoot).filter(value => value.endsWith('.toml')).sort()) names.push(`${plugin}-${name}`);
  }
  assert.equal(names.length, 9);
  return names;
}

function fixture(initialPlugins = remotePlugins()) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'brewcode-migrate-rollback-'));
  const bin = path.join(home, 'bin');
  const stateFile = path.join(home, 'state.json');
  const validatorParent = path.join(home, '.codex', 'skills', '.system');
  const agentRoot = path.join(home, '.codex', 'agents');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(validatorParent, { recursive: true });
  fs.mkdirSync(agentRoot, { recursive: true });
  fs.symlinkSync(path.join(REAL_HOME, '.codex', 'skills', '.system', 'plugin-creator'), path.join(validatorParent, 'plugin-creator'));
  fs.writeFileSync(path.join(bin, 'codex'), fakeCodex, { mode: 0o755 });
  fs.writeFileSync(stateFile, JSON.stringify({ localMarketplace: false, plugins: initialPlugins }));
  for (const [index, name] of managedAgentNames().entries()) fs.writeFileSync(path.join(agentRoot, name), `before-${index}\n`);
  fs.writeFileSync(path.join(agentRoot, RETIRED_AGENT), 'before-retired\n');
  return { home, bin, stateFile, agentRoot };
}

function snapshot(value) {
  const state = JSON.parse(fs.readFileSync(value.stateFile, 'utf8'));
  state.plugins.sort((left, right) => left.pluginId.localeCompare(right.pluginId));
  const agentNames = [...managedAgentNames(), RETIRED_AGENT].filter(name => fs.existsSync(path.join(value.agentRoot, name)));
  const agents = Object.fromEntries(agentNames.map(name => [name, fs.readFileSync(path.join(value.agentRoot, name), 'utf8')]));
  return { state, agents };
}

function invoke(value, failStep) {
  return spawnSync('node', [path.join(ROOT, '.codex', 'scripts', 'install-update.mjs'), 'migrate'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: value.home,
      PATH: `${value.bin}:${process.env.PATH}`,
      MOCK_CODEX_STATE: value.stateFile,
      CODEX_COMPAT_TEST_SKIP_VALIDATION: '1',
      ...(failStep ? { CODEX_COMPAT_TEST_FAIL_STEP: failStep } : {})
    }
  });
}

const mutationSteps = [
  'marketplace:add',
  ...PLUGINS.map(name => `plugin:remove:${name}@${REMOTE_MARKETPLACE}`),
  ...PLUGINS.map(name => `plugin:add:${name}@${LOCAL_MARKETPLACE}`),
  ...managedAgentNames().map(name => `agent:write:${name}`),
  `agent:remove:${RETIRED_AGENT}`
];

for (const step of mutationSteps) {
  const value = fixture();
  const before = snapshot(value);
  const result = invoke(value, step);
  assert.equal(result.status, 1, `${step}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Rollback: complete/, step);
  assert.deepEqual(snapshot(value), before, step);
  fs.rmSync(value.home, { recursive: true, force: true });
}

const success = fixture();
const successResult = invoke(success);
assert.equal(successResult.status, 0, successResult.stderr);
const successState = snapshot(success);
assert.equal(successState.state.localMarketplace, true);
assert.deepEqual(successState.state.plugins.map(item => [item.pluginId, item.version, item.enabled]), PLUGINS.map(name => [`${name}@${LOCAL_MARKETPLACE}`, '4.0.6', true]));
assert.equal(fs.existsSync(path.join(success.agentRoot, RETIRED_AGENT)), false);
fs.rmSync(success.home, { recursive: true, force: true });

const rejected = fixture(remotePlugins('4.0.4'));
const rejectedBefore = snapshot(rejected);
const rejectedResult = invoke(rejected);
assert.equal(rejectedResult.status, 1);
assert.match(rejectedResult.stderr, /only accepts enabled Brewcode 4\.0\.5/);
assert.deepEqual(snapshot(rejected), rejectedBefore);
fs.rmSync(rejected.home, { recursive: true, force: true });

process.stdout.write(`Transactional migration rollback passed after every one of ${mutationSteps.length} mutation steps; exact plugin id, version, enabled, marketplace, and agent state restored.\n`);
