#!/usr/bin/env node
// agent-router tier-1 E2E: isolated temp HOME+TMPDIR per test (never real ~/.claude, /tmp, repo); exact full-object asserts, no branching.
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync, readdirSync, realpathSync,
  utimesSync, symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets'); // assets/
const HOOK = join(ASSETS, 'agent-router.mjs');
const PLUGIN_AGENTS = {
  brewcode: ['skill-creator', 'agent-creator', 'hook-creator', 'bash-expert'],
  proj: ['widget-expert', 'skill-expert'],
};

// GIVEN: a fresh isolated temp base
const BASE = mkdtempSync(join(tmpdir(), 'ar-test-'));
let passed = 0;
let failed = 0;
const results = [];

// ── deep-equal primitive (utility, not test-body branching) ─────────────────
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
function run(stdinStr, env) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 8000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function runCli(args, env) {
  const r = spawnSync(process.execPath, [HOOK, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 8000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function lineCount(file) {
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
}

// Recorded on Claude Code 2.1.296 (probe LT9); only cwd and transcript_path are rewritten.
function lt9AgentCall(cwd, toolInput) {
  return {
    session_id: '0bd4c1b3-6add-4d7f-b7ce-e26ecc2f4ffa',
    transcript_path: join(cwd, 'transcript.jsonl'),
    cwd,
    prompt_id: '35642576-aa92-4ec4-b057-44412cebec7c',
    permission_mode: 'bypassPermissions',
    effort: { level: 'medium' },
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: toolInput,
    tool_use_id: 'toolu_01EDvFZ27QazGxp7jUU9W4sz',
  };
}

// The tier-2 verifier's verdict call: agent_id `hook-agent-<uuid>`, no agent_type.
function lt9VerifierVerdict(cwd) {
  return {
    session_id: '0bd4c1b3-6add-4d7f-b7ce-e26ecc2f4ffa',
    transcript_path: join(cwd, 'transcript.jsonl'),
    cwd,
    prompt_id: '35642576-aa92-4ec4-b057-44412cebec7c',
    permission_mode: 'dontAsk',
    agent_id: 'hook-agent-5148e0ac-4381-4904-831c-94da713e34fc',
    effort: { level: 'medium' },
    hook_event_name: 'PreToolUse',
    tool_name: 'StructuredOutput',
    tool_input: { ok: true, reason: 'The deny rule does not apply, so the call is allowed.' },
    tool_use_id: 'toolu_01WXb4h1RtgwGQf7y3ng1DGr',
  };
}

const LT9_SESSION = '0bd4c1b3-6add-4d7f-b7ce-e26ecc2f4ffa';
const LT9_BENIGN = {
  description: 'benign probe',
  prompt: 'Reply with the single word PONG. No tools.',
  subagent_type: 'general-purpose',
};

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

// ── fixture helpers ─────────────────────────────────────────────────────────
function newRoot(tag) {
  const base = join(BASE, tag);
  const home = join(base, 'home');
  const tmp = join(base, 'tmp');
  const proj = join(base, 'proj');
  const cfgDir = join(home, '.claude');
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(proj, '.claude'), { recursive: true });
  // Plugin cache fixture: the redirect targets must exist on disk before the router may deny.
  for (const [plugin, agents] of Object.entries(PLUGIN_AGENTS)) {
    const dir = join(cfgDir, 'plugins', 'cache', 'fixture-market', plugin, '1.0.0', 'agents');
    mkdirSync(dir, { recursive: true });
    for (const agent of agents) writeFileSync(join(dir, `${agent}.md`), `---\nname: ${agent}\n---\n`);
  }
  return {
    proj,
    tmp,
    cfgDir,
    env: { HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_CONFIG_DIR: cfgDir, CLAUDE_PROJECT_DIR: '' },
  };
}

// Mirrors the hook's layout: <tmp>/brewtools-agent-router/p-<sha1(real root)[0..16]>/.
function stateDir(tmp, proj) {
  const key = createHash('sha1').update(realpathSync(proj)).digest('hex').slice(0, 16);
  return join(tmp, 'brewtools-agent-router', `p-${key}`);
}

function writeAgent(proj, name, description) {
  const dir = join(proj, '.claude', 'agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}.md`),
    `---\nname: ${name}\ndescription: "${description}"\ntools: Read, Bash\nmodel: sonnet\n---\n\nBody.\n`,
  );
}

function writeUserAgent(cfgDir, name) {
  mkdirSync(join(cfgDir, 'agents'), { recursive: true });
  writeFileSync(join(cfgDir, 'agents', `${name}.md`), `---\nname: ${name}\ndescription: User agent\n---\n`);
}

function writeRawAgent(proj, file, text) {
  const dir = join(proj, '.claude', 'agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), text);
}

function writeConfig(proj, cfgObj) {
  const dir = join(proj, '.claude', 'brewtools');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent-router.json'), JSON.stringify(cfgObj));
}

function writeRawConfig(proj, text) {
  const dir = join(proj, '.claude', 'brewtools');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent-router.json'), text);
}

function payload({
  session = 'S1',
  cwd,
  agentId,
  tool = 'Agent',
  type = 'general-purpose',
  description = '',
  prompt = '',
}) {
  const p = {
    session_id: session,
    transcript_path: join(cwd, 'transcript.jsonl'),
    cwd,
    prompt_id: 'p1',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_use_id: 'tu1',
    tool_input: { description, prompt, subagent_type: type },
  };
  if (agentId) p.agent_id = agentId;
  return JSON.stringify(p);
}

// Same shape as payload() but with the subagent_type key absent entirely.
function noTypePayload(cwd, description, session = 'S1') {
  return JSON.stringify({
    session_id: session,
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { description, prompt: '' },
  });
}

// ── message builders, mirrored verbatim from assets/agent-router.mjs ─────────
const TAIL = '(Deliberate? retry as-is, or put "agent-router: override" in the prompt.)';

function rosterDeny(name, rel, picked) {
  return (
    `agent-router: '${name}' (${rel}) owns this kind of task in this project - its` +
    ` Triggers/description match the task text and ${picked} lacks that domain context` +
    ` - retry with subagent_type: ${name}. ${TAIL}`
  );
}

function unverifiedIntentCtx(label, expert, picked) {
  return (
    `agent-router: this looks like ${label} - '${expert}' is the expert for it, but it` +
    ' was not found in this install (project agents, user agents, plugin cache), so this spawn' +
    ` is not blocked; proceeding with ${picked}.`
  );
}

function intentPluginDeny(label, expert, picked) {
  return (
    `agent-router: this looks like ${label} - '${expert}' is the expert for it,` +
    ` not ${picked} - retry with subagent_type: ${expert}. ${TAIL}`
  );
}

function intentProjectDeny(label, name, rel, picked) {
  return (
    `agent-router: this looks like ${label} - '${name}' (${rel}) is the project` +
    ` expert for it, not ${picked} - retry with subagent_type: ${name}. ${TAIL}`
  );
}

function repeatCtx(expert, picked) {
  return (
    `agent-router: '${expert}' still looks like a better fit than ${picked} for this task,` +
    ' but this spawn is not being blocked (already flagged once, or the anti-loop marker' +
    ' could not be recorded) - proceeding as requested.'
  );
}

function weakIntentCtx(label, expert, picked) {
  return (
    `agent-router: this task touches ${label} artifacts - '${expert}' is the expert` +
    ` for it. Consider re-spawning with it; proceeding with ${picked}.`
  );
}

function mergedNudgeCtx(label, expert, pairs, picked) {
  const list = pairs.map(([n, r]) => `${n} (${r})`).join('; ');
  return (
    `agent-router: this task touches ${label} artifacts - '${expert}' is the expert` +
    ` for it; project agents that may also fit better than ${picked}: ${list}.` +
    ` Consider re-spawning with one of them; proceeding with ${picked}.`
  );
}

function nudgeCtx(pairs, picked) {
  const list = pairs.map(([n, r]) => `${n} (${r})`).join('; ');
  return (
    `agent-router: project agents that may fit this task better than ${picked}: ${list}.` +
    ` Consider re-spawning with one of them; proceeding with ${picked}.`
  );
}

function denyOut(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function ctxOut(text) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } };
}

// Standard two-agent roster used by most tests; neither matches any intent text.
function standardRoster(proj) {
  writeAgent(
    proj,
    'conductor-dev',
    'Conductor layer owner. Owns plan lifecycle, approval matrix, gates. ' +
      'Triggers: conductor, agent port, plan lifecycle, approval matrix, gates, pending approval',
  );
  writeAgent(
    proj,
    'db-migration-dev',
    'Database migration owner. Triggers: migration, schema change, sql migration, alembic',
  );
}

const INTENT_SKILL = 'Create a new skill that scaffolds release notes';
const INTENT_AGENT = 'Create a new agent for the billing domain';
const INTENT_HOOK = 'Add a PreToolUse hook that logs tool calls';
const INTENT_BASH = 'Fix the deploy.sh shell script quoting';

// 01 - non-Agent tool
// GIVEN Bash payload w/ skill-intent text; WHEN hook runs; THEN empty stdout, exit 0: only Agent policed
{
  const { proj, env } = newRoot('t01');
  standardRoster(proj);
  const r = run(payload({ cwd: proj, tool: 'Bash', description: INTENT_SKILL }), env);
  check('01-non-agent-tool', r.stdout, '', 'tool_name != Agent must allow silently');
  check('01-non-agent-tool-exit', r.status, 0, 'hook must exit 0');
}

// 02 - subagent-issued spawn
// GIVEN agent_id present + skill-intent text; WHEN hook runs; THEN empty stdout: only main loop policed
{
  const { proj, env } = newRoot('t02');
  standardRoster(proj);
  const r = run(payload({ cwd: proj, agentId: 'ag-1', description: INTENT_SKILL }), env);
  check('02-subagent-issued', r.stdout, '', 'agent_id present must allow silently');
}

// 03 - disabled by config
// GIVEN {"enabled": false} + skill-intent text; WHEN hook runs; THEN empty stdout
{
  const { proj, env } = newRoot('t03');
  standardRoster(proj);
  writeConfig(proj, { enabled: false });
  const r = run(payload({ cwd: proj, description: INTENT_SKILL }), env);
  check('03-config-disabled', r.stdout, '', 'enabled:false must allow silently');
}

// 04 - project agent already picked
// GIVEN subagent_type conductor-dev + text matching its own triggers; WHEN hook runs; THEN empty stdout
{
  const { proj, env } = newRoot('t04');
  standardRoster(proj);
  const r = run(
    payload({ cwd: proj, type: 'conductor-dev', description: 'Wire the approval matrix' }),
    env,
  );
  check('04-project-agent-pick', r.stdout, '', 'a project-agent pick must allow silently');
}

// 05/06 - Explore and Plan never flagged
// GIVEN subagent_type Explore (intent text), Plan (strong roster-match text); WHEN hook runs; THEN empty stdout for both
{
  const { proj, env } = newRoot('t05');
  standardRoster(proj);
  const rE = run(payload({ cwd: proj, type: 'Explore', description: INTENT_HOOK }), env);
  check('05-explore-never-flagged', rE.stdout, '', 'Explore is the correct search tool');
  const rP = run(
    payload({
      cwd: proj,
      type: 'Plan',
      description: 'Plan the approval matrix and plan lifecycle rework',
    }),
    env,
  );
  check('06-plan-never-flagged', rP.stdout, '', 'Plan is the correct planning tool');
}

// 07 - plugin specialist already picked
// GIVEN subagent_type brewcode:hook-creator + hook-intent text; WHEN hook runs; THEN empty stdout: not on generic list
{
  const { proj, env } = newRoot('t07');
  standardRoster(proj);
  const r = run(
    payload({ cwd: proj, type: 'brewcode:hook-creator', description: INTENT_HOOK }),
    env,
  );
  check('07-plugin-specialist-pick', r.stdout, '', 'non-generic subagent_type must allow silently');
}

// 08..11 - every intent rule fires, names its plugin expert
// GIVEN generic pick + text inside each intent domain; WHEN hook runs; THEN deny naming expert, exact reason template, exit 0
{
  const cases = [
    ['08-intent-skill', INTENT_SKILL, 'skill authoring', 'brewcode:skill-creator'],
    ['09-intent-agent', INTENT_AGENT, 'agent authoring', 'brewcode:agent-creator'],
    ['10-intent-hook', INTENT_HOOK, 'hook authoring', 'brewcode:hook-creator'],
    ['11-intent-bash', INTENT_BASH, 'shell scripting', 'brewcode:bash-expert'],
  ];
  for (const [name, text, label, expert] of cases) {
    const { proj, env } = newRoot(name);
    standardRoster(proj);
    const r = run(payload({ cwd: proj, description: text }), env);
    check(
      name,
      safeParse(r.stdout),
      denyOut(intentPluginDeny(label, expert, 'general-purpose')),
      `"${text}" must redirect to ${expert}`,
    );
    check(`${name}-exit`, r.status, 0, 'a deny still exits 0');
  }
}

// 12..15 - same intents must NOT fire on near-miss wording
// GIVEN skill/agent/hook/.sh w/o authoring verb, or glued into identifier (agent-router, hook-router); WHEN hook runs; THEN empty stdout
{
  const cases = [
    ['12-intent-skill-not-firing', 'Summarize what the skills directory contains'],
    ['13-intent-agent-not-firing', 'Benchmark our multi-agent throughput numbers'],
    ['14-intent-hook-not-firing', 'Investigate why the hook-router latency spiked'],
    ['15-intent-bash-not-firing', 'Explain what run.sh does to the reader'],
  ];
  for (const [name, text] of cases) {
    const { proj, env } = newRoot(name);
    standardRoster(proj);
    const r = run(payload({ cwd: proj, description: text }), env);
    check(name, r.stdout, '', `"${text}" must not fire any intent rule`);
  }
}

// 16 - project agent outranks plugin specialist for same intent
// GIVEN skill intent fires + project agent covers skill authoring; WHEN hook runs; THEN deny names PROJECT agent + path, != brewcode:skill-creator
{
  const { proj, env } = newRoot('t16');
  standardRoster(proj);
  writeAgent(
    proj,
    'skill-author',
    'Project skill owner. Triggers: skill, SKILL.md, slash command, skill activation',
  );
  const text = 'Update the SKILL.md activation block for brewtools:manager-setup';
  const r = run(payload({ cwd: proj, description: text }), env);
  check(
    '16-project-outranks-plugin',
    safeParse(r.stdout),
    denyOut(
      intentProjectDeny(
        'skill authoring',
        'skill-author',
        '.claude/agents/skill-author.md',
        'general-purpose',
      ),
    ),
    'a project agent covering the intent beats the plugin specialist',
  );
}

// 17 - roster scoring, single clear winner
// GIVEN no intent match, one agent far above minScore, beyond margin; WHEN hook runs; THEN deny naming it with .claude/agents path
{
  const { proj, env } = newRoot('t17');
  standardRoster(proj);
  const text = 'Wire pending approval into the plan lifecycle and the approval matrix';
  const r = run(payload({ cwd: proj, description: text }), env);
  check(
    '17-single-clear-winner',
    safeParse(r.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'one agent over minScore and past the margin must be a deny',
  );
}

// 18 - ambiguous roster, no deny
// GIVEN two agents, identical triggers, margin not met; WHEN hook runs; THEN additionalContext listing candidates + paths, NO permissionDecision
{
  const { proj, env } = newRoot('t18');
  writeAgent(proj, 'alpha-dev', 'Alpha owner. Triggers: caching, redis');
  writeAgent(proj, 'beta-dev', 'Beta owner. Triggers: caching, redis');
  const r = run(
    payload({ cwd: proj, description: 'Investigate the caching layer with redis' }),
    env,
  );
  check(
    '18-ambiguous-nudge',
    safeParse(r.stdout),
    ctxOut(
      nudgeCtx(
        [
          ['alpha-dev', '.claude/agents/alpha-dev.md'],
          ['beta-dev', '.claude/agents/beta-dev.md'],
        ],
        'general-purpose',
      ),
    ),
    'a tie must nudge, never deny',
  );
}

// 19 - nothing scores
// GIVEN generic pick, text unrelated to every agent; WHEN hook runs; THEN empty stdout
{
  const { proj, env } = newRoot('t19');
  standardRoster(proj);
  const r = run(payload({ cwd: proj, description: 'Draft the quarterly budget email' }), env);
  check('19-no-match-silent', r.stdout, '', 'zero score must allow silently');
}

// 20 - anti-loop guard
// GIVEN same (session, task) denied once; WHEN 2nd + 3rd run on same TMPDIR; THEN 1st deny, 2nd/3rd additionalContext repeat notice, never deny
{
  const { proj, env } = newRoot('t20');
  standardRoster(proj);
  const text = 'Wire pending approval into the plan lifecycle and the approval matrix';
  const p = payload({ cwd: proj, session: 'LOOP', description: text });
  const r1 = run(p, env);
  const r2 = run(p, env);
  const r3 = run(p, env);
  check(
    '20-antiloop-first-deny',
    safeParse(r1.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'first occurrence denies',
  );
  check(
    '20-antiloop-second-allows',
    safeParse(r2.stdout),
    ctxOut(repeatCtx('conductor-dev', 'general-purpose')),
    'the retry must pass with context, not a second deny',
  );
  check(
    '20-antiloop-third-allows',
    safeParse(r3.stdout),
    ctxOut(repeatCtx('conductor-dev', 'general-purpose')),
    'the marker is permanent for the session',
  );
  const r4 = run(payload({ cwd: proj, session: 'OTHER', description: text }), env);
  check(
    '20-antiloop-other-session-denies',
    safeParse(r4.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'the marker is keyed by session, a new session is judged fresh',
  );
}

// 20b - anti-loop guard keyed by project root too
// GIVEN two roots, same session, task text, TMPDIR; WHEN one run per root; THEN both deny: repo A's marker != downgrade of repo B
{
  const { proj: projA, env } = newRoot('t20b-a');
  const projB = join(BASE, 't20b-b', 'proj');
  mkdirSync(join(projB, '.claude'), { recursive: true });
  standardRoster(projA);
  standardRoster(projB);
  const text = 'Wire pending approval into the plan lifecycle and the approval matrix';
  const rA = run(payload({ cwd: projA, session: 'CROSS', description: text }), env);
  const rB = run(payload({ cwd: projB, session: 'CROSS', description: text }), env);
  check(
    '20b-antiloop-projectA-denies',
    safeParse(rA.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'first project denies as usual',
  );
  check(
    '20b-antiloop-projectB-denies',
    safeParse(rB.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'a second project, same session and task, must still deny - not be swallowed by project A marker',
  );
}

// 21 - garbage and empty stdin
// GIVEN unparsable stdin, empty stdin, JSON array; WHEN hook runs; THEN empty stdout, exit 0: contract never corrupted
{
  const { env } = newRoot('t21');
  const rGarbage = run('{not json at all', env);
  check('21-garbage-stdin', rGarbage.stdout, '', 'unparsable stdin must fail open');
  check('21-garbage-stdin-exit', rGarbage.status, 0, 'unparsable stdin must exit 0');
  const rEmpty = run('', env);
  check('21-empty-stdin', rEmpty.stdout, '', 'empty stdin must fail open');
  const rArray = run('[1,2,3]', env);
  check('21-array-stdin', rArray.stdout, '', 'a JSON array payload must fail open');
}

// 22 - missing .claude/agents
// GIVEN no roster dir; WHEN intent task + plain task; THEN intent redirects to plugin specialist, plain stays silent
{
  const { proj, env } = newRoot('t22');
  const rIntent = run(payload({ cwd: proj, description: INTENT_HOOK }), env);
  check(
    '22-missing-roster-intent',
    safeParse(rIntent.stdout),
    denyOut(intentPluginDeny('hook authoring', 'brewcode:hook-creator', 'general-purpose')),
    'no roster still allows a plugin-specialist redirect',
  );
  const rPlain = run(payload({ cwd: proj, description: 'Draft the quarterly budget email' }), env);
  check('22-missing-roster-plain', rPlain.stdout, '', 'no roster and no intent must be silent');
}

// 23 - malformed agent files
// GIVEN files w/o frontmatter, w/o name, one valid; WHEN task matches valid agent; THEN broken skipped, valid named
{
  const { proj, env } = newRoot('t23');
  writeRawAgent(proj, 'broken-1.md', 'no frontmatter here at all\n');
  writeRawAgent(proj, 'broken-2.md', '---\ndescription: "orphan, Triggers: caching"\n---\nbody\n');
  writeRawAgent(proj, 'broken-3.md', '---\nname:\ndescription: "empty name"\n---\n');
  writeAgent(proj, 'cache-dev', 'Cache owner. Triggers: caching, redis, eviction policy');
  const r = run(
    payload({ cwd: proj, description: 'Investigate the caching and eviction policy in redis' }),
    env,
  );
  check(
    '23-malformed-frontmatter',
    safeParse(r.stdout),
    denyOut(rosterDeny('cache-dev', '.claude/agents/cache-dev.md', 'general-purpose')),
    'unparsable agent files are skipped, valid ones still score',
  );
}

// 24 - unparsable config
// GIVEN invalid-JSON agent-router.json + strong intent text; WHEN hook runs; THEN empty stdout: untrusted config = hands off
{
  const { proj, env } = newRoot('t24');
  standardRoster(proj);
  writeRawConfig(proj, '{ "enabled": true, ');
  const r = run(payload({ cwd: proj, description: INTENT_SKILL }), env);
  check('24-unparsable-config', r.stdout, '', 'a corrupt config must fail open');
  const { proj: proj2, env: env2 } = newRoot('t24b');
  standardRoster(proj2);
  writeRawConfig(proj2, '[]');
  const r2 = run(payload({ cwd: proj2, description: INTENT_SKILL }), env2);
  check('24-array-config', r2.stdout, '', 'an array config must fail open');
}

// 25 - genericTypes override
// GIVEN genericTypes ["worker"]; WHEN worker + general-purpose spawns hit intent; THEN worker denied, general-purpose no longer generic, passes
{
  const { proj, env } = newRoot('t25');
  standardRoster(proj);
  writeConfig(proj, { enabled: true, genericTypes: ['worker'] });
  const rW = run(payload({ cwd: proj, type: 'worker', description: INTENT_BASH }), env);
  check(
    '25-generic-types-worker',
    safeParse(rW.stdout),
    denyOut(intentPluginDeny('shell scripting', 'brewcode:bash-expert', 'worker')),
    'a configured generic type is policed',
  );
  const rG = run(
    payload({ cwd: proj, session: 'S2', type: 'general-purpose', description: INTENT_BASH }),
    env,
  );
  check('25-generic-types-excluded', rG.stdout, '', 'a type off the generic list is allowed');
}

// 26 - neverFlag override
// GIVEN neverFlag ["general-purpose"], default generic list; WHEN intent task as general-purpose; THEN empty stdout: neverFlag wins over genericTypes
{
  const { proj, env } = newRoot('t26');
  standardRoster(proj);
  writeConfig(proj, { enabled: true, neverFlag: ['general-purpose'] });
  const r = run(payload({ cwd: proj, description: INTENT_HOOK }), env);
  check('26-never-flag', r.stdout, '', 'neverFlag must short-circuit before the generic check');
}

// 27 - intents override replaces default table
// GIVEN one custom intent rule; WHEN custom + default (skill) domains spawned; THEN custom denies, default skill rule gone
{
  const { proj, env } = newRoot('t27');
  standardRoster(proj);
  writeConfig(proj, {
    enabled: true,
    intents: [{ match: '\\bwidget\\b', expert: 'proj:widget-expert', label: 'widget' }],
  });
  const rCustom = run(payload({ cwd: proj, description: 'Rebuild the widget renderer' }), env);
  check(
    '27-custom-intent-fires',
    safeParse(rCustom.stdout),
    denyOut(intentPluginDeny('widget', 'proj:widget-expert', 'general-purpose')),
    'a config intent rule is honored',
  );
  const rDefault = run(payload({ cwd: proj, session: 'S2', description: INTENT_SKILL }), env);
  check(
    '27-custom-intent-replaces-defaults',
    rDefault.stdout,
    '',
    'a config intents array replaces the built-in table wholesale',
  );
}

// 28 - broken regex in one rule != disabled table
// GIVEN intents [ {bad regex}, {valid skill rule} ]; WHEN skill task spawned; THEN valid rule still fires
{
  const { proj, env } = newRoot('t28');
  standardRoster(proj);
  writeConfig(proj, {
    enabled: true,
    intents: [
      { match: '([unclosed', expert: 'proj:nope', label: 'broken' },
      { match: '\\bskill\\b', expert: 'brewcode:skill-creator', label: 'skill authoring' },
    ],
  });
  const r = run(payload({ cwd: proj, description: INTENT_SKILL }), env);
  check(
    '28-broken-regex-skipped',
    safeParse(r.stdout),
    denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'an uncompilable rule is skipped, later rules still run',
  );
}

// 29 - minScore/margin overrides
// GIVEN ambiguous two-agent roster, margin 0; WHEN same tie task; THEN tie -> clear winner (name order), denies
{
  const { proj, env } = newRoot('t29');
  writeAgent(proj, 'alpha-dev', 'Alpha owner. Triggers: caching, redis');
  writeAgent(proj, 'beta-dev', 'Beta owner. Triggers: caching, redis');
  writeConfig(proj, { enabled: true, minScore: 3, margin: 0 });
  const r = run(
    payload({ cwd: proj, description: 'Investigate the caching layer with redis' }),
    env,
  );
  check(
    '29-margin-override',
    safeParse(r.stdout),
    denyOut(rosterDeny('alpha-dev', '.claude/agents/alpha-dev.md', 'general-purpose')),
    'margin 0 turns a tie into a deny, broken by name order',
  );
}

// 30 - prompt scan window
// GIVEN intent keyword only past 2000-char prompt scan window; WHEN hook runs; THEN empty stdout: scan bounded, hook cheap
{
  const { proj, env } = newRoot('t30');
  standardRoster(proj);
  const filler = 'lorem ipsum dolor '.repeat(140); // 2520 chars
  const r = run(payload({ cwd: proj, prompt: `${filler}create a new skill for it` }), env);
  check('30-prompt-scan-window', r.stdout, '', 'text past 2000 prompt chars is not scanned');
}

// 31 - omitted subagent_type = general-purpose spawn / empty task text
// GIVEN no subagent_type key; type but no text; WHEN hook runs; THEN omitted type policed as general-purpose; no text silent
{
  const { proj, env } = newRoot('t31');
  standardRoster(proj);
  const r = run(noTypePayload(proj, INTENT_SKILL), env);
  check(
    '31-omitted-subagent-type-intent',
    safeParse(r.stdout),
    denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'an omitted subagent_type is general-purpose per the Agent tool contract',
  );
  const rEmptyText = run(payload({ cwd: proj }), env);
  check('31-empty-task-text', rEmptyText.stdout, '', 'no task text must allow silently');
}

// 31b - omitted subagent_type falls through to roster scoring
// GIVEN no subagent_type key, text inside project agent's triggers; WHEN hook runs; THEN deny naming it, reason built with 'general-purpose'
{
  const { proj, env } = newRoot('t31b');
  standardRoster(proj);
  const text = 'Wire pending approval into the plan lifecycle and the approval matrix';
  const r = run(noTypePayload(proj, text), env);
  check(
    '31b-omitted-type-roster-deny',
    safeParse(r.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'an omitted type reaches roster scoring like an explicit general-purpose',
  );
}

// 31c - omitted subagent_type, general-purpose off generic list
// GIVEN genericTypes ["worker"], no subagent_type, text denying on BOTH paths (intent + roster win) when general-purpose IS generic; WHEN hook runs; THEN empty stdout on both: normalized type must clear generic gate
{
  const { proj, env } = newRoot('t31c');
  standardRoster(proj);
  writeConfig(proj, { enabled: true, genericTypes: ['worker'] });
  const rIntent = run(noTypePayload(proj, INTENT_SKILL), env);
  check(
    '31c-omitted-type-not-generic-intent',
    rIntent.stdout,
    '',
    'intent rule must not fire when the config disowns general-purpose (31 denies on the same text)',
  );
  const rosterText = 'Wire pending approval into the plan lifecycle and the approval matrix';
  const rRoster = run(noTypePayload(proj, rosterText, 'S2'), env);
  check(
    '31c-omitted-type-not-generic-roster',
    rRoster.stdout,
    '',
    'roster scoring must not fire either (31b denies on the same text)',
  );
}

// 32 - roster re-read on every call
// GIVEN winning agent, then SAME file rewritten to no longer match (dir mtime untouched); WHEN same task, new session; THEN silent allow: no cached roster
{
  const { proj, env } = newRoot('t32');
  const text = 'Tune the redis eviction policy for the caching layer';
  writeAgent(proj, 'cache-dev', 'Cache owner. Triggers: caching, redis, eviction policy');
  const r1 = run(payload({ cwd: proj, session: 'C1', description: text }), env);
  check(
    '32-roster-first-read',
    safeParse(r1.stdout),
    denyOut(rosterDeny('cache-dev', '.claude/agents/cache-dev.md', 'general-purpose')),
    'the roster decides on the first call',
  );
  writeAgent(proj, 'cache-dev', 'Docs owner. Triggers: changelog wording');
  const r2 = run(payload({ cwd: proj, session: 'C2', description: text }), env);
  check(
    '32-roster-edit-live',
    r2.stdout,
    '',
    'an edited agent description takes effect on the very next call',
  );
}

// 32b - description scan window
// GIVEN intent keyword only past 500-char description scan window; WHEN hook runs; THEN empty stdout: huge description != regex bill
{
  const { proj, env } = newRoot('t32b');
  standardRoster(proj);
  const filler = 'lorem ipsum dolor '.repeat(40); // 720 chars
  const r = run(payload({ cwd: proj, description: `${filler}create a new skill for it` }), env);
  check('32b-desc-scan-window', r.stdout, '', 'text past 500 description chars is not scanned');
}

// 32c - default neverFlag covers all four built-ins
// GIVEN no config neverFlag, output-style-setup forced onto genericTypes; WHEN intent task with that type; THEN empty stdout: built-in neverFlag holds
{
  const { proj, env } = newRoot('t32c');
  standardRoster(proj);
  writeConfig(proj, { enabled: true, genericTypes: ['general-purpose', 'output-style-setup'] });
  const r = run(
    payload({ cwd: proj, type: 'output-style-setup', description: INTENT_SKILL }),
    env,
  );
  check('32c-never-flag-defaults', r.stdout, '', 'output-style-setup is never flagged by default');
}

// 32d - unusable state root degrades every deny to notice
// GIVEN read-only TMPDIR (no anti-loop marker); WHEN deny-worthy task; THEN additionalContext, never deny: unrecorded deny could loop forever
{
  const { proj, env } = newRoot('t32d');
  standardRoster(proj);
  const ro = join(BASE, 't32d', 'ro-tmp');
  mkdirSync(ro, { recursive: true });
  chmodSync(ro, 0o500);
  const r = run(payload({ cwd: proj, description: INTENT_SKILL }), {
    ...env,
    TMPDIR: ro,
    TMP: ro,
    TEMP: ro,
  });
  chmodSync(ro, 0o700);
  check(
    '32d-unwritable-state-root',
    safeParse(r.stdout),
    ctxOut(repeatCtx('brewcode:skill-creator', 'general-purpose')),
    'a deny that cannot be recorded degrades to a notice',
  );
}

// 33 - config resolved from subdirectory cwd
// GIVEN cwd nested under project root; WHEN intent task; THEN root config (disabled) found: empty stdout
{
  const { proj, env } = newRoot('t33');
  standardRoster(proj);
  writeConfig(proj, { enabled: false });
  const sub = join(proj, 'src', 'deep');
  mkdirSync(sub, { recursive: true });
  const r = run(payload({ cwd: sub, description: INTENT_SKILL }), env);
  check('33-subdir-cwd', r.stdout, '', 'the project root is resolved by climbing from cwd');
}

// 34 - four intent experts on own intent's task never flagged: redirect target != redirect victim
// GIVEN subagent_type = expert the intent rule names; WHEN matching intent text; THEN empty stdout: neverFlag pre-seeded with built-in intent experts
{
  const cases = [
    ['34-self-exempt-skill', 'brewcode:skill-creator', INTENT_SKILL],
    ['34-self-exempt-agent', 'brewcode:agent-creator', INTENT_AGENT],
    ['34-self-exempt-hook', 'brewcode:hook-creator', INTENT_HOOK],
    ['34-self-exempt-bash', 'brewcode:bash-expert', INTENT_BASH],
  ];
  for (const [name, type, text] of cases) {
    const { proj, env } = newRoot(name);
    standardRoster(proj);
    const r = run(payload({ cwd: proj, type, description: text }), env);
    check(name, r.stdout, '', `${type} on its own intent task must allow silently`);
    check(`${name}-exit`, r.status, 0, 'hook must exit 0');
  }
}

// 35 - CUSTOM intents expert auto-exempt w/o explicit neverFlag
// GIVEN intents [{ match: /widget/, expert: "my-db-guru" }], no neverFlag key; WHEN "my-db-guru" on matching task; THEN empty stdout: normalizeConfig() unions neverFlag + intents[].expert
{
  const { proj, env } = newRoot('t35');
  standardRoster(proj);
  writeConfig(proj, {
    enabled: true,
    intents: [{ match: '\\bwidget\\b', expert: 'my-db-guru', label: 'db work' }],
  });
  const r = run(
    payload({ cwd: proj, type: 'my-db-guru', description: 'Rebuild the widget renderer' }),
    env,
  );
  check('35-custom-intent-expert-self-exempt', r.stdout, '', 'a custom intent expert is auto-exempt');
}

// 36 - regression guard: self-exemption must not weaken normal routing
// GIVEN config of 35, my-db-guru on disk as user agent; WHEN general-purpose on same task; THEN deny naming my-db-guru: exemption protects expert only
{
  const { proj, env, cfgDir } = newRoot('t36');
  standardRoster(proj);
  writeUserAgent(cfgDir, 'my-db-guru');
  writeConfig(proj, {
    enabled: true,
    intents: [{ match: '\\bwidget\\b', expert: 'my-db-guru', label: 'db work' }],
  });
  const r = run(
    payload({ cwd: proj, description: 'Rebuild the widget renderer' }),
    env,
  );
  check(
    '36-generic-still-denied',
    safeParse(r.stdout),
    denyOut(intentPluginDeny('db work', 'my-db-guru', 'general-purpose')),
    'general-purpose on a skill/intent task must still be denied',
  );
}

// 37 - BT-F24: nested bare `.claude` must not mask owning project root
// GIVEN config at real root, nested fixture w/ empty `.claude`, DEFAULT-intent text (masked root -> EMPTY roster); WHEN run from nested cwd; THEN root disabled -> silence, enabled -> root's deny
{
  const { proj, env } = newRoot('t37a');
  standardRoster(proj);
  writeConfig(proj, { enabled: false });
  const fixture = join(proj, 'pkg', 'fixture');
  mkdirSync(join(fixture, '.claude'), { recursive: true });
  const r = run(payload({ cwd: fixture, description: INTENT_HOOK }), env);
  check(
    '37a-disabled-root-wins-from-nested-claude',
    r.stdout,
    '',
    'enabled:false at the owning root must silence a nested-cwd intent spawn',
  );
  check('37a-exit', r.status, 0, 'hook must exit 0');
}
{
  const { proj, env } = newRoot('t37b');
  standardRoster(proj);
  writeConfig(proj, { enabled: true });
  const fixture = join(proj, 'pkg', 'fixture');
  mkdirSync(join(fixture, '.claude'), { recursive: true });
  const r = run(payload({ cwd: fixture, description: INTENT_HOOK }), env);
  check(
    '37b-enabled-root-found-from-nested-claude',
    safeParse(r.stdout),
    denyOut(intentPluginDeny('hook authoring', 'brewcode:hook-creator', 'general-purpose')),
    'the owning root config is read from a nested cwd, not the masking .claude',
  );
}
{
  // no router config anywhere: `.git` at the real root outranks the nested `.claude`
  const { proj, env } = newRoot('t37c');
  standardRoster(proj);
  mkdirSync(join(proj, '.git'), { recursive: true });
  const fixture = join(proj, 'pkg', 'fixture');
  mkdirSync(join(fixture, '.claude'), { recursive: true });
  const r = run(payload({ cwd: fixture, description: 'Rework the conductor plan lifecycle gates' }), env);
  check(
    '37c-git-root-outranks-nested-claude',
    safeParse(r.stdout),
    denyOut(
      rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose'),
    ),
    'with no config marker the VCS root is preferred over a nested .claude',
  );
}
{
  // CLAUDE_PROJECT_DIR outranks every walk, per the canonical recipe
  const { proj, env } = newRoot('t37d');
  standardRoster(proj);
  writeConfig(proj, { enabled: false });
  const fixture = join(proj, 'pkg', 'fixture');
  mkdirSync(join(fixture, '.claude', 'brewtools'), { recursive: true });
  writeFileSync(
    join(fixture, '.claude', 'brewtools', 'agent-router.json'),
    JSON.stringify({ enabled: true }),
  );
  const r = run(payload({ cwd: fixture, description: INTENT_HOOK }), {
    ...env,
    CLAUDE_PROJECT_DIR: proj,
  });
  check(
    '37d-env-var-outranks-marker-walk',
    r.stdout,
    '',
    'CLAUDE_PROJECT_DIR wins over a nested config marker',
  );
}

// 38 - BT-F25: documented tier-1/tier-2 trade-off is what ships
// GIVEN strict level, spawn tier 2 exempts as skill-originated (tier 1 lacks that signal); WHEN 2 runs, same (session, root, task); THEN 1st denies at any level (explicit deny wins over tier 2 {"ok": true}), 2nd = notice so retry passes
{
  const { proj, env } = newRoot('t38');
  standardRoster(proj);
  writeConfig(proj, { enabled: true, level: 'strict' });
  const skillOriginated = payload({
    session: 'S38',
    cwd: proj,
    description: INTENT_SKILL,
    prompt: 'Invoked by the /brewtools:plugin-update skill as a fallback worker.',
  });
  const first = run(skillOriginated, env);
  check(
    '38a-strict-tier1-denies-skill-originated',
    safeParse(first.stdout),
    denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'tier 1 has no skill-origin check and tier 2 cannot suppress its deny',
  );
  const second = run(skillOriginated, env);
  check(
    '38b-anti-loop-retry-passes',
    safeParse(second.stdout),
    ctxOut(repeatCtx('brewcode:skill-creator', 'general-purpose')),
    'the identical retry is a notice, never a second block',
  );
  check('38b-exit', second.status, 0, 'hook must exit 0');
}

// 39 - incident: retry rewrote prompt, denied twice
// GIVEN same session + description, REWRITTEN prompt on retry; WHEN 2 runs; THEN deny, then repeat notice: anti-loop key = description, != prompt body
{
  const { proj, env } = newRoot('t39');
  standardRoster(proj);
  const desc = 'Create a new skill for the superreview flow';
  const first = run(
    payload({
      cwd: proj,
      session: 'REWRITE',
      description: desc,
      prompt: 'Run the generator and report its stdout.',
    }),
    env,
  );
  const second = run(
    payload({
      cwd: proj,
      session: 'REWRITE',
      description: desc,
      prompt: 'Run the generator, then report the full stdout verbatim, nothing else.',
    }),
    env,
  );
  check(
    '39a-rewritten-retry-first-denies',
    safeParse(first.stdout),
    denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'first occurrence denies',
  );
  check(
    '39b-rewritten-retry-passes',
    safeParse(second.stdout),
    ctxOut(repeatCtx('brewcode:skill-creator', 'general-purpose')),
    'a reworded prompt on the same task must not mint a fresh marker',
  );
}

// 40 - explicit override escape hatch
// GIVEN strong intent + "agent-router: override" in prompt; WHEN hook runs; THEN empty stdout, exit 0: user outranks every rule
{
  const { proj, env } = newRoot('t40');
  standardRoster(proj);
  const r = run(
    payload({
      cwd: proj,
      description: INTENT_SKILL,
      prompt: 'agent-router: override - this runs a vendor generator, no authoring here.',
    }),
    env,
  );
  check('40-override-allows', r.stdout, '', 'an explicit override must allow silently');
  check('40-override-exit', r.status, 0, 'hook must exit 0');
}

// 41 - plan-engine bug: top-scored agent does NOT cover intent
// GIVEN skill intent fires, sole project agent scores only via its name as config value in prompt; WHEN hook runs; THEN deny names PLUGIN specialist: name != expertise
{
  const { proj, env } = newRoot('t41');
  writeAgent(
    proj,
    'plan-engine',
    'Owns plan engine + domain records. Triggers: pipeline stage, adaptation, compliance gate.',
  );
  const r = run(
    payload({
      cwd: proj,
      description: 'Create a new skill for the superreview flow',
      prompt: 'export ARBITER_AGENT="plan-engine"',
    }),
    env,
  );
  check(
    '41-non-covering-top-agent',
    safeParse(r.stdout),
    denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'a high-scoring agent that does not cover the intent must not be named',
  );
}

// 42 - lower-ranked project agent DOES cover intent
// GIVEN 41's fixture + skill-owning agent scoring below plan-engine; WHEN hook runs; THEN deny names covering PROJECT agent, != top-scored
{
  const { proj, env } = newRoot('t42');
  writeAgent(
    proj,
    'plan-engine',
    'Owns plan engine + domain records. Triggers: pipeline stage, adaptation, compliance gate.',
  );
  writeAgent(
    proj,
    'skill-author',
    'Project skill owner. Triggers: skill, superreview, skill activation',
  );
  const r = run(
    payload({
      cwd: proj,
      description: 'Create a new skill for the superreview flow',
      prompt: 'export ARBITER_AGENT="plan-engine"',
    }),
    env,
  );
  check(
    '42-covering-agent-outranks-specialist',
    safeParse(r.stdout),
    denyOut(
      intentProjectDeny(
        'skill authoring',
        'skill-author',
        '.claude/agents/skill-author.md',
        'general-purpose',
      ),
    ),
    'the first RANKED agent that covers the intent wins, even below the top score',
  );
}

// 43 - bare artifact mention = WEAK signal
// GIVEN read-only grep over generated SKILL.md, no authoring verb; WHEN hook runs; THEN additionalContext naming expert, never deny
{
  const { proj, env } = newRoot('t43');
  standardRoster(proj);
  const r = run(
    payload({
      cwd: proj,
      description: 'List the placeholders left in the generated files',
      prompt: "grep -o '{[A-Z_]*}' .claude/skills/superreview/SKILL.md | sort -u",
    }),
    env,
  );
  check(
    '43-weak-signal-nudges',
    safeParse(r.stdout),
    ctxOut(weakIntentCtx('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'a bare SKILL.md mention nudges, never denies',
  );
  check('43-weak-signal-exit', r.status, 0, 'hook must exit 0');
}

// 44 - real incident, replayed
// GIVEN conductor roster verbatim + "Emit superreview skill" spawn, prompt = vendor generator call (ARBITER_AGENT="plan-engine", grep over SKILL.md, .claude/agents/intent-guard.md); WHEN hook runs; THEN exactly ONE merged nudge: running generator != authoring
{
  const { proj, env } = newRoot('t44');
  const conductor = [
    ['admin-backoffice', 'Admin back-office CRUD + Airtable sync. Triggers: admin controller, admin CRUD screen, Airtable.'],
    ['agronomy-data', 'SOP reference-data read layer. Triggers: crop/activity catalogue, nutrient band, fertilizer resolve.'],
    ['crop-rotation', 'Crop rotation advisory (CRA) owner: rotation advice, pair scoring, justification.'],
    ['economics-pricing', 'Owns lender-facing money - prices, P&L, cash flow. Triggers: pricing, revenue/opex, cash flow.'],
    ['intent-guard', 'Review-phase anti-drift check: asked-vs-delivered. Not for development, invoked explicitly by name.'],
    ['plan-engine', 'Owns plan engine + domain records. Triggers: pipeline stage, adaptation, compliance gate.'],
    ['plan-workflow', 'Plan lifecycle owner - run/result/history, agronomist review, farmer execution and actuals capture.'],
    ['platform-kernel', 'Notification outbox, i18n, web advices, photo storage, audit. Triggers: inbox, outbox, i18n.'],
    ['plots-geo', 'Plots, soil samples and geo/climate-zone matching. Triggers: plot, soil sample, climate zone.'],
    ['security-access', 'Owns Keycloak OIDC auth, role hierarchy, row-level scoping. Triggers: security, roles, access'],
    ['sop-ingest', 'SOP ingest owner. Triggers: DOCX extract, staging proposal, Anthropic client.'],
    ['weather-signals', 'Weather feed and signal owner. Triggers: forecast, weather refresh cron, weather signal.'],
    ['web-templates', 'JTE/HTMX view layer owner. Triggers: .jte template, page or fragment, layout/i18n markup.'],
  ];
  for (const [name, description] of conductor) writeAgent(proj, name, description);
  const incidentPrompt = [
    'GOAL: generate the project-local `superreview` skill into /repo. This is the EMIT step',
    'of brewcode:superreview-setup. The scalar placeholder values were already decided by me.',
    '',
    'ROLE: you run ONE bash command (exports + emit) and report its output.',
    '',
    'SCOPE - from cwd /repo, run EXACTLY this, as one bash invocation:',
    '',
    'export PROJECT_NAME="conductor"',
    'export STACK_LABEL="Java/Kotlin"',
    'export ARBITER_AGENT="plan-engine"',
    'export VALIDATOR_AGENT="general-purpose"',
    'export SCOPE_AGENT_A="Explore"',
    'bash "/plugins/brewcode/skills/superreview-setup/scripts/generate.sh" emit && echo "EMIT_OK"',
    '',
    'Then, read-only, list what landed:',
    'find .claude/skills/superreview -type f | sort',
    "grep -o '{[A-Z_]*}' .claude/skills/superreview/SKILL.md | sort -u",
    '',
    'CONTEXT: recon is done. 12 project domain agents exist plus .claude/agents/intent-guard.md',
    'which ALREADY exists with valid `name: intent-guard` frontmatter.',
  ].join('\n');
  const r = run(
    payload({ cwd: proj, description: 'Emit superreview skill', prompt: incidentPrompt }),
    env,
  );
  check(
    '44-incident-never-denies',
    safeParse(r.stdout),
    ctxOut(weakIntentCtx('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'running a vendor generator must nudge, never deny, and never name the quoted agent',
  );
  check('44-incident-exit', r.status, 0, 'hook must exit 0');
}

// 45 - config-supplied weakMatch honored on both sides
// GIVEN custom intents rule with match + weakMatch; WHEN strong, then weak wording; THEN deny on strong hit, nudge on bare artifact mention
{
  const { proj, env } = newRoot('t45');
  writeConfig(proj, {
    intents: [
      {
        label: 'widget authoring',
        expert: 'proj:widget-expert',
        match: '\\bwidget\\s+authoring\\b',
        weakMatch: '\\bwidget\\b',
      },
    ],
  });
  const strong = run(payload({ cwd: proj, description: 'Start the widget authoring pass' }), env);
  const weak = run(payload({ cwd: proj, description: 'Rebuild the widget renderer' }), env);
  check(
    '45a-config-strong-denies',
    safeParse(strong.stdout),
    denyOut(intentPluginDeny('widget authoring', 'proj:widget-expert', 'general-purpose')),
    'a configured match still denies',
  );
  check(
    '45b-config-weak-nudges',
    safeParse(weak.stdout),
    ctxOut(weakIntentCtx('widget authoring', 'proj:widget-expert', 'general-purpose')),
    'a configured weakMatch nudges instead of denying',
  );
}

// 46 - weak side of agent, hook and bash rules
// GIVEN read-only tasks mentioning .claude/agents/, hooks.json, shebang; WHEN hook runs (empty roster); THEN nudge naming expert, never deny
{
  const weakCases = [
    ['t46a', 'agent-mention', 'Summarise what lives under .claude/agents/ today', '', 'agent authoring', 'brewcode:agent-creator'],
    ['t46b', 'hook-mention', 'Report which events are registered', 'cat hooks.json | jq .', 'hook authoring', 'brewcode:hook-creator'],
    ['t46c', 'shebang-mention', 'Explain what this snippet prints', '#!/usr/bin/env bash\necho hi', 'shell scripting', 'brewcode:bash-expert'],
  ];
  for (const [tag, name, description, prompt, label, expert] of weakCases) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description, prompt }), env);
    check(
      `46-weak-${name}`,
      safeParse(r.stdout),
      ctxOut(weakIntentCtx(label, expert, 'general-purpose')),
      'a bare artifact mention nudges, never denies',
    );
  }
}

// 47 - intentOwner stops at minScore
// GIVEN strong skill intent, ONE project agent covering "skill" but scoring below minScore; WHEN hook runs; THEN PLUGIN expert named: covering agent must earn score
{
  const { proj, env } = newRoot('t47');
  writeAgent(proj, 'skill-scribe', 'Owns the skill catalogue.');
  const r = run(payload({ cwd: proj, description: 'Create a new skill for the superreview flow' }), env);
  check(
    '47-intent-owner-minscore-break',
    safeParse(r.stdout),
    denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'a covering agent below minScore must not be named',
  );
}

// 48 - override token past prompt scan window
// GIVEN strong intent in description, override token at char ~2100 of prompt (past PROMPT_SCAN_CHARS); WHEN hook runs; THEN silent: override matched on untruncated text
{
  const { proj, env } = newRoot('t48');
  standardRoster(proj);
  const r = run(
    payload({
      cwd: proj,
      description: INTENT_SKILL,
      prompt: `${'filler line to push the token out of the window. '.repeat(60)}\nagent-router: override`,
    }),
    env,
  );
  check('48-override-past-window', r.stdout, '', 'the override is honored wherever it is written');
  check('48-override-past-window-exit', r.status, 0, 'hook must exit 0');
}

// 49 - roster deny must survive winner's own name struck out
// GIVEN (a) agent scoring ONLY via name quoted as config value, (b) agent scoring on trigger vocabulary; WHEN hook runs; THEN (a) nudge: coincidence; (b) deny: earned
{
  const a = newRoot('t49a');
  writeAgent(
    a.proj,
    'plan-engine',
    'Owns plan engine + domain records. Triggers: pipeline stage, adaptation, compliance gate.',
  );
  const coincidence = run(
    payload({
      cwd: a.proj,
      description: 'Refresh the release checklist',
      prompt: 'export ARBITER_AGENT="plan-engine"',
    }),
    a.env,
  );
  check(
    '49a-name-only-score-silent',
    coincidence.stdout,
    '',
    'a name quoted as a config value is not expertise - it scores nothing',
  );

  const b = newRoot('t49b');
  writeAgent(
    b.proj,
    'payments-ledger',
    'Owns billing money movement. Triggers: invoice, settlement, ledger entry',
  );
  const earned = run(
    payload({
      cwd: b.proj,
      description: 'Reconcile the invoice settlement and the ledger entry',
    }),
    b.env,
  );
  check(
    '49b-earned-score-denies',
    safeParse(earned.stdout),
    denyOut(
      rosterDeny('payments-ledger', '.claude/agents/payments-ledger.md', 'general-purpose'),
    ),
    'a score earned on trigger vocabulary still denies',
  );
}

// 50 - strong phrasings named by incident review
// GIVEN authoring wordings, 1-2 words between verb and noun; WHEN run on empty roster; THEN each names its plugin expert; `hooks.json` as noun stays weak
{
  const phrasings = [
    ['t50a', 'sessionstart-hook', 'Write a SessionStart hook that injects the roster', 'hook authoring', 'brewcode:hook-creator'],
    ['t50b', 'posttooluse-hook', 'Debug my PostToolUse hook, it never fires', 'hook authoring', 'brewcode:hook-creator'],
    ['t50c', 'slash-command', 'Create a slash command that lints the changelog', 'skill authoring', 'brewcode:skill-creator'],
    ['t50d', 'brewtools-skill', 'Create a new brewtools skill', 'skill authoring', 'brewcode:skill-creator'],
    ['t50e', 'project-agent', 'Write a project agent', 'agent authoring', 'brewcode:agent-creator'],
    ['t50f', 'flaky-script', 'Fix the flaky deploy.sh', 'shell scripting', 'brewcode:bash-expert'],
  ];
  for (const [tag, name, description, label, expert] of phrasings) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description }), env);
    check(
      `50-strong-${name}`,
      safeParse(r.stdout),
      denyOut(intentPluginDeny(label, expert, 'general-purpose')),
      'the loosened verb-to-noun window must still fire',
    );
  }
  const { proj, env } = newRoot('t50g');
  const r = run(
    payload({ cwd: proj, description: 'Update the config, hooks.json lives at the repo root' }),
    env,
  );
  check(
    '50-hooks-json-stays-weak',
    safeParse(r.stdout),
    ctxOut(weakIntentCtx('hook authoring', 'brewcode:hook-creator', 'general-purpose')),
    'a file name is not an authoring request',
  );
}

// 51 - negation guard
// GIVEN text w/ authoring matches, some or all negated; WHEN run on empty roster; THEN every match checked, only later non-negated one may deny
{
  const negations = [
    ['t51a', 'do-not-create', 'Do not create a new agent here; just summarise the roster.'],
    ['t51b', 'explains-how', 'The README explains how to create a skill, but we only need a summary.'],
  ];
  for (const [tag, name, description] of negations) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description }), env);
    check(`51-negation-${name}`, r.stdout, '', 'talk about authoring is not an authoring request');
    check(`51-negation-${name}-exit`, r.status, 0, 'hook must exit 0');
  }

  {
    const { proj, env } = newRoot('t51c');
    const r = run(
      payload({
        cwd: proj,
        description: 'Do not create a new skill. Refactor the skill instead.',
      }),
      env,
    );
    check(
      '51-negated-then-positive-denies',
      safeParse(r.stdout),
      denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
      'a later non-negated match remains a strong routing signal',
    );
    check('51-negated-then-positive-exit', r.status, 0, 'hook must exit 0');
  }

  {
    const { proj, env } = newRoot('t51d');
    const r = run(
      payload({
        cwd: proj,
        description: 'Do not create a skill. Never refactor the skill.',
      }),
      env,
    );
    check('51-all-negated-silent', r.stdout, '', 'all negated matches remain non-effective');
    check('51-all-negated-exit', r.status, 0, 'hook must exit 0');
  }

  {
    const { proj, env } = newRoot('t51e');
    writeConfig(proj, {
      enabled: true,
      intents: [{
        match: '(?=(?:create|Refactor))', expert: 'proj:skill-expert', label: 'skill authoring',
      }],
    });
    const r = run(
      payload({ cwd: proj, description: 'Do not create a skill. Refactor the implementation.' }),
      env,
    );
    check(
      '51-zero-length-after-period-denies',
      safeParse(r.stdout),
      denyOut(intentPluginDeny('skill authoring', 'proj:skill-expert', 'general-purpose')),
      'a zero-length positive match immediately after a sentence boundary is detected',
    );
    check('51-zero-length-after-period-exit', r.status, 0, 'hook terminates successfully');
  }

  {
    const { proj, env } = newRoot('t51f');
    writeConfig(proj, {
      enabled: true,
      intents: [{ match: '(?=skill)', expert: 'proj:skill-expert', label: 'skill authoring' }],
    });
    const r = run(
      payload({ cwd: proj, description: 'Do not skill. Never skill.' }),
      env,
    );
    check('51-zero-length-all-negated-silent', r.stdout, '', 'all zero-length matches advance safely');
    check('51-zero-length-all-negated-exit', r.status, 0, 'hook terminates successfully');
  }

  {
    const { proj, env } = newRoot('t51g');
    const r = run(
      payload({
        cwd: proj,
        description: 'Do not under any circumstances during this carefully reviewed migration create a skill.',
      }),
      env,
    );
    check('51-long-clause-negation-silent', r.stdout, '', 'negation spans the complete current clause');
    check('51-long-clause-negation-exit', r.status, 0, 'hook must exit 0');
  }

  {
    const { proj, env } = newRoot('t51h');
    writeConfig(proj, {
      enabled: true,
      intents: [{ match: '^Refactor', expert: 'proj:skill-expert', label: 'skill authoring' }],
    });
    const r = run(
      payload({ cwd: proj, description: 'Do not create a skill. Refactor the implementation.' }),
      env,
    );
    check('51-full-text-anchor-silent', r.stdout, '', 'slice scanning never turns a mid-text anchor into a hit');
    check('51-full-text-anchor-exit', r.status, 0, 'hook must exit 0');
  }

  for (const [tag, name, description] of [
    ['t51i', 'without-delay', 'Without delay, create a skill.'],
    ['t51j', 'avoid-other-object', 'Avoid mistakes and create a skill.'],
    ['t51k', 'colon-reset', 'Do not create an agent: create a skill.'],
    ['t51l', 'em-dash-reset', 'Do not create an agent — create a skill.'],
  ]) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description }), env);
    check(
      `51-directional-${name}-denies`,
      safeParse(r.stdout),
      denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
      'unrelated or completed negative scope does not suppress positive skill authoring',
    );
    check(`51-directional-${name}-exit`, r.status, 0, 'hook terminates successfully');
  }

  for (const [tag, name, description] of [
    ['t51m', 'comma-predicate-reset', 'Do not create an agent, create a skill.'],
    ['t51n', 'and-predicate-reset', 'Do not create an agent and create a skill.'],
  ]) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description }), env);
    check(
      `51-coordinated-${name}-denies`,
      safeParse(r.stdout),
      denyOut(intentPluginDeny('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
      'a completed negative agent predicate does not suppress a coordinated positive skill predicate',
    );
    check(`51-coordinated-${name}-exit`, r.status, 0, 'hook terminates successfully');
  }

  {
    const { proj, env } = newRoot('t51o');
    const r = run(payload({ cwd: proj, description: 'Do not create an agent or create a skill.' }), env);
    check('51-coordinated-or-stays-negated', r.stdout, '', 'or keeps both predicates inside negative scope');
    check('51-coordinated-or-exit', r.status, 0, 'hook terminates successfully');
  }

  for (const [tag, name, description] of [
    ['t51o1', 'same-skill', 'Do not create a skill and update the skill.'],
    ['t51o2', 'same-agent', 'We must not create an agent and update the agent.'],
    ['t51o3', 'same-hook', 'Never create a hook and debug the hook.'],
  ]) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description }), env);
    check(
      `51-coordinated-${name}-stays-negated`,
      r.stdout,
      '',
      'same-artifact coordinated authoring remains inside the directional negative scope',
    );
    check(`51-coordinated-${name}-exit`, r.status, 0, 'hook terminates successfully');
  }

  for (const [tag, name, description] of [
    ['t51p', 'must-not', 'We must not create a skill; just summarize.'],
    ['t51q', 'should-not', 'We should not create a skill; only review.'],
    ['t51r', 'cannot', 'We cannot create a skill; this is read-only.'],
    ['t51s', 'no-need', 'There is no need to create a skill; inspect existing.'],
  ]) {
    const { proj, env } = newRoot(tag);
    const r = run(payload({ cwd: proj, description }), env);
    check(`51-negative-predicate-${name}`, r.stdout, '', 'negative modal authoring intent stays non-effective');
    check(`51-negative-predicate-${name}-exit`, r.status, 0, 'hook terminates successfully');
  }

  for (const [tag, name, description, shouldDeny] of [
    ['t51t', 'custom-after-comma', 'Do not create a hook, rebuild widget.', true],
    ['t51u', 'custom-after-and', 'Do not create a hook and rebuild widget.', true],
    ['t51v', 'custom-direct-negation', 'Do not rebuild widget.', false],
  ]) {
    const { proj, env } = newRoot(tag);
    writeConfig(proj, {
      enabled: true,
      intents: [{ match: '\\brebuild widget\\b', expert: 'proj:widget-expert', label: 'widget rebuild' }],
    });
    const r = run(payload({ cwd: proj, description }), env);
    check(
      `51-${name}`,
      shouldDeny ? safeParse(r.stdout) : r.stdout,
      shouldDeny
        ? denyOut(intentPluginDeny('widget rebuild', 'proj:widget-expert', 'general-purpose'))
        : '',
      shouldDeny
        ? 'an unrelated completed negative predicate does not suppress a custom positive match'
        : 'a directly negated custom match remains non-effective',
    );
    check(`51-${name}-exit`, r.status, 0, 'hook terminates successfully');
  }
}

// 52 - agent whose vocabulary IS its own name
// GIVEN `sentry` lists own name among its Triggers; WHEN sentry triage task; THEN deny: published name = real evidence, != coincidence
{
  const { proj, env } = newRoot('t52');
  writeAgent(proj, 'sentry', 'Error tracking owner. Triggers: sentry, sentry issue');
  const r = run(
    payload({
      cwd: proj,
      description: 'Sentry is throwing a new sentry issue group in production; triage it.',
    }),
    env,
  );
  check(
    '52-eponymous-trigger-denies',
    safeParse(r.stdout),
    denyOut(rosterDeny('sentry', '.claude/agents/sentry.md', 'general-purpose')),
    'an agent that publishes its name as a trigger keeps its name hits',
  );
}

// 53 - stray agent name must not inflate RUNNER-UP either
// GIVEN payments-ledger + plan-engine, ledger task, with/without `export ARBITER_AGENT="plan-engine"` in prompt; WHEN both ways; THEN deny naming payments-ledger both times: margin uses same name-struck ranking
{
  const expected = denyOut(
    rosterDeny('payments-ledger', '.claude/agents/payments-ledger.md', 'general-purpose'),
  );
  const ledgerCases = [
    ['t53a', 'clean', 'Reconcile the invoice settlement against the ledger entry.'],
    [
      't53b',
      'with-export',
      'export ARBITER_AGENT="plan-engine"\nReconcile the invoice settlement against the ledger entry.',
    ],
  ];
  for (const [tag, name, prompt] of ledgerCases) {
    const { proj, env } = newRoot(tag);
    writeAgent(
      proj,
      'payments-ledger',
      'Owns billing money movement. Triggers: invoice, settlement, ledger entry',
    );
    writeAgent(
      proj,
      'plan-engine',
      'Owns plan engine + domain records. Triggers: pipeline stage, adaptation, compliance gate.',
    );
    const r = run(payload({ cwd: proj, description: 'reconcile invoice', prompt }), env);
    check(
      `53-ledger-${name}-denies`,
      safeParse(r.stdout),
      expected,
      'a quoted name must not inflate the runner-up and kill the margin',
    );
  }
}

// 54 - nudge list ordered on same name-struck ranking
// GIVEN case 41 incident fixture; WHEN hook runs; THEN unearned agent != head of nudge list
{
  const { proj, env } = newRoot('t54');
  writeAgent(
    proj,
    'plan-engine',
    'Owns plan engine + domain records. Triggers: pipeline stage, adaptation, compliance gate.',
  );
  writeAgent(proj, 'release-notes', 'Release notes owner. Triggers: changelog');
  writeAgent(proj, 'docs-index', 'Docs index owner. Triggers: changelog');
  const r = run(
    payload({
      cwd: proj,
      description: 'Refresh the changelog entry',
      prompt: 'export ARBITER_AGENT="plan-engine"',
    }),
    env,
  );
  check(
    '54-nudge-order',
    safeParse(r.stdout),
    ctxOut(
      nudgeCtx(
        [
          ['docs-index', '.claude/agents/docs-index.md'],
          ['release-notes', '.claude/agents/release-notes.md'],
        ],
        'general-purpose',
      ),
    ),
    'an agent that scored only on its quoted name is not recommended at all',
  );
}

// 55 - weak intent + scoring agent -> ONE merged message
// GIVEN bare SKILL.md mention + agent scoring below minScore; WHEN hook runs; THEN single nudge naming specialist + candidate
{
  const { proj, env } = newRoot('t55');
  writeAgent(proj, 'template-scout', 'Template audit owner. Triggers: placeholders');
  const r = run(
    payload({
      cwd: proj,
      description: 'List the placeholders left in the generated files',
      prompt: "grep -o '{[A-Z_]*}' .claude/skills/superreview/SKILL.md | sort -u",
    }),
    env,
  );
  check(
    '55-merged-nudge',
    safeParse(r.stdout),
    ctxOut(
      mergedNudgeCtx(
        'skill authoring',
        'brewcode:skill-creator',
        [['template-scout', '.claude/agents/template-scout.md']],
        'general-purpose',
      ),
    ),
    'the weak signal and the roster nudge must never be two messages',
  );
}

// 56 - recorded 2.1.296 Agent payload, no matching expert
// GIVEN LT9 `benign probe` general-purpose spawn + standard roster; WHEN hook runs; THEN empty stdout, exit 0: no expert, general-purpose is right pick
{
  const { proj, env } = newRoot('t56');
  standardRoster(proj);
  const r = run(JSON.stringify(lt9AgentCall(proj, LT9_BENIGN)), env);
  check('56-recorded-agent-call', { stdout: r.stdout, status: r.status }, { stdout: '', status: 0 },
    'a generic spawn with no matching expert must allow silently');
}

// 57 - tier-2 verifier's own calls never policed
// GIVEN recorded verdict (StructuredOutput, agent_id hook-agent-*, no agent_type) + Agent call w/ same agent_id, skill-intent text; WHEN hook runs on each; THEN both silent allow, exit 0: missing agent_type != error
{
  const { proj, env } = newRoot('t57');
  standardRoster(proj);
  const verdict = run(JSON.stringify(lt9VerifierVerdict(proj)), env);
  const spawn = run(
    JSON.stringify({
      ...lt9AgentCall(proj, { ...LT9_BENIGN, description: INTENT_SKILL }),
      agent_id: 'hook-agent-5148e0ac-4381-4904-831c-94da713e34fc',
    }),
    env,
  );
  check('57-verifier-verdict-ignored',
    { stdout: verdict.stdout, stderr: verdict.stderr, status: verdict.status },
    { stdout: '', stderr: '', status: 0 },
    'the verifier StructuredOutput call must pass untouched');
  check('57-verifier-spawn-ignored',
    { stdout: spawn.stdout, stderr: spawn.stderr, status: spawn.status },
    { stdout: '', stderr: '', status: 0 },
    'a hook-agent-* Agent call must allow silently');
}

// 58 - redirect target not on disk never denies
// GIVEN strong skill intent, weak hook mention, empty plugin cache; WHEN general-purpose spawned on each; THEN strong = notice naming missing expert, no deny; weak = silent
{
  const { proj, env, cfgDir } = newRoot('t58');
  standardRoster(proj);
  rmSync(join(cfgDir, 'plugins'), { recursive: true, force: true });
  const strong = run(payload({ cwd: proj, description: INTENT_SKILL }), env);
  const weak = run(payload({ cwd: proj, description: 'Summarise what hooks.json contains' }), env);
  check('58-missing-expert-strong-is-notice',
    safeParse(strong.stdout),
    ctxOut(unverifiedIntentCtx('skill authoring', 'brewcode:skill-creator', 'general-purpose')),
    'an expert that cannot be found must not block general-purpose');
  check('58-missing-expert-weak-is-silent', weak.stdout, '',
    'a weak signal must not advertise an expert that cannot be found');
}

// 59 - tier-2 heartbeat: expected vs answered verdicts
// GIVEN level strict; main-loop spawn, subagent spawn, one verifier verdict; WHEN --judge-health read fresh, then backdated past grace; THEN 2 expected / 1 answered; overdue 0 fresh, 1 settled
{
  const { proj, tmp, env } = newRoot('t59');
  writeConfig(proj, { level: 'strict' });
  run(JSON.stringify(lt9AgentCall(proj, LT9_BENIGN)), env);
  run(JSON.stringify({ ...lt9AgentCall(proj, LT9_BENIGN), agent_id: 'a5f3', agent_type: 'general-purpose' }), env);
  run(JSON.stringify(lt9VerifierVerdict(proj)), env);
  const session = join(stateDir(tmp, proj), LT9_SESSION);
  const recorded = {
    expected: lineCount(join(session, 'judge-expected')),
    answered: lineCount(join(session, 'judge-answered')),
  };
  const fresh = runCli(['--judge-health', proj], env);
  writeFileSync(join(session, 'judge-expected'), '1000\n2000\n');
  const settled = runCli(['--judge-health', proj], env);
  check('59-heartbeat-recorded', recorded, { expected: 2, answered: 1 },
    'every Agent call expects a verdict, every verifier verdict is counted');
  check('59-heartbeat-fresh', { stdout: fresh.stdout, status: fresh.status },
    { stdout: 'judge_expected=2 judge_answered=1 judge_overdue=0\n', status: 0 },
    'a verdict still inside the grace window is not overdue');
  check('59-heartbeat-settled', { stdout: settled.stdout, status: settled.status },
    { stdout: 'judge_expected=2 judge_answered=1 judge_overdue=1\n', status: 0 },
    'an expected verdict that never arrived is reported as overdue');
}

// 59b - level fast records no heartbeat
// GIVEN default config (level fast) + main-loop spawn; WHEN --judge-health read; THEN all three counters 0
{
  const { proj, env } = newRoot('t59b');
  run(JSON.stringify(lt9AgentCall(proj, LT9_BENIGN)), env);
  const health = runCli(['--judge-health', proj], env);
  check('59b-heartbeat-off-at-fast', { stdout: health.stdout, status: health.status },
    { stdout: 'judge_expected=0 judge_answered=0 judge_overdue=0\n', status: 0 },
    'tier 1 alone must not expect a judge verdict');
}

// 60 - purge removes this project's state only
// GIVEN projects A + B on one TMPDIR, same task denied once each; WHEN --purge-state for A; THEN only B's project dir left; A denies afresh, B replays its notice
{
  const { proj: projA, tmp, env } = newRoot('t60-a');
  const projB = join(BASE, 't60-b', 'proj');
  mkdirSync(join(projB, '.claude'), { recursive: true });
  standardRoster(projA);
  standardRoster(projB);
  const text = 'Wire pending approval into the plan lifecycle and the approval matrix';
  run(payload({ cwd: projA, session: 'PURGE', description: text }), env);
  run(payload({ cwd: projB, session: 'PURGE', description: text }), env);
  const purge = runCli(['--purge-state', projA], env);
  const left = readdirSync(join(tmp, 'brewtools-agent-router'));
  const rA = run(payload({ cwd: projA, session: 'PURGE', description: text }), env);
  const rB = run(payload({ cwd: projB, session: 'PURGE', description: text }), env);
  check('60-purge-output', { stdout: purge.stdout, status: purge.status },
    { stdout: `OK purged ${stateDir(tmp, projA)}\n`, status: 0 },
    'purge must name the one directory it removed');
  check('60-purge-keeps-other-project', left, [stateDir(tmp, projB).split('/').pop()],
    'purge must leave another project state dir in place');
  check('60-purged-project-denies-afresh', safeParse(rA.stdout),
    denyOut(rosterDeny('conductor-dev', '.claude/agents/conductor-dev.md', 'general-purpose')),
    'the purged project has no marker left');
  check('60-other-project-marker-survives', safeParse(rB.stdout),
    ctxOut(repeatCtx('conductor-dev', 'general-purpose')),
    'the other project keeps its anti-loop marker');
}

// 61 - stale sweep: legacy session dirs go, another project's dir stays
// GIVEN 2-day-old pre-6.5 top-level session dir + 2-day-old foreign project dir; WHEN this project records first deny; THEN state root = foreign project dir + this project's dir only
{
  const { proj, tmp, env } = newRoot('t61');
  standardRoster(proj);
  const stateRoot = join(tmp, 'brewtools-agent-router');
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  for (const name of ['legacy-session-id', 'p-0123456789abcdef']) {
    mkdirSync(join(stateRoot, name), { recursive: true, mode: 0o700 });
    utimesSync(join(stateRoot, name), old, old);
  }
  chmodSync(stateRoot, 0o700);
  run(payload({ cwd: proj, description: INTENT_SKILL }), env);
  check('61-stale-sweep', readdirSync(stateRoot).sort(),
    ['p-0123456789abcdef', stateDir(tmp, proj).split('/').pop()].sort(),
    'a stale legacy dir is pruned, a foreign project dir is never touched');
}

// ── 62-69: roster discovery mirrors live Claude Code 2.1.296 (recursive, identity = frontmatter `name`) ──
const CACHE_DESC = 'Cache owner. Triggers: caching, redis, eviction policy';
const CACHE_TASK = 'Investigate the caching and eviction policy in redis';

function writeNestedAgent(agentsDir, relFile, name, description) {
  const file = join(agentsDir, relFile);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `---\nname: ${name}\ndescription: "${description}"\n---\n\nBody.\n`);
}

// GIVEN: the only project agent lives two subfolders deep; WHEN: general-purpose is spawned on its task
// THEN: deny naming it, with its nested path
{
  const { proj, env } = newRoot('t62');
  writeNestedAgent(join(proj, '.claude', 'agents'), 'team/backend/cache-dev.md', 'cache-dev', CACHE_DESC);
  const r = run(payload({ cwd: proj, description: CACHE_TASK }), env);
  check('62-nested-agent-found', safeParse(r.stdout),
    denyOut(rosterDeny('cache-dev', '.claude/agents/team/backend/cache-dev.md', 'general-purpose')),
    'a nested project agent is on the roster');
}

// GIVEN: a top-level file whose name differs from its frontmatter `name`; WHEN: general-purpose is spawned on its task, and then the agent itself is picked
// THEN: the deny names the frontmatter name; picking that name is allowed silently
{
  const { proj, env } = newRoot('t63');
  writeNestedAgent(join(proj, '.claude', 'agents'), 'legacy-file.md', 'cache-dev', CACHE_DESC);
  const r = run(payload({ cwd: proj, description: CACHE_TASK }), env);
  check('63-name-not-filename-deny', safeParse(r.stdout),
    denyOut(rosterDeny('cache-dev', '.claude/agents/legacy-file.md', 'general-purpose')),
    'identity is the frontmatter name, not the file name');
  const self = run(payload({ cwd: proj, type: 'cache-dev', description: CACHE_TASK, session: 'S2' }), env);
  check('63-name-not-filename-picked', self.stdout, '', 'the frontmatter name counts as a picked project expert');
}

// GIVEN: a custom intent expert that exists only as a nested user agent under another file name; WHEN: general-purpose is spawned on the intent task
// THEN: the expert is found on disk, so the intent denies
{
  const { proj, env, cfgDir } = newRoot('t64');
  writeNestedAgent(join(cfgDir, 'agents'), 'db/guru-file.md', 'my-db-guru', 'Database guru');
  writeConfig(proj, { enabled: true, intents: [{ match: '\\bwidget\\b', expert: 'my-db-guru', label: 'db work' }] });
  const r = run(payload({ cwd: proj, description: 'Rebuild the widget renderer' }), env);
  check('64-nested-user-agent-found', safeParse(r.stdout),
    denyOut(intentPluginDeny('db work', 'my-db-guru', 'general-purpose')),
    'a nested user agent keyed by frontmatter name is a real redirect target');
}

// GIVEN: one agent exactly at the depth cap (6 subfolders), one past it (7); WHEN: general-purpose is spawned on each agent's task
// THEN: the capped agent denies, the deeper one is not seen (silent allow)
{
  const { proj, env } = newRoot('t65');
  const agents = join(proj, '.claude', 'agents');
  writeNestedAgent(agents, 'a/b/c/d/e/f/cache-dev.md', 'cache-dev', CACHE_DESC);
  writeNestedAgent(agents, 'a/b/c/d/e/f/g/queue-dev.md', 'queue-dev', 'Queue owner. Triggers: rabbitmq, dead letter');
  const atCap = run(payload({ cwd: proj, description: CACHE_TASK }), env);
  check('65-depth-cap-inside', safeParse(atCap.stdout),
    denyOut(rosterDeny('cache-dev', '.claude/agents/a/b/c/d/e/f/cache-dev.md', 'general-purpose')),
    'an agent 6 subfolders deep is on the roster');
  const past = run(payload({ cwd: proj, description: 'Tune the rabbitmq dead letter flow', session: 'S2' }), env);
  check('65-depth-cap-past', past.stdout, '', 'an agent 7 subfolders deep is past the cap: silent allow');
}

// GIVEN: a symlinked dir to an outside agent plus a symlink cycle back to the agents dir; WHEN: general-purpose is spawned on the outside agent's task
// THEN: the walk follows the link once, terminates, and denies naming the linked path
{
  const { proj, env } = newRoot('t66');
  const agents = join(proj, '.claude', 'agents');
  const outside = join(proj, 'shared-agents');
  writeNestedAgent(outside, 'cache-dev.md', 'cache-dev', CACHE_DESC);
  mkdirSync(agents, { recursive: true });
  symlinkSync(outside, join(agents, 'shared'));
  symlinkSync(agents, join(agents, 'loop'));
  const r = run(payload({ cwd: proj, description: CACHE_TASK }), env);
  check('66-symlink-dir-cycle-safe', { status: r.status, out: safeParse(r.stdout) },
    { status: 0, out: denyOut(rosterDeny('cache-dev', '.claude/agents/shared/cache-dev.md', 'general-purpose')) },
    'a symlinked dir is followed, a cycle is walked once');
}

// GIVEN: agents Claude Code skips (no description, `:` in name, nameless) and one in a dot-dir; WHEN: general-purpose is spawned on their shared task
// THEN: none is on the roster: silent allow, never a deny naming an unloadable agent
{
  const { proj, env } = newRoot('t67');
  const agents = join(proj, '.claude', 'agents');
  writeRawAgent(proj, 'nodesc.md', '---\nname: cache-dev\n---\nBody.\n');
  writeNestedAgent(agents, 'colon.md', 'team:cache-dev', CACHE_DESC);
  writeRawAgent(proj, 'cache-dev.md', `---\ndescription: "${CACHE_DESC}"\n---\nBody.\n`);
  writeNestedAgent(agents, '.drafts/cache-dev.md', 'cache-dev', CACHE_DESC);
  const r = run(payload({ cwd: proj, description: CACHE_TASK }), env);
  check('67-skipped-agent-files', r.stdout, '', 'unloadable and dot-dir agent files never score');
}

// GIVEN: the root is a subdir; the git root above it holds the only agent; a twin tree without `.git`; WHEN: general-purpose is spawned on the agent's task from each subdir root
// THEN: inside git the ancestor agent denies; without git nothing above the root is read
{
  const { proj, env } = newRoot('t68');
  mkdirSync(join(proj, '.git'));
  writeAgent(proj, 'cache-dev', CACHE_DESC);
  const sub = join(proj, 'pkg');
  writeConfig(sub, { enabled: true });
  const r = run(payload({ cwd: sub, description: CACHE_TASK }), env);
  check('68-git-root-agent-found', safeParse(r.stdout),
    denyOut(rosterDeny('cache-dev', '../.claude/agents/cache-dev.md', 'general-purpose')),
    'every .claude/agents up to the git root is on the roster');
  const twin = newRoot('t68b');
  writeAgent(twin.proj, 'cache-dev', CACHE_DESC);
  const twinSub = join(twin.proj, 'pkg');
  writeConfig(twinSub, { enabled: true });
  const rNoGit = run(payload({ cwd: twinSub, description: CACHE_TASK }), twin.env);
  check('68-no-git-root-only', rNoGit.stdout, '', 'without a git root only the root dir is read');
}

// GIVEN: two nested agents, one top-level, one descriptionless file; WHEN: the status probe counts the roster
// THEN: 3 loadable agents
{
  const { proj, env } = newRoot('t69');
  const agents = join(proj, '.claude', 'agents');
  writeAgent(proj, 'top-dev', 'Top owner');
  writeNestedAgent(agents, 'x/one.md', 'one-dev', 'One owner');
  writeNestedAgent(agents, 'x/y/two.md', 'two-dev', 'Two owner');
  writeRawAgent(proj, 'nodesc.md', '---\nname: nodesc-dev\n---\n');
  const r = runCli(['--roster', proj], env);
  check('69-roster-count-cli', { status: r.status, out: r.stdout }, { status: 0, out: '3\n' },
    '--roster counts loadable agents recursively');
}

// Cleanup
try {
  rmSync(BASE, { recursive: true, force: true });
} catch {
  /* ignore */
}

// Report
console.log('\n=== agent-router E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
