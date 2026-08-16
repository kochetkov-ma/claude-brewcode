#!/usr/bin/env node
/**
 * Compact Recall Hook - re-anchor plan, original intent and task graph after compaction.
 *
 * Event:   SessionStart, matcher "compact"
 * Channel: hookSpecificOutput.additionalContext — the ONLY channel that reaches
 *          the model after a compact. PostCompact stdout lands in the UI only.
 * Why:     compaction drops the plan reference entirely and the built-in
 *          task_reminder returns empty for several turns, so the session drifts
 *          off the user's original task and starts a NEW task graph.
 * Cost:    measured on an 8.13 MB transcript - scan (one buffer read + five
 *          substring scans) ~6 ms, full process wall clock ~30 ms standalone and
 *          ~55 ms spawned from a node parent, i.e. node startup dominates.
 *          Compaction awaits this hook, so it stays cheap and stateless —
 *          auto-compaction can chain and fire it repeatedly.
 * Contract: on source "compact" it ALWAYS injects something; every failure path
 *          degrades to the INTENT fragment, never to silence and never to a guess.
 */

import { statSync, readFileSync } from 'fs';
import { join } from 'path';
import { readStdin, output, capText, log, projectRoot } from './lib/utils.mjs';

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const PLAN_KEY = '"planFilePath":"';
const TASK_KEY = '"name":"TaskCreate"';
// Plan mode leaves these even when no plan file was ever recorded. Every key
// carries its JSON quotes: prose that merely NAMES a key arrives with escaped
// quotes (\"), so a quoted key cannot match a transcript's own text about itself.
// A bare 'plan_mode_reentry' matched this repo's design discussion and claimed a
// plan that never existed.
const PLAN_MODE_KEYS = ['"type":"plan_mode"', '"type":"plan_mode_reentry"', '"permissionMode":"plan"'];
// Project-local plan link maintained by session-start.mjs (must stay in sync).
const LATEST_PLAN_NAME = 'LATEST.md';

/**
 * Scan this session's transcript for plan + task signals.
 * Transcripts are append-only and compaction does not truncate them, so the LAST
 * planFilePath is the current plan. Trade-off accepted: a session that plans once
 * and later re-plans outside plan mode still gets pointed at the older plan.
 * @param {string} path - transcript_path from stdin
 * @returns {{planPath: string|null, planMode: boolean, hadTasks: boolean}}
 */
function scanTranscript(path, root, sessionId) {
  const signals = { planPath: null, planMode: false, hadTasks: false };
  if (typeof path !== 'string' || path === '') return signals; // non-string fs args warn on stderr
  let buf;
  try {
    // isFile() guards the size gate: a FIFO or char device reports size 0 and
    // then blocks readFileSync forever (/dev/zero hung the hook).
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_TRANSCRIPT_BYTES) {
      log('warn', '[compact-recall]',
        `Transcript skipped: ${st.isFile() ? `${st.size}B over the ${MAX_TRANSCRIPT_BYTES}B cap` : 'not a regular file'} (${path})`,
        root, sessionId);
      return signals;
    }
    buf = readFileSync(path);
  } catch {
    return signals;
  }
  signals.hadTasks = buf.includes(TASK_KEY);
  signals.planMode = PLAN_MODE_KEYS.some(k => buf.includes(k));
  signals.planPath = extractPlanPath(buf);
  return signals;
}

/**
 * Extract the last plan path from a raw transcript buffer.
 * lastIndexOf on the Buffer avoids parsing 3 MB of JSONL. The closing quote is
 * searched within the record's own line only: a partially flushed final record
 * would otherwise run across \n and yield a nonsense path.
 * @param {Buffer} buf - raw transcript
 * @returns {string|null} decoded absolute path, or null
 */
function extractPlanPath(buf) {
  let at = buf.lastIndexOf(PLAN_KEY);
  while (at >= 0) {
    const from = at + PLAN_KEY.length;
    const eol = buf.indexOf(0x0a, from);
    const limit = eol < 0 ? buf.length : eol;
    const end = findClosingQuote(buf, from, limit);
    if (end >= 0) {
      const decoded = decodeJsonString(buf.toString('utf8', from, end));
      if (isSanePath(decoded)) return decoded;
    }
    // Truncated, undecodable or insane record: fall back to an earlier one.
    // Stop at offset 0 - lastIndexOf(key, -1) resolves to buf.length and would
    // re-find the same hit forever.
    if (at === 0) break;
    at = buf.lastIndexOf(PLAN_KEY, at - 1);
  }
  return null;
}

/** Absolute, bounded, control-char free - a raw \n would inject extra directive lines */
function isSanePath(p) {
  return typeof p === 'string' && p.startsWith('/') && p.length <= 1024 && !/[\x00-\x1f\x7f]/.test(p);
}

/** Index of the unescaped `"` in [from, limit), or -1 if the value is unterminated */
function findClosingQuote(buf, from, limit) {
  for (let i = from; i < limit; i++) {
    if (buf[i] === 0x22) return i;
    if (buf[i] === 0x5c) i++; // skip the escaped char
  }
  return -1;
}

/** Decode a raw JSON string body (\\, \uXXXX, ...) - Windows paths arrive escaped */
function decodeJsonString(raw) {
  try {
    return JSON.parse(`"${raw}"`) || null;
  } catch {
    return null;
  }
}

/** True only for an existing regular file - existsSync would accept a directory */
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// --- Fragments: independent, order-stable. Add a new builder to the list. ---

const INTENT_FRAGMENT = [
  '[INTENT] Re-read the user ORIGINAL task and intent from the compact summary and keep executing THAT.',
  'Do not continue from the most recently remembered fragment, and do not re-scope the work.'
].join('\n');

/**
 * @param {{planPath: string|null, planMode: boolean}} signals
 * @param {string} root - project root, for the LATEST.md rung
 * @returns {{text: string, branch: string}} plan fragment; first match in the ladder wins
 */
function planFragment({ planPath, planMode }, root) {
  if (planPath && isFile(planPath)) {
    return {
      branch: 'plan-file',
      text: [
        `[PLAN] Read ${planPath} with the Read tool before doing any work.`,
        'It holds the role model and the delegation split for this session: follow it, do not re-derive it.'
      ].join('\n')
    };
  }
  // A plan that PREDATES the transcript (--resume, post-/clear) leaves no
  // planFilePath to scan for - the first occurrence is the compaction attachment
  // this hook is reacting to. The project-local LATEST.md is hook-owned (BC-H02:
  // symlink plus target containment) and project-scoped, so it can never be
  // another repo's plan. Sits above plan-missing: a real file beats a dead path.
  const latestPlan = join(root, '.claude', 'plans', LATEST_PLAN_NAME);
  if (isFile(latestPlan)) {
    return {
      branch: 'plan-latest',
      text: [
        `[PLAN] Read ${latestPlan} with the Read tool before doing any work.`,
        'It is this project\'s latest plan, carried over from before the compact: follow its role model and delegation split, do not re-derive them.'
      ].join('\n')
    };
  }
  if (planPath) {
    return {
      branch: 'plan-missing',
      text: [
        `[PLAN] The plan file for this session is gone or unreadable at ${planPath}.`,
        'Rebuild the frame from the compact summary plus TaskList, not from scratch.'
      ].join('\n')
    };
  }
  // Plan-mode markers are stamped on ENTERING plan mode, before any approval, so
  // this branch must not claim an approved plan exists.
  if (planMode) {
    return {
      branch: 'plan-in-summary',
      text: [
        '[PLAN] This session ran in plan mode; no plan file is available.',
        'A plan in the compact summary -> follow it and its delegation split, do not re-derive them.',
        'No plan there -> re-read the user ORIGINAL task and intent from the summary and keep executing THAT.'
      ].join('\n')
    };
  }
  return { branch: 'intent', text: INTENT_FRAGMENT };
}

// Claims only what one TaskCreate hit proves: a graph exists. Count, status and
// recency are unknown here, so the model is told to read it, not what it holds.
// "Then" keeps the order aligned with the injection order (plan fragment first) -
// two fragments each claiming "first" is a contradiction the model has to guess at.
const TASK_FRAGMENT = [
  '[TASKS] Then call TaskList: a task graph created before the compact ALREADY EXISTS in this session.',
  'Re-read it, do NOT create a new graph. The built-in reminder lags several turns and may show empty, so TaskList is the authority. Then resume the work.'
].join('\n');

// --- Main ---

async function main() {
  let root, sessionId;
  try {
    const input = await readStdin();
    // Stable project root for the log path: hook cwd drifts mid-session and a
    // non-string would throw inside log(), discarding an already-computed fragment.
    root = projectRoot(typeof input.cwd === 'string' ? input.cwd : undefined);
    sessionId = input.session_id;

    // Belt and braces on top of the "compact" matcher.
    if (input.source !== 'compact') {
      output({});
      return;
    }

    const signals = scanTranscript(input.transcript_path, root, sessionId);
    const plan = planFragment(signals, root);
    const fragments = [plan.text];
    if (signals.hadTasks) fragments.push(TASK_FRAGMENT);

    log('info', '[compact-recall]',
      `branch=${plan.branch} tasks=${signals.hadTasks}${signals.planPath ? ` plan=${signals.planPath}` : ''}`,
      root, sessionId);

    output({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: capText(fragments.join('\n'))
      }
    });

  } catch (error) {
    // Never silent after a compact: degrade to the intent reminder.
    log('warn', '[compact-recall]', `Error: ${error.message}`, root, sessionId);
    output({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: INTENT_FRAGMENT
      }
    });
  }
}

main();
