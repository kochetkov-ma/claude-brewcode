#!/usr/bin/env node
// brewcode-meta: version=6.6.2 content_version=6.5.1 generated_by=brewcode:semble-setup

// SessionStart: reports .claude/semble/state.json + active-profile MCP registration; ready -> one usage directive.
// Never spawns or blocks; one JSON object, exit 0; Node built-ins, no imports (travels alone).
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- inlined helpers -------------------------------------------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function output(response) {
  let text = '{}';
  try {
    text = JSON.stringify(response === undefined ? {} : response);
  } catch {
    text = '{}';
  }
  process.stdout.write(text + '\n');
}

function warn(message) {
  try {
    process.stderr.write('[semble-session] ' + message + '\n');
  } catch {
    /* stderr is best-effort */
  }
}
// --- telemetry (best-effort, never throws, never changes hook output) ------
const TELEMETRY_SRC = 'session';
const TELEMETRY_MAX_BYTES = 2_000_000;
const TELEMETRY_KEEP_LINES = 1000;

// One JSONL record -> .claude/semble/telemetry.jsonl via a single appendFileSync; every failure swallowed.
function telemetry(cwd, sid, ev, extra) {
  try {
    const file = join(cwd, '.claude', 'semble', 'telemetry.jsonl');
    try {
      if (statSync(file).size > TELEMETRY_MAX_BYTES) {
        const kept = readFileSync(file, 'utf8').split('\n').filter((l) => l).slice(-TELEMETRY_KEEP_LINES);
        writeFileSync(file, kept.join('\n') + '\n');
      }
    } catch {
      /* no file yet, or the trim failed - append anyway */
    }
    const rec = {
      ts: new Date().toISOString(),
      ev,
      src: TELEMETRY_SRC,
      sid: typeof sid === 'string' ? sid : '',
      ...(extra || {}),
    };
    appendFileSync(file, JSON.stringify(rec) + '\n');
  } catch {
    /* telemetry must never break a hook */
  }
}
// ---------------------------------------------------------------------------

// --- MCP presence + search routing (identical in every steering semble hook) ---
// No hook input reports MCP: read <CLAUDE_CONFIG_DIR|home>/.claude.json (user+local), then <root>/.mcp.json; never throws.
const MCP_NAME = 'semble_code';
const ROUTE = 'Search routing: intent/behaviour -> semble; symbol definitions/references -> LSP; literals/paths/regex/counts -> rg.';

function mcpEntry(obj) {
  const m = obj && typeof obj === 'object' ? obj.mcpServers : null;
  const e = m && typeof m === 'object' && !Array.isArray(m) ? m[MCP_NAME] : null;
  return e && typeof e === 'object' && !Array.isArray(e) ? e : null;
}

const listsMcp = (a) => Array.isArray(a) && a.indexOf(MCP_NAME) >= 0;

/** The `semble_code` entry Claude Code loads for `root` in the active profile, or null. */
function mcpRegistration(root) {
  let cfg = null;
  try {
    const raw = readFileSync(join(process.env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json'), 'utf8');
    if (raw.indexOf('"' + MCP_NAME + '"') >= 0) cfg = JSON.parse(raw); // name absent: skip the parse
  } catch {
    cfg = null;
  }
  const proj = cfg && cfg.projects && typeof cfg.projects === 'object' ? cfg.projects[root] : null;
  if (proj && listsMcp(proj.disabledMcpServers)) return null;
  const found = mcpEntry(proj) || mcpEntry(cfg);
  if (found) return found;
  if (proj && listsMcp(proj.disabledMcpjsonServers)) return null;
  try {
    const raw = readFileSync(join(root, '.mcp.json'), 'utf8');
    return raw.indexOf('"' + MCP_NAME + '"') >= 0 ? mcpEntry(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
// ---------------------------------------------------------------------------

const CORRUPT = { systemMessage: 'semble: state file is corrupt — run /brewcode:semble-setup status' };
const NO_MCP = { systemMessage: 'semble: semble_code MCP is not registered for this profile — run /brewcode:semble-setup status' };

/** Reads state.json. Returns {kind:'missing'|'corrupt'|'ok', state}. */
function readState(cwd) {
  const file = join(cwd, '.claude', 'semble', 'state.json');
  let st;
  try {
    st = statSync(file);
  } catch {
    return { kind: 'missing' };
  }
  if (!st.isFile()) return { kind: 'corrupt' };
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    warn('unreadable state file: ' + e.message);
    return { kind: 'corrupt' };
  }
  if (!raw.trim()) return { kind: 'missing' };
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt' };
  }
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return { kind: 'corrupt' };
  return { kind: 'ok', state };
}

function decide(cwd) {
  const read = readState(cwd);
  if (read.kind === 'missing') return {}; // semble is not configured here — never nag
  if (read.kind === 'corrupt') return CORRUPT;

  const state = read.state;
  const phase = typeof state.phase === 'string' ? state.phase : '';

  if (state.enabled === false || phase === 'disabled') {
    return { systemMessage: 'semble: disabled for this project' };
  }
  // No usability claim without a registration in the ACTIVE profile; the user still sees why.
  if ((phase === 'awaiting_reload' || phase === 'ready') && !mcpRegistration(cwd)) return NO_MCP;
  if (phase === 'awaiting_reload') {
    // Index builds lazily INSIDE a tool call: waiting for `resume` blocks verification -> use it, close out after.
    return {
      systemMessage: 'semble: awaiting reload — run /brewcode:semble-setup resume',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          'semble_code MCP is registered but not verified yet. It is usable now — ' +
          'mcp__semble_code__search (repo=' + cwd + ', top_k=5, max_snippet_lines=10); ' +
          'the first call rebuilds the index and may take minutes. ' +
          'Run /brewcode:semble-setup resume to close the state out. ' + ROUTE,
      },
    };
  }
  if (phase === 'error') {
    return { systemMessage: 'semble: error — run /brewcode:semble-setup status' };
  }
  if (phase === 'ready') {
    const hash = typeof state.repoHash === 'string' ? state.repoHash.slice(0, 8) : '';
    return {
      systemMessage: 'semble: ready | cache ' + (hash || 'unknown'),
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          'semble: use ONE mcp__semble_code__search first (repo=' + cwd +
          ', top_k=5, max_snippet_lines=10), then open the hit at start_line. ' + ROUTE,
      },
    };
  }
  if (phase) return { systemMessage: 'semble: ' + phase };
  return {};
}

// --- project root: CLAUDE_PROJECT_DIR -> own <root>/.claude/hooks/ location -> upward walk -> hook cwd ---
// Never throws; `input.cwd` drifts mid-session (CwdChanged) -> keys only tool_input relative paths.
const SELF_ROOT = (() => {
  const d = dirname(fileURLToPath(import.meta.url));
  return basename(d) === 'hooks' && basename(dirname(d)) === '.claude' ? dirname(dirname(d)) : '';
})();

// Mirrors sc_is_profile_parent: HOME (real or test) or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if ([process.env.HOME, process.env.SEMBLE_TEST_HOME].some((h) => h && real(h) === p)) return true;
  const cfg = process.env.SEMBLE_TEST_HOME ? process.env.SEMBLE_TEST_CONFIG_DIR : process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === join(p, '.claude');
}

function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);
  if (SELF_ROOT && !isProfileParent(SELF_ROOT)) return SELF_ROOT;

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd()); // last resort: never guess, never throw in a hook
}


async function main() {
  let root = projectRoot('');
  try {
    let input = {};
    try {
      input = await readStdin();
    } catch {
      input = {}; // malformed/empty stdin: behave as an unconfigured project
    }
    root = projectRoot(input && typeof input.cwd === 'string' ? input.cwd : '');
    const response = decide(root);
    const hso = response && response.hookSpecificOutput;
    if (hso && typeof hso.additionalContext === 'string') {
      telemetry(root, typeof input.session_id === 'string' ? input.session_id : '', 'nudge', {
        matcher: 'SessionStart',
        agent: 'main',
        q: '',
      });
    }
    output(response);
  } catch (e) {
    warn('hook error: ' + (e && e.message));
    output({});
  }
}

main();
