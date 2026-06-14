// brewtools:manager — Manager mode state resolver/writer.
// State shape: { hard:boolean, level:'strict'|'balanced', mode:'full'|'planmode' }.
//   hard  — HARD wall toggle (PreToolUse guard physically denies main-session tools)
//   level — HARD wall strictness: 'strict' (deny all non-read) | 'balanced' (allow read-only bash/search)
//   mode  — soft codeword injection mode: 'full' | 'planmode'
// project: <cwd>/.claude/brewtools/manager/state.json
// global:  ~/.claude/manager/state.json  (protected for Write tool — only writable here)
// resolveState: hard + level are PROJECT-ONLY (a global state.json must NOT enable the
//   wall in projects lacking their own state.json); mode resolves project -> global -> default.
// Atomic write: lockfile O_CREAT|O_EXCL + stale detection, tmp + rename.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_STATE = { hard: false, level: 'balanced', mode: 'full' };
const VALID_SCOPES = new Set(['project', 'global']);

function resolveHome(p) {
  if (!p) return p;
  if (p === '~') return process.env.HOME || os.homedir();
  if (p.startsWith('~/')) return path.join(process.env.HOME || os.homedir(), p.slice(2));
  return p;
}

/**
 * Resolve state.json path for a scope.
 * @param {string} scope - 'project' | 'global'
 * @param {string} cwd - project root for project scope
 * @returns {string} absolute state file path
 */
export function resolveStatePath(scope, cwd = process.cwd()) {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`invalid scope '${scope}' — must be one of: ${[...VALID_SCOPES].join(', ')}`);
  }
  if (scope === 'global') return resolveHome('~/.claude/manager/state.json');
  return path.join(cwd, '.claude', 'brewtools', 'manager', 'state.json');
}

function clampMode(merged) {
  if (!['full', 'planmode'].includes(merged.mode)) merged.mode = 'full';
  return merged;
}

function clampLevel(merged) {
  if (!['strict', 'balanced'].includes(merged.level)) merged.level = 'balanced';
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

/**
 * Resolve effective Manager state.
 * SECURITY: `hard` and `level` come ONLY from the PROJECT state.json — a global
 * state.json must never enable the HARD wall in projects without their own state.
 * `mode` resolves project -> global -> default.
 * @param {string} cwd
 * @returns {{hard:boolean, level:string, mode:string, source:'project'|'global'|'default'}}
 */
export function resolveState(cwd = process.cwd()) {
  try {
    const project = readJsonSafe(resolveStatePath('project', cwd));
    const global  = readJsonSafe(resolveStatePath('global', cwd));
    const hard  = (project && typeof project.hard === 'boolean') ? project.hard : DEFAULT_STATE.hard;
    const level = (project && project.level) ? project.level : DEFAULT_STATE.level;
    const mode  = (project && project.mode) ?? (global && global.mode) ?? DEFAULT_STATE.mode;
    const source = project ? 'project' : (global ? 'global' : 'default');
    return clampLevel(clampMode({ hard, level, mode, source }));
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

/**
 * Write (merge) Manager state for a scope, atomically.
 * @param {string} scope - 'project' | 'global'
 * @param {object} partial - fields to merge (e.g. { enabled:false } or { mode:'planmode' })
 * @param {string} cwd
 * @returns {{file:string, action:'written', state:object}}
 */
export async function writeState(scope, partial, cwd = process.cwd()) {
  const filePath = resolveStatePath(scope, cwd);
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const token = await acquireLock(lockPath);
  if (!token) throw new Error('could not acquire lock');
  try {
    const existing = readJsonSafe(filePath) || {};
    const merged = { ...existing, ...partial };
    writeAtomic(filePath, merged);
    return { file: filePath, action: 'written', state: merged };
  } finally {
    releaseLock(lockPath, token);
  }
}
