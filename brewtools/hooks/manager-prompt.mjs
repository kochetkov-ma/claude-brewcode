// brewtools:manager-setup — UserPromptSubmit: codewords `+++` (plan mode), `++m`, `++a`, `++rr`/`++r` -> block(s) via additionalContext.
// Codeword-only: wall state injects nothing (the guard's deny reason explains itself). Any error -> {} (fail-open).

import { readStdin, output, projectRoot } from './lib/utils.mjs';
import { resolvePrompt } from './lib/manager-prompts.mjs';

// additionalContext cap is 10,000 chars; override prompt files are user-authored and unbounded.
function capText(s, max = 9000) {
  return s.length > max ? s.slice(0, max) + '\n...[truncated]' : s;
}

// UserPromptSubmit also fires for subagent deliveries; only the leading tag marks them.
// Synthetic-prompt detector: leading `<task-notification>` or `<agent-message from=` after whitespace.
const SYNTHETIC_PROMPT = /^\s*<(?:task-notification>|agent-message\s+from=)/;

(async () => {
  try {
    const input = await readStdin();
    const { permission_mode } = input;
    const prompt = typeof input.prompt === 'string' ? input.prompt : '';
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;

    // A subagent's report quoting `++m` is not the user typing it.
    if (SYNTHETIC_PROMPT.test(prompt)) { output({}); return; }

    const hasM  = /(?<![\w+])\+\+m(?![\w])/i.test(prompt);
    const hasRR = /(?<![\w+])\+\+rr(?![\w])/i.test(prompt);
    const hasR  = /(?<![\w+])\+\+r(?![\w])/i.test(prompt);
    const hasA  = /(?<![\w+])\+\+a(?![\w])/i.test(prompt);
    const cronMode = permission_mode === 'plan' && /(?<![\p{L}\p{N}\p{M}_+])\+\+\+(?![\p{L}\p{N}\p{M}_+])/u.test(prompt)
      ? 'cron-plan' : null;

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

    if (!(cronMode || managerMode || archMode || reviewMode)) { output({}); return; }

    // Project overrides live under the project root, not the drifting hook cwd.
    const root = projectRoot(input.cwd);
    const blocks = [];
    for (const [mode, head] of [
      [cronMode, 'User typed `+++` in Plan mode — plan the task anti-drift cron:'],
      [managerMode, managerHeader], [archMode, archHeader], [reviewMode, reviewHeader]
    ]) {
      if (!mode) continue;
      const { text } = resolvePrompt(mode, root, pluginRoot);
      if (text) blocks.push(`${head}\n\n${text}`);
    }
    if (blocks.length === 0) { output({}); return; }
    output({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: capText(blocks.join('\n\n---\n\n'), 9000)
      }
    });
  } catch {
    output({});
  }
})();
