#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { readInput, respond } from './lib/io.mjs';
import { PROMPT_CONTEXT, resetPromptCounter } from './lib/prompt-cadence.mjs';

try {
  const input = await readInput();
  if (input.hook_event_name !== 'SessionStart') {
    respond({});
  } else {
    resetPromptCounter(input.session_id);
    const pluginRoot = process.env.PLUGIN_ROOT || '';
    let version = 'unknown';
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
      if (typeof manifest.version === 'string') version = manifest.version;
    } catch {}
    respond({
      systemMessage: `Brewcode ${version} loaded for Codex`,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Brewcode skills use Codex-native paths, tools, hooks, and sub-agent conventions.\n${PROMPT_CONTEXT}`
      }
    });
  }
} catch {
  respond({});
}
