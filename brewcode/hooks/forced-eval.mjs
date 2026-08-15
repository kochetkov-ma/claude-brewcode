#!/usr/bin/env node
/**
 * Forced Eval Hook - manager-role + split-discipline reminder.
 *
 * Event:   UserPromptSubmit
 * Channel: hookSpecificOutput.additionalContext — updatedInput is IGNORED on
 *          UserPromptSubmit in CC 2.1.x (silently dropped, no error).
 * Payload: 3 short lines, injected on EVERY prompt — keep it tiny.
 * Cap:     9000 chars, under the 2.1.174 10K disk-spill threshold.
 */

import { readStdin, output, capText } from './lib/utils.mjs';
// Shared with role-recall.mjs (SessionStart/compact) — one normative copy.
import { REMINDER_TEXT } from './lib/reminder.mjs';

// --- Main ---

async function main() {
  try {
    const input = await readStdin();
    const { prompt, hook_event_name } = input;

    // Validate event type
    if (hook_event_name !== 'UserPromptSubmit') {
      output({});
      return;
    }

    // Handle edge cases
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      output({});
      return;
    }

    const trimmedPrompt = prompt.trim();

    // No '/' skip: it existed for the removed skill nudge. A slash command can
    // still carry a task worth delegating, so the reminder applies there too.

    // Skip meta-commands that carry no task to delegate
    const skipPatterns = [
      /^(yes|no|y|n|ok|okay|sure|thanks|thank you|done|cancel|stop|exit|quit)$/i,
      /^(continue|proceed|go ahead|approved?|confirm(ed)?|accept(ed)?)$/i,
      /^\d+$/,  // Just a number (selection)
      /^[a-z]$/i,  // Single letter (option selection)
    ];

    if (skipPatterns.some(pattern => pattern.test(trimmedPrompt))) {
      output({});
      return;
    }

    // Inject the delegation reminder via additionalContext (updatedInput is
    // ignored on UserPromptSubmit in CC 2.1.x).
    output({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: capText(REMINDER_TEXT)
      }
    });

  } catch (error) {
    // Fail-safe: pass through on error (never trap user)
    console.error(`[forced-eval-hook] Error: ${error.message}`);
    output({});
  }
}

main();
