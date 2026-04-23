/**
 * Shared utilities for brewtools hooks
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Read JSON from stdin
 * @returns {Promise<Object>} Parsed JSON input
 */
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

/**
 * Output hook response as JSON to stdout
 * @param {Object} response - Hook response object
 */
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
const LOG_CONFIG = '.claude/tasks/cfg/brewcode.config.json';
const DEFAULT_LEVEL = 'info';

let _cachedLevel = null;
function getLevel(cwd) {
  if (_cachedLevel) return _cachedLevel;
  const env = (process.env.BREWCODE_LOG_LEVEL || '').toLowerCase();
  if (env in LOG_LEVELS) { _cachedLevel = env; return env; }
  if (cwd) {
    try {
      const cfg = JSON.parse(readFileSync(join(cwd, LOG_CONFIG), 'utf8'));
      const lvl = cfg.logging?.level;
      if (lvl && lvl in LOG_LEVELS) { _cachedLevel = lvl; return lvl; }
    } catch {}
  }
  _cachedLevel = DEFAULT_LEVEL;
  return DEFAULT_LEVEL;
}

/**
 * Log message to file and stderr
 * @param {string} level - Log level
 * @param {string} prefix - Log prefix
 * @param {string} message - Log message
 * @param {string} cwd - Current working directory
 * @param {string|null} sessionId - Optional session ID
 */
export function log(level, prefix, message, cwd, sessionId = null) {
  if (!cwd) {
    if (level === 'error') console.error(`${prefix} ${message}`);
    return;
  }
  if (LOG_LEVELS[level] > LOG_LEVELS[getLevel(cwd)]) return;
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
