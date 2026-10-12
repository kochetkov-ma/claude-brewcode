/** Shared utilities for brewcode hooks */
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync, appendFileSync, lstatSync, readlinkSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { homedir } from 'os';

// Project root: CLAUDE_PROJECT_DIR -> upward walk for .git/.claude -> hook cwd; never throws.
// Hook `cwd` drifts mid-session (CwdChanged) -> never the root for config/state/log paths.
export function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  const start = resolve(hookCwd || process.cwd());
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.claude'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return start; // last resort: never guess, never throw in a hook
}

/** Parsed stdin JSON; throws on empty or invalid input (callers fail open) */
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid stdin JSON: ${e.message}. Input: ${input.substring(0, 100)}`);
  }
}

/** The hook's ONE stdout line: its JSON response */
export function output(response) {
  console.log(JSON.stringify(response));
}

/** Cap for text channels (additionalContext etc.), under the 10,000-char disk-spill threshold */
export const TEXT_CHANNEL_CAP = 9000;

/** Truncate a text-channel payload to stay under the cap */
export function capText(s, max = TEXT_CHANNEL_CAP) {
  return (typeof s === 'string' && s.length > max) ? s.slice(0, max) + '\n...[truncated]' : s;
}

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const LOG_FILE = '.claude/logs/brewcode.log';
const DEFAULT_LEVEL = 'info';

// Level: BREWCODE_LOG_LEVEL env, else 'info'.
function getLogLevel() {
  const env = (process.env.BREWCODE_LOG_LEVEL || '').toLowerCase();
  return Object.hasOwn(LOG_LEVELS, env) ? env : DEFAULT_LEVEL;
}

/** Append to <cwd>/.claude/logs/brewcode.log and mirror to stderr (debug-only surface) when the level allows */
export function log(level, prefix, message, cwd, sessionId = null) {
  if (!cwd) {
    if (level === 'error') console.error(`${prefix} ${message}`);
    return;
  }
  if (LOG_LEVELS[level] > LOG_LEVELS[getLogLevel()]) return;
  console.error(`${prefix} ${message}`);

  const timestamp = new Date().toISOString();
  const levelTag = level.toUpperCase().padEnd(5);
  const sessionTag = (typeof sessionId === 'string' && sessionId)
    ? `[${sessionId.slice(0, 8)}] `
    : '';
  const line = `${timestamp} ${levelTag} ${sessionTag}${prefix} ${message}`;

  // Write to file
  try {
    const logPath = join(cwd, LOG_FILE);
    const logDir = dirname(logPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    appendFileSync(logPath, line + '\n');
  } catch {
    // Ignore file write errors - don't break hooks
  }
}

const STATE_FILE = '.claude/tasks/cfg/brewcode.state.json';

/** Persistent per-project state; `{}` when absent or unreadable */
export function getState(cwd) {
  try {
    const statePath = join(cwd, STATE_FILE);
    if (existsSync(statePath)) {
      return JSON.parse(readFileSync(statePath, 'utf8'));
    }
  } catch (e) {
    log('warn', '[state]', `Failed to read state: ${e.message}`, cwd);
  }
  return {};
}

/** Atomic (tmp + rename) write of the per-project state */
export function saveState(cwd, state) {
  try {
    const statePath = join(cwd, STATE_FILE);
    const stateDir = dirname(statePath);
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    const tmpPath = statePath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    renameSync(tmpPath, statePath);
  } catch (e) {
    log('warn', '[state]', `Failed to save state: ${e.message}`, cwd);
  }
}

/** Claude Code config dir: `CLAUDE_CONFIG_DIR` (inherited by hook processes), else `~/.claude` */
export function configDir() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  return env ? resolve(env) : join(homedir(), '.claude');
}

// Plan dir as Claude Code resolves it: effective `plansDirectory` (local > project > user) when inside
// project root with no backslash off Windows, else `<configDir>/plans`.
export function resolvePlansDir(root, sessionId = null) {
  const fallback = join(configDir(), 'plans');
  const candidates = [
    join(root, '.claude', 'settings.local.json'),
    join(root, '.claude', 'settings.json'),
    join(configDir(), 'settings.json')
  ];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const value = JSON.parse(readFileSync(file, 'utf8')).plansDirectory;
      if (typeof value !== 'string' || value === '') continue;
      const dir = resolve(root, value);
      const inside = dir === root || dir.startsWith(root + sep);
      return inside && !(sep === '/' && dir.includes('\\')) ? dir : fallback;
    } catch (e) {
      log('warn', '[plans]', `Ignoring unreadable settings ${file}: ${e.message}`, root, sessionId);
    }
  }
  return fallback;
}

/** Project-local plan link: written by session-start.mjs, read by compact-recall.mjs */
export const latestPlanLink = root => join(root, '.claude', 'plans', 'LATEST.md');

/** Absolute target of a symlink; null when `link` is absent or not a symlink */
export function symlinkTarget(link) {
  try {
    return lstatSync(link).isSymbolicLink() ? resolve(dirname(link), readlinkSync(link)) : null;
  } catch {
    return null;
  }
}

/** Ours = the target session-start recorded (any config dir), or an unrecorded link into `plansDir` */
export function ownsPlanTarget(root, target, plansDir) {
  return target === getState(root)._planLink || target === plansDir || target.startsWith(plansDir + sep);
}
