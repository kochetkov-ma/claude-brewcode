#!/usr/bin/env node

import { readInput, respond } from './lib/io.mjs';
import { prompt, state } from './lib/manager.mjs';

try {
  const input = await readInput();
  if (input.hook_event_name !== 'UserPromptSubmit') {
    respond({});
  } else {
    const text = typeof input.prompt === 'string' ? input.prompt : '';
    const modes = [];
    if (/(?<![\w+])\+\+m(?![\w])/i.test(text)) modes.push(input.permission_mode === 'plan' ? 'planmode' : 'full');
    if (/(?<![\w+])\+\+a(?![\w])/i.test(text)) modes.push('architect');
    if (/(?<![\w+])\+\+rr(?![\w])/i.test(text)) modes.push('review-regression');
    else if (/(?<![\w+])\+\+r(?![\w])/i.test(text)) modes.push('review-double');
    if (modes.length === 0 && state(input.cwd || process.cwd()).hard) modes.push('full');

    const pluginRoot = process.env.PLUGIN_ROOT || '';
    const blocks = modes.map(mode => prompt(mode, input.cwd || process.cwd(), pluginRoot)).filter(Boolean);
    if (blocks.length === 0) {
      respond({});
    } else {
      respond({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: blocks.join('\n\n---\n\n').slice(0, 9000)
        }
      });
    }
  }
} catch {
  respond({});
}
