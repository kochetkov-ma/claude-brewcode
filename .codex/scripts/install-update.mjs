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
const PLUGINS = ['brewcode', 'brewdoc', 'brewtools'];
// Installed by earlier releases, no longer shipped: removed on every install/update/migrate.
const RETIRED_AGENTS = ['brewcode-bc-rules-organizer.toml', 'brewcode-architect.toml', 'brewcode-developer.toml',
  'brewcode-reviewer.toml', 'brewcode-tester.toml', 'brewdoc-bd-auto-sync-processor.toml'];
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const CONFIG = path.join(CODEX_HOME, 'config.toml');
const STAMP = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const action = process.argv[2] || 'check';
let injected = false;
let neutralCwd = null;

// Codex reads <cwd ancestors>/.codex/config.toml as a project layer: run it from an empty temp dir.
function codexCwd() {
  if (!neutralCwd) neutralCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'brewcode-codex-cwd-'));
  return neutralCwd;
}

function run(command, args, { capture = false } = {}) {
  const cwd = command === 'codex' ? codexCwd() : ROOT;
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
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

const readJson = file => parseJson(fs.readFileSync(file, 'utf8'), file);
const mirrorRoot = name => path.join(ROOT, '.codex', 'plugins', name);
const mirrorVersion = name => String(readJson(path.join(mirrorRoot(name), '.codex-plugin', 'plugin.json')).version);
const stampedVersion = name => `${readJson(path.join(ROOT, name, '.claude-plugin', 'plugin.json')).version}+codex.local-${STAMP}`;

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
    installed: true,
    sourcePath: item.source?.source === 'local' ? item.source.path : null,
    marketplaceSourceType: item.marketplaceSource?.sourceType || null
  }));
}

function marketplaceNames() {
  const value = parseJson(run('codex', ['plugin', 'marketplace', 'list', '--json'], { capture: true }), 'codex plugin marketplace list');
  return (Array.isArray(value.marketplaces) ? value.marketplaces : []).map(item => item.name);
}

// repo: served from this checkout; copy: a local marketplace holding its own mirror copy; remote: anything else.
function sourceKind(item) {
  if (item.marketplaceName === MARKETPLACE) return 'repo';
  const dir = item.sourcePath;
  if (item.marketplaceSourceType !== 'local' || !dir || path.basename(dir) !== item.name) return 'remote';
  if (!fs.existsSync(path.join(dir, '.codex-plugin', 'plugin.json'))) return 'remote';
  return fs.realpathSync(dir) === fs.realpathSync(mirrorRoot(item.name)) ? 'repo' : 'copy';
}

// Top-level TOML entries with raw lines; multi-line strings and arrays stay whole, tables run to the next header.
function tomlEntries(text) {
  const lines = text.split('\n');
  const entries = [];
  let table = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*\[/.test(line)) {
      table = { kind: 'table', key: line.trim(), lines: [line] };
      entries.push(table);
      continue;
    }
    if (table) { table.lines.push(line); continue; }
    const match = /^\s*([A-Za-z0-9_.-]+|"[^"]*")\s*=\s*(.*)$/.exec(line);
    if (!match) { entries.push({ kind: 'other', lines: [line] }); continue; }
    const entry = { kind: 'key', key: match[1], lines: [line] };
    const value = match[2];
    const delimiter = ["'''", '"""'].find(item => value.startsWith(item));
    if (delimiter && !value.slice(3).includes(delimiter)) {
      while (++index < lines.length) {
        entry.lines.push(lines[index]);
        if (lines[index].includes(delimiter)) break;
      }
    } else if (value.startsWith('[')) {
      let depth = (value.match(/\[/g) || []).length - (value.match(/]/g) || []).length;
      while (depth > 0 && ++index < lines.length) {
        entry.lines.push(lines[index]);
        depth += (lines[index].match(/\[/g) || []).length - (lines[index].match(/]/g) || []).length;
      }
    }
    entries.push(entry);
  }
  return entries;
}

// Shipped agent wins on shared keys; user-only keys keep their value and position, user-only tables go last.
function mergeAgent(shipped, installed) {
  if (installed === null) return shipped;
  const output = tomlEntries(shipped);
  const known = new Set(output.filter(entry => entry.kind !== 'other').map(entry => entry.key));
  let anchor = null;
  for (const entry of tomlEntries(installed)) {
    if (entry.kind === 'other') continue;
    if (entry.kind === 'table') {
      if (!known.has(entry.key)) output.push(entry);
      continue;
    }
    if (!known.has(entry.key)) {
      const at = anchor === null ? -1 : output.findIndex(item => item.kind === 'key' && item.key === anchor);
      output.splice(at + 1, 0, entry);
      known.add(entry.key);
    }
    anchor = entry.key;
  }
  return output.flatMap(entry => entry.lines).join('\n');
}

function agentPlans() {
  const targetRoot = path.join(CODEX_HOME, 'agents');
  const plans = [];
  for (const plugin of PLUGINS) {
    const pluginRoot = path.join(ROOT, plugin);
    const sourceRoot = path.join(pluginRoot, '.codex', 'agents');
    if (!fs.existsSync(sourceRoot)) continue; // git drops an empty agents dir
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
  const targetRoot = path.join(CODEX_HOME, 'agents');
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
    const content = mergeAgent(item.content, item.exists ? item.previous.toString('utf8') : null);
    fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: item.exists ? item.mode : 0o644 });
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

// Copies the mirror into a copy marketplace under a fresh version; the old dir is kept for rollback.
function stageCopy(target, staged) {
  const dir = target.sourcePath;
  const entry = { dir, old: `${dir}.old-${process.pid}`, temporary: `${dir}.staging-${process.pid}` };
  staged.push(entry);
  fs.cpSync(mirrorRoot(target.name), entry.temporary, { recursive: true });
  const manifest = path.join(entry.temporary, '.codex-plugin', 'plugin.json');
  const text = fs.readFileSync(manifest, 'utf8');
  const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${target.targetVersion}$2`);
  if (parseJson(next, manifest).version !== target.targetVersion) throw new Error(`version stamp failed: ${manifest}`);
  fs.writeFileSync(manifest, next);
  mutate(`stage:${target.pluginId}`, () => {
    fs.renameSync(dir, entry.old);
    fs.renameSync(entry.temporary, dir);
  });
}

function restoreStaged(staged, errors) {
  for (const entry of [...staged].reverse()) {
    try {
      if (fs.existsSync(entry.old)) {
        fs.rmSync(entry.dir, { recursive: true, force: true });
        fs.renameSync(entry.old, entry.dir);
      }
      fs.rmSync(entry.temporary, { recursive: true, force: true });
    } catch (error) { errors.push(`staged ${entry.dir}: ${error.message}`); }
  }
}

// Codex has no enable/disable command and `plugin add` forces enabled = true: restore the prior flag line.
function setFlag(text, pluginId, enabled) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.trim() === `[plugins."${pluginId}"]`);
  if (start < 0) throw new Error(`${CONFIG} has no [plugins."${pluginId}"] table`);
  let end = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
  if (end < 0) end = lines.length;
  const at = lines.findIndex((line, index) => index > start && index < end && /^\s*enabled\s*=/.test(line));
  if (at < 0) lines.splice(start + 1, 0, `enabled = ${enabled}`);
  else if (!new RegExp(`^\\s*enabled\\s*=\\s*${enabled}\\b`).test(lines[at])) lines[at] = `enabled = ${enabled}`;
  return lines.join('\n');
}

function writeFlags(targets) {
  const before = fs.readFileSync(CONFIG, 'utf8');
  const after = targets.reduce((text, target) => setFlag(text, target.pluginId, target.enabled), before);
  if (after !== before) fs.writeFileSync(CONFIG, after);
}

function restoreConfig(previous, errors) {
  try {
    if (previous === null) fs.rmSync(CONFIG, { force: true });
    else fs.writeFileSync(CONFIG, previous);
  } catch (error) { errors.push(`config ${CONFIG}: ${error.message}`); }
}

function validate() {
  run('node', [path.join(ROOT, '.codex', 'scripts', 'validate-compat.mjs')]);
  run('node', [path.join(ROOT, '.codex', 'tests', 'hooks.test.mjs')]);
}

// Re-adding a repo plugin installs the current mirror, so only a matching prior version restores exactly.
function assertRestorable(targets) {
  const unsupported = targets.filter(item => item.installedBefore && item.kind === 'repo' && item.version !== item.targetVersion);
  if (unsupported.length) throw new Error(`Repository marketplace cannot restore these versions exactly; no changes were made:\n${unsupported.map(item => `${item.pluginId} version=${item.version} mirror=${item.targetVersion}`).join('\n')}`);
}

function verifyPluginSnapshot(expected, errors) {
  try {
    const current = new Map(managedPlugins().map(item => [item.pluginId, item]));
    const expectedIds = new Set(expected.map(item => item.pluginId));
    for (const item of expected) {
      const actual = current.get(item.pluginId);
      if (!actual || actual.version !== item.version || actual.enabled !== item.enabled) {
        errors.push(`plugin snapshot mismatch for ${item.pluginId}: expected version=${item.version} enabled=${item.enabled}, got ${actual ? `version=${actual.version} enabled=${actual.enabled}` : 'missing'}`);
      }
    }
    for (const item of current.values()) if (!expectedIds.has(item.pluginId)) errors.push(`unexpected managed plugin: ${item.pluginId}`);
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
}

function validateMigrationConflicts(conflicts) {
  const unknown = conflicts.filter(item => item.marketplaceName !== REMOTE_MARKETPLACE || item.version !== REMOTE_VERSION);
  if (unknown.length) {
    throw new Error(`Migration only accepts Brewcode ${REMOTE_VERSION} plugins from ${REMOTE_MARKETPLACE}; no changes were made:\n${unknown.map(item => `${item.pluginId} version=${item.version} enabled=${item.enabled}`).join('\n')}`);
  }
}

function planTargets(pluginsBefore, remotes) {
  const targets = pluginsBefore.filter(item => !remotes.includes(item)).map(item => {
    const kind = sourceKind(item);
    return { ...item, kind, installedBefore: true, targetVersion: kind === 'copy' ? stampedVersion(item.name) : mirrorVersion(item.name) };
  });
  const fresh = name => ({ pluginId: `${name}@${MARKETPLACE}`, name, marketplaceName: MARKETPLACE, kind: 'repo', installedBefore: false, targetVersion: mirrorVersion(name) });
  for (const item of action === 'migrate' ? remotes : []) {
    if (!targets.some(target => target.name === item.name)) targets.push({ ...fresh(item.name), enabled: item.enabled });
  }
  for (const name of action === 'install' ? PLUGINS : []) {
    if (!targets.some(target => target.name === name)) targets.push({ ...fresh(name), enabled: true });
  }
  return targets;
}

if (!['check', 'install', 'update', 'migrate', 'agents'].includes(action)) {
  process.stderr.write('Usage: install-update.mjs [check|install|update|migrate|agents]\n');
  process.exit(2);
}

process.on('exit', () => { if (neutralCwd) fs.rmSync(neutralCwd, { recursive: true, force: true }); });

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

  const marketplacesBefore = marketplaceNames();
  const pluginsBefore = managedPlugins();
  const unavailableSnapshots = pluginsBefore.filter(item => !marketplacesBefore.includes(item.marketplaceName));
  if (unavailableSnapshots.length) throw new Error(`Rollback marketplace is unavailable; no changes were made:\n${unavailableSnapshots.map(item => item.marketplaceName).join('\n')}`);
  const remotes = pluginsBefore.filter(item => sourceKind(item) === 'remote');
  if (action === 'migrate') validateMigrationConflicts(remotes);
  else if (remotes.length) {
    process.stderr.write(`ERROR: Conflicting plugins require the transactional migration command. No changes were made.\nRun: node .codex/scripts/install-update.mjs migrate\n`);
    process.exit(3);
  }
  const targets = planTargets(pluginsBefore, remotes);
  if (!targets.length) throw new Error('No Brewcode Codex plugins are installed; no changes were made. Run: node .codex/scripts/install-update.mjs install');
  assertRestorable(targets);

  const configBefore = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG) : null;
  const staged = [];
  let marketplaceAdded = false;
  try {
    if (targets.some(item => item.marketplaceName === MARKETPLACE) && !marketplacesBefore.includes(MARKETPLACE)) {
      mutate('marketplace:add', () => {
        run('codex', ['plugin', 'marketplace', 'add', ROOT]);
        marketplaceAdded = true;
      });
    }
    for (const target of targets.filter(item => item.kind === 'copy')) stageCopy(target, staged);
    for (const item of remotes) mutate(`plugin:remove:${item.pluginId}`, () => run('codex', ['plugin', 'remove', item.pluginId]));
    for (const target of targets) mutate(`plugin:add:${target.pluginId}`, () => run('codex', ['plugin', 'add', target.pluginId, '--json'], { capture: true }));
    mutate('config:flags', () => writeFlags(targets));
    installAgents(agentsBefore);
    const verificationErrors = [];
    verifyPluginSnapshot(targets.map(item => ({ pluginId: item.pluginId, version: item.targetVersion, enabled: item.enabled })), verificationErrors);
    if (verificationErrors.length) throw new Error(verificationErrors.join('; '));
  } catch (error) {
    const errors = [];
    restoreStaged(staged, errors);
    rollbackPlugins(pluginsBefore, marketplaceAdded, errors);
    restoreConfig(configBefore, errors);
    restoreAgents(agentsBefore, errors);
    verifyPluginSnapshot(pluginsBefore, errors);
    throw new Error(`${error.message}\nRollback: ${errors.length ? errors.join('; ') : 'complete'}`);
  }
  for (const entry of staged) fs.rmSync(entry.old, { recursive: true, force: true });

  const summary = targets.map(item => `${item.pluginId} ${item.targetVersion} ${item.enabled ? 'enabled' : 'disabled'}`).join('\n');
  process.stdout.write(`Codex ${action} complete; enabled flags kept, user agent keys kept, retired agents removed:\n${summary}\nReview hook definitions with /hooks, then start a new session.\n`);
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exit(1);
}
