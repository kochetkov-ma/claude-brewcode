#!/usr/bin/env node
import { readStdin, output, log, projectRoot } from './lib/utils.mjs';

async function main() {
  let cwd = null;
  let session_id = null;
  try {
    cwd = projectRoot();
    const input = await readStdin();
    session_id = input.session_id;
    // State and logs are keyed on the project root: raw hook cwd may be a subdirectory.
    cwd = projectRoot(input.cwd);

    let context = '';
    let systemMessage = '';

    // Manager HARD wall awareness (fail-open: never break session start).
    try {
      const { resolveState } = await import('./lib/manager-state.mjs');
      const state = resolveState(cwd);
      if (state?.hard === true) {
        const level = state.level === 'strict' ? 'strict' : 'balanced';
        const bash = level === 'strict' ? 'all Bash' : 'Bash that is not read-only';
        systemMessage = `⛔ MANAGER HARD wall ON (project, level=${level})`;
        context = `Manager HARD wall active (project, level=${level}): a PreToolUse guard denies Write/Edit and ${bash} in the main session; subagents are not restricted, so implementation goes through the Agent tool. /brewtools:manager-setup disable to exit.`;
      }
    } catch (err) {
      log('warn', '[session-start]', `manager hard-wall check error (${err.message}), skipping`, cwd, session_id);
    }

    if (!context && !systemMessage) {
      output({});
      return;
    }

    const out = {};
    if (systemMessage) out.systemMessage = systemMessage;
    if (context) {
      out.hookSpecificOutput = {
        hookEventName: 'SessionStart',
        additionalContext: context
      };
    }
    output(out);
  } catch (error) {
    log('error', '[session-start]', `Error: ${error.message}`, cwd, session_id);
    output({});
  }
}

main();
