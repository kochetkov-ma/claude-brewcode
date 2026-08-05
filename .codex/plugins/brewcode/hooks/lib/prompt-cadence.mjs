import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE_DIR = process.env.CODEX_BREWCODE_HOOK_STATE_DIR
  || process.env.PLUGIN_DATA
  || path.join(os.tmpdir(), 'codex-brewcode-hooks');
const PROMPT_INTERVAL = 5;
const STALE_MS = 24 * 60 * 60 * 1000;

export const PROMPT_CONTEXT = [
  '[ROLE] Coordinate: a project expert in .codex/agents matches this domain -> delegate via sub-agent collaboration; no expert or trivial one-off -> do it directly.',
  '[SPLIT] One agent for an hour = drift you cannot observe: split into bounded units (1 deliverable, ~5 files, ~20 min), fan out in ONE message; a dependency must be a REAL data handoff, else parallel; every spawn brief carries goal + scope + what is already done + who consumes the result + acceptance.',
  '[BRANCH] Stay on the current branch; none chosen -> main. No explicit branch/PR instruction -> work on main and take over ALL workspace changes, incl. from other sessions.'
].join('\n');

function sessionKey(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 4096) return null;
  return createHash('sha256').update(sessionId, 'utf8').digest('hex');
}

function ensureStateDir() {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  chmodSync(STATE_DIR, 0o700);
}

function counterPath(key) {
  return path.join(STATE_DIR, `${key}.counter`);
}

function pruneStaleCounters() {
  const cutoff = Date.now() - STALE_MS;
  for (const name of readdirSync(STATE_DIR)) {
    if (!name.endsWith('.counter')) continue;
    const file = path.join(STATE_DIR, name);
    try {
      if (statSync(file).mtimeMs < cutoff) unlinkSync(file);
    } catch {}
  }
}

export function resetPromptCounter(sessionId) {
  const key = sessionKey(sessionId);
  if (!key) return;
  try {
    ensureStateDir();
    const file = counterPath(key);
    writeFileSync(file, '', { mode: 0o600 });
    chmodSync(file, 0o600);
    pruneStaleCounters();
  } catch {}
}

export function promptIsDue(sessionId) {
  const key = sessionKey(sessionId);
  if (!key) return false;
  try {
    ensureStateDir();
    const file = counterPath(key);
    appendFileSync(file, 'x', { mode: 0o600 });
    chmodSync(file, 0o600);
    const count = statSync(file).size;
    return Number.isSafeInteger(count) && count > 0 && count % PROMPT_INTERVAL === 0;
  } catch {
    return false;
  }
}
