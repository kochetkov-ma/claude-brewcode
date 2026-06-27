#!/usr/bin/env node
/**
 * Forced Eval Hook - Improves skill activation rate to 84%
 *
 * Event: UserPromptSubmit
 * Channel: hookSpecificOutput.additionalContext
 *
 * Based on: https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably
 *
 * Problem: Skills activate only ~20-50% of time because Claude may not check
 * available skills before responding to user prompts.
 *
 * Solution: Intercept every user prompt and inject a reminder to check skills.
 * This increases activation rate to ~84% by making skill evaluation explicit.
 *
 * NOTE: updatedInput is ignored on UserPromptSubmit in CC 2.1.x - must use additionalContext.
 *
 * Output schema (UserPromptSubmit):
 * {
 *   "hookSpecificOutput": {
 *     "hookEventName": "UserPromptSubmit",
 *     "additionalContext": "skill-check + light hint (full Manager mode via ++m)"
 *   }
 * }
 */

import { readStdin, output, getActiveMode } from './lib/utils.mjs';

// Cap text channels under the 2.1.174 10K disk-spill threshold (headroom 9000).
const TEXT_CHANNEL_CAP = 9000;
function capText(s, max = TEXT_CHANNEL_CAP) {
  return (typeof s === 'string' && s.length > max) ? s.slice(0, max) + '\n...[truncated]' : s;
}

// --- Skill evaluation reminder ---

// SKILL_CHECK = always-on payload (every prompt). DEFAULT_MODE = light hint when no
// active mode is set; full Manager framing is opt-in on demand via codeword ++m (brewtools:manager).
const SKILL_CHECK = '[SKILL?] Check available skills. If one matches, use Skill tool before responding.';
const DEFAULT_MODE = '[HINT] Prefer delegating heavy implementation work to sub-agents (Task tool) when it helps. Full Manager mode: type ++m.';

function getModeReminder(cwd, sessionId) {
  const activeMode = getActiveMode(cwd, sessionId);
  if (activeMode) {
    return `${SKILL_CHECK}\n[MODE: ${activeMode.name}] ${activeMode.instructions}`;
  }
  return `${SKILL_CHECK}\n${DEFAULT_MODE}`;
}

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

    // Skip if user is already invoking a skill (starts with /)
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.startsWith('/')) {
      output({});
      return;
    }

    // Skip meta-commands that shouldn't trigger skill check
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

    // Effort-level prefix (CC 2.1.115+). Folded into injected context.
    // NOTE: effort.level is NOT in HOOKS-REFERENCE.md (2.1.195). Presence-guarded existing read; do not expand to other hooks.
    const effortLevel = input.effort?.level;
    const effortPrefix = effortLevel === 'low' ? '[EFFORT: low | MODE: terse-light]\n' : '';

    // Inject skill-check reminder via additionalContext (updatedInput is ignored
    // on UserPromptSubmit in CC 2.1.x).
    const reminderText = `${effortPrefix}${getModeReminder(cwd, session_id)}`;

    output({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: capText(reminderText)
      }
    });

  } catch (error) {
    // Fail-safe: pass through on error (never trap user)
    console.error(`[forced-eval-hook] Error: ${error.message}`);
    output({});
  }
}

main();
