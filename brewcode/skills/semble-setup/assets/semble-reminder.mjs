#!/usr/bin/env node
/**
 * brewcode:semble-setup — PreToolUse hook (self-contained, installed into a project).
 * Registered once: PreToolUse, matcher "Bash|Grep".
 *
 * ADVISORY ONLY. It emits at most one `additionalContext` line and never a
 * permission decision, a deny, or a rewritten tool input — it cannot block,
 * alter or slow a search. Always prints exactly one JSON object, always exits 0.
 *
 * Two things changed after the v5.0.0 removal, and they are the whole point:
 *
 *  1. CADENCE. The old 10-minute throttle fired 14 times in 2718 evaluations
 *     (0.52%). It is replaced by an every-Nth counter over ELIGIBLE searches:
 *     count in .claude/semble/reminder.json, inject when count % N === 0,
 *     N = state.reminderEvery (default 5). Ineligible calls never advance it.
 *  2. GATE. `isExactIntent()` used to be "biased to silence: any doubt returns
 *     true", and regex metacharacters alone suppressed most real intent
 *     searches. Only genuine enumeration / literal-lookup shapes survive:
 *     -l / -c / -o (and their long forms), a pattern holding '/', a
 *     filename-shaped pattern, and find/bfs filename predicates.
 *
 * Never spawns a process, never probes for a daemon (semble has none).
 *
 * Pure ESM, Node built-ins only. readStdin/output are inlined on purpose: this
 * file travels alone into a user's .claude/hooks/ and must have no imports.
 */
import { appendFileSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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

/** Injection cadence: one nudge per N eligible searches. Overridable per project. */
const DEFAULT_EVERY = 5;
const COUNTER_NAME = 'reminder.json';

// A search binary at a command boundary (start, |, ;, &, &&, ||, subshell).
// The `m` flag is load-bearing: heredocs and multi-line scripts are ~5% of all
// search-shaped Bash commands, and without it `^` only ever matched offset 0.
const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/m;
// Enumeration / verification flags: the caller wants a file list or a count,
// which semble cannot produce. -F/-w (literal/word) were dropped: "find every
// use of this word" is exactly the intent question semble answers best.
const FLAG_RE = /(^|\s)-{1,2}(l|files-with-matches|L|files-without-match|c|count|o|only-matching)(=|\s|$)/;
// find/bfs filename predicate — a filename lookup, not a behaviour question.
const FIND_FLAG_RE = /(^|\s)-(name|path|iname|type)(=|\s|$)/;
// Looks like a filename.
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

/**
 * True when the call is a genuine enumeration or literal lookup — the only
 * shapes where semble has nothing to add. Everything else is now allowed
 * through; the every-Nth counter, not the gate, is what limits volume.
 */
function isExactIntent(command, pattern, bin) {
  if (typeof pattern !== 'string') return true;      // no argument to judge
  if (FLAG_RE.test(command)) return true;            // -l / -c / -o enumeration
  if ((bin === 'find' || bin === 'bfs') && FIND_FLAG_RE.test(command)) return true;
  if (pattern.indexOf('/') >= 0) return true;        // a path, not a concept
  if (FILEISH_RE.test(pattern)) return true;         // a filename, not a concept
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

/** state.reminderEvery when it is a positive integer, else the default. */
function everyOf(state) {
  const n = state && state.reminderEvery;
  if (Number.isInteger(n) && n >= 1) return n;
  return DEFAULT_EVERY;
}

/**
 * Advances the eligible-search counter and returns its new value. A corrupt,
 * absent or otherwise unreadable counter resets to 0, so the next eligible
 * call is number 1 — the hook degrades to "silent for N-1 calls", never to a
 * crash. The write is tmp+rename so a reader never sees a half-written file.
 */
function bumpCounter(cwd) {
  const file = join(cwd, '.claude', 'semble', COUNTER_NAME);
  let count = 0;
  try {
    const obj = JSON.parse(readFileSync(file, 'utf8'));
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)
      && Number.isInteger(obj.count) && obj.count >= 0) count = obj.count;
  } catch {
    count = 0; // absent or corrupt — start over
  }
  const next = count + 1;
  try {
    const tmp = file + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify({ count: next }) + '\n');
    renameSync(tmp, file);
  } catch (e) {
    warn('counter write failed: ' + e.message); // cadence degrades, nothing else
  }
  return next;
}

/**
 * Is semble USABLE in this repo — not "has verification finished".
 *
 * A `phase === 'ready'` gate deadlocks: semble builds its index lazily inside a
 * tool call, so without a nudge nothing calls the MCP, nothing verifies, and
 * the phase never advances. Phase only suppresses the three states where there
 * is provably nothing to nudge toward.
 *
 * `completed` containing "mcp" is the registration proxy: semble-mcp.sh writes
 * it in the same checkpoint patch that registers the server. Reading
 * ~/.claude.json on every Bash call to check for real would cost megabytes of
 * parse per search. `prereq_ready` is denied because the add-failed rollback
 * lands there with `completed` still holding "mcp".
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
  return { ok: true, why: 'ok', phase, enabled, state };
}

/**
 * One directive line. It names the exact call and the exact params, and says in
 * one clause when grep is still right. No "this is only a reminder" clause —
 * the old text undercut itself and was ignored 11 times out of 11.
 */
function message(cwd, phase) {
  const cold =
    phase === 'ready'
      ? ''
      : ' Index not verified yet (phase=' + phase + '); the first call builds it.';
  return (
    'semble: call mcp__semble_code__search FIRST for this — repo="' + cwd +
    '", top_k=5, max_snippet_lines=10 — then open the hit at start_line. ' +
    'Keep grep for exact identifiers, literal strings and exhaustive -l/-c enumeration.' +
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
  // Claude Code writes a `hook_additional_context` transcript attachment under
  // this same id whenever injected text truly reaches the model, so recording
  // it is what makes "delivered and ignored" distinguishable from "never
  // delivered" after the fact.
  const tuid = typeof input.tool_use_id === 'string' ? input.tool_use_id : '';
  const g = gate(readState(cwd));
  const record = (fired, why, extra) =>
    telemetry(cwd, sid, 'gate', { fired, why, phase: g.phase, enabled: g.enabled, tool_use_id: tuid, ...(extra || {}) });
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

  // Eligible. Only eligible calls advance the counter, so N really means
  // "one nudge per N searches semble could have answered".
  const every = everyOf(g.state);
  const n = bumpCounter(cwd);
  if (n % every !== 0) {
    record(false, 'cadence', { n, every });
    return {};
  }

  record(true, 'ok', { n, every });
  telemetry(cwd, sid, 'nudge', {
    matcher: toolName,
    agent: agentOf(input),
    tool_use_id: tuid,
    n,
    every,
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
