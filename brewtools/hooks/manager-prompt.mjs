// brewtools:manager-setup — UserPromptSubmit hook.
// Injects Manager/Architecture/Review mode block(s) via additionalContext. Triggers:
//   1. Codeword in prompt (always, regardless of state). FOUR codewords in THREE
//      INDEPENDENT groups; a prompt may activate one from each:
//        Manager group:
//          ++m  -> Manager mode. PLAN-AWARE: when permission_mode === 'plan'
//                  it injects the planmode block (full + plan addon); otherwise
//                  the plain full block. There is NO separate ++mp codeword.
//        Architecture group:
//          ++a  -> Architecture-first directive. Mode-agnostic: the SAME block
//                  injects in plan and normal mode (in plan mode the design is
//                  written into the plan itself). Independent of manager/review;
//                  freely combinable with either or both.
//        Review group (mutually exclusive, ++rr wins over ++r):
//          ++rr -> Anti-regression review discipline
//          ++r  -> Two-phase review discipline
//   2. HARD wall ON (state.hard === true): ambient auto-inject of the 'full'
//        orchestrator block every turn (codeword absent).
// Precedence: each group is detected INDEPENDENTLY. When groups co-occur we inject
//   ALL matching blocks (manager first, then architect, then review), concatenated
//   with a blank-line separator. When only one group is present, only that block
//   is injected. The longer-prefix variant ++rr wins over ++r; the `(?![\w])`
//   lookahead also keeps `++rr` from falsely matching ++r.
//   The architect and review codewords are codeword-ONLY (no ambient/state injection).
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
    const { prompt = '', cwd, permission_mode } = await readStdin();
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

    const hasM  = /(?<![\w+])\+\+m(?![\w])/.test(prompt);
    const hasRR = /(?<![\w+])\+\+rr(?![\w])/.test(prompt);
    const hasR  = /(?<![\w+])\+\+r(?![\w])/.test(prompt);
    const hasA  = /(?<![\w+])\+\+a(?![\w])/.test(prompt);

    // Two independent groups. Manager (++m) is plan-aware: when the session is in
    // plan mode (permission_mode === 'plan') it injects the planmode block (full +
    // plan addon), otherwise the plain full block. Review: ++rr wins over ++r.
    let managerMode = null, managerHeader = null;
    if (hasM) {
      const planMode = permission_mode === 'plan';
      managerMode = planMode ? 'planmode' : 'full';
      managerHeader = planMode
        ? 'User typed `++m` — Manager + Plan Mode is active for this turn:'
        : 'User typed `++m` — Manager mode is active for this turn:';
    }

    let archMode = null, archHeader = null;
    if (hasA) {
      archMode = 'architect';
      archHeader = 'User typed `++a` — Architecture-first discipline is active for this turn:';
    }

    let reviewMode = null, reviewHeader = null;
    if (hasRR) {
      reviewMode = 'review-regression';
      reviewHeader = 'User typed `++rr` — Anti-regression review discipline is active for this turn:';
    } else if (hasR) {
      reviewMode = 'review-double';
      reviewHeader = 'User typed `++r` — Two-phase review discipline is active for this turn:';
    }

    if (managerMode || archMode || reviewMode) {
      // Codeword(s) present -> inject matching block(s) ALWAYS (state-independent).
      const blocks = [];
      for (const [mode, head] of [[managerMode, managerHeader], [archMode, archHeader], [reviewMode, reviewHeader]]) {
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
