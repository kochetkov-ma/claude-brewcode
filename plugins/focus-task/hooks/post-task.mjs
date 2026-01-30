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
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;
    const tool_input = input.tool_input;

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
        log('info', '[post-task]', `Bound session ${session_id?.slice(0, 8) || 'unknown'} to lock`, cwd, session_id);
        output({
          systemMessage: `focus-task: session ${session_id?.slice(0, 8) || 'unknown'} bound to lock`
        });
        return;
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
      // Check if lock exists but session not bound (coordinator hasn't run yet)
      const rawLock = getLock(cwd);
      if (rawLock && !rawLock.session_id) {
        output({
          systemMessage: `⚠️ focus-task: Task lock exists but session not bound.
REQUIRED: Call ft-coordinator FIRST to initialize and bind this session.
Then re-run your agent. The 2-step protocol will be enforced after coordinator completes.`
        });
        return;
      }
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
    log('error', '[post-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
