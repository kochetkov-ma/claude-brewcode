#!/usr/bin/env node
/**
 * suite-forced-eval.mjs — forced-eval.mjs cadence (fires on prompt 1, then every
 * 10th) and the role-recall.mjs text-identity invariant (one normative copy in
 * hooks/lib/reminder.mjs).
 *
 * Self-contained: runs standalone (`node tests/suite-forced-eval.mjs`), needs no
 * network and no MCP, and never touches the real OS tmp dir — every marker lands
 * under an isolated TMPDIR per test block.
 *
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const HOOKS = join(HERE, '..');                           // brewcode/hooks/
const HOOK = join(HOOKS, 'forced-eval.mjs');
const HOOK_ROLE_RECALL = join(HOOKS, 'role-recall.mjs');

const BASE = mkdtempSync(join(tmpdir(), 'bc-forced-eval-'));

let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

/** Runs the hook once against an isolated TMPDIR; returns the parsed stdout or null. */
function runHook(hook, stdinObj, tmp) {
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: tmp },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    // leave null
  }
  return { status: res.status, parsed };
}

const ctxOf = (r) => r.parsed?.hookSpecificOutput?.additionalContext;

// ═══ A. cadence — fires on prompt 1, silent 2-9, fires again on 10 ═══
{
  const tmp = join(BASE, 'a-tmp');
  const sid = 'session-cadence-a';
  const injectedAt = [];
  let allExitZero = true;
  let text1 = null;
  let text10 = null;

  for (let i = 1; i <= 10; i++) {
    const r = runHook(HOOK, { hook_event_name: 'UserPromptSubmit', session_id: sid, prompt: `real task ${i}` }, tmp);
    if (r.status !== 0) allExitZero = false;
    const ctx = ctxOf(r);
    if (ctx !== undefined) {
      injectedAt.push(i);
      if (i === 1) text1 = ctx;
      if (i === 10) text10 = ctx;
    }
  }

  check('A1.exitZeroThroughout', allExitZero, true, 'all 10 invocations exit 0');
  check('A2.injectsOnlyOnOneAndTen', injectedAt, [1, 10], 'fires on the 1st prompt and the next multiple of 10, silent on 2-9');
  check('A3.textIdenticalAcrossFires', text1 === text10 && typeof text1 === 'string' && text1.length > 0,
    true, 'the same reminder text is injected on prompt 1 and prompt 10');
}

// ═══ B. meta-replies never consume a counter slot ═══
{
  const tmp = join(BASE, 'b-tmp');
  const sid = 'session-meta-b';

  const metaResults = ['yes', 'no', 'ok', '3'].map(
    (p) => ctxOf(runHook(HOOK, { hook_event_name: 'UserPromptSubmit', session_id: sid, prompt: p }, tmp)),
  );
  const firstRealCtx = ctxOf(runHook(HOOK, { hook_event_name: 'UserPromptSubmit', session_id: sid, prompt: 'do the real task' }, tmp));

  check('B1.metaRepliesNeverInject', metaResults, [undefined, undefined, undefined, undefined],
    'yes/no/ok/a bare number never inject regardless of position');
  check('B2.firstRealPromptStillFiresAtCountOne', typeof firstRealCtx, 'string',
    'the first REAL prompt after any number of skipped meta-replies is still count=1 and fires');
}

// ═══ C. counting unavailable -> fail-open, never spam ═══
{
  const tmp = join(BASE, 'c-tmp');

  const noSession = runHook(HOOK, { hook_event_name: 'UserPromptSubmit', prompt: 'do it' }, tmp);
  check('C1.missingSessionIdNoOps', { status: noSession.status, body: noSession.parsed }, { status: 0, body: {} },
    'no session_id means counting is unavailable; the hook no-ops instead of always-injecting');

  const badSession = runHook(HOOK, { hook_event_name: 'UserPromptSubmit', session_id: '../../etc/passwd', prompt: 'do it' }, tmp);
  check('C2.pathUnsafeSessionIdNoOps', { status: badSession.status, body: badSession.parsed }, { status: 0, body: {} },
    'a session_id that cannot name a safe marker file degrades to no-op, not a throw or an inject');
}

// ═══ D. role-recall.mjs stays byte-identical to forced-eval.mjs's injected text ═══
{
  const roleRecall = spawnSync(process.execPath, [HOOK_ROLE_RECALL], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact' }),
    encoding: 'utf8',
  });
  const roleCtx = (() => {
    try {
      return JSON.parse(roleRecall.stdout)?.hookSpecificOutput?.additionalContext;
    } catch {
      return undefined;
    }
  })();

  const tmp = join(BASE, 'd-tmp');
  const forcedCtx = ctxOf(runHook(HOOK, { hook_event_name: 'UserPromptSubmit', session_id: 'session-identity-d', prompt: 'first prompt' }, tmp));

  check('D1.roleRecallFires', typeof roleCtx, 'string', 'role-recall.mjs injects on source=compact');
  check('D2.textByteIdenticalToForcedEval', roleCtx, forcedCtx,
    'both hooks import the SAME REMINDER_TEXT from lib/reminder.mjs — one normative copy');
}

try {
  rmSync(BASE, { recursive: true, force: true });
} catch {
  // ignore
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nsuite-forced-eval (cadence + role-recall text identity)');
console.log(`  base: ${BASE}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
