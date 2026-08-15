#!/usr/bin/env node
/**
 * Role Recall Hook - re-injects the manager-role frame after a compaction.
 *
 * Event:   SessionStart, matcher "compact"
 * Channel: hookSpecificOutput.additionalContext — SessionStart results accumulate
 *          across hooks (no overwrite) and land next to the fresh summary.
 * Why:     forced-eval.mjs fires on UserPromptSubmit only. An AUTO-compaction
 *          mid-turn has no prompt, so the role frame is lost exactly where the
 *          summary already collapsed every earlier copy of it.
 * Cost:    3 short lines, unconditional, stateless — compactions may chain.
 */

import { readStdin, output, capText } from './lib/utils.mjs';
import { REMINDER_TEXT } from './lib/reminder.mjs';

async function main() {
  try {
    const input = await readStdin();

    // Only post-compaction starts; startup/resume/clear/fork carry the frame already.
    if (input.source !== 'compact') {
      output({});
      return;
    }

    output({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: capText(REMINDER_TEXT)
      }
    });

  } catch (error) {
    // Fail-open: compaction waits on this hook, it must never break it.
    console.error(`[role-recall-hook] Error: ${error.message}`);
    output({});
  }
}

main();
