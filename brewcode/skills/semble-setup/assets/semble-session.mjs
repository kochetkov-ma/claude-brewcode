#!/usr/bin/env node
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
import { readFileSync, statSync } from 'node:fs';
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
    process.stderr.write('[semble-session] ' + message + '\n');
  } catch {
    /* stderr is best-effort */
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
    return {
      systemMessage: 'semble: awaiting reload — run /brewcode:semble-setup resume',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          'semble_code MCP was just registered; verification is pending. ' +
          'Run /brewcode:semble-setup resume before relying on semantic search.',
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

async function main() {
  let cwd = process.cwd();
  try {
    let input = {};
    try {
      input = await readStdin();
    } catch {
      input = {}; // malformed/empty stdin: behave as an unconfigured project
    }
    if (input && typeof input === 'object' && typeof input.cwd === 'string' && input.cwd) {
      cwd = input.cwd;
    }
    output(decide(cwd));
  } catch (e) {
    warn('hook error: ' + (e && e.message));
    output({});
  }
}

main();
