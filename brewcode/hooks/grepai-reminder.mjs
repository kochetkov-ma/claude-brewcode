#!/usr/bin/env node

/**
 * PreToolUse:Bash hook.
 * Native Grep/Glob tools were removed on this CC build; code search runs via Bash
 * (shadow grep->ugrep / find->bfs / rg). Reminds Claude to prefer grepai_search
 * when a grep/find/rg search command is run through Bash.
 */

import { existsSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readStdin, output, log } from './lib/utils.mjs';

const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/;

async function main() {
  let cwd = null;
  let session_id = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
    session_id = input.session_id;
    cwd = input.cwd || cwd;

    const command = input.tool_input && input.tool_input.command;
    if (!command) {
      output({});
      return;
    }

    if (!SEARCH_RE.test(command)) {
      output({});
      return;
    }

    const grepaiDir = join(cwd, '.grepai');
    const indexFile = join(grepaiDir, 'index.gob');

    if (existsSync(grepaiDir) && existsSync(indexFile)) {
      // Throttle: remind at most once per 60 seconds
      const tsFile = join(grepaiDir, '.reminder-ts');
      try {
        if (existsSync(tsFile)) {
          const age = Date.now() - statSync(tsFile).mtimeMs;
          if (age < 60_000) {
            output({});
            return;
          }
        }
        writeFileSync(tsFile, '');
      } catch (e) {
        log('warn', '[grepai-reminder]', `Throttle write failed: ${e.message}`, cwd, session_id);
      }

      log('debug', '[grepai-reminder]', 'Reminder triggered', cwd, session_id);
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
