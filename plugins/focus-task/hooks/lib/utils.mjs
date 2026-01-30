/**
 * Shared utilities for focus-task hooks
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
  if (!existsSync(refPath)) return null;

  const content = readFileSync(refPath, 'utf8').trim();
  // Check if content is a valid task path reference
  if (!content.match(/\.claude\/tasks\/.*_TASK\.md$/)) return null;

  const taskPath = join(cwd, content);
  if (!existsSync(taskPath)) return null;

  return taskPath;
}

/**
 * Get KNOWLEDGE.jsonl path for a task
 * @param {string} taskPath - Path to TASK.md file
 * @returns {string} Path to KNOWLEDGE.jsonl
 */
export function getKnowledgePath(taskPath) {
  return taskPath.replace(/_TASK\.md$/, '_KNOWLEDGE.jsonl');
}

/**
 * Get reports directory for a task
 * @param {string} taskPath - Path to TASK.md file
 * @param {string} cwd - Current working directory
 * @returns {string} Path to reports directory
 */
export function getReportsDir(taskPath, cwd) {
  const taskName = taskPath.match(/([^/]+)_TASK\.md$/)?.[1] || 'task';
  return join(cwd, '.claude', 'tasks', 'reports', taskName);
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

  // Extract status
  const statusMatch = content.match(/^status:\s*(.+)$/m);
  const status = statusMatch?.[1]?.trim() || 'pending';

  // Find current phase
  const phaseMatches = [...content.matchAll(/^##\s*Phase\s+(\d+)[^\n]*\n(?:[\s\S]*?(?=^##\s*Phase|\Z))/gm)];
  let currentPhase = 1;

  for (const match of phaseMatches) {
    const phaseNum = parseInt(match[1]);
    if (isNaN(phaseNum)) continue; // Skip invalid phase numbers
    const phaseContent = match[0];
    // Check if phase is completed (has [x] or status: completed)
    if (phaseContent.includes('[x]') || phaseContent.includes('status: completed')) {
      currentPhase = phaseNum + 1;
    } else {
      currentPhase = phaseNum;
      break;
    }
  }

  const totalPhases = phaseMatches.length || 1;

  return {
    status,
    currentPhase,
    totalPhases,
    content
  };
}

/**
 * Extract task status from TASK.md content
 * @param {string} content - TASK.md content
 * @returns {string} Status value
 */
export function extractStatus(content) {
  const statusMatch = content.match(/^status:\s*(.+)$/m);
  return statusMatch?.[1]?.trim() || 'pending';
}

/**
 * Find current phase number from TASK.md
 * @param {string} content - TASK.md content
 * @returns {number} Current phase number
 */
export function findCurrentPhase(content) {
  const phaseMatches = [...content.matchAll(/^##\s*Phase\s+(\d+)/gm)];
  let currentPhase = 1;

  for (const match of phaseMatches) {
    const phaseNum = parseInt(match[1]);
    // Find the section for this phase
    const phaseStart = match.index;
    const nextPhaseMatch = content.slice(phaseStart + 1).match(/^##\s*Phase\s+\d+/m);
    const phaseEnd = nextPhaseMatch ? phaseStart + 1 + nextPhaseMatch.index : content.length;
    const phaseContent = content.slice(phaseStart, phaseEnd);

    if (phaseContent.includes('[x]') || phaseContent.includes('status: completed')) {
      currentPhase = phaseNum + 1;
    } else {
      currentPhase = phaseNum;
      break;
    }
  }

  return currentPhase;
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
    priorities: ['❌', '✅', 'ℹ️']
  },
  logging: {
    level: 'info'
  },
  stop: {
    maxAttempts: 20
  },
  agents: {
    system: [
      'ft-coordinator', 'ft-knowledge-manager',
      'Explore', 'Plan', 'Bash', 'general-purpose',
      'claude-code-guide', 'skill-creator', 'agent-creator',
      'prompt-optimizer', 'rules-organizer', 'statusline-setup'
    ]
  }
};

/** Cached config */
let cachedConfig = null;
let cachedConfigCwd = null;

/**
 * Load configuration from .claude/tasks/cfg/focus-task.config.json
 * Falls back to defaults if not found
 * @param {string} cwd - Current working directory
 * @returns {Object} Merged configuration
 */
export function loadConfig(cwd) {
  // Return cached if same cwd
  if (cachedConfig && cachedConfigCwd === cwd) {
    return cachedConfig;
  }

  const configPath = join(cwd, '.claude', 'tasks', 'cfg', 'focus-task.config.json');
  let userConfig = {};

  if (existsSync(configPath)) {
    try {
      userConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (e) {
      log('error', '[config]', `Failed to parse ${configPath}: ${e.message}`, cwd);
    }
  }

  // Deep merge with defaults
  cachedConfig = {
    knowledge: { ...DEFAULT_CONFIG.knowledge, ...userConfig.knowledge },
    logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging },
    stop: { ...DEFAULT_CONFIG.stop, ...userConfig.stop },
    agents: { ...DEFAULT_CONFIG.agents, ...userConfig.agents }
  };
  cachedConfigCwd = cwd;

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
// LOCK FILE MANAGEMENT
// Session binding for focus-task execution
// ============================================================================

const LOCK_FILE = 'tasks/cfg/.focus-task.lock';
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

  try {
    const age = Date.now() - new Date(timestamp).getTime();
    const maxAge = LOCK_STALE_HOURS * 60 * 60 * 1000;
    return age > maxAge;
  } catch {
    return false;
  }
}

/**
 * Bind session_id to existing lock file
 * Called by hook when it detects coordinator completed
 * @param {string} cwd - Current working directory
 * @param {string} sessionId - Current session ID
 * @returns {boolean} True if bound successfully
 */
export function bindLockSession(cwd, sessionId) {
  const lockPath = join(cwd, '.claude', LOCK_FILE);
  if (!existsSync(lockPath)) return false;

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

    // Only bind if not already bound
    if (!lock.session_id) {
      lock.session_id = sessionId;
      lock.bound_at = new Date().toISOString();
      writeFileSync(lockPath, JSON.stringify(lock, null, 2));
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
  const lockPath = join(cwd, '.claude', LOCK_FILE);
  if (!existsSync(lockPath)) {
    log('debug', '[lock]', 'No lock file exists', cwd, sessionId);
    return null;
  }

  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

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
  } catch (e) {
    log('error', '[lock]', `Failed to check: ${e.message}`, cwd, sessionId);
    return null;
  }
}

/**
 * Check if lock file exists (regardless of session)
 * @param {string} cwd - Current working directory
 * @returns {Object|null} Lock data or null
 */
export function getLock(cwd) {
  const lockPath = join(cwd, '.claude', LOCK_FILE);
  if (!existsSync(lockPath)) return null;

  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (e) {
    log('error', '[lock]', `Failed to read: ${e.message}`, cwd);
    return null;
  }
}

/**
 * Delete lock file on task completion
 * CRITICAL: Must be called when task finishes
 * @param {string} cwd - Current working directory
 */
export function deleteLock(cwd) {
  const lockPath = join(cwd, '.claude', LOCK_FILE);
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
 * Check if coordinator agent
 * @param {string} agentType - The subagent_type value
 * @returns {boolean} True if ft-coordinator
 */
export function isCoordinator(agentType) {
  return agentType === 'ft-coordinator' ||
         agentType === 'focus-task:ft-coordinator';
}

// ============================================================================
// LOGGING
// ============================================================================

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const LOG_FILE = '.claude/tasks/logs/focus-task.log';

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
  // Always write to stderr first (even if cwd is null)
  console.error(`${prefix} ${message}`);

  // Skip file logging if cwd is null or level check fails
  if (!cwd || !shouldLog(level, cwd)) return;

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

const STATE_FILE = '.claude/tasks/cfg/focus-task.state.json';

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
  } catch {
    // Ignore read errors
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
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    // Ignore write errors
  }
}
