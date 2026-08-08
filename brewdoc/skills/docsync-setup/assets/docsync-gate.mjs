#!/usr/bin/env node
/**
 * docsync-gate — Stop hook (self-contained, project-local)
 *
 * At end of turn: of the docs touched this session, find which are stale by date
 * (today - last_updated > threshold_days). If any AND not already asked this
 * session, block once and instruct Claude to ask the user about syncing. The
 * `asked` flag prevents an infinite Stop loop. touched/asked reset per session.
 *
 * SELF-CONTAINED: helpers inlined, Node built-ins only, pure ESM. Reads project
 * state from <cwd>/.claude/docsync/ at runtime. Never throws.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';

// --- inlined helpers -------------------------------------------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return {}; }
}
function output(r) { try { console.log(JSON.stringify(r)); } catch { console.log('{}'); } }
function readJson(p, fb) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJsonAtomic(p, o) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    writeFileSync(tmp, JSON.stringify(o, null, 2));
    renameSync(tmp, p);
  } catch {}
}
// Local-time YYYY-MM-DD (matches `date +%F` used by the sync flow).
function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function statePath(cwd) { return join(cwd, '.claude', 'docsync', 'state.json'); }

function loadConfig(cwd) {
  const c = readJson(join(cwd, '.claude', 'docsync', 'config.json'), {});
  return { threshold_days: Number.isInteger(c.threshold_days) && c.threshold_days > 0 ? c.threshold_days : 7 };
}
// Load state, resetting touched/asked when the session id changes.
function loadState(cwd, sessionId) {
  const s = readJson(statePath(cwd), null);
  if (!s || s.session_id !== sessionId) return { session_id: sessionId, touched: [], asked: false };
  if (!Array.isArray(s.touched)) s.touched = [];
  return s;
}
function saveState(cwd, s) { writeJsonAtomic(statePath(cwd), s); }
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
    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id;

    const cfg = loadConfig(cwd);
    const st = loadState(cwd, sessionId); // resets touched/asked on session change

    // Already nagged this session -> allow stop (persist current session id).
    if (st.asked) { saveState(cwd, st); output({}); return; }

    const stale = [];
    for (const rel of st.touched) {
      const lu = parseFm(join(cwd, rel)).fields.last_updated;
      if (!lu) continue; // missing date -> track hook handles the nudge, not the gate
      const days = ageDays(lu);
      if (days === null) continue;
      if (days > cfg.threshold_days) stale.push(`${rel} (${days}d)`);
    }

    if (stale.length === 0) { saveState(cwd, st); output({}); return; }

    st.asked = true;
    saveState(cwd, st);
    output({
      decision: 'block',
      reason: `docsync: stale docs (>${cfg.threshold_days}d): ${stale.join(', ')}. Ask the user via AskUserQuestion whether to sync now; if yes, sync each per its sync_procedure and set last_updated to ${today()}; do NOT sync without confirmation.`
    });
  } catch (err) {
    try { console.error(`[docsync-gate] ${err.message}`); } catch {}
    output({});
  }
}

main();
