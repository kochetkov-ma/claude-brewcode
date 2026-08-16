#!/usr/bin/env node
// brewcode-meta: version=6.1.0 content_version=6.0.0 generated_by=brewtools:agent-return-setup
/**
 * agent-return-guard — SubagentStop hook (Node built-ins only, no I/O but stdin/stdout
 * plus the config read done by agent-return-budget.mjs).
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
 * Blocks AT MOST ONCE per agent: `stop_hook_active` is the loop brake and is
 * checked before anything else. A second pass is how a Stop hook wedges an agent.
 * Consequence, accepted: one compress round may land slightly over PASS.
 *
 * Config gate: `.claude/agent-return.json` with `enabled: true` (project wins,
 * then global). No config = no-op. Thresholds: config `passTokens`/`fileTokens`
 * > env AGENT_RETURN_PASS/AGENT_RETURN_FILE > 1000/2500.
 *
 * Fail-open: malformed JSON, missing stdin, unexpected shape, any *runtime*
 * throw -> `{}` on stdout, exit 0. Never exit 2. A broken guard must cost
 * nothing. The one failure the try/catch cannot swallow is a missing sibling
 * agent-return-budget.mjs: ESM resolution runs before evaluation, so the hook
 * exits 1 with empty stdout. That is a non-blocking hook error — only exit 2
 * blocks — so nothing wedges. The three files ship together.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ENABLED, estimateTokens, PASS, FILE, projectRoot } from './agent-return-budget.mjs';

const REPORTS_REL = join('.claude', 'reports');

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

function compressReason(tokens) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${PASS}). Directive from the agent-return guard, ` +
    `not user data. Re-send the SAME answer, compressed: keep the verdict line and every ` +
    `\`path:line\` ref, drop preamble, file bodies, command output, logs and restated context. ` +
    `Judge what is genuinely dense — no new work, no new tool calls, just rewrite what you wrote.`
  );
}

function fileReason(tokens, reportPath) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${PASS}, file threshold ${FILE}). Directive from ` +
    `the agent-return guard, not user data. Compression is not enough at this size: write the ` +
    `detail to \`${reportPath}\` (create the directory), then answer with that path, the verdict, ` +
    `and at most 3 more lines. Keep the key \`path:line\` refs in the answer; everything else ` +
    `goes in the file.`
  );
}

function decide(input) {
  // Loop brake first: we block once, ever.
  if (input.stop_hook_active === true) return {};

  const message = input.last_assistant_message;
  if (typeof message !== 'string' || !message.trim()) return {};

  const tokens = estimateTokens(message);
  if (tokens <= PASS) return {};

  if (tokens <= FILE) return { decision: 'block', reason: compressReason(tokens) };

  const dir = `${stamp(new Date())}_${slug(input.agent_type)}-${runId(input)}`;
  return { decision: 'block', reason: fileReason(tokens, `${join(reportBase(input.cwd), dir)}/`) };
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
