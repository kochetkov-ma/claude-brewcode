#!/usr/bin/env node
/**
 * E2E suite for the agent-return hook pair (contract + guard).
 * Each case drives a hook as a REAL child process (JSON on stdin -> JSON on
 * stdout) and asserts exit code, empty stderr and exact stdout.
 *
 * Isolation: every workspace lives under os.tmpdir() with its own HOME, and the
 * child runs with cwd inside it. The real ~/.claude and the repo's .claude/ are
 * never read as config and never written. AGENT_RETURN_* are scrubbed from the
 * inherited env so an operator's shell cannot change a result.
 *
 * Assertion policy: unconditional exact-equality comparisons with a description;
 * no branching decides which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets');               // assets/
const GUARD_MJS = join(ASSETS, 'agent-return-guard.mjs');
const CONTRACT_MJS = join(ASSETS, 'agent-return-contract.mjs');

const BASE = mkdtempSync(join(tmpdir(), 'ar-test-'));
let passed = 0;
let failed = 0;
const results = [];
const groups = new Map(); // group -> { cases, bad }

// ── deep-equal primitive (utility, not test-body branching) ──────────────────
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
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
    return;
  }
  failed++;
  results.push(
    `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
  );
}

// ── process runner ───────────────────────────────────────────────────────────
function run(script, stdinStr, env, cwd) {
  const r = spawnSync(process.execPath, [script], {
    input: stdinStr,
    cwd,
    encoding: 'utf8',
    env,
    timeout: 15000,
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

/**
 * One case = one child process. Exit code and stderr are asserted here so no
 * case can forget them; `assert` owns the stdout comparison.
 */
function runCase(group, name, script, opts, assert) {
  const before = failed;
  const r = run(script, opts.stdin === undefined ? '' : opts.stdin, opts.env, opts.cwd);
  check(`${name}-exit`, r.status, 0, 'hook must exit 0 (never 2 — exit 2 wedges the agent)');
  check(`${name}-stderr`, r.stderr, '', 'hook must write nothing to stderr');
  assert(safeParse(r.stdout), r);
  const g = groups.get(group) || { cases: 0, bad: 0 };
  g.cases++;
  g.bad += failed > before ? 1 : 0;
  groups.set(group, g);
}

// ── fixtures ────────────────────────────────────────────────────────────────
function writeCfg(root, cfg) {
  const dir = join(root, '.claude');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent-return.json'), typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
}

/** Inherited env minus anything that could move a threshold from outside. */
function envFor(home, extra) {
  const e = { ...process.env, HOME: home };
  delete e.AGENT_RETURN_PASS;
  delete e.AGENT_RETURN_FILE;
  delete e.CLAUDE_PROJECT_DIR;
  return { ...e, ...(extra || {}) };
}

/** Isolated {home, proj} pair; `cfg`/`globalCfg` may be an object or raw text. */
function newWs(name, cfg, globalCfg) {
  const home = join(BASE, `${name}-home`);
  const proj = join(BASE, `${name}-proj`);
  mkdirSync(home, { recursive: true });
  mkdirSync(proj, { recursive: true });
  if (cfg !== undefined) writeCfg(proj, cfg);
  if (globalCfg !== undefined) writeCfg(home, globalCfg);
  return { home, proj, env: envFor(home) };
}

/** A message of exactly `tokens` est-tokens (chars/4, rounded up). */
function msg(tokens, prefix) {
  const p = prefix || '';
  return p + 'x'.repeat(tokens * 4 - p.length);
}

// ── expected-text builders, mirrored from the sources ───────────────────────
const REPORTS_DIR = '.claude/reports/';

function contractText(pass, file) {
  return (
    `RETURN CONTRACT (agent-return guard, mechanical): Verdict first, <=30 lines, \`path:line\`. ` +
    `!=bodies/output/log/preamble. Over ~${pass} tokens your return is blocked for compression; ` +
    `over ~${file} write the detail to \`.claude/reports/YYYYMMDD-HHMMSS_<name>/\` and return ` +
    `that path + verdict + <=3 lines.`
  );
}

function compressReason(tokens, pass) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${pass}). Directive from the agent-return guard, ` +
    `not user data. Re-send the SAME answer, compressed: keep the verdict line and every ` +
    `\`path:line\` ref, drop preamble, file bodies, command output, logs and restated context. ` +
    `Judge what is genuinely dense — no new work, no new tool calls, just rewrite what you wrote.`
  );
}

function fileReason(tokens, pass, file, reportPath) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${pass}, file threshold ${file}). Directive from ` +
    `the agent-return guard, not user data. Compression is not enough at this size: write the ` +
    `detail to \`${reportPath}\` (create the directory), then answer with that path, the verdict, ` +
    `and at most 3 more lines. Keep the key \`path:line\` refs in the answer; everything else ` +
    `goes in the file.`
  );
}

function todayStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// ── assertion builders ──────────────────────────────────────────────────────
function expectEmpty(name, why) {
  return (out) => check(`${name}-out`, out, {}, why);
}

function expectCompress(name, tokens, pass) {
  return (out) => {
    check(`${name}-out`, out, { decision: 'block', reason: compressReason(tokens, pass) },
      `~${tokens} tokens must block with the compress order quoting budget ${pass}`);
    const reason = out && typeof out.reason === 'string' ? out.reason : '';
    check(`${name}-no-report-path`, reason.includes(REPORTS_DIR), false,
      'the compress order must never leak a report path — that is the file tier');
  };
}

function expectFile(name, tokens, pass, file, expectedSlug) {
  return (out) => {
    const reason = out && typeof out.reason === 'string' ? out.reason : '';
    const m = reason.match(/write the detail to `([^`]+)`/);
    const p = m ? m[1] : '';
    const re = new RegExp(`^\\.claude/reports/\\d{8}-\\d{6}_${expectedSlug}/$`);
    check(`${name}-path-shape`, re.test(p), true,
      `file order must carry .claude/reports/YYYYMMDD-HHMMSS_${expectedSlug}/ (actual "${p}")`);
    const dm = p.match(/^\.claude\/reports\/(\d{8})-\d{6}_/);
    check(`${name}-path-date`, dm ? dm[1] : '', todayStamp(new Date()),
      'the report-path stamp must carry today date, generated live');
    check(`${name}-out`, out, { decision: 'block', reason: fileReason(tokens, pass, file, p) },
      `~${tokens} tokens must block with the file order quoting budget ${pass} / threshold ${file}`);
  };
}

function expectContract(name, pass, file) {
  const text = contractText(pass, file);
  return (out) => {
    check(`${name}-out`, out,
      { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } },
      `SubagentStart must announce ${pass}/${file}`);
    const hso = out && out.hookSpecificOutput ? out.hookSpecificOutput : {};
    check(`${name}-schema`, Object.keys(hso), ['hookEventName', 'additionalContext'],
      'hookSpecificOutput carries exactly hookEventName + additionalContext');
    check(`${name}-context-length`, String(hso.additionalContext || '').length, text.length,
      'additionalContext is the full contract, not an empty string');
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 1 — tier boundaries (9 cases)
// GIVEN: the feature enabled with default thresholds 1000/2500
// WHEN:  a return of exactly N est-tokens reaches the guard
// THEN:  <=1000 pass, 1001..2500 compress, >2500 file. Both boundaries are
//        inclusive on the low side.
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('tier', { enabled: true });
  const shot = (tokens) => ({
    stdin: JSON.stringify({
      hook_event_name: 'SubagentStop', agent_type: 'general-purpose', last_assistant_message: msg(tokens),
    }),
    env: ws.env,
    cwd: ws.proj,
  });

  runCase('tier', 'tier-999', GUARD_MJS, shot(999), expectEmpty('tier-999', '999 <= PASS must pass silently'));
  runCase('tier', 'tier-1000', GUARD_MJS, shot(1000), expectEmpty('tier-1000', 'exactly PASS must pass — inclusive low boundary'));
  runCase('tier', 'tier-1001', GUARD_MJS, shot(1001), expectCompress('tier-1001', 1001, 1000));
  runCase('tier', 'tier-1002', GUARD_MJS, shot(1002), expectCompress('tier-1002', 1002, 1000));
  runCase('tier', 'tier-2499', GUARD_MJS, shot(2499), expectCompress('tier-2499', 2499, 1000));
  runCase('tier', 'tier-2500', GUARD_MJS, shot(2500), expectCompress('tier-2500', 2500, 1000));
  runCase('tier', 'tier-2501', GUARD_MJS, shot(2501), expectFile('tier-2501', 2501, 1000, 2500, 'general-purpose'));
  runCase('tier', 'tier-2502', GUARD_MJS, shot(2502), expectFile('tier-2502', 2502, 1000, 2500, 'general-purpose'));
  runCase('tier', 'tier-50000', GUARD_MJS, shot(50000), expectFile('tier-50000', 50000, 1000, 2500, 'general-purpose'));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 2 — escape hatches (12 cases)
// GIVEN: the feature enabled with default thresholds
// WHEN:  the loop brake, an unusable message, or a report-path mention arrives
// THEN:  boolean true brakes; the STRING "true" does not; every non-string or
//        blank message is a no-op; a report-path mention is NOT a bypass — the
//        substring hatch was deleted upstream (SPEC §8a) and must stay deleted.
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('hatch', { enabled: true });
  const shot = (payload) => ({ stdin: JSON.stringify(payload), env: ws.env, cwd: ws.proj });
  const base = { hook_event_name: 'SubagentStop', agent_type: 'general-purpose' };

  runCase('escape-hatch', 'hatch-brake-true', GUARD_MJS,
    shot({ ...base, stop_hook_active: true, last_assistant_message: msg(50000) }),
    expectEmpty('hatch-brake-true', 'stop_hook_active===true brakes before anything else — block at most once'));

  runCase('escape-hatch', 'hatch-brake-string', GUARD_MJS,
    shot({ ...base, stop_hook_active: 'true', last_assistant_message: msg(1001) }),
    expectCompress('hatch-brake-string', 1001, 1000));

  // `1 == true` in JS, so a loose comparison in the guard would brake here and
  // the string case above would not catch it.
  runCase('escape-hatch', 'hatch-brake-one', GUARD_MJS,
    shot({ ...base, stop_hook_active: 1, last_assistant_message: msg(1001) }),
    expectCompress('hatch-brake-one', 1001, 1000));

  runCase('escape-hatch', 'hatch-msg-missing', GUARD_MJS, shot({ ...base }),
    expectEmpty('hatch-msg-missing', 'absent last_assistant_message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-null', GUARD_MJS, shot({ ...base, last_assistant_message: null }),
    expectEmpty('hatch-msg-null', 'null message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-number', GUARD_MJS, shot({ ...base, last_assistant_message: 123456 }),
    expectEmpty('hatch-msg-number', 'numeric message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-object', GUARD_MJS, shot({ ...base, last_assistant_message: { text: msg(50000) } }),
    expectEmpty('hatch-msg-object', 'object message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-array', GUARD_MJS, shot({ ...base, last_assistant_message: [msg(50000)] }),
    expectEmpty('hatch-msg-array', 'array message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-boolean', GUARD_MJS, shot({ ...base, last_assistant_message: true }),
    expectEmpty('hatch-msg-boolean', 'boolean message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-empty', GUARD_MJS, shot({ ...base, last_assistant_message: '' }),
    expectEmpty('hatch-msg-empty', 'empty message is a no-op'));
  runCase('escape-hatch', 'hatch-msg-blank', GUARD_MJS, shot({ ...base, last_assistant_message: '   \n\t  ' }),
    expectEmpty('hatch-msg-blank', 'whitespace-only message is a no-op'));

  runCase('escape-hatch', 'hatch-reports-compress', GUARD_MJS,
    shot({ ...base, last_assistant_message: msg(1500, 'See .claude/reports/foo/ for detail. ') }),
    expectCompress('hatch-reports-compress', 1500, 1000));

  const tail = ' .claude/reports/foo/';
  runCase('escape-hatch', 'hatch-reports-file', GUARD_MJS,
    shot({ ...base, last_assistant_message: 'x'.repeat(4000 * 4 - tail.length) + tail }),
    expectFile('hatch-reports-file', 4000, 1000, 2500, 'general-purpose'));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 3 — fail-open (13 cases)
// GIVEN: the feature enabled, so the guard actually runs its decision path
// WHEN:  stdin is garbage, empty, a bare scalar, binary, huge or wrongly typed
// THEN:  always {} on stdout, exit 0, never exit 2
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('failopen', { enabled: true });
  const shot = (raw) => ({ stdin: raw, env: ws.env, cwd: ws.proj });
  const cases = [
    ['fo-malformed', '{"last_assistant_message":', 'truncated JSON'],
    ['fo-empty', '', 'empty stdin'],
    ['fo-whitespace', '   \n  \t ', 'whitespace-only stdin'],
    ['fo-array', '[1,2,3]', 'bare JSON array'],
    ['fo-string', '"hello"', 'bare JSON string'],
    ['fo-number', '42', 'bare JSON number'],
    ['fo-zero', '0', 'bare zero'],
    ['fo-null', 'null', 'bare null'],
    ['fo-false', 'false', 'bare false'],
    ['fo-true', 'true', 'bare true'],
    ['fo-binary', '\u0000\u0001\u0002garbage\u0000{', 'NUL + garbage bytes'],
    ['fo-blob', 'z'.repeat(200000), '200000-char non-JSON blob'],
    ['fo-wrong-types', JSON.stringify({
      hook_event_name: 42, session_id: [], agent_type: {}, stop_hook_active: 'yes',
      last_assistant_message: { nested: true }, cwd: null,
    }), 'wrong types throughout'],
  ];
  for (const [name, raw, why] of cases) {
    runCase('fail-open', name, GUARD_MJS, shot(raw), expectEmpty(name, `fail-open: ${why} -> {} exit 0`));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 4 — valid env overrides (5 cases)
// GIVEN: enabled config with no threshold keys, AGENT_RETURN_PASS=500 FILE=800
// WHEN:  returns at 500/501/800/801 tokens arrive, and a subagent spawns
// THEN:  the tiers move to 500/800 and the announced contract moves with them
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('envok', { enabled: true });
  const env = envFor(ws.home, { AGENT_RETURN_PASS: '500', AGENT_RETURN_FILE: '800' });
  const shot = (tokens) => ({
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(tokens) }),
    env,
    cwd: ws.proj,
  });

  runCase('env-valid', 'envok-500', GUARD_MJS, shot(500), expectEmpty('envok-500', 'exactly the overridden PASS still passes'));
  runCase('env-valid', 'envok-501', GUARD_MJS, shot(501), expectCompress('envok-501', 501, 500));
  runCase('env-valid', 'envok-800', GUARD_MJS, shot(800), expectCompress('envok-800', 800, 500));
  runCase('env-valid', 'envok-801', GUARD_MJS, shot(801), expectFile('envok-801', 801, 500, 800, 'tester'));
  runCase('env-valid', 'envok-contract', CONTRACT_MJS, { stdin: '', env, cwd: ws.proj }, expectContract('envok-contract', 500, 800));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 5 — invalid env overrides (44 cases = 11 values x 4 probes)
// GIVEN: enabled config, both env vars set to the same rejected literal
// WHEN:  the guard sizes 1000 / 1001 / 2501 tokens and a subagent spawns
// THEN:  every probe behaves exactly as the built-in 1000/2500 defaults, and
//        the announced contract falls back in lockstep with the enforced tiers
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('envbad', { enabled: true });
  const BAD = ['1.7', 'abc', '12abc', '-5', '0', '', '   ', '1e400', 'NaN', 'Infinity', '2500.0000001'];
  for (const raw of BAD) {
    const tag = raw.trim() === '' ? `blank${raw.length}` : raw.replace(/[^A-Za-z0-9.]+/g, '_');
    const env = envFor(ws.home, { AGENT_RETURN_PASS: raw, AGENT_RETURN_FILE: raw });
    const shot = (tokens) => ({
      stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(tokens) }),
      env,
      cwd: ws.proj,
    });

    runCase('env-invalid', `envbad-${tag}-pass`, GUARD_MJS, shot(1000),
      expectEmpty(`envbad-${tag}-pass`, `"${raw}" must fall back — 1000 still passes`));
    runCase('env-invalid', `envbad-${tag}-compress`, GUARD_MJS, shot(1001),
      expectCompress(`envbad-${tag}-compress`, 1001, 1000));
    runCase('env-invalid', `envbad-${tag}-file`, GUARD_MJS, shot(2501),
      expectFile(`envbad-${tag}-file`, 2501, 1000, 2500, 'agent'));
    runCase('env-invalid', `envbad-${tag}-contract`, CONTRACT_MJS, { stdin: '', env, cwd: ws.proj },
      expectContract(`envbad-${tag}-contract`, 1000, 2500));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 6 — agent_type slug (16 cases)
// GIVEN: enabled config, a file-tier return (2501 tokens)
// WHEN:  agent_type is absent, unusable, punctuation, non-latin or overlong
// THEN:  the report path segment is lowercase [a-z0-9-], truncated at 48, never
//        leading/trailing dashes, and falls back to "agent"
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('slug', { enabled: true });
  const body = msg(2501);
  const shot = (payload) => ({
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: body, ...payload }),
    env: ws.env,
    cwd: ws.proj,
  });
  const cases = [
    ['slug-absent', {}, 'agent'],
    ['slug-empty', { agent_type: '' }, 'agent'],
    ['slug-blank', { agent_type: '   ' }, 'agent'],
    ['slug-punctuation', { agent_type: '!!! ***' }, 'agent'],
    ['slug-null', { agent_type: null }, 'agent'],
    ['slug-number', { agent_type: 42 }, 'agent'],
    ['slug-cyrillic', { agent_type: 'Кириллица' }, 'agent'],
    ['slug-emoji', { agent_type: '🚀🔥' }, 'agent'],
    ['slug-plain', { agent_type: 'general-purpose' }, 'general-purpose'],
    ['slug-spaces-punct', { agent_type: 'My Agent!! v2' }, 'my-agent-v2'],
    ['slug-namespaced', { agent_type: 'brewcode:hook-creator' }, 'brewcode-hook-creator'],
    ['slug-leading-sep', { agent_type: '___lead' }, 'lead'],
    ['slug-trailing-sep', { agent_type: 'trail___' }, 'trail'],
    ['slug-mixed-case', { agent_type: 'Some_Agent_NAME' }, 'some-agent-name'],
    ['slug-truncate-48', { agent_type: 'a'.repeat(60) }, 'a'.repeat(48)],
    ['slug-truncate-dash', { agent_type: `${'b'.repeat(47)}-ccc` }, 'b'.repeat(47)],
  ];
  for (const [name, payload, expectedSlug] of cases) {
    runCase('slug', name, GUARD_MJS, shot(payload), expectFile(name, 2501, 1000, 2500, expectedSlug));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 7 — SubagentStart contract (3 cases)
// GIVEN: enabled config, default thresholds
// WHEN:  the hook runs with no stdin, garbage stdin, or a real spawn payload
// THEN:  identical schema and identical non-empty additionalContext — stdin is
//        never read
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('start', { enabled: true });
  runCase('subagent-start', 'start-no-stdin', CONTRACT_MJS, { stdin: '', env: ws.env, cwd: ws.proj },
    expectContract('start-no-stdin', 1000, 2500));
  runCase('subagent-start', 'start-garbage', CONTRACT_MJS, { stdin: ' not json{{{', env: ws.env, cwd: ws.proj },
    expectContract('start-garbage', 1000, 2500));
  runCase('subagent-start', 'start-payload', CONTRACT_MJS, {
    stdin: JSON.stringify({
      hook_event_name: 'SubagentStart', session_id: 'S1', agent_id: 'A1',
      agent_type: 'general-purpose', cwd: ws.proj, prompt: 'do the thing',
    }),
    env: ws.env,
    cwd: ws.proj,
  }, expectContract('start-payload', 1000, 2500));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 8 — config layer (16 cases) — this port's addition, no upstream twin
// GIVEN: .claude/agent-return.json discovered from cwd upward (16 dirs), then
//        the global ~/.claude copy
// WHEN:  the config is absent, disabled, malformed, nested, or carries keys
// THEN:  absent/invalid = feature OFF for BOTH hooks; enabled:true with keys
//        moves the tiers; the config key beats the env var; a malformed project
//        file is skipped so the global one takes over; project beats global
// ═════════════════════════════════════════════════════════════════════════════
{
  // 8.1 no config anywhere -> both hooks no-op (disabled by default)
  const none = newWs('cfg-none');
  runCase('config', 'cfg-none-guard', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'x', last_assistant_message: msg(50000) }),
    env: none.env, cwd: none.proj,
  }, expectEmpty('cfg-none-guard', 'no config anywhere -> guard is a no-op even at 50000 tokens'));
  runCase('config', 'cfg-none-contract', CONTRACT_MJS, { stdin: '', env: none.env, cwd: none.proj },
    expectEmpty('cfg-none-contract', 'no config anywhere -> SubagentStart injects nothing'));

  // 8.2 enabled:false -> off for both hooks
  const off = newWs('cfg-off', { enabled: false, passTokens: 100 });
  runCase('config', 'cfg-off-guard', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'x', last_assistant_message: msg(50000) }),
    env: off.env, cwd: off.proj,
  }, expectEmpty('cfg-off-guard', 'enabled:false -> no-op even on a huge message'));
  runCase('config', 'cfg-off-contract', CONTRACT_MJS, { stdin: '', env: off.env, cwd: off.proj },
    expectEmpty('cfg-off-contract', 'enabled:false -> no contract injected'));

  // 8.3 the enable gate is exactly `true`
  const missingFlag = newWs('cfg-noflag', { passTokens: 500 });
  runCase('config', 'cfg-flag-missing', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(50000) }),
    env: missingFlag.env, cwd: missingFlag.proj,
  }, expectEmpty('cfg-flag-missing', 'thresholds without enabled:true stay off'));
  const strFlag = newWs('cfg-strflag', { enabled: 'true' });
  runCase('config', 'cfg-flag-string', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(50000) }),
    env: strFlag.env, cwd: strFlag.proj,
  }, expectEmpty('cfg-flag-string', 'enabled:"true" (string) is not the boolean gate'));

  // 8.4 enabled:true with custom thresholds -> tiers move
  const keys = newWs('cfg-keys', { enabled: true, passTokens: 500, fileTokens: 800 });
  runCase('config', 'cfg-keys-compress', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(501) }),
    env: keys.env, cwd: keys.proj,
  }, expectCompress('cfg-keys-compress', 501, 500));
  runCase('config', 'cfg-keys-file', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(801) }),
    env: keys.env, cwd: keys.proj,
  }, expectFile('cfg-keys-file', 801, 500, 800, 'tester'));

  // 8.5 config key BEATS the env var
  runCase('config', 'cfg-beats-env', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: envFor(keys.home, { AGENT_RETURN_PASS: '1500', AGENT_RETURN_FILE: '9000' }),
    cwd: keys.proj,
  }, expectCompress('cfg-beats-env', 501, 500));

  // 8.6 env applies per-threshold when the config key is absent
  const halfKeys = newWs('cfg-half', { enabled: true, passTokens: 500 });
  runCase('config', 'cfg-env-fills-gap', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(801) }),
    env: envFor(halfKeys.home, { AGENT_RETURN_FILE: '800' }),
    cwd: halfKeys.proj,
  }, expectFile('cfg-env-fills-gap', 801, 500, 800, 'tester'));

  // 8.7 malformed project config is skipped -> the global one takes over
  const bad = newWs('cfg-bad', 'not json {{{', { enabled: true, passTokens: 500 });
  runCase('config', 'cfg-malformed-falls-to-global', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: bad.env, cwd: bad.proj,
  }, expectCompress('cfg-malformed-falls-to-global', 501, 500));

  // 8.8 an ARRAY project config is not an object -> skipped, global takes over
  const arr = newWs('cfg-array', '[{"enabled":true}]', { enabled: true, passTokens: 500 });
  runCase('config', 'cfg-array-falls-to-global', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: arr.env, cwd: arr.proj,
  }, expectCompress('cfg-array-falls-to-global', 501, 500));

  // 8.9 project config wins over global
  const both = newWs('cfg-both', { enabled: true, passTokens: 500 }, { enabled: true, passTokens: 2000 });
  runCase('config', 'cfg-project-wins', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: both.env, cwd: both.proj,
  }, expectCompress('cfg-project-wins', 501, 500));

  // 8.10 discovery walks up from a nested subdir
  const nested = newWs('cfg-nested', { enabled: true, passTokens: 500 });
  const deep = join(nested.proj, 'a', 'b', 'c');
  mkdirSync(deep, { recursive: true });
  runCase('config', 'cfg-nested-cwd', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: nested.env, cwd: deep,
  }, expectCompress('cfg-nested-cwd', 501, 500));

  // 8.11 climb depth: 15 levels up is still found, 16 is out of reach
  const chain = (name, depth) => {
    const ws = newWs(name, { enabled: true, passTokens: 500 });
    let p = ws.proj;
    for (let i = 0; i < depth; i++) {
      p = join(p, `d${i}`);
    }
    mkdirSync(p, { recursive: true });
    return { ws, cwd: p };
  };
  const inRange = chain('cfg-climb15', 15);
  runCase('config', 'cfg-climb-15', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: inRange.ws.env, cwd: inRange.cwd,
  }, expectCompress('cfg-climb-15', 501, 500));
  const outOfRange = chain('cfg-climb16', 16);
  runCase('config', 'cfg-climb-16', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(50000) }),
    env: outOfRange.ws.env, cwd: outOfRange.cwd,
  }, expectEmpty('cfg-climb-16', '16 dirs up is past MAX_CONFIG_CLIMB, empty global -> feature off'));

  // 8.12 a global-only config still enables the feature
  const globalOnly = newWs('cfg-global', undefined, { enabled: true, passTokens: 500 });
  runCase('config', 'cfg-global-only', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: globalOnly.env, cwd: globalOnly.proj,
  }, expectCompress('cfg-global-only', 501, 500));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 9 — announced == enforced (16 cases = 4 sources x 4 probes)
// GIVEN: every threshold source — built-in default, env override, config keys,
//        rejected env falling back
// WHEN:  the SubagentStart contract is read and its two numbers are PARSED out,
//        then fed back as the guard's probe points
// THEN:  the parsed numbers equal the expected pair AND the guard enforces
//        exactly them: announcedPass passes, +1 compresses quoting announcedPass,
//        announcedFile+1 files quoting both. Structural, not eyeballed.
// ═════════════════════════════════════════════════════════════════════════════
{
  const SOURCES = [
    { id: 'default', cfg: { enabled: true }, extra: {}, pass: 1000, file: 2500 },
    { id: 'env', cfg: { enabled: true }, extra: { AGENT_RETURN_PASS: '500', AGENT_RETURN_FILE: '800' }, pass: 500, file: 800 },
    { id: 'config', cfg: { enabled: true, passTokens: 700, fileTokens: 900 }, extra: {}, pass: 700, file: 900 },
    { id: 'env-bad', cfg: { enabled: true }, extra: { AGENT_RETURN_PASS: 'abc', AGENT_RETURN_FILE: '-5' }, pass: 1000, file: 2500 },
  ];

  for (const src of SOURCES) {
    const ws = newWs(`sync-${src.id}`, src.cfg);
    const env = envFor(ws.home, src.extra);

    // Read what the subagent is TOLD, and parse the two numbers back out.
    let announcedPass = -1;
    let announcedFile = -1;
    runCase('announced', `sync-${src.id}-contract`, CONTRACT_MJS, { stdin: '', env, cwd: ws.proj }, (out) => {
      const text = out && out.hookSpecificOutput ? String(out.hookSpecificOutput.additionalContext) : '';
      const mp = text.match(/Over ~(\d+) tokens/);
      const mf = text.match(/over ~(\d+) write the detail/);
      announcedPass = mp ? Number(mp[1]) : -1;
      announcedFile = mf ? Number(mf[1]) : -1;
      check(`sync-${src.id}-announced-pass`, announcedPass, src.pass, `contract must announce PASS=${src.pass} for source "${src.id}"`);
      check(`sync-${src.id}-announced-file`, announcedFile, src.file, `contract must announce FILE=${src.file} for source "${src.id}"`);
      check(`sync-${src.id}-contract-text`, text, contractText(src.pass, src.file), 'full contract text must match the mirrored template');
    });

    // Now probe the guard at the ANNOUNCED numbers, not at hard-coded ones.
    const shot = (tokens) => ({
      stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(tokens) }),
      env,
      cwd: ws.proj,
    });
    runCase('announced', `sync-${src.id}-at-pass`, GUARD_MJS, shot(announcedPass),
      expectEmpty(`sync-${src.id}-at-pass`, `the announced PASS (${announcedPass}) must be exactly the enforced pass ceiling`));
    runCase('announced', `sync-${src.id}-over-pass`, GUARD_MJS, shot(announcedPass + 1),
      expectCompress(`sync-${src.id}-over-pass`, announcedPass + 1, announcedPass));
    runCase('announced', `sync-${src.id}-over-file`, GUARD_MJS, shot(announcedFile + 1),
      expectFile(`sync-${src.id}-over-file`, announcedFile + 1, announcedPass, announcedFile, 'tester'));
  }
}

// ── cleanup ─────────────────────────────────────────────────────────────────
try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

// ── report ──────────────────────────────────────────────────────────────────
console.log('\n=== agent-return E2E TEST REPORT ===');
for (const line of results) console.log(line);

let totalCases = 0;
let badCases = 0;
const perGroup = [];
for (const [name, g] of groups) {
  totalCases += g.cases;
  badCases += g.bad;
  perGroup.push(`${name} ${g.cases - g.bad}/${g.cases}`);
}
console.log(`\nGROUPS (passed/cases): ${perGroup.join(' | ')}`);
console.log(`CASES: ${totalCases} | OK: ${totalCases - badCases} | BAD: ${badCases}`);
console.log(`TOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed} | SKIP: 0`);
process.exit(failed > 0 ? 1 : 0);
