/**
 * Shared utilities for brewcode hooks
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, renameSync, appendFileSync } from 'fs';
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

/**
 * Get the active task path from .claude/TASK.md reference
 * @param {string} cwd - Current working directory
 * @returns {string|null} Task file path or null if not active
 */
export function getActiveTaskPath(cwd) {
  const refPath = join(cwd, '.claude', 'TASK.md');
  if (!existsSync(refPath)) {
    log('debug', '[task]', 'TASK.md not found', cwd);
    return null;
  }

  const content = readFileSync(refPath, 'utf8').trim().split('\n')[0].trim();
  if (content.includes('..')) return null;
  if (!content.match(/^\.claude\/tasks\/.*_task\/PLAN\.md$/)) return null;

  const taskPath = join(cwd, content);
  if (!existsSync(taskPath)) return null;

  return taskPath;
}

/**
 * Get KNOWLEDGE.jsonl path for a task
 * @param {string} taskPath - Path to PLAN.md file
 * @returns {string} Path to KNOWLEDGE.jsonl
 */
export function getKnowledgePath(taskPath) {
  return join(dirname(taskPath), 'KNOWLEDGE.jsonl');
}

/**
 * Get artifacts directory for a task
 * @param {string} taskPath - Path to PLAN.md file
 * @returns {string} Path to artifacts directory
 */
export function getReportsDir(taskPath) {
  return join(dirname(taskPath), 'artifacts');
}

/**
 * Read and parse task file
 * @param {string} taskPath - Path to TASK.md file
 * @returns {Object|null} Parsed task with status and phases, or null on error
 */
export function parseTask(taskPath, cwd = null) {
  let content;
  try {
    content = readFileSync(taskPath, 'utf8');
  } catch (e) {
    // Derive cwd from taskPath if not provided (taskPath is like /path/to/project/.claude/tasks/...)
    const derivedCwd = cwd || taskPath.replace(/\/\.claude\/tasks\/.*$/, '');
    log('error', '[parseTask]', `Failed to read ${taskPath}: ${e.message}`, derivedCwd);
    return null;
  }

  // v3 detection: phases/ directory alongside PLAN.md + v3 header format
  const taskDir = dirname(taskPath);
  const phasesDir = join(taskDir, 'phases');
  const hasPhases = existsSync(phasesDir);

  if (hasPhases) {
    const lines = content.split('\n');
    if (lines[0]?.startsWith('status:') && lines[1]?.startsWith('current_phase:')) {
      return parseTaskV3(content);
    }
    const derivedCwd = cwd || taskPath.replace(/\/\.claude\/tasks\/.*$/, '');
    log('warn', '[parseTask]', 'phases/ dir exists but PLAN.md lacks v3 header, falling back to v2', derivedCwd);
  }

  return parseTaskV2(content);
}

/**
 * Parse v3 PLAN.md with structured header (status, current_phase, total_phases).
 * Uses multiline regex for robustness against line order variations.
 * @param {string} content - PLAN.md file content
 * @returns {Object} Parsed task with status, currentPhase, totalPhases, content
 */
function parseTaskV3(content) {
  const statusMatch = content.match(/^status:\s*(.+)/m);
  const status = statusMatch?.[1]?.trim() || 'pending';

  const currentPhaseMatch = content.match(/^current_phase:\s*(\d+)/m);
  const currentPhase = currentPhaseMatch ? parseInt(currentPhaseMatch[1]) : 0;

  const totalPhasesMatch = content.match(/^total_phases:\s*(\d+)/m);
  const totalPhases = totalPhasesMatch ? parseInt(totalPhasesMatch[1]) : 0;

  return { status, currentPhase, totalPhases, content };
}

/**
 * Parse v2 PLAN.md with phase headers and checkbox counting
 * @param {string} content - PLAN.md file content
 * @returns {Object} Parsed task with status, currentPhase, totalPhases, content
 */
function parseTaskV2(content) {
  // Extract status
  const statusMatch = content.match(/^status:\s*(.+)$/m);
  const status = statusMatch?.[1]?.trim() || 'pending';

  // Find current phase
  const phaseHeaders = [...content.matchAll(/^#{2,3}\s*Phase\s+(\d+)(?!V)[^\n]*/gm)];
  let currentPhase = 1;

  for (const match of phaseHeaders) {
    const phaseNum = parseInt(match[1]);
    if (isNaN(phaseNum)) continue;
    const phaseStart = match.index;
    const currentLineEnd = content.indexOf('\n', phaseStart);
    const remainingContent = currentLineEnd >= 0 ? content.slice(currentLineEnd + 1) : '';
    const nextMatch = remainingContent.match(/^#{2,3}\s*Phase\s+\d+(?!V)/m);
    const phaseEnd = nextMatch ? currentLineEnd + 1 + nextMatch.index : content.length;
    const phaseContent = content.slice(phaseStart, phaseEnd);

    const checked = (phaseContent.match(/\[x\]/gi) || []).length;
    const unchecked = (phaseContent.match(/\[ \]/g) || []).length;
    const hasStatusComplete = /\*?\*?[Ss]tatus\*?\*?:\s*completed/i.test(phaseContent);
    if ((checked > 0 && unchecked === 0) || hasStatusComplete) {
      currentPhase = phaseNum + 1;
    } else {
      currentPhase = phaseNum;
      break;
    }
  }

  const totalPhases = phaseHeaders.length || 1;

  return { status, currentPhase, totalPhases, content };
}

/**
 * Update task status in TASK.md (atomic write)
 * @param {string} taskPath - Path to TASK.md file
 * @param {string} newStatus - New status value
 * @returns {boolean} True if successful
 */
export function updateTaskStatus(taskPath, newStatus) {
  try {
    let content = readFileSync(taskPath, 'utf8');

    if (content.match(/^status:\s*.+$/m)) {
      content = content.replace(/^status:\s*.+$/m, `status: ${newStatus}`);
    } else {
      // Add status after frontmatter or at start
      if (content.startsWith('---')) {
        const endFrontmatter = content.indexOf('---', 3);
        if (endFrontmatter > 0) {
          content = content.slice(0, endFrontmatter) + `status: ${newStatus}\n` + content.slice(endFrontmatter);
        }
      } else {
        content = `status: ${newStatus}\n\n${content}`;
      }
    }

    // Atomic write: write to temp file, then rename
    const tmpPath = taskPath + '.tmp';
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, taskPath);
    return true;
  } catch (e) {
    const cwd = taskPath.replace(/\/\.claude\/tasks\/.*$/, '');
    log('error', '[updateTaskStatus]', `Failed: ${e.message}`, cwd);
    return false;
  }
}

/** Default configuration */
const DEFAULT_CONFIG = {
  knowledge: {
    maxEntries: 100,
    maxTokens: 500,
    priorities: ['❌', '✅', 'ℹ️'],
    validation: {
      enabled: true,
      blocklist: true
    }
  },
  logging: {
    level: 'info'
  },
  agents: {
    system: [
      'bc-coordinator', 'bc-knowledge-manager',
      'brewcode:bc-coordinator', 'brewcode:bc-knowledge-manager',
      'bd-auto-sync-processor', 'brewcode:bd-auto-sync-processor',
      'bc-grepai-configurator', 'brewcode:bc-grepai-configurator',
      'Explore', 'Plan', 'Bash', 'general-purpose',
      'claude-code-guide', 'skill-creator', 'agent-creator',
      'text-optimizer', 'statusline-setup'
    ]
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
    knowledge: {
      ...DEFAULT_CONFIG.knowledge,
      ...userConfig.knowledge,
      validation: { ...DEFAULT_CONFIG.knowledge.validation, ...(userConfig.knowledge?.validation || {}) },
    },
    logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging },
    agents: {
      system: [...new Set([
        ...DEFAULT_CONFIG.agents.system,
        ...(userConfig.agents?.system || [])
      ])]
    },
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
  const k = cachedConfig.knowledge;
  if (!Number.isInteger(k.maxEntries) || k.maxEntries < 1) {
    log('warn', '[config]', `Invalid maxEntries=${k.maxEntries}, using default ${DEFAULT_CONFIG.knowledge.maxEntries}`, cwd);
    k.maxEntries = DEFAULT_CONFIG.knowledge.maxEntries;
  }
  if (!Number.isInteger(k.maxTokens) || k.maxTokens < 1) {
    log('warn', '[config]', `Invalid maxTokens=${k.maxTokens}, using default ${DEFAULT_CONFIG.knowledge.maxTokens}`, cwd);
    k.maxTokens = DEFAULT_CONFIG.knowledge.maxTokens;
  }

  _loadingConfig = false;
  return cachedConfig;
}

/**
 * Check if agent is a system agent (should not get knowledge injection)
 * @param {string} agentType - The subagent_type value
 * @param {string} cwd - Current working directory (for config)
 * @returns {boolean} True if system agent
 */
export function isSystemAgent(agentType, cwd = null) {
  const config = cwd ? loadConfig(cwd) : DEFAULT_CONFIG;
  return config.agents.system.includes(agentType);
}

// ============================================================================
// TASK DIRECTORY HELPERS
// ============================================================================

/**
 * Get task directory from task path (PLAN.md)
 * @param {string} taskPath - Absolute path to PLAN.md
 * @returns {string} Path to task directory
 */
export function getTaskDir(taskPath) {
  return dirname(taskPath);
}

/**
 * Validate that task_path is safe and matches expected pattern
 * @param {string} taskPath - Relative task path from lock file
 * @returns {boolean} True if valid
 */
export function validateTaskPath(taskPath) {
  if (!taskPath || typeof taskPath !== 'string') return false;
  if (taskPath.includes('..')) return false;
  return /^\.claude\/tasks\/.*_task\/PLAN\.md$/.test(taskPath);
}

/**
 * Get lock file path for a task
 * @param {string} taskPath - Absolute path to PLAN.md
 * @returns {string} Path to .lock file
 */
export function getLockPath(taskPath) {
  return join(getTaskDir(taskPath), '.lock');
}

/**
 * Get sessions directory
 * @param {string} cwd - Current working directory
 * @returns {string} Path to sessions directory
 */
export function getSessionsDir(cwd) {
  return join(cwd, '.claude', 'tasks', 'sessions');
}


// ============================================================================
// LOCK FILE MANAGEMENT
// Session binding for brewcode execution
// ============================================================================

const LOCK_STALE_HOURS = 24;

/**
 * Check if lock is stale (older than threshold)
 * @param {Object} lock - Lock data with started_at or bound_at
 * @returns {boolean} True if lock is stale
 */
export function isLockStale(lock) {
  if (!lock) return false;

  const timestamp = lock.bound_at || lock.started_at;
  if (!timestamp) return false;

  const age = Date.now() - new Date(timestamp).getTime();
  if (isNaN(age)) return true; // Treat unparseable timestamps as stale
  const maxAge = LOCK_STALE_HOURS * 60 * 60 * 1000;
  return age > maxAge;
}

/**
 * Bind session_id to existing lock file
 * Called by hook when it detects coordinator completed
 * @param {string} cwd - Current working directory
 * @param {string} sessionId - Current session ID
 * @returns {boolean} True if bound successfully
 */
export function bindLockSession(cwd, sessionId, taskPath = null) {
  if (!sessionId || typeof sessionId !== 'string') {
    log('warn', '[lock]', 'Cannot bind: invalid sessionId', cwd);
    return false;
  }
  let lockPath;
  if (taskPath) {
    lockPath = getLockPath(taskPath);
  } else {
    const activePath = getActiveTaskPath(cwd);
    if (!activePath) return false;
    lockPath = getLockPath(activePath);
  }
  if (!existsSync(lockPath)) return false;

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

    // Validate lock schema
    if (!lock.task_path || typeof lock.task_path !== 'string' ||
        !lock.started_at || typeof lock.started_at !== 'string') {
      log('error', '[lock]', `Corrupted lock (missing task_path or started_at) — deleting`, cwd, sessionId);
      try { unlinkSync(lockPath); } catch {}
      return false;
    }

    // Only bind if not already bound
    if (!lock.session_id) {
      lock.session_id = sessionId;
      lock.bound_at = new Date().toISOString();
      const tmpPath = lockPath + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(lock, null, 2));
      renameSync(tmpPath, lockPath);
      // Verify we won the race
      const verifyLock = getLock(cwd);
      if (!verifyLock || verifyLock.session_id !== sessionId) {
        log('warn', '[lock]', 'Lost bind race, another session bound first', cwd, sessionId);
        return false;
      }
      log('info', '[lock]', `Session bound: ${sessionId.slice(0, 8)}`, cwd, sessionId);
    }
    return true;
  } catch (e) {
    log('error', '[lock]', `Failed to bind session: ${e.message}`, cwd, sessionId);
    return false;
  }
}

/**
 * Check if lock exists and session matches
 * @param {string} cwd - Current working directory
 * @param {string} sessionId - Current session ID
 * @returns {Object|null} Lock data if valid, null otherwise
 */
export function checkLock(cwd, sessionId) {
  const lock = getLock(cwd);
  if (!lock) return null;

  // Lock must have session_id bound
  if (!lock.session_id) {
    log('debug', '[lock]', 'Lock has no session_id', cwd, sessionId);
    return null;
  }

  // Session must match
  if (lock.session_id !== sessionId) {
    const lockId = typeof lock.session_id === 'string' ? lock.session_id.slice(0, 8) : 'invalid';
    const currentId = typeof sessionId === 'string' ? sessionId.slice(0, 8) : 'null';
    log('debug', '[lock]', `Session mismatch: lock=${lockId}, current=${currentId}`, cwd, sessionId);
    return null;
  }

  log('debug', '[lock]', `Session matched: ${sessionId?.slice(0, 8) || 'unknown'}`, cwd, sessionId);
  return lock;
}

/**
 * Check if lock file exists (regardless of session)
 * @param {string} cwd - Current working directory
 * @returns {Object|null} Lock data or null
 */
export function getLock(cwd) {
  const activePath = getActiveTaskPath(cwd);
  if (!activePath) return null;
  const lockPath = getLockPath(activePath);
  if (!existsSync(lockPath)) return null;

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (!lock.task_path || typeof lock.task_path !== 'string' ||
        !lock.started_at || typeof lock.started_at !== 'string') {
      log('error', '[lock]', `Corrupted lock (missing task_path or started_at) — deleting`, cwd);
      try { unlinkSync(lockPath); } catch {}
      return null;
    }
    if (!validateTaskPath(lock.task_path)) {
      log('error', '[lock]', `Corrupted lock (invalid task_path: ${lock.task_path}) — deleting`, cwd);
      try { unlinkSync(lockPath); } catch {}
      return null;
    }
    return lock;
  } catch (e) {
    log('error', '[lock]', `Failed to read: ${e.message}`, cwd);
    try { unlinkSync(lockPath); } catch {}
    return null;
  }
}

/**
 * Delete lock file on task completion
 * CRITICAL: Must be called when task finishes
 * @param {string} cwd - Current working directory
 * @param {string|null} taskPath - Known absolute task path (avoids re-reading TASK.md)
 */
export function deleteLock(cwd, taskPath = null) {
  const activePath = taskPath || getActiveTaskPath(cwd);
  if (!activePath) return;
  const lockPath = getLockPath(activePath);
  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
      log('debug', '[lock]', 'Deleted lock file', cwd);
    } catch (e) {
      log('error', '[lock]', `Failed to delete: ${e.message}`, cwd);
    }
  }
}

/**
 * Create lock file atomically using tmp+rename pattern
 * @param {string} cwd - Current working directory
 * @param {string} taskPath - Relative task path (e.g., .claude/tasks/*_task/PLAN.md)
 * @returns {Object} Lock data
 */
export function createLock(cwd, taskPath) {
  // Lock file is per-task: {task_dir}/.lock (not global .claude/tasks/.lock)
  const absoluteTaskPath = join(cwd, taskPath);
  const lockPath = getLockPath(absoluteTaskPath);
  const lock = {
    task_path: taskPath,
    // Must be started_at (not created_at) - getLock() validates this field
    started_at: new Date().toISOString()
  };
  const tmpPath = lockPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(lock, null, 2));
  renameSync(tmpPath, lockPath);
  return lock;
}

/**
 * Check if coordinator agent
 * @param {string} agentType - The subagent_type value
 * @returns {boolean} True if bc-coordinator
 */
export function isCoordinator(agentType) {
  return agentType === 'bc-coordinator' ||
         agentType === 'brewcode:bc-coordinator';
}

// ============================================================================
// LOGGING
// ============================================================================

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const LOG_FILE = '.claude/tasks/logs/brewcode.log';

/**
 * Get configured log level
 * @param {string} cwd - Current working directory
 * @returns {string} Log level (error|warn|info|debug|trace)
 */
export function getLogLevel(cwd) {
  const config = loadConfig(cwd);
  return config.logging?.level || 'info';
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
