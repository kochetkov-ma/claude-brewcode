#!/usr/bin/env node
/**
 * PreCompact hook
 * Validates state, compacts knowledge, writes handoff entry before auto-compact
 *
 * ============================================================================
 * IMPORTANT: SESSION_ID DOES NOT CHANGE AFTER COMPACT!
 * ============================================================================
 * Claude Code's auto-compact summarizes context within THE SAME session.
 * The session_id remains identical before and after compact.
 *
 * Therefore:
 * - Lock file keeps session_id bound (no release needed)
 * - checkLock() will match after compact resumes
 * - Status 'handoff' is for Claude to re-read TASK.md, not for new session
 * ============================================================================
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  readStdin,
  output,
  getKnowledgePath,
  getReportsDir,
  parseTask,
  updateTaskStatus,
  getState,
  saveState,
  loadConfig,
  checkLock,
  log
} from './lib/utils.mjs';
import {
  localCompact,
  writeHandoffEntry
} from './lib/knowledge.mjs';

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    // Check if brewcode is active AND owned by this session
    const lock = checkLock(cwd, session_id);
    if (!lock) {
      // No valid lock for this session - allow compact without handoff logic
      output({ continue: true });
      return;
    }

    // Get task path from lock (session-validated)
    // Warn but continue: lock exists but task_path missing indicates corrupt state
    if (!lock.task_path) {
      log('warn', '[pre-compact]', 'Lock missing task_path', cwd, session_id);
      output({ continue: true });
      return;
    }
    const taskPath = join(cwd, lock.task_path);

    // Parse task to get current state
    const task = parseTask(taskPath, cwd);
    if (!task) {
      log('warn', '[pre-compact]', 'Failed to parse task file', cwd, session_id);
      output({ continue: true });
      return;
    }

    // If task is finished, allow compact without validation
    if (task.status === 'finished') {
      output({ continue: true });
      return;
    }

    // VALIDATE STATE
    const validationIssues = [];

    // 1. Check artifacts directory exists for current phase
    const artifactsDir = getReportsDir(taskPath);
    const phasePattern = `${task.currentPhase}-`;
    let hasPhaseDir = false;
    if (existsSync(artifactsDir)) {
      const entries = readdirSync(artifactsDir);
      hasPhaseDir = entries.some(e => e.startsWith(phasePattern));
    }
    if (!hasPhaseDir) {
      validationIssues.push(`Artifacts directory missing for phase ${task.currentPhase}`);
    }

    // If validation issues, warn but continue (don't block compact)
    if (validationIssues.length > 0) {
      log('warn', '[pre-compact]', `Validation warnings: ${validationIssues.join('; ')}`, cwd, session_id);
      // Still continue - better to compact than crash
    }

    // COMPACT KNOWLEDGE
    const knowledgePath = getKnowledgePath(taskPath);
    const config = loadConfig(cwd);
    if (existsSync(knowledgePath)) {
      const compacted = localCompact(knowledgePath, config.knowledge.maxEntries, cwd);
      if (compacted) {
        log('info', '[pre-compact]', 'Knowledge compacted successfully', cwd, session_id);
      }
    }

    // WRITE HANDOFF ENTRY
    writeHandoffEntry(knowledgePath, task.currentPhase, 'context auto-compact');

    // UPDATE STATUS to handoff
    updateTaskStatus(taskPath, 'handoff');

    // UPDATE STATE
    const state = getState(cwd);
    state.lastHandoff = new Date().toISOString();
    state.lastPhase = task.currentPhase;
    state.lastCompactAt = new Date().toISOString();
    saveState(cwd, state);

    log('info', '[pre-compact]', `Handoff to phase ${task.currentPhase}`, cwd, session_id);

    // Return continue to allow compact
    // systemMessage = short status for user
    // session-start.mjs (source='compact') handles Claude re-read instruction via additionalContext
    output({
      continue: true,
      systemMessage: `brewcode: compact handoff, phase ${task.currentPhase}/${task.totalPhases}`
    });
  } catch (error) {
    log('error', '[pre-compact]', `Error: ${error.message}`, cwd, session_id);
    // On error, still allow compact (don't crash session)
    output({ continue: true });
  }
}

main();
