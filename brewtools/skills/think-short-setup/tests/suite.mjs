#!/usr/bin/env node
/**
 * E2E suite for think-short hooks.
 * Injection model: ${injection}\n\n${tool_input.prompt}
 * Runs in isolated TEMP HOME + TMPDIR. Never touches real ~/.claude or repo state.
 * Each test emits one PASS/FAIL line.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync,
  existsSync, utimesSync, readdirSync, unlinkSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets');               // assets/
const REPO   = join(HERE, '..', '..', '..', '..'); // repo root
const HOOKS_BC = join(REPO, 'brewcode', 'hooks');
const HOOKS_BT = join(REPO, 'brewtools', 'hooks');
const HOOKS_BD = join(REPO, 'brewdoc', 'hooks');

const COUNTER_MJS  = join(ASSETS, 'think-short-prompt-counter.mjs');
const SESSION_MJS  = join(ASSETS, 'think-short-session.mjs');
const TASK_MJS     = join(ASSETS, 'think-short-task.mjs');
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

function run(script, stdinStr, env) {
  const r = spawnSync(process.execPath, [script], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 8000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function mkCachePlugin(home, plugin, version) {
  const dir = join(home, '.claude', 'plugins', 'cache', 'claude-brewcode', plugin, version);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mkDataPlugin(home, plugin) {
  const dir = join(home, '.claude', 'plugins', 'data', `${plugin}-claude-brewcode`);
  mkdirSync(dir, { recursive: true });
  return dir;
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
// Test 3a: think-short-task — only family hooks present -> FIRES
// GIVEN: no foreign hooks anywhere; HOME with family cache dirs
// WHEN: run think-short-task.mjs with tool_input.prompt
// THEN: output starts with injection, contains prompt body, no `<!-- think-short -->`
// ─────────────────────────────────────────────────────────────────────────────
{
  const home = join(BASE, 't3a-home');
  mkdirSync(home, { recursive: true });
  const tmp = join(BASE, 't3a-tmp');
  mkdirSync(tmp, { recursive: true });
  mkCachePlugin(home, 'brewtools', '3.19.5');
  // GIVEN: no project or user settings with foreign hooks
  mkdirSync(join(home, 'proj', '.claude'), { recursive: true });
  writeFileSync(join(home, 'proj', '.claude', 'settings.json'), JSON.stringify({}));
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({}));

  const ORIGINAL = 'TASK_ORIGINAL';
  const stdin = JSON.stringify({ cwd: join(home, 'proj'), tool_input: { prompt: ORIGINAL } });
  const r = run(TASK_MJS, stdin, { HOME: home, TMPDIR: tmp });
  let t3aok = r.status === 0;
  let detail3a = '';
  if (t3aok) {
    let out;
    try { out = JSON.parse(r.stdout); } catch { t3aok = false; detail3a = 'parse fail'; }
    if (t3aok) {
      const np = out?.hookSpecificOutput?.updatedInput?.prompt;
      const firstLine = np ? np.split('\n')[0] : '';
      const hasBody   = np && np.includes('Be terse');
      const noComment = np && !np.includes('<!-- think-short -->');
      const hasOrig   = np && np.endsWith(ORIGINAL);
      if (!np)         { t3aok = false; detail3a = 'no updatedInput.prompt'; }
      else if (!hasBody)   { t3aok = false; detail3a = `body missing "Be terse": first80="${np.slice(0,80)}"`; }
      else if (!noComment) { t3aok = false; detail3a = '<!-- think-short --> leaked into output'; }
      else if (!hasOrig)   { t3aok = false; detail3a = `original not at end: "${np.slice(-40)}"`; }
      else detail3a = `fires ok; starts="${firstLine}"`;
    }
  }
  if (t3aok) pass('3a-task-only-family-fires', detail3a);
  else        fail('3a-task-only-family-fires', detail3a);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3b: think-short-task — foreign hook in project settings.json -> YIELDS {}
// GIVEN: project .claude/settings.json has a PreToolUse entry matching Task
//        that is NOT a family hook (unknown command path)
// WHEN: run think-short-task.mjs
// THEN: output == {}
// ─────────────────────────────────────────────────────────────────────────────
{
  const home = join(BASE, 't3b-home');
  mkdirSync(home, { recursive: true });
  const tmp = join(BASE, 't3b-tmp');
  mkdirSync(tmp, { recursive: true });
  mkCachePlugin(home, 'brewtools', '3.19.5');
  mkdirSync(join(home, 'proj', '.claude'), { recursive: true });

  // GIVEN: foreign hook that matches Task
  const foreignSettings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Task',
          hooks: [{ type: 'command', command: '/some/foreign/hook.sh' }],
        },
      ],
    },
  };
  writeFileSync(join(home, 'proj', '.claude', 'settings.json'), JSON.stringify(foreignSettings));
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({}));

  const stdin = JSON.stringify({ cwd: join(home, 'proj'), tool_input: { prompt: 'TASK_PROMPT' } });
  const r = run(TASK_MJS, stdin, { HOME: home, TMPDIR: tmp });
  let t3bok = r.status === 0;
  let detail3b = '';
  if (t3bok) {
    let out;
    try { out = JSON.parse(r.stdout); } catch { t3bok = false; detail3b = 'parse fail'; }
    if (t3bok) {
      // No prompt edit, ever. A one-per-session `systemMessage` announcing the
      // yield is expected — a silent no-op that looks installed was the bug.
      const keys = Object.keys(out);
      const injected = out.hookSpecificOutput && out.hookSpecificOutput.updatedInput;
      const extra = keys.filter(k => k !== 'systemMessage');
      if (!injected && extra.length === 0) detail3b = `no injection (keys=[${keys}])`;
      else { t3bok = false; detail3b = `expected no updatedInput, got keys=[${keys}]`; }
    }
  }
  if (t3bok) pass('3b-task-foreign-hook-yields', detail3b);
  else        fail('3b-task-foreign-hook-yields', detail3b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3c: think-short-task — no other Task hook at all -> FIRES
// GIVEN: HOME with no plugin cache, no settings
// WHEN: run think-short-task.mjs
// THEN: updatedInput.prompt set (not empty)
// ─────────────────────────────────────────────────────────────────────────────
{
  const home = join(BASE, 't3c-home');
  mkdirSync(home, { recursive: true });
  const tmp = join(BASE, 't3c-tmp');
  mkdirSync(tmp, { recursive: true });
  // GIVEN: no cache dirs; minimal settings
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({}));
  mkdirSync(join(home, 'proj', '.claude'), { recursive: true });
  writeFileSync(join(home, 'proj', '.claude', 'settings.json'), JSON.stringify({}));

  const ORIGINAL = 'TASK_ORIGINAL_3C';
  const stdin = JSON.stringify({ cwd: join(home, 'proj'), tool_input: { prompt: ORIGINAL } });
  const r = run(TASK_MJS, stdin, { HOME: home, TMPDIR: tmp });
  let t3cok = r.status === 0;
  let detail3c = '';
  if (t3cok) {
    let out;
    try { out = JSON.parse(r.stdout); } catch { t3cok = false; detail3c = 'parse fail'; }
    if (t3cok) {
      const np = out?.hookSpecificOutput?.updatedInput?.prompt;
      if (!np)                   { t3cok = false; detail3c = 'no updatedInput.prompt'; }
      else if (!np.endsWith(ORIGINAL)) { t3cok = false; detail3c = `original not at end`; }
      else detail3c = `fires ok; len=${np.length}`;
    }
  }
  if (t3cok) pass('3c-task-no-hooks-fires', detail3c);
  else        fail('3c-task-no-hooks-fires', detail3c);
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
    { name: 'missing-tool_input',    script: TASK_MJS,     stdin: JSON.stringify({ cwd: join(home, 'proj') }) },
    { name: 'missing-prompt-field',  script: TASK_MJS,     stdin: JSON.stringify({ tool_input: {} }) },
    { name: 'session-empty-stdin',   script: SESSION_MJS,  stdin: '' },
    { name: 'session-malformed',     script: SESSION_MJS,  stdin: '{bad' },
  ];

  for (const c of cases) {
    // SessionStart always emits additionalContext (even on empty stdin, best-effort).
    // Counter/Task should emit {}.
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

  const SCRIPTS = ['think-short-session.mjs', 'think-short-prompt-counter.mjs', 'think-short-task.mjs'];
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
  const runTask = () => run(join(hooks, 'think-short-task.mjs'),
    JSON.stringify({ cwd: join(home, 'proj'), tool_input: { prompt: 'ORIGINAL_5' } }), env);
  const injects = (r) => {
    if (r.status !== 0) return null;
    let out;
    try { out = JSON.parse(r.stdout); } catch { return null; }
    const hso = out?.hookSpecificOutput;
    return Boolean(hso?.additionalContext || hso?.updatedInput?.prompt);
  };

  // GIVEN: enabled -> all three inject
  const onSession = injects(runSession());
  const onCounter = injects(driveCounter());
  const onTask = injects(runTask());
  if (onSession === true && onCounter === true && onTask === true) {
    pass('5-enabled-all-three-inject', 'session+counter+task inject with the prompt in place');
  } else {
    fail('5-enabled-all-three-inject', `session=${onSession} counter=${onCounter} task=${onTask}`);
  }

  // WHEN: disable == rename the prompt away
  execFileSync('mv', [promptLive, promptOff]);
  const offSession = run(join(hooks, 'think-short-session.mjs'), JSON.stringify({ session_id: sid }), env);
  const offCounter = driveCounter();
  const offTask = runTask();
  const isNoop = (r) => {
    if (r.status !== 0) return `exit=${r.status}`;
    let out;
    try { out = JSON.parse(r.stdout); } catch { return 'parse fail'; }
    return Object.keys(out).length === 0 ? null : `keys=[${Object.keys(out)}]`;
  };
  const bad = [
    ['session', isNoop(offSession)],
    ['counter', isNoop(offCounter)],
    ['task', isNoop(offTask)],
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
  const backTask = injects(runTask());
  if (backSession === true && backCounter === true && backTask === true) {
    pass('5-re-enabled-all-three-inject', 'injection restored by renaming back');
  } else {
    fail('5-re-enabled-all-three-inject', `session=${backSession} counter=${backCounter} task=${backTask}`);
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
