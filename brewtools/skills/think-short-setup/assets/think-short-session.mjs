#!/usr/bin/env node
// brewcode-meta: version=6.1.4 content_version=6.0.0 generated_by=brewtools:think-short-setup
/**
 * think-short — SessionStart hook (self-contained, no plugin-root deps).
 *
 * - Injects the full think-short prompt via hookSpecificOutput.additionalContext.
 * - Resets the per-session prompt counter marker to 0 (so the UserPromptSubmit
 *   counter restarts each session).
 * - Prunes stale counter markers left by prior sessions (older than ~1 day) so
 *   the tmp marker dir stays self-cleaning.
 * - Marker dir is private (0700, owned by us) and every entry is lstat-checked,
 *   so a pre-planted symlink is rejected/unlinked, never written through.
 *
 * Fail-open: never throws, always exits 0. On any error -> emits `{}` (no-op).
 */
import { readFile } from 'node:fs/promises';
import {
  chmodSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(HERE, 'think-short-prompt.md');
const MARKER_DIR = path.join(os.tmpdir(), 'brewtools-think-short');
const UID = typeof process.getuid === 'function' ? process.getuid() : null;
const STALE_MS = 24 * 60 * 60 * 1000; // ~1 day

let markerDirOk;

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

/**
 * os.tmpdir() is world-writable, so the root can be pre-created by another user as
 * a symlink. Accept it only as a real directory we own with no group/world write.
 */
function ensureMarkerDir() {
  if (markerDirOk !== undefined) return markerDirOk;
  markerDirOk = false;
  try {
    mkdirSync(MARKER_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // may already exist; validated below either way
  }
  try {
    let st = lstatSync(MARKER_DIR);
    if (!st.isDirectory() || (UID !== null && st.uid !== UID)) return markerDirOk;
    if ((st.mode & 0o077) !== 0) {
      chmodSync(MARKER_DIR, 0o700);
      st = lstatSync(MARKER_DIR);
    }
    markerDirOk = (st.mode & 0o077) === 0;
  } catch {
    markerDirOk = false;
  }
  return markerDirOk;
}

/** Counter path for a session id, or null when the id cannot name a plain file. */
function markerPathFor(session_id) {
  if (!session_id || typeof session_id !== 'string') return null;
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(session_id) || session_id === '.' || session_id === '..') return null;
  return path.join(MARKER_DIR, `${session_id}.think-short-counter`);
}

/** tmp + rename: concurrent sessions cannot interleave, and rename never follows a link. */
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, file);
    return true;
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore
    }
    return false;
  }
}

function resetCounter(session_id) {
  const markerPath = markerPathFor(session_id);
  if (!markerPath || !ensureMarkerDir()) return; // counter just won't reset; not fatal
  writeAtomic(markerPath, '0');
}

// Best-effort: delete counter markers from prior sessions older than ~1 day.
// Never throws; the active session's marker (just reset above) is fresh and so
// is never old enough to be pruned.
function pruneStaleMarkers() {
  if (!ensureMarkerDir()) return;
  const cutoff = Date.now() - STALE_MS;
  let names;
  try {
    names = readdirSync(MARKER_DIR);
  } catch {
    return; // dir absent / unreadable -> nothing to prune
  }
  for (const name of names) {
    if (!name.endsWith('.think-short-counter')) continue;
    const p = path.join(MARKER_DIR, name);
    try {
      const st = lstatSync(p); // lstat, never stat: a planted symlink is unlinked, never followed
      if (st.mtimeMs >= cutoff) continue;
      if (!st.isSymbolicLink() && (!st.isFile() || (UID !== null && st.uid !== UID))) continue;
      rmSync(p, { force: true });
    } catch {
      // ignore individual file errors
    }
  }
}

async function main() {
  try {
    const input = await readStdin();
    const session_id = input.session_id;

    resetCounter(session_id);
    pruneStaleMarkers();

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
