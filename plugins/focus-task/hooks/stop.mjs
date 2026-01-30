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
  log
} from './lib/utils.mjs';

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    // Check if there's a lock file (focus-task was started in some session)
    const lock = getLock(cwd);

    // Check for stale lock (older than 24h) - auto-cleanup
    if (lock && isLockStale(lock)) {
      log('warn', '[stop]', `Stale lock detected (>24h old) - removing`, cwd, session_id);
      deleteLock(cwd);
      output({});
      return;
    }

    // If no lock, fall back to old behavior (check TASK.md reference)
    // This handles cases where task was created but not started via /focus-task-start
    if (!lock) {
      const taskPath = getActiveTaskPath(cwd);
      if (!taskPath) {
        // Not a focus-task session, allow stop
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
      deleteLock(cwd);
      output({});
      return;
    }

    if (lock.session_id !== session_id) {
      // Different session owns this task - allow stop
      log('debug', '[stop]', `Lock owned by different session: ${lock.session_id.slice(0, 8)}`, cwd, session_id);
      output({});
      return;
    }

    // Get task path from lock
    const taskPath = lock.task_path;
    if (!taskPath || !existsSync(join(cwd, taskPath))) {
      // Invalid lock - delete and allow stop
      log('warn', '[stop]', 'Invalid lock - task file not found', cwd, session_id);
      deleteLock(cwd);
      output({});
      return;
    }

    // Parse task to get current state
    const fullTaskPath = join(cwd, taskPath);
    const task = parseTask(fullTaskPath, cwd);

    if (!task) {
      // Can't parse task - allow stop with lock cleanup
      log('error', '[stop]', 'Failed to parse task file', cwd, session_id);
      deleteLock(cwd);
      output({});
      return;
    }

    // If task is finished, allow stop
    if (task.status === 'finished') {
      const knowledgePath = getKnowledgePath(fullTaskPath);

      // Remind about rules extraction if knowledge exists
      if (existsSync(knowledgePath)) {
        log('info', '[stop]', `Task finished. Consider: /focus-task-rules ${knowledgePath}`, cwd, session_id);
      }

      // CRITICAL: Delete lock file when task is finished
      deleteLock(cwd);
      output({});
      return;
    }

    log('warn', '[stop]', `Stop blocked - task incomplete (phase ${task.currentPhase}/${task.totalPhases})`, cwd, session_id);

    // Block stop - task not complete
    output({
      decision: 'block',
      reason: `focus-task: stop blocked - task incomplete

[TASK NOT COMPLETE]

Current status: ${task.status}
Phase: ${task.currentPhase}/${task.totalPhases}

Task file: ${taskPath}

ACTION: Continue execution. Re-read TASK.md and proceed with phase ${task.currentPhase}.

[ESCAPE IF STUCK]
Emergency exit: rm .claude/tasks/cfg/.focus-task.lock
Then stop will be allowed.`
    });
  } catch (error) {
    log('error', '[stop]', `Error: ${error.message}`, cwd, session_id);
    // On error, allow stop (don't trap user)
    output({});
  }
}

main();
