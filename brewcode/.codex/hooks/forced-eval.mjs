#!/usr/bin/env node

import { readInput, respond } from './lib/io.mjs';
import { PROMPT_CONTEXT, promptIsDue } from './lib/prompt-cadence.mjs';

try {
  const input = await readInput();
  if (input.hook_event_name !== 'UserPromptSubmit' || !promptIsDue(input.session_id)) {
    respond({});
  } else {
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    const skip = /^(?:yes|no|y|n|ok|okay|thanks|done|cancel|stop|continue|proceed|approved?|confirm(?:ed)?|\d+)$/i;
    if (!prompt || skip.test(prompt)) {
      respond({});
    } else {
      respond({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: PROMPT_CONTEXT
        }
      });
    }
  }
} catch {
  respond({});
}
