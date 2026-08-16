#!/usr/bin/env node
// brewcode-meta: version=6.1.4 content_version=6.0.0 generated_by=brewcode:semble-setup
/**
 * brewcode:semble-setup — SessionStart hook (self-contained, installed into a project).
 *
 * Reports the project's semble state and, when the integration is ready, injects
 * one short usage directive. It reads exactly ONE file (.claude/semble/state.json),
 * never spawns a process, never probes for a daemon (semble has none), never
 * blocks, always prints exactly one JSON object and always exits 0.
 *
 * Pure ESM, Node built-ins only. readStdin/output are inlined on purpose: this
 * file travels alone into a user's .claude/hooks/ and must have no imports.
 */
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

const CORRUPT = { systemMessage: 'semble: state file is corrupt — run /brewcode:semble-setup status' };

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
  if (phase === 'awaiting_reload') {
    // The index is built lazily INSIDE a tool call, so telling the model to wait
    // for `resume` is what kept verification from ever happening. Use it, and
    // close the state out afterwards.
    return {
      systemMessage: 'semble: awaiting reload — run /brewcode:semble-setup resume',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          'semble_code MCP is registered but not verified yet. It is usable now — ' +
          'mcp__semble_code__search (repo=' + cwd + ', top_k=5, max_snippet_lines=10); ' +
          'the first call rebuilds the index and may take minutes. ' +
          'Run /brewcode:semble-setup resume to close the state out.',
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
          ', top_k=5, max_snippet_lines=10), then open the hit at start_line. ' +
          'rg stays for exact/exhaustive matching.',
      },
    };
  }
  if (phase) return { systemMessage: 'semble: ' + phase };
  return {};
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
