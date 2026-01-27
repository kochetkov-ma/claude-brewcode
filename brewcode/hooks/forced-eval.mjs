#!/usr/bin/env node
/**
 * Forced Eval Hook - Improves skill activation rate to 84%
 *
 * Event: UserPromptSubmit
 * Channel: updatedInput (most reliable)
 *
 * Based on: https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably
 *
 * Problem: Skills activate only ~20-50% of time because Claude may not check
 * available skills before responding to user prompts.
 *
 * Solution: Intercept every user prompt and prepend a reminder to check skills.
 * This increases activation rate to ~84% by making skill evaluation explicit.
 *
 * Output schema (UserPromptSubmit):
 * {
 *   "updatedInput": {
 *     "prompt": "modified prompt with skill-check reminder"
 *   }
 * }
 */

// --- stdin/stdout helpers ---

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function output(response) {
  console.log(JSON.stringify(response));
}

// --- Skill evaluation reminder ---

const SKILL_CHECK_REMINDER = `[SKILL?] Check available skills. If one matches this request, use Skill tool before responding.`;

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

    // Prepend skill-check reminder to prompt
    const modifiedPrompt = `${SKILL_CHECK_REMINDER}\n\n---\n\n${prompt}`;

    output({
      updatedInput: {
        prompt: modifiedPrompt
      }
    });

  } catch (error) {
    // Fail-safe: pass through on error (never trap user)
    console.error(`[forced-eval-hook] Error: ${error.message}`);
    output({});
  }
}

main();
