// brewtools:manager — UserPromptSubmit hook.
// Injects a Manager mode block via additionalContext. Two triggers:
//   1. Codeword in prompt (always, regardless of state):
//        ++mp -> Manager + Plan Mode (planmode)  [tested before ++m: prefix collision]
//        ++m  -> Manager mode (full)
//   2. HARD wall ON (state.hard === true): ambient auto-inject of the 'full'
//        orchestrator block every turn (codeword absent).
// Fail-safe: any error -> output({}) so the user's prompt is never broken.

import { readStdin, output } from './lib/utils.mjs';
import { resolveState } from './lib/manager-state.mjs';
import { resolvePrompt } from './lib/manager-prompts.mjs';

(async () => {
  try {
    const { prompt = '', cwd } = await readStdin();
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

    const hasMP = /(?<![\w+])\+\+mp(?![\w])/.test(prompt);
    const hasM  = /(?<![\w+])\+\+m(?![\w])/.test(prompt);
    const codewordMode = hasMP ? 'planmode' : (hasM ? 'full' : null);

    if (codewordMode) {
      // Codeword present -> inject matching mode block ALWAYS (state-independent).
      const { text } = resolvePrompt(codewordMode, cwd, pluginRoot);
      if (!text) { output({}); return; }
      const header = codewordMode === 'planmode'
        ? 'User typed `++mp` — Manager + Plan Mode is active for this turn:'
        : 'User typed `++m` — Manager mode is active for this turn:';
      output({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `${header}\n\n${text}`
        }
      });
      return;
    }

    // No codeword -> ambient HARD wall injection if enabled.
    const state = resolveState(cwd);
    if (state.hard === true) {
      const { text } = resolvePrompt('full', cwd, pluginRoot);
      if (!text) { output({}); return; }
      const header = 'Manager HARD wall is ON — operate as orchestrator (delegate everything):';
      output({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `${header}\n\n${text}`
        }
      });
      return;
    }

    output({});
  } catch {
    output({});
  }
})();
