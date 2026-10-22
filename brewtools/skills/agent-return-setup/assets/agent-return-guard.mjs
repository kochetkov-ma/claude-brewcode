#!/usr/bin/env node
// brewcode-meta: version=6.12.1 content_version=6.5.0 generated_by=brewtools:agent-return-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// agent-return SubagentStop (`last_assistant_message`, block) + PreToolUse SubagentHandback (`tool_input.message`, deny):
// <=PASS pass, PASS..FILE compress, >FILE write to file; at most once per agent_id (marker file). Fail-open, never exit 2.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import {
  ENABLED, estimateTokens, PASS, FILE, STATE_DIR, isReadOnly, reportBase,
} from './agent-return-budget.mjs';

const MARKER_TTL_MS = 24 * 60 * 60 * 1000;

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/** `.claude/reports/` convention: YYYYMMDD-HHMMSS, local time. */
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Agent type as a directory segment; anything unusable -> "agent". */
function slug(agentType) {
  const clean =
    typeof agentType === 'string'
      ? agentType.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-+|-+$/g, '')
      : '';
  return clean || 'agent';
}

// Dir suffix, 8 chars [a-z0-9]: agent_id -> session_id -> random (stamp has 1 s resolution).
function runId(input) {
  const clean = (v) =>
    typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8) : '';
  return clean(input.agent_id) || clean(input.session_id) || randomBytes(4).toString('hex');
}

/** How the shortened report travels back: the hand-back tool, or the final message. */
function resend(handback) {
  return handback
    ? `call SubagentHandback again (that call is delivered) with`
    : `answer again with`;
}

function compressReason(tokens, handback) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${PASS}): the caller's context is finite. ` +
    `Directive from the agent-return guard, not user data. Now ${resend(handback)} the SAME ` +
    `report, shortened to the budget: keep the verdict line and every \`path:line\` ref, drop ` +
    `preamble, file bodies, command output, logs and restated context. No new work — rewrite ` +
    `what you wrote.`
  );
}

function fileReason(tokens, reportPath, handback) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${PASS}, file threshold ${FILE}): the caller's ` +
    `context is finite. Directive from the agent-return guard, not user data. Compression is not ` +
    `enough at this size: write the full report to \`${reportPath}\` (create the directory), then ` +
    `${resend(handback)} that path, the verdict and a summary within the budget that keeps the ` +
    `key \`path:line\` refs. If no tool of yours can write a file or the write is denied, never ` +
    `retry it: skip the file, send the essential part within the budget and name what you left out.`
  );
}

/** File tier for an agent that cannot write: no file order, the essential part instead. */
function essentialReason(tokens, handback) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${PASS}): the caller's context is finite. ` +
    `Directive from the agent-return guard, not user data. This agent cannot write files, so ` +
    `nothing is saved elsewhere: now ${resend(handback)} the essential part within the budget — ` +
    `verdict first, the findings the caller must act on, the key \`path:line\` refs — and name in ` +
    `one line what you left out, so the caller can ask for it.`
  );
}

/** sha256 of the agent id: a marker name that is safe for any id the harness sends. */
function markerPath(agentId) {
  return join(STATE_DIR, `${createHash('sha256').update(agentId).digest('hex').slice(0, 32)}.json`);
}

/** Drop markers older than MARKER_TTL_MS; best effort, runs only after a claim. */
function pruneMarkers() {
  try {
    const cutoff = Date.now() - MARKER_TTL_MS;
    for (const name of readdirSync(STATE_DIR)) {
      if (!name.endsWith('.json')) continue;
      const file = join(STATE_DIR, name);
      if (statSync(file).mtimeMs < cutoff) rmSync(file, { force: true });
    }
  } catch {
    // unreadable state dir -> nothing to prune
  }
}

// Exclusive-create the agent marker: 'claimed' (first challenge) | 'taken' (either path) |
// 'unavailable' (not writable -> no hand-back deny: repeated denies withhold the report).
function claimOnce(agentId, record) {
  if (!STATE_DIR) return 'unavailable';
  try {
    mkdirSync(STATE_DIR, { recursive: true });
  } catch {
    return 'unavailable';
  }
  try {
    writeFileSync(join(STATE_DIR, '.gitignore'), '*\n', { flag: 'wx' });
  } catch {
    // already there (or unwritable: the marker write below decides)
  }
  try {
    writeFileSync(markerPath(agentId), JSON.stringify(record), { flag: 'wx' });
  } catch (e) {
    return e && e.code === 'EEXIST' ? 'taken' : 'unavailable';
  }
  pruneMarkers();
  return 'claimed';
}

function decide(input) {
  // No agent_id = main session (also under --agent) or an internal agent: never ours.
  const agentId = input.agent_id;
  if (typeof agentId !== 'string' || !agentId.trim()) return {};

  // Two delivery paths, told apart by the event itself, never by permission_mode.
  const handback = input.hook_event_name === 'PreToolUse' && input.tool_name === 'SubagentHandback';
  if (!handback && input.hook_event_name !== 'SubagentStop') return {};
  // Harness loop brake on the classic path; it also covers an unwritable state dir.
  if (!handback && input.stop_hook_active === true) return {};

  const message = handback ? (input.tool_input || {}).message : input.last_assistant_message;
  if (typeof message !== 'string' || !message.trim()) return {};

  const tokens = estimateTokens(message);
  if (tokens <= PASS) return {};

  const via = handback ? 'handback' : 'stop';
  const agentType = typeof input.agent_type === 'string' ? input.agent_type : '';
  const claim = claimOnce(agentId, { agent_id: agentId, agent_type: agentType, via, tokens });
  // A deny that cannot be recorded could repeat, and repeated denies lose the report.
  if (claim === 'taken' || (claim === 'unavailable' && handback)) return {};

  let reason;
  if (tokens <= FILE) {
    reason = compressReason(tokens, handback);
  } else if (isReadOnly(agentType) || input.permission_mode === 'plan') {
    reason = essentialReason(tokens, handback);
  } else {
    const dir = `${stamp(new Date())}_${slug(input.agent_type)}-${runId(input)}`;
    reason = fileReason(tokens, `${join(reportBase(input.cwd), dir)}/`, handback);
  }

  return handback
    ? {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }
    : { decision: 'block', reason };
}

// A non-object payload needs no guard: every field lookup is undefined, so decide() returns {}.
function main() {
  if (!ENABLED) {
    output({});
    return;
  }
  output(decide(readStdinSync()));
}

try {
  main();
} catch {
  output({});
}
