#!/usr/bin/env node
// brewcode-meta: version=6.4.0 content_version=6.4.0 generated_by=brewcode:semble-setup
/**
 * brewcode:semble-setup — PreToolUse hook (self-contained, installed into a project).
 * Registered once: PreToolUse, matcher "Bash|Grep".
 *
 * ADVISORY ONLY. It emits at most one `additionalContext` line and never a
 * permission decision, a deny, or a rewritten tool input — it cannot block,
 * alter or slow a search. Always prints exactly one JSON object, always exits 0.
 *
 * Two things carry the behaviour, and they are the whole point:
 *
 *  1. CADENCE. Every ELIGIBLE search is nudged. A counter in
 *     .claude/semble/reminder.json injects when count % N === 0, and
 *     N = state.reminderEvery defaults to 1, so the throttle is inert until a
 *     user asks for one. The A/B that motivated this measured 1 semble call per
 *     session followed by 4-5 un-nudged Bash searches: at N=5 four of every five
 *     genuine hits went silent and a new session inherited a random phase.
 *     Frequency is the lever; the gate, not the counter, is what limits volume.
 *     The counter stays PROJECT-GLOBAL: at N=1 it cannot suppress anything, and
 *     for a user who sets N>1 a per-session counter would be strictly worse -
 *     every session would burn its first N-1 eligible searches in silence.
 *  2. GATE. Frequency without precision is spam, so `isExactIntent()` suppresses
 *     every shape semble cannot answer: find/bfs, a binary reading a pipe
 *     (`strings x | grep`), enumeration or literal flags, an aggregator pipe, a
 *     single-word pattern (an identifier lookup, where grep is right), a pattern
 *     under 8 characters, regex metacharacters, a path or filename-shaped token,
 *     markup punctuation (`:` `=` backtick), an ALL-CAPS banner, a pattern made
 *     ENTIRELY of identifiers, and the enumeration words. What survives is a
 *     multi-word plain-language description of behaviour, or an alternation of
 *     >= 3 plain words (`'secret|credential|token'`) - the one thing semble
 *     is better at. Flags and pipes are read from the search command's own
 *     segment, never from the rest of a compound line. Identifier shapes (snake_case, camelCase, intra-word hyphen)
 *     are deliberately NOT blanket suppressors: "rateLimit config" is a real
 *     question, and killing it silenced the hook on every TS/Java/Python repo.
 *
 * Never spawns a process, never probes for a daemon (semble has none).
 *
 * Pure ESM, Node built-ins only. readStdin/output are inlined on purpose: this
 * file travels alone into a user's .claude/hooks/ and must have no imports.
 */
import { appendFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
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

// --- MCP presence + search routing (identical in every steering semble hook) ---
// No hook input reports MCP registration: read <CLAUDE_CONFIG_DIR or home>/.claude.json
// (user + local scope), then <root>/.mcp.json (project scope). Never throws.
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

/** Injection cadence: one nudge per N eligible searches. Overridable per project. */
const DEFAULT_EVERY = 1;
const COUNTER_NAME = 'reminder.json';
/** A description of behaviour is never this short; below it, it is a fragment. */
const MIN_CHARS = 8;

// A search binary at a command boundary (start, |, ;, &, &&, ||, subshell).
// The `m` flag is load-bearing: heredocs and multi-line scripts are ~5% of all
// search-shaped Bash commands, and without it `^` only ever matched offset 0.
const SEARCH_RE = /(?:^|[|;&(]|&&|\|\|)\s*(?:command\s+)?(grep|egrep|fgrep|ugrep|rg|ag|ack|find|bfs)\b/m;
// Enumeration or literal-match flags: the caller wants a file list, a count or a
// verbatim string. semble answers none of the three — a top-k result set is a
// ranked sample, never a complete list, so nudging here is wrong advice.
// Tested on the search command's own arguments only; a short cluster (`-il`) counts too.
const FLAG_RE = /(?:^|\s)(?:-[A-Za-z0-9]*[FwlLco][A-Za-z0-9]*|--(?:fixed-strings|word-regexp|files-with-matches|files-without-match|count|count-matches|only-matching|files))(?:=|\s|$)/;
// Piped into an aggregator: counting or de-duplicating, i.e. enumeration again.
// head/tail and `cut -c` (line truncation) only cap display; tested on the search's own pipeline.
const PIPE_RE = /\|\s*(?:command\s+)?(?:wc|sort|uniq|awk)\b|\|\s*(?:command\s+)?cut\s+(?!-c)/;
// semble itself run as a command word; a path such as `.claude/semble/` is not a semble call.
const SEMBLE_CMD_RE = /(?:^|[\s|;&(])semble(?=\s|$)/m;
// `'secret|credential|token'`: >= 3 alternated plain words is a vocabulary guess for one concept.
const ALT_WORD_RE = /^[a-z]{3,}(?: [a-z]{3,})*$/;
// Looks like a filename. Applied per token, so `generate.sh emit` is caught too.
const FILEISH_RE = /\.[A-Za-z0-9]{1,6}$/;
// Regex metacharacters: the pattern is a machine expression, not a description.
const META = '\\^$*+?()[]{}|';
// Markup or assignment punctuation: `brewcode-meta: version=` is multi-word yet
// plainly a verbatim lookup. A natural-language question never contains these.
const STRONG_LITERAL_RE = /[#:=<>`~@%]/;
// Identifier SHAPES — snake_case, an intra-word hyphen, camelCase. These are
// NOT blanket suppressors: on a TypeScript, Java or Python codebase a genuine
// behaviour question routinely names one identifier ("rateLimit config",
// "max_retries setting"), and blanket-suppressing them made the hook silent on
// exactly the corpora it exists for. They only suppress when NOTHING in the
// pattern is a plain word, i.e. the whole pattern is identifiers.
const SOFT_LITERAL_RE = /_|[A-Za-z]-[A-Za-z]|\b[a-z]+[A-Z]/;
// A plain lowercase word — the thing that makes a pattern a phrase, not a symbol.
const PLAIN_WORD_RE = /^[a-z]{3,}$/;
// A pattern that is ALL caps end to end (`SKILL METADATA`) is a banner string.
// A single caps token is NOT enough: "how JWT tokens refresh" is a real question.
const SHOUT_RE = /^[^a-z]*$/;
// "every X" / "all X" / "how many" / "list the" is an rg -l/-c question by
// definition; semble cannot answer it even in principle.
const ENUM_WORD_RE = /\b(every|all|how many|list the)\b/i;

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

/**
 * First non-flag argument after the search binary; one quote layer stripped.
 * `piped` is true when the binary READS a pipe (`strings x | grep y`) — it is
 * filtering another command's output, which semble cannot see. `a || grep y` is
 * an OR-chain, not a pipe, and the doubled bar is what distinguishes them.
 */
function extract(command) {
  const m = SEARCH_RE.exec(command);
  if (!m) return null;
  const bin = m[1];
  const piped = m[0].indexOf('||') < 0 && m[0].indexOf('|') >= 0;
  const rest = command.slice(m.index + m[0].length);
  const tokens = tokenize(rest);
  // `seg`: this command's own args; `tail`: its own pipeline, up to the next ; && || or newline.
  const seg = tokens.map((t) => t.raw).join(' ');
  const tail = rest.split(/;|&&|\|\||\n/)[0];
  for (const t of tokens) {
    if (t.raw.startsWith('-')) continue;
    return { bin, pattern: t.value, piped, seg, tail };
  }
  return { bin, pattern: null, piped, seg, tail };
}

/** `'a|b|c'` of >= 3 plain lowercase words -> `'a b c'`, else null. */
function keywordAlternation(p) {
  const parts = p.split('|');
  return parts.length >= 3 && parts.every((x) => ALT_WORD_RE.test(x)) ? parts.join(' ') : null;
}

/**
 * The clause that marks the call as an enumeration, a literal lookup or an
 * identifier lookup — every shape where semble has nothing to add — or '' when
 * none does. What is left is a multi-word plain-language description of
 * behaviour (or a keyword alternation), and that is the only thing the nudge
 * fires on: at the default cadence of 1 the gate is the sole volume control.
 */
function exactClause(found) {
  const { bin, pattern, piped } = found;
  if (typeof pattern !== 'string') return 'no-pattern-arg';
  if (bin === 'find' || bin === 'bfs') return 'find';
  if (piped) return 'reads-a-pipe';                  // filtering a stream, not the repo
  if (FLAG_RE.test(found.seg || '')) return 'enum-or-literal-flag';
  if (PIPE_RE.test(found.tail || '')) return 'aggregator-pipe';
  let p = pattern.trim();
  p = keywordAlternation(p) || p;
  if (p.indexOf(' ') < 0 && p.indexOf('\t') < 0) return 'single-word';  // an identifier
  if (p.length < MIN_CHARS) return 'too-short';
  for (const ch of p) if (META.indexOf(ch) >= 0) return 'regex-metachar';
  if (p.indexOf('/') >= 0) return 'path';
  const tokens = p.split(/\s+/);
  for (const t of tokens) if (FILEISH_RE.test(t)) return 'filename-token';
  if (STRONG_LITERAL_RE.test(p)) return 'markup-punctuation';
  // Identifier shapes suppress only when the pattern is ALL identifiers.
  if (SOFT_LITERAL_RE.test(p) && !tokens.some((t) => PLAIN_WORD_RE.test(t))) return 'all-identifiers';
  if (SHOUT_RE.test(p)) return 'all-caps';
  if (ENUM_WORD_RE.test(p)) return 'enum-word';
  return '';
}

/** Boolean form of `exactClause`, kept for analysis scripts that import it. */
function isExactIntent(command, pattern, bin, piped) {
  const found = extract(command) || {};
  return exactClause({ ...found, bin, pattern, piped }) !== '';
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
 * `no-mcp`: the server is not registered for the ACTIVE profile (`mcpRegistration`).
 * State is per project, registration per config dir, so `state.completed` cannot answer it.
 */
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
  return { ok: true, why: 'ok', phase, enabled, state, mcp };
}

/**
 * A routing fact plus the call to make, not a verdict: the gate is a heuristic.
 * PreToolUse context is NOT deduplicated, so every injection is paid in full.
 */
function message(cwd, phase) {
  const cold = phase === 'ready' ? '' : ' (first call builds the index)';
  return 'semble: this search reads as intent/behaviour; mcp__semble_code__search repo="' + cwd + '" answers that' + cold + '. ' + ROUTE;
}

/**
 * `main` | `sub`, decided on `agent_id` ALONE. CC 2.1.226 documents the two
 * fields verbatim:
 *   agent_id   - "Present only when the hook fires from within a subagent.
 *                 Absent for the main thread, even in --agent sessions. Use
 *                 this field (not agent_type) to distinguish subagent calls
 *                 from main-thread calls."
 *   agent_type - "Present when the hook fires from within a subagent
 *                 (alongside agent_id), OR on the main thread of a session
 *                 started with --agent (without agent_id)."
 * Testing `agent_type` therefore labelled every main-thread call in an
 * `--agent` session as `sub`. Undefined values are dropped by the JSON
 * serialisation, so a plain key test on the parsed input is exact.
 */
function agentOf(input) {
  return typeof input.agent_id === 'string' && input.agent_id ? 'sub' : 'main';
}

/** Max stored length of the raw agent_id. Real ones are 36-char UUIDs. */
const AIDMAX = 64;

/**
 * The evidence behind `agent:"sub"`, stored so the label is checkable rather
 * than trusted. A `sub` record WITHOUT `aid` can only have been written by the
 * pre-fix `agentOf`, which is what lets a reader quarantine mislabelled history
 * instead of silently averaging over it. It is also the join key to the
 * `agent_id` the SubagentStart hook already logs.
 */
function aidOf(input) {
  const id = input && input.agent_id;
  return typeof id === 'string' && id ? { aid: id.slice(0, AIDMAX) } : {};
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
  const g = gate(readState(cwd), cwd);
  const record = (fired, why, extra) =>
    telemetry(cwd, sid, 'gate', { fired, why, phase: g.phase, enabled: g.enabled, tool_use_id: tuid, ...(extra || {}) });
  if (!g.ok) {
    record(false, g.why);
    return {};
  }

  const toolInput = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  // `clause` names the rule behind every `no-match`, so a skip sample is attributable.
  const noMatch = (clause) => {
    record(false, 'no-match', { clause });
    return {};
  };

  let command;
  let found;
  if (toolName === 'Bash') {
    command = typeof toolInput.command === 'string' ? toolInput.command : '';
    if (!command) return noMatch('no-command');
    if (SEMBLE_CMD_RE.test(command)) return noMatch('semble-cmd');
    found = extract(command);
    if (!found) return noMatch('no-search-binary');
  } else {
    // Native Grep tool: the pattern is the whole query; it has no shell flags or pipes.
    const pattern = typeof toolInput.pattern === 'string' ? toolInput.pattern : null;
    command = pattern || '';
    const mode = toolInput.output_mode;
    if (mode === 'files_with_matches' || mode === 'count') return noMatch('enum-output-mode');
    found = { bin: 'rg', pattern, piped: false, seg: '', tail: '' };
  }

  const clause = exactClause(found);
  if (clause) return noMatch(clause);

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
    ...aidOf(input),
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

// --- project root (canonical recipe, D1 Q5) --------------------------------
// CLAUDE_PROJECT_DIR -> this file's own installed location -> upward walk for a
// root marker -> hook cwd. Never throws, never exits nonzero.
// `input.cwd` is the cwd at invocation time and drifts mid-session
// (docs/hooks.md:717, CwdChanged), so it must key nothing but relative paths out
// of tool_input: from a nested package it pointed every state lookup at a
// directory with no .claude/semble, and all three gated hooks fell silent.
// SELF_ROOT is exact rather than a guess — the installer wires this file at
// <root>/.claude/hooks/<name>.mjs by absolute path, so its own location encodes
// the root even when a nested package carries its own .claude.
const SELF_ROOT = (() => {
  const d = dirname(fileURLToPath(import.meta.url));
  return basename(d) === 'hooks' && basename(dirname(d)) === '.claude' ? dirname(dirname(d)) : '';
})();

function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);
  if (SELF_ROOT) return SELF_ROOT;

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.claude'))) return dir;
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
