#!/usr/bin/env node
/**
 * E2E suite for agent-deadline hooks (guard + cleanup).
 * Runs in isolated TEMP HOME + TMPDIR (os.tmpdir()/os.homedir() both respect
 * these env vars). Never touches real ~/.claude, real /tmp state, or repo state.
 * Assertion policy: every check is an unconditional exact-equality/size/type
 * comparison with a description; no branching gates which asserts run.
 */
import { spawnSync, spawn } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  symlinkSync, lstatSync, statSync, chmodSync, chownSync, readdirSync, utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets');                // assets/
const GUARD_MJS = join(ASSETS, 'agent-deadline-guard.mjs');
const CLEANUP_MJS = join(ASSETS, 'agent-deadline-cleanup.mjs');

// GIVEN: a fresh isolated temp base
const BASE = mkdtempSync(join(tmpdir(), 'ad-test-'));
let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

// ── deep-equal primitive (utility, not test-body branching) ────────────────
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function check(name, actual, expected, message) {
  const ok = deepEqual(actual, expected);
  if (ok) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

// ── process runner ──────────────────────────────────────────────────────────
function run(script, stdinStr, env) {
  const r = spawnSync(process.execPath, [script], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 8000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

// ── fixture helpers ──────────────────────────────────────────────────────────
function writeConfig(projectRoot, cfgObj) {
  const dir = join(projectRoot, '.claude');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent-deadline.json'), JSON.stringify(cfgObj));
}

function writeRawConfig(projectRoot, text) {
  const dir = join(projectRoot, '.claude');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent-deadline.json'), text);
}

function stateRoot(tmp) {
  return join(tmp, 'brewtools-agent-deadline');
}

function stateFilePath(tmp, sessionId, agentId) {
  return join(stateRoot(tmp), sessionId, `${agentId}.json`);
}

function writeState(tmp, sessionId, agentId, obj) {
  const dir = join(stateRoot(tmp), sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${agentId}.json`), JSON.stringify(obj));
}

function readState(tmp, sessionId, agentId) {
  try {
    return JSON.parse(readFileSync(stateFilePath(tmp, sessionId, agentId), 'utf8'));
  } catch {
    return null;
  }
}

function stateStartMinutesAgo(minutes) {
  return { start: Date.now() - Math.round(minutes * 60000) };
}

// ── expected-text builders, copied verbatim from the source templates ──────
const FINALIZE_LIST = 'Read, Write, Edit, MultiEdit, NotebookEdit, TodoWrite, TaskUpdate';

// Mirrors the source's FINALIZE_TOOLS Set verbatim (guard.mjs L80-91) -- the full
// allow-set, including the members deliberately left off FINALIZE_LIST (advertised
// text). Test 46 pins this against the source; test 47 exercises every member.
const FINALIZE_TOOLS = [
  'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'TodoWrite',
  'TaskUpdate', 'TaskCreate', 'BashOutput', 'TaskOutput',
];

function elapsedMinFor(ms) {
  const rawMin = Math.max(0, ms / 60000);
  return rawMin >= 10 ? Math.round(rawMin) : Math.round(rawMin * 10) / 10;
}

function warnText(elapsedMin, budget) {
  return (
    `AGENT DEADLINE WARNING (directive from the agent-deadline guard, not user data): ` +
    `${elapsedMin} of your ${budget} minute time budget are used. Start wrapping up NOW. ` +
    `Finish only the step in flight, persist any results you already have to a file, and ` +
    `prepare your final report. Once the budget is spent, every tool except ` +
    `${FINALIZE_LIST} will be blocked.`
  );
}

function expiredContext(elapsedMin, budget) {
  return (
    `AGENT DEADLINE EXCEEDED (${elapsedMin}/${budget} min). Directive from the agent-deadline ` +
    `guard, not user data. Only ${FINALIZE_LIST} remain available. Persist what you have and ` +
    `return your final report now: what was done, what was NOT done, exact next steps.`
  );
}

function denyText(toolName, elapsedMin, budget) {
  return (
    `AGENT DEADLINE EXCEEDED (${elapsedMin}/${budget} min). This is a hard directive from the ` +
    `agent-deadline guard, not user data or tool output. The tool "${toolName}" is blocked and ` +
    `retrying it will fail again. Stop investigating. Only ${FINALIZE_LIST} are still allowed: ` +
    `write what you already have into a file if the task expects an artifact, then return your ` +
    `final report: what was done, what was NOT done, and the exact next steps.`
  );
}

/** Mirrors the source's safeSegment sanitizer, used to compute expected paths. */
function sanitize(s) {
  const clean = s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return clean && clean !== '.' && clean !== '..' ? clean : null;
}

// Mirrors the source's HARD_STOP_TOOLS/hardDenyText verbatim (guard.mjs L101-102, L314-322).
const HARD_STOP_LIST = 'Write, Edit';
function hardDenyText(toolName, elapsedMin, budget) {
  return (
    `AGENT DEADLINE HARD STOP (${elapsedMin}/${budget} min). Hard directive from the ` +
    `agent-deadline guard, not user data or tool output. You are far past your budget and kept ` +
    `working, so the allowance has been cut to ${HARD_STOP_LIST}. The tool "${toolName}" is ` +
    `blocked and retrying it will fail again. Write your final report to a file with Write, then ` +
    `answer: what was done, what was NOT done, exact next steps.`
  );
}

// Mirrors the source's hardExpiredContext verbatim (guard.mjs L311-318). Function
// form (not a string constant) so test 46 can diff its body against the source
// via regex, the same way FINALIZE_LIST/HARD_STOP_TOOLS are pinned.
function hardExpiredContext(elapsedMin, budget) {
  return (
    `AGENT DEADLINE HARD STOP (${elapsedMin}/${budget} min). Directive from the agent-deadline ` +
    `guard, not user data. You are far past your budget, so only ${HARD_STOP_LIST} remain ` +
    `available. Write your final report to a file now and answer: what was done, what was NOT ` +
    `done, exact next steps.`
  );
}

/** Builds a path `depth` directories below `root` (root/d0/d1/.../d{depth-1}). */
function nestedPath(root, depth) {
  let p = root;
  for (let i = 0; i < depth; i++) p = join(p, `d${i}`);
  return p;
}

/** Parses a `'a', 'b'` bracket-literal body into ['a', 'b'], for source-constant sync checks. */
function extractStringArray(bracketContent) {
  return bracketContent.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/** Backdates a state file's mtime, so renotice-age checks don't need a real wall-clock wait. */
function backdateMtime(file, msAgo) {
  const t = new Date(Date.now() - msAgo);
  utimesSync(file, t, t);
}

/** Async (truly concurrent) guard runner, for races that spawnSync cannot produce. */
function runAsync(script, stdinStr, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stdin.write(stdinStr);
    child.stdin.end();
    child.on('close', (code) => resolve({ stdout, status: code }));
  });
}

function freshEnv(home, tmp) {
  return { HOME: home, TMPDIR: tmp };
}

function newRoot(name) {
  const home = join(BASE, `${name}-home`);
  const tmp = join(BASE, `${name}-tmp`);
  const proj = join(BASE, `${name}-proj`);
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(proj, { recursive: true });
  return { home, tmp, proj, env: freshEnv(home, tmp) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 01: main session (no agent_id) -> no-op
// GIVEN: PreToolUse payload without agent_id/agent_type
// WHEN: guard runs
// THEN: output == {}, exit 0, no state dir ever created
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t01');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const stdin = JSON.stringify({
    session_id: 'S01', cwd: proj, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);

  check('01-exit-code', r.status, 0, 'main session must exit 0');
  check('01-output-empty', out, {}, 'main session (no agent_id) is a no-op');
  check('01-no-state-dir', existsSync(stateRoot(tmp)), false, 'no state dir must be created for main session');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 02: first tool call of a subagent -> state created, silent pass
// GIVEN: enabled config, fresh agent/session, no prior state file
// WHEN: guard runs once
// THEN: output == {}; state file has exactly {start,warned:false,expired:false};
//       start recorded within the call's wall-clock window
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t02');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const stdin = JSON.stringify({
    session_id: 'S02', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const before = Date.now();
  const r = run(GUARD_MJS, stdin, env);
  const after = Date.now();
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S02', 'A1') || {};
  const startInWindow = typeof state.start === 'number' && state.start >= before && state.start <= after;

  check('02-exit-code', r.status, 0, 'first call must exit 0');
  check('02-output-empty', out, {}, 'first call is silent (no warning yet)');
  check('02-state-key-count', Object.keys(state).length, 3, 'state has exactly start/warned/expired');
  check('02-state-warned-expired', { warned: state.warned, expired: state.expired }, { warned: false, expired: false }, 'fresh state starts unwarned/unexpired');
  check('02-state-start-in-window', startInWindow, true, `start=${state.start} window=[${before},${after}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 03: ~50% of budget -> silence, state untouched
// GIVEN: state pre-seeded at elapsed=10min against a 20min budget (ratio 0.5)
// WHEN: guard runs
// THEN: output == {}; state file byte-identical to what was pre-seeded
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t03');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(10), warned: false, expired: false };
  writeState(tmp, 'S03', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S03', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S03', 'A1');

  check('03-exit-code', r.status, 0, 'mid-budget call must exit 0');
  check('03-output-empty', out, {}, '50% of budget produces no warning');
  check('03-state-unchanged', state, seeded, 'state must not be rewritten below the warn threshold');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 04: >=80% budget, first time -> exactly one non-blocking warning
// GIVEN: state pre-seeded at elapsed=16.5min against a 20min budget (ratio 0.825)
// WHEN: guard runs
// THEN: output == additionalContext warning (full object, exact template);
//       state becomes warned:true, expired:false, start unchanged
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t04');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(16.5), warned: false, expired: false };
  writeState(tmp, 'S04', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S04', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S04', 'A1');
  const elapsedMin = elapsedMinFor(16.5 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 20) },
  };

  check('04-exit-code', r.status, 0, '80% warning call must exit 0');
  check('04-output-warn', out, expectedOut, `exact warn object at ${elapsedMin}/20 min`);
  check('04-state-after-warn', state, { start: seeded.start, warned: true, expired: false }, 'state flips warned=true, start/expired unchanged');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 05: >=80% budget, already warned -> silence, no duplicate warning
// GIVEN: state pre-seeded at elapsed=17min/20min with warned already true
// WHEN: guard runs
// THEN: output == {}; state file byte-identical to what was pre-seeded
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t05');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(17), warned: true, expired: false };
  writeState(tmp, 'S05', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S05', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S05', 'A1');

  check('05-exit-code', r.status, 0, 'repeat >=80% call must exit 0');
  check('05-output-empty', out, {}, 'warning must not be duplicated');
  check('05-state-unchanged', state, seeded, 'state must stay exactly as pre-seeded');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 06: >=100% budget, Bash -> hard deny
// GIVEN: state pre-seeded at elapsed=25min/20min (ratio 1.25), not yet expired
// WHEN: guard runs with tool_name Bash
// THEN: output == permissionDecision:"deny" (full object, exact template);
//       state becomes expired:true, warned:true
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t06');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(25), warned: true, expired: false };
  writeState(tmp, 'S06', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S06', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S06', 'A1');
  const elapsedMin = elapsedMinFor(25 * 60000);
  const expectedOut = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: denyText('Bash', elapsedMin, 20),
    },
  };

  check('06-exit-code', r.status, 0, 'deny call must still exit 0');
  check('06-output-deny', out, expectedOut, `exact deny object at ${elapsedMin}/20 min for Bash`);
  check('06-state-expired', state, { start: seeded.start, warned: true, expired: true }, 'state flips expired=true on first over-budget non-finalize call');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 07: >=100% budget, Read (finalize tool), first time -> expiry notice, no deny
// GIVEN: state pre-seeded at elapsed=25min/20min, expired:false
// WHEN: guard runs with tool_name Read
// THEN: output == additionalContext expiry notice, no permissionDecision key;
//       state becomes expired:true, warned:true
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t07');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(25), warned: true, expired: false };
  writeState(tmp, 'S07', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S07', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S07', 'A1');
  const elapsedMin = elapsedMinFor(25 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: expiredContext(elapsedMin, 20) },
  };

  check('07-exit-code', r.status, 0, 'first finalize-past-deadline call must exit 0');
  check('07-output-expired-notice', out, expectedOut, `Read is not denied, gets one expiry notice at ${elapsedMin}/20 min`);
  check('07-no-deny-key', Object.prototype.hasOwnProperty.call(out.hookSpecificOutput || {}, 'permissionDecision'), false, 'finalize tool must never carry permissionDecision');
  check('07-state-expired', state, { start: seeded.start, warned: true, expired: true }, 'state flips expired=true on the first finalize call past deadline');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 08: >=100% budget, Write/Edit (finalize tool), repeat -> fully silent pass
// GIVEN: state already expired:true (past the first notice)
// WHEN: guard runs with tool_name Write, then again with Edit
// THEN: output == {} both times; state file untouched
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t08');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(25), warned: true, expired: true };
  writeState(tmp, 'S08', 'A1', seeded);

  const stdinWrite = JSON.stringify({
    session_id: 'S08', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: {},
  });
  const rWrite = run(GUARD_MJS, stdinWrite, env);
  const outWrite = safeParse(rWrite.stdout);
  const stateAfterWrite = readState(tmp, 'S08', 'A1');

  const stdinEdit = JSON.stringify({
    session_id: 'S08', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: {},
  });
  const rEdit = run(GUARD_MJS, stdinEdit, env);
  const outEdit = safeParse(rEdit.stdout);
  const stateAfterEdit = readState(tmp, 'S08', 'A1');

  check('08-write-exit-code', rWrite.status, 0, 'repeat finalize call (Write) must exit 0');
  check('08-write-output-empty', outWrite, {}, 'already-expired Write passes silently');
  check('08-write-state-unchanged', stateAfterWrite, seeded, 'state must not be rewritten on repeat finalize pass');
  check('08-edit-exit-code', rEdit.status, 0, 'repeat finalize call (Edit) must exit 0');
  check('08-edit-output-empty', outEdit, {}, 'already-expired Edit passes silently');
  check('08-edit-state-unchanged', stateAfterEdit, seeded, 'state must not be rewritten on repeat finalize pass');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 09: enabled:false -> no-op, no state ever created
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t09');
  writeConfig(proj, { enabled: false, defaultMinutes: 20, byAgentType: {} });
  const stdin = JSON.stringify({
    session_id: 'S09', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);

  check('09-exit-code', r.status, 0, 'enabled:false must exit 0');
  check('09-output-empty', out, {}, 'enabled:false is a hard no-op');
  check('09-no-state-file', existsSync(stateFilePath(tmp, 'S09', 'A1')), false, 'disabled config must never create state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: no config file anywhere -> no-op, no state created
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t10');
  const stdin = JSON.stringify({
    session_id: 'S10', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);

  check('10-exit-code', r.status, 0, 'missing config must exit 0');
  check('10-output-empty', out, {}, 'missing config (project and global) is a no-op');
  check('10-no-state-file', existsSync(stateFilePath(tmp, 'S10', 'A1')), false, 'no config means no state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 11: malformed project config JSON, no global config -> fail-open no-op
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t11');
  writeRawConfig(proj, '{not valid json');
  const stdin = JSON.stringify({
    session_id: 'S11', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);

  check('11-exit-code', r.status, 0, 'broken config must fail open, exit 0');
  check('11-output-empty', out, {}, 'broken project config with no global fallback is a no-op');
  check('11-no-state-file', existsSync(stateFilePath(tmp, 'S11', 'A1')), false, 'fail-open path must not create state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 12: byAgentType override takes priority over defaultMinutes
// GIVEN: defaultMinutes=20, byAgentType.tester=5; elapsed=4.5min (90% of 5, 22.5% of 20)
// WHEN: guard runs for agent_type "tester"
// THEN: warning fires with budget=5 embedded (proves override, not default, was used)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t12');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: { tester: 5 } });
  const seeded = { ...stateStartMinutesAgo(4.5), warned: false, expired: false };
  writeState(tmp, 'S12', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S12', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(4.5 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 5) },
  };

  check('12-exit-code', r.status, 0, 'override budget call must exit 0');
  check('12-output-warn-with-override-budget', out, expectedOut, `budget=5 (override) drives the warning at ${elapsedMin}/5 min`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 13: byAgentType with a non-matching key -> silent fallback to defaultMinutes
// GIVEN: byAgentType.other=5 (does not match agent_type "tester"), defaultMinutes=20
//        elapsed=17min (85% of 20, but 340% of 5 -- would deny if 5 leaked in)
// WHEN: guard runs for agent_type "tester"
// THEN: warning fires with budget=20 embedded (proves default was used, not 5, not a crash)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t13');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: { other: 5 } });
  const seeded = { ...stateStartMinutesAgo(17), warned: false, expired: false };
  writeState(tmp, 'S13', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S13', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(17 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 20) },
  };

  check('13-exit-code', r.status, 0, 'mismatched-key call must exit 0');
  check('13-output-warn-with-default-budget', out, expectedOut, `budget=20 (default) used; mismatched byAgentType key ignored`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 14: path traversal in agent_id stays contained under the state root
// GIVEN: agent_id="../../etc/passwd" on the first tool call
// WHEN: guard runs
// THEN: sanitized segment computed by the source's own regex is used verbatim
//       as a single path component; resulting file path resolves exactly
//       inside <root>/<session>/, never escaping it
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t14');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const rawAgentId = '../../etc/passwd';
  const expectedSegment = sanitize(rawAgentId);
  const stdin = JSON.stringify({
    session_id: 'S14', cwd: proj, agent_id: rawAgentId, agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const expectedPath = stateFilePath(tmp, 'S14', expectedSegment);

  check('14-exit-code', r.status, 0, 'traversal-shaped agent_id must exit 0');
  check('14-output-empty', out, {}, 'first call is still silent regardless of id shape');
  check('14-sanitized-segment', expectedSegment, '.._.._etc_passwd', 'traversal chars replaced 1:1, no path separators survive');
  check('14-state-at-expected-path', existsSync(expectedPath), true, `state file must exist exactly at ${expectedPath}`);
  check('14-state-not-outside-root', existsSync(join(tmp, 'etc', 'passwd.json')), false, 'no file must be written outside the state root');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 15: path traversal in session_id stays contained under the state root
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t15');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const rawSessionId = '../../tmp/evil';
  const expectedSegment = sanitize(rawSessionId);
  const stdin = JSON.stringify({
    session_id: rawSessionId, cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const expectedPath = stateFilePath(tmp, expectedSegment, 'A1');

  check('15-exit-code', r.status, 0, 'traversal-shaped session_id must exit 0');
  check('15-output-empty', out, {}, 'first call is still silent regardless of id shape');
  check('15-sanitized-segment', expectedSegment, '.._.._tmp_evil', 'traversal chars replaced 1:1, no path separators survive');
  check('15-state-at-expected-path', existsSync(expectedPath), true, `state file must exist exactly at ${expectedPath}`);
  check('15-state-not-outside-root', existsSync(join(tmp, 'tmp', 'evil', 'A1.json')), false, 'no file must be written outside the state root');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 16: agent_id that sanitizes to exactly ".." or "." is rejected -> no-op
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t16');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });

  const stdinDotDot = JSON.stringify({
    session_id: 'S16', cwd: proj, agent_id: '..', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const rDotDot = run(GUARD_MJS, stdinDotDot, env);
  const outDotDot = safeParse(rDotDot.stdout);

  const stdinDot = JSON.stringify({
    session_id: 'S16', cwd: proj, agent_id: '.', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const rDot = run(GUARD_MJS, stdinDot, env);
  const outDot = safeParse(rDot.stdout);

  check('16-dotdot-exit-code', rDotDot.status, 0, 'agent_id=".." must exit 0');
  check('16-dotdot-output-empty', outDotDot, {}, 'agent_id=".." sanitizes to rejected value -> treated as no agent_id');
  check('16-dot-exit-code', rDot.status, 0, 'agent_id="." must exit 0');
  check('16-dot-output-empty', outDot, {}, 'agent_id="." sanitizes to rejected value -> treated as no agent_id');
  check('16-no-state-dir', existsSync(stateRoot(tmp)), false, 'neither call may create any state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 17: project config wins over global config
// GIVEN: project defaultMinutes=5, global defaultMinutes=100; elapsed=4.5min
// WHEN: guard runs
// THEN: warning fires with budget=5 (project value), proving project precedence
// ─────────────────────────────────────────────────────────────────────────────
{
  const { home, proj, tmp } = newRoot('t17');
  writeConfig(proj, { enabled: true, defaultMinutes: 5, byAgentType: {} });
  writeConfig(home, { enabled: true, defaultMinutes: 100, byAgentType: {} });
  const env = freshEnv(home, tmp);
  const seeded = { ...stateStartMinutesAgo(4.5), warned: false, expired: false };
  writeState(tmp, 'S17', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S17', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(4.5 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 5) },
  };

  check('17-exit-code', r.status, 0, 'project-vs-global call must exit 0');
  check('17-project-config-wins', out, expectedOut, 'budget=5 (project) used over budget=100 (global)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 18: cleanup hook removes the finished agent's state file and empty dir
// ─────────────────────────────────────────────────────────────────────────────
{
  const { tmp, env } = newRoot('t18');
  writeState(tmp, 'S18', 'A1', { start: Date.now(), warned: false, expired: false });
  const dir = join(stateRoot(tmp), 'S18');
  const file = join(dir, 'A1.json');
  const stdin = JSON.stringify({ session_id: 'S18', agent_id: 'A1', agent_type: 'tester' });

  check('18-precondition-file-exists', existsSync(file), true, 'state file must exist before cleanup runs');

  const r = run(CLEANUP_MJS, stdin, env);
  const out = safeParse(r.stdout);
  check('18-exit-code', r.status, 0, 'cleanup hook must exit 0');
  check('18-output-empty', out, {}, 'cleanup hook always emits {}');
  check('18-state-file-removed', existsSync(file), false, 'cleanup must delete the finished agent state file');
  check('18-session-dir-removed', existsSync(dir), false, 'cleanup must remove the now-empty session dir');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 19: parallel subagents in the same session keep independent clocks
// GIVEN: A1 rewritten to 85% elapsed, A2 fresh (0% elapsed), same session
// WHEN: guard runs once per agent
// THEN: A1 gets a warning, A2 (independent clock) stays silent and unwarned
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t19');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });

  const stdinA1First = JSON.stringify({
    session_id: 'S19', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  run(GUARD_MJS, stdinA1First, env); // creates A1 state

  const stdinA2First = JSON.stringify({
    session_id: 'S19', cwd: proj, agent_id: 'A2', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  run(GUARD_MJS, stdinA2First, env); // creates A2 state
  const a2SeededStart = readState(tmp, 'S19', 'A2').start;

  // Rewrite ONLY A1 to 85% elapsed; A2 untouched.
  writeState(tmp, 'S19', 'A1', { ...stateStartMinutesAgo(17), warned: false, expired: false });

  const rA1 = run(GUARD_MJS, stdinA1First, env);
  const outA1 = safeParse(rA1.stdout);
  const elapsedMinA1 = elapsedMinFor(17 * 60000);
  const expectedA1 = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMinA1, 20) },
  };

  const rA2 = run(GUARD_MJS, stdinA2First, env);
  const outA2 = safeParse(rA2.stdout);
  const stateA2After = readState(tmp, 'S19', 'A2');

  check('19-a1-warns', outA1, expectedA1, 'A1 (85% elapsed) must warn on its own clock');
  check('19-a2-silent', outA2, {}, 'A2 (fresh clock) must stay silent while A1 warns');
  check('19-a2-state-unwarned', { warned: stateA2After.warned, expired: stateA2After.expired }, { warned: false, expired: false }, 'A2 state must be unaffected by A1 crossing its threshold');
  check('19-a2-start-unchanged', stateA2After.start, a2SeededStart, 'A2 clock must not be reset/shared by A1 activity');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 20: empty / garbage stdin -> fail open, exit 0, no-op
// ─────────────────────────────────────────────────────────────────────────────
{
  const { env } = newRoot('t20');
  const cases = [
    { name: 'empty-stdin', stdin: '' },
    { name: 'malformed-json', stdin: '{not json' },
    { name: 'json-array-not-object', stdin: '[1,2,3]' },
  ];
  for (const c of cases) {
    const r = run(GUARD_MJS, c.stdin, env);
    const out = safeParse(r.stdout);
    check(`20-${c.name}-exit-code`, r.status, 0, `${c.name} must fail open with exit 0`);
    check(`20-${c.name}-output-empty`, out, {}, `${c.name} must be a no-op`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 21: hardStopRatio default (2x) not yet reached -> normal finalize set
//          + normal soft deny
// GIVEN: ratio=1.5 (elapsed=30min/20min budget), default hardStopRatio=2
// WHEN: guard runs TodoWrite (finalize tool) on one agent, Bash (blocked) on another
// THEN: TodoWrite gets the plain expiredContext notice (full finalize set intact);
//       Bash gets the regular soft denyText, not hardDenyText
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t21');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const elapsedMin = elapsedMinFor(30 * 60000);

  const seededTodo = { ...stateStartMinutesAgo(30), warned: true, expired: false };
  writeState(tmp, 'S21', 'A1', seededTodo);
  const rTodo = run(GUARD_MJS, JSON.stringify({
    session_id: 'S21', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: {},
  }), env);
  const outTodo = safeParse(rTodo.stdout);
  const expectedTodo = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: expiredContext(elapsedMin, 20) },
  };

  const seededBash = { ...stateStartMinutesAgo(30), warned: true, expired: false };
  writeState(tmp, 'S21', 'A2', seededBash);
  const rBash = run(GUARD_MJS, JSON.stringify({
    session_id: 'S21', cwd: proj, agent_id: 'A2', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const outBash = safeParse(rBash.stdout);
  const expectedBash = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText('Bash', elapsedMin, 20),
    },
  };

  check('21-todo-exit-code', rTodo.status, 0, 'below-hard-stop TodoWrite call must exit 0');
  check('21-todo-allowed-normal-finalize-set', outTodo, expectedTodo, 'at ratio 1.5 (<2x default hardStopRatio) TodoWrite is still part of the full finalize set, not narrowed');
  check('21-bash-exit-code', rBash.status, 0, 'below-hard-stop Bash call must exit 0');
  check('21-bash-soft-deny', outBash, expectedBash, 'at ratio 1.5 a blocked tool gets the regular soft denyText, not hardDenyText');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 22: hardStopRatio default (2x) reached -> allow-list narrows to Write/Edit
// GIVEN: ratio=2.0 (elapsed=40min/20min), state already expired:true/warned:true
//        with a fresh notice mtime (deterministic silent-pass / hard-deny, no
//        first-crossing notice branch in play)
// WHEN: guard runs Read, TodoWrite (no longer allowed), Write, Edit (still allowed)
// THEN: Read/TodoWrite hard-denied; Write/Edit pass silently, state untouched
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t22');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const elapsedMin = elapsedMinFor(40 * 60000);

  const mk = (agentId) => {
    const seeded = { ...stateStartMinutesAgo(40), warned: true, expired: true };
    writeState(tmp, 'S22', agentId, seeded);
    return seeded;
  };

  mk('A1');
  const rRead = run(GUARD_MJS, JSON.stringify({
    session_id: 'S22', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {},
  }), env);
  const outRead = safeParse(rRead.stdout);

  mk('A2');
  const rTodo = run(GUARD_MJS, JSON.stringify({
    session_id: 'S22', cwd: proj, agent_id: 'A2', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: {},
  }), env);
  const outTodo = safeParse(rTodo.stdout);

  const seededA3 = mk('A3');
  const rWrite = run(GUARD_MJS, JSON.stringify({
    session_id: 'S22', cwd: proj, agent_id: 'A3', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: {},
  }), env);
  const outWrite = safeParse(rWrite.stdout);
  const stateWrite = readState(tmp, 'S22', 'A3');

  const seededA4 = mk('A4');
  const rEdit = run(GUARD_MJS, JSON.stringify({
    session_id: 'S22', cwd: proj, agent_id: 'A4', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: {},
  }), env);
  const outEdit = safeParse(rEdit.stdout);
  const stateEdit = readState(tmp, 'S22', 'A4');

  const expectedHardDenyRead = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: hardDenyText('Read', elapsedMin, 20) },
  };
  const expectedHardDenyTodo = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: hardDenyText('TodoWrite', elapsedMin, 20) },
  };

  check('22-read-hard-denied', outRead, expectedHardDenyRead, 'at ratio>=2 Read is no longer in the surviving set, hard-denied');
  check('22-todo-hard-denied', outTodo, expectedHardDenyTodo, 'at ratio>=2 TodoWrite (normally a finalize tool) is also hard-denied, allow-list shrank to Write/Edit only');
  check('22-write-silent-pass', outWrite, {}, 'Write stays allowed past hard-stop and passes silently once already expired with a fresh notice');
  check('22-write-state-unchanged', stateWrite, seededA3, 'Write must not mutate an already-expired state');
  check('22-edit-silent-pass', outEdit, {}, 'Edit stays allowed past hard-stop and passes silently once already expired with a fresh notice');
  check('22-edit-state-unchanged', stateEdit, seededA4, 'Edit must not mutate an already-expired state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 23: hard-stop deny text is a different template than the regular deny text
// GIVEN: ratio=1.5 (soft) on one agent, ratio=2.25 (hard) on another, both
//        first-crossing (expired:false), same blocked tool "Bash"
// WHEN: guard runs both
// THEN: soft case matches denyText() verbatim; hard case matches hardDenyText()
//       verbatim -- two distinct exact templates, not the same message
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t23');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });

  const seededSoft = { ...stateStartMinutesAgo(30), warned: true, expired: false };
  writeState(tmp, 'S23', 'A1', seededSoft);
  const rSoft = run(GUARD_MJS, JSON.stringify({
    session_id: 'S23', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const outSoft = safeParse(rSoft.stdout);
  const elapsedMinSoft = elapsedMinFor(30 * 60000);
  const expectedSoft = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText('Bash', elapsedMinSoft, 20) },
  };

  const seededHard = { ...stateStartMinutesAgo(45), warned: true, expired: false };
  writeState(tmp, 'S23', 'A2', seededHard);
  const rHard = run(GUARD_MJS, JSON.stringify({
    session_id: 'S23', cwd: proj, agent_id: 'A2', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const outHard = safeParse(rHard.stdout);
  const elapsedMinHard = elapsedMinFor(45 * 60000);
  const expectedHard = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: hardDenyText('Bash', elapsedMinHard, 20) },
  };

  check('23-soft-deny-text-exact', outSoft, expectedSoft, 'ratio 1.5 Bash deny uses the regular denyText template verbatim');
  check('23-hard-deny-text-exact', outHard, expectedHard, 'ratio 2.25 Bash deny uses the hardDenyText template verbatim, a different message body than denyText');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 24: custom hardStopRatio from config is honored, in both directions
// GIVEN: config hardStopRatio=1.5; ratio=1.6 (elapsed=32min/20min) is already
//        hard-stopped under the custom value though below the default 2x;
//        ratio=1.2 (elapsed=24min/20min) is still in the soft band -- past
//        100% but below the custom 1.5x threshold
// WHEN: guard runs, at ratio 1.6: Read (not in HARD_STOP_TOOLS) and Write (in
//       HARD_STOP_TOOLS); at ratio 1.2: Write again
// THEN: at ratio 1.6, Read is hard-denied and Write -- though allowed -- gets
//       the hardExpiredContext notice, not the plain expiredContext one: the
//       allowing branch narrows its wording past the hard stop too, not just
//       the deny branch; at ratio 1.2, Write still gets the plain
//       expiredContext notice, pinning the soft/hard boundary from the
//       allow side as well as the deny side
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t24');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, hardStopRatio: 1.5, byAgentType: {} });
  const elapsedMinHard = elapsedMinFor(32 * 60000);

  const seededRead = { ...stateStartMinutesAgo(32), warned: true, expired: false };
  writeState(tmp, 'S24', 'A1', seededRead);
  const rRead = run(GUARD_MJS, JSON.stringify({
    session_id: 'S24', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {},
  }), env);
  const outRead = safeParse(rRead.stdout);
  const expectedRead = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: hardDenyText('Read', elapsedMinHard, 20) },
  };

  const seededWrite = { ...stateStartMinutesAgo(32), warned: true, expired: false };
  writeState(tmp, 'S24', 'A2', seededWrite);
  const rWrite = run(GUARD_MJS, JSON.stringify({
    session_id: 'S24', cwd: proj, agent_id: 'A2', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: {},
  }), env);
  const outWrite = safeParse(rWrite.stdout);
  const expectedWrite = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: hardExpiredContext(elapsedMinHard, 20) },
  };

  const elapsedMinSoft = elapsedMinFor(24 * 60000);
  const seededSoftWrite = { ...stateStartMinutesAgo(24), warned: true, expired: false };
  writeState(tmp, 'S24', 'A3', seededSoftWrite);
  const rSoftWrite = run(GUARD_MJS, JSON.stringify({
    session_id: 'S24', cwd: proj, agent_id: 'A3', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: {},
  }), env);
  const outSoftWrite = safeParse(rSoftWrite.stdout);
  const expectedSoftWrite = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: expiredContext(elapsedMinSoft, 20) },
  };

  check('24-custom-ratio-read-hard-denied', outRead, expectedRead, 'hardStopRatio=1.5 (config) makes ratio 1.6 already hard-stopped; Read is hard-denied, not merely soft-denied');
  check('24-custom-ratio-write-hard-stop-notice', outWrite, expectedWrite, 'at ratio 1.6 (past the custom 1.5x hard stop) Write is in HARD_STOP_TOOLS and gets the hardExpiredContext notice, not the plain expiredContext one');
  check('24-custom-ratio-soft-band-write-plain-notice', outSoftWrite, expectedSoftWrite, 'at ratio 1.2 (past 100% but below the custom 1.5x hard stop) Write still gets the plain expiredContext notice, proving the allow branch only narrows past the hard-stop threshold');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 25: invalid hardStopRatio (<=1) rolls back to the default (2)
// GIVEN: two configs, hardStopRatio=1 and hardStopRatio=-3; ratio=1.5 in both
//        (below the real default of 2)
// WHEN: guard runs Bash (blocked) under each config
// THEN: both deny with the regular soft denyText, proving neither invalid value
//       was accepted as an early hard-stop threshold
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj: proj1, env, tmp } = newRoot('t25');
  writeConfig(proj1, { enabled: true, defaultMinutes: 20, hardStopRatio: 1, byAgentType: {} });
  const elapsedMin = elapsedMinFor(30 * 60000);

  const seeded1 = { ...stateStartMinutesAgo(30), warned: true, expired: false };
  writeState(tmp, 'S25A', 'A1', seeded1);
  const r1 = run(GUARD_MJS, JSON.stringify({
    session_id: 'S25A', cwd: proj1, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out1 = safeParse(r1.stdout);
  const expected1 = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText('Bash', elapsedMin, 20) },
  };

  const proj2 = join(BASE, 't25-proj2');
  mkdirSync(proj2, { recursive: true });
  writeConfig(proj2, { enabled: true, defaultMinutes: 20, hardStopRatio: -3, byAgentType: {} });
  const seeded2 = { ...stateStartMinutesAgo(30), warned: true, expired: false };
  writeState(tmp, 'S25B', 'A1', seeded2);
  const r2 = run(GUARD_MJS, JSON.stringify({
    session_id: 'S25B', cwd: proj2, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out2 = safeParse(r2.stdout);
  const expected2 = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText('Bash', elapsedMin, 20) },
  };

  check('25-hardstopratio-1-rolls-back-to-default', out1, expected1, 'hardStopRatio=1 (not >1) must roll back to the default 2, so ratio 1.5 is still soft-denied');
  check('25-hardstopratio-negative-rolls-back-to-default', out2, expected2, 'hardStopRatio=-3 must also roll back to default 2');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 26: renotice -- a fresh notice (younger than RENOTICE_RATIO) stays silent
// GIVEN: warn-zone state (ratio 0.85), warned:true, notice backdated 1m50s
//        (renoticeMs = 10% of 20min = 2min, so this is still fresh)
// WHEN: guard runs
// THEN: output == {}; state file byte-identical to what was pre-seeded
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t26');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(17), warned: true, expired: false };
  writeState(tmp, 'S26', 'A1', seeded);
  backdateMtime(stateFilePath(tmp, 'S26', 'A1'), 110000);
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S26', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S26', 'A1');

  check('26-exit-code', r.status, 0, 'fresh-notice warn-zone call must exit 0');
  check('26-output-empty', out, {}, 'notice younger than RENOTICE_RATIO (10% of 20min = 2min) must stay silent');
  check('26-state-unchanged', state, seeded, 'state must not be rewritten while the notice is still fresh');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 27: renotice -- a stale notice (older than RENOTICE_RATIO) repeats the warning
// GIVEN: warn-zone state (ratio 0.85), warned:true, notice backdated 2m10s (stale)
// WHEN: guard runs
// THEN: output == exact warnText object again; expired/start untouched
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t27');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(17), warned: true, expired: false };
  writeState(tmp, 'S27', 'A1', seeded);
  backdateMtime(stateFilePath(tmp, 'S27', 'A1'), 130000);
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S27', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(17 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 20) },
  };
  const state = readState(tmp, 'S27', 'A1');

  check('27-exit-code', r.status, 0, 'stale-notice warn-zone call must exit 0');
  check('27-output-warn-repeats', out, expectedOut, 'notice older than the 2min renotice threshold must repeat the warning verbatim');
  check('27-state-warned-still-true', state, { start: seeded.start, warned: true, expired: false }, 'renotice must not touch expired, start, or flip warned away from true');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 28: renotice -- a stale expiry notice repeats past the deadline too
// GIVEN: expired-zone state (ratio 1.25), expired:true, notice backdated 2m10s
// WHEN: guard runs a finalize tool (Read)
// THEN: output == exact expiredContext object again; state fields unchanged
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t28');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(25), warned: true, expired: true };
  writeState(tmp, 'S28', 'A1', seeded);
  backdateMtime(stateFilePath(tmp, 'S28', 'A1'), 130000);
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S28', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(25 * 60000);
  const expectedOut = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: expiredContext(elapsedMin, 20) },
  };
  const state = readState(tmp, 'S28', 'A1');

  check('28-exit-code', r.status, 0, 'stale-notice expired-zone call must exit 0');
  check('28-output-expiry-repeats', out, expectedOut, 'finalize tool past deadline re-notices once the previous expiry notice is stale');
  check('28-state-still-expired', state, { start: seeded.start, warned: true, expired: true }, 'renotice in expired zone must not change any state field');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 29: config walk-up -- cwd nested repo/a/b/c finds the repo-root config
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t29');
  writeConfig(proj, { enabled: true, defaultMinutes: 7, byAgentType: {} });
  const cwd = join(proj, 'a', 'b', 'c');
  mkdirSync(cwd, { recursive: true });
  writeState(tmp, 'S29', 'A1', { ...stateStartMinutesAgo(6), warned: false, expired: false });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S29', cwd, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(6 * 60000);
  const expectedOut = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 7) } };

  check('29-exit-code', r.status, 0, 'cwd nested 3 levels below repo root must exit 0');
  check('29-config-found-via-walkup', out, expectedOut, 'budget=7 (walked-up project config) drives the warning, proving the climb from a/b/c found the root .claude config');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 30: a broken intermediate config does not shadow a valid ancestor config
// GIVEN: valid config at repo root, broken (invalid JSON) config at repo/mid,
//        cwd = repo/mid/leaf (no config of its own)
// WHEN: guard runs
// THEN: the walk does not stop at the broken mid config; it continues to the
//       root and uses its budget
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t30');
  writeConfig(proj, { enabled: true, defaultMinutes: 9, byAgentType: {} });
  const mid = join(proj, 'mid');
  mkdirSync(join(mid, '.claude'), { recursive: true });
  writeFileSync(join(mid, '.claude', 'agent-deadline.json'), '{not valid json');
  const cwd = join(mid, 'leaf');
  mkdirSync(cwd, { recursive: true });
  writeState(tmp, 'S30', 'A1', { ...stateStartMinutesAgo(8), warned: false, expired: false });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S30', cwd, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(8 * 60000);
  const expectedOut = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 9) } };

  check('30-exit-code', r.status, 0, 'broken intermediate config must still exit 0');
  check('30-broken-config-does-not-shadow-parent', out, expectedOut, 'budget=9 (root config) used; broken mid-level config did not stop the climb or silently disable the feature');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 31: config walk-up depth limit -- cwd 15 levels below the config is
//          still within climb range
// GIVEN: config sits at depth 0 (project root); cwd is 15 directories below
//        it; MAX_CONFIG_CLIMB=16 checks depths 0..15 (cwd itself plus 15
//        ancestors), so the climb from cwd must still reach depth 0
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t31');
  writeConfig(proj, { enabled: true, defaultMinutes: 11, byAgentType: {} });
  const cwd = nestedPath(proj, 15);
  mkdirSync(cwd, { recursive: true });
  writeState(tmp, 'S31', 'A1', { ...stateStartMinutesAgo(10), warned: false, expired: false });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S31', cwd, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const elapsedMin = elapsedMinFor(10 * 60000);
  const expectedOut = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 11) } };

  check('31-exit-code', r.status, 0, 'cwd 15 levels below the config must exit 0');
  check('31-found-at-depth-15', out, expectedOut, 'MAX_CONFIG_CLIMB=16 checks depths 0..15 inclusive; a cwd 15 levels below the root config must still find it');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 32: config walk-up depth limit -- NOT found at depth 16
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t32');
  writeConfig(proj, { enabled: true, defaultMinutes: 11, byAgentType: {} });
  const cwd = nestedPath(proj, 16);
  mkdirSync(cwd, { recursive: true });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S32', cwd, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);

  check('32-exit-code', r.status, 0, 'cwd 16 levels below config must exit 0');
  check('32-not-found-at-depth-16', out, {}, 'MAX_CONFIG_CLIMB=16 stops before depth 16; config must NOT be found, guard is a no-op');
  check('32-no-state-file', existsSync(stateFilePath(tmp, 'S32', 'A1')), false, 'undiscovered config means feature stays off, no state written');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 33: state root safety -- a symlinked state root is refused, victim intact
// GIVEN: STATE_ROOT pre-created as a symlink to an unrelated "victim" directory
// WHEN: guard runs (first call for a subagent)
// THEN: output == {} (fail open); victim content untouched, no file written
//       through the symlink; the symlink itself is left as-is (not replaced)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t33');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const victim = join(BASE, 't33-victim');
  mkdirSync(victim, { recursive: true });
  writeFileSync(join(victim, 'sentinel.txt'), 'do-not-touch');
  symlinkSync(victim, stateRoot(tmp));
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S33', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const sentinel = readFileSync(join(victim, 'sentinel.txt'), 'utf8');
  const linkIsStillSymlink = lstatSync(stateRoot(tmp)).isSymbolicLink();

  check('33-exit-code', r.status, 0, 'symlinked state root must still exit 0 (fail open)');
  check('33-output-empty', out, {}, 'guard must no-op rather than write through a symlinked state root');
  check('33-victim-untouched', sentinel, 'do-not-touch', 'victim directory content must be unmodified');
  check('33-victim-no-new-file', existsSync(join(victim, 'S33')), false, 'no session dir must be created inside the symlink target');
  check('33-root-still-symlink', linkIsStillSymlink, true, 'guard must not replace the symlink with a real directory');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 34: state root safety -- an over-permissive root (0755) is healed to 0700
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t34');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  mkdirSync(stateRoot(tmp), { recursive: true });
  chmodSync(stateRoot(tmp), 0o755);
  const beforeMode = statSync(stateRoot(tmp)).mode & 0o777;
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S34', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const afterMode = statSync(stateRoot(tmp)).mode & 0o777;

  check('34-precondition-mode-0755', beforeMode, 0o755, 'state root must start at 0755 before the guard runs');
  check('34-exit-code', r.status, 0, 'heal-mode call must exit 0');
  check('34-mode-healed-to-0700', afterMode, 0o700, 'guard must chmod an over-permissive state root down to 0700');
  check('34-state-file-created', existsSync(stateFilePath(tmp, 'S34', 'A1')), true, 'after healing, state must actually be written (root accepted)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 35: state root safety -- a root owned by a foreign uid is skipped
// Requires root privileges to chown to a uid other than our own; skipped with
// a labeled note when the suite is not running as root (the common case).
// ─────────────────────────────────────────────────────────────────────────────
{
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot) {
    const { proj, env, tmp } = newRoot('t35');
    writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
    mkdirSync(stateRoot(tmp), { recursive: true, mode: 0o700 });
    chownSync(stateRoot(tmp), 1, 1);
    const r = run(GUARD_MJS, JSON.stringify({
      session_id: 'S35', cwd: proj, agent_id: 'A1', agent_type: 'tester',
      hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
    }), env);
    const out = safeParse(r.stdout);

    check('35-exit-code', r.status, 0, 'foreign-uid state root call must exit 0');
    check('35-output-empty', out, {}, 'a state root owned by a different uid must be refused, guard no-ops');
    check('35-no-state-file', existsSync(stateFilePath(tmp, 'S35', 'A1')), false, 'refused root must never receive a state file');
  } else {
    skipped++;
    results.push('  SKIP  35-foreign-uid-rejected  (requires root privileges to chown to a foreign uid; not available in this test environment)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 36: a start timestamp in the future is clamped to now
// GIVEN: state.start = now + 10min (clock jump / hand-edited / restored snapshot)
// WHEN: guard runs
// THEN: output == {} (clamped elapsed ~0, below warn threshold); state.start is
//       rewritten to within the call's wall-clock window; warned/expired untouched
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t36');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const futureStart = Date.now() + 600000;
  writeState(tmp, 'S36', 'A1', { start: futureStart, warned: false, expired: false });
  const before = Date.now();
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S36', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const after = Date.now();
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S36', 'A1');
  const clampedInWindow = typeof state.start === 'number' && state.start >= before && state.start <= after;

  check('36-exit-code', r.status, 0, 'future-start call must exit 0');
  check('36-output-empty', out, {}, 'clamped elapsed is ~0, well below the warn threshold, so the call is silent');
  check('36-start-clamped-to-now', clampedInWindow, true, `a future start must be rewritten to now(); start=${state.start} window=[${before},${after}]`);
  check('36-warned-expired-untouched', { warned: state.warned, expired: state.expired }, { warned: false, expired: false }, 'the clamp patch touches only start, not warned/expired');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 37: the clamp persists forever -- a later call computes the deadline
//          correctly from the corrected start, not the original future one
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t37');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const futureStart = Date.now() + 600000;
  writeState(tmp, 'S37', 'A1', { start: futureStart, warned: false, expired: false });
  const stdin = JSON.stringify({
    session_id: 'S37', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  run(GUARD_MJS, stdin, env); // first call clamps start to now and persists it
  const clampedStart = readState(tmp, 'S37', 'A1').start;

  // Simulate 17 minutes elapsed since the clamp, on a 20min budget (ratio 0.85).
  writeState(tmp, 'S37', 'A1', { start: clampedStart - 17 * 60000, warned: false, expired: false });
  const r2 = run(GUARD_MJS, stdin, env);
  const out2 = safeParse(r2.stdout);
  const elapsedMin = elapsedMinFor(17 * 60000);
  const expected2 = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, 20) },
  };

  check('37-second-call-uses-clamped-start', out2, expected2, 'the clamped start persists permanently: a later call 17min after it computes the deadline correctly instead of re-detecting a future start');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 38: a numeric agent_id is coerced to a string, state is written
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t38');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const before = Date.now();
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S38', cwd: proj, agent_id: 12345, agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const after = Date.now();
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S38', '12345') || {};
  const startInWindow = typeof state.start === 'number' && state.start >= before && state.start <= after;

  check('38-exit-code', r.status, 0, 'numeric agent_id first call must exit 0');
  check('38-output-empty', out, {}, 'first call for a numeric agent_id is silent, same as a string id');
  check('38-state-written-at-coerced-path', existsSync(stateFilePath(tmp, 'S38', '12345')), true, 'numeric agent_id 12345 must be coerced to the string path segment "12345"');
  check('38-state-shape', { warned: state.warned, expired: state.expired }, { warned: false, expired: false }, 'fresh state for a numeric agent_id starts unwarned/unexpired');
  check('38-state-start-in-window', startInWindow, true, `start=${state.start} window=[${before},${after}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 39: a numeric agent_id enforces the deadline end-to-end (deny fires)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t39');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(25), warned: true, expired: false };
  writeState(tmp, 'S39', '999', seeded);
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S39', cwd: proj, agent_id: 999, agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const state = readState(tmp, 'S39', '999');
  const elapsedMin = elapsedMinFor(25 * 60000);
  const expectedOut = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText('Bash', elapsedMin, 20),
    },
  };

  check('39-exit-code', r.status, 0, 'numeric agent_id deny call must exit 0');
  check('39-deadline-enforced-for-numeric-id', out, expectedOut, 'a numeric agent_id must deny past the deadline exactly like a string id, not silently no-op');
  check('39-state-expired', state, { start: seeded.start, warned: true, expired: true }, 'state for the numeric agent_id flips expired=true on first over-budget call');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 40: agent_type="" -> treated as main session (both fields required)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t40');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S40', cwd: proj, agent_id: 'A1', agent_type: '',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);

  check('40-exit-code', r.status, 0, 'empty agent_type call must exit 0');
  check('40-output-empty', out, {}, 'agent_type="" fails the non-empty check, treated as main session');
  check('40-no-state-file', existsSync(stateFilePath(tmp, 'S40', 'A1')), false, 'main-session treatment must never create state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 41: agent_type="   " (whitespace only) -> treated as main session
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t41');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S41', cwd: proj, agent_id: 'A1', agent_type: '   ',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);

  check('41-exit-code', r.status, 0, 'whitespace-only agent_type call must exit 0');
  check('41-output-empty', out, {}, 'agent_type="   ".trim() === "" -> treated as main session');
  check('41-no-state-file', existsSync(stateFilePath(tmp, 'S41', 'A1')), false, 'main-session treatment must never create state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 42: agent_type absent entirely -> treated as main session
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t42');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S42', cwd: proj, agent_id: 'A1',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);

  check('42-exit-code', r.status, 0, 'missing agent_type field call must exit 0');
  check('42-output-empty', out, {}, 'agent_type absent entirely -> treated as main session, both fields required');
  check('42-no-state-file', existsSync(stateFilePath(tmp, 'S42', 'A1')), false, 'main-session treatment must never create state');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 43: a present-but-unparsable state file is skipped, clock is NOT reset
// GIVEN: a state file that exists but is not valid JSON
// WHEN: guard runs
// THEN: output == {}; the file on disk is byte-identical to the garbage that
//       was there before (proves it was skipped, not rewritten as "first call")
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t43');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const dir = join(stateRoot(tmp), 'S43');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'A1.json');
  const garbage = '{not valid json at all';
  writeFileSync(file, garbage);
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S43', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), env);
  const out = safeParse(r.stdout);
  const raw = readFileSync(file, 'utf8');

  check('43-exit-code', r.status, 0, 'unreadable-state call must exit 0');
  check('43-output-empty', out, {}, 'a present-but-unparsable state file must be skipped, not treated as first call');
  check('43-file-untouched', raw, garbage, 'clock must not reset: the unparsable file must be left byte-identical, not overwritten with a fresh start');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 44: atomic write -- no *.tmp leftovers survive a normal run
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t44');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const stdin = JSON.stringify({
    session_id: 'S44', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  run(GUARD_MJS, stdin, env); // creates state
  writeState(tmp, 'S44', 'A1', { ...stateStartMinutesAgo(17), warned: false, expired: false });
  run(GUARD_MJS, stdin, env); // triggers the warn transition (a second save)

  const dir = join(stateRoot(tmp), 'S44');
  const entries = readdirSync(dir).sort();

  check('44-only-state-file-remains', entries, ['A1.json'], 'after two guard calls including a warn-transition write, only the state file may remain, no *.tmp leftovers');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 45: atomic write -- concurrent processes do not corrupt the state file
// GIVEN: two guard processes launched truly concurrently (async spawn) against
//        the same warn-zone state file
// WHEN: both race to save via temp-file + rename
// THEN: both exit 0; the final file always parses to a complete, well-shaped
//       object (never a torn/partial write); no *.tmp file survives
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t45');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { ...stateStartMinutesAgo(17), warned: false, expired: false };
  writeState(tmp, 'S45', 'A1', seeded);
  const stdin = JSON.stringify({
    session_id: 'S45', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });

  const [r1, r2] = await Promise.all([
    runAsync(GUARD_MJS, stdin, env),
    runAsync(GUARD_MJS, stdin, env),
  ]);

  const state = readState(tmp, 'S45', 'A1');
  const shapeOk = state !== null
    && typeof state.start === 'number'
    && typeof state.warned === 'boolean'
    && typeof state.expired === 'boolean';
  const dir = join(stateRoot(tmp), 'S45');
  const tmpLeftovers = readdirSync(dir).filter((n) => n.endsWith('.tmp'));

  check('45-both-processes-exit-0', [r1.status, r2.status], [0, 0], 'two concurrent guard invocations on the same state file must both exit 0');
  check('45-state-shape-intact', shapeOk, true, 'concurrent renames must never leave a torn/partial file: final state still parses to {start:number,warned:boolean,expired:boolean}');
  check('45-state-key-count', Object.keys(state).length, 3, 'concurrent writers must not add or drop keys');
  check('45-no-tmp-leftover', tmpLeftovers, [], 'no *.tmp file may survive two concurrent renames onto the same path');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 46: FINALIZE_LIST / FINALIZE_TOOLS / HARD_STOP_TOOLS / hardExpiredContext
//          source-vs-test sync guard
// GIVEN: the suite's own FINALIZE_LIST / FINALIZE_TOOLS / HARD_STOP_LIST mirrors
//        and hardExpiredContext function, used to build every verbatim
//        directive-text assertion above
// WHEN: the source file's literal constants and hardExpiredContext function
//       body are extracted by regex
// THEN: they must equal the suite's mirrors exactly, or every directive-text
//       assertion in this suite (including test 47's per-tool coverage) is
//       silently checking stale text -- deleting any one of the 10
//       FINALIZE_TOOLS entries in the source, or letting hardExpiredContext's
//       wording drift from the allow-branch's actual reply, must fail here
// ─────────────────────────────────────────────────────────────────────────────
{
  const guardSource = readFileSync(GUARD_MJS, 'utf8');
  const suiteSource = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const finalizeMatch = guardSource.match(/const FINALIZE_LIST = '([^']*)';/);
  const hardStopMatch = guardSource.match(/const HARD_STOP_TOOLS = new Set\(\[([^\]]*)\]\);/);
  const finalizeToolsMatch = guardSource.match(/const FINALIZE_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
  const sourceFinalizeList = finalizeMatch ? finalizeMatch[1] : null;
  const sourceHardStopTools = hardStopMatch ? extractStringArray(hardStopMatch[1]) : null;
  const sourceFinalizeTools = finalizeToolsMatch ? extractStringArray(finalizeToolsMatch[1]) : null;

  const extractFn = (source, name) => {
    const m = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
    return m ? m[0] : null;
  };
  const sourceHardExpiredFn = extractFn(guardSource, 'hardExpiredContext');
  const suiteHardExpiredFn = extractFn(suiteSource, 'hardExpiredContext');

  check('46-finalize-list-in-sync', sourceFinalizeList, FINALIZE_LIST, 'suite FINALIZE_LIST mirror must equal the source literal verbatim');
  check('46-hard-stop-tools-in-sync', sourceHardStopTools, ['Write', 'Edit'], 'suite HARD_STOP_LIST mirror (Write, Edit) must equal the source HARD_STOP_TOOLS set verbatim');
  check('46-finalize-tools-in-sync', sourceFinalizeTools, FINALIZE_TOOLS, 'suite FINALIZE_TOOLS mirror must equal the full 10-entry source allow-set verbatim, including the unadvertised TaskCreate/BashOutput/TaskOutput/MultiEdit/NotebookEdit/TaskUpdate members');
  check('46-hard-expired-context-in-sync', sourceHardExpiredFn, suiteHardExpiredFn, 'suite hardExpiredContext mirror must equal the source function body verbatim, or the hard-stop allow-branch text is silently checked against stale wording');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 47: every FINALIZE_TOOLS element is actually allowed past 100% budget
//          (below the hard stop); a representative denied-tool sample is
//          actually blocked
// GIVEN: ratio=1.25 (elapsed=25min/20min budget), below the default
//        hardStopRatio (2x), expired:false, one fresh agent per tool under test
// WHEN: guard runs once for every FINALIZE_TOOLS member (source-synced mirror,
//       see test 46), and once for each of a denied-tool sample
//       (Bash, Grep, WebFetch, AskUserQuestion, Agent, Skill)
// THEN: every FINALIZE_TOOLS member gets the plain expiredContext notice, no
//       permissionDecision key; every denied-sample tool gets
//       permissionDecision deny with the regular denyText -- this is the check
//       that catches a regression in any of the 6 elements (MultiEdit,
//       NotebookEdit, TaskUpdate, TaskCreate, BashOutput, TaskOutput) that no
//       other test in this suite exercises, and confirms AskUserQuestion stays
//       blocked
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env, tmp } = newRoot('t47');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const elapsedMin = elapsedMinFor(25 * 60000);

  for (const tool of FINALIZE_TOOLS) {
    const agentId = `allow-${tool}`;
    writeState(tmp, 'S47', agentId, { ...stateStartMinutesAgo(25), warned: true, expired: false });
    const r = run(GUARD_MJS, JSON.stringify({
      session_id: 'S47', cwd: proj, agent_id: agentId, agent_type: 'tester',
      hook_event_name: 'PreToolUse', tool_name: tool, tool_input: {},
    }), env);
    const out = safeParse(r.stdout);
    const expected = {
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: expiredContext(elapsedMin, 20) },
    };
    check(`47-allow-${tool}`, out, expected, `${tool} must be in the surviving finalize set past 100% budget (below hard stop)`);
  }

  const deniedSample = ['Bash', 'Grep', 'WebFetch', 'AskUserQuestion', 'Agent', 'Skill'];
  for (const tool of deniedSample) {
    const agentId = `deny-${tool}`;
    writeState(tmp, 'S47', agentId, { ...stateStartMinutesAgo(25), warned: true, expired: false });
    const r = run(GUARD_MJS, JSON.stringify({
      session_id: 'S47', cwd: proj, agent_id: agentId, agent_type: 'tester',
      hook_event_name: 'PreToolUse', tool_name: tool, tool_input: {},
    }), env);
    const out = safeParse(r.stdout);
    const expected = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText(tool, elapsedMin, 20),
      },
    };
    check(`47-deny-${tool}`, out, expected, `${tool} must remain blocked past 100% budget (below hard stop)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────
try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== agent-deadline E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
