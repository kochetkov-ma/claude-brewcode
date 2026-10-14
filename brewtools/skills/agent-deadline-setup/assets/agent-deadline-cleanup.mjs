#!/usr/bin/env node
// brewcode-meta: version=6.6.2 content_version=6.5.0 generated_by=brewtools:agent-deadline-setup

// agent-deadline SubagentStop (fires several times per agent_id): stamp `stopped` (never delete: a fresh budget), prune
// stale entries by age, lstat-only (shared tmp, no symlink follow). Fail-open `{}`, never blocks a stop.
import {
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  lstatSync,
  rmSync,
  rmdirSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STATE_ROOT = path.join(os.tmpdir(), 'brewtools-agent-deadline');
const STALE_MS = 24 * 60 * 60 * 1000;
const RESUME_GRACE_MS = 5 * 60 * 1000; // must equal the guard's RESUME_GRACE_MS
const PRUNE_MAX = 64; // entries examined per prune pass: bounded work per hook call
const UID = typeof process.getuid === 'function' ? process.getuid() : null;

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function safeSegment(s) {
  const raw = typeof s === 'number' && Number.isFinite(s) ? String(s) : s;
  if (typeof raw !== 'string') return null;
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return clean && clean !== '.' && clean !== '..' ? clean : null;
}

/** True only for a real directory owned by this user (never a symlink). */
function ownedDir(p) {
  try {
    const st = lstatSync(p);
    return st.isDirectory() && (UID === null || st.uid === UID);
  } catch {
    return false;
  }
}

// Test seam: AGENT_DEADLINE_NOW (epoch ms) pins the clock so suites assert exact values.
function clockNow() {
  const v = Number(process.env.AGENT_DEADLINE_NOW);
  return Number.isFinite(v) && v > 0 ? v : Date.now();
}

function readState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// SubagentStop fires several times per agent_id (block, harness nudge, resume): keep
// the clock, only stamp the stop. Missing/unreadable state -> nothing to mark.
function markStopped(file, now) {
  const state = readState(file);
  if (!state) return;
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify({ ...state, stopped: now }), { mode: 0o600 });
    renameSync(temp, file);
  } catch {
    rmSync(temp, { force: true });
  }
}

// Drops state the guard would ignore anyway: a stop mark past the resume grace,
// and anything untouched for STALE_MS (agent died without a SubagentStop).
function pruneSession(dir, now) {
  for (const name of readdirSync(dir).slice(0, PRUNE_MAX)) {
    const p = path.join(dir, name);
    try {
      const age = now - lstatSync(p).mtimeMs;
      if (age < RESUME_GRACE_MS) continue;
      const state = age < STALE_MS ? readState(p) : null;
      const dead = age >= STALE_MS || (state && Number.isFinite(state.stopped) && now - state.stopped >= RESUME_GRACE_MS);
      if (dead) rmSync(p, { force: true });
    } catch {
      // ignore individual entries
    }
  }
  try {
    rmdirSync(dir); // succeeds only when the session dir is empty
  } catch {
    // still holds live state
  }
}

function pruneStale(now) {
  // readdir would happily follow a symlinked root and we would then prune the
  // victim's entries; refuse anything that is not a real directory we own.
  if (!ownedDir(STATE_ROOT)) return;
  const cutoff = now - STALE_MS;
  let names;
  try {
    names = readdirSync(STATE_ROOT);
  } catch {
    return;
  }
  for (const name of names.slice(0, PRUNE_MAX)) {
    const p = path.join(STATE_ROOT, name);
    try {
      const st = lstatSync(p); // lstat, never stat: a symlink must not be followed
      if (!st.isDirectory()) {
        if (st.mtimeMs < cutoff) rmSync(p, { force: true }); // unlink the link itself
        continue;
      }
      if (UID !== null && st.uid !== UID) continue;
      if (st.mtimeMs < cutoff) rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore individual entries
    }
  }
}

function main() {
  let input = {};
  try {
    const raw = readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw) || {};
  } catch {
    // unreadable payload -> still worth pruning
  }

  const agentId = safeSegment(input.agent_id);
  const sessionId = safeSegment(input.session_id) || 'nosession';
  const now = clockNow();

  const dir = path.join(STATE_ROOT, sessionId);
  if (ownedDir(STATE_ROOT) && ownedDir(dir)) {
    try {
      if (agentId) {
        // guard writes are temp-file + rename; drop any temp left by a killed hook
        for (const name of readdirSync(dir).slice(0, PRUNE_MAX)) {
          if (name.startsWith(`${agentId}.json.`) && name.endsWith('.tmp')) {
            rmSync(path.join(dir, name), { force: true });
          }
        }
        markStopped(path.join(dir, `${agentId}.json`), now);
      }
      pruneSession(dir, now);
    } catch {
      // ignore
    }
  }

  pruneStale(now);
  output({});
}

try {
  main();
} catch {
  output({});
}
