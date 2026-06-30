#!/usr/bin/env node
/**
 * think-short — SessionStart hook (self-contained, no plugin-root deps).
 *
 * - Injects the full think-short prompt via hookSpecificOutput.additionalContext.
 * - Resets the per-session prompt counter marker to 0 (so the UserPromptSubmit
 *   counter restarts each session).
 * - Prunes stale counter markers left by prior sessions (older than ~1 day) so
 *   the tmp marker dir stays self-cleaning.
 *
 * Fail-open: never throws, always exits 0. On any error -> emits `{}` (no-op).
 */
import { readFile, mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(HERE, 'think-short-prompt.md');
const MARKER_DIR = path.join(os.tmpdir(), 'brewtools-think-short');
const STALE_MS = 24 * 60 * 60 * 1000; // ~1 day

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

async function resetCounter(session_id) {
  if (!session_id || typeof session_id !== 'string') return;
  try {
    await mkdir(MARKER_DIR, { recursive: true });
    const markerPath = path.join(MARKER_DIR, `${session_id}.think-short-counter`);
    await writeFile(markerPath, '0', 'utf8');
  } catch {
    // ignore — counter just won't reset; not fatal
  }
}

// Best-effort: delete counter markers from prior sessions older than ~1 day.
// Never throws; the active session's marker (just reset above) is fresh and so
// is never old enough to be pruned.
async function pruneStaleMarkers() {
  const cutoff = Date.now() - STALE_MS;
  let names;
  try {
    names = await readdir(MARKER_DIR);
  } catch {
    return; // dir absent / unreadable -> nothing to prune
  }
  for (const name of names) {
    if (!name.endsWith('.think-short-counter')) continue;
    const p = path.join(MARKER_DIR, name);
    try {
      const st = await stat(p);
      if (st.mtimeMs < cutoff) await unlink(p);
    } catch {
      // ignore individual file errors
    }
  }
}

async function main() {
  try {
    const input = await readStdin();
    const session_id = input.session_id;

    await resetCounter(session_id);
    await pruneStaleMarkers();

    let promptText = '';
    try {
      promptText = await readFile(PROMPT_PATH, 'utf8');
    } catch {
      output({});
      return;
    }

    output({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: promptText.trimEnd(),
      },
    });
  } catch {
    output({});
  }
}

main();
