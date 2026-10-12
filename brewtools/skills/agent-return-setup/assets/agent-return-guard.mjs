#!/usr/bin/env node
// brewcode-meta: version=6.4.0 content_version=6.0.0 generated_by=brewtools:agent-return-setup
/**
 * agent-return-guard — SubagentStop + PreToolUse(SubagentHandback) hook (Node
 * built-ins only; I/O = stdin/stdout, the config read done by
 * agent-return-budget.mjs, and one marker file per challenged agent).
 *
 * TWO DELIVERY PATHS, one script, told apart by the event (never by
 * `permission_mode`: a fork uses the classic path in auto mode too):
 *   SubagentStop                  report = `last_assistant_message`; `decision:
 *                                 "block"` gives one more turn (classic path)
 *   PreToolUse SubagentHandback   report = `tool_input.message`; a `deny` gives
 *                                 one more turn (auto mode). A SubagentStop block
 *                                 AFTER the hand-back is ignored by the harness.
 *
 * Subagent returns are the largest single context cost in a manager session.
 * Prose rules ("verdict first, <=30 lines, path:line") are loaded at the top of
 * the agent's context and lose to whatever the agent just did. This hook
 * restates the rule as a number comparison at the only moment it bites: the
 * return itself.
 *
 * No LLM judge anywhere. Size the final message, compare against two integers,
 * order a rewrite or say nothing:
 *   <= PASS          pass
 *   PASS..FILE       block -> compress and re-send
 *   > FILE           block -> persist detail under .claude/reports/, return path
 *                    + summary. An agent that cannot write (config
 *                    `readOnlyAgentTypes`, or `permission_mode: "plan"`) is asked for
 *                    the essential part instead, never for a file.
 *
 * The file-tier directive names an ABSOLUTE directory: <projectRoot>/.claude/
 * reports/<stamp>_<agent-slug>-<run-id>/. Both halves are deliberate. The base
 * comes from projectRoot() in agent-return-budget.mjs — the same call that finds
 * the config, so destination and config can never resolve to different roots —
 * never from the raw hook cwd, which drifts mid-session and used to send the
 * report into a nested `.claude/reports`. The run id (agent_id -> session_id ->
 * random) separates two same-type agents that stop inside the same second, the
 * stamp's resolution.
 *
 * Blocks AT MOST ONCE per `agent_id`, across BOTH paths: before any block or
 * deny the guard exclusive-creates `<config dir>/agent-return-state/<hash>.json`
 * and stays silent when that marker already exists. Repeated hand-back denies
 * make the harness withhold the report, so a deny that cannot be recorded is
 * not issued. `stop_hook_active` stays as the classic-path brake. A payload
 * without `agent_id` (main session, internal agents) is never challenged.
 * Consequence, accepted: one compress round may land slightly over PASS.
 *
 * Config gate: `.claude/agent-return.json` with `enabled: true` (project wins,
 * then global). No config = no-op. Thresholds: config `passTokens`/`fileTokens`
 * > env AGENT_RETURN_PASS/AGENT_RETURN_FILE > 2500/6000.
 *
 * Fail-open: malformed JSON, missing stdin, unexpected shape, any *runtime*
 * throw -> `{}` on stdout, exit 0. Never exit 2. A broken guard must cost
 * nothing. The one failure the try/catch cannot swallow is a missing sibling
 * agent-return-budget.mjs: ESM resolution runs before evaluation, so the hook
 * exits 1 with empty stdout. That is a non-blocking hook error — only exit 2
 * blocks — so nothing wedges. The three files ship together.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import {
  ENABLED, estimateTokens, PASS, FILE, STATE_DIR, isReadOnly, projectRoot,
} from './agent-return-budget.mjs';

const REPORTS_REL = join('.claude', 'reports');
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

/**
 * Absolute `.claude/reports` base. A root that cannot be resolved degrades to
 * the relative path — the block still fires. Fail-safe here means "keep the
 * budget, lose the absolute path", never "let an oversized return through".
 */
function reportBase(hookCwd) {
  try {
    return join(projectRoot(typeof hookCwd === 'string' ? hookCwd : ''), REPORTS_REL);
  } catch {
    return REPORTS_REL;
  }
}

/**
 * Per-invocation directory suffix: agent_id, else session_id, else random.
 * 8 chars of [a-z0-9] — the stamp only resolves to the second, so without this
 * two agents of the same type that stop together name the same directory.
 */
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
    `key \`path:line\` refs. If no tool of yours can write a file, skip the file: send the ` +
    `essential part within the budget and name what you left out.`
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

/**
 * Exclusive-create this agent's marker: 'claimed' (first challenge), 'taken'
 * (already challenged on either path) or 'unavailable' (state not writable).
 */
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

// A non-object payload (array, number, bare string) needs no separate guard:
// readStdinSync already maps null/empty to {}, and every field lookup on the
// rest is undefined, so decide() falls through to {} on its own.
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
