// brewtools:manager — UserPromptSubmit hook.
// Injects a Manager mode block via additionalContext. Triggers:
//   1. Codeword in prompt (always, regardless of state):
//        ++mp -> Manager + Plan Mode (planmode)  [tested before ++m: prefix collision]
//        ++m  -> Manager mode (full)
//        ++rr -> Anti-regression review discipline   [tested before ++r: prefix collision]
//        ++r  -> Two-phase review discipline
//   2. HARD wall ON (state.hard === true): ambient auto-inject of the 'full'
//        orchestrator block every turn (codeword absent).
// Precedence: a single prompt may contain several codewords; we check
//   ++mp, ++m, ++rr, ++r in that order and inject the FIRST match only.
//   Longer-prefix variants (++mp, ++rr) are tested before their shorter
//   collisions (++m, ++r) so `++rr` never falsely triggers the ++r branch.
//   The review codewords are codeword-ONLY (no ambient/state injection).
// Fail-safe: any error -> output({}) so the user's prompt is never broken.

import { readStdin, output } from './lib/utils.mjs';
import { resolveState } from './lib/manager-state.mjs';
import { resolvePrompt } from './lib/manager-prompts.mjs';

// E8: bound additionalContext under the 2.1.174 10K text-channel disk-spill threshold.
// Override prompt files (project/global) are user-authored and unbounded; cap the final
// injected string only. Does NOT affect which prompt is selected or codeword detection.
function capText(s, max = 9000) {
  return s.length > max ? s.slice(0, max) + '\n...[truncated]' : s;
}

(async () => {
  try {
    const { prompt = '', cwd } = await readStdin();
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

    const hasMP = /(?<![\w+])\+\+mp(?![\w])/.test(prompt);
    const hasM  = /(?<![\w+])\+\+m(?![\w])/.test(prompt);
    const hasRR = /(?<![\w+])\+\+rr(?![\w])/.test(prompt);
    const hasR  = /(?<![\w+])\+\+r(?![\w])/.test(prompt);

    // First match wins: ++mp, ++m, ++rr, ++r (longer prefixes before collisions).
    let codewordMode = null;
    let header = null;
    if (hasMP) {
      codewordMode = 'planmode';
      header = 'User typed `++mp` — Manager + Plan Mode is active for this turn:';
    } else if (hasM) {
      codewordMode = 'full';
      header = 'User typed `++m` — Manager mode is active for this turn:';
    } else if (hasRR) {
      codewordMode = 'review-regression';
      header = 'User typed `++rr` — Anti-regression review discipline is active for this turn:';
    } else if (hasR) {
      codewordMode = 'review-double';
      header = 'User typed `++r` — Two-phase review discipline is active for this turn:';
    }

    if (codewordMode) {
      // Codeword present -> inject matching mode block ALWAYS (state-independent).
      const { text } = resolvePrompt(codewordMode, cwd, pluginRoot);
      if (!text) { output({}); return; }
      output({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: capText(`${header}\n\n${text}`, 9000)
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
          additionalContext: capText(`${header}\n\n${text}`, 9000)
        }
      });
      return;
    }

    output({});
  } catch {
    output({});
  }
})();
