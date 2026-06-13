// brewtools:agent-toggle — settings.json permissions.deny helper.
// Native Claude Code mechanism: permissions.deny ["Agent(<bareName>)"] removes a
// subagent from the model context. Survives plugin updates (no reapply hook).
// Atomic: temp file + rename. Lockfile: O_CREAT|O_EXCL with stale-lock detection.
// Scopes: 'global' (~/.claude/settings.json), 'project' (<cwd>/.claude/settings.json),
//         'local' (<cwd>/.claude/settings.local.json).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const VALID_SCOPES = new Set(['global', 'project', 'local']);

function resolveHome(p) {
  if (!p) return p;
  if (p === '~') return process.env.HOME || os.homedir();
  if (p.startsWith('~/')) return path.join(process.env.HOME || os.homedir(), p.slice(2));
  return p;
}

/**
 * Resolve settings.json path for a scope.
 * @param {string} scope - 'global' | 'project' | 'local'
 * @param {string} cwd - project root for project/local scopes (default process.cwd())
 * @returns {string} absolute settings file path
 */
export function resolveSettingsPath(scope, cwd = process.cwd()) {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`invalid scope '${scope}' — must be one of: ${[...VALID_SCOPES].join(', ')}`);
  }
  if (scope === 'global') return resolveHome('~/.claude/settings.json');
  if (scope === 'project') return path.join(cwd, '.claude', 'settings.json');
  return path.join(cwd, '.claude', 'settings.local.json');
}

/**
 * Strip any 'plugin:' prefix the user passes (e.g. 'brewtools:ssh-admin' -> 'ssh-admin').
 * @param {string} name
 * @returns {string} bare agent name
 */
export function bareName(name) {
  if (!name || typeof name !== 'string') throw new Error('name required');
  const idx = name.indexOf(':');
  return idx >= 0 ? name.slice(idx + 1) : name;
}

function denyEntry(bare) {
  return `Agent(${bare})`;
}

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Lock identity hardening: lockfile contents = `${pid}:${randomHex16}`. acquireLock
// returns the token; releaseLock verifies match before unlink. Stale lock (dead pid,
// malformed pid, or age > 60s) is reclaimed.
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
        const pidPart = lockContent.split(':')[0];
        const lockPid = parseInt(pidPart, 10);
        const lockStat = fs.statSync(lockPath);
        const ageMs = Date.now() - lockStat.mtimeMs;
        let stale = false;
        if (!Number.isFinite(lockPid) || lockPid <= 0) {
          stale = true;
        } else {
          try {
            process.kill(lockPid, 0);
          } catch (killErr) {
            if (killErr.code === 'ESRCH') stale = true;
          }
        }
        if (!stale && ageMs > 60_000) stale = true;
        if (stale) {
          try { fs.unlinkSync(lockPath); } catch {}
          continue;
        }
      } catch (statErr) {
        // lockfile vanished between EEXIST and stat — race, retry
      }
      if (i === retries - 1) {
        throw new Error(`Could not acquire lock ${lockPath} after ${retries} attempts (${delayMs}ms each). Another process may be writing settings.json. Remove ${lockPath} manually if stale.`);
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
      process.stderr.write(`[agent-toggle] lock stolen: expected token ${token}, found ${current} at ${lockPath}. Not unlinking.\n`);
      return;
    }
    fs.unlinkSync(lockPath);
  } catch {}
}

function writeAtomic(settingsPath, merged) {
  const tmp = `${settingsPath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, settingsPath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

/**
 * Read the current permissions.deny array for a scope.
 * @param {string} scope
 * @param {object} opts - { cwd }
 * @returns {string[]} deny entries (or [])
 */
export function readDeny(scope, opts = {}) {
  const fp = resolveSettingsPath(scope, opts.cwd);
  const settings = readJsonSafe(fp);
  const perms = settings.permissions;
  if (!perms || typeof perms !== 'object' || Array.isArray(perms)) return [];
  return Array.isArray(perms.deny) ? perms.deny : [];
}

/**
 * Add an Agent(<bare>) deny entry for a scope (idempotent, atomic).
 * Preserves all unrelated settings keys (permissions.allow/ask, top-level keys).
 * @param {string} scope
 * @param {string} agentName - bare or plugin-qualified
 * @param {object} opts - { cwd, retries, delayMs }
 * @returns {object} { key, entry, action, file } action='added'|'noop'
 */
export async function addDeny(scope, agentName, opts = {}) {
  const bare = bareName(agentName);
  const entry = denyEntry(bare);
  const settingsPath = resolveSettingsPath(scope, opts.cwd);
  const lockPath = `${settingsPath}.lock`;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  const token = await acquireLock(lockPath, { retries: opts.retries ?? 5, delayMs: opts.delayMs ?? 100 });
  if (!token) throw new Error('could not acquire lock');
  try {
    const settings = readJsonSafe(settingsPath);
    const perms = (settings.permissions && typeof settings.permissions === 'object' && !Array.isArray(settings.permissions))
      ? { ...settings.permissions }
      : {};
    const deny = Array.isArray(perms.deny) ? [...perms.deny] : [];

    let action;
    if (deny.includes(entry)) {
      action = 'noop';
    } else {
      deny.push(entry);
      action = 'added';
    }
    perms.deny = deny;

    const merged = { ...settings, permissions: perms };
    if (action === 'added') writeAtomic(settingsPath, merged);

    return { key: bare, entry, action, file: settingsPath };
  } finally {
    releaseLock(lockPath, token);
  }
}

/**
 * Remove an Agent(<bare>) deny entry for a scope (atomic).
 * Prunes empty deny array and empty permissions object.
 * Preserves all unrelated settings keys.
 * @param {string} scope
 * @param {string} agentName - bare or plugin-qualified
 * @param {object} opts - { cwd, retries, delayMs }
 * @returns {object} { entry, action, file } action='removed'|'noop'
 */
export async function removeDeny(scope, agentName, opts = {}) {
  const bare = bareName(agentName);
  const entry = denyEntry(bare);
  const settingsPath = resolveSettingsPath(scope, opts.cwd);
  const lockPath = `${settingsPath}.lock`;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  const token = await acquireLock(lockPath, { retries: opts.retries ?? 5, delayMs: opts.delayMs ?? 100 });
  if (!token) throw new Error('could not acquire lock');
  try {
    const settings = readJsonSafe(settingsPath);
    const perms = (settings.permissions && typeof settings.permissions === 'object' && !Array.isArray(settings.permissions))
      ? { ...settings.permissions }
      : {};
    const deny = Array.isArray(perms.deny) ? [...perms.deny] : [];

    if (!deny.includes(entry)) {
      return { entry, action: 'noop', file: settingsPath };
    }
    const nextDeny = deny.filter(e => e !== entry);
    if (nextDeny.length === 0) delete perms.deny;
    else perms.deny = nextDeny;

    const merged = { ...settings };
    if (Object.keys(perms).length === 0) delete merged.permissions;
    else merged.permissions = perms;

    writeAtomic(settingsPath, merged);
    return { entry, action: 'removed', file: settingsPath };
  } finally {
    releaseLock(lockPath, token);
  }
}

/**
 * List bare agent names currently denied in a scope (parsed from Agent(...) entries).
 * @param {string} scope
 * @param {object} opts - { cwd }
 * @returns {string[]} bare names
 */
export function listDeniedAgents(scope, opts = {}) {
  const deny = readDeny(scope, opts);
  const out = [];
  for (const e of deny) {
    if (typeof e !== 'string') continue;
    const m = e.match(/^Agent\((.+)\)$/);
    if (m) out.push(m[1]);
  }
  return out;
}
