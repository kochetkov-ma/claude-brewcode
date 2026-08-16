/**
 * Shared utilities for brewcode hooks
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync, appendFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

/**
 * Project root: CLAUDE_PROJECT_DIR -> upward walk for a root marker -> hook cwd. Never throws.
 * Hook `cwd` is "the working directory when the hook is invoked" and drifts mid-session
 * (docs/hooks.md:717, CwdChanged), so it is never the root for config/state/log placement;
 * keep it only for resolving relative paths out of `tool_input`.
 * @param {string|null} hookCwd - `input.cwd` from the hook payload
 * @returns {string} Absolute project root
 */
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

/**
 * Read JSON from stdin
 * @returns {Promise<Object>} Parsed JSON input
 * @throws {Error} If stdin is empty or contains invalid JSON
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
    // Fallback for circular references or other serialization errors
    console.error(`[output] Serialization failed: ${e.message}`);
    console.log(JSON.stringify({ error: `Serialization failed: ${e.message}` }));
  }
}

/** Cap for text channels (additionalContext etc.), under the 2.1.174 10K disk-spill threshold */
export const TEXT_CHANNEL_CAP = 9000;

/**
 * Truncate a text-channel payload to stay under the disk-spill threshold
 * @param {string} s - Text to cap
 * @param {number} max - Max chars
 * @returns {string} Original or truncated text
 */
export function capText(s, max = TEXT_CHANNEL_CAP) {
  return (typeof s === 'string' && s.length > max) ? s.slice(0, max) + '\n...[truncated]' : s;
}

/** Default configuration */
const DEFAULT_CONFIG = {
  logging: {
    level: 'info'
  },
  agents: {
    system: [
      'Explore', 'Plan', 'Bash', 'general-purpose',
      'claude-code-guide', 'skill-creator', 'agent-creator',
      'text-optimizer', 'statusline-setup'
    ]
  },
  constraints: {
    enabled: true
  }
};

/** Cached config */
let cachedConfig = null;
let cachedConfigCwd = null;
let _loadingConfig = false;

/**
 * Load configuration from .claude/tasks/cfg/brewcode.config.json
 * Falls back to defaults if not found
 * @param {string} cwd - Current working directory
 * @returns {Object} Merged configuration
 */
export function loadConfig(cwd) {
  // Return cached if same cwd
  if (cachedConfig && cachedConfigCwd === cwd) {
    return cachedConfig;
  }

  // Guard against recursion: log -> shouldLog -> getLogLevel -> loadConfig -> log
  if (_loadingConfig) return DEFAULT_CONFIG;
  _loadingConfig = true;

  const configPath = join(cwd, '.claude', 'tasks', 'cfg', 'brewcode.config.json');
  let userConfig = {};

  if (existsSync(configPath)) {
    try {
      userConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error(`[config] Failed to parse ${configPath}: ${e.message}`);
    }
  }

  // Deep merge with defaults
  cachedConfig = {
    logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging },
    agents: {
      system: [...new Set([
        ...DEFAULT_CONFIG.agents.system,
        ...(userConfig.agents?.system || [])
      ])]
    },
    constraints: { ...DEFAULT_CONFIG.constraints, ...userConfig.constraints }
  };
  cachedConfigCwd = cwd;

  _loadingConfig = false;
  return cachedConfig;
}

// ============================================================================
// LOGGING
// ============================================================================

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const LOG_FILE = '.claude/logs/brewcode.log';

/**
 * Get configured log level
 * Priority: BREWCODE_LOG_LEVEL env > brewcode.config.json logging.level > 'info'
 * @param {string} cwd - Current working directory
 * @returns {string} Log level (error|warn|info|debug|trace)
 */
export function getLogLevel(cwd) {
  const env = (process.env.BREWCODE_LOG_LEVEL || '').toLowerCase();
  if (env in LOG_LEVELS) return env;
  const config = loadConfig(cwd);
  const lvl = config.logging?.level;
  return (lvl && lvl in LOG_LEVELS) ? lvl : 'info';
}

/**
 * Check if message at given level should be logged
 * @param {string} level - Message level
 * @param {string} cwd - Current working directory
 * @returns {boolean} True if should log
 */
export function shouldLog(level, cwd) {
  const configLevel = getLogLevel(cwd);
  return LOG_LEVELS[level] <= LOG_LEVELS[configLevel];
}

/**
 * Log message to file and stderr if level allows
 * @param {string} level - Log level
 * @param {string} prefix - Log prefix (e.g., '[hook]')
 * @param {string} message - Log message
 * @param {string} cwd - Current working directory
 * @param {string|null} sessionId - Optional session ID for correlation
 */
export function log(level, prefix, message, cwd, sessionId = null) {
  if (!cwd) {
    if (level === 'error') console.error(`${prefix} ${message}`);
    return;
  }
  if (!shouldLog(level, cwd)) return;
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

// ============================================================================
// PERSISTENT STATE
// ============================================================================

const STATE_FILE = '.claude/tasks/cfg/brewcode.state.json';

/**
 * Get persistent state
 * @param {string} cwd - Current working directory
 * @returns {object} State object
 */
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

/**
 * Save persistent state
 * @param {string} cwd - Current working directory
 * @param {object} state - State to save
 */
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
