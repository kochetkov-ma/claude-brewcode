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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets');               // assets/
const GUARD_MJS = join(ASSETS, 'agent-return-guard.mjs');
const CONTRACT_MJS = join(ASSETS, 'agent-return-contract.mjs');

// realpath: process.cwd() in the child reports the resolved path, and the
// guard's project root is compared against it byte for byte.
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'ar-test-')));
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

/**
 * An ENABLED config, optional threshold overrides merged in.
 *
 * Only ever builds `enabled: true`. The hook's gate is `enabled !== true`, so an
 * absent or non-boolean key means OFF — the gate-polarity cases (enabled:false,
 * key absent, string "true", array config) therefore keep their literals below:
 * routing them through a factory that supplies the flag would silently switch
 * them on and they would pass for the wrong reason.
 */
function cfg(overrides) {
  return { enabled: true, ...overrides };
}

/** Isolated {home, proj} pair; `projCfg`/`globalCfg` may be an object or raw text. */
function newWs(name, projCfg, globalCfg) {
  const home = join(BASE, `${name}-home`);
  const proj = join(BASE, `${name}-proj`);
  mkdirSync(home, { recursive: true });
  mkdirSync(proj, { recursive: true });
  if (projCfg !== undefined) writeCfg(proj, projCfg);
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

const EMPTY_PATH = { root: '', date: '', time: '', slug: '', id: '' };

/**
 * `<root>/.claude/reports/YYYYMMDD-HHMMSS_<slug>-<id>/` split into its parts.
 * The id never contains `-`, so the greedy slug group splits on the LAST dash.
 */
function parseReportPath(p) {
  const m = p.match(/^(.+)\/\.claude\/reports\/(\d{8})-(\d{6})_([a-z0-9-]+)-([a-z0-9]+)\/$/);
  return m ? { root: m[1], date: m[2], time: m[3], slug: m[4], id: m[5] } : EMPTY_PATH;
}

function reportPathOf(out) {
  const reason = out && typeof out.reason === 'string' ? out.reason : '';
  const m = reason.match(/write the detail to `([^`]+)`/);
  return m ? m[1] : '';
}

/** Root / date / slug of the emitted path — shared by both file-tier builders. */
function checkPathParts(name, parts, expectedRoot, expectedSlug, p) {
  check(`${name}-path-root`, parts.root, expectedRoot,
    `report base must be the resolved project root, not the hook cwd (actual "${p}")`);
  check(`${name}-path-date`, parts.date, todayStamp(new Date()),
    'the report-path stamp must carry today date, generated live');
  check(`${name}-path-time-shape`, /^\d{6}$/.test(parts.time), true,
    `the report-path stamp must carry a HHMMSS time (actual "${p}")`);
  check(`${name}-path-slug`, parts.slug, expectedSlug,
    `report dir must carry the agent slug "${expectedSlug}" (actual "${p}")`);
}

/** File tier with no agent_id/session_id in the payload -> random 8-hex id. */
function expectFile(name, tokens, pass, file, expectedSlug, expectedRoot) {
  return (out) => {
    const p = reportPathOf(out);
    const parts = parseReportPath(p);
    checkPathParts(name, parts, expectedRoot, expectedSlug, p);
    check(`${name}-path-id-hex`, /^[0-9a-f]{8}$/.test(parts.id), true,
      `absent agent_id and session_id must yield a random 8-hex id (actual "${parts.id}")`);
    check(`${name}-out`, out, { decision: 'block', reason: fileReason(tokens, pass, file, p) },
      `~${tokens} tokens must block with the file order quoting budget ${pass} / threshold ${file}`);
  };
}

/** File tier with a known id source -> that exact sanitized id. */
function expectFileId(name, tokens, pass, file, expectedSlug, expectedRoot, expectedId) {
  return (out) => {
    const p = reportPathOf(out);
    const parts = parseReportPath(p);
    checkPathParts(name, parts, expectedRoot, expectedSlug, p);
    check(`${name}-path-id`, parts.id, expectedId,
      `report dir must end in the sanitized run id "${expectedId}" (actual "${p}")`);
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
  const ws = newWs('tier', cfg());
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
  runCase('tier', 'tier-2501', GUARD_MJS, shot(2501), expectFile('tier-2501', 2501, 1000, 2500, 'general-purpose', ws.proj));
  runCase('tier', 'tier-2502', GUARD_MJS, shot(2502), expectFile('tier-2502', 2502, 1000, 2500, 'general-purpose', ws.proj));
  runCase('tier', 'tier-50000', GUARD_MJS, shot(50000), expectFile('tier-50000', 50000, 1000, 2500, 'general-purpose', ws.proj));
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
  const ws = newWs('hatch', cfg());
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
    expectFile('hatch-reports-file', 4000, 1000, 2500, 'general-purpose', ws.proj));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 3 — fail-open (13 cases)
// GIVEN: the feature enabled, so the guard actually runs its decision path
// WHEN:  stdin is garbage, empty, a bare scalar, binary, huge or wrongly typed
// THEN:  always {} on stdout, exit 0, never exit 2
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('failopen', cfg());
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
  const ws = newWs('envok', cfg());
  const env = envFor(ws.home, { AGENT_RETURN_PASS: '500', AGENT_RETURN_FILE: '800' });
  const shot = (tokens) => ({
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(tokens) }),
    env,
    cwd: ws.proj,
  });

  runCase('env-valid', 'envok-500', GUARD_MJS, shot(500), expectEmpty('envok-500', 'exactly the overridden PASS still passes'));
  runCase('env-valid', 'envok-501', GUARD_MJS, shot(501), expectCompress('envok-501', 501, 500));
  runCase('env-valid', 'envok-800', GUARD_MJS, shot(800), expectCompress('envok-800', 800, 500));
  runCase('env-valid', 'envok-801', GUARD_MJS, shot(801), expectFile('envok-801', 801, 500, 800, 'tester', ws.proj));
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
  const ws = newWs('envbad', cfg());
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
      expectFile(`envbad-${tag}-file`, 2501, 1000, 2500, 'agent', ws.proj));
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
  const ws = newWs('slug', cfg());
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
    runCase('slug', name, GUARD_MJS, shot(payload), expectFile(name, 2501, 1000, 2500, expectedSlug, ws.proj));
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
  const ws = newWs('start', cfg());
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
  const keys = newWs('cfg-keys', cfg({ passTokens: 500, fileTokens: 800 }));
  runCase('config', 'cfg-keys-compress', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(501) }),
    env: keys.env, cwd: keys.proj,
  }, expectCompress('cfg-keys-compress', 501, 500));
  runCase('config', 'cfg-keys-file', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(801) }),
    env: keys.env, cwd: keys.proj,
  }, expectFile('cfg-keys-file', 801, 500, 800, 'tester', keys.proj));

  // 8.5 config key BEATS the env var
  runCase('config', 'cfg-beats-env', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: envFor(keys.home, { AGENT_RETURN_PASS: '1500', AGENT_RETURN_FILE: '9000' }),
    cwd: keys.proj,
  }, expectCompress('cfg-beats-env', 501, 500));

  // 8.6 env applies per-threshold when the config key is absent
  const halfKeys = newWs('cfg-half', cfg({ passTokens: 500 }));
  runCase('config', 'cfg-env-fills-gap', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: msg(801) }),
    env: envFor(halfKeys.home, { AGENT_RETURN_FILE: '800' }),
    cwd: halfKeys.proj,
  }, expectFile('cfg-env-fills-gap', 801, 500, 800, 'tester', halfKeys.proj));

  // 8.7 malformed project config is skipped -> the global one takes over
  const bad = newWs('cfg-bad', 'not json {{{', cfg({ passTokens: 500 }));
  runCase('config', 'cfg-malformed-falls-to-global', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: bad.env, cwd: bad.proj,
  }, expectCompress('cfg-malformed-falls-to-global', 501, 500));

  // 8.8 an ARRAY project config is not an object -> skipped, global takes over
  const arr = newWs('cfg-array', '[{"enabled":true}]', cfg({ passTokens: 500 }));
  runCase('config', 'cfg-array-falls-to-global', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: arr.env, cwd: arr.proj,
  }, expectCompress('cfg-array-falls-to-global', 501, 500));

  // 8.9 project config wins over global
  const both = newWs('cfg-both', cfg({ passTokens: 500 }), cfg({ passTokens: 2000 }));
  runCase('config', 'cfg-project-wins', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: both.env, cwd: both.proj,
  }, expectCompress('cfg-project-wins', 501, 500));

  // 8.10 discovery walks up from a nested subdir
  const nested = newWs('cfg-nested', cfg({ passTokens: 500 }));
  const deep = join(nested.proj, 'a', 'b', 'c');
  mkdirSync(deep, { recursive: true });
  runCase('config', 'cfg-nested-cwd', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: nested.env, cwd: deep,
  }, expectCompress('cfg-nested-cwd', 501, 500));

  // 8.11 depth: discovery starts at projectRoot(), so a `.claude`-marked root is
  //      found at ANY depth — 15 and 16 levels down both resolve the same file.
  const chain = (name, depth) => {
    const ws = newWs(name, cfg({ passTokens: 500 }));
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
  const deeper = chain('cfg-climb16', 16);
  runCase('config', 'cfg-climb-16', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: deeper.ws.env, cwd: deeper.cwd,
  }, expectCompress('cfg-climb-16', 501, 500));

  // 8.12 a global-only config still enables the feature
  const globalOnly = newWs('cfg-global', undefined, cfg({ passTokens: 500 }));
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
    { id: 'default', cfg: cfg(), extra: {}, pass: 1000, file: 2500 },
    { id: 'env', cfg: cfg(), extra: { AGENT_RETURN_PASS: '500', AGENT_RETURN_FILE: '800' }, pass: 500, file: 800 },
    { id: 'config', cfg: cfg({ passTokens: 700, fileTokens: 900 }), extra: {}, pass: 700, file: 900 },
    { id: 'env-bad', cfg: cfg(), extra: { AGENT_RETURN_PASS: 'abc', AGENT_RETURN_FILE: '-5' }, pass: 1000, file: 2500 },
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
      expectFile(`sync-${src.id}-over-file`, announcedFile + 1, announcedPass, announcedFile, 'tester', ws.proj));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 10 — report destination (BT-F23) (13 cases)
// GIVEN: enabled config and a file-tier return
// WHEN:  the hook runs from a nested cwd, with a payload cwd, with
//        CLAUDE_PROJECT_DIR set, or with agent_id / session_id present
// THEN:  the directive names <projectRoot>/.claude/reports/<stamp>_<slug>-<id>/
//        — an absolute base that ignores cwd drift, plus a per-invocation id so
//        two same-type agents stopping in the same second cannot collide
// ═════════════════════════════════════════════════════════════════════════════
{
  const ws = newWs('dest', cfg());
  const nested = join(ws.proj, 'a', 'b', 'c');
  mkdirSync(nested, { recursive: true });
  // A second, unrelated workspace: the child runs there (so the config is found
  // from ITS cwd) while the payload cwd still points inside `ws`.
  const away = newWs('dest-away', cfg());

  const payload = (extra) => JSON.stringify({
    hook_event_name: 'SubagentStop', agent_type: 'general-purpose',
    last_assistant_message: msg(2501), ...extra,
  });

  // 10.1 run id sources: agent_id wins, session_id is the fallback, then random
  const idCases = [
    ['dest-id-agent', { agent_id: 'A1B2-c3d4-EFGH-5678' }, 'a1b2c3d4'],
    ['dest-id-session', { session_id: 'sess-9f8e-7d6c' }, 'sess9f8e'],
    ['dest-id-agent-wins', { agent_id: 'agent777', session_id: 'sess-9f8e' }, 'agent777'],
    ['dest-id-short', { agent_id: 'A1' }, 'a1'],
    ['dest-id-agent-unusable', { agent_id: '!!! ***', session_id: 'ZZ-99' }, 'zz99'],
    ['dest-id-agent-nonstring', { agent_id: 42, session_id: 'ZZ-99' }, 'zz99'],
  ];
  for (const [name, extra, expectedId] of idCases) {
    runCase('report-dest', name, GUARD_MJS, { stdin: payload(extra), env: ws.env, cwd: ws.proj },
      expectFileId(name, 2501, 1000, 2500, 'general-purpose', ws.proj, expectedId));
  }
  runCase('report-dest', 'dest-id-both-unusable', GUARD_MJS,
    { stdin: payload({ agent_id: '!!!', session_id: '###' }), env: ws.env, cwd: ws.proj },
    expectFile('dest-id-both-unusable', 2501, 1000, 2500, 'general-purpose', ws.proj));

  // 10.2 collision: same type, same second, two agents -> two distinct dirs
  const dirsSeen = [];
  const captureDir = (name, expectedId) => (out) => {
    const p = reportPathOf(out);
    dirsSeen.push(p);
    expectFileId(name, 2501, 1000, 2500, 'general-purpose', ws.proj, expectedId)(out);
  };
  runCase('report-dest', 'dest-collide-a', GUARD_MJS,
    { stdin: payload({ agent_id: 'aaaa1111' }), env: ws.env, cwd: ws.proj },
    captureDir('dest-collide-a', 'aaaa1111'));
  runCase('report-dest', 'dest-collide-b', GUARD_MJS,
    { stdin: payload({ agent_id: 'bbbb2222' }), env: ws.env, cwd: ws.proj },
    captureDir('dest-collide-b', 'bbbb2222'));
  check('dest-collide-distinct', new Set(dirsSeen).size, 2,
    'two same-type agents must never be handed the same report directory');

  // 10.3 root resolution: nested cwd, payload cwd, CLAUDE_PROJECT_DIR
  runCase('report-dest', 'dest-root-nested-cwd', GUARD_MJS,
    { stdin: payload({ agent_id: 'nest0001' }), env: ws.env, cwd: nested },
    expectFileId('dest-root-nested-cwd', 2501, 1000, 2500, 'general-purpose', ws.proj, 'nest0001'));
  runCase('report-dest', 'dest-root-payload-cwd', GUARD_MJS,
    { stdin: payload({ agent_id: 'nest0002', cwd: nested }), env: away.env, cwd: away.proj },
    expectFileId('dest-root-payload-cwd', 2501, 1000, 2500, 'general-purpose', ws.proj, 'nest0002'));
  runCase('report-dest', 'dest-root-env', GUARD_MJS, {
    stdin: payload({ agent_id: 'nest0003', cwd: nested }),
    env: envFor(ws.home, { CLAUDE_PROJECT_DIR: ws.proj }),
    cwd: nested,
  }, expectFileId('dest-root-env', 2501, 1000, 2500, 'general-purpose', ws.proj, 'nest0003'));

  // 10.4 fail-safe: a non-string cwd degrades the path, never the budget
  runCase('report-dest', 'dest-cwd-nonstring', GUARD_MJS,
    { stdin: payload({ agent_id: 'badcwd11', cwd: 42 }), env: ws.env, cwd: ws.proj },
    expectFileId('dest-cwd-nonstring', 2501, 1000, 2500, 'general-purpose', ws.proj, 'badcwd11'));

  // 10.5 at-most-once survives the new path code: the brake still wins
  runCase('report-dest', 'dest-brake-file-tier', GUARD_MJS, {
    stdin: payload({ agent_id: 'aaaa1111', stop_hook_active: true }), env: ws.env, cwd: ws.proj,
  }, expectEmpty('dest-brake-file-tier',
    'stop_hook_active brakes before any path is built — the file tier blocks at most once'));
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 11 — config root (BT-N02) (6 cases)
// GIVEN: three candidate configs, each with a UNIQUE passTokens, so the enforced
//        number names exactly one file on disk:
//          <root>/.claude/agent-return.json   500/800
//          <away>/.claude/agent-return.json   700/1400
//          <home>/.claude/agent-return.json  2000/9000
// WHEN:  CLAUDE_PROJECT_DIR names the root while the hook runs elsewhere, or the
//        hook runs 16 levels below the root
// THEN:  the root file is the one read — by both hooks — and the guard's report
//        base is that same root. A CLAUDE_PROJECT_DIR that does not exist is
//        ignored, exactly as projectRoot() specifies.
// ═════════════════════════════════════════════════════════════════════════════
{
  const root = newWs('cfgroot', cfg({ passTokens: 500, fileTokens: 800 }),
    cfg({ passTokens: 2000, fileTokens: 9000 }));
  const away = newWs('cfgroot-away', cfg({ passTokens: 700, fileTokens: 1400 }));
  const ROOT_CFG = join(root.proj, '.claude', 'agent-return.json');
  const AWAY_CFG = join(away.proj, '.claude', 'agent-return.json');
  const envRoot = envFor(root.home, { CLAUDE_PROJECT_DIR: root.proj });

  // 11.1 the hook runs in an unrelated repo; CLAUDE_PROJECT_DIR decides
  runCase('config-root', 'cfgroot-env-compress', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: envRoot, cwd: away.proj,
  }, expectCompress('cfgroot-env-compress', 501, 500));

  // 11.2 same run at the file tier: config root and report root are ONE root
  runCase('config-root', 'cfgroot-env-file', GUARD_MJS, {
    stdin: JSON.stringify({
      hook_event_name: 'SubagentStop', agent_type: 'tester', agent_id: 'root0001',
      last_assistant_message: msg(801),
    }),
    env: envRoot, cwd: away.proj,
  }, expectFileId('cfgroot-env-file', 801, 500, 800, 'tester', root.proj, 'root0001'));

  // 11.3 the SubagentStart contract resolves the same file
  runCase('config-root', 'cfgroot-env-contract', CONTRACT_MJS, { stdin: '', env: envRoot, cwd: away.proj },
    expectContract('cfgroot-env-contract', 500, 800));

  // 11.4 a CLAUDE_PROJECT_DIR that does not exist is ignored -> cwd's own config
  runCase('config-root', 'cfgroot-env-missing-dir', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(701) }),
    env: envFor(away.home, { CLAUDE_PROJECT_DIR: join(BASE, 'no-such-dir') }), cwd: away.proj,
  }, expectCompress('cfgroot-env-missing-dir', 701, 700));

  // 11.5 no env var: the `.claude` marker walk finds the root config 16 levels down,
  //      and it beats the global one (500, not 2000)
  let deep = root.proj;
  for (let i = 0; i < 16; i++) deep = join(deep, `d${i}`);
  mkdirSync(deep, { recursive: true });
  runCase('config-root', 'cfgroot-deep-cwd', GUARD_MJS, {
    stdin: JSON.stringify({ hook_event_name: 'SubagentStop', last_assistant_message: msg(501) }),
    env: root.env, cwd: deep,
  }, expectCompress('cfgroot-deep-cwd', 501, 500));

  // 11.6 the two candidate files are distinct paths — the numbers above identify one each
  check('cfgroot-candidates-distinct', new Set([ROOT_CFG, AWAY_CFG]).size, 2,
    `passTokens 500 identifies ${ROOT_CFG} and 700 identifies ${AWAY_CFG}`);
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
