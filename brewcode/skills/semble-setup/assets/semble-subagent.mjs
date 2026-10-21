#!/usr/bin/env node
// brewcode-meta: version=6.11.0 content_version=6.5.1 generated_by=brewcode:semble-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// SubagentStart, NO matcher = every agent type (predecessor semble-explore.mjs, was pinned to "Explore").
// ADVISORY: one additionalContext line per spawn, no throttle; never spawns; one JSON object, exit 0; no imports.
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
    process.stderr.write('[semble-subagent] ' + message + '\n');
  } catch {
    /* stderr is best-effort */
  }
}
// --- telemetry (best-effort, never throws, never changes hook output) ------
const TELEMETRY_SRC = 'subagent';
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

/** {kind:'missing'|'corrupt'|'ok', state} — same reader as the other semble hooks. */
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
  } catch {
    return { kind: 'corrupt' };
  }
  if (!raw.trim()) return { kind: 'missing' };
  try {
    const state = JSON.parse(raw);
    if (state === null || typeof state !== 'object' || Array.isArray(state)) return { kind: 'corrupt' };
    return { kind: 'ok', state };
  } catch {
    return { kind: 'corrupt' };
  }
}

/** Usability gate; fires before `ready` too: semble builds its index inside the first call. */
function gate(read, root) {
  if (read.kind === 'missing') return { ok: false, why: 'no-state', phase: '', enabled: false };
  if (read.kind !== 'ok') return { ok: false, why: 'corrupt', phase: '', enabled: false };
  const state = read.state;
  const phase = typeof state.phase === 'string' ? state.phase : '';
  const enabled = state.enabled !== false;
  if (!enabled) return { ok: false, why: 'disabled', phase, enabled };
  if (phase === 'disabled') return { ok: false, why: 'disabled', phase, enabled };
  if (phase === 'error') return { ok: false, why: 'error', phase, enabled };
  if (phase === 'prereq_ready') return { ok: false, why: 'not-registered', phase, enabled };
  const mcp = mcpRegistration(root);
  if (!mcp) return { ok: false, why: 'no-mcp', phase, enabled };
  return { ok: true, why: 'ok', phase, enabled, mcp };
}

// --- agent definition: does this agent type get the semble tool? ----------
// Project, then profile agents dir; `plugin:name` via installed_plugins.json. Unknown -> ''.
function agentFile(agentType, root) {
  const cfgDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const i = agentType.indexOf(':');
  if (i < 0) {
    for (const d of [join(root, '.claude', 'agents'), join(cfgDir, 'agents')]) {
      if (existsSync(join(d, agentType + '.md'))) return join(d, agentType + '.md');
    }
    return '';
  }
  try {
    const j = JSON.parse(readFileSync(join(cfgDir, 'plugins', 'installed_plugins.json'), 'utf8'));
    const plugins = j && j.plugins && typeof j.plugins === 'object' ? j.plugins : {};
    const rel = join('agents', agentType.slice(i + 1).split(':').join('/') + '.md');
    for (const k of Object.keys(plugins)) {
      if (k.split('@')[0] !== agentType.slice(0, i) || !Array.isArray(plugins[k])) continue;
      for (const inst of plugins[k]) {
        const f = inst && typeof inst.installPath === 'string' ? join(inst.installPath, rel) : '';
        if (f && existsSync(f)) return f;
      }
    }
  } catch { /* no or unreadable plugin registry: unknown */ }
  return '';
}

/** Frontmatter list (`a, b`, `[a, b]` or a YAML `- a` block), or null when the key is absent. */
function fmList(fm, key) {
  const lines = fm.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith(key + ':'));
  if (at < 0) return null;
  let v = lines[at].slice(key.length + 1).trim();
  if (!v) {
    const items = [];
    for (let k = at + 1; k < lines.length && /^\s*-\s/.test(lines[k]); k++) items.push(lines[k].replace(/^\s*-\s*/, ''));
    v = items.join(',');
  }
  return v.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

const SEMBLE_TOOL_RE = /^mcp__semble_code(?:__(?:search|\*))?$/;

/** False only when the definition provably withholds the tool: `tools:` omits it or `disallowedTools` names it. */
function agentHasSemble(agentType, root) {
  const file = agentFile(agentType, root);
  if (!file) return true; // built-in or undiscoverable type: no evidence against
  try {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
    if (!m) return true;
    const deny = fmList(m[1], 'disallowedTools');
    if (deny && deny.some((t) => SEMBLE_TOOL_RE.test(t))) return false;
    const allow = fmList(m[1], 'tools');
    return !allow || allow.some((t) => SEMBLE_TOOL_RE.test(t));
  } catch {
    return true;
  }
}

// Self-sufficient: the subagent sees no parent context, so the line carries availability, call and routing.
// "No ToolSearch needed" holds only for `alwaysLoad: true`.
function message(cwd, loaded) {
  return (
    'semble: mcp__semble_code__search is ' +
    (loaded ? 'already available to you — no ToolSearch needed. ' : 'available to you (load it via ToolSearch if deferred). ') +
    'Start any "where/how/why does X work" question with ONE call: repo="' + cwd +
    '", top_k=5, max_snippet_lines=10, then open the hit at start_line. ' + ROUTE
  );
}

function decide(input, cwd) {
  const sid = typeof input.session_id === 'string' ? input.session_id : '';
  const agentType = typeof input.agent_type === 'string' ? input.agent_type : '';
  // agent_id is the join key: the spawned subagent's own transcript is named
  // after it, which is what makes "was this line actually delivered" auditable.
  const agentId = typeof input.agent_id === 'string' ? input.agent_id : '';
  // No agent type = malformed/empty stdin: say nothing, write nothing (`cwd` is a guess then).
  if (!agentType) return {};
  const g = gate(readState(cwd), cwd);
  const record = (fired, why) =>
    telemetry(cwd, sid, 'gate', {
      fired, why, phase: g.phase, enabled: g.enabled, agent_type: agentType, agent_id: agentId,
    });

  if (!g.ok) {
    record(false, g.why);
    return {};
  }
  if (!agentHasSemble(agentType, cwd)) {
    record(false, 'agent-no-tool');
    return {};
  }

  record(true, 'ok');
  telemetry(cwd, sid, 'nudge', {
    matcher: 'SubagentStart',
    agent: 'sub',
    agent_type: agentType,
    agent_id: agentId,
    q: '',
  });
  return {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: message(cwd, g.mcp.alwaysLoad === true),
    },
  };
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
      input = {}; // malformed/empty stdin: stay silent
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    root = projectRoot(typeof input.cwd === 'string' ? input.cwd : '');
    output(decide(input, root));
  } catch (e) {
    warn('hook error: ' + (e && e.message));
    output({});
  }
}

main();
