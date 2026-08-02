#!/usr/bin/env node
import { readStdin, output, log } from './lib/utils.mjs';

async function main() {
  let cwd = null;
  let session_id = null;
  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    let context = '';
    let systemMessage = '';

    // Manager HARD wall awareness (fail-open: never break session start).
    try {
      const { resolveState } = await import('./lib/manager-state.mjs');
      const state = resolveState(cwd);
      if (state?.hard === true) {
        const level = state.level === 'strict' ? 'strict' : 'balanced';
        systemMessage = `⛔ MANAGER HARD wall ON (project, level=${level})`;
        context = `Manager HARD wall active (project, level=${level}): main session is orchestration-only - delegate in bounded units (one deliverable, ~5 files) and split a big job across several agents instead of one agent running for an hour. Brief every agent with goal + scope + what is already done + who consumes the result + acceptance; /brewtools:manager off to exit.`;
      }
    } catch (err) {
      log('info', '[session-start]', `manager hard-wall check error (${err.message}), skipping`, cwd, session_id);
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
