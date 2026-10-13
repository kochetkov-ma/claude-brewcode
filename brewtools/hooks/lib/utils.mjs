/** Shared utilities for brewtools hooks */
import { existsSync, mkdirSync, appendFileSync, realpathSync } from 'fs';
import { dirname, join, resolve } from 'path';

// Mirrors semble isProfileParent: HOME or the active config dir's parent holds a profile .claude, never a root.
export function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === join(p, '.claude');
}

// Project root: CLAUDE_PROJECT_DIR -> upward walk for .git/.claude (profile parents skipped) -> hook cwd. Never throws.
// Hook `cwd` drifts mid-session, so it is never the root for state/prompt/log paths.
export function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  const start = resolve(hookCwd || process.cwd());
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return start;
}

/** Read stdin as JSON; throws on invalid input */
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

/** Print hook response as one JSON line to stdout */
export function output(response) {
  try {
    console.log(JSON.stringify(response));
  } catch (e) {
    console.error(`[output] Serialization failed: ${e.message}`);
    console.log(JSON.stringify({ error: `Serialization failed: ${e.message}` }));
  }
}

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const LOG_FILE = '.claude/logs/brewtools.log';
const DEFAULT_LEVEL = 'info';

// Level: BREWCODE_LOG_LEVEL env, else 'info'.
function getLevel() {
  const env = (process.env.BREWCODE_LOG_LEVEL || '').toLowerCase();
  return Object.hasOwn(LOG_LEVELS, env) ? env : DEFAULT_LEVEL;
}

/** Log to stderr + `<cwd>/.claude/logs/brewtools.log`; no cwd -> errors to stderr only */
export function log(level, prefix, message, cwd, sessionId = null) {
  if (!cwd) {
    if (level === 'error') console.error(`${prefix} ${message}`);
    return;
  }
  if (LOG_LEVELS[level] > LOG_LEVELS[getLevel()]) return;
  console.error(`${prefix} ${message}`);

  const timestamp = new Date().toISOString();
  const levelTag = level.toUpperCase().padEnd(5);
  const sessionTag = (typeof sessionId === 'string' && sessionId)
    ? `[${sessionId.slice(0, 8)}] `
    : '';
  const line = `${timestamp} ${levelTag} ${sessionTag}${prefix} ${message}`;

  try {
    const logPath = join(cwd, LOG_FILE);
    const logDir = dirname(logPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    appendFileSync(logPath, line + '\n');
  } catch {
    // Ignore file write errors
  }
}
