#!/usr/bin/env node
/**
 * brewcode:semble-setup — PreToolUse hook (self-contained, installed into a project).
 * Registered twice: matcher "Bash" and matcher "Grep".
 *
 * ADVISORY ONLY. It emits at most one `additionalContext` line and NEVER a
 * permissionDecision, a deny, or an updatedInput — it cannot block, alter or
 * slow a search. Exact / exhaustive rg / grep / find stay untouched by design:
 * `isExactIntent()` is biased to silence and any doubt returns true.
 *
 * Never spawns a process, never probes for a daemon (semble has none), always
 * prints exactly one JSON object, always exits 0.
 *
 * Pure ESM, Node built-ins only. readStdin/output are inlined on purpose: this
 * file travels alone into a user's .claude/hooks/ and must have no imports.
 */
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
    process.stderr.write('[semble-reminder] ' + message + '\n');
  } catch {
    /* stderr is best-effort */
  }
}
// --- telemetry (best-effort, never throws, never changes hook output) ------
const TELEMETRY_SRC = 'reminder';
const TELEMETRY_MAX_BYTES = 2_000_000;
const TELEMETRY_KEEP_LINES = 1000;

/**
 * Appends one JSONL record to .claude/semble/telemetry.jsonl. Single
 * appendFileSync, never read-modify-write. Every failure is swallowed: a hook
 * that cannot measure itself must still behave exactly as if it had.
 */
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

const THROTTLE_MS = 600_000;

// A search binary at a command boundary (start, |, ;, &, &&, ||, subshell).
// The `m` flag is load-bearing: heredocs and multi-line scripts are ~5% of all
// search-shaped Bash commands, and without it `^` only ever matched offset 0.
const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/m;
// (a) literal / enumeration / verification flags.
const FLAG_RE = /(^|\s)-{1,2}(F|fixed-strings|w|word-regexp|l|files-with-matches|L|files-without-match|c|count|o|only-matching)(=|\s|$)/;
// (e) piped into an enumeration tool.
const PIPE_RE = /\|\s*(?:command\s+)?(wc|sort|uniq|head|tail|cut|awk)\b/;
// (d) find/bfs filename search.
const FIND_FLAG_RE = /(^|\s)-(name|path|iname|type)(=|\s|$)/;
// (b) regex metacharacters: \ ^ $ * + ? ( ) [ ] { } |
const META = '\\^$*+?()[]{}|';
// (c) looks like a filename.
const FILEISH_RE = /\.[A-Za-z0-9]{1,6}$/;

/**
 * Splits the text following a search binary into shell-ish tokens, stopping at
 * the first unquoted pipeline boundary — only the FIRST search command of a
 * pipeline is ever examined.
 */
function tokenize(text) {
  const tokens = [];
  let raw = '';
  let value = '';
  let quote = '';
  const push = () => {
    if (raw.length) tokens.push({ raw, value });
    raw = '';
    value = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      raw += ch;
      if (ch === quote) quote = '';
      else value += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      raw += ch;
      continue;
    }
    if (ch === '|' || ch === ';' || ch === '&' || ch === '\n' || ch === ')') break;
    if (ch === ' ' || ch === '\t') {
      push();
      continue;
    }
    raw += ch;
    value += ch;
  }
  push();
  return tokens;
}

/** First non-flag argument after the search binary; one quote layer stripped. */
function extract(command) {
  const m = SEARCH_RE.exec(command);
  if (!m) return null;
  const bin = m[1];
  const tokens = tokenize(command.slice(m.index + m[0].length));
  for (const t of tokens) {
    if (t.raw.startsWith('-')) continue;
    return { bin, pattern: t.value };
  }
  return { bin, pattern: null };
}

/** Bias to silence: any doubt returns true. Rules (a)-(g) of the design. */
function isExactIntent(command, pattern, bin) {
  if (typeof pattern !== 'string') return true; // (g) extraction failed
  if (FLAG_RE.test(command)) return true; // (a)
  if (PIPE_RE.test(command)) return true; // (e)
  if ((bin === 'find' || bin === 'bfs') && FIND_FLAG_RE.test(command)) return true; // (d)
  for (const ch of pattern) if (META.indexOf(ch) >= 0) return true; // (b)
  if (pattern.indexOf('/') >= 0) return true; // (c)
  if (FILEISH_RE.test(pattern)) return true; // (c)
  if (pattern.trim().length < 3) return true; // (f)
  return false;
}

/** {kind:'missing'|'corrupt'|'ok', state} — same reader as the session hook. */
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

function throttled(cwd) {
  const marker = join(cwd, '.claude', 'semble', '.reminder-ts');
  try {
    const age = Date.now() - statSync(marker).mtimeMs;
    return age >= 0 && age < THROTTLE_MS;
  } catch {
    return false; // no marker yet
  }
}

function touch(cwd) {
  try {
    writeFileSync(join(cwd, '.claude', 'semble', '.reminder-ts'), '');
  } catch (e) {
    warn('throttle write failed: ' + e.message); // ignored on purpose
  }
}

/**
 * Is semble USABLE in this repo — not "has verification finished".
 *
 * The old gate was `phase === 'ready'`, which deadlocked: semble builds its
 * index lazily inside a tool call, so without a nudge nothing ever calls the
 * MCP, nothing verifies, and the phase never advances. Phase now only shapes
 * the wording; it suppresses the nudge for the three phases where there is
 * provably nothing to nudge toward.
 *
 * `completed` containing "mcp" is the registration proxy: semble-mcp.sh writes
 * it in the same checkpoint patch that registers the server, so it is present
 * from registration onward. Reading ~/.claude.json on every Bash call to check
 * for real would cost megabytes of parse per search. It can go stale only if
 * the user removes the server by hand without running `uninstall` (which would
 * delete these hooks too) — the cost of that is one advisory line naming a tool
 * that is not there, and `/brewcode:semble-setup status` reports the drift.
 * `prereq_ready` is denied for the same reason: the add-failed rollback lands
 * there with `completed` still holding "mcp".
 */
function gate(read) {
  if (read.kind === 'missing') return { ok: false, why: 'no-state', phase: '', enabled: false };
  if (read.kind !== 'ok') return { ok: false, why: 'corrupt', phase: '', enabled: false };
  const state = read.state;
  const phase = typeof state.phase === 'string' ? state.phase : '';
  const enabled = state.enabled !== false;
  if (!enabled) return { ok: false, why: 'disabled', phase, enabled };
  if (phase === 'disabled') return { ok: false, why: 'disabled', phase, enabled };
  if (phase === 'error') return { ok: false, why: 'error', phase, enabled };
  if (phase === 'prereq_ready') return { ok: false, why: 'not-registered', phase, enabled };
  const completed = Array.isArray(state.completed) ? state.completed : [];
  if (completed.indexOf('mcp') < 0) return { ok: false, why: 'no-mcp', phase, enabled };
  return { ok: true, why: 'ok', phase, enabled };
}

function message(cwd, phase) {
  const cold =
    phase === 'ready'
      ? ''
      : ' Verification has not finished (phase=' +
        phase +
        ') — the first call rebuilds the index and may take minutes.';
  return (
    'semble: for intent/behavior questions try ONE mcp__semble_code__search first — repo="' +
    cwd +
    '", top_k=5, max_snippet_lines=10 — then open the hit at start_line. ' +
    'This grep is fine for exact/exhaustive matching; this is a reminder, not a block.' +
    cold
  );
}

/** PreToolUse stdin carries agent_id/agent_type inside a subagent only. */
function agentOf(input) {
  const sub =
    Object.prototype.hasOwnProperty.call(input, 'agent_id') ||
    Object.prototype.hasOwnProperty.call(input, 'agent_type');
  return sub ? 'sub' : 'main';
}

function decide(input, cwd) {
  const toolName = typeof input.tool_name === 'string' ? input.tool_name : '';
  if (toolName !== 'Bash' && toolName !== 'Grep') return {};

  const sid = typeof input.session_id === 'string' ? input.session_id : '';
  const g = gate(readState(cwd));
  const record = (fired, why) =>
    telemetry(cwd, sid, 'gate', { fired, why, phase: g.phase, enabled: g.enabled });
  if (!g.ok) {
    record(false, g.why);
    return {};
  }

  const toolInput = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};

  let command;
  let bin;
  let pattern;
  if (toolName === 'Bash') {
    command = typeof toolInput.command === 'string' ? toolInput.command : '';
    if (!command) {
      record(false, 'no-match');
      return {};
    }
    const found = extract(command);
    if (!found) {
      record(false, 'no-match'); // no search binary at a command boundary
      return {};
    }
    bin = found.bin;
    pattern = found.pattern;
  } else {
    // Native Grep tool: the pattern IS the whole "command" for heuristic purposes.
    pattern = typeof toolInput.pattern === 'string' ? toolInput.pattern : null;
    command = pattern || '';
    bin = 'rg';
    const mode = toolInput.output_mode;
    if (mode === 'files_with_matches' || mode === 'count') {
      record(false, 'no-match'); // enumeration
      return {};
    }
  }

  if (command.toLowerCase().indexOf('semble') >= 0 || isExactIntent(command, pattern, bin)) {
    record(false, 'no-match');
    return {};
  }
  if (throttled(cwd)) {
    record(false, 'throttled');
    return {};
  }

  touch(cwd);
  record(true, 'ok');
  telemetry(cwd, sid, 'nudge', {
    matcher: toolName,
    agent: agentOf(input),
    q: command.slice(0, 120),
  });
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: message(cwd, g.phase),
    },
  };
}

async function main() {
  let cwd = process.cwd();
  try {
    let input = {};
    try {
      input = await readStdin();
    } catch {
      input = {}; // malformed/empty stdin: stay silent
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
    if (typeof input.cwd === 'string' && input.cwd) cwd = input.cwd;
    output(decide(input, cwd));
  } catch (e) {
    warn('hook error: ' + (e && e.message));
    output({});
  }
}

main();
