#!/usr/bin/env node
// brewcode-meta: version=6.11.0 content_version=6.5.1 generated_by=brewcode:semble-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// PostToolUse (`ok:true`) + PostToolUseFailure (`ok:false`, failures skip PostToolUse): PURE OBSERVER, semble
// calls vs searches -> .claude/semble/telemetry.jsonl only; always `{}`, exit 0; Node built-ins, no imports.
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
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

// --- telemetry (best-effort, never throws, never changes hook output) ------
const TELEMETRY_SRC = 'stats';
const TELEMETRY_MAX_BYTES = 2_000_000;
const TELEMETRY_KEEP_LINES = 1000;

// One JSONL record -> .claude/semble/telemetry.jsonl via a single appendFileSync; every failure swallowed.
// Same record shape as the session/subagent writers (SAME log): keep in sync.
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
    /* telemetry must never break a tool call */
  }
}
// ---------------------------------------------------------------------------

/** The numerator: the two semble MCP tools. */
const SEMBLE_TOOLS = ['mcp__semble_code__search', 'mcp__semble_code__find_related'];

/** The denominator: search-shaped tools that semble is meant to displace. */
const SEARCH_TOOLS = ['Bash', 'Grep', 'Glob'];

// `Read` -> `open` records (fed the retired prefetch conversion); never counted as a search.
const OPEN_TOOLS = ['Read'];
const PATHMAX = 200;

// "Search-shaped" denominator (keep in step with copies): a search binary at a command boundary
// (start, |, ;, &, &&, ||, subshell); `m` flag covers heredocs and multi-line scripts.
const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/m;

const QMAX = 120;

// `main` | `sub` on `agent_id` ALONE: documented subagent-only; `agent_type` is also set on the
// main thread of an `--agent` session.
function agentOf(input) {
  if (!input || typeof input !== 'object') return 'unknown';
  return typeof input.agent_id === 'string' && input.agent_id ? 'sub' : 'main';
}

/** Max stored length of the raw agent_id. Real ones are 36-char UUIDs. */
const AIDMAX = 64;

// Evidence for `agent:"sub"` (a `sub` record without `aid` predates the agentOf fix -> quarantine);
// also the join key to the SubagentStart hook's `agent_id`.
function aidOf(input) {
  const id = input && input.agent_id;
  return typeof id === 'string' && id ? { aid: id.slice(0, AIDMAX) } : {};
}

/** Non-negative integer milliseconds, or null when the payload had none. */
function msOf(input) {
  const d = input && input.duration_ms;
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) return null;
  return Math.round(d);
}

// Error flag inside a PostToolUse response (MCP `{content, isError}`)? Explicit booleans only;
// a plain `error` key is too common to trust.
function responseFailed(resp) {
  if (!resp || typeof resp !== 'object' || Array.isArray(resp)) return false;
  return resp.isError === true || resp.is_error === true;
}

/** The query text worth logging for a search-shaped tool, or null. */
function queryOf(toolName, toolInput) {
  const ti = toolInput && typeof toolInput === 'object' && !Array.isArray(toolInput) ? toolInput : {};
  if (toolName === 'Bash') {
    const cmd = typeof ti.command === 'string' ? ti.command : '';
    if (!cmd || !SEARCH_RE.test(cmd)) return null; // not search-shaped: do not log
    return cmd.slice(0, QMAX);
  }
  // Grep / Glob ARE search tools; the pattern is the whole query.
  const pat = typeof ti.pattern === 'string' ? ti.pattern : '';
  return pat.slice(0, QMAX);
}

// `{fail:true}` on PostToolUseFailure, else `{}` (success records unchanged); a failed Read never opened.
function failFlag(ev) {
  return ev === 'PostToolUseFailure' ? { fail: true } : {};
}

function record(input, cwd) {
  const ev = typeof input.hook_event_name === 'string' ? input.hook_event_name : '';
  if (ev !== 'PostToolUse' && ev !== 'PostToolUseFailure') return;

  const tool = typeof input.tool_name === 'string' ? input.tool_name : '';
  if (!tool) return;

  const sid = typeof input.session_id === 'string' ? input.session_id : '';
  const agent = agentOf(input);
  const aid = aidOf(input);
  const ms = msOf(input);

  if (SEMBLE_TOOLS.indexOf(tool) >= 0) {
    const ok = ev === 'PostToolUse' && !responseFailed(input.tool_response);
    telemetry(cwd, sid, 'call', { tool, ok, ...(ms === null ? {} : { ms }), agent, ...aid });
    return;
  }
  if (OPEN_TOOLS.indexOf(tool) >= 0) {
    const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
    const p = typeof ti.file_path === 'string' ? ti.file_path : '';
    if (!p) return;
    // Log absolute (Claude Code reads) + repo-relative (prefetch `file_path`): the reader has no cwd later.
    const rel = p.indexOf(cwd + '/') === 0 ? p.slice(cwd.length + 1) : p;
    telemetry(cwd, sid, 'open', {
      f: rel.slice(0, PATHMAX), abs: p.slice(0, PATHMAX), ...failFlag(ev), agent, ...aid,
    });
    return;
  }
  if (SEARCH_TOOLS.indexOf(tool) < 0) return;

  // A failed grep is still a search: `grep foo` with no match exits 1 and lands
  // on PostToolUseFailure. Dropping those would gut the denominator.
  const q = queryOf(tool, input.tool_input);
  if (q === null) return;
  telemetry(cwd, sid, 'search', { tool, q, ...failFlag(ev), agent, ...aid });
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
      input = {}; // malformed/empty stdin: record nothing, stay neutral
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    root = projectRoot(typeof input.cwd === 'string' ? input.cwd : '');
    record(input, root);
  } catch {
    /* an observer that throws is worse than an observer that misses a sample */
  }
  output({});
}

main();
