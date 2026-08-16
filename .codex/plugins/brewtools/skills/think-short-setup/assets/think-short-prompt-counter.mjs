#!/usr/bin/env node
// brewcode-meta: version=6.1.0 content_version=6.0.0 generated_by=brewtools:think-short-setup
/**
 * think-short — UserPromptSubmit hook (self-contained, no plugin-root deps).
 *
 * Maintains a per-session prompt counter (marker keyed by session_id, inside a
 * private 0700 tmp dir we own — a planted symlink is rejected, never followed).
 * Increments on every user prompt; re-injects the full think-short prompt
 * ONLY every 10th prompt (10, 20, 30, ...). Never on the 1st prompt
 * (SessionStart already injected the prompt at session open).
 *
 * Inject channel: hookSpecificOutput.additionalContext (UserPromptSubmit).
 * Fail-open: never throws, always exits 0. On any error -> emits `{}` (no-op).
 */
import { readFile } from 'node:fs/promises';
import {
  chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(HERE, 'think-short-prompt.md');
const MARKER_DIR = path.join(os.tmpdir(), 'brewtools-think-short');
const UID = typeof process.getuid === 'function' ? process.getuid() : null;
const INTERVAL = 5;

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

/** Previous count, or null when the marker is absent, unreadable or not a file we own. */
function readCount(markerPath) {
  let st;
  try {
    st = lstatSync(markerPath); // lstat, never stat: do not follow a planted symlink
  } catch {
    return 0; // no marker yet -> start from 0
  }
  if (!st.isFile() || (UID !== null && st.uid !== UID)) return null;
  try {
    const parsed = parseInt(readFileSync(markerPath, 'utf8').trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return null;
  }
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

function bumpCounter(session_id) {
  // Returns the new count (>=1), or null if counting is unavailable.
  const markerPath = markerPathFor(session_id);
  if (!markerPath || !ensureMarkerDir()) return null;
  const prev = readCount(markerPath);
  if (prev === null) return null;
  const count = prev + 1;
  return writeAtomic(markerPath, String(count)) ? count : null;
}

async function main() {
  try {
    const input = await readStdin();
    const session_id = input.session_id;

    const count = bumpCounter(session_id);
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
