#!/usr/bin/env node

/**
 * PreToolUse hook for Glob/Grep tools.
 * Reminds Claude to prefer grepai_search for semantic queries.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { readStdin, output, log } from './lib/utils.mjs';

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    const grepaiDir = join(cwd, '.grepai');

    if (existsSync(grepaiDir)) {
      log('debug', '[grepai]', 'Reminder triggered: grepai configured, Glob/Grep called', cwd, session_id);
      output({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: 'grepai: USE grepai_search FIRST for code exploration'
        }
      });
    } else {
      output({});
    }
  } catch (err) {
    log('error', '[grepai-reminder]', `Error: ${err.message}`, cwd, session_id);
    output({});
  }
}

main();
