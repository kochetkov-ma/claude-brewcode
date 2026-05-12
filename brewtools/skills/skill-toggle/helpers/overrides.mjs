// brewtools:skill-toggle — settings.json skillOverrides helper.
// Writes survive plugin updates (Claude Code 2.1.115+).
// Atomic: temp file + rename. Lockfile: O_CREAT|O_EXCL, 5 retries x 100ms.
// Modes: 'off' | 'user-invocable-only' | 'name-only' | 'on' ('on' deletes entry).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const VALID_MODES = new Set(['off', 'user-invocable-only', 'name-only', 'on']);
const DEFAULT_SETTINGS = '~/.claude/settings.json';

function resolveHome(p) {
  if (!p) return p;
  if (p === '~') return process.env.HOME || os.homedir();
  if (p.startsWith('~/')) return path.join(process.env.HOME || os.homedir(), p.slice(2));
  return p;
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
// returns the token; releaseLock verifies match before unlink.
// Failure mode: if a writer stalls >60s another process may steal the lock; the
// stalled writer detects this on release and aborts unlink. A's already-written
// settings.json may have been overwritten by B — token check prevents A from
// further clobbering B's lockfile.
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
      // Stale lock detection: malformed PID, dead process, or age > 60s
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
  try {
    const current = fs.readFileSync(lockPath, 'utf8').trim();
    if (token && current !== token) {
      process.stderr.write(`[skill-toggle] lock stolen: expected token ${token}, found ${current} at ${lockPath}. Not unlinking.\n`);
      return;
    }
    fs.unlinkSync(lockPath);
  } catch {}
}

/**
 * Read skillOverrides from settings.json.
 * @param {string} settingsPath - path with optional ~ prefix
 * @returns {object} skillOverrides object, or {} if missing/unreadable
 */
export function readOverrides(settingsPath = DEFAULT_SETTINGS) {
  const fp = resolveHome(settingsPath);
  const settings = readJsonSafe(fp);
  const o = settings.skillOverrides;
  return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
}

/**
 * Write a single skill override entry atomically.
 * @param {string} plugin - plugin name (e.g. 'brewui')
 * @param {string} name - skill name (e.g. 'image-gen')
 * @param {string} mode - 'off' | 'user-invocable-only' | 'name-only' | 'on'
 * @param {object} opts - { settingsPath, retries, delayMs }
 * @returns {object} { key, mode, action, file }
 */
export async function writeOverride(plugin, name, mode, opts = {}) {
  if (!plugin || typeof plugin !== 'string') throw new Error('plugin required');
  if (!name || typeof name !== 'string') throw new Error('name required');
  if (!VALID_MODES.has(mode)) throw new Error(`invalid mode '${mode}' — must be one of: ${[...VALID_MODES].join(', ')}`);

  const settingsPath = resolveHome(opts.settingsPath || DEFAULT_SETTINGS);
  const lockPath = `${settingsPath}.lock`;
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });

  const lockToken = await acquireLock(lockPath, { retries: opts.retries ?? 5, delayMs: opts.delayMs ?? 100 });
  try {
    const settings = readJsonSafe(settingsPath);
    const overrides = (settings.skillOverrides && typeof settings.skillOverrides === 'object' && !Array.isArray(settings.skillOverrides))
      ? { ...settings.skillOverrides }
      : {};
    const key = `${plugin}:${name}`;
    let action;
    if (mode === 'on') {
      if (key in overrides) { delete overrides[key]; action = 'deleted'; }
      else action = 'noop';
    } else {
      overrides[key] = mode;
      action = 'written';
    }
    const merged = { ...settings, skillOverrides: overrides };
    if (Object.keys(overrides).length === 0) delete merged.skillOverrides;

    const tmp = `${settingsPath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, settingsPath);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }

    return { key, mode, action, file: settingsPath };
  } finally {
    releaseLock(lockPath, lockToken);
  }
}

/**
 * Flat list of all current overrides.
 * @param {string} settingsPath
 * @returns {Array<{plugin, name, mode}>}
 */
export function listOverrides(settingsPath = DEFAULT_SETTINGS) {
  const overrides = readOverrides(settingsPath);
  const out = [];
  for (const [key, mode] of Object.entries(overrides)) {
    const idx = key.indexOf(':');
    if (idx <= 0) continue;
    out.push({ plugin: key.slice(0, idx), name: key.slice(idx + 1), mode });
  }
  return out;
}
