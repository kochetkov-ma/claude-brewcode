#!/usr/bin/env node
/**
 * grepai PreToolUse:Bash Hook (self-contained — installed into a user project)
 *
 * Native Grep/Glob tools were removed on this CC build; code search runs via Bash
 * (shadow grep->ugrep / find->bfs / rg). Reminds Claude to prefer grepai_search
 * when a grep/find/rg search command is run through Bash.
 *
 * SELF-CONTAINED: readStdin / output / log are inlined below. No plugin-root
 * paths, no shared lib import. Pure ESM, Node built-ins only. Exits 0 always.
 */
import { existsSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

// --- inlined helpers (from brewcode hooks lib/utils.mjs) -------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new Error(`Invalid stdin JSON: ${e.message}. Input: ${input.substring(0, 100)}`);
  }
}

function output(response) {
  try {
    console.log(JSON.stringify(response));
  } catch (e) {
    console.log(JSON.stringify({ error: `Serialization failed: ${e.message}` }));
  }
}

// Minimal log: stderr only for warn/error, never throws, no file deps.
function log(level, prefix, message) {
  if (level === 'error' || level === 'warn') {
    try { console.error(`${prefix} ${message}`); } catch {}
  }
}
// ---------------------------------------------------------------------------

const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/;

async function main() {
  let cwd = null;

  try {
    cwd = process.cwd();
    const input = await readStdin();
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
        log('warn', '[grepai-reminder]', `Throttle write failed: ${e.message}`);
      }

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
    log('error', '[grepai-reminder]', `Error: ${err.message}`);
    output({});
  }
}

main();
