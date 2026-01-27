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

    // Return system message reminding to call coordinator
    const agentName = String(subagentType || '').toUpperCase();
    output({
      systemMessage: `<ft-validation>
[${agentName} COMPLETED]
NEXT: Call ft-coordinator agent to:
1. Update phase status in TASK.md
2. Write agent output to reports/
3. Update MANIFEST.md
4. Add entries to KNOWLEDGE.jsonl

Use Task tool with subagent_type: "focus-task:ft-coordinator"
</ft-validation>`
    });
  } catch (error) {
    // On error, pass through without modification
    console.error(`[post-task] Error: ${error.message}`);
    output({});
  }
}

main();
