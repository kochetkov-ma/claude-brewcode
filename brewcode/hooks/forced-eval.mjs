#!/usr/bin/env node
/**
 * Forced Eval Hook - manager-role + split-discipline reminder.
 *
 * Event:   UserPromptSubmit
 * Channel: hookSpecificOutput.additionalContext — updatedInput is IGNORED on
 *          UserPromptSubmit in CC 2.1.x (silently dropped, no error).
 * Cadence: fires on the 1st real prompt, then every 10th (10, 20, 30, ...) —
 *          same session-keyed marker pattern as think-short-prompt-counter.mjs
 *          (private 0700 tmp dir we own, atomic write, lstat-only, planted
 *          symlink rejected). Meta-replies are skipped before the counter is
 *          touched, so they never consume or land on an inject slot.
 *          role-recall.mjs re-injects after compaction, so coverage stays.
 * Cap:     9000 chars, under the 2.1.174 10K disk-spill threshold.
 */

import { lstatSync, mkdirSync, chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStdin, output, capText } from './lib/utils.mjs';
// Shared with role-recall.mjs (SessionStart/compact) — one normative copy.
import { REMINDER_TEXT } from './lib/reminder.mjs';

const MARKER_DIR = path.join(os.tmpdir(), 'brewcode-forced-eval');
const UID = typeof process.getuid === 'function' ? process.getuid() : null;
const INTERVAL = 10;

let markerDirOk;

/** os.tmpdir() is world-writable; accept the root only as a real dir we own, mode 0700. */
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
  return path.join(MARKER_DIR, `${session_id}.forced-eval-counter`);
}

/** Previous count, or null when the marker is unreadable or not a file we own. */
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

// --- Main ---

async function main() {
  try {
    const input = await readStdin();
    const { prompt, hook_event_name, session_id } = input;

    // Validate event type
    if (hook_event_name !== 'UserPromptSubmit') {
      output({});
      return;
    }

    // Handle edge cases
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      output({});
      return;
    }

    const trimmedPrompt = prompt.trim();

    // No '/' skip: it existed for the removed skill nudge. A slash command can
    // still carry a task worth delegating, so the reminder applies there too.

    // Skip meta-commands that carry no task to delegate — never consumes a counter slot.
    const skipPatterns = [
      /^(yes|no|y|n|ok|okay|sure|thanks|thank you|done|cancel|stop|exit|quit)$/i,
      /^(continue|proceed|go ahead|approved?|confirm(ed)?|accept(ed)?)$/i,
      /^\d+$/,  // Just a number (selection)
      /^[a-z]$/i,  // Single letter (option selection)
    ];

    if (skipPatterns.some(pattern => pattern.test(trimmedPrompt))) {
      output({});
      return;
    }

    // Fire on the 1st real prompt, then every INTERVAL-th. Counting unavailable
    // (bad session_id, marker dir compromised) -> skip rather than spam.
    const count = bumpCounter(session_id);
    if (count === null || (count !== 1 && count % INTERVAL !== 0)) {
      output({});
      return;
    }

    // Inject the delegation reminder via additionalContext (updatedInput is
    // ignored on UserPromptSubmit in CC 2.1.x).
    output({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: capText(REMINDER_TEXT)
      }
    });

  } catch (error) {
    // Fail-safe: pass through on error (never trap user)
    console.error(`[forced-eval-hook] Error: ${error.message}`);
    output({});
  }
}

main();
