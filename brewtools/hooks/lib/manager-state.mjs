// brewcode-meta: version=6.10.0 content_version=6.8.0 generated_by=brewtools:manager-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov
// brewtools:manager-setup — Manager state {hard, level, mode:'full', mcpAllow?} in <root>/.claude/brewtools/manager/state.json.

// CLI `get|set` is the only Bash shape the HARD wall guard self-exempts: keep it argument-strict
// (unknown key/value/flag -> non-zero exit, nothing written).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_STATE = { hard: false, level: 'balanced', mode: 'full' };
// Scoped `mcp__server__tool` or `mcp__server__*`; hardmode-guard.mjs MCP_ALLOW_ENTRY_SRC must match
// (it ships self-contained; the manager-setup suite asserts parity).
const MCP_ALLOW_ENTRY = /^mcp__[A-Za-z0-9_.-]+__([A-Za-z0-9_.-]+|\*)$/;
const VALID_SCOPES = new Set(['project', 'global']);

const GENERATED_BY = 'brewtools:manager-setup';

// LOCAL `YYYY-MM-DD` (= `date +%F`); toISOString() is UTC and skews the staleness date.
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Writer version: ../../.claude-plugin/plugin.json, else own `brewcode-meta` stamp; null (never
// 'unknown', never a throw: this is the wall's off-switch) when both are unreadable.
function pluginVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8'));
    if (pkg && /^\d+\.\d+\.\d+/.test(pkg.version)) return pkg.version;
  } catch {}
  try {
    const first = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n', 1)[0];
    const m = /brewcode-meta: version=(\d+\.\d+\.\d+)/.exec(first);
    if (m) return m[1];
  } catch {}
  return null;
}

// content_version from this file's own first-line stamp (sole carrier); null when absent.
function resolveContentVersion() {
  try {
    const first = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n', 1)[0];
    const m = /content_version=(\d+\.\d+\.\d+)/.exec(first);
    if (m) return m[1];
  } catch {}
  return null;
}

function resolveHome(p) {
  if (!p) return p;
  if (p === '~') return process.env.HOME || os.homedir();
  if (p.startsWith('~/')) return path.join(process.env.HOME || os.homedir(), p.slice(2));
  return p;
}

// One resolver for brewtools hooks: lives here because this file is copied ALONE into projects.
export const configDir = () => (process.env.CLAUDE_CONFIG_DIR
  ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(process.env.HOME || os.homedir(), '.claude'));

/** state.json path: 'project' (cwd = project root) | 'global' (config dir; Write-protected) */
export function resolveStatePath(scope, cwd = process.cwd()) {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`invalid scope '${scope}' — must be one of: ${[...VALID_SCOPES].join(', ')}`);
  }
  if (scope === 'global') return path.join(configDir(), 'manager', 'state.json');
  return path.join(cwd, '.claude', 'brewtools', 'manager', 'state.json');
}

function clampMode(merged) {
  // mode is vestigial — always 'full'; plan mode is never stored as state.mode.
  if (merged.mode !== 'full') merged.mode = 'full';
  return merged;
}

function clampLevel(merged) {
  if (!['strict', 'balanced'].includes(merged.level)) merged.level = 'balanced';
  return merged;
}

// Optional key: keep only well-formed scoped names. A malformed value is DROPPED, never
// repaired into something permissive — this list only ever widens what the guard allows.
function clampMcpAllow(merged) {
  if (!('mcpAllow' in merged)) return merged;
  merged.mcpAllow = Array.isArray(merged.mcpAllow)
    ? merged.mcpAllow.filter(e => typeof e === 'string' && MCP_ALLOW_ENTRY.test(e))
    : [];
  return merged;
}

function readJsonSafe(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
  } catch {
    return null;
  }
}

// SECURITY: hard + level come ONLY from the PROJECT state.json (a global one never arms the wall);
// mode resolves project -> global -> default.
export function resolveState(cwd = process.cwd()) {
  try {
    const project = readJsonSafe(resolveStatePath('project', cwd));
    const global  = readJsonSafe(resolveStatePath('global', cwd));
    const hard  = (project && typeof project.hard === 'boolean') ? project.hard : DEFAULT_STATE.hard;
    const level = (project && project.level) ? project.level : DEFAULT_STATE.level;
    const mode  = (project && project.mode) ?? (global && global.mode) ?? DEFAULT_STATE.mode;
    const source = project ? 'project' : (global ? 'global' : 'default');
    // Other PROJECT keys (version/generated_by/last_updated, future ones) pass through; nothing
    // is invented, so a stale state stays visibly stale.
    const resolved = clampMcpAllow(clampLevel(clampMode({ ...(project || {}), hard, level, mode, source })));
    // Legacy `doc_type` from a pre-spec write is dropped on READ too, not only on write:
    // otherwise every consumer sees it until the next write happens to occur.
    delete resolved.doc_type;
    return resolved;
  } catch {
    return { ...DEFAULT_STATE, source: 'default' };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function acquireLock(lockPath, { retries = 5, delayMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const token = `${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
      fs.writeSync(fd, token);
      fs.closeSync(fd);
      return token;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const lockContent = fs.readFileSync(lockPath, 'utf8').trim();
        const lockPid = parseInt(lockContent.split(':')[0], 10);
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        let stale = false;
        if (!Number.isFinite(lockPid) || lockPid <= 0) {
          stale = true;
        } else {
          try { process.kill(lockPid, 0); } catch (killErr) { if (killErr.code === 'ESRCH') stale = true; }
        }
        if (!stale && ageMs > 60_000) stale = true;
        if (stale) { try { fs.unlinkSync(lockPath); } catch {} continue; }
      } catch {
        // lockfile vanished between EEXIST and stat — race, retry
      }
      if (i === retries - 1) {
        throw new Error(`Could not acquire lock ${lockPath} after ${retries} attempts. Remove it manually if stale.`);
      }
      await sleep(delayMs);
    }
  }
  return null;
}

function releaseLock(lockPath, token) {
  if (!token) return;
  try {
    const current = fs.readFileSync(lockPath, 'utf8').trim();
    if (token && current !== token) {
      process.stderr.write(`[manager-state] lock stolen at ${lockPath}. Not unlinking.\n`);
      return;
    }
    fs.unlinkSync(lockPath);
  } catch {}
}

function writeAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

/** Merge `partial` into the scope's state.json under a lockfile, tmp + rename -> {file, action, state} */
export async function writeState(scope, partial, cwd = process.cwd()) {
  const filePath = resolveStatePath(scope, cwd);
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const token = await acquireLock(lockPath);
  if (!token) throw new Error('could not acquire lock');
  try {
    const existing = readJsonSafe(filePath) || {};
    // Provenance is stamped by the WRITER only, so setup-status sees the state's real age.
    // No `doc_type`: frontmatter-only field.
    const version = pluginVersion();
    const contentVersion = resolveContentVersion();
    const merged = {
      ...existing,
      ...partial,
      generated_by: GENERATED_BY,
      last_updated: localDate()
    };
    if (version) merged.version = version;
    else {
      // Drop, never fake: absent `version` is a documented reader path (setup-status, status),
      // and an inherited key would claim the older file's version.
      delete merged.version;
      process.stderr.write('[manager-state] plugin version unresolvable — wrote state without a version key\n');
    }
    if (contentVersion) merged.content_version = contentVersion;
    else {
      // Same drop-not-fake rule as version.
      delete merged.content_version;
      process.stderr.write('[manager-state] content_version unresolvable — wrote state without a content_version key\n');
    }
    delete merged.doc_type; // legacy key from pre-spec writes; JSON carriers never take it
    writeAtomic(filePath, merged);
    return { file: filePath, action: 'written', state: merged };
  } finally {
    releaseLock(lockPath, token);
  }
}

// ---- CLI: `set hard=false` is the documented HARD wall off-switch; keep parsing strict ----

const CLI_USAGE = 'usage: node manager-state.mjs get [--cwd DIR] | set hard=<true|false> level=<strict|balanced> mcpAllow=<mcp__srv__tool[,...]|> [--cwd DIR]';

const SETTABLE = {
  hard: v => (v === 'true' ? true : v === 'false' ? false : undefined),
  level: v => (v === 'strict' || v === 'balanced' ? v : undefined),
  // Comma-separated scoped names; the empty value clears the list. Any malformed entry
  // rejects the whole argument — a half-applied allowlist is worse than none.
  mcpAllow: v => {
    if (v === '') return [];
    const entries = v.split(',');
    return entries.every(e => MCP_ALLOW_ENTRY.test(e)) ? entries : undefined;
  }
};

// Mirrors semble isProfileParent: HOME or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === path.join(p, '.claude');
}

// CLI root without --cwd: the project this copy is installed in -> CLAUDE_PROJECT_DIR -> nearest
// .git/.claude above cwd (profile parents skipped) -> cwd. Raw cwd drifts, and `set hard=false` there disarmed nothing.
function defaultRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const installed = path.sep + path.join('.claude', 'brewtools', 'manager');
  if (here.endsWith(installed)) return here.slice(0, -installed.length);
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && fs.existsSync(env)) return path.resolve(env);
  const start = process.cwd();
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    if (path.dirname(dir) === dir) return start;
  }
}

/** Strict argv parse (after the script path) -> {command: 'get'|'set', patch, cwd}; throws on anything unknown */
export function parseCliArgs(argv) {
  const command = argv[0];
  if (command !== 'get' && command !== 'set') throw new Error(`unknown command '${command ?? ''}'`);

  const patch = {};
  let cwd = defaultRoot();

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cwd') {
      const next = argv[++i];
      if (!next) throw new Error('--cwd requires a directory');
      cwd = path.resolve(resolveHome(next));
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown flag '${arg}'`);
    if (command !== 'set') throw new Error(`'get' takes no key=value pairs (got '${arg}')`);

    const eq = arg.indexOf('=');
    if (eq < 1) throw new Error(`expected key=value, got '${arg}'`);
    const key = arg.slice(0, eq);
    const raw = arg.slice(eq + 1);
    if (!Object.hasOwn(SETTABLE, key)) throw new Error(`unknown key '${key}' — settable: ${Object.keys(SETTABLE).join(', ')}`);
    const value = SETTABLE[key](raw);
    if (value === undefined) throw new Error(`invalid value '${raw}' for '${key}'`);
    patch[key] = value;
  }

  if (command === 'set' && Object.keys(patch).length === 0) throw new Error('set requires at least one key=value');
  return { command, patch, cwd };
}

async function runCli(argv) {
  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (e) {
    process.stderr.write(`manager-state: ${e.message}\n${CLI_USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    if (parsed.command === 'get') {
      process.stdout.write(JSON.stringify(resolveState(parsed.cwd)) + '\n');
      return;
    }
    // `hard`/`level` are PROJECT-scope only — there is no global wall.
    const r = await writeState('project', parsed.patch, parsed.cwd);
    process.stdout.write(JSON.stringify(r) + '\n');
  } catch (e) {
    process.stderr.write(`manager-state: ${e.message}\n`);
    process.exitCode = 1;
  }
}

// realpath argv[1]: ESM resolves symlinks (/var -> /private/var), else the CLI no-ops with exit 0
// and `set hard=false` seems to succeed while writing nothing.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (invokedDirectly()) {
  await runCli(process.argv.slice(2));
}
