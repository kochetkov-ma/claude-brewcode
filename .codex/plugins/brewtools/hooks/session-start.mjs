#!/usr/bin/env node

import { readInput, respond } from './lib/io.mjs';
import { state } from './lib/manager.mjs';

try {
  const input = await readInput();
  if (input.hook_event_name !== 'SessionStart') {
    respond({});
  } else {
    const current = state(input.cwd || process.cwd());
    if (!current.hard) {
      respond({});
    } else {
      respond({
        systemMessage: `Brewtools manager prompt mode is active (${current.level})`,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'Manager prompt mode is active: delegate in bounded units (one deliverable, ~5 files) and split a big job across several agents rather than leaving one agent running for an hour, briefing each with goal + scope + what is already done + who consumes the result + acceptance. Codex PreToolUse cannot distinguish parent and sub-agent calls, so this package does not claim a hard enforcement boundary.'
        }
      });
    }
  }
} catch {
  respond({});
}
