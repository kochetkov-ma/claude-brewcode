// brewtools:manager — UserPromptSubmit hook.
// Injects Manager/Review mode block(s) via additionalContext. Triggers:
//   1. Codeword in prompt (always, regardless of state). Codewords form TWO
//      INDEPENDENT groups; a prompt may activate one from each:
//        Manager group (mutually exclusive, ++mp wins over ++m):
//          ++mp -> Manager + Plan Mode (planmode)
//          ++m  -> Manager mode (full)
//        Review group (mutually exclusive, ++rr wins over ++r):
//          ++rr -> Anti-regression review discipline
//          ++r  -> Two-phase review discipline
//   2. HARD wall ON (state.hard === true): ambient auto-inject of the 'full'
//        orchestrator block every turn (codeword absent).
// Precedence: each group is detected INDEPENDENTLY. When both groups are present
//   we inject BOTH blocks (manager block first, then review block), concatenated
//   with a blank-line separator. When only one group is present, only that block
//   is injected. Longer-prefix variants (++mp, ++rr) win over their shorter
//   collisions (++m, ++r); the `(?![\w])` lookahead also keeps `++rr` from
//   falsely matching ++r and `++mp` from matching ++m.
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

    // Two independent groups. Manager: ++mp wins over ++m. Review: ++rr wins over ++r.
    let managerMode = null, managerHeader = null;
    if (hasMP) {
      managerMode = 'planmode';
      managerHeader = 'User typed `++mp` — Manager + Plan Mode is active for this turn:';
    } else if (hasM) {
      managerMode = 'full';
      managerHeader = 'User typed `++m` — Manager mode is active for this turn:';
    }

    let reviewMode = null, reviewHeader = null;
    if (hasRR) {
      reviewMode = 'review-regression';
      reviewHeader = 'User typed `++rr` — Anti-regression review discipline is active for this turn:';
    } else if (hasR) {
      reviewMode = 'review-double';
      reviewHeader = 'User typed `++r` — Two-phase review discipline is active for this turn:';
    }

    if (managerMode || reviewMode) {
      // Codeword(s) present -> inject matching block(s) ALWAYS (state-independent).
      const blocks = [];
      for (const [mode, head] of [[managerMode, managerHeader], [reviewMode, reviewHeader]]) {
        if (!mode) continue;
        const { text } = resolvePrompt(mode, cwd, pluginRoot);
        if (text) blocks.push(`${head}\n\n${text}`);
      }
      if (blocks.length === 0) { output({}); return; }
      output({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: capText(blocks.join('\n\n---\n\n'), 9000)
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
