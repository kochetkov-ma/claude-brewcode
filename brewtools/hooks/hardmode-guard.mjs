#!/usr/bin/env node
// brewtools:manager — HARD wall guard (PreToolUse, matcher "*").
//
// SELF-CONTAINED — copied into <project>/.claude/brewtools/manager/ by
// `/brewtools:manager on` and registered in .claude/settings.local.json
// (PreToolUse "*"). No external imports. Project-only state.
//
// When state.hard === true, physically DENIES tool calls in the MAIN session,
// leaving only delegation (Task/Agent/Skill), reading, and task tracking.
// Subagents stay fully free.
//
// LINCHPIN (verified live CC 2.1.177): this PreToolUse hook fires inside subagents
// too, but subagent tool-call stdin carries `agent_id`/`agent_type` keys; the MAIN
// session stdin does NOT. session_id is identical for both. => Discriminator: DENY
// only when `agent_id`/`agent_type` are ABSENT (main session). Present -> pass-through.
//
// Strictness levels:
//   strict   — deny all non-read tools (no bash, no web).
//   balanced — additionally allow read-only Bash (whitelist classifier), WebSearch,
//              and read-only MCP tools.
// Fail-open: ANY thrown error / unreadable state -> output({}) so a guard bug never
// bricks the session.
//
// PreToolUse stdin fields used: tool_name, tool_input.command, cwd, agent_id, agent_type.
//
// Re-verified 2026-06-27 on CC 2.1.195: agent_id/agent_type presence still
// discriminates main-session (absent) vs subagent (present); linchpin HOLDS.
// These keys are NOT-IN-DOC (HOOKS-REFERENCE.md lists only subagent_type/subagent_id);
// kept intentionally. The undocumented `effort` payload key (used by other brewtools
// hooks) is irrelevant here and intentionally NOT read by this guard. No logic change.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---- inlined stdin/stdout helpers (no plugin lib) ---------------------------

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// ---- project-only state read ------------------------------------------------
// Reads <cwd>/.claude/brewtools/manager/state.json. Global ~/.claude state is
// NEVER consulted: the wall is strictly project-scoped. Missing/unreadable/invalid
// file => hard:false (no-op).
function readProjectState(cwd) {
  try {
    const p = join(cwd, '.claude', 'brewtools', 'manager', 'state.json');
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { hard: false, level: 'balanced' };
    }
    const hard = parsed.hard === true;
    const level = parsed.level === 'strict' ? 'strict' : 'balanced';
    return { hard, level };
  } catch {
    return { hard: false, level: 'balanced' };
  }
}

// ---- guard tables -----------------------------------------------------------

// Tools always permitted in the main session under the hard wall.
const ALWAYS_ALLOW = new Set([
  'Read', 'Grep', 'Glob',
  'Task', 'Agent', 'Skill',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite',
  'AskUserQuestion'
]);

// Tools never permitted in the main session under the hard wall (any level).
const ALWAYS_BLOCK = new Set(['Write', 'Edit', 'NotebookEdit', 'WebFetch']);

// MCP tool names whose verb implies mutation.
const MCP_WRITE_VERB = /mcp__.*(write|create|update|delete|put|post|send|comment|merge|move|upload|publish|export|resize|duplicate)/i;
// MCP tool names whose verb implies read-only access.
const MCP_READ_VERB = /mcp__.*(search|get|list|read|fetch|query|trace|status|describe)/i;

const EXIT_HINT = 'Manager HARD wall is ON — delegate via Task/Agent, or run `/brewtools:manager off` to exit.';

function deny(reason) {
  output({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason} ${EXIT_HINT}`
    }
  });
}

// Self-exempt: ONLY the genuine `node ... manager-state.mjs ...` invocation used by
// `/brewtools:manager off`. Must be a node command with NO shell operators outside
// quoted segments (so `echo manager-state.mjs > evil`, `cat manager-state.mjs && rm f`,
// `rm f # manager-state.mjs` etc. can NOT smuggle a bypass).
function noShellOpsOutsideQuotes(s) {
  let inDQ = false, inSQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && !inSQ) { inDQ = !inDQ; continue; }
    if (c === "'" && !inDQ) { inSQ = !inSQ; continue; }
    if (!inDQ && !inSQ) {
      if (c === '>' || c === '|' || c === '&' || c === ';') return false;
      if (s.slice(i, i + 2) === '$(') return false;
      if (c === '`') return false;
    }
  }
  return true;
}
function isStateWriteCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd) return false;
  const s = cmd.trim();
  if (!/^node[\s]/.test(s)) return false;                 // must be a node invocation
  if (!noShellOpsOutsideQuotes(s)) return false;          // no operators outside quotes
  return /(^|[\s'"\/])manager-state\.mjs([\s'"]|$)/.test(s); // path-anchored token
}

// Read-only base commands allowed under `balanced`.
const READONLY_BASE = new Set([
  'ls', 'cat', 'pwd', 'which', 'head', 'tail', 'wc', 'grep', 'rg',
  'env', 'date', 'whoami', 'basename', 'dirname', 'realpath', 'test', '[',
  'jq', 'echo'
]);

// Tokens that, appearing ANYWHERE in a command, force a deny (mutation/eval risk).
const MUTATING_TOKENS = [
  '>', '>>', 'rm ', 'mv ', 'cp ', 'tee', 'sed -i', 'perl -i', 'truncate',
  'dd ', 'git commit', 'git push', 'git add', 'git reset', 'git checkout',
  'git restore', 'git rm', 'npm i', 'npm install', 'yarn add', 'pip install',
  'mkdir', 'touch', 'chmod', 'chown', 'ln ', 'python -c', 'python3 -c',
  'node -e', 'node --eval', '--eval'
];

// Classify a single shell segment as read-only-safe. Default-deny.
function isReadonlySegment(seg) {
  const s = seg.trim();
  if (!s) return true; // empty segment from a trailing operator — harmless
  // No command substitution.
  if (/\$\(/.test(s) || /`/.test(s)) return false;
  // Any redirection or mutating token anywhere -> deny.
  for (const t of MUTATING_TOKENS) {
    if (s.includes(t)) return false;
  }
  // `:` immediately before `>` (truncation idiom) — already covered by '>' token, but be explicit.
  if (/:\s*>/.test(s)) return false;

  const words = s.split(/\s+/);
  const base = words[0];

  // git: only read-only subcommands.
  if (base === 'git') {
    const sub = words[1] || '';
    const allowedGit = new Set(['status', 'log', 'diff', 'show', 'branch', 'rev-parse', 'describe', 'stash']);
    if (sub === 'remote') return words[2] === '-v';
    if (sub === 'tag') return words[2] === '-l';
    if (sub === 'stash') return words[2] === 'list';
    return allowedGit.has(sub);
  }
  // gh: only read-only verbs.
  if (base === 'gh') {
    return words.includes('list') || words.includes('view') || words.includes('status');
  }
  // node --check only (node -e/--eval already rejected above).
  if (base === 'node') {
    return words.includes('--check');
  }
  // find: reject mutating actions.
  if (base === 'find') {
    if (words.some(w => w === '-delete' || w === '-exec' || w === '-execdir' || w === '-fprint')) return false;
    return true;
  }
  // python/python3 without -c already passed token check (python -c rejected); deny anything else to be safe.
  if (base === 'python' || base === 'python3') return false;

  return READONLY_BASE.has(base);
}

// Classify a full Bash command (handles chaining) as read-only. Default-deny.
function isReadonlyCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return false;
  // Reject command substitution outright before splitting.
  if (/\$\(/.test(cmd) || /`/.test(cmd)) return false;
  // Split on chaining operators; classify each segment. Pipe counts as chaining too.
  const segments = cmd.split(/&&|\|\||;|\|/);
  for (const seg of segments) {
    if (!isReadonlySegment(seg)) return false;
  }
  return true;
}

(async () => {
  try {
    let input;
    try {
      input = await readStdin();
    } catch {
      // (i) Fail-open on unreadable/invalid stdin.
      output({});
      return;
    }
    const cwd = input.cwd || process.cwd();

    // (a) Hot path: hard wall off -> near-zero-overhead no-op.
    const state = readProjectState(cwd);
    if (state.hard !== true) { output({}); return; }

    // (b) LINCHPIN: subagent tool calls carry agent_id/agent_type -> pass through.
    if (Object.prototype.hasOwnProperty.call(input, 'agent_id') ||
        Object.prototype.hasOwnProperty.call(input, 'agent_type')) {
      output({});
      return;
    }

    const level = state.level === 'strict' ? 'strict' : 'balanced';
    const tool = input.tool_name || '';
    const toolInput = input.tool_input || {};

    // (c) Always-allow set (delegation, reading, tracking).
    if (ALWAYS_ALLOW.has(tool)) { output({}); return; }

    // (d) Self-exempt: Bash that writes Manager state (anchored by path). Survives strict.
    if (tool === 'Bash' && isStateWriteCommand(toolInput.command)) { output({}); return; }

    // (e) Always-block tools + mutating MCP verbs.
    if (ALWAYS_BLOCK.has(tool)) {
      deny(`Hard wall: ${tool} is blocked in the main session — delegate to a subagent.`);
      return;
    }
    if (MCP_WRITE_VERB.test(tool)) {
      deny(`Hard wall: mutating MCP tool ${tool} is blocked in the main session — delegate to a subagent.`);
      return;
    }

    // (f) Bash.
    if (tool === 'Bash') {
      if (level === 'strict') {
        deny('Hard wall (strict): Bash is blocked in the main session — delegate execution to a subagent.');
        return;
      }
      // balanced: allow only fully read-only commands.
      if (isReadonlyCommand(toolInput.command)) { output({}); return; }
      deny('Hard wall (balanced): only read-only Bash is allowed in the main session — delegate execution to a subagent.');
      return;
    }

    // (g) WebSearch + read-only MCP.
    if (tool === 'WebSearch') {
      if (level === 'balanced') { output({}); return; }
      deny('Hard wall (strict): WebSearch is blocked in the main session — delegate to a subagent.');
      return;
    }
    if (tool.startsWith('mcp__')) {
      if (level === 'balanced' && MCP_READ_VERB.test(tool)) { output({}); return; }
      deny(`Hard wall: MCP tool ${tool} is blocked in the main session — delegate to a subagent.`);
      return;
    }

    // (h) Default-deny everything else.
    deny(`Hard wall: ${tool || 'this tool'} is blocked in the main session — delegate to a subagent.`);
  } catch {
    // (i) Fail-open: never brick the session on a guard bug.
    output({});
  }
})();
