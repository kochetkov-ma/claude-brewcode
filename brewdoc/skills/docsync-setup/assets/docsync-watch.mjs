#!/usr/bin/env node
// brewcode-meta: version=6.4.0 content_version=6.0.0 generated_by=brewdoc:docsync-setup
/**
 * docsync-watch — PostToolUse:Read hook (self-contained, project-local)
 *
 * When the main session reads a tracked .md file: append one `read` event per file
 * to the session log. Silent by design. Reads are informational (status / reread):
 * the Stop gate lists edited docs only, so a read never causes a block.
 *
 * SELF-CONTAINED: helpers inlined, Node built-ins only, pure ESM. Reads project
 * state from <projectRoot>/.claude/docsync/ at runtime. Never throws, always exits 0.
 */
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, isAbsolute, dirname, resolve, sep } from 'path';

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
// Session log: one JSON event per line, one O_APPEND write each, so parallel hooks
// never overwrite each other (the old read-modify-write of a JSON file lost entries).
function appendEvent(p, ev) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(ev) + '\n');
    return true;
  } catch (err) {
    try { console.error(`[docsync-watch] state not writable: ${err.message}`); } catch {}
    return false;
  }
}
function readEvents(p) {
  let txt;
  try { txt = readFileSync(p, 'utf8'); } catch { return []; }
  return txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } });
}
// One log per session — a shared file let two concurrent sessions reset each
// other's touched-set. No session id (rare) falls back to state.jsonl.
function statePath(root, sessionId) {
  const id = String(sessionId || '').replace(/[^A-Za-z0-9._-]/g, '_');
  return join(root, '.claude', 'docsync', id ? `state-${id}.jsonl` : 'state.jsonl');
}

function loadConfig(root) {
  const c = readJson(join(root, '.claude', 'docsync', 'config.json'), {});
  return {
    // `disable` flips this to false and leaves everything else in place. Absent = on,
    // so a config written before the toggle existed keeps working.
    enabled: c.enabled !== false,
    threshold_days: Number.isInteger(c.threshold_days) && c.threshold_days > 0 ? c.threshold_days : 7,
    // No list in the config: `.claude/**` (reports, plans, agent files) is not project docs.
    exclude: Array.isArray(c.exclude) ? c.exclude : ['.claude/**']
  };
}

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
function parseFm(abs) {
  try {
    const txt = readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''); // strip UTF-8 BOM
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
// `cwd` resolves a relative tool_input path; the key itself is root-relative, so
// the Stop gate resolves it the same way no matter where the session wandered.
function relOf(cwd, root, fp) {
  const abs = isAbsolute(fp) ? fp : join(cwd, fp);
  const rel = relative(root, abs);
  return sep === '\\' ? rel.replace(/\\/g, '/') : rel; // exclude globs are written with `/`
}
// doc_type default: absent or unrecognized => 'user'. Only 'skip' removes a file from scope.
function docTypeOf(fields) {
  const v = String(fields.doc_type || '').trim().toLowerCase();
  return (v === 'llm' || v === 'user' || v === 'skip') ? v : 'user';
}
function isTracked(cwd, root, fp, cfg) {
  if (!fp || !fp.endsWith('.md')) return false;
  const rel = relOf(cwd, root, fp);
  if (!rel || /^\.\.(\/|$)/.test(rel) || isAbsolute(rel)) return false;
  if (isExcluded(rel, cfg.exclude)) return false;
  if (docTypeOf(parseFm(join(root, rel)).fields) === 'skip') return false;
  return true;
}
// ---------------------------------------------------------------------------

async function main() {
  try {
    const input = await readStdin();
    const cwd = input.cwd || process.cwd(); // relative tool_input paths ONLY
    const root = projectRoot(input.cwd);    // config + state live here
    const sessionId = input.session_id;
    const fp = input.tool_input && input.tool_input.file_path;

    const cfg = loadConfig(root);
    if (!cfg.enabled) { output({}); return; } // `disable`: registered but inert
    // Subagent reads (payload carries `agent_id`) are exploration, not doc work: not recorded.
    if (!input.agent_id && isTracked(cwd, root, fp, cfg)) {
      const rel = relOf(cwd, root, fp), log = statePath(root, sessionId);
      if (!readEvents(log).some(e => e && e.ev === 'read' && e.file === rel)) appendEvent(log, { ev: 'read', file: rel });
    }
    output({});
  } catch (err) {
    try { console.error(`[docsync-watch] ${err.message}`); } catch {}
    output({});
  }
}

main();
