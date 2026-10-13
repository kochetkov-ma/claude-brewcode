#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL_MARKETPLACE = 'claude-brewcode-codex-local';
const USER_MARKETPLACE = 'claude-brewcode-codex-user';
const REMOTE_MARKETPLACE = 'claude-brewcode';
const PLUGINS = ['brewcode', 'brewdoc', 'brewtools'];
const RETIRED_AGENTS = ['brewcode-bc-rules-organizer.toml', 'brewcode-architect.toml', 'brewcode-developer.toml',
  'brewcode-reviewer.toml', 'brewcode-tester.toml', 'brewdoc-bd-auto-sync-processor.toml'];
const OLD_COPY_VERSION = '6.5.3+codex.local-20261013062944';
const USER_MODEL_LINES = 'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "medium"';
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const REPO_VERSION = readJson(path.join(ROOT, 'brewcode', '.claude-plugin', 'plugin.json')).version;
const STAMPED_VERSION = new RegExp(`^${REPO_VERSION.replaceAll('.', '\\.')}\\+codex\\.local-\\d{14}$`);
const mirrorRoot = name => path.join(ROOT, '.codex', 'plugins', name);
const mirrorVersion = name => readJson(path.join(mirrorRoot(name), '.codex-plugin', 'plugin.json')).version;

for (const relative of ['.codex/scripts/validate-compat.mjs', '.codex/tests/hooks.test.mjs']) {
  const result = spawnSync('node', [path.join(ROOT, relative)], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

// Fake codex CLI (CommonJS): plugin rows in MOCK_CODEX_STATE, enabled flags in $CODEX_HOME/config.toml like Codex 0.162.
function fakeCodexMain() {
  const fs = require('node:fs');
  const path = require('node:path');
  const stateFile = process.env.MOCK_CODEX_STATE;
  const configFile = path.join(process.env.CODEX_HOME, 'config.toml');
  const args = process.argv.slice(2).filter(value => value !== '--json');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
  const readConfig = () => (fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '');
  const header = id => `[plugins."${id}"]`;
  const market = name => state.marketplaces.find(item => item.name === name);
  const tableRange = (lines, id) => {
    const start = lines.indexOf(header(id));
    if (start < 0) return null;
    const end = lines.findIndex((line, index) => index > start && line.startsWith('['));
    return [start, end < 0 ? lines.length : end];
  };
  const enabled = id => {
    const lines = readConfig().split('\n');
    const range = tableRange(lines, id);
    return range !== null && lines.slice(range[0] + 1, range[1]).includes('enabled = true');
  };
  const describe = plugin => {
    const owner = market(plugin.marketplaceName);
    const local = owner && owner.sourceType === 'local';
    return {
      pluginId: plugin.pluginId, name: plugin.name, marketplaceName: plugin.marketplaceName, version: plugin.version,
      installed: true, enabled: enabled(plugin.pluginId),
      source: local ? { source: 'local', path: path.join(owner.root, '.codex', 'plugins', plugin.name) } : { source: 'git' },
      marketplaceSource: owner ? { sourceType: owner.sourceType, source: owner.root } : null
    };
  };
  if (args[0] !== 'plugin') process.exit(64);
  if (args[1] === 'marketplace' && args[2] === 'list') {
    process.stdout.write(JSON.stringify({ marketplaces: state.marketplaces.map(item => ({ name: item.name, root: item.root, marketplaceSource: { sourceType: item.sourceType, source: item.root } })) }));
  } else if (args[1] === 'marketplace' && args[2] === 'add') {
    const name = JSON.parse(fs.readFileSync(path.join(args[3], '.codex', 'marketplace.json'), 'utf8')).name;
    state.marketplaces.push({ name, root: args[3], sourceType: 'local' });
    save();
  } else if (args[1] === 'marketplace' && args[2] === 'remove') {
    state.marketplaces = state.marketplaces.filter(item => item.name !== args[3]);
    save();
  } else if (args[1] === 'list') {
    process.stdout.write(JSON.stringify({ installed: state.plugins.map(describe), available: [] }));
  } else if (args[1] === 'remove') {
    state.plugins = state.plugins.filter(item => item.pluginId !== args[2]);
    const lines = readConfig().split('\n');
    const range = tableRange(lines, args[2]);
    if (range !== null) lines.splice(range[0], range[1] - range[0]);
    fs.writeFileSync(configFile, lines.join('\n'));
    save();
  } else if (args[1] === 'add') {
    const pluginId = args[2];
    const [name, marketplaceName] = pluginId.split('@');
    const owner = market(marketplaceName);
    if (!owner) process.exit(1);
    const version = owner.sourceType === 'local'
      ? JSON.parse(fs.readFileSync(path.join(owner.root, '.codex', 'plugins', name, '.codex-plugin', 'plugin.json'), 'utf8')).version
      : '4.0.5';
    state.plugins = state.plugins.filter(item => item.pluginId !== pluginId);
    state.plugins.push({ pluginId, name, marketplaceName, version });
    const lines = readConfig().split('\n');
    const range = tableRange(lines, pluginId);
    if (range === null) lines.push(header(pluginId), 'enabled = true', '');
    else lines.splice(range[0] + 1, range[1] - range[0] - 1, 'enabled = true', '');
    fs.writeFileSync(configFile, lines.join('\n'));
    save();
    process.stdout.write(JSON.stringify({ pluginId, version }));
  } else process.exit(64);
}

function managedAgents() {
  const agents = [];
  for (const plugin of PLUGINS) {
    const sourceRoot = path.join(ROOT, plugin, '.codex', 'agents');
    if (!fs.existsSync(sourceRoot)) continue;
    for (const name of fs.readdirSync(sourceRoot).filter(value => value.endsWith('.toml')).sort()) {
      const shipped = fs.readFileSync(path.join(sourceRoot, name), 'utf8').replaceAll('{{PLUGIN_ROOT}}', path.join(ROOT, plugin));
      agents.push({ name: `${plugin}-${name}`, shipped });
    }
  }
  assert.equal(agents.length, 4, 'shipped managed agent count');
  return agents;
}

const userTuned = shipped => shipped.replace(/^(description = .*)$/m, `$1\n${USER_MODEL_LINES}`);
const staleUserTuned = shipped => userTuned(shipped).replace(/developer_instructions = '''[\s\S]*'''/, "developer_instructions = '''\nold body\n'''");

function tree(dir) {
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir, { recursive: true }).map(String).filter(name => fs.statSync(path.join(dir, name)).isFile()).sort();
  return Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(dir, name), 'utf8')]));
}

function config(tables) {
  return ['model = "gpt-6.1-sol"', '', '[plugins."other@elsewhere"]', 'enabled = false', '',
    ...tables.flatMap(([id, enabled]) => [`[plugins."${id}"]`, `enabled = ${enabled}`, '']),
    '[hooks.state."brewtools@x:user_prompt_submit"]', 'trusted_hash = "abc"', ''].join('\n');
}

function fixture({ marketplaces, plugins, flags, agents }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'brewcode-install-update-'));
  const codexHome = path.join(home, '.codex');
  const bin = path.join(home, 'bin');
  const stateFile = path.join(home, 'state.json');
  const agentRoot = path.join(codexHome, 'agents');
  const userRoot = path.join(codexHome, 'local-marketplaces', USER_MARKETPLACE);
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(agentRoot, { recursive: true });
  fs.writeFileSync(path.join(bin, 'codex'), `#!/usr/bin/env node\n(${fakeCodexMain.toString()})();\n`, { mode: 0o755 });
  const resolved = marketplaces.map(item => (item.name === USER_MARKETPLACE ? { ...item, root: userRoot } : item));
  if (resolved.some(item => item.name === USER_MARKETPLACE)) {
    fs.mkdirSync(path.join(userRoot, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(userRoot, '.codex', 'marketplace.json'), JSON.stringify({ name: USER_MARKETPLACE }));
    for (const plugin of PLUGINS) {
      const dir = path.join(userRoot, '.codex', 'plugins', plugin);
      fs.mkdirSync(path.join(dir, '.codex-plugin'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: plugin, version: OLD_COPY_VERSION }));
      fs.writeFileSync(path.join(dir, 'stale.md'), 'old\n');
    }
  }
  fs.writeFileSync(stateFile, JSON.stringify({ marketplaces: resolved, plugins }));
  if (flags) fs.writeFileSync(path.join(codexHome, 'config.toml'), config(flags));
  if (agents) {
    for (const agent of managedAgents()) fs.writeFileSync(path.join(agentRoot, agent.name), staleUserTuned(agent.shipped));
    for (const name of RETIRED_AGENTS) fs.writeFileSync(path.join(agentRoot, name), `model = "gpt-6.1-sol"\nname = "${name}"\n`);
  }
  return { home, codexHome, bin, stateFile, agentRoot, userRoot };
}

function env(value, failStep) {
  return {
    ...process.env,
    HOME: value.home,
    CODEX_HOME: value.codexHome,
    PATH: `${value.bin}:${process.env.PATH}`,
    MOCK_CODEX_STATE: value.stateFile,
    CODEX_COMPAT_TEST_SKIP_VALIDATION: '1',
    ...(failStep ? { CODEX_COMPAT_TEST_FAIL_STEP: failStep } : {})
  };
}

function invoke(value, action, failStep) {
  return spawnSync('node', [path.join(ROOT, '.codex', 'scripts', 'install-update.mjs'), action], { cwd: ROOT, encoding: 'utf8', env: env(value, failStep) });
}

function pluginRows(value) {
  const result = spawnSync(path.join(value.bin, 'codex'), ['plugin', 'list', '--json'], { encoding: 'utf8', env: env(value) });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).installed.map(item => [item.pluginId, item.version, item.enabled]).sort((left, right) => left[0].localeCompare(right[0]));
}

function snapshot(value) {
  const configFile = path.join(value.codexHome, 'config.toml');
  return {
    state: readJson(value.stateFile),
    rows: pluginRows(value),
    config: fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : null,
    agents: tree(value.agentRoot),
    marketplace: tree(value.userRoot)
  };
}

const userCopy = () => fixture({
  marketplaces: [{ name: USER_MARKETPLACE, sourceType: 'local' }],
  plugins: PLUGINS.map(name => ({ pluginId: `${name}@${USER_MARKETPLACE}`, name, marketplaceName: USER_MARKETPLACE, version: OLD_COPY_VERSION })),
  flags: [[`brewcode@${USER_MARKETPLACE}`, false], [`brewdoc@${USER_MARKETPLACE}`, true], [`brewtools@${USER_MARKETPLACE}`, true]],
  agents: true
});

const repoInstall = () => fixture({
  marketplaces: [{ name: LOCAL_MARKETPLACE, root: ROOT, sourceType: 'local' }],
  plugins: PLUGINS.map(name => ({ pluginId: `${name}@${LOCAL_MARKETPLACE}`, name, marketplaceName: LOCAL_MARKETPLACE, version: mirrorVersion(name) })),
  flags: [[`brewcode@${LOCAL_MARKETPLACE}`, false], [`brewdoc@${LOCAL_MARKETPLACE}`, true], [`brewtools@${LOCAL_MARKETPLACE}`, true]],
  agents: true
});

const remoteInstall = (version = '4.0.5') => fixture({
  marketplaces: [{ name: REMOTE_MARKETPLACE, root: '/nonexistent-remote-snapshot', sourceType: 'git' }],
  plugins: PLUGINS.map(name => ({ pluginId: `${name}@${REMOTE_MARKETPLACE}`, name, marketplaceName: REMOTE_MARKETPLACE, version })),
  flags: [[`brewcode@${REMOTE_MARKETPLACE}`, false], [`brewdoc@${REMOTE_MARKETPLACE}`, true], [`brewtools@${REMOTE_MARKETPLACE}`, true]],
  agents: true
});

function cleanup(value) {
  fs.rmSync(value.home, { recursive: true, force: true });
}

const expectedAgents = () => Object.fromEntries(managedAgents().map(agent => [agent.name, userTuned(agent.shipped)]).sort());
const tests = [];
const test = (name, body) => tests.push([name, body]);

test('GIVEN user copy marketplace with brewcode disabled WHEN update THEN every plugin is updated in place with its flag kept', () => {
  const value = userCopy();
  const before = snapshot(value);
  const result = invoke(value, 'update');
  assert.equal(result.status, 0, result.stderr);
  const rows = pluginRows(value);
  assert.match(rows[0][1], STAMPED_VERSION, 'copy marketplace gets the repo release version, not the mirror 4.0.6');
  assert.deepEqual(rows, [[`brewcode@${USER_MARKETPLACE}`, rows[0][1], false], [`brewdoc@${USER_MARKETPLACE}`, rows[0][1], true], [`brewtools@${USER_MARKETPLACE}`, rows[0][1], true]], 'same ids, new version, flags unchanged');
  assert.equal(fs.readFileSync(path.join(value.codexHome, 'config.toml'), 'utf8'), before.config, 'config.toml byte-identical after update');
  const expectedCopy = Object.fromEntries(PLUGINS.flatMap(plugin => Object.entries(tree(mirrorRoot(plugin))).map(([name, content]) => [
    path.join('.codex', 'plugins', plugin, name),
    name === path.join('.codex-plugin', 'plugin.json') ? content.replace(/("version"\s*:\s*")[^"]*(")/, `$1${rows[0][1]}$2`) : content
  ])).concat([[path.join('.codex', 'marketplace.json'), before.marketplace[path.join('.codex', 'marketplace.json')]]]).sort());
  assert.deepEqual(tree(value.userRoot), expectedCopy, 'copy marketplace holds exactly the stamped mirror, no stale or staging files');
  cleanup(value);
});

test('GIVEN repo marketplace with brewcode disabled WHEN update THEN versions and flags are unchanged', () => {
  const value = repoInstall();
  const before = snapshot(value);
  const result = invoke(value, 'update');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(pluginRows(value), before.rows, 'repo plugins keep id, mirror version and flag');
  assert.equal(fs.readFileSync(path.join(value.codexHome, 'config.toml'), 'utf8'), before.config, 'config.toml byte-identical after update');
  cleanup(value);
});

test('GIVEN agents carrying user model keys and a stale body WHEN update THEN body is refreshed and model keys survive', () => {
  const value = userCopy();
  const result = invoke(value, 'update');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(tree(value.agentRoot), expectedAgents(), 'shipped body plus the user model and model_reasoning_effort lines, retired gone');
  cleanup(value);
});

test('GIVEN user-only top-level keys, arrays and tables WHEN update THEN each keeps its value', () => {
  const value = userCopy();
  const target = path.join(value.agentRoot, 'brewcode-bash-expert.toml');
  const shipped = managedAgents().find(agent => agent.name === 'brewcode-bash-expert.toml').shipped;
  fs.writeFileSync(target, `nickname_candidates = [\n  "bash",\n]\n${staleUserTuned(shipped)}\n[mcp_servers.local]\ncommand = "x"\n`);
  const result = invoke(value, 'update');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), `nickname_candidates = [\n  "bash",\n]\n${userTuned(shipped)}\n[mcp_servers.local]\ncommand = "x"\n`, 'array, model keys and table kept around the refreshed body');
  cleanup(value);
});

test('GIVEN retired agent files WHEN update THEN all of them are removed', () => {
  const value = userCopy();
  const result = invoke(value, 'update');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(RETIRED_AGENTS.filter(name => fs.existsSync(path.join(value.agentRoot, name))), [], 'every retired agent is removed');
  cleanup(value);
});

const updateSteps = [
  ...PLUGINS.map(name => `stage:${name}@${USER_MARKETPLACE}`),
  ...PLUGINS.map(name => `plugin:add:${name}@${USER_MARKETPLACE}`),
  'config:flags',
  ...managedAgents().map(agent => `agent:write:${agent.name}`),
  ...RETIRED_AGENTS.map(name => `agent:remove:${name}`)
];
test(`GIVEN user copy install WHEN update fails after any of ${updateSteps.length} steps THEN everything is rolled back exactly`, () => {
  for (const step of updateSteps) {
    const value = userCopy();
    const before = snapshot(value);
    const result = invoke(value, 'update', step);
    assert.equal(result.status, 1, `${step}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Rollback: complete/, step);
    assert.deepEqual(snapshot(value), before, step);
    cleanup(value);
  }
});

const migrateSteps = [
  'marketplace:add',
  ...PLUGINS.map(name => `plugin:remove:${name}@${REMOTE_MARKETPLACE}`),
  ...PLUGINS.map(name => `plugin:add:${name}@${LOCAL_MARKETPLACE}`),
  'config:flags',
  ...managedAgents().map(agent => `agent:write:${agent.name}`),
  ...RETIRED_AGENTS.map(name => `agent:remove:${name}`)
];
test(`GIVEN remote 4.0.5 install WHEN migrate fails after any of ${migrateSteps.length} steps THEN everything is rolled back exactly`, () => {
  for (const step of migrateSteps) {
    const value = remoteInstall();
    const before = snapshot(value);
    const result = invoke(value, 'migrate', step);
    assert.equal(result.status, 1, `${step}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Rollback: complete/, step);
    assert.deepEqual(snapshot(value), before, step);
    cleanup(value);
  }
});

test('GIVEN remote 4.0.5 install with brewcode disabled WHEN migrate THEN local plugins carry the same flags', () => {
  const value = remoteInstall();
  const result = invoke(value, 'migrate');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(pluginRows(value), PLUGINS.map(name => [`${name}@${LOCAL_MARKETPLACE}`, mirrorVersion(name), name !== 'brewcode']), 'migrated ids with flags carried over');
  assert.deepEqual(readJson(value.stateFile).marketplaces.map(item => item.name), [REMOTE_MARKETPLACE, LOCAL_MARKETPLACE], 'repo marketplace added');
  assert.deepEqual(tree(value.agentRoot), expectedAgents(), 'agents refreshed with user keys, retired gone');
  cleanup(value);
});

test('GIVEN remote 4.0.4 install WHEN migrate THEN it is rejected without changes', () => {
  const value = remoteInstall('4.0.4');
  const before = snapshot(value);
  const result = invoke(value, 'migrate');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Migration only accepts Brewcode 4\.0\.5 plugins from claude-brewcode; no changes were made/);
  assert.deepEqual(snapshot(value), before, 'state unchanged');
  cleanup(value);
});

test('GIVEN nothing installed WHEN update THEN it refuses without changes', () => {
  const value = fixture({ marketplaces: [], plugins: [], flags: [], agents: true });
  const before = snapshot(value);
  const result = invoke(value, 'update');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /No Brewcode Codex plugins are installed; no changes were made/);
  assert.deepEqual(snapshot(value), before, 'state unchanged');
  cleanup(value);
});

test('GIVEN an empty Codex home WHEN install THEN all three repo plugins are installed enabled', () => {
  const value = fixture({ marketplaces: [], plugins: [], flags: null, agents: false });
  const result = invoke(value, 'install');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(pluginRows(value), PLUGINS.map(name => [`${name}@${LOCAL_MARKETPLACE}`, mirrorVersion(name), true]), 'fresh install enables every plugin');
  assert.deepEqual(tree(value.agentRoot), Object.fromEntries(managedAgents().map(agent => [agent.name, agent.shipped]).sort()), 'shipped agents written verbatim');
  cleanup(value);
});

for (const [name, body] of tests) {
  body();
  process.stdout.write(`ok - ${name}\n`);
}
process.stdout.write(`install-update: ${tests.length} tests passed (${updateSteps.length} update and ${migrateSteps.length} migrate rollback steps).\n`);
