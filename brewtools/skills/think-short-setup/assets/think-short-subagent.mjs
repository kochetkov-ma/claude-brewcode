#!/usr/bin/env node
// brewcode-meta: version=6.1.4 content_version=5.6.1 generated_by=brewtools:think-short-setup
/**
 * think-short — SubagentStart hook (self-contained, no plugin-root deps).
 *
 * Delivers the full think-short prompt to every spawned subagent, replacing the
 * PreToolUse:Task `updatedInput` route (think-short-task.mjs, retired).
 *
 * WHY THIS CHANNEL (verified in the CC 2.1.232 bundle): `updatedInput` is a
 * single-writer channel — every PreToolUse hook receives the SAME original
 * tool_input and the runner ASSIGNS the result (`v = oe.updatedInput`), so two
 * hooks editing a Task prompt clobber each other. SubagentStart
 * `additionalContext` composes instead: each hook's contexts are appended
 * (`sr.push(...Wt.additionalContexts)`) and delivered to the subagent as one
 * attachment. Any number of hooks may add instructions; none can destroy
 * another's — no coexistence/yield logic needed.
 *
 * The injected block is the whole think-short-prompt.md MINUS its first line
 * (the `<!-- think-short -->` marker). Same body the SessionStart and
 * UserPromptSubmit hooks inject — no "lite" variant.
 *
 * stdin is not read; the text is identical for every agent type.
 * Fail-open: never throws, always exits 0. On any error -> `{}` (no-op).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(HERE, 'think-short-prompt.md');

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// Full prompt body minus the leading `<!-- think-short -->` comment line.
function loadInjection() {
  let text;
  try {
    text = fs.readFileSync(PROMPT_PATH, 'utf8');
  } catch {
    return null;
  }
  const lines = text.split('\n');
  if (lines.length && /^\s*<!--/.test(lines[0])) lines.shift();
  return lines.join('\n').trim() || null;
}

// `--check` — diagnostic parity with the retired PreToolUse hook. `yielded_to`
// is always `[]` here: additionalContext composes, so nothing is ever yielded.
function check() {
  const body = loadInjection();
  return { prompt_file: fs.existsSync(PROMPT_PATH), injects: Boolean(body), yielded_to: [] };
}

try {
  if (process.argv.includes('--check')) {
    output(check());
    process.stdout.write('\n');
  } else {
    const injection = loadInjection();
    output(
      injection
        ? { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: injection } }
        : {}
    );
  }
} catch {
  output({});
}
