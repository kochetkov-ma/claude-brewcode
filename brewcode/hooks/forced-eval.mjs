#!/usr/bin/env node
/**
 * Forced Eval Hook - manager-role + split-discipline reminder.
 *
 * Event:   UserPromptSubmit
 * Channel: hookSpecificOutput.additionalContext — updatedInput is IGNORED on
 *          UserPromptSubmit in CC 2.1.x (silently dropped, no error).
 * Payload: 2 short lines, injected on EVERY prompt — keep it tiny.
 * Cap:     9000 chars, under the 2.1.174 10K disk-spill threshold.
 */

import { readStdin, output } from './lib/utils.mjs';

// Cap text channels under the 2.1.174 10K disk-spill threshold (headroom 9000).
const TEXT_CHANNEL_CAP = 9000;
function capText(s, max = TEXT_CHANNEL_CAP) {
  return (typeof s === 'string' && s.length > max) ? s.slice(0, max) + '\n...[truncated]' : s;
}

// --- Delegation reminder ---

// MANAGER_ROLE trigger is expert match, not task size — "heavy" wording let domain
// tasks (ssh, deploy) bypass delegation even when a project expert existed.
// SPLIT covers what models still get wrong: subagent sizing + context handoff.
// No skill-activation nudge: modern models pick skills on their own.
const MANAGER_ROLE = '[ROLE] Manager: scan agents (project .claude/agents/ first) - expert for this domain exists -> delegate regardless of size; no expert or trivial one-off -> self.';
const SPLIT = '[SPLIT] One agent for an hour = drift you cannot observe: split into bounded units (1 deliverable, ~5 files), fan out in ONE message; every spawn prompt carries goal + scope + what is already done + who consumes the result + acceptance.';
const REMINDER_TEXT = `${MANAGER_ROLE}\n${SPLIT}`;

// --- Main ---

async function main() {
  try {
    const input = await readStdin();
    const { prompt, session_id, cwd, hook_event_name } = input;

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
