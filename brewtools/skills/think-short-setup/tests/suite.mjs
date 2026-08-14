#!/usr/bin/env node
/**
 * E2E suite for think-short hooks: SessionStart, UserPromptSubmit-counter and
 * SubagentStart. The subagent hook composes `hookSpecificOutput.additionalContext`
 * (no prompt rewriting, no yield logic — see think-short-subagent.mjs header).
 * Runs in isolated TEMP HOME + TMPDIR. Never touches real ~/.claude or repo state.
 * Each test emits one PASS/FAIL line.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, utimesSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets');               // assets/

const COUNTER_MJS  = join(ASSETS, 'think-short-prompt-counter.mjs');
const SESSION_MJS  = join(ASSETS, 'think-short-session.mjs');
const SUBAGENT_MJS = join(ASSETS, 'think-short-subagent.mjs');
const PROMPT_PATH  = join(ASSETS, 'think-short-prompt.md');

// GIVEN: a fresh isolated temp base
const BASE = mkdtempSync(join(tmpdir(), 'ts-test-'));
let passed = 0;
let failed = 0;
const results = [];

function pass(name, detail) {
  passed++;
  results.push(`  PASS  ${name}  (${detail})`);
}
function fail(name, detail) {
  failed++;
  results.push(`  FAIL  ${name}  (${detail})`);
}

function run(script, stdinStr, env, args) {
  const r = spawnSync(process.execPath, [script, ...(args || [])], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 8000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// Exact-equality helper for the SubagentStart hook's output object (mirrors
// agent-return-setup/tests/suite.mjs deepEqual).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// Copies the subagent hook + optionally the prompt file into an isolated dir,
// so tests can remove/rename the prompt without touching the real assets.
function mkSubagentHookDir(base, withPrompt) {
  const dir = join(base, 'hooks');
  mkdirSync(dir, { recursive: true });
  const script = join(dir, 'think-short-subagent.mjs');
  writeFileSync(script, readFileSync(SUBAGENT_MJS));
  if (withPrompt) writeFileSync(join(dir, 'think-short-prompt.md'), readFileSync(PROMPT_PATH));
  return script;
}

// Body the hook injects: prompt.md minus its leading `<!-- think-short -->` line.
function subagentBody(promptFile) {
  const lines = readFileSync(promptFile, 'utf8').split('\n');
  if (lines.length && /^\s*<!--/.test(lines[0])) lines.shift();
  return lines.join('\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Counter — 21 sequential UserPromptSubmit calls
// WHEN: calls 1-21 with same session_id
// THEN: inject ONLY on 10 and 20; content == full prompt body
// ─────────────────────────────────────────────────────────────────────────────
{
  const home  = join(BASE, 't1-home');
  const tmp   = join(BASE, 't1-tmp');
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp,  { recursive: true });
  const env   = { HOME: home, TMPDIR: tmp };
  const sid   = 'session-counter-01';
  const promptText = readFileSync(PROMPT_PATH, 'utf8').trimEnd();

  // GIVEN: prompt file readable; empty marker dir
  const injectCounts = [];
  let t1ok = true;

  for (let i = 1; i <= 21; i++) {
    const stdin = JSON.stringify({ session_id: sid, prompt: `msg-${i}` });
    const r = run(COUNTER_MJS, stdin, env);
    if (r.status !== 0) { t1ok = false; break; }
    let out;
    try { out = JSON.parse(r.stdout); } catch { t1ok = false; break; }
    const ctx = out?.hookSpecificOutput?.additionalContext;
    if (ctx !== undefined) {
      // THEN: injected content must equal full prompt text
      if (ctx !== promptText) { t1ok = false; break; }
      injectCounts.push(i);
    }
  }

  if (t1ok && JSON.stringify(injectCounts) === JSON.stringify([10, 20])) {
    pass('1-counter-inject-on-10-20', `injected at ${injectCounts}`);
  } else {
    fail('1-counter-inject-on-10-20', `injected at ${injectCounts} ok=${t1ok}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: SessionStart — reset counter, prune stale markers, keep others
// WHEN: 2-day-old marker + fresh-other + active-session exist
// THEN: additionalContext==prompt; active reset to 0; stale pruned; fresh kept
// ─────────────────────────────────────────────────────────────────────────────
{
  const home = join(BASE, 't2-home');
  const tmp  = join(BASE, 't2-tmp');
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp,  { recursive: true });
  const markerDir = join(tmp, 'brewtools-think-short');
  mkdirSync(markerDir, { recursive: true });

  const promptText = readFileSync(PROMPT_PATH, 'utf8').trimEnd();
  const SID = 'session-ss-active';

  // GIVEN: stale marker (>1 day old)
  const staleFile  = join(markerDir, 'stale-session.think-short-counter');
  const freshFile  = join(markerDir, 'fresh-other.think-short-counter');
  const activeFile = join(markerDir, `${SID}.think-short-counter`);

  const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 5000);
  writeFileSync(staleFile, '5');
  utimesSync(staleFile, TWO_DAYS_AGO, TWO_DAYS_AGO);

  // GIVEN: fresh marker for another session (5 min ago — not stale)
  const FIVE_MIN_AGO = new Date(Date.now() - 5 * 60 * 1000);
  writeFileSync(freshFile, '3');
  utimesSync(freshFile, FIVE_MIN_AGO, FIVE_MIN_AGO);

  // GIVEN: active session counter at 7
  writeFileSync(activeFile, '7');

  const env = { HOME: home, TMPDIR: tmp };
  const stdin = JSON.stringify({ session_id: SID });
  const r = run(SESSION_MJS, stdin, env);

  let t2ok = r.status === 0;
  let detail = '';
  if (t2ok) {
    const out = JSON.parse(r.stdout);
    const ctx = out?.hookSpecificOutput?.additionalContext;
    const resetVal = readFileSync(activeFile, 'utf8');
    const staleGone = !existsSync(staleFile);
    const freshStays = existsSync(freshFile);
    if (ctx !== promptText)      { t2ok = false; detail = `ctx mismatch`; }
    else if (resetVal !== '0')   { t2ok = false; detail = `reset=${resetVal} expected 0`; }
    else if (!staleGone)         { t2ok = false; detail = `stale marker not pruned`; }
    else if (!freshStays)        { t2ok = false; detail = `fresh marker wrongly pruned`; }
    else detail = 'ctx=ok reset=0 stale_pruned fresh_kept';
  }

  if (t2ok) pass('2-session-reset-prune', detail);
  else       fail('2-session-reset-prune', detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3a: think-short-subagent — SubagentStart, prompt present -> exact object
// GIVEN: hook copied next to a live think-short-prompt.md
// WHEN: run with a normal SubagentStart payload (stdin is documented as unread)
// THEN: stdout deep-equals {hookSpecificOutput:{hookEventName:'SubagentStart',
//       additionalContext: <prompt body minus its leading comment line>}}
// ─────────────────────────────────────────────────────────────────────────────
{
  const dir = join(BASE, 't3a-hooks');
  mkdirSync(dir, { recursive: true });
  const script = mkSubagentHookDir(dir, true);
  const expected = {
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: subagentBody(join(dir, 'hooks', 'think-short-prompt.md')),
    },
  };

  const stdin = JSON.stringify({
    hook_event_name: 'SubagentStart', session_id: 'S1', agent_id: 'A1',
    agent_type: 'general-purpose', cwd: dir, prompt: 'do the thing',
  });
  const r = run(script, stdin, {});
  let ok = r.status === 0;
  let detail = '';
  if (ok) {
    let out;
    try { out = JSON.parse(r.stdout); } catch { ok = false; detail = 'parse fail'; }
    if (ok) {
      ok = deepEqual(out, expected);
      detail = ok
        ? `exact match, additionalContext len=${expected.hookSpecificOutput.additionalContext.length}`
        : `mismatch actual=${JSON.stringify(out).slice(0, 200)}`;
    }
  } else {
    detail = `exit=${r.status}`;
  }
  if (ok) pass('3a-subagent-fires-exact-object', detail);
  else     fail('3a-subagent-fires-exact-object', detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3b: think-short-subagent — exact key set, no extras
// THEN: top-level keys == ['hookSpecificOutput']; hookSpecificOutput keys ==
//       ['hookEventName','additionalContext'] — nothing else leaks in
// ─────────────────────────────────────────────────────────────────────────────
{
  const dir = join(BASE, 't3b-hooks');
  mkdirSync(dir, { recursive: true });
  const script = mkSubagentHookDir(dir, true);

  const r = run(script, JSON.stringify({ hook_event_name: 'SubagentStart' }), {});
  let ok = r.status === 0;
  let detail = '';
  if (ok) {
    let out;
    try { out = JSON.parse(r.stdout); } catch { ok = false; detail = 'parse fail'; }
    if (ok) {
      const topKeys = Object.keys(out);
      const hsoKeys = Object.keys(out.hookSpecificOutput || {});
      const topOk = deepEqual(topKeys, ['hookSpecificOutput']);
      const hsoOk = deepEqual(hsoKeys, ['hookEventName', 'additionalContext']);
      ok = topOk && hsoOk;
      detail = ok ? `keys=[${topKeys}] hso-keys=[${hsoKeys}]`
        : `top=[${topKeys}] hso=[${hsoKeys}]`;
    }
  } else {
    detail = `exit=${r.status}`;
  }
  if (ok) pass('3b-subagent-exact-key-set', detail);
  else     fail('3b-subagent-exact-key-set', detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3c: think-short-subagent — prompt.md absent -> {}
// GIVEN: hook copied but think-short-prompt.md never written next to it
// THEN: stdout is exactly {}
// ─────────────────────────────────────────────────────────────────────────────
{
  const dir = join(BASE, 't3c-hooks');
  mkdirSync(dir, { recursive: true });
  const script = mkSubagentHookDir(dir, false);

  const r = run(script, JSON.stringify({ hook_event_name: 'SubagentStart' }), {});
  let ok = r.status === 0;
  let detail = '';
  if (ok) {
    let out;
    try { out = JSON.parse(r.stdout); } catch { ok = false; detail = 'parse fail'; }
    if (ok) {
      ok = deepEqual(out, {});
      detail = ok ? 'output={}' : `expected {} got ${JSON.stringify(out)}`;
    }
  } else {
    detail = `exit=${r.status}`;
  }
  if (ok) pass('3c-subagent-missing-prompt-noop', detail);
  else     fail('3c-subagent-missing-prompt-noop', detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3d: think-short-subagent --check — documented diagnostic shape
// THEN: {prompt_file:true, injects:true, yielded_to:[]} — additionalContext
//       composes, so nothing is ever yielded to
// ─────────────────────────────────────────────────────────────────────────────
{
  const dir = join(BASE, 't3d-hooks');
  mkdirSync(dir, { recursive: true });
  const script = mkSubagentHookDir(dir, true);

  const r = run(script, '', {}, ['--check']);
  let ok = r.status === 0;
  let detail = '';
  if (ok) {
    let out;
    try { out = JSON.parse(r.stdout.trim()); } catch { ok = false; detail = 'parse fail'; }
    if (ok) {
      ok = deepEqual(out, { prompt_file: true, injects: true, yielded_to: [] });
      detail = ok ? JSON.stringify(out) : `mismatch: ${JSON.stringify(out)}`;
    }
  } else {
    detail = `exit=${r.status}`;
  }
  if (ok) pass('3d-subagent-check-shape', detail);
  else     fail('3d-subagent-check-shape', detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Fail-open — various bad inputs -> exit 0 + {}
// ─────────────────────────────────────────────────────────────────────────────
{
  const home = join(BASE, 't4-home');
  const tmp  = join(BASE, 't4-tmp');
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp,  { recursive: true });
  const env = { HOME: home, TMPDIR: tmp };

  const cases = [
    { name: 'empty-stdin',           script: COUNTER_MJS,  stdin: '' },
    { name: 'malformed-json',        script: COUNTER_MJS,  stdin: '{not json' },
    { name: 'missing-session_id',    script: COUNTER_MJS,  stdin: '{}' },
    { name: 'session-empty-stdin',   script: SESSION_MJS,  stdin: '' },
    { name: 'session-malformed',     script: SESSION_MJS,  stdin: '{bad' },
  ];

  for (const c of cases) {
    // SessionStart always emits additionalContext (even on empty stdin, best-effort).
    // Counter should emit {}.
    const r = run(c.script, c.stdin, env);
    let ok = r.status === 0;
    let detail = '';
    if (ok) {
      let out;
      try { out = JSON.parse(r.stdout); } catch { ok = false; detail = 'parse fail'; }
      if (ok) {
        // For session on bad input: file read may fail -> {} is acceptable too.
        // For counter/task: strictly {}.
        const isEmpty = Object.keys(out).length === 0;
        const isSession = c.script === SESSION_MJS;
        if (!isSession && !isEmpty) {
          ok = false; detail = `expected {} got keys=[${Object.keys(out)}]`;
        } else {
          detail = isEmpty ? 'output={}' : 'output=sessionInject(ok on fail-open)';
        }
      }
    }
    if (ok) pass(`4-fail-open/${c.name}`, detail);
    else     fail(`4-fail-open/${c.name}`, detail || `exit=${r.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: disable/enable — the `.disabled` prompt rename is what `disable` does
// GIVEN: the 4 files copied into a hooks dir, as an install leaves them
// WHEN: think-short-prompt.md is renamed to .disabled, all 3 hooks are run
// THEN: every hook exits 0 with exactly {} — wired but a genuine no-op
// AND:  renaming back restores injection on all 3
// ─────────────────────────────────────────────────────────────────────────────
{
  const home = join(BASE, 't5-home');
  const tmp  = join(BASE, 't5-tmp');
  const hooks = join(home, '.claude', 'hooks');
  mkdirSync(hooks, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(home, 'proj', '.claude'), { recursive: true });
  writeFileSync(join(home, 'proj', '.claude', 'settings.json'), JSON.stringify({}));
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({}));
  const env = { HOME: home, TMPDIR: tmp };

  const SCRIPTS = ['think-short-session.mjs', 'think-short-prompt-counter.mjs', 'think-short-subagent.mjs'];
  for (const s of SCRIPTS) writeFileSync(join(hooks, s), readFileSync(join(ASSETS, s)));
  const promptLive = join(hooks, 'think-short-prompt.md');
  const promptOff  = join(hooks, 'think-short-prompt.md.disabled');
  writeFileSync(promptLive, readFileSync(PROMPT_PATH));

  const sid = 'session-disable-05';
  // counter injects only every 10th prompt, so drive a FRESH session id to exactly 10
  let driveNo = 0;
  const driveCounter = () => {
    driveNo++;
    let last = null;
    for (let i = 1; i <= 10; i++) {
      last = run(join(hooks, 'think-short-prompt-counter.mjs'),
        JSON.stringify({ session_id: `${sid}-drive-${driveNo}`, prompt: `m${i}` }), env);
    }
    return last;
  };
  const runSession = () => run(join(hooks, 'think-short-session.mjs'),
    JSON.stringify({ session_id: sid }), env);
  const runSubagent = () => run(join(hooks, 'think-short-subagent.mjs'),
    JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'general-purpose' }), env);
  const injects = (r) => {
    if (r.status !== 0) return null;
    let out;
    try { out = JSON.parse(r.stdout); } catch { return null; }
    return Boolean(out?.hookSpecificOutput?.additionalContext);
  };

  // GIVEN: enabled -> all three inject
  const onSession = injects(runSession());
  const onCounter = injects(driveCounter());
  const onSubagent = injects(runSubagent());
  if (onSession === true && onCounter === true && onSubagent === true) {
    pass('5-enabled-all-three-inject', 'session+counter+subagent inject with the prompt in place');
  } else {
    fail('5-enabled-all-three-inject', `session=${onSession} counter=${onCounter} subagent=${onSubagent}`);
  }

  // WHEN: disable == rename the prompt away
  execFileSync('mv', [promptLive, promptOff]);
  const offSession = run(join(hooks, 'think-short-session.mjs'), JSON.stringify({ session_id: sid }), env);
  const offCounter = driveCounter();
  const offSubagent = runSubagent();
  const isNoop = (r) => {
    if (r.status !== 0) return `exit=${r.status}`;
    let out;
    try { out = JSON.parse(r.stdout); } catch { return 'parse fail'; }
    return Object.keys(out).length === 0 ? null : `keys=[${Object.keys(out)}]`;
  };
  const bad = [
    ['session', isNoop(offSession)],
    ['counter', isNoop(offCounter)],
    ['subagent', isNoop(offSubagent)],
  ].filter(([, v]) => v !== null);
  if (bad.length === 0 && existsSync(promptOff) && !existsSync(promptLive)) {
    pass('5-disabled-all-three-noop', 'all 3 exit 0 with {} while wired');
  } else {
    fail('5-disabled-all-three-noop', bad.map(([k, v]) => `${k}:${v}`).join(' ') || 'rename state wrong');
  }

  // THEN: enable == rename it back
  execFileSync('mv', [promptOff, promptLive]);
  const backSession = injects(runSession());
  const backCounter = injects(driveCounter());
  const backSubagent = injects(runSubagent());
  if (backSession === true && backCounter === true && backSubagent === true) {
    pass('5-re-enabled-all-three-inject', 'injection restored by renaming back');
  } else {
    fail('5-re-enabled-all-three-inject', `session=${backSession} counter=${backCounter} subagent=${backSubagent}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────
try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== think-short E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
