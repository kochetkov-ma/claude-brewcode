// brewtools:manager — UserPromptSubmit hook.
// Detects codeword in prompt and injects Manager mode block via additionalContext.
//   ++mp -> Manager + Plan Mode (planmode)   [tested before ++m: prefix collision]
//   ++m  -> Manager mode (full)
// Fail-safe: any error -> output({}) so the user's prompt is never broken.

import { readStdin, output } from './lib/utils.mjs';
import { resolveState } from './lib/manager-state.mjs';
import { resolvePrompt } from './lib/manager-prompts.mjs';

(async () => {
  try {
    const { prompt = '', cwd } = await readStdin();

    const hasMP = /(?<![\w+])\+\+mp(?![\w])/.test(prompt);
    const hasM  = /(?<![\w+])\+\+m(?![\w])/.test(prompt);
    const mode = hasMP ? 'planmode' : (hasM ? 'full' : null);
    if (!mode) { output({}); return; }

    const state = resolveState(cwd);
    if (state.enabled === false) { output({}); return; }

    const { text } = resolvePrompt(mode, cwd, process.env.CLAUDE_PLUGIN_ROOT);
    if (!text) { output({}); return; }

    const header = mode === 'planmode'
      ? 'User typed `++mp` — Manager + Plan Mode is active for this turn:'
      : 'User typed `++m` — Manager mode is active for this turn:';
    const block = `${header}\n\n${text}`;

    output({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: block
      }
    });
  } catch {
    output({});
  }
})();
