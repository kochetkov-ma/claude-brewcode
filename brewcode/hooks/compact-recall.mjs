#!/usr/bin/env node
// SessionStart "compact": re-anchor plan/intent/tasks; ALWAYS injects, any failure -> [INTENT].

import { statSync, readFileSync } from 'fs';
import {
  readStdin, output, capText, log, projectRoot, resolvePlansDir, latestPlanLink, symlinkTarget, ownsPlanTarget
} from './lib/utils.mjs';

const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const PLAN_KEY = '"planFilePath":"';
const TASK_KEY = '"name":"TaskCreate"';
// Plan-mode traces, present even with no plan file. Keys carry their JSON quotes: prose that only
// NAMES a key arrives escaped (\"), so the transcript's own text about itself cannot match.
const PLAN_MODE_KEYS = ['"type":"plan_mode"', '"type":"plan_mode_reentry"', '"permissionMode":"plan"'];

// `{planPath, planMode, hadTasks}` from this session's append-only transcript: LAST planFilePath wins
// (a re-plan outside plan mode still yields the older one).
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

// Last plan path in raw transcript or null; Buffer.lastIndexOf skips JSONL parsing, closing quote
// searched on the record's own line only (half-flushed last record).
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
    // Truncated/undecodable/insane record -> try an earlier one. Stop at offset 0:
    // lastIndexOf(key, -1) resolves to buf.length and would re-find the same hit forever.
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

/** Plan fragment `{text, branch}`; first match in the ladder wins. `root` serves the LATEST.md rung. */
function planFragment({ planPath, planMode }, root, sessionId) {
  if (planPath && isFile(planPath)) {
    return {
      branch: 'plan-file',
      text: [
        `[PLAN] Read ${planPath} with the Read tool before doing any work.`,
        'It is the plan for this session: follow it, do not re-derive it.'
      ].join('\n')
    };
  }
  // A plan that PREDATES the transcript (post-/clear) leaves no planFilePath to scan. LATEST.md counts
  // only as the symlink session-start made; its age is unknown here, so the text makes the model check.
  const latestPlan = latestPlanLink(root);
  const target = symlinkTarget(latestPlan);
  if (target && ownsPlanTarget(root, target, resolvePlansDir(root, sessionId)) && isFile(target)) {
    return {
      branch: 'plan-latest',
      text: [
        `[PLAN] Read ${latestPlan} with the Read tool before doing any work.`,
        'It is the last plan linked in this project: if it covers the task in the compact summary, follow it, do not re-derive it; if it does not, ignore it.'
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
        'A plan in the compact summary -> follow it, do not re-derive it.',
        'No plan there -> re-read the user ORIGINAL task and intent from the summary and keep executing THAT.'
      ].join('\n')
    };
  }
  return { branch: 'intent', text: INTENT_FRAGMENT };
}

// Claims only what one TaskCreate hit proves: a graph exists (count/status unknown -> "read it").
// "Then" = injection order, plan fragment first: two fragments both claiming "first" contradict.
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
    const plan = planFragment(signals, root, sessionId);
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
