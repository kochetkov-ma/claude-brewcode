#!/usr/bin/env node
/**
 * PostToolUse hook for Task tool
 * - Detects bc-coordinator and binds session to lock file
 * - Reminds to call bc-coordinator after work agents complete
 */
import {
  readStdin,
  output,
  isSystemAgent,
  isCoordinator,
  bindLockSession,
  getLock,
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
    const tool_result = input.tool_result;

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
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: `brewcode: session ${session_id?.slice(0, 8) || 'unknown'} bound to lock`
          }
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

    // Check lock - single read
    const lock = getLock(cwd);
    if (!lock) {
      // No valid lock = brewcode not running
      output({});
      return;
    }

    if (!lock.session_id) {
      output({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `brewcode: Task lock exists but session not bound. REQUIRED: Call bc-coordinator FIRST to initialize and bind this session. Then re-run your agent.`
        }
      });
      return;
    }

    if (lock.session_id !== session_id) {
      // Different session owns this task
      output({});
      return;
    }

    // Return 2-step post-agent protocol
    const agentName = String(subagentType || '').toUpperCase();
    const failed = tool_result?.is_error === true;
    const status = failed ? 'FAILED' : 'DONE';
    output({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `${agentName} ${status} -> 1. WRITE report 2. CALL bc-coordinator NOW`
      }
    });
  } catch (error) {
    // On error, pass through without modification
    log('error', '[post-task]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
