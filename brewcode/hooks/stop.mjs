#!/usr/bin/env node
/**
 * Stop hook
 * Blocks stop if task is not finished
 * Deletes lock file when task is finished
 */
import { existsSync } from 'fs';
import { join } from 'path';
import {
  readStdin,
  output,
  getActiveTaskPath,
  getKnowledgePath,
  parseTask,
  deleteLock,
  getLock,
  isLockStale,
  validateTaskPath,
  log
} from './lib/utils.mjs';

const TERMINAL_STATUSES = new Set(['finished', 'cancelled', 'failed', 'error']);

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    // Re-entrancy guard: prevent recursive stop hook invocation
    if (input.stop_hook_active) {
      output({});
      return;
    }

    // Check if there's a lock file (brewcode was started in some session)
    const lock = getLock(cwd);

    // Check for stale lock (older than 24h) - auto-cleanup
    if (lock && isLockStale(lock)) {
      log('warn', '[stop]', `Stale lock detected (>24h old) - removing`, cwd, session_id);
      deleteLock(cwd, join(cwd, lock.task_path));
      output({});
      return;
    }

    // If no lock, fall back to old behavior (check TASK.md reference)
    // This handles cases where task was created but not started via /brewcode:start
    if (!lock) {
      const taskPath = getActiveTaskPath(cwd);
      if (!taskPath) {
        // Not a brewcode session, allow stop
        output({});
        return;
      }

      // Task reference exists but no lock - task was never properly started
      // Allow stop with warning
      log('debug', '[stop]', 'Task reference exists but no lock file - task not started', cwd, session_id);
      output({});
      return;
    }

    // Lock exists - check session ownership
    if (!lock.session_id) {
      // Unbound lock (no session claimed it) - treat as stale, allow stop
      log('warn', '[stop]', 'Lock has no session_id - treating as stale', cwd, session_id);
      deleteLock(cwd, join(cwd, lock.task_path));
      output({});
      return;
    }

    if (lock.session_id !== session_id) {
      // Different session owns this task - allow stop
      log('debug', '[stop]', `Lock owned by different session: ${typeof lock.session_id === 'string' ? lock.session_id.slice(0, 8) : 'unknown'}`, cwd, session_id);
      output({});
      return;
    }

    // Defense-in-depth: getLock() already validates task_path, this is a backup check
    const taskPath = lock.task_path;
    if (taskPath && !validateTaskPath(taskPath)) {
      log('warn', '[stop]', `Invalid task_path in lock: ${taskPath}`, cwd, session_id);
      deleteLock(cwd, join(cwd, lock.task_path));
      output({});
      return;
    }
    if (!taskPath || !existsSync(join(cwd, taskPath))) {
      // Invalid lock - delete and allow stop
      log('warn', '[stop]', 'Invalid lock - task file not found', cwd, session_id);
      deleteLock(cwd, join(cwd, lock.task_path));
      output({});
      return;
    }

    // Parse task to get current state
    const fullTaskPath = join(cwd, taskPath);
    const task = parseTask(fullTaskPath, cwd);

    if (!task) {
      // Can't parse task - allow stop with lock cleanup
      log('error', '[stop]', 'Failed to parse task file', cwd, session_id);
      deleteLock(cwd, fullTaskPath);
      output({});
      return;
    }

    // If task is finished, allow stop
    if (TERMINAL_STATUSES.has(task.status)) {
      const knowledgePath = getKnowledgePath(fullTaskPath);

      // Remind about rules extraction if knowledge exists
      if (existsSync(knowledgePath)) {
        log('info', '[stop]', `Task finished. Consider: /brewcode:rules ${knowledgePath}`, cwd, session_id);
      }

      // CRITICAL: Delete lock file when task is finished
      deleteLock(cwd, fullTaskPath);
      output({});
      return;
    }

    log('warn', '[stop]', `Stop blocked - task incomplete (phase ${task.currentPhase}/${task.totalPhases})`, cwd, session_id);

    // Block stop - task not complete
    // reason is shown to BOTH user and Claude
    // User sees: status + escape hatch
    // Claude sees: instruction to continue
    output({
      decision: 'block',
      reason: `brewcode: task incomplete (${task.status}, phase ${task.currentPhase}/${task.totalPhases})
Emergency exit: rm .claude/tasks/*_task/.lock`,
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: `brewcode: stop blocked. Continue execution. Re-read PLAN.md and proceed with phase ${task.currentPhase}. Task: ${taskPath}`
      }
    });
  } catch (error) {
    log('error', '[stop]', `Error: ${error.message}`, cwd, session_id);
    // On error, allow stop but preserve lock for recovery (user can rm .lock manually)
    output({});
  }
}

main();
