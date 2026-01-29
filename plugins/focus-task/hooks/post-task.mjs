#!/usr/bin/env node
/**
 * PostToolUse hook for Task tool
 * - Detects ft-coordinator and binds session to lock file
 * - Reminds to call ft-coordinator after work agents complete
 */
import {
  readStdin,
  output,
  isSystemAgent,
  isCoordinator,
  bindLockSession,
  getLock,
  checkLock,
  loadConfig,
  log
} from './lib/utils.mjs';

async function main() {
  try {
    const input = await readStdin();
    const { tool_input, cwd, session_id } = input;

    // Only process Task tool calls
    if (!tool_input) {
      output({});
      return;
    }

    const subagentType = tool_input.subagent_type;

    // SPECIAL: Coordinator completed - bind session to lock
    if (isCoordinator(subagentType)) {
      const lock = getLock(cwd);
      if (lock && !lock.session_id) {
        bindLockSession(cwd, session_id);
        log('debug', '[post-task]', `Bound session ${session_id} to lock`, cwd);
      }
      output({});
      return;
    }

    // Skip other system agents - no reminder needed
    if (!subagentType || isSystemAgent(subagentType, cwd)) {
      output({});
      return;
    }

    // Check lock with session match
    const lock = checkLock(cwd, session_id);
    if (!lock) {
      // No valid lock = focus-task not running in this session
      output({});
      return;
    }

    // Return system message with mandatory 2-step post-agent protocol
    const agentName = String(subagentType || '').toUpperCase();
    output({
      systemMessage: `<ft-mandatory>
⛔ [${agentName} COMPLETED — 2 MANDATORY STEPS BEFORE ANY OTHER ACTION]

STEP 1 — WRITE REPORT (you do this directly):
Save ${agentName}'s output + your observations to report file:
  mkdir -p reports/.../phase_P/iter_N_type/
  Write: reports/.../phase_P/iter_N_type/${agentName.toLowerCase()}_output.md
Content: agent's actual output + your supplements/aggregation. Do NOT alter agent's findings.

STEP 2 — CALL COORDINATOR (reads report, extracts knowledge, updates status):
  subagent_type: "focus-task:ft-coordinator"
  prompt: "Phase {P}, iter {N}, type {exec|verify}. Task: {PATH}.
           Report written: {REPORT_PATH}. Read report, extract knowledge, update status + MANIFEST."

⛔ DO NOT call next agent or proceed to next phase until BOTH steps complete.
</ft-mandatory>`
    });
  } catch (error) {
    // On error, pass through without modification
    console.error(`[post-task] Error: ${error.message}`);
    output({});
  }
}

main();
