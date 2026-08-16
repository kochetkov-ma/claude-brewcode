#!/usr/bin/env node
// brewcode-meta: version=6.1.4 content_version=6.0.0 generated_by=brewdoc:docsync-setup
/**
 * docsync-gate — Stop hook (self-contained, project-local)
 *
 * At end of turn: of the docs touched this session, re-apply the current scope
 * (exclude globs + doc_type: skip), then split the survivors into stale-by-date
 * (today - last_updated > threshold_days) and undated (no last_updated at all).
 * If either set is non-empty AND not already asked this session, block once and
 * instruct Claude to ask the user. The `asked` flag prevents an infinite Stop
 * loop, so this is at most ONE block per session — the block lists every stale
 * and undated doc known at that moment; docs that go stale later in the same
 * session are not re-nagged. touched/asked reset per session.
 *
 * SELF-CONTAINED: helpers inlined, Node built-ins only, pure ESM. Reads project
 * state from <projectRoot>/.claude/docsync/ at runtime. Never throws.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';

// --- inlined helpers -------------------------------------------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return {}; }
}
function output(r) { try { console.log(JSON.stringify(r)); } catch { console.log('{}'); } }
function readJson(p, fb) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } }
/**
 * Project root: CLAUDE_PROJECT_DIR -> upward walk for a root marker -> hook cwd. Never throws.
 * Hook `cwd` is "the working directory when the hook is invoked" and drifts mid-session
 * (docs/hooks.md:717, CwdChanged), so it is never the root for config/state/log placement;
 * keep it only for resolving relative paths out of `tool_input`.
 * @param {string|null} hookCwd - `input.cwd` from the hook payload
 * @returns {string} Absolute project root
 */
function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.claude'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd()); // last resort: never guess, never throw in a hook
}
// Atomic write: temp file + rename, so a crash never leaves a half-written state.
// The temp name carries the pid — hooks run in parallel and used to share one `.tmp`.
function writeJsonAtomic(p, o) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(o, null, 2));
    renameSync(tmp, p);
  } catch {}
}
// Local-time YYYY-MM-DD (matches `date +%F` used by the sync flow).
function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// One state file per session — a shared state.json let two concurrent sessions
// reset each other's touched-set. No session id (rare) falls back to state.json.
function statePath(root, sessionId) {
  const id = String(sessionId || '').replace(/[^A-Za-z0-9._-]/g, '_');
  return join(root, '.claude', 'docsync', id ? `state-${id}.json` : 'state.json');
}

function loadConfig(root) {
  const c = readJson(join(root, '.claude', 'docsync', 'config.json'), {});
  return {
    // `disable` flips this to false and leaves everything else in place. Absent = on,
    // so a config written before the toggle existed keeps working.
    enabled: c.enabled !== false,
    threshold_days: Number.isInteger(c.threshold_days) && c.threshold_days > 0 ? c.threshold_days : 7,
    exclude: Array.isArray(c.exclude) ? c.exclude : []
  };
}
// Minimal glob -> RegExp: supports **/ (any dir prefix), **, *, ?. Same as track/watch.
function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { i++; if (g[i + 1] === '/') { re += '(?:.*/)?'; i++; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
function isExcluded(rel, globs) {
  return globs.some(g => { try { return globToRegex(g).test(rel); } catch { return false; } });
}
// doc_type default: absent or unrecognized => 'user'. Only 'skip' removes a file from scope.
function docTypeOf(fields) {
  const v = String(fields.doc_type || '').trim().toLowerCase();
  return (v === 'llm' || v === 'user' || v === 'skip') ? v : 'user';
}
// Load state, resetting touched/asked when the session id changes.
function loadState(root, sessionId) {
  const s = readJson(statePath(root, sessionId), null);
  if (!s || s.session_id !== sessionId) return { session_id: sessionId, touched: [], asked: false };
  if (!Array.isArray(s.touched)) s.touched = [];
  return s;
}
function saveState(root, s) { writeJsonAtomic(statePath(root, s.session_id), s); }
// One file per session accumulates; the gate is the only once-per-turn hook, so it
// sweeps. Anything older than PRUNE_DAYS goes, including stray `.tmp` leftovers.
const PRUNE_DAYS = 14;
function pruneOldSessions(root, keepPath) {
  try {
    const dir = join(root, '.claude', 'docsync');
    const cutoff = Date.now() - PRUNE_DAYS * 86400000;
    for (const name of readdirSync(dir)) {
      if (!/^state(-.*)?\.json$/.test(name) && !name.endsWith('.tmp')) continue;
      const p = join(dir, name);
      if (p === keepPath) continue;
      try { if (statSync(p).mtimeMs < cutoff) unlinkSync(p); } catch {}
    }
  } catch {}
}
function parseFm(abs) {
  try {
    const txt = readFileSync(abs, 'utf8').replace(/^﻿/, ''); // strip UTF-8 BOM
    if (!txt.startsWith('---')) return { present: false, fields: {} };
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return { present: false, fields: {} };
    const fields = {};
    for (const line of m[1].split(/\r?\n/)) {
      const mm = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (!mm) continue;
      let v = mm[2].trim();
      if (v[0] === '"' || v[0] === "'") v = v.replace(/^["']|["']$/g, '');
      else v = v.replace(/\s+#.*$/, '').trim();
      fields[mm[1]] = v;
    }
    return { present: true, fields };
  } catch { return { present: false, fields: {} }; }
}
// Whole-day delta in LOCAL time: parse YYYY-MM-DD to local midnight on both sides.
function ageDays(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayMid - then) / 86400000);
}
// ---------------------------------------------------------------------------

async function main() {
  try {
    const input = await readStdin();
    const root = projectRoot(input.cwd); // config + state live here, never raw cwd
    const sessionId = input.session_id;

    const cfg = loadConfig(root);
    if (!cfg.enabled) { output({}); return; } // `disable`: never block a Stop while off
    const st = loadState(root, sessionId); // resets touched/asked on session change
    pruneOldSessions(root, statePath(root, sessionId));

    // Already nagged this session -> allow stop (persist current session id).
    if (st.asked) { saveState(root, st); output({}); return; }

    const stale = [], undated = [];
    for (const rel of st.touched) {
      // Re-apply scope at gate time: exclude globs and doc_type may have changed
      // AFTER the file was recorded (e.g. the doc was marked `skip` mid-session).
      if (isExcluded(rel, cfg.exclude)) continue;
      const fm = parseFm(join(root, rel));
      if (docTypeOf(fm.fields) === 'skip') continue;
      const lu = fm.fields.last_updated;
      if (!lu) { undated.push(rel); continue; }
      const days = ageDays(lu);
      if (days === null) { undated.push(`${rel} (unparsable last_updated)`); continue; }
      if (days > cfg.threshold_days) stale.push(`${rel} (${days}d)`);
    }

    if (stale.length === 0 && undated.length === 0) { saveState(root, st); output({}); return; }

    st.asked = true;
    saveState(root, st);
    const parts = [];
    if (stale.length) parts.push(`stale (>${cfg.threshold_days}d): ${stale.join(', ')}`);
    if (undated.length) parts.push(`no last_updated: ${undated.join(', ')}`);
    output({
      decision: 'block',
      reason: `docsync: ${parts.join(' | ')}. Ask the user via AskUserQuestion whether to sync now; if yes, sync each stale doc per its \`sync_procedure\` (a prose hint for you — no hook reads it) and set \`last_updated: "${today()}"\` in every listed doc, adding the frontmatter key to the undated ones; do NOT sync without confirmation. This is the only docsync block this session.`
    });
  } catch (err) {
    try { console.error(`[docsync-gate] ${err.message}`); } catch {}
    output({});
  }
}

main();
