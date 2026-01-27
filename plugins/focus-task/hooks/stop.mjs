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
  log
} from './lib/utils.mjs';

async function main() {
  try {
    const input = await readStdin();
    const { cwd, session_id } = input;

    // Check if there's a lock file (focus-task was started in some session)
    const lock = getLock(cwd);

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
      log('debug', '[stop]', 'Task reference exists but no lock file - task not started', cwd);
      output({});
      return;
    }

    // Lock exists - check if it's our session
    if (lock.session_id && lock.session_id !== session_id) {
      // Different session owns this task - allow stop
      log('debug', '[stop]', `Lock owned by different session: ${lock.session_id}`, cwd);
      output({});
      return;
    }

    // Get task path from lock
    const taskPath = lock.task_path;
    if (!taskPath || !existsSync(join(cwd, taskPath))) {
      // Invalid lock - delete and allow stop
      log('warn', '[stop]', 'Invalid lock - task file not found', cwd);
      deleteLock(cwd);
      output({});
      return;
    }

    // Parse task to get current state
    const fullTaskPath = join(cwd, taskPath);
    const task = parseTask(fullTaskPath);

    if (!task) {
      // Can't parse task - allow stop with lock cleanup
      log('error', '[stop]', 'Failed to parse task file', cwd);
      deleteLock(cwd);
      output({});
      return;
    }

    // If task is finished, allow stop
    if (task.status === 'finished') {
      const knowledgePath = getKnowledgePath(fullTaskPath);

      // Remind about rules extraction if knowledge exists
      if (existsSync(knowledgePath)) {
        log('info', '[stop]', `Task finished. Consider extracting rules: /focus-task-rules ${knowledgePath}`, cwd);
      }

      // CRITICAL: Delete lock file when task is finished
      deleteLock(cwd);
      output({});
      return;
    }

    // Block stop - task not complete
    output({
      decision: 'block',
      reason: `[TASK NOT COMPLETE]

Current status: ${task.status}
Phase: ${task.currentPhase}/${task.totalPhases}

Task file: ${taskPath}

ACTION: Continue execution. Re-read TASK.md and proceed with phase ${task.currentPhase}.`
    });
  } catch (error) {
    // Keep console.error here - cwd may not be available
    console.error(`[stop] Error: ${error.message}`);
    // On error, allow stop (don't trap user)
    output({});
  }
}

main();
