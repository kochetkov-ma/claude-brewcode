#!/usr/bin/env node
/**
 * think-short — UserPromptSubmit hook (self-contained, no plugin-root deps).
 *
 * Maintains a per-session prompt counter (tmp marker keyed by session_id).
 * Increments on every user prompt; re-injects the full think-short prompt
 * ONLY every 10th prompt (10, 20, 30, ...). Never on the 1st prompt
 * (SessionStart already injected the prompt at session open).
 *
 * Inject channel: hookSpecificOutput.additionalContext (UserPromptSubmit).
 * Fail-open: never throws, always exits 0. On any error -> emits `{}` (no-op).
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(HERE, 'think-short-prompt.md');
const MARKER_DIR = path.join(os.tmpdir(), 'brewtools-think-short');
const INTERVAL = 10;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

async function bumpCounter(session_id) {
  // Returns the new count (>=1), or null if counting is unavailable.
  if (!session_id || typeof session_id !== 'string') return null;
  try {
    await mkdir(MARKER_DIR, { recursive: true });
    const markerPath = path.join(MARKER_DIR, `${session_id}.think-short-counter`);

    let count = 0;
    try {
      const prev = await readFile(markerPath, 'utf8');
      const parsed = parseInt(prev.trim(), 10);
      if (Number.isFinite(parsed) && parsed >= 0) count = parsed;
    } catch {
      // no marker yet -> start from 0
    }

    count += 1;
    await writeFile(markerPath, String(count), 'utf8');
    return count;
  } catch {
    return null;
  }
}

async function main() {
  try {
    const input = await readStdin();
    const session_id = input.session_id;

    const count = await bumpCounter(session_id);
    if (count === null || count <= 0 || count % INTERVAL !== 0) {
      output({});
      return;
    }

    let promptText = '';
    try {
      promptText = await readFile(PROMPT_PATH, 'utf8');
    } catch {
      output({});
      return;
    }

    output({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: promptText.trimEnd(),
      },
    });
  } catch {
    output({});
  }
}

main();
