#!/usr/bin/env node
/**
 * PreCompact hook
 * Validates state, compacts knowledge, writes handoff entry before auto-compact
 */
import { existsSync } from 'fs';
import { join } from 'path';
import {
  readStdin,
  output,
  getActiveTaskPath,
  getKnowledgePath,
  getReportsDir,
  parseTask,
  updateTaskStatus,
  getState,
  saveState,
  loadConfig,
  log
} from './lib/utils.mjs';
import {
  localCompact,
  writeHandoffEntry
} from './lib/knowledge.mjs';

async function main() {
  try {
    const input = await readStdin();
    const { cwd } = input;

    // Check if focus-task is active
    const taskPath = getActiveTaskPath(cwd);
    if (!taskPath) {
      // Not a focus-task session, allow compact
      output({ continue: true });
      return;
    }

    // Parse task to get current state
    const task = parseTask(taskPath);

    // If task is finished, allow compact without validation
    if (task.status === 'finished') {
      output({ continue: true });
      return;
    }

    // VALIDATE STATE
    const validationIssues = [];

    // 1. Check reports directory exists for current phase
    const reportsDir = getReportsDir(taskPath, cwd);
    const phaseDir = join(reportsDir, `phase_${task.currentPhase}`);
    if (!existsSync(phaseDir)) {
      validationIssues.push(`Reports directory missing for phase ${task.currentPhase}`);
    }

    // 2. Check MANIFEST.md exists
    const manifestPath = join(reportsDir, 'MANIFEST.md');
    if (!existsSync(manifestPath)) {
      validationIssues.push('MANIFEST.md not found in reports directory');
    }

    // If validation issues, warn but continue (don't block compact)
    if (validationIssues.length > 0) {
      log('warn', '[pre-compact]', `Validation warnings:\n${validationIssues.join('\n')}`, cwd);
      // Still continue - better to compact than crash
    }

    // COMPACT KNOWLEDGE
    const knowledgePath = getKnowledgePath(taskPath);
    const config = loadConfig(cwd);
    if (existsSync(knowledgePath)) {
      const compacted = localCompact(knowledgePath, config.knowledge.maxEntries);
      if (compacted) {
        log('info', '[pre-compact]', 'Knowledge compacted successfully', cwd);
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
    saveState(cwd, state);

    // Return continue to allow compact
    // Also return a message to help Claude resume
    output({
      continue: true,
      systemMessage: `<ft-handoff>
[CONTEXT COMPACT - HANDOFF]
Task: ${taskPath}
Phase: ${task.currentPhase}/${task.totalPhases}
Status: handoff

AFTER COMPACT: Re-read TASK.md and continue from phase ${task.currentPhase}.
State preserved in:
- TASK.md: status, phases
- KNOWLEDGE.jsonl: accumulated knowledge
- reports/: agent outputs
</ft-handoff>`
    });
  } catch (error) {
    console.error(`[pre-compact] Error: ${error.message}`);
    // On error, still allow compact (don't crash session)
    output({ continue: true });
  }
}

main();
