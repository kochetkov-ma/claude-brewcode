#!/usr/bin/env node
/**
 * brewcode:semble-setup — SubagentStart hook (self-contained, installed into a project).
 * Registered with matcher "Explore" only.
 *
 * The built-in Explore subagent type has semble's MCP tools available but not
 * pre-listed in its own tool set, so it has to ToolSearch its way to
 * mcp__semble_code__search before it can call it. This hook's additionalContext
 * lands in the SPAWNED subagent's own transcript (not the parent's — verified
 * against SubagentStart semantics), so it can call semble directly first.
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
    process.stderr.write('[semble-explore] ' + message + '\n');
  } catch {
    /* stderr is best-effort */
  }
}
// --- telemetry (best-effort, never throws, never changes hook output) ------
const TELEMETRY_SRC = 'explore';
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

function message(cwd) {
  return (
    'semble: call mcp__semble_code__search directly first (repo="' + cwd +
    '", top_k=5) for intent/behavior questions — it is already available, no ' +
    'ToolSearch needed. rg/Grep stay for exact/exhaustive matches.'
  );
}

function decide(input, cwd) {
  const agentType = typeof input.agent_type === 'string' ? input.agent_type : '';
  if (agentType !== 'Explore') return {};

  const read = readState(cwd);
  if (read.kind !== 'ok') return {};
  const state = read.state;
  if (state.enabled === false) return {};
  if (state.phase !== 'ready') return {};

  return {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: message(cwd),
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
