#!/usr/bin/env node
// E2E suite for agent-deadline hooks (guard + cleanup) in isolated TEMP HOME + TMPDIR (os.tmpdir()/os.homedir() respect them),
// never touches real ~/.claude, /tmp or repo. Every check: unconditional exact-equality/size/type with a description, no gating branches.
import { spawnSync, spawn } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  symlinkSync, lstatSync, statSync, chmodSync, chownSync, readdirSync, utimesSync,
  realpathSync,
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
/** Child env minus the profile/clock variables the hooks read, unless the test sets them. */
function childEnv(env) {
  const scrubbed = new Set(['CLAUDE_CONFIG_DIR', 'CLAUDE_PROJECT_DIR', 'AGENT_DEADLINE_NOW']);
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !scrubbed.has(key)));
  return { ...inherited, ...env };
}

function run(script, stdinStr, env) {
  const r = spawnSync(process.execPath, [script], {
    input: stdinStr,
    encoding: 'utf8',
    env: childEnv(env),
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

// Fixed clock for exact-value tests, passed to the hooks as AGENT_DEADLINE_NOW. In the
// past on purpose: files written during a run then never look older than the clock.
const NOW = 1700000000000;

/** The governing-config path a fresh state records for a project config. */
function configPathOf(projectRoot) {
  return join(realpathSync(join(projectRoot, '.claude')), 'agent-deadline.json');
}

/** Sorted entry names; a missing dir reads as [] so a regression fails an assert, not the run. */
function listDir(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function setMtime(file, epochMs) {
  const t = new Date(epochMs);
  utimesSync(file, t, t);
}

// Payload shapes captured live on CC 2.1.296 in auto mode; only cwd and ids vary.
function handbackPayload(cwd, sessionId, agentId, agentType) {
  return {
    session_id: sessionId, transcript_path: `/transcripts/${sessionId}.jsonl`, cwd,
    prompt_id: 'ebc50d83-4973-48b3-8845-b6f73ca394d3', permission_mode: 'auto',
    agent_id: agentId, agent_type: agentType, effort: { level: 'medium' },
    hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback',
    tool_input: { message: 'alpha\n\n1. alpha-1\n2. alpha-2' }, tool_use_id: 'toolu_015AR2T6cBmqhVuLXvMxnMvk',
  };
}

function subagentStopPayload(cwd, sessionId, agentId, agentType, stopHookActive) {
  return {
    session_id: sessionId, transcript_path: `/transcripts/${sessionId}.jsonl`, cwd,
    prompt_id: 'a0573975-97f8-4cf3-bc66-6f0c5824a6ff', permission_mode: 'auto',
    agent_id: agentId, agent_type: agentType, effort: { level: 'medium' },
    hook_event_name: 'SubagentStop', stop_hook_active: stopHookActive,
    agent_transcript_path: `/transcripts/${sessionId}/subagents/agent-${agentId}.jsonl`,
    background_tasks: [], session_crons: [],
  };
}

// ── expected-text builders, copied verbatim from the source templates ──────
const FINALIZE_LIST = 'Read, Write, Edit, NotebookEdit, TodoWrite, TaskUpdate, SubagentHandback';

// Mirrors source FINALIZE_TOOLS Set verbatim: full allow-set incl. the member left off FINALIZE_LIST (advertised text).
// Test 46 pins it against the source; test 47 exercises every member.
const FINALIZE_TOOLS = [
  'Read', 'Write', 'Edit', 'NotebookEdit', 'TodoWrite',
  'TaskUpdate', 'TaskCreate', 'SubagentHandback',
];

function elapsedMinFor(ms) {
  const rawMin = Math.max(0, ms / 60000);
  return rawMin >= 10 ? Math.round(rawMin) : Math.round(rawMin * 10) / 10;
}

function closing(readOnly) {
  return readOnly
    ? 'Return what you have now as your final report: what was done, what was not done, next steps.'
    : 'Save what you have to a file if the task expects one, then return your final report: ' +
        'what was done, what was not done, next steps.';
}

function warnText(elapsedMin, budget, readOnly) {
  return (
    `Time budget notice (agent-deadline hook): ${elapsedMin} of ${budget} min used. ` +
    `Finish the step in flight and prepare your final report. ` +
    (readOnly ? '' : `Save results you already have to a file if the task expects one. `) +
    `Once the budget is spent, only these tools stay available: ${FINALIZE_LIST}.`
  );
}

function expiredContext(elapsedMin, budget, readOnly) {
  return (
    `Time budget spent (${elapsedMin} of ${budget} min; agent-deadline hook). ` +
    `Still available: ${FINALIZE_LIST}. ${closing(readOnly)}`
  );
}

function denyText(toolName, elapsedMin, budget, readOnly) {
  return (
    `Time budget spent (${elapsedMin} of ${budget} min; agent-deadline hook), so "${toolName}" ` +
    `is blocked and a retry will be blocked too. Still available: ${FINALIZE_LIST}. ` +
    closing(readOnly)
  );
}

/** Mirrors the source's safeSegment sanitizer, used to compute expected paths. */
function sanitize(s) {
  const clean = s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return clean && clean !== '.' && clean !== '..' ? clean : null;
}

// Mirrors the source's HARD_STOP_TOOLS/hardDenyText verbatim.
const HARD_STOP_LIST = 'Write, Edit, SubagentHandback';
function hardDenyText(toolName, elapsedMin, budget, readOnly) {
  return (
    `Time budget far exceeded (${elapsedMin} of ${budget} min; agent-deadline hook), so ` +
    `"${toolName}" is blocked and a retry will be blocked too. Still available: ` +
    `${HARD_STOP_LIST}. ${closing(readOnly)}`
  );
}

// Mirrors source hardExpiredContext verbatim; function form so test 46 diffs its body vs the source by regex,
// as FINALIZE_LIST/HARD_STOP_TOOLS are pinned.
function hardExpiredContext(elapsedMin, budget, readOnly) {
  return (
    `Time budget far exceeded (${elapsedMin} of ${budget} min; agent-deadline hook). ` +
    `Still available: ${HARD_STOP_LIST}. ${closing(readOnly)}`
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
    const child = spawn(process.execPath, [script], { env: childEnv(env) });
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

// Test 01: main session (no agent_id) -> no-op
// GIVEN PreToolUse without agent_id/agent_type | WHEN guard runs | THEN {}, exit 0, no state dir created
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

// Test 02: first tool call of a subagent -> state created, silent pass
// GIVEN enabled config, fresh agent/session, no state | WHEN guard runs once | THEN {}; state = {start: call clock, warned/expired false, config: governing project config}
{
  const { proj, env, tmp } = newRoot('t02');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const stdin = JSON.stringify({
    session_id: 'S02', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  });
  const r = run(GUARD_MJS, stdin, { ...env, AGENT_DEADLINE_NOW: String(NOW) });
  const out = safeParse(r.stdout);

  check('02-exit-code', r.status, 0, 'first call must exit 0');
  check('02-output-empty', out, {}, 'first call is silent (no warning yet)');
  check('02-fresh-state', readState(tmp, 'S02', 'A1'),
    { start: NOW, warned: false, expired: false, config: configPathOf(proj) },
    'fresh state starts at the call clock, unwarned/unexpired, and names its config');
}

// Test 03: ~50% of budget -> silence, state untouched
// GIVEN elapsed=10min of 20min (ratio 0.5) | WHEN guard runs | THEN {}; state byte-identical to seed
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

// Test 04: >=80% budget, first time -> exactly one non-blocking warning
// GIVEN elapsed=16.5min of 20min (ratio 0.825) | WHEN guard runs | THEN exact additionalContext warn; warned:true, expired:false, start unchanged
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

// Test 05: >=80% budget, already warned -> silence, no duplicate warning
// GIVEN elapsed=17min/20min, warned:true | WHEN guard runs | THEN {}; state byte-identical to seed
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

// Test 06: >=100% budget, Bash -> hard deny
// GIVEN elapsed=25min/20min (ratio 1.25), not expired | WHEN guard runs Bash | THEN exact permissionDecision:"deny"; expired:true, warned:true
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

// Test 07: >=100% budget, Read (finalize tool), first time -> expiry notice, no deny
// GIVEN elapsed=25min/20min, expired:false | WHEN guard runs Read | THEN additionalContext expiry notice, no permissionDecision; expired:true, warned:true
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

// Test 08: >=100% budget, Write/Edit (finalize tool), repeat -> fully silent pass
// GIVEN state expired:true | WHEN guard runs Write, then Edit | THEN {} both times; state untouched
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

// Test 09: enabled:false -> no-op, no state ever created
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

// Test 10: no config file anywhere -> no-op, no state created
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

// Test 11: malformed project config JSON, no global config -> fail-open no-op
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

// Test 12: byAgentType override takes priority over defaultMinutes
// GIVEN defaultMinutes=20, byAgentType.tester=5, elapsed=4.5min (90% of 5, 22.5% of 20) | WHEN agent_type "tester" | THEN warning embeds budget=5
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

// Test 13: byAgentType non-matching key -> silent fallback to defaultMinutes
// GIVEN byAgentType.other=5, defaultMinutes=20, elapsed=17min (85% of 20, 340% of 5: deny if 5 leaked) | WHEN "tester" | THEN warning embeds budget=20
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

// Test 14: path traversal in agent_id stays contained under the state root
// GIVEN agent_id="../../etc/passwd" | WHEN guard runs | THEN source-regex sanitized segment is one path component, file exactly in <root>/<session>/
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

// Test 15: path traversal in session_id stays contained under the state root
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

// Test 16: agent_id that sanitizes to exactly ".." or "." is rejected -> no-op
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

// Test 17: project config wins over global config
// GIVEN project defaultMinutes=5, global defaultMinutes=100, elapsed=4.5min | WHEN guard runs | THEN warning embeds budget=5 (project precedence)
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

// Test 18: cleanup hook stamps the stopped agent's state, creates nothing else
// GIVEN state for A1, none for A2, killed guard's temp of A1 | WHEN SubagentStop for A1, then A2 | THEN A1 keeps clock + gains `stopped`; A2 no file; temp gone
{
  const { tmp, env } = newRoot('t18');
  const seeded = { start: NOW - 60000, warned: false, expired: false };
  writeState(tmp, 'S18', 'A1', seeded);
  const dir = join(stateRoot(tmp), 'S18');
  writeFileSync(join(dir, 'A1.json.4242.tmp'), '{"start":');
  const clock = { ...env, AGENT_DEADLINE_NOW: String(NOW) };

  const r = run(CLEANUP_MJS, JSON.stringify({ session_id: 'S18', agent_id: 'A1', agent_type: 'tester' }), clock);
  const r2 = run(CLEANUP_MJS, JSON.stringify({ session_id: 'S18', agent_id: 'A2', agent_type: 'tester' }), clock);
  check('18-exit-code', [r.status, r2.status], [0, 0], 'cleanup hook must exit 0');
  check('18-output-empty', [safeParse(r.stdout), safeParse(r2.stdout)], [{}, {}], 'cleanup hook always emits {}');
  check('18-state-stamped-not-deleted', readState(tmp, 'S18', 'A1'), { ...seeded, stopped: NOW }, 'SubagentStop keeps the clock and adds the stop time');
  check('18-session-dir-entries', listDir(dir), ['A1.json'], 'no state is created for an agent without one, and the temp file is dropped');
}

// Test 19: parallel subagents in the same session keep independent clocks
// GIVEN A1 rewritten to 85% elapsed, A2 fresh (0%) | WHEN guard runs per agent | THEN A1 warns; A2 silent and unwarned
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

// Test 20: empty / garbage stdin -> fail open, exit 0, no-op
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

// Test 21: hardStopRatio default (2x) not reached -> normal finalize set + normal soft deny
// GIVEN ratio=1.5 (30min/20min) | WHEN TodoWrite on one agent, Bash on another | THEN TodoWrite: plain expiredContext; Bash: soft denyText, not hardDenyText
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

// Test 22: hardStopRatio default (2x) reached -> allow-list narrows to Write/Edit
// GIVEN ratio=2.0 (40min/20min), expired:true/warned:true, fresh notice mtime (no first-crossing branch) | THEN Read/TodoWrite hard-denied; Write/Edit silent, state untouched
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

// Test 23: hard-stop deny text is a different template than the regular deny text
// GIVEN Bash, first crossing (expired:false), ratio=1.5 (soft) vs 2.25 (hard) | THEN denyText() and hardDenyText() verbatim, two distinct templates
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

// Test 24: config hardStopRatio=1.5 honored both ways: ratio 1.6 (32min/20min) hard-stopped below default 2x; 1.2 (24min/20min) soft band past 100%
// THEN 1.6: Read (!HARD_STOP_TOOLS) hard-denied, Write gets hardExpiredContext; 1.2: Write plain expiredContext: allow branch pins soft/hard boundary too
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

// Test 25: invalid hardStopRatio (<=1) rolls back to the default (2)
// GIVEN hardStopRatio=1 and hardStopRatio=-3, ratio=1.5 | WHEN Bash under each | THEN both soft denyText: neither became an early hard stop
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

// Test 26: renotice -- a fresh notice (younger than RENOTICE_RATIO) stays silent
// GIVEN ratio 0.85, warned:true, notice backdated 1m50s (renoticeMs = 10% of 20min = 2min) | WHEN guard runs | THEN {}; state byte-identical
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

// Test 27: renotice -- a stale notice (older than RENOTICE_RATIO) repeats the warning
// GIVEN ratio 0.85, warned:true, notice backdated 2m10s | WHEN guard runs | THEN exact warnText again; expired/start untouched
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

// Test 28: renotice -- a stale expiry notice repeats past the deadline too
// GIVEN ratio 1.25, expired:true, notice backdated 2m10s | WHEN finalize tool (Read) | THEN exact expiredContext again; state unchanged
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

// Test 29: config walk-up -- cwd nested repo/a/b/c finds the repo-root config
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

// Test 30: a broken intermediate config does not shadow a valid ancestor config
// GIVEN valid root config, invalid JSON at repo/mid, cwd = repo/mid/leaf | WHEN guard runs | THEN walk passes mid, uses root budget
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

// Test 31: config walk-up depth limit -- cwd 15 levels below the config is within climb range
// GIVEN config at depth 0; MAX_CONFIG_CLIMB=16 checks depths 0..15 (cwd + 15 ancestors), so the climb reaches depth 0
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

// Test 32: config walk-up depth limit -- NOT found at depth 16
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

// Test 33: state root safety -- a symlinked state root is refused, victim intact
// GIVEN STATE_ROOT = symlink to a "victim" dir | WHEN first call | THEN {} (fail open); victim untouched, nothing written through, symlink kept
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

// Test 34: state root safety -- an over-permissive root (0755) is healed to 0700
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

// Test 35: state root safety -- a root owned by a foreign uid is skipped
// Needs root to chown to another uid; non-root run (common case) -> labeled SKIP
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

// Test 36: a start timestamp in the future is clamped to now
// GIVEN start = now + 10min (clock jump, hand-edit, restored snapshot) | THEN {} (elapsed 0); start = call clock; warned/expired untouched
{
  const { proj, env, tmp } = newRoot('t36');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  writeState(tmp, 'S36', 'A1', { start: NOW + 600000, warned: false, expired: false });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S36', cwd: proj, agent_id: 'A1', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), { ...env, AGENT_DEADLINE_NOW: String(NOW) });
  const out = safeParse(r.stdout);

  check('36-exit-code', r.status, 0, 'future-start call must exit 0');
  check('36-output-empty', out, {}, 'clamped elapsed is 0, below the warn threshold, so the call is silent');
  check('36-start-clamped-to-now', readState(tmp, 'S36', 'A1'), { start: NOW, warned: false, expired: false },
    'a future start is rewritten to the call clock; the clamp touches only start');
}

// Test 37: clamp persists -- a later call computes the deadline from the corrected start, not the future one
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

// Test 38: a numeric agent_id is coerced to a string, state is written
{
  const { proj, env, tmp } = newRoot('t38');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const r = run(GUARD_MJS, JSON.stringify({
    session_id: 'S38', cwd: proj, agent_id: 12345, agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), { ...env, AGENT_DEADLINE_NOW: String(NOW) });
  const out = safeParse(r.stdout);

  check('38-exit-code', r.status, 0, 'numeric agent_id first call must exit 0');
  check('38-output-empty', out, {}, 'first call for a numeric agent_id is silent, same as a string id');
  check('38-state-at-coerced-path', readState(tmp, 'S38', '12345'),
    { start: NOW, warned: false, expired: false, config: configPathOf(proj) },
    'numeric agent_id 12345 is coerced to the path segment "12345" and gets a fresh state');
}

// Test 39: a numeric agent_id enforces the deadline end-to-end (deny fires)
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

// Test 40: agent_type="" -> treated as main session (both fields required)
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

// Test 41: agent_type="   " (whitespace only) -> treated as main session
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

// Test 42: agent_type absent entirely -> treated as main session
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

// Test 43: a present-but-unparsable state file is skipped, clock is NOT reset
// GIVEN state file with invalid JSON | WHEN guard runs | THEN {}; file byte-identical (skipped, not rewritten as "first call")
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

// Test 44: atomic write -- no *.tmp leftovers survive a normal run
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

// Test 45: atomic write -- concurrent processes do not corrupt the state file
// GIVEN 2 truly concurrent guards (async spawn), temp-file + rename | THEN both exit 0; final file well-shaped, never torn/partial; no *.tmp
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

// Test 46: source-vs-test sync: regex-extracted FINALIZE_LIST, FINALIZE_TOOLS, HARD_STOP_TOOLS, hardExpiredContext body == suite mirrors
// Else every directive-text assert (incl. test 47) checks stale text: dropping any of 8 FINALIZE_TOOLS or hardExpiredContext drift fails here
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
  check('46-hard-stop-tools-in-sync', sourceHardStopTools, ['Write', 'Edit', 'SubagentHandback'], 'suite HARD_STOP_LIST mirror (Write, Edit, SubagentHandback) must equal the source HARD_STOP_TOOLS set verbatim');
  check('46-finalize-tools-in-sync', sourceFinalizeTools, FINALIZE_TOOLS, 'suite FINALIZE_TOOLS mirror must equal the full 8-entry source allow-set verbatim, including the unadvertised TaskCreate');
  check('46-removed-tools-absent', ['TaskOutput', 'BashOutput', 'MultiEdit'].filter((name) => guardSource.includes(name)), [], 'tool names Claude Code no longer has must not reappear in the guard');
  check('46-hard-expired-context-in-sync', sourceHardExpiredFn, suiteHardExpiredFn, 'suite hardExpiredContext mirror must equal the source function body verbatim, or the hard-stop allow-branch text is silently checked against stale wording');
}

// Test 47: past 100% below hard stop (ratio=1.25, 25min/20min, default 2x), one fresh agent per tool: every FINALIZE_TOOLS member allowed
// THEN plain expiredContext, no permissionDecision; denied sample gets denyText; sole cover of 3 (NotebookEdit, TaskUpdate, TaskCreate), AskUserQuestion blocked
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

// Test 48: the report call passes at every phase (warn / finalize / hard stop)
// GIVEN 85%, 125%, 225% of 20min, first crossing, fixed clock, live SubagentHandback payload | THEN phase notice, never a deny; state records phase
{
  const { proj, env, tmp } = newRoot('t48');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const clock = { ...env, AGENT_DEADLINE_NOW: String(NOW) };
  const phases = [
    { id: 'warn', minutes: 17, seeded: { warned: false, expired: false }, after: { warned: true, expired: false }, text: warnText(17, 20) },
    { id: 'finalize', minutes: 25, seeded: { warned: true, expired: false }, after: { warned: true, expired: true }, text: expiredContext(25, 20) },
    { id: 'hard-stop', minutes: 45, seeded: { warned: true, expired: false }, after: { warned: true, expired: true }, text: hardExpiredContext(45, 20) },
  ];
  for (const phase of phases) {
    const start = NOW - phase.minutes * 60000;
    writeState(tmp, 'S48', phase.id, { start, ...phase.seeded });
    const r = run(GUARD_MJS, JSON.stringify(handbackPayload(proj, 'S48', phase.id, 'general-purpose')), clock);
    check(`48-${phase.id}-handback-not-denied`, safeParse(r.stdout),
      { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: phase.text } },
      `SubagentHandback at the ${phase.id} phase carries the notice and no permissionDecision`);
    check(`48-${phase.id}-state`, readState(tmp, 'S48', phase.id), { start, ...phase.after },
      `state after the ${phase.id} hand-back keeps the clock and records the phase`);
  }
}

// Test 49: state survives SubagentStop; same agent_id resumes its budget (25min of 20min, expired)
// WHEN stop (blocked by another hook), Bash 3 s later, stop with stop_hook_active:true | THEN stamp `stopped`; Bash denied on ORIGINAL clock, clears it; re-stamp
{
  const { proj, env, tmp } = newRoot('t49');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const seeded = { start: NOW - 25 * 60000, warned: true, expired: true, config: configPathOf(proj) };
  writeState(tmp, 'S49', 'A1', seeded);

  const rStop1 = run(CLEANUP_MJS, JSON.stringify(subagentStopPayload(proj, 'S49', 'A1', 'general-purpose', false)),
    { ...env, AGENT_DEADLINE_NOW: String(NOW) });
  const afterStop1 = readState(tmp, 'S49', 'A1');

  const rBash = run(GUARD_MJS, JSON.stringify({
    session_id: 'S49', cwd: proj, agent_id: 'A1', agent_type: 'general-purpose',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo probe-ok' },
  }), { ...env, AGENT_DEADLINE_NOW: String(NOW + 3000) });
  const afterBash = readState(tmp, 'S49', 'A1');

  const rStop2 = run(CLEANUP_MJS, JSON.stringify(subagentStopPayload(proj, 'S49', 'A1', 'general-purpose', true)),
    { ...env, AGENT_DEADLINE_NOW: String(NOW + 4000) });
  const afterStop2 = readState(tmp, 'S49', 'A1');

  check('49-stop-output', [safeParse(rStop1.stdout), safeParse(rStop2.stdout)], [{}, {}], 'the SubagentStop hook never blocks a stop');
  check('49-first-stop-stamps-state', afterStop1, { ...seeded, stopped: NOW }, 'first SubagentStop keeps start/warned/expired and adds the stop time');
  check('49-continue-is-denied-on-original-clock', safeParse(rBash.stdout),
    { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: denyText('Bash', 25, 20) } },
    'a tool call 3 s after the stop is still over the ORIGINAL budget, not on a fresh one');
  check('49-continue-clears-mark', afterBash, seeded, 'the continued call removes only the stop mark');
  check('49-second-stop-stamps-again', afterStop2, { ...seeded, stopped: NOW + 4000 }, 'second SubagentStop of the same agent_id stamps the new stop time');
}

// Test 50: resume grace boundary -- 1 ms inside continues, exactly at it restarts
// GIVEN expired agents stopped 299999 ms and 300000 ms ago (grace = 5 min) | THEN first denied on original clock; second gets a fresh window
{
  const { proj, env, tmp } = newRoot('t50');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const clock = { ...env, AGENT_DEADLINE_NOW: String(NOW) };
  const base = { start: NOW - 40 * 60000, warned: true, expired: true, config: configPathOf(proj) };
  writeState(tmp, 'S50', 'inside', { ...base, stopped: NOW - 299999 });
  writeState(tmp, 'S50', 'outside', { ...base, stopped: NOW - 300000 });
  const call = (agentId) => run(GUARD_MJS, JSON.stringify({
    session_id: 'S50', cwd: proj, agent_id: agentId, agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), clock);
  const outInside = safeParse(call('inside').stdout);
  const outOutside = safeParse(call('outside').stdout);

  check('50-inside-grace-denied', outInside,
    { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: hardDenyText('Bash', 40, 20) } },
    'a stop mark 299999 ms old continues the original clock');
  check('50-inside-grace-state', readState(tmp, 'S50', 'inside'), base, 'continuing inside the grace only drops the mark');
  check('50-outside-grace-silent', outOutside, {}, 'a stop mark 300000 ms old starts a fresh window, so the call passes');
  check('50-outside-grace-state', readState(tmp, 'S50', 'outside'),
    { start: NOW, warned: false, expired: false, config: configPathOf(proj) }, 'a late resume restarts the clock at the resuming call');
}

// Test 51: SubagentStop prunes by age: silent live agent, stop mark inside grace, one past it, day-old orphan; day-old and younger session dirs
// THEN only the dead mark, the orphan and the day-old session dir are removed
{
  const { proj, env, tmp } = newRoot('t51');
  const day = 24 * 60 * 60 * 1000;
  const live = { start: NOW - 10 * 60000, warned: false, expired: false };
  const seed = (agentId, state, ageMs) => {
    writeState(tmp, 'S51', agentId, state);
    setMtime(stateFilePath(tmp, 'S51', agentId), NOW - ageMs);
  };
  seed('live-silent', live, 10 * 60000);
  seed('stopped-recent', { ...live, stopped: NOW - 299999 }, 301000);
  seed('stopped-dead', { ...live, stopped: NOW - 300000 }, 301000);
  seed('orphan', live, day + 1000);
  seed('self', live, 1000);
  writeState(tmp, 'S-old', 'A1', live);
  setMtime(join(stateRoot(tmp), 'S-old'), NOW - day - 1000);
  writeState(tmp, 'S-young', 'A1', live);
  setMtime(join(stateRoot(tmp), 'S-young'), NOW - day + 1000);

  const r = run(CLEANUP_MJS, JSON.stringify(subagentStopPayload(proj, 'S51', 'self', 'tester', false)),
    { ...env, AGENT_DEADLINE_NOW: String(NOW) });

  check('51-output', safeParse(r.stdout), {}, 'pruning never changes the hook output');
  check('51-session-files', listDir(join(stateRoot(tmp), 'S51')),
    ['live-silent.json', 'self.json', 'stopped-recent.json'], 'dead stop mark and day-old orphan are removed, live state stays');
  check('51-session-dirs', listDir(stateRoot(tmp)), ['S-young', 'S51'], 'only the session dir older than a day is removed');
}

// Test 52: pruning work is bounded per invocation: 70 dead stop marks (PRUNE_MAX = 64), cleanup twice for a stateless agent
// THEN first run removes exactly 64, second the remaining 6 and the dir
{
  const { proj, env, tmp } = newRoot('t52');
  const clock = { ...env, AGENT_DEADLINE_NOW: String(NOW) };
  for (let i = 0; i < 70; i++) {
    writeState(tmp, 'S52', `dead-${i}`, { start: NOW - 60 * 60000, warned: true, expired: true, stopped: NOW - 600000 });
    setMtime(stateFilePath(tmp, 'S52', `dead-${i}`), NOW - 600000);
  }
  const stdin = JSON.stringify(subagentStopPayload(proj, 'S52', 'no-state', 'tester', false));
  run(CLEANUP_MJS, stdin, clock);
  const leftAfterFirst = listDir(join(stateRoot(tmp), 'S52')).length;
  run(CLEANUP_MJS, stdin, clock);

  check('52-first-run-bounded', leftAfterFirst, 6, 'one invocation examines 64 entries, so 6 of 70 dead files remain');
  check('52-second-run-finishes', existsSync(join(stateRoot(tmp), 'S52')), false, 'the next invocation removes the rest and the empty session dir');
}

// Test 53: a read-only agent is never told to write a file: default (Explore, Plan) vs config listing only "tester"; 85% and 125% of 20min
// WHEN Bash for Explore and tester per config | THEN listed type gets "Return what you have now", the other the file text
{
  const { proj, env, tmp } = newRoot('t53');
  writeConfig(proj, { enabled: true, defaultMinutes: 20, byAgentType: {} });
  const proj2 = join(BASE, 't53-proj2');
  writeConfig(proj2, { enabled: true, defaultMinutes: 20, byAgentType: {}, readOnlyAgentTypes: ['tester'] });
  const clock = { ...env, AGENT_DEADLINE_NOW: String(NOW) };
  const call = (cwd, sessionId, agentType, minutes) => {
    writeState(tmp, sessionId, agentType, { start: NOW - minutes * 60000, warned: false, expired: false });
    return safeParse(run(GUARD_MJS, JSON.stringify({
      session_id: sessionId, cwd, agent_id: agentType, agent_type: agentType,
      hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
    }), clock).stdout);
  };
  const deny = (text) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: text } });

  check('53-default-explore-warn', call(proj, 'S53w', 'Explore', 17),
    { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(17, 20, true) } },
    'Explore is read-only by default: the warning has no save-to-file sentence');
  check('53-default-explore-deny', call(proj, 'S53d', 'Explore', 25), deny(denyText('Bash', 25, 20, true)),
    'Explore is read-only by default: the deny says return what you have now');
  check('53-default-explore-hard-deny', call(proj, 'S53h', 'Explore', 45), deny(hardDenyText('Bash', 45, 20, true)),
    'the hard-stop deny for a read-only agent has no write-to-file order either');
  check('53-default-tester-deny', call(proj, 'S53d', 'tester', 25), deny(denyText('Bash', 25, 20, false)),
    'an unlisted type keeps the save-to-file text');
  check('53-config-list-tester-deny', call(proj2, 'S53c', 'tester', 25), deny(denyText('Bash', 25, 20, true)),
    'readOnlyAgentTypes in the config marks tester read-only');
  check('53-config-list-replaces-default', call(proj2, 'S53c', 'Explore', 25), deny(denyText('Bash', 25, 20, false)),
    'a config list replaces the default list, so Explore is no longer read-only');
  check('53-read-only-text', closing(true), 'Return what you have now as your final report: what was done, what was not done, next steps.',
    'the read-only closing sentence, pinned literally');
}

// Test 54: global config follows CLAUDE_CONFIG_DIR; project under $HOME without config, $HOME/.claude 100min, profile 5min, empty profile
// THEN set -> 5min (climb through $HOME does not outrank it); unset -> 100min; empty -> $HOME/.claude read last; first call records profile config
{
  const { home, env, tmp } = newRoot('t54');
  const cwd = join(home, 'work', 'repo');
  const profile = join(BASE, 't54-profile');
  const emptyProfile = join(BASE, 't54-empty-profile');
  for (const dir of [cwd, profile, emptyProfile]) mkdirSync(dir, { recursive: true });
  writeConfig(home, { enabled: true, defaultMinutes: 100, byAgentType: {} });
  writeFileSync(join(profile, 'agent-deadline.json'), JSON.stringify({ enabled: true, defaultMinutes: 5, byAgentType: {} }));
  const call = (agentId, minutes, extraEnv) => {
    writeState(tmp, 'S54', agentId, { start: NOW - minutes * 60000, warned: false, expired: false });
    return safeParse(run(GUARD_MJS, JSON.stringify({
      session_id: 'S54', cwd, agent_id: agentId, agent_type: 'tester',
      hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
    }), { ...env, AGENT_DEADLINE_NOW: String(NOW), ...extraEnv }).stdout);
  };
  const warn = (elapsedMin, budget) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: warnText(elapsedMin, budget) } });
  const outSet = call('set', 4.5, { CLAUDE_CONFIG_DIR: profile });
  const outUnset = call('unset', 85, {});
  const outEmpty = call('empty', 85, { CLAUDE_CONFIG_DIR: emptyProfile });
  run(GUARD_MJS, JSON.stringify({
    session_id: 'S54', cwd, agent_id: 'first', agent_type: 'tester',
    hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {},
  }), { ...env, AGENT_DEADLINE_NOW: String(NOW), CLAUDE_CONFIG_DIR: profile });

  check('54-config-dir-set', outSet, warn(4.5, 5), 'CLAUDE_CONFIG_DIR set: the profile config (5min) wins over $HOME/.claude on the climb');
  check('54-config-dir-unset', outUnset, warn(85, 100), 'CLAUDE_CONFIG_DIR unset: $HOME/.claude (100min) is the global config');
  check('54-config-dir-empty-falls-back', outEmpty, warn(85, 100), 'CLAUDE_CONFIG_DIR set but holding no config: $HOME/.claude is read last');
  check('54-state-records-profile-config', readState(tmp, 'S54', 'first'),
    { start: NOW, warned: false, expired: false, config: join(realpathSync(profile), 'agent-deadline.json') },
    'fresh state names the governing config file, which uninstall/purge match on');
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

// ── Report ─────────────────────────────────────────────────────────────────────
console.log('\n=== agent-deadline E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
