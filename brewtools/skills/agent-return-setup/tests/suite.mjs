#!/usr/bin/env node
// E2E for agent-return hook pair (contract + guard): each case = REAL child (JSON stdin -> JSON stdout), exit/stderr/stdout exact.
// Isolated: tmpdir workspace + own HOME; real ~/.claude, repo .claude/ untouched; AGENT_RETURN_*, CLAUDE_PROJECT_DIR, CLAUDE_CONFIG_DIR scrubbed.
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync, readFileSync,
  readdirSync, utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets');               // assets/
const GUARD_MJS = join(ASSETS, 'agent-return-guard.mjs');
const CONTRACT_MJS = join(ASSETS, 'agent-return-contract.mjs');
const RUNBOOK = join(ASSETS, 'INSTALL.md');
const ASSET_NAMES = ['agent-return-budget.mjs', 'agent-return-contract.mjs', 'agent-return-guard.mjs'];

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

// One case = one child; exit code + stderr asserted here, `assert` owns stdout.
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
  delete e.CLAUDE_CONFIG_DIR;
  return { ...e, ...(extra || {}) };
}

// The guard challenges each agent_id once, so every shot carries its own id.
// Every auto id cleans to the same 8-char report-dir suffix, AUTO_PATH_ID.
const AUTO_PATH_ID = 't0000000';
let idSeq = 0;
function nextId() {
  idSeq++;
  return `${AUTO_PATH_ID}-${idSeq}`;
}

/** SubagentStop payload (classic path); a fresh agent_id unless `fields` names one. */
function stopPayload(fields) {
  const base = { hook_event_name: 'SubagentStop', agent_id: nextId() };
  return JSON.stringify({ ...base, ...fields });
}

/** PreToolUse SubagentHandback payload (auto path); a fresh agent_id unless `fields` names one. */
function handbackPayload(message, fields) {
  return JSON.stringify({
    hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', agent_id: nextId(),
    tool_input: { message }, ...fields,
  });
}

/** Where the guard keeps the once-per-agent marker for `agentId` under `claudeDir`. */
function markerFile(claudeDir, agentId) {
  const name = createHash('sha256').update(agentId).digest('hex').slice(0, 32);
  return join(claudeDir, 'agent-return-state', `${name}.json`);
}

/** Marker content, or a sentinel when the file is absent or unreadable. */
function readMarker(claudeDir, agentId) {
  return safeParse(existsSync(markerFile(claudeDir, agentId))
    ? readFileSync(markerFile(claudeDir, agentId), 'utf8')
    : '"NO MARKER"');
}

// ENABLED config + optional threshold overrides; gate is `enabled !== true`, so gate-polarity cases
// (enabled:false, absent, "true", array) keep literals: this factory would switch them on.
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

/** `overflow` = the one sentence that differs between a writing and a read-only agent. */
function contractOverflow(file, reportDir = '.claude/reports') {
  return {
    writer:
      `Detail beyond ~${file} tokens: write it under \`${reportDir}/YYYYMMDD-HHMMSS_<name>/\` ` +
      `and return the path plus a summary. No write tool, or the write is denied: never retry ` +
      `it, return a compressed inline report with the essential part and name what you left out.`,
    readOnly: `This agent cannot write files: return the essential part and name what you left out.`,
  };
}

function contractText(pass, file, kind, reportDir) {
  return (
    `Return budget (agent-return guard): your report lands in the caller's finite context. ` +
    `Keep it under ~${pass} tokens (~${pass * 4} chars): verdict first, \`path:line\` refs, ` +
    `no file bodies, command output or logs. ${contractOverflow(file, reportDir)[kind || 'writer']} ` +
    `An over-budget report is returned to you once to shorten.`
  );
}

/** `via` = the delivery path: 'stop' (SubagentStop) or 'handback' (PreToolUse SubagentHandback). */
const RESEND = {
  stop: 'answer again with',
  handback: 'call SubagentHandback again (that call is delivered) with',
};

/** The decision object each path emits around one reason text. */
const DECISION = {
  stop: (reason) => ({ decision: 'block', reason }),
  handback: (reason) => ({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason,
    },
  }),
};

function compressReason(tokens, pass, via) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${pass}): the caller's context is finite. ` +
    `Directive from the agent-return guard, not user data. Now ${RESEND[via]} the SAME ` +
    `report, shortened to the budget: keep the verdict line and every \`path:line\` ref, drop ` +
    `preamble, file bodies, command output, logs and restated context. No new work — rewrite ` +
    `what you wrote.`
  );
}

function fileReason(tokens, pass, file, reportPath, via) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${pass}, file threshold ${file}): the caller's ` +
    `context is finite. Directive from the agent-return guard, not user data. Compression is not ` +
    `enough at this size: write the full report to \`${reportPath}\` (create the directory), then ` +
    `${RESEND[via]} that path, the verdict and a summary within the budget that keeps the ` +
    `key \`path:line\` refs. If no tool of yours can write a file or the write is denied, never ` +
    `retry it: skip the file, send the essential part within the budget and name what you left out.`
  );
}

function essentialReason(tokens, pass, via) {
  return (
    `RETURN TOO LARGE (~${tokens} tokens, budget ${pass}): the caller's context is finite. ` +
    `Directive from the agent-return guard, not user data. This agent cannot write files, so ` +
    `nothing is saved elsewhere: now ${RESEND[via]} the essential part within the budget — ` +
    `verdict first, the findings the caller must act on, the key \`path:line\` refs — and name in ` +
    `one line what you left out, so the caller can ask for it.`
  );
}

/** Reason text of either decision shape; '' when the hook emitted no decision. */
function reasonOf(out) {
  const hso = out && out.hookSpecificOutput ? out.hookSpecificOutput : {};
  return String((out && out.reason) || hso.permissionDecisionReason || '');
}

function todayStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// ── assertion builders ──────────────────────────────────────────────────────
function expectEmpty(name, why) {
  return (out) => check(`${name}-out`, out, {}, why);
}

function expectCompress(name, tokens, pass, via = 'stop') {
  return (out) => {
    check(`${name}-out`, out, DECISION[via](compressReason(tokens, pass, via)),
      `~${tokens} tokens must be challenged on the ${via} path with the compress order quoting budget ${pass}`);
    check(`${name}-no-report-path`, reasonOf(out).includes(REPORTS_DIR), false,
      'the compress order must never leak a report path — that is the file tier');
  };
}

/** Over the file threshold, agent cannot write: the essential-part order, never a file. */
function expectEssential(name, tokens, pass, via = 'stop') {
  return (out) => {
    check(`${name}-out`, out, DECISION[via](essentialReason(tokens, pass, via)),
      `~${tokens} tokens from an agent that cannot write must get the essential-part order on the ${via} path`);
    check(`${name}-no-report-path`, reasonOf(out).includes(REPORTS_DIR), false,
      'an agent that cannot write must never be handed a report path');
  };
}

const EMPTY_PATH = { root: '', date: '', time: '', slug: '', id: '' };

// Splits `<root>/.claude/reports/YYYYMMDD-HHMMSS_<slug>-<id>/`; id has no `-`, so greedy slug splits on LAST dash.
function parseReportPath(p) {
  const m = p.match(/^(.+)\/\.claude\/reports\/(\d{8})-(\d{6})_([a-z0-9-]+)-([a-z0-9]+)\/$/);
  return m ? { root: m[1], date: m[2], time: m[3], slug: m[4], id: m[5] } : EMPTY_PATH;
}

function reportPathOf(out) {
  const m = reasonOf(out).match(/write the full report to `([^`]+)`/);
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

/** File tier, agent_id with no usable char and no session_id -> random 8-hex id. */
function expectFileRandom(name, tokens, pass, file, expectedSlug, expectedRoot) {
  return (out) => {
    const p = reportPathOf(out);
    const parts = parseReportPath(p);
    checkPathParts(name, parts, expectedRoot, expectedSlug, p);
    check(`${name}-path-id-hex`, /^[0-9a-f]{8}$/.test(parts.id), true,
      `an unusable agent_id and no session_id must yield a random 8-hex id (actual "${parts.id}")`);
    check(`${name}-out`, out, DECISION.stop(fileReason(tokens, pass, file, p, 'stop')),
      `~${tokens} tokens must block with the file order quoting budget ${pass} / threshold ${file}`);
  };
}

/** File tier with a known id source -> that exact sanitized id. */
function expectFileId(name, tokens, pass, file, expectedSlug, expectedRoot, expectedId, via = 'stop') {
  return (out) => {
    const p = reportPathOf(out);
    const parts = parseReportPath(p);
    checkPathParts(name, parts, expectedRoot, expectedSlug, p);
    check(`${name}-path-id`, parts.id, expectedId,
      `report dir must end in the sanitized run id "${expectedId}" (actual "${p}")`);
    check(`${name}-out`, out, DECISION[via](fileReason(tokens, pass, file, p, via)),
      `~${tokens} tokens must be challenged on the ${via} path with the file order quoting budget ${pass} / threshold ${file}`);
  };
}

/** File tier for a shot whose agent_id came from nextId(). */
function expectFile(name, tokens, pass, file, expectedSlug, expectedRoot, via = 'stop') {
  return expectFileId(name, tokens, pass, file, expectedSlug, expectedRoot, AUTO_PATH_ID, via);
}

function expectContract(name, pass, file, kind = 'writer', reportDir = undefined) {
  const text = contractText(pass, file, kind, reportDir);
  return (out) => {
    check(`${name}-out`, out,
      { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } },
      `SubagentStart must announce ${pass}/${file} with the ${kind} text`);
    const hso = out && out.hookSpecificOutput ? out.hookSpecificOutput : {};
    check(`${name}-schema`, Object.keys(hso), ['hookEventName', 'additionalContext'],
      'hookSpecificOutput carries exactly hookEventName + additionalContext');
    check(`${name}-context-length`, String(hso.additionalContext || '').length, text.length,
      'additionalContext is the full contract, not an empty string');
  };
}

// ═══ Group 1 — tier boundaries (9 cases) ═══
// GIVEN enabled, defaults 2500/6000 WHEN return of exactly N est-tokens THEN <=2500 pass, 2501..6000 compress, >6000 file
{
  const ws = newWs('tier', cfg());
  const shot = (tokens) => ({
    stdin: stopPayload({ agent_type: 'general-purpose', last_assistant_message: msg(tokens) }),
    env: ws.env,
    cwd: ws.proj,
  });

  runCase('tier', 'tier-2499', GUARD_MJS, shot(2499), expectEmpty('tier-2499', '2499 <= PASS must pass silently'));
  runCase('tier', 'tier-2500', GUARD_MJS, shot(2500), expectEmpty('tier-2500', 'exactly PASS must pass — inclusive low boundary'));
  runCase('tier', 'tier-2501', GUARD_MJS, shot(2501), expectCompress('tier-2501', 2501, 2500));
  runCase('tier', 'tier-2502', GUARD_MJS, shot(2502), expectCompress('tier-2502', 2502, 2500));
  runCase('tier', 'tier-5999', GUARD_MJS, shot(5999), expectCompress('tier-5999', 5999, 2500));
  runCase('tier', 'tier-6000', GUARD_MJS, shot(6000), expectCompress('tier-6000', 6000, 2500));
  runCase('tier', 'tier-6001', GUARD_MJS, shot(6001), expectFile('tier-6001', 6001, 2500, 6000, 'general-purpose', ws.proj));
  runCase('tier', 'tier-6002', GUARD_MJS, shot(6002), expectFile('tier-6002', 6002, 2500, 6000, 'general-purpose', ws.proj));
  runCase('tier', 'tier-50000', GUARD_MJS, shot(50000), expectFile('tier-50000', 50000, 2500, 6000, 'general-purpose', ws.proj));
}

// ═══ Group 2 — escape hatches (12 cases) ═══
// GIVEN defaults WHEN brake/unusable message/report-path mention THEN true brakes, "true" not; non-string/blank no-op; path mention != bypass (SPEC §8a)
{
  const ws = newWs('hatch', cfg());
  const shot = (payload) => ({ stdin: stopPayload(payload), env: ws.env, cwd: ws.proj });
  const base = { agent_type: 'general-purpose' };

  runCase('escape-hatch', 'hatch-brake-true', GUARD_MJS,
    shot({ ...base, stop_hook_active: true, last_assistant_message: msg(50000) }),
    expectEmpty('hatch-brake-true', 'stop_hook_active===true brakes the classic path — block at most once'));

  runCase('escape-hatch', 'hatch-brake-string', GUARD_MJS,
    shot({ ...base, stop_hook_active: 'true', last_assistant_message: msg(2501) }),
    expectCompress('hatch-brake-string', 2501, 2500));

  // `1 == true` in JS, so a loose comparison in the guard would brake here and
  // the string case above would not catch it.
  runCase('escape-hatch', 'hatch-brake-one', GUARD_MJS,
    shot({ ...base, stop_hook_active: 1, last_assistant_message: msg(2501) }),
    expectCompress('hatch-brake-one', 2501, 2500));

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
    shot({ ...base, last_assistant_message: msg(3000, 'See .claude/reports/foo/ for detail. ') }),
    expectCompress('hatch-reports-compress', 3000, 2500));

  const tail = ' .claude/reports/foo/';
  runCase('escape-hatch', 'hatch-reports-file', GUARD_MJS,
    shot({ ...base, last_assistant_message: 'x'.repeat(7000 * 4 - tail.length) + tail }),
    expectFile('hatch-reports-file', 7000, 2500, 6000, 'general-purpose', ws.proj));
}

// ═══ Group 3 — fail-open (15 cases) ═══
// GIVEN enabled WHEN stdin garbage/empty/scalar/binary/huge/mistyped THEN always {} on stdout, exit 0, never exit 2
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
    ['fo-wrong-types-with-id', stopPayload({
      session_id: [], agent_type: {}, stop_hook_active: 'yes',
      last_assistant_message: { nested: true }, cwd: null,
    }), 'wrong types behind a valid agent_id and event'],
    ['fo-handback-wrong-types', handbackPayload(msg(50000), { tool_input: 'not an object', agent_type: [] }),
      'hand-back with a non-object tool_input'],
  ];
  for (const [name, raw, why] of cases) {
    runCase('fail-open', name, GUARD_MJS, shot(raw), expectEmpty(name, `fail-open: ${why} -> {} exit 0`));
  }
}

// ═══ Group 4 — valid env overrides (5 cases) ═══
// GIVEN no threshold keys, AGENT_RETURN_PASS=500 FILE=800 WHEN 500/501/800/801 + spawn THEN tiers and contract move to 500/800
{
  const ws = newWs('envok', cfg());
  const env = envFor(ws.home, { AGENT_RETURN_PASS: '500', AGENT_RETURN_FILE: '800' });
  const shot = (tokens) => ({
    stdin: stopPayload({ agent_type: 'tester', last_assistant_message: msg(tokens) }),
    env,
    cwd: ws.proj,
  });

  runCase('env-valid', 'envok-500', GUARD_MJS, shot(500), expectEmpty('envok-500', 'exactly the overridden PASS still passes'));
  runCase('env-valid', 'envok-501', GUARD_MJS, shot(501), expectCompress('envok-501', 501, 500));
  runCase('env-valid', 'envok-800', GUARD_MJS, shot(800), expectCompress('envok-800', 800, 500));
  runCase('env-valid', 'envok-801', GUARD_MJS, shot(801), expectFile('envok-801', 801, 500, 800, 'tester', ws.proj));
  runCase('env-valid', 'envok-contract', CONTRACT_MJS, { stdin: '', env, cwd: ws.proj }, expectContract('envok-contract', 500, 800));
}

// ═══ Group 5 — invalid env overrides (44 cases = 11 values x 4 probes) ═══
// GIVEN both env vars = same rejected literal WHEN 2500/2501/6001 + spawn THEN built-in 2500/6000, contract in lockstep
{
  const ws = newWs('envbad', cfg());
  const BAD = ['1.7', 'abc', '12abc', '-5', '0', '', '   ', '1e400', 'NaN', 'Infinity', '2500.0000001'];
  for (const raw of BAD) {
    const tag = raw.trim() === '' ? `blank${raw.length}` : raw.replace(/[^A-Za-z0-9.]+/g, '_');
    const env = envFor(ws.home, { AGENT_RETURN_PASS: raw, AGENT_RETURN_FILE: raw });
    const shot = (tokens) => ({
      stdin: stopPayload({ last_assistant_message: msg(tokens) }),
      env,
      cwd: ws.proj,
    });

    runCase('env-invalid', `envbad-${tag}-pass`, GUARD_MJS, shot(2500),
      expectEmpty(`envbad-${tag}-pass`, `"${raw}" must fall back — 2500 still passes`));
    runCase('env-invalid', `envbad-${tag}-compress`, GUARD_MJS, shot(2501),
      expectCompress(`envbad-${tag}-compress`, 2501, 2500));
    runCase('env-invalid', `envbad-${tag}-file`, GUARD_MJS, shot(6001),
      expectFile(`envbad-${tag}-file`, 6001, 2500, 6000, 'agent', ws.proj));
    runCase('env-invalid', `envbad-${tag}-contract`, CONTRACT_MJS, { stdin: '', env, cwd: ws.proj },
      expectContract(`envbad-${tag}-contract`, 2500, 6000));
  }
}

// ═══ Group 6 — agent_type slug (16 cases) ═══
// GIVEN 6001-token return WHEN agent_type absent/unusable/punctuation/non-latin/overlong THEN [a-z0-9-], max 48, no leading/trailing dashes, fallback "agent"
{
  const ws = newWs('slug', cfg());
  const body = msg(6001);
  const shot = (payload) => ({
    stdin: stopPayload({ last_assistant_message: body, ...payload }),
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
    runCase('slug', name, GUARD_MJS, shot(payload), expectFile(name, 6001, 2500, 6000, expectedSlug, ws.proj));
  }
}

// ═══ Group 7 — SubagentStart contract (3 cases) ═══
// GIVEN defaults WHEN no/garbage stdin or real non-read-only spawn THEN identical schema + general text, never silence
{
  const ws = newWs('start', cfg());
  runCase('subagent-start', 'start-no-stdin', CONTRACT_MJS, { stdin: '', env: ws.env, cwd: ws.proj },
    expectContract('start-no-stdin', 2500, 6000));
  runCase('subagent-start', 'start-garbage', CONTRACT_MJS, { stdin: '\u0000not json{{{', env: ws.env, cwd: ws.proj },
    expectContract('start-garbage', 2500, 6000));
  runCase('subagent-start', 'start-payload', CONTRACT_MJS, {
    stdin: JSON.stringify({
      hook_event_name: 'SubagentStart', session_id: 'S1', agent_id: 'A1',
      agent_type: 'general-purpose', cwd: ws.proj, prompt: 'do the thing',
    }),
    env: ws.env,
    cwd: ws.proj,
  }, expectContract('start-payload', 2500, 6000));
}

// ═══ Group 8 — config layer (16 cases) — this port's addition, no upstream twin ═══
// GIVEN .claude/agent-return.json up 16 dirs, then ~/.claude THEN absent/invalid = OFF both hooks; keys move tiers, beat env; malformed project skipped; project > global
{
  // 8.1 no config anywhere -> both hooks no-op (disabled by default)
  const none = newWs('cfg-none');
  runCase('config', 'cfg-none-guard', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'x', last_assistant_message: msg(50000) }),
    env: none.env, cwd: none.proj,
  }, expectEmpty('cfg-none-guard', 'no config anywhere -> guard is a no-op even at 50000 tokens'));
  runCase('config', 'cfg-none-contract', CONTRACT_MJS, { stdin: '', env: none.env, cwd: none.proj },
    expectEmpty('cfg-none-contract', 'no config anywhere -> SubagentStart injects nothing'));

  // 8.2 enabled:false -> off for both hooks
  const off = newWs('cfg-off', { enabled: false, passTokens: 100 });
  runCase('config', 'cfg-off-guard', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'x', last_assistant_message: msg(50000) }),
    env: off.env, cwd: off.proj,
  }, expectEmpty('cfg-off-guard', 'enabled:false -> no-op even on a huge message'));
  runCase('config', 'cfg-off-contract', CONTRACT_MJS, { stdin: '', env: off.env, cwd: off.proj },
    expectEmpty('cfg-off-contract', 'enabled:false -> no contract injected'));

  // 8.3 the enable gate is exactly `true`
  const missingFlag = newWs('cfg-noflag', { passTokens: 500 });
  runCase('config', 'cfg-flag-missing', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(50000) }),
    env: missingFlag.env, cwd: missingFlag.proj,
  }, expectEmpty('cfg-flag-missing', 'thresholds without enabled:true stay off'));
  const strFlag = newWs('cfg-strflag', { enabled: 'true' });
  runCase('config', 'cfg-flag-string', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(50000) }),
    env: strFlag.env, cwd: strFlag.proj,
  }, expectEmpty('cfg-flag-string', 'enabled:"true" (string) is not the boolean gate'));

  // 8.4 enabled:true with custom thresholds -> tiers move
  const keys = newWs('cfg-keys', cfg({ passTokens: 500, fileTokens: 800 }));
  runCase('config', 'cfg-keys-compress', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'tester', last_assistant_message: msg(501) }),
    env: keys.env, cwd: keys.proj,
  }, expectCompress('cfg-keys-compress', 501, 500));
  runCase('config', 'cfg-keys-file', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'tester', last_assistant_message: msg(801) }),
    env: keys.env, cwd: keys.proj,
  }, expectFile('cfg-keys-file', 801, 500, 800, 'tester', keys.proj));

  // 8.5 config key BEATS the env var
  runCase('config', 'cfg-beats-env', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: envFor(keys.home, { AGENT_RETURN_PASS: '1500', AGENT_RETURN_FILE: '9000' }),
    cwd: keys.proj,
  }, expectCompress('cfg-beats-env', 501, 500));

  // 8.6 env applies per-threshold when the config key is absent
  const halfKeys = newWs('cfg-half', cfg({ passTokens: 500 }));
  runCase('config', 'cfg-env-fills-gap', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'tester', last_assistant_message: msg(801) }),
    env: envFor(halfKeys.home, { AGENT_RETURN_FILE: '800' }),
    cwd: halfKeys.proj,
  }, expectFile('cfg-env-fills-gap', 801, 500, 800, 'tester', halfKeys.proj));

  // 8.7 malformed project config is skipped -> the global one takes over
  const bad = newWs('cfg-bad', 'not json {{{', cfg({ passTokens: 500 }));
  runCase('config', 'cfg-malformed-falls-to-global', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: bad.env, cwd: bad.proj,
  }, expectCompress('cfg-malformed-falls-to-global', 501, 500));

  // 8.8 an ARRAY project config is not an object -> skipped, global takes over
  const arr = newWs('cfg-array', '[{"enabled":true}]', cfg({ passTokens: 500 }));
  runCase('config', 'cfg-array-falls-to-global', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: arr.env, cwd: arr.proj,
  }, expectCompress('cfg-array-falls-to-global', 501, 500));

  // 8.9 project config wins over global
  const both = newWs('cfg-both', cfg({ passTokens: 500 }), cfg({ passTokens: 2000 }));
  runCase('config', 'cfg-project-wins', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: both.env, cwd: both.proj,
  }, expectCompress('cfg-project-wins', 501, 500));

  // 8.10 discovery walks up from a nested subdir
  const nested = newWs('cfg-nested', cfg({ passTokens: 500 }));
  const deep = join(nested.proj, 'a', 'b', 'c');
  mkdirSync(deep, { recursive: true });
  runCase('config', 'cfg-nested-cwd', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
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
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: inRange.ws.env, cwd: inRange.cwd,
  }, expectCompress('cfg-climb-15', 501, 500));
  const deeper = chain('cfg-climb16', 16);
  runCase('config', 'cfg-climb-16', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: deeper.ws.env, cwd: deeper.cwd,
  }, expectCompress('cfg-climb-16', 501, 500));

  // 8.12 a global-only config still enables the feature
  const globalOnly = newWs('cfg-global', undefined, cfg({ passTokens: 500 }));
  runCase('config', 'cfg-global-only', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: globalOnly.env, cwd: globalOnly.proj,
  }, expectCompress('cfg-global-only', 501, 500));
}

// ═══ Group 9 — announced == enforced (16 cases = 4 sources x 4 probes) ═══
// GIVEN default/env/config/rejected env WHEN contract numbers PARSED, fed as probes THEN equal expected; announcedPass passes, +1 compresses, announcedFile+1 files
{
  const SOURCES = [
    { id: 'default', cfg: cfg(), extra: {}, pass: 2500, file: 6000 },
    { id: 'env', cfg: cfg(), extra: { AGENT_RETURN_PASS: '500', AGENT_RETURN_FILE: '800' }, pass: 500, file: 800 },
    { id: 'config', cfg: cfg({ passTokens: 700, fileTokens: 900 }), extra: {}, pass: 700, file: 900 },
    { id: 'env-bad', cfg: cfg(), extra: { AGENT_RETURN_PASS: 'abc', AGENT_RETURN_FILE: '-5' }, pass: 2500, file: 6000 },
  ];

  for (const src of SOURCES) {
    const ws = newWs(`sync-${src.id}`, src.cfg);
    const env = envFor(ws.home, src.extra);

    // Read what the subagent is TOLD, and parse the two numbers back out.
    let announcedPass = -1;
    let announcedFile = -1;
    runCase('announced', `sync-${src.id}-contract`, CONTRACT_MJS, { stdin: '', env, cwd: ws.proj }, (out) => {
      const text = out && out.hookSpecificOutput ? String(out.hookSpecificOutput.additionalContext) : '';
      const mp = text.match(/Keep it under ~(\d+) tokens/);
      const mf = text.match(/Detail beyond ~(\d+) tokens/);
      announcedPass = mp ? Number(mp[1]) : -1;
      announcedFile = mf ? Number(mf[1]) : -1;
      check(`sync-${src.id}-announced-pass`, announcedPass, src.pass, `contract must announce PASS=${src.pass} for source "${src.id}"`);
      check(`sync-${src.id}-announced-file`, announcedFile, src.file, `contract must announce FILE=${src.file} for source "${src.id}"`);
      check(`sync-${src.id}-contract-text`, text, contractText(src.pass, src.file), 'full contract text must match the mirrored template');
    });

    // Now probe the guard at the ANNOUNCED numbers, not at hard-coded ones.
    const shot = (tokens) => ({
      stdin: stopPayload({ agent_type: 'tester', last_assistant_message: msg(tokens) }),
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

// ═══ Group 10 — report destination (BT-F23) (13 cases) ═══
// GIVEN file-tier WHEN nested/payload cwd, CLAUDE_PROJECT_DIR, agent_id/session_id THEN <projectRoot>/.claude/reports/<stamp>_<slug>-<id>/, per-call id, no collision
{
  const ws = newWs('dest', cfg());
  const nested = join(ws.proj, 'a', 'b', 'c');
  mkdirSync(nested, { recursive: true });
  // A second, unrelated workspace: the child runs there (so the config is found
  // from ITS cwd) while the payload cwd still points inside `ws`.
  const away = newWs('dest-away', cfg());

  const payload = (extra) => stopPayload({
    agent_type: 'general-purpose', last_assistant_message: msg(6001), ...extra,
  });

  // 10.1 run id sources: agent_id wins; an agent_id with no usable char falls
  //      back to session_id, then to random
  const idCases = [
    ['dest-id-agent', { agent_id: 'A1B2-c3d4-EFGH-5678' }, 'a1b2c3d4'],
    ['dest-id-session', { agent_id: '---', session_id: 'sess-9f8e-7d6c' }, 'sess9f8e'],
    ['dest-id-agent-wins', { agent_id: 'agent777', session_id: 'sess-9f8e' }, 'agent777'],
    ['dest-id-short', { agent_id: 'A1' }, 'a1'],
    ['dest-id-agent-unusable', { agent_id: '!!! ***', session_id: 'ZZ-99' }, 'zz99'],
  ];
  for (const [name, extra, expectedId] of idCases) {
    runCase('report-dest', name, GUARD_MJS, { stdin: payload(extra), env: ws.env, cwd: ws.proj },
      expectFileId(name, 6001, 2500, 6000, 'general-purpose', ws.proj,expectedId));
  }
  runCase('report-dest', 'dest-id-both-unusable', GUARD_MJS,
    { stdin: payload({ agent_id: '!!!', session_id: '###' }), env: ws.env, cwd: ws.proj },
    expectFileRandom('dest-id-both-unusable', 6001, 2500, 6000, 'general-purpose', ws.proj));

  // 10.2 collision: same type, same second, two agents -> two distinct dirs
  const dirsSeen = [];
  const captureDir = (name, expectedId) => (out) => {
    const p = reportPathOf(out);
    dirsSeen.push(p);
    expectFileId(name, 6001, 2500, 6000, 'general-purpose', ws.proj,expectedId)(out);
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
    expectFileId('dest-root-nested-cwd', 6001, 2500, 6000, 'general-purpose', ws.proj,'nest0001'));
  runCase('report-dest', 'dest-root-payload-cwd', GUARD_MJS,
    { stdin: payload({ agent_id: 'nest0002', cwd: nested }), env: away.env, cwd: away.proj },
    expectFileId('dest-root-payload-cwd', 6001, 2500, 6000, 'general-purpose', ws.proj,'nest0002'));
  runCase('report-dest', 'dest-root-env', GUARD_MJS, {
    stdin: payload({ agent_id: 'nest0003', cwd: nested }),
    env: envFor(ws.home, { CLAUDE_PROJECT_DIR: ws.proj }),
    cwd: nested,
  }, expectFileId('dest-root-env', 6001, 2500, 6000, 'general-purpose', ws.proj,'nest0003'));

  // 10.4 fail-safe: a non-string cwd degrades the path, never the budget
  runCase('report-dest', 'dest-cwd-nonstring', GUARD_MJS,
    { stdin: payload({ agent_id: 'badcwd11', cwd: 42 }), env: ws.env, cwd: ws.proj },
    expectFileId('dest-cwd-nonstring', 6001, 2500, 6000, 'general-purpose', ws.proj,'badcwd11'));

  // 10.5 at-most-once survives the new path code: the brake still wins
  runCase('report-dest', 'dest-brake-file-tier', GUARD_MJS, {
    stdin: payload({ agent_id: 'brake001', stop_hook_active: true }), env: ws.env, cwd: ws.proj,
  }, expectEmpty('dest-brake-file-tier',
    'stop_hook_active brakes before any path is built — the file tier blocks at most once'));
}

// ═══ Group 10b — configurable report dir `reportDir` (14 cases) ═══
// GIVEN `reportDir` relative/absolute/`~/`/trailing slash/invalid THEN both hooks same base: under root, as is, under HOME; unusable -> `.claude/reports`
{
  const fileShot = (id) => stopPayload({ agent_id: id, agent_type: 'general-purpose', last_assistant_message: msg(6001) });
  const dirOf = (out) => reportPathOf(out).replace(/\/\d{8}-\d{6}_general-purpose-[a-z0-9]+\/$/, '');
  const absDir = join(BASE, 'rdir-abs-target');
  const cases = [
    ['rdir-relative', 'out/agent-reports', (ws) => join(ws.proj, 'out', 'agent-reports'), () => 'out/agent-reports'],
    ['rdir-absolute', absDir, () => absDir, () => absDir],
    ['rdir-home', '~/agent-reports', (ws) => join(ws.home, 'agent-reports'), (ws) => join(ws.home, 'agent-reports')],
    ['rdir-trailing-slash', 'tmp/reports//', (ws) => join(ws.proj, 'tmp', 'reports'), () => 'tmp/reports'],
    ['rdir-not-string', 42, (ws) => join(ws.proj, '.claude', 'reports'), () => '.claude/reports'],
    ['rdir-blank', '   ', (ws) => join(ws.proj, '.claude', 'reports'), () => '.claude/reports'],
    ['rdir-root-only', '/', (ws) => join(ws.proj, '.claude', 'reports'), () => '.claude/reports'],
  ];
  for (const [name, value, expectedBase, announced] of cases) {
    const ws = newWs(name, cfg({ reportDir: value }));
    const id = name.replace(/[^a-z]/g, '').slice(0, 8);
    runCase('report-dir', `${name}-guard`, GUARD_MJS, { stdin: fileShot(id), env: ws.env, cwd: ws.proj }, (out) => {
      check(`${name}-guard-base`, dirOf(out), expectedBase(ws),
        `reportDir ${JSON.stringify(value)} must resolve the file-tier base`);
      check(`${name}-guard-out`, out, DECISION.stop(fileReason(6001, 2500, 6000, reportPathOf(out), 'stop')),
        'the file order wording is unchanged apart from the base');
    });
    runCase('report-dir', `${name}-contract`, CONTRACT_MJS, { stdin: '', env: ws.env, cwd: ws.proj },
      expectContract(`${name}-contract`, 2500, 6000, 'writer', announced(ws)));
  }
}

// ═══ Group 11 — config root (BT-N02) (6 cases): unique passTokens in <root>|<away>|<home>/.claude/agent-return.json = 500/800, 700/1400, 2000/9000 ═══
// WHEN CLAUDE_PROJECT_DIR = root, hook elsewhere or 16 levels below THEN both hooks + report base use root; missing CLAUDE_PROJECT_DIR ignored
{
  const root = newWs('cfgroot', cfg({ passTokens: 500, fileTokens: 800 }),
    cfg({ passTokens: 2000, fileTokens: 9000 }));
  const away = newWs('cfgroot-away', cfg({ passTokens: 700, fileTokens: 1400 }));
  const ROOT_CFG = join(root.proj, '.claude', 'agent-return.json');
  const AWAY_CFG = join(away.proj, '.claude', 'agent-return.json');
  const envRoot = envFor(root.home, { CLAUDE_PROJECT_DIR: root.proj });

  // 11.1 the hook runs in an unrelated repo; CLAUDE_PROJECT_DIR decides
  runCase('config-root', 'cfgroot-env-compress', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: envRoot, cwd: away.proj,
  }, expectCompress('cfgroot-env-compress', 501, 500));

  // 11.2 same run at the file tier: config root and report root are ONE root
  runCase('config-root', 'cfgroot-env-file', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'tester', agent_id: 'root0001', last_assistant_message: msg(801) }),
    env: envRoot, cwd: away.proj,
  }, expectFileId('cfgroot-env-file', 801, 500, 800, 'tester', root.proj, 'root0001'));

  // 11.3 the SubagentStart contract resolves the same file
  runCase('config-root', 'cfgroot-env-contract', CONTRACT_MJS, { stdin: '', env: envRoot, cwd: away.proj },
    expectContract('cfgroot-env-contract', 500, 800));

  // 11.4 a CLAUDE_PROJECT_DIR that does not exist is ignored -> cwd's own config
  runCase('config-root', 'cfgroot-env-missing-dir', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(701) }),
    env: envFor(away.home, { CLAUDE_PROJECT_DIR: join(BASE, 'no-such-dir') }), cwd: away.proj,
  }, expectCompress('cfgroot-env-missing-dir', 701, 700));

  // 11.5 no env var: the `.claude` marker walk finds the root config 16 levels down,
  //      and it beats the global one (500, not 2000)
  let deep = root.proj;
  for (let i = 0; i < 16; i++) deep = join(deep, `d${i}`);
  mkdirSync(deep, { recursive: true });
  runCase('config-root', 'cfgroot-deep-cwd', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: root.env, cwd: deep,
  }, expectCompress('cfgroot-deep-cwd', 501, 500));

  // 11.6 the two candidate files are distinct paths — the numbers above identify one each
  check('cfgroot-candidates-distinct', new Set([ROOT_CFG, AWAY_CFG]).size, 2,
    `passTokens 500 identifies ${ROOT_CFG} and 700 identifies ${AWAY_CFG}`);
}

// ── captured payloads ───────────────────────────────────────────────────────
// Real CC 2.1.296 inputs (probe 2026-10-12): keys/ids as captured; transcript paths dropped, cwd + report text supplied.
const CAPTURED = {
  // auto mode, the hand-back call of a general-purpose subagent
  handback: (cwd, message, extra) => JSON.stringify({
    session_id: '46f21cb4-75aa-4fee-9f77-a19262343486', cwd,
    prompt_id: 'ebc50d83-4973-48b3-8845-b6f73ca394d3', permission_mode: 'auto',
    agent_id: 'ac8074fbc74c62a88', agent_type: 'general-purpose', effort: { level: 'medium' },
    hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', tool_input: { message },
    tool_use_id: 'toolu_015AR2T6cBmqhVuLXvMxnMvk', ...extra,
  }),
  // auto mode, SubagentStop AFTER that hand-back: no last_assistant_message key
  stopAfterHandback: (cwd, extra) => JSON.stringify({
    session_id: '46f21cb4-75aa-4fee-9f77-a19262343486', cwd,
    prompt_id: 'ebc50d83-4973-48b3-8845-b6f73ca394d3', permission_mode: 'auto',
    agent_id: 'ac8074fbc74c62a88', agent_type: 'general-purpose', effort: { level: 'medium' },
    hook_event_name: 'SubagentStop', stop_hook_active: false, background_tasks: [], session_crons: [],
    ...extra,
  }),
  // default mode, SubagentStop carrying the report
  stopClassic: (cwd, message, extra) => JSON.stringify({
    session_id: 'bc2cec5a-cd7c-4ff9-9063-8bca15b42f01', cwd,
    prompt_id: '29d83595-147a-4937-9a63-945591fea355', permission_mode: 'default',
    agent_id: 'a06afcc5baaf0d32a', agent_type: 'general-purpose', effort: { level: 'medium' },
    hook_event_name: 'SubagentStop', stop_hook_active: false, last_assistant_message: message,
    background_tasks: [], session_crons: [], ...extra,
  }),
  // auto mode, a fork: no hand-back tool, the report is last_assistant_message
  stopFork: (cwd, message) => JSON.stringify({
    session_id: 'b9286d42-4785-4a03-953b-e0d69ef6475e', cwd,
    prompt_id: '1120ef50-9936-4a1d-bdc9-64924fbcc8df', permission_mode: 'auto',
    agent_id: 'a39cc69a3791107fd', agent_type: 'fork', effort: { level: 'medium' },
    hook_event_name: 'SubagentStop', stop_hook_active: false, last_assistant_message: message,
    background_tasks: [], session_crons: [],
  }),
  // SubagentStart of an Explore subagent (no permission_mode on this event)
  startExplore: (cwd, extra) => JSON.stringify({
    session_id: 'b8d8c9cc-cc71-4ddb-b774-2f0739dc9c91', cwd,
    prompt_id: '3b33af29-ff15-42e0-80a9-c0db7ae42c95', agent_id: 'aa2cfa2a6f3b4844a',
    agent_type: 'Explore', hook_event_name: 'SubagentStart', ...extra,
  }),
  // main session started with `--agent probe-main`: agent_type, but NO agent_id
  sessionAgent: (cwd, message, extra) => JSON.stringify({
    session_id: '51f24158-4072-458e-b9f4-1be46de6a4ae', cwd,
    prompt_id: 'b951e14b-0a52-4281-869e-64788593000a', permission_mode: 'auto',
    agent_type: 'probe-main', effort: { level: 'medium' }, hook_event_name: 'SubagentStop',
    stop_hook_active: false, last_assistant_message: message, background_tasks: [], session_crons: [],
    ...extra,
  }),
};

/** One non-hook case: runs `body`, then books it under `group` like runCase does. */
function plainCase(group, body) {
  const before = failed;
  body();
  const g = groups.get(group) || { cases: 0, bad: 0 };
  g.cases++;
  g.bad += failed > before ? 1 : 0;
  groups.set(group, g);
}

/** Sorted names in `dir`; a sentinel entry when the directory does not exist. */
function listing(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : ['NO DIRECTORY'];
}

/** Parsed JSON file; a sentinel when it does not exist, so a failed step reports instead of throwing. */
function jsonFile(file) {
  return safeParse(existsSync(file) ? readFileSync(file, 'utf8') : '"NO FILE"');
}

/** File text; a sentinel when it does not exist. */
function textFile(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : 'NO FILE';
}

/** Basename of the marker the guard writes for `agentId`. */
function markerName(agentId) {
  return `${createHash('sha256').update(agentId).digest('hex').slice(0, 32)}.json`;
}

// ═══ Group 12 — auto path: deny the hand-back once (13 cases) ═══
// GIVEN captured SubagentHandback WHEN under/over/far over, again, look-alike THEN first over denied naming SubagentHandback, marked, later pass; others untouched
{
  const ws = newWs('hb', cfg());
  const claude = join(ws.proj, '.claude');
  const fire = (stdin) => ({ stdin, env: ws.env, cwd: ws.proj });
  const AGENT = 'ac8074fbc74c62a88';
  const WRITER = 'aa2cfa2a6f3b4844a';

  runCase('handback', 'hb-under', GUARD_MJS, fire(CAPTURED.handback(ws.proj, msg(2500))),
    expectEmpty('hb-under', 'a hand-back at exactly PASS is delivered untouched'));
  plainCase('handback', () => check('hb-under-no-state', listing(join(claude, 'agent-return-state')),
    ['NO DIRECTORY'], 'a report that passes must not create any state'));

  runCase('handback', 'hb-compress', GUARD_MJS, fire(CAPTURED.handback(ws.proj, msg(2501))),
    expectCompress('hb-compress', 2501, 2500, 'handback'));
  plainCase('handback', () => check('hb-compress-marker', readMarker(claude, AGENT),
    { agent_id: AGENT, agent_type: 'general-purpose', via: 'handback', tokens: 2501 },
    'the deny must be recorded for this agent_id before it is issued'));

  runCase('handback', 'hb-second', GUARD_MJS, fire(CAPTURED.handback(ws.proj, msg(2501))),
    expectEmpty('hb-second', 'the same agent handing back again must pass — a second deny can lose the report'));
  runCase('handback', 'hb-second-huge', GUARD_MJS, fire(CAPTURED.handback(ws.proj, msg(50000))),
    expectEmpty('hb-second-huge', 'once challenged, even a 50000-token hand-back passes'));

  runCase('handback', 'hb-file', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(6001), { agent_id: WRITER })),
    expectFileId('hb-file', 6001, 2500, 6000, 'general-purpose', ws.proj, 'aa2cfa2a', 'handback'));

  runCase('handback', 'hb-other-tool', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(50000), { agent_id: nextId(), tool_name: 'Bash' })),
    expectEmpty('hb-other-tool', 'only the SubagentHandback tool carries a report'));
  runCase('handback', 'hb-post-tool-use', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(50000), { agent_id: nextId(), hook_event_name: 'PostToolUse' })),
    expectEmpty('hb-post-tool-use', 'PostToolUse of the hand-back is after delivery — no decision'));
  runCase('handback', 'hb-message-number', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, 123456, { agent_id: nextId() })),
    expectEmpty('hb-message-number', 'a non-string tool_input.message is a no-op'));
  runCase('handback', 'hb-stop-after', GUARD_MJS,
    fire(CAPTURED.stopAfterHandback(ws.proj, { agent_id: nextId() })),
    expectEmpty('hb-stop-after', 'SubagentStop after a hand-back carries no report — no decision'));

  plainCase('handback', () => check('hb-state-inventory', listing(join(claude, 'agent-return-state')),
    ['.gitignore', markerName(AGENT), markerName(WRITER)].sort(),
    'state holds exactly one marker per challenged agent plus its own .gitignore'));
  plainCase('handback', () => check('hb-state-gitignore',
    textFile(join(claude, 'agent-return-state', '.gitignore')), '*\n',
    'the state directory ignores itself so a project git status stays clean'));
}

// ═══ Group 13 — classic path: block once per agent_id (5 cases) ═══
// GIVEN captured SubagentStop WHEN over budget, stops again with/without brake THEN one block recorded, later pass; no branch on permission_mode
{
  const ws = newWs('classic', cfg());
  const claude = join(ws.proj, '.claude');
  const fire = (stdin) => ({ stdin, env: ws.env, cwd: ws.proj });
  const AGENT = 'a06afcc5baaf0d32a';

  runCase('classic', 'cl-block', GUARD_MJS, fire(CAPTURED.stopClassic(ws.proj, msg(2501))),
    expectCompress('cl-block', 2501, 2500, 'stop'));
  plainCase('classic', () => check('cl-block-marker', readMarker(claude, AGENT),
    { agent_id: AGENT, agent_type: 'general-purpose', via: 'stop', tokens: 2501 },
    'the block must be recorded for this agent_id'));
  runCase('classic', 'cl-second-brake', GUARD_MJS,
    fire(CAPTURED.stopClassic(ws.proj, msg(2501), { stop_hook_active: true })),
    expectEmpty('cl-second-brake', 'the stop after the block (stop_hook_active) passes'));
  runCase('classic', 'cl-resumed', GUARD_MJS,
    fire(CAPTURED.stopClassic(ws.proj, msg(50000), { stop_hook_active: false })),
    expectEmpty('cl-resumed', 'a resumed run restarts stop_hook_active at false — the marker still brakes'));
  runCase('classic', 'cl-fork-auto', GUARD_MJS, fire(CAPTURED.stopFork(ws.proj, msg(2501))),
    expectCompress('cl-fork-auto', 2501, 2500, 'stop'));
}

// ═══ Group 14 — once across BOTH paths (6 cases) ═══
// GIVEN one agent_id on both events WHEN (a) hand-back denied, text stop, hand-back; (b) stop blocked, hand-back THEN one challenge per agent
{
  const ws = newWs('cross', cfg());
  const claude = join(ws.proj, '.claude');
  const fire = (stdin) => ({ stdin, env: ws.env, cwd: ws.proj });
  const A = 'ae7814310b55263cb';
  const B = 'a2a0ec1132a51fc64';

  runCase('cross-path', 'x-a-handback-denied', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(2501), { agent_id: A })),
    expectCompress('x-a-handback-denied', 2501, 2500, 'handback'));
  runCase('cross-path', 'x-a-stop-undelivered', GUARD_MJS,
    fire(CAPTURED.stopClassic(ws.proj, msg(2501), { agent_id: A, permission_mode: 'auto' })),
    expectEmpty('x-a-stop-undelivered', 'a stop block after a hand-back deny would be the second challenge'));
  runCase('cross-path', 'x-a-handback-again', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(2501), { agent_id: A })),
    expectEmpty('x-a-handback-again', 'the re-sent hand-back is delivered'));
  plainCase('cross-path', () => check('x-a-marker', readMarker(claude, A),
    { agent_id: A, agent_type: 'general-purpose', via: 'handback', tokens: 2501 },
    'the marker keeps the first challenge and is never rewritten'));

  runCase('cross-path', 'x-b-stop-blocked', GUARD_MJS,
    fire(CAPTURED.stopClassic(ws.proj, msg(2501), { agent_id: B, permission_mode: 'auto' })),
    expectCompress('x-b-stop-blocked', 2501, 2500, 'stop'));
  runCase('cross-path', 'x-b-handback-after', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(50000), { agent_id: B })),
    expectEmpty('x-b-handback-after', 'a hand-back after a stop block must not be denied'));
}

// ═══ Group 15 — agents that cannot write (22 cases) ═══
// GIVEN built-in/custom/empty/malformed read-only lists WHEN agents exceed fileTokens THEN listed/plan-mode never told to write; exact agent_type; config replaces built-in
{
  const ws = newWs('ro', cfg());
  const fire = (stdin) => ({ stdin, env: ws.env, cwd: ws.proj });
  const start = (agentType) => fire(CAPTURED.startExplore(ws.proj, { agent_type: agentType }));

  runCase('read-only', 'ro-explore-handback', GUARD_MJS,
    fire(CAPTURED.handback(ws.proj, msg(6001), { agent_id: 'aa2cfa2a6f3b4844a', agent_type: 'Explore' })),
    expectEssential('ro-explore-handback', 6001, 2500, 'handback'));
  runCase('read-only', 'ro-plan-stop', GUARD_MJS,
    fire(stopPayload({ agent_type: 'Plan', last_assistant_message: msg(6001) })),
    expectEssential('ro-plan-stop', 6001, 2500, 'stop'));
  runCase('read-only', 'ro-explore-compress', GUARD_MJS,
    fire(stopPayload({ agent_type: 'Explore', last_assistant_message: msg(6000) })),
    expectCompress('ro-explore-compress', 6000, 2500, 'stop'));
  runCase('read-only', 'ro-planmode-stop', GUARD_MJS,
    fire(stopPayload({ agent_type: 'general-purpose', permission_mode: 'plan', last_assistant_message: msg(6001) })),
    expectEssential('ro-planmode-stop', 6001, 2500, 'stop'));
  runCase('read-only', 'ro-planmode-handback', GUARD_MJS,
    fire(handbackPayload(msg(6001), { agent_type: 'general-purpose', permission_mode: 'plan' })),
    expectEssential('ro-planmode-handback', 6001, 2500, 'handback'));
  runCase('read-only', 'ro-unlisted-custom', GUARD_MJS,
    fire(stopPayload({ agent_type: 'probe-sub', last_assistant_message: msg(6001) })),
    expectFile('ro-unlisted-custom', 6001, 2500, 6000, 'probe-sub', ws.proj));
  runCase('read-only', 'ro-exact-match', GUARD_MJS,
    fire(stopPayload({ agent_type: 'explore', last_assistant_message: msg(6001) })),
    expectFile('ro-exact-match', 6001, 2500, 6000, 'explore', ws.proj));

  runCase('read-only', 'ro-contract-explore', CONTRACT_MJS, fire(CAPTURED.startExplore(ws.proj)),
    expectContract('ro-contract-explore', 2500, 6000, 'readOnly'));
  runCase('read-only', 'ro-contract-plan', CONTRACT_MJS, start('Plan'),
    expectContract('ro-contract-plan', 2500, 6000, 'readOnly'));
  runCase('read-only', 'ro-contract-general', CONTRACT_MJS, start('general-purpose'),
    expectContract('ro-contract-general', 2500, 6000, 'writer'));
  runCase('read-only', 'ro-contract-unlisted', CONTRACT_MJS, start('probe-sub'),
    expectContract('ro-contract-unlisted', 2500, 6000, 'writer'));

  // a config list REPLACES the built-in one
  const custom = newWs('ro-custom', cfg({ readOnlyAgentTypes: ['reviewer', 'myplugin:auditor'] }));
  const fireCustom = (stdin) => ({ stdin, env: custom.env, cwd: custom.proj });
  runCase('read-only', 'ro-custom-listed', GUARD_MJS,
    fireCustom(stopPayload({ agent_type: 'reviewer', last_assistant_message: msg(6001) })),
    expectEssential('ro-custom-listed', 6001, 2500, 'stop'));
  runCase('read-only', 'ro-custom-plugin-agent', GUARD_MJS,
    fireCustom(handbackPayload(msg(6001), { agent_type: 'myplugin:auditor' })),
    expectEssential('ro-custom-plugin-agent', 6001, 2500, 'handback'));
  runCase('read-only', 'ro-custom-explore-dropped', GUARD_MJS,
    fireCustom(stopPayload({ agent_type: 'Explore', last_assistant_message: msg(6001) })),
    expectFile('ro-custom-explore-dropped', 6001, 2500, 6000, 'explore', custom.proj));
  runCase('read-only', 'ro-custom-contract-listed', CONTRACT_MJS,
    fireCustom(CAPTURED.startExplore(custom.proj, { agent_type: 'reviewer' })),
    expectContract('ro-custom-contract-listed', 2500, 6000, 'readOnly'));
  runCase('read-only', 'ro-custom-contract-explore', CONTRACT_MJS,
    fireCustom(CAPTURED.startExplore(custom.proj)),
    expectContract('ro-custom-contract-explore', 2500, 6000, 'writer'));

  // [] = nobody is read-only
  const empty = newWs('ro-empty', cfg({ readOnlyAgentTypes: [] }));
  runCase('read-only', 'ro-empty-explore', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'Explore', last_assistant_message: msg(6001) }), env: empty.env, cwd: empty.proj,
  }, expectFile('ro-empty-explore', 6001, 2500, 6000, 'explore', empty.proj));
  runCase('read-only', 'ro-empty-contract', CONTRACT_MJS,
    { stdin: CAPTURED.startExplore(empty.proj), env: empty.env, cwd: empty.proj },
    expectContract('ro-empty-contract', 2500, 6000, 'writer'));

  // not an array -> the built-in list; non-string entries are dropped
  const notArray = newWs('ro-notarray', cfg({ readOnlyAgentTypes: 'Explore,Plan' }));
  runCase('read-only', 'ro-notarray-explore', GUARD_MJS, {
    stdin: stopPayload({ agent_type: 'Explore', last_assistant_message: msg(6001) }), env: notArray.env, cwd: notArray.proj,
  }, expectEssential('ro-notarray-explore', 6001, 2500, 'stop'));
  const mixed = newWs('ro-mixed', cfg({ readOnlyAgentTypes: [42, null, 'Plan'] }));
  const fireMixed = (agentType) => ({
    stdin: stopPayload({ agent_type: agentType, last_assistant_message: msg(6001) }), env: mixed.env, cwd: mixed.proj,
  });
  runCase('read-only', 'ro-mixed-plan', GUARD_MJS, fireMixed('Plan'),
    expectEssential('ro-mixed-plan', 6001, 2500, 'stop'));
  runCase('read-only', 'ro-mixed-explore', GUARD_MJS, fireMixed('Explore'),
    expectFile('ro-mixed-explore', 6001, 2500, 6000, 'explore', mixed.proj));
  runCase('read-only', 'ro-mixed-number-type', GUARD_MJS, fireMixed(42),
    expectFile('ro-mixed-number-type', 6001, 2500, 6000, 'agent', mixed.proj));
}

// ═══ Group 16 — payload without agent_id (8 cases) ═══
// GIVEN 50000-token report WHEN no usable agent_id (`--agent` main, empty agent_type, blank/null/numeric) THEN never challenged, no state written
{
  const ws = newWs('noid', cfg());
  const fire = (stdin) => ({ stdin, env: ws.env, cwd: ws.proj });
  const huge = msg(50000);

  runCase('no-agent-id', 'noid-session-agent', GUARD_MJS, fire(CAPTURED.sessionAgent(ws.proj, huge)),
    expectEmpty('noid-session-agent', 'the main session under --agent has agent_type but no agent_id'));
  runCase('no-agent-id', 'noid-internal-agent', GUARD_MJS,
    fire(CAPTURED.sessionAgent(ws.proj, huge, { agent_type: '' })),
    expectEmpty('noid-internal-agent', 'an internal agent with an empty agent_type and no agent_id'));
  const blanks = [
    ['noid-empty-string', ''],
    ['noid-whitespace', '   '],
    ['noid-null', null],
    ['noid-number', 42],
  ];
  for (const [name, agentId] of blanks) {
    runCase('no-agent-id', name, GUARD_MJS, fire(stopPayload({ agent_id: agentId, last_assistant_message: huge })),
      expectEmpty(name, `agent_id ${JSON.stringify(agentId)} is not a subagent id`));
  }
  runCase('no-agent-id', 'noid-handback', GUARD_MJS,
    fire(handbackPayload(huge, { agent_id: undefined })),
    expectEmpty('noid-handback', 'a hand-back without agent_id cannot be recorded, so it is never denied'));
  plainCase('no-agent-id', () => check('noid-no-state', listing(join(ws.proj, '.claude', 'agent-return-state')),
    ['NO DIRECTORY'], 'payloads without agent_id must leave no state behind'));
}

// ═══ Group 17 — CLAUDE_CONFIG_DIR (12 cases): $CLAUDE_CONFIG_DIR 600/900, ~/.claude 2000/9000, <project> 500/800 ═══
// THEN set -> its config/state; unset/blank or no config -> ~/.claude; project beats both; ~/.claude on upward climb never outranks set dir
{
  const ws = newWs('ccd', undefined, cfg({ passTokens: 2000, fileTokens: 9000 }));
  const profile = join(BASE, 'ccd-profile');
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'agent-return.json'), JSON.stringify(cfg({ passTokens: 600, fileTokens: 900 })));
  const bare = join(BASE, 'ccd-bare-profile');
  mkdirSync(bare, { recursive: true });
  const homeClaude = join(ws.home, '.claude');
  const withDir = (dir) => envFor(ws.home, { CLAUDE_CONFIG_DIR: dir });

  runCase('config-dir', 'ccd-set', GUARD_MJS, {
    stdin: stopPayload({ agent_id: 'ccd-set-1', last_assistant_message: msg(601) }), env: withDir(profile), cwd: ws.proj,
  }, expectCompress('ccd-set', 601, 600));
  plainCase('config-dir', () => check('ccd-set-state',
    [listing(join(profile, 'agent-return-state')), listing(join(homeClaude, 'agent-return-state'))],
    [['.gitignore', markerName('ccd-set-1')].sort(), ['NO DIRECTORY']],
    'state follows the config: under $CLAUDE_CONFIG_DIR, nothing under ~/.claude'));
  runCase('config-dir', 'ccd-set-contract', CONTRACT_MJS, { stdin: '', env: withDir(profile), cwd: ws.proj },
    expectContract('ccd-set-contract', 600, 900));

  runCase('config-dir', 'ccd-unset-pass', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(601) }), env: ws.env, cwd: ws.proj,
  }, expectEmpty('ccd-unset-pass', 'unset -> ~/.claude config (2000): 601 passes'));
  runCase('config-dir', 'ccd-unset-compress', GUARD_MJS, {
    stdin: stopPayload({ agent_id: 'ccd-unset-1', last_assistant_message: msg(2001) }), env: ws.env, cwd: ws.proj,
  }, expectCompress('ccd-unset-compress', 2001, 2000));
  plainCase('config-dir', () => check('ccd-unset-state', listing(join(homeClaude, 'agent-return-state')),
    ['.gitignore', markerName('ccd-unset-1')].sort(), 'unset -> state under ~/.claude'));

  runCase('config-dir', 'ccd-blank', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(2001) }), env: withDir('   '), cwd: ws.proj,
  }, expectCompress('ccd-blank', 2001, 2000));
  runCase('config-dir', 'ccd-set-without-config', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(2001) }), env: withDir(bare), cwd: ws.proj,
  }, expectCompress('ccd-set-without-config', 2001, 2000));
  runCase('config-dir', 'ccd-set-missing-dir', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(2001) }), env: withDir(join(BASE, 'ccd-no-such-dir')), cwd: ws.proj,
  }, expectCompress('ccd-set-missing-dir', 2001, 2000));

  // a project config beats both global candidates
  const projected = newWs('ccd-proj', cfg({ passTokens: 500, fileTokens: 800 }), cfg({ passTokens: 2000, fileTokens: 9000 }));
  runCase('config-dir', 'ccd-project-wins', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(501) }),
    env: envFor(projected.home, { CLAUDE_CONFIG_DIR: profile }), cwd: projected.proj,
  }, expectCompress('ccd-project-wins', 501, 500));

  // a project UNDER $HOME: the climb reaches ~/.claude before the global step
  const under = join(ws.home, 'work', 'repo');
  mkdirSync(join(under, '.git'), { recursive: true });
  runCase('config-dir', 'ccd-project-under-home', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(601) }), env: withDir(profile), cwd: under,
  }, expectCompress('ccd-project-under-home', 601, 600));

  // the nearest config decides even when it switches the feature off
  const offProfile = join(BASE, 'ccd-off-profile');
  mkdirSync(offProfile, { recursive: true });
  writeFileSync(join(offProfile, 'agent-return.json'), JSON.stringify({ enabled: false }));
  runCase('config-dir', 'ccd-profile-disabled', GUARD_MJS, {
    stdin: stopPayload({ last_assistant_message: msg(50000) }), env: withDir(offProfile), cwd: ws.proj,
  }, expectEmpty('ccd-profile-disabled', 'a disabled config in $CLAUDE_CONFIG_DIR is not overridden by ~/.claude'));
}

// ═══ Group 18 — config written before the new keys existed (7 cases) ═══
// GIVEN older config 1000/2500, no readOnlyAgentTypes WHEN both hooks run THEN thresholds honoured, built-in read-only list applies
{
  const OLD = '{"enabled":true,"passTokens":1000,"fileTokens":2500,"version":"6.1.4","content_version":"6.0.0",'
    + '"generated_by":"brewtools:agent-return-setup","last_updated":"2026-08-31"}';
  const ws = newWs('oldcfg', OLD);
  const fire = (stdin) => ({ stdin, env: ws.env, cwd: ws.proj });

  runCase('old-config', 'old-pass', GUARD_MJS, fire(stopPayload({ last_assistant_message: msg(1000) })),
    expectEmpty('old-pass', 'the configured 1000 still passes 1000'));
  runCase('old-config', 'old-compress', GUARD_MJS, fire(stopPayload({ last_assistant_message: msg(1001) })),
    expectCompress('old-compress', 1001, 1000));
  runCase('old-config', 'old-file', GUARD_MJS,
    fire(stopPayload({ agent_type: 'general-purpose', last_assistant_message: msg(2501) })),
    expectFile('old-file', 2501, 1000, 2500, 'general-purpose', ws.proj));
  runCase('old-config', 'old-explore', GUARD_MJS,
    fire(stopPayload({ agent_type: 'Explore', last_assistant_message: msg(2501) })),
    expectEssential('old-explore', 2501, 1000, 'stop'));
  runCase('old-config', 'old-handback', GUARD_MJS, fire(handbackPayload(msg(1001))),
    expectCompress('old-handback', 1001, 1000, 'handback'));
  runCase('old-config', 'old-contract', CONTRACT_MJS, fire(''),
    expectContract('old-contract', 1000, 2500, 'writer'));
  runCase('old-config', 'old-contract-explore', CONTRACT_MJS, fire(CAPTURED.startExplore(ws.proj)),
    expectContract('old-contract-explore', 1000, 2500, 'readOnly'));
}

// ═══ Group 19 — state edge cases (5 cases) ═══
// GIVEN (a) state path is a file; (b) 25h marker, fresh marker, 25h foreign file THEN (a) hand-back NOT denied, classic blocks behind stop_hook_active; (b) stale marker pruned
{
  const blocked = newWs('st-blocked', cfg());
  const occupied = join(blocked.proj, '.claude', 'agent-return-state');
  writeFileSync(occupied, 'not a directory');
  const fireBlocked = (stdin) => ({ stdin, env: blocked.env, cwd: blocked.proj });
  runCase('state', 'st-unwritable-handback', GUARD_MJS, fireBlocked(handbackPayload(msg(2501))),
    expectEmpty('st-unwritable-handback', 'no marker can be written -> the hand-back is delivered, never denied'));
  runCase('state', 'st-unwritable-stop', GUARD_MJS,
    fireBlocked(stopPayload({ last_assistant_message: msg(2501) })),
    expectCompress('st-unwritable-stop', 2501, 2500, 'stop'));
  plainCase('state', () => check('st-unwritable-untouched', textFile(occupied), 'not a directory',
    'the guard must not replace whatever occupies the state path'));

  const pruned = newWs('st-prune', cfg());
  const stateDir = join(pruned.proj, '.claude', 'agent-return-state');
  mkdirSync(stateDir, { recursive: true });
  const dayAgo = Date.now() / 1000 - 25 * 60 * 60;
  for (const name of ['stale.json', 'foreign.txt']) {
    writeFileSync(join(stateDir, name), '{}');
    utimesSync(join(stateDir, name), dayAgo, dayAgo);
  }
  writeFileSync(join(stateDir, 'fresh.json'), '{}');
  runCase('state', 'st-prune-claim', GUARD_MJS, {
    stdin: stopPayload({ agent_id: 'prune-1', last_assistant_message: msg(2501) }), env: pruned.env, cwd: pruned.proj,
  }, expectCompress('st-prune-claim', 2501, 2500, 'stop'));
  plainCase('state', () => check('st-prune-inventory', listing(stateDir),
    ['.gitignore', 'foreign.txt', 'fresh.json', markerName('prune-1')].sort(),
    'a claim prunes markers older than 24 h and nothing else'));
}

// ═══ Group 20 — runbook lifecycle: the INSTALL.md blocks, executed (18 cases) ═══
// GIVEN foreign PreToolUse hook WHEN copy/config/merge/uninstall/purge/upgrade blocks run THEN 3 registrations (1 SubagentHandback), re-merge identical, purge restores
{
  const runbook = readFileSync(RUNBOOK, 'utf8');
  const blockAfter = (marker) => {
    const at = runbook.indexOf(marker);
    const start = runbook.indexOf('```\n', at) + 4;
    return runbook.slice(start, runbook.indexOf('\n```', start));
  };
  const BLOCK = {
    copyProject: blockAfter('**EXECUTE** copy (project'),
    config: blockAfter('**EXECUTE** config write'),
    mergeProject: blockAfter('**EXECUTE** merge settings (project)'),
    copyGlobal: blockAfter('**EXECUTE** copy (global'),
    mergeGlobal: blockAfter('**EXECUTE** merge settings (global'),
    upgradeRead: blockAfter('## UPGRADE'),
    uninstall: blockAfter('## UNINSTALL'),
    purge: blockAfter('## PURGE'),
  };
  const CONTENT_VERSION = runbook.split('\n', 1)[0].replace(/^.*content_version=([0-9.]+) .*$/, '$1');

  const ws = newWs('runbook');
  const claude = join(ws.proj, '.claude');
  const hooksDir = join(claude, 'hooks');
  const settingsPath = join(claude, 'settings.json');
  const configPath = join(claude, 'agent-return.json');
  const foreign = { matcher: '.*', hooks: [{ type: 'command', command: 'node', args: ['/foreign/keep.mjs'], timeout: 4 }] };
  mkdirSync(claude, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ env: { KEEP: 'yes' }, hooks: { PreToolUse: [foreign] } }));
  const env = envFor(ws.home, {
    ROOT: ws.proj, RUNBOOK, PASS_TOKENS: '2500', FILE_TOKENS: '6000', PLUGIN_VERSION: '9.9.9', LAST_UPDATED: '2026-01-02',
  });
  const bash = (block, extraEnv) => {
    const r = spawnSync('bash', ['-c', block], {
      cwd: ws.proj, env: { ...env, ...(extraEnv || {}) }, encoding: 'utf8', timeout: 30000,
    });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  const entry = (script, matcher) => ({
    hooks: [{ type: 'command', command: 'node', args: [join(hooksDir, script)], timeout: 5 }], ...matcher,
  });
  const WIRED = {
    env: { KEEP: 'yes' },
    hooks: {
      PreToolUse: [foreign, entry('agent-return-guard.mjs', { matcher: 'SubagentHandback' })],
      SubagentStart: [entry('agent-return-contract.mjs')],
      SubagentStop: [entry('agent-return-guard.mjs')],
    },
  };

  plainCase('runbook', () => {
    const copied = bash(BLOCK.copyProject);
    check('rb-copy', [copied.status, listing(hooksDir)], [0, ASSET_NAMES],
      `the copy block installs exactly the three assets (${copied.stderr})`);
  });
  plainCase('runbook', () => {
    const written = bash(BLOCK.config);
    check('rb-config', [written.status, jsonFile(configPath)], [0, {
      enabled: true, passTokens: 2500, fileTokens: 6000, readOnlyAgentTypes: ['Explore', 'Plan'],
      version: '9.9.9', content_version: CONTENT_VERSION, generated_by: 'brewtools:agent-return-setup',
      last_updated: '2026-01-02',
    }], `the config block writes the thresholds, the read-only list and the four stamps (${written.stderr})`);
  });
  plainCase('runbook', () => {
    const merged = bash(BLOCK.mergeProject);
    check('rb-merge', [merged.status, jsonFile(settingsPath)], [0, WIRED],
      `the merge block adds three registrations and keeps the foreign hook (${merged.stderr})`);
  });
  plainCase('runbook', () => {
    const before = textFile(settingsPath);
    const again = bash(BLOCK.mergeProject);
    check('rb-merge-idempotent', [again.status, textFile(settingsPath)], [0, before],
      `a second merge leaves settings.json byte-identical (${again.stderr})`);
  });

  // the INSTALLED copies, fired the way the registrations fire them
  const installed = (script, stdin) => ({ stdin, env: ws.env, cwd: ws.proj, script: join(hooksDir, script) });
  const hb = installed('agent-return-guard.mjs', handbackPayload(msg(2501), { agent_id: 'rb-agent-1' }));
  runCase('runbook', 'rb-installed-guard', hb.script, hb, expectCompress('rb-installed-guard', 2501, 2500, 'handback'));
  const st = installed('agent-return-contract.mjs', CAPTURED.startExplore(ws.proj));
  runCase('runbook', 'rb-installed-contract', st.script, st,
    expectContract('rb-installed-contract', 2500, 6000, 'readOnly'));

  plainCase('runbook', () => {
    const removed = bash(BLOCK.uninstall);
    check('rb-uninstall', [
      removed.status, jsonFile(settingsPath), listing(hooksDir),
      listing(join(claude, 'agent-return-state')), existsSync(configPath),
    ], [
      0, { env: { KEEP: 'yes' }, hooks: { PreToolUse: [foreign] } }, ['NO DIRECTORY'], ['NO DIRECTORY'], true,
    ], `uninstall drops all three registrations, the files, the emptied hooks dir and the state; the config stays (${removed.stderr})`);
  });
  plainCase('runbook', () => {
    const purged = bash(BLOCK.purge);
    check('rb-purge', [purged.status, listing(claude)], [0, ['settings.json']],
      `purge removes the config: only the pre-existing settings remain (${purged.stderr})`);
  });

  // A project with no .claude/ before install: uninstall + purge leave none behind
  plainCase('runbook', () => {
    const bare = newWs('runbook-bare');
    const run = (block) => spawnSync('bash', ['-c', block], {
      cwd: bare.proj, env: { ...env, ROOT: bare.proj }, encoding: 'utf8', timeout: 30000,
    });
    const steps = ['copyProject', 'config', 'mergeProject', 'uninstall', 'purge'].map((k) => run(BLOCK[k]));
    check('rb-bare-roundtrip', [steps.map((r) => r.status), listing(bare.proj)], [[0, 0, 0, 0, 0], []],
      `install then uninstall + purge in a project without .claude/ leaves no .claude/, no {} settings.json (${steps.map((r) => r.stderr).join('')})`);
  });
  // Project root block: the skill's CLAUDE_PROJECT_DIR (session dir) beats the git toplevel
  plainCase('runbook', () => {
    const repo = newWs('runbook-root').proj;
    const sub = join(repo, 'sub');
    mkdirSync(sub, { recursive: true });
    const git = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
    const rootEnv = envFor(ws.home);
    const shot = (extra) => spawnSync('bash', ['-c', `${blockAfter('### Project root')}\necho "GOT=$ROOT"`], {
      cwd: sub, env: { ...rootEnv, ...extra }, encoding: 'utf8', timeout: 30000,
    }).stdout.trim().split('\n').pop();
    check('rb-root-ladder', [git.status, shot({ CLAUDE_PROJECT_DIR: sub }), shot({})],
      [0, `GOT=${sub}`, `GOT=${realpathSync(repo)}`],
      'session dir passed as CLAUDE_PROJECT_DIR wins; without it the git toplevel is the fallback');
  });
  plainCase('runbook', () => {
    const kept = newWs('runbook-kept');
    const keptSettings = join(kept.proj, '.claude', 'settings.json');
    mkdirSync(join(kept.proj, '.claude'), { recursive: true });
    writeFileSync(keptSettings, '{}\n');
    const r = spawnSync('bash', ['-c', BLOCK.uninstall], {
      cwd: kept.proj, env: { ...env, ROOT: kept.proj }, encoding: 'utf8', timeout: 30000,
    });
    check('rb-uninstall-foreign-empty', [r.status, textFile(keptSettings)], [0, '{}\n'],
      `a settings.json that was {} without any agent-return entry is not ours to delete (${r.stderr})`);
  });

  // UPGRADE read-back: one migration of the pre-6.5 default pair, nothing else moves
  const upgradeCases = [
    ['rb-upgrade-migrates', { enabled: false, passTokens: 1000, fileTokens: 2500 }, 'PASS_TOKENS=2500 FILE_TOKENS=6000'],
    ['rb-upgrade-keeps-chosen', { enabled: true, passTokens: 1000, fileTokens: 2500, readOnlyAgentTypes: ['Explore', 'Plan'] },
      'PASS_TOKENS=1000 FILE_TOKENS=2500'],
    ['rb-upgrade-keeps-custom', { enabled: true, passTokens: 1500, fileTokens: 4000 }, 'PASS_TOKENS=1500 FILE_TOKENS=4000'],
  ];
  for (const [name, oldConfig, expected] of upgradeCases) {
    plainCase('runbook', () => {
      writeFileSync(configPath, JSON.stringify(oldConfig));
      const read = bash(BLOCK.upgradeRead);
      check(name, [read.status, read.stdout.trim()], [0, `✅ ${expected}`],
        `upgrade exports the thresholds the config block must write (${read.stderr.trim()})`);
    });
  }
  rmSync(configPath);

  // GLOBAL scope resolves ${CLAUDE_CONFIG_DIR:-$HOME/.claude} by itself
  const profile = join(BASE, 'runbook-profile');
  const profileEntry = (script, matcher) => ({
    hooks: [{ type: 'command', command: 'node', args: [join(profile, 'hooks', script)], timeout: 5 }], ...matcher,
  });
  plainCase('runbook', () => {
    const copied = bash(BLOCK.copyGlobal, { CLAUDE_CONFIG_DIR: profile });
    const merged = bash(BLOCK.mergeGlobal, { CLAUDE_CONFIG_DIR: profile });
    check('rb-global-config-dir', [
      copied.status, merged.status, listing(join(profile, 'hooks')),
      jsonFile(join(profile, 'settings.json')), listing(join(ws.home, '.claude')),
    ], [
      0, 0, ASSET_NAMES, {
        hooks: {
          SubagentStart: [profileEntry('agent-return-contract.mjs')],
          SubagentStop: [profileEntry('agent-return-guard.mjs')],
          PreToolUse: [profileEntry('agent-return-guard.mjs', { matcher: 'SubagentHandback' })],
        },
      }, ['NO DIRECTORY'],
    ], `with CLAUDE_CONFIG_DIR set the global blocks write there and never into ~/.claude (${copied.stderr}${merged.stderr})`);
  });
  plainCase('runbook', () => {
    const copied = bash(BLOCK.copyGlobal);
    check('rb-global-default-dir', [copied.status, listing(join(ws.home, '.claude', 'hooks'))], [0, ASSET_NAMES],
      `with CLAUDE_CONFIG_DIR unset the global scope is ~/.claude (${copied.stderr})`);
  });

  // UNINSTALL path line swapped for the GLOBAL comment line, or for its unexported form
  const uninstallLines = BLOCK.uninstall.split('\n');
  const globalLine = uninstallLines.find((l) => l.startsWith('# GLOBAL:')).replace(/^# GLOBAL:\s+/, '');
  const withPaths = (pathLine) => uninstallLines.map((l) => (l.startsWith('export ') ? pathLine : l)).join('\n');
  const arRegistrations = (file) => {
    const s = jsonFile(file);
    return Object.values((s && s.hooks) || {}).flat().flatMap((e) => (e && e.hooks) || [])
      .filter((h) => (h.args || []).some((a) => /agent-return-(contract|guard)\.mjs$/.test(a))).length;
  };
  const installGlobal = (dir) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [foreign] } }));
    return [bash(BLOCK.copyGlobal, { CLAUDE_CONFIG_DIR: dir }).status, bash(BLOCK.mergeGlobal, { CLAUDE_CONFIG_DIR: dir }).status,
      arRegistrations(join(dir, 'settings.json'))];
  };
  plainCase('runbook', () => {
    const dir = join(BASE, 'runbook-uninstall-global');
    const installed = installGlobal(dir);
    const r = bash(withPaths(globalLine), { CLAUDE_CONFIG_DIR: dir });
    check('rb-uninstall-global-line', [
      uninstallLines.filter((l) => l.startsWith('export ')).length, installed, r.status, r.stdout.trim().split('\n').pop(),
      arRegistrations(join(dir, 'settings.json')), jsonFile(join(dir, 'settings.json')), listing(join(dir, 'hooks')),
    ], [
      1, [0, 0, 3], 0, `✅ uninstalled from ${join(dir, 'hooks')}`,
      0, { hooks: { PreToolUse: [foreign] } }, ['NO DIRECTORY'],
    ], `the GLOBAL line as written exports SETTINGS: zero registrations and no hook files remain (${r.stderr})`);
  });
  plainCase('runbook', () => {
    const dir = join(BASE, 'runbook-uninstall-unexported');
    const installed = installGlobal(dir);
    const r = bash(withPaths(globalLine.replace('export ', '')), { CLAUDE_CONFIG_DIR: dir });
    check('rb-uninstall-unexported-aborts', [
      installed, r.status, r.stdout.trim(), r.stderr.trim(), arRegistrations(join(dir, 'settings.json')), listing(join(dir, 'hooks')),
    ], [
      [0, 0, 3], 0, '❌ FAILED', 'ABORT: SETTINGS unset - export it (the GLOBAL/PROJECT line); nothing was removed', 3, ASSET_NAMES,
    ], 'SETTINGS assigned but not exported: the block aborts before deleting any hook file, registrations intact');
  });
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
