/**
 * Shared utilities for brewcode hooks
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, renameSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';

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

/** Default configuration */
const DEFAULT_CONFIG = {
  logging: {
    level: 'info'
  },
  constraints: {
    enabled: true
  },
  autoSync: {
    intervalDays: 7,
    retention: {
      maxEntries: 200
    },
    optimize: false,
    parallelAgents: 5
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
    constraints: { ...DEFAULT_CONFIG.constraints, ...userConfig.constraints },
    autoSync: {
      ...DEFAULT_CONFIG.autoSync,
      ...userConfig.autoSync,
      retention: { ...DEFAULT_CONFIG.autoSync.retention, ...(userConfig.autoSync?.retention || {}) }
    }
  };
  cachedConfigCwd = cwd;
  // Validate critical numeric fields — clamp to defaults if invalid
  const as = cachedConfig.autoSync;
  if (!Number.isInteger(as.intervalDays) || as.intervalDays < 1) {
    log('warn', '[config]', `Invalid intervalDays=${as.intervalDays}, using default ${DEFAULT_CONFIG.autoSync.intervalDays}`, cwd);
    as.intervalDays = DEFAULT_CONFIG.autoSync.intervalDays;
  }
  if (!Number.isInteger(as.parallelAgents) || as.parallelAgents < 1) {
    log('warn', '[config]', `Invalid parallelAgents=${as.parallelAgents}, using default ${DEFAULT_CONFIG.autoSync.parallelAgents}`, cwd);
    as.parallelAgents = DEFAULT_CONFIG.autoSync.parallelAgents;
  }

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

/**
 * Get active mode and its instructions (3-scope resolution)
 * @param {string} cwd - Current working directory
 * @param {string|null} sessionId - Session ID for session-scope resolution
 * @returns {{ name: string, instructions: string, scope: string } | null}
 */
export function getActiveMode(cwd, sessionId = null) {
  let modeName = null;
  let scope = null;

  // 1. Try CLAUDE_PLUGIN_DATA/modes.json with 3-scope resolution
  const pluginData = process.env.CLAUDE_PLUGIN_DATA || '';
  if (pluginData) {
    const modesPath = join(pluginData, 'modes.json');
    try {
      if (existsSync(modesPath)) {
        const modes = JSON.parse(readFileSync(modesPath, 'utf8'));

        if (sessionId && modes.sessions?.[sessionId]?.mode) {
          modeName = modes.sessions[sessionId].mode;
          scope = 'session';
        } else if (cwd && modes.projects?.[cwd]?.mode) {
          modeName = modes.projects[cwd].mode;
          scope = 'project';
        } else if (modes.global?.mode) {
          modeName = modes.global.mode;
          scope = 'global';
        }
      }
    } catch (e) {
      log('warn', '[mode]', `Failed to read modes.json: ${e.message}`, cwd);
    }
  }

  // 2. Fallback to old state file
  if (!modeName) {
    const state = getState(cwd);
    if (state.mode) {
      modeName = state.mode;
      scope = 'legacy';
    }
  }

  if (!modeName) return null;

  // 3. Load instructions: user modes (PLUGIN_DATA) then built-in (PLUGIN_ROOT)
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || '';
  const candidates = [];
  if (pluginData) candidates.push(join(pluginData, 'modes', `${modeName}.md`));
  if (pluginRoot) candidates.push(join(pluginRoot, 'modes', `${modeName}.md`));

  for (const modePath of candidates) {
    try {
      if (existsSync(modePath)) {
        const instructions = readFileSync(modePath, 'utf8').trim();
        if (instructions) {
          return { name: modeName, instructions, scope };
        }
      }
    } catch (e) {
      log('warn', '[mode]', `Failed to read mode "${modeName}" from ${modePath}: ${e.message}`, cwd);
    }
  }

  log('warn', '[mode]', `Mode "${modeName}" active (${scope}) but no instructions file found`, cwd);
  return null;
}
