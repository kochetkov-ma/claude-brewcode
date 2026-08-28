#!/usr/bin/env node
/**
 * E2E suite for the agent-router PreToolUse hook (tier 1, deterministic).
 * Runs in an isolated TEMP HOME + TMPDIR per test (os.tmpdir()/os.homedir() both
 * respect these env vars). Never touches the real ~/.claude, real /tmp state, or
 * repo state.
 * Assertion policy: every check is an unconditional exact-equality comparison of
 * the FULL parsed stdout object (or the raw string) with a description; no
 * branching gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..'); // tests/
const ASSETS = join(HERE, '..', 'assets'); // assets/
const HOOK = join(ASSETS, 'agent-router.mjs');

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
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(proj, '.claude'), { recursive: true });
  return { proj, tmp, env: { HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp } };
}

function writeAgent(proj, name, description) {
  const dir = join(proj, '.claude', 'agents');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${name}.md`),
    `---\nname: ${name}\ndescription: "${description}"\ntools: Read, Bash\nmodel: sonnet\n---\n\nBody.\n`,
  );
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
    `agent-router: '${name}' (${rel}) matches this task better than ${picked}` +
    ` - retry with subagent_type: ${name}. ${TAIL}`
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

// ─────────────────────────────────────────────────────────────────────────────
// 01 - non-Agent tool
// GIVEN: a Bash PreToolUse payload whose text would fire the skill intent
// WHEN: the hook runs
// THEN: stdout is empty, exit 0 - only the Agent tool is policed
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t01');
  standardRoster(proj);
  const r = run(payload({ cwd: proj, tool: 'Bash', description: INTENT_SKILL }), env);
  check('01-non-agent-tool', r.stdout, '', 'tool_name != Agent must allow silently');
  check('01-non-agent-tool-exit', r.status, 0, 'hook must exit 0');
}

// ─────────────────────────────────────────────────────────────────────────────
// 02 - subagent-issued spawn
// GIVEN: agent_id present (a subagent spawned this) + skill-intent text
// WHEN: the hook runs
// THEN: stdout empty - only the main loop is policed
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t02');
  standardRoster(proj);
  const r = run(payload({ cwd: proj, agentId: 'ag-1', description: INTENT_SKILL }), env);
  check('02-subagent-issued', r.stdout, '', 'agent_id present must allow silently');
}

// ─────────────────────────────────────────────────────────────────────────────
// 03 - disabled by config
// GIVEN: {"enabled": false} + skill-intent text
// WHEN: the hook runs
// THEN: stdout empty
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t03');
  standardRoster(proj);
  writeConfig(proj, { enabled: false });
  const r = run(payload({ cwd: proj, description: INTENT_SKILL }), env);
  check('03-config-disabled', r.stdout, '', 'enabled:false must allow silently');
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 - a project agent was already picked
// GIVEN: subagent_type conductor-dev + text matching its own triggers
// WHEN: the hook runs
// THEN: stdout empty - the model already picked an expert
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t04');
  standardRoster(proj);
  const r = run(
    payload({ cwd: proj, type: 'conductor-dev', description: 'Wire the approval matrix' }),
    env,
  );
  check('04-project-agent-pick', r.stdout, '', 'a project-agent pick must allow silently');
}

// ─────────────────────────────────────────────────────────────────────────────
// 05/06 - Explore and Plan are never flagged
// GIVEN: subagent_type Explore (intent text) and Plan (strong roster-match text)
// WHEN: the hook runs
// THEN: stdout empty for both
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 07 - a plugin specialist was already picked
// GIVEN: subagent_type brewcode:hook-creator + hook-intent text
// WHEN: the hook runs
// THEN: stdout empty - not on the generic list
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t07');
  standardRoster(proj);
  const r = run(
    payload({ cwd: proj, type: 'brewcode:hook-creator', description: INTENT_HOOK }),
    env,
  );
  check('07-plugin-specialist-pick', r.stdout, '', 'non-generic subagent_type must allow silently');
}

// ─────────────────────────────────────────────────────────────────────────────
// 08..11 - every intent rule fires and names its plugin expert
// GIVEN: a generic pick + text squarely inside each intent domain
// WHEN: the hook runs
// THEN: deny naming the intent's expert, exact reason template, exit 0
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 12..15 - the same intents must NOT fire on near-miss wording
// GIVEN: text mentioning skill/agent/hook/.sh without an authoring verb, or with
//        the word glued into an identifier (agent-router, hook-router)
// WHEN: the hook runs
// THEN: stdout empty - no intent, no roster score
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 16 - a project agent outranks the plugin specialist for the same intent
// GIVEN: the skill intent fires AND a project agent covers skill authoring
// WHEN: the hook runs
// THEN: deny names the PROJECT agent with its path, not brewcode:skill-creator
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 17 - roster scoring, single clear winner
// GIVEN: no intent match, one agent far above minScore and beyond margin
// WHEN: the hook runs
// THEN: deny naming that agent with its .claude/agents path
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 18 - ambiguous roster, no deny
// GIVEN: two agents with identical triggers, both scoring, margin not met
// WHEN: the hook runs
// THEN: additionalContext listing the candidates with paths, NO permissionDecision
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 19 - nothing scores
// GIVEN: a generic pick and text unrelated to every agent
// WHEN: the hook runs
// THEN: stdout empty
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t19');
  standardRoster(proj);
  const r = run(payload({ cwd: proj, description: 'Draft the quarterly budget email' }), env);
  check('19-no-match-silent', r.stdout, '', 'zero score must allow silently');
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 - anti-loop guard
// GIVEN: the identical (session, task) denied once already
// WHEN: the hook runs a second and third time on the same TMPDIR
// THEN: 1st = deny; 2nd/3rd = additionalContext repeat notice, never a deny
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 20b - anti-loop guard is keyed by project root too
// GIVEN: two different project roots, same session, same task text, same TMPDIR
// WHEN: the hook runs once per root
// THEN: both deny - a repo B deny must not be downgraded because repo A already
//       claimed a marker for the identical (session, task) pair
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 21 - garbage and empty stdin
// GIVEN: unparsable stdin, empty stdin, and a JSON array
// WHEN: the hook runs
// THEN: stdout empty, exit 0, nothing on stdout that could corrupt the contract
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 22 - missing .claude/agents
// GIVEN: a project with no roster directory at all
// WHEN: the hook runs on an intent task and on a plain task
// THEN: intent still redirects to the plugin specialist; plain task stays silent
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 23 - malformed agent files
// GIVEN: one file with no frontmatter, one with frontmatter but no name, one valid
// WHEN: the hook runs on a task matching the valid agent
// THEN: the broken files are skipped and the valid agent is still named
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 24 - unparsable config
// GIVEN: agent-router.json that is not valid JSON, plus strong intent text
// WHEN: the hook runs
// THEN: stdout empty - a config we cannot trust means hands off
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 25 - genericTypes override
// GIVEN: genericTypes ["worker"]
// WHEN: a worker and a general-purpose spawn both hit an intent
// THEN: worker is denied; general-purpose is no longer generic and passes
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 26 - neverFlag override
// GIVEN: neverFlag ["general-purpose"] with the default generic list
// WHEN: an intent task is spawned as general-purpose
// THEN: stdout empty - neverFlag wins over genericTypes
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t26');
  standardRoster(proj);
  writeConfig(proj, { enabled: true, neverFlag: ['general-purpose'] });
  const r = run(payload({ cwd: proj, description: INTENT_HOOK }), env);
  check('26-never-flag', r.stdout, '', 'neverFlag must short-circuit before the generic check');
}

// ─────────────────────────────────────────────────────────────────────────────
// 27 - intents override replaces the default table
// GIVEN: a single custom intent rule
// WHEN: the custom domain and a default (skill) domain are spawned
// THEN: the custom rule denies; the default skill rule is gone
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 28 - a broken regex in one rule does not disable the table
// GIVEN: intents [ {bad regex}, {valid skill rule} ]
// WHEN: a skill task is spawned
// THEN: the valid rule still fires
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 29 - minScore/margin overrides
// GIVEN: the ambiguous two-agent roster with margin 0
// WHEN: the same tie task is spawned
// THEN: the tie becomes a clear winner (name order) and denies
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 30 - prompt scan window
// GIVEN: the intent keyword only past the 2000-char prompt scan window
// WHEN: the hook runs
// THEN: stdout empty - the scan is bounded, the hook stays cheap
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t30');
  standardRoster(proj);
  const filler = 'lorem ipsum dolor '.repeat(140); // 2520 chars
  const r = run(payload({ cwd: proj, prompt: `${filler}create a new skill for it` }), env);
  check('30-prompt-scan-window', r.stdout, '', 'text past 2000 prompt chars is not scanned');
}

// ─────────────────────────────────────────────────────────────────────────────
// 31 - omitted subagent_type is a general-purpose spawn / empty task text
// GIVEN: a payload with no subagent_type key at all, and one with a type but no text
// WHEN: the hook runs
// THEN: the omitted type is policed as general-purpose; no text stays silent
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 31b - omitted subagent_type falls through to roster scoring
// GIVEN: no subagent_type key and text squarely inside a project agent's triggers
// WHEN: the hook runs
// THEN: deny naming that project agent, reason built with 'general-purpose'
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 31c - omitted subagent_type with general-purpose off the generic list
// GIVEN: genericTypes ["worker"] and no subagent_type key, on text that denies on
//        BOTH deny paths when general-purpose IS generic (intent rule + roster win)
// WHEN: the hook runs
// THEN: stdout empty on both - the normalized type still has to clear the generic
//       gate; hardcoding general-purpose past that gate makes this fail
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 32 - the roster is re-read on every call
// GIVEN: one agent that wins a task, then the SAME file rewritten so it no longer
//        matches (rewriting in place leaves the directory mtime untouched)
// WHEN: the same task is spawned again in a new session
// THEN: the second run allows silently - no cached roster survives the edit
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 32b - description scan window
// GIVEN: the intent keyword only past the 500-char description scan window
// WHEN: the hook runs
// THEN: stdout empty - a huge description cannot turn into a regex bill
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t32b');
  standardRoster(proj);
  const filler = 'lorem ipsum dolor '.repeat(40); // 720 chars
  const r = run(payload({ cwd: proj, description: `${filler}create a new skill for it` }), env);
  check('32b-desc-scan-window', r.stdout, '', 'text past 500 description chars is not scanned');
}

// ─────────────────────────────────────────────────────────────────────────────
// 32c - default neverFlag covers all four built-ins
// GIVEN: no config neverFlag, and output-style-setup forced onto genericTypes
// WHEN: an intent task is spawned with that type
// THEN: stdout empty - the built-in neverFlag list still holds it back
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 32d - an unusable state root degrades every deny to a notice
// GIVEN: TMPDIR pointing at a read-only directory (no anti-loop marker can be written)
// WHEN: a task that would normally be denied is spawned
// THEN: additionalContext, never a deny - a deny we cannot record could loop forever
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 33 - config resolved from a subdirectory cwd
// GIVEN: cwd is a nested subdirectory of the project root
// WHEN: the hook runs an intent task
// THEN: the root config (disabled) is still found - stdout empty
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t33');
  standardRoster(proj);
  writeConfig(proj, { enabled: false });
  const sub = join(proj, 'src', 'deep');
  mkdirSync(sub, { recursive: true });
  const r = run(payload({ cwd: sub, description: INTENT_SKILL }), env);
  check('33-subdir-cwd', r.stdout, '', 'the project root is resolved by climbing from cwd');
}

// ─────────────────────────────────────────────────────────────────────────────
// 34 - the four intent experts, spawned directly on their own intent's task,
//      are never flagged - a redirect target can never be a redirect victim
// GIVEN: subagent_type is the very expert an intent rule would have named
// WHEN: the hook runs with matching intent text
// THEN: stdout empty - neverFlag pre-seeded with the built-in intent experts
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 35 - a CUSTOM intents entry's expert is auto-exempt without being listed in
//      neverFlag explicitly
// GIVEN: intents [{ match: /widget/, expert: "my-db-guru" }], no neverFlag key
// WHEN: subagent_type "my-db-guru" is spawned on a matching task
// THEN: stdout empty - normalizeConfig() unions neverFlag with intents[].expert
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 36 - regression guard: the self-exemption must not weaken normal routing
// GIVEN: the same custom-intents config as 35
// WHEN: general-purpose is spawned on the same matching task
// THEN: deny naming my-db-guru - the exemption only protects the expert itself
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t36');
  standardRoster(proj);
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

// ─────────────────────────────────────────────────────────────────────────────
// 37 - BT-F24: a nested bare `.claude` must not mask the owning project root
// GIVEN: the real root carries the router config; a nested fixture dir carries an
//        empty `.claude` and nothing else; the task text matches a DEFAULT intent
//        (an intent prompt is mandatory here - the masked root yields an EMPTY
//        roster, so roster scoring can never fire and would not reproduce)
// WHEN:  the hook runs from the nested fixture cwd
// THEN:  disabled at the real root -> silence; enabled at the real root -> the same
//        deny the real root produces. Root ownership, not directory existence.
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 38 - BT-F25: the documented tier-1/tier-2 trade-off is what actually ships
// GIVEN: strict level (tier 2 installed alongside tier 1) and a spawn tier 2 would
//        exempt as skill-originated - tier 1 has no skill-origin signal at all
// WHEN:  the hook runs twice on the identical (session, root, task)
// THEN:  call 1 denies regardless of level - hooks run in parallel, an explicit deny
//        wins, tier 1 cannot be gated by tier 2's {"ok": true}; call 2 passes as a
//        non-blocking notice, so the model's retry always gets through
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 39 - the incident: the retry rewrote the prompt and was denied a second time
// GIVEN: the same session, same description, a REWRITTEN prompt on the retry
// WHEN:  the hook runs twice
// THEN:  deny, then the repeat notice - the anti-loop key is the description, not
//        the prompt body the model reformulates on every retry
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 40 - explicit override escape hatch
// GIVEN: strong intent text plus "agent-router: override" in the prompt
// WHEN:  the hook runs
// THEN:  stdout empty, exit 0 - the user out-ranks every rule, silently
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 41 - the plan-engine bug: the top-scored agent does NOT cover the intent
// GIVEN: the skill intent fires; the only project agent scores solely because its
//        name appears verbatim in the prompt as a config value
// WHEN:  the hook runs
// THEN:  deny names the PLUGIN specialist - a name in the prompt is not expertise
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 42 - a lower-ranked project agent DOES cover the intent
// GIVEN: the same fixture plus a skill-owning agent that scores less than plan-engine
// WHEN:  the hook runs
// THEN:  deny names the covering PROJECT agent, not the top-scored one
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 43 - a bare artifact mention is a WEAK signal
// GIVEN: a read-only grep over a generated SKILL.md, no authoring verb anywhere
// WHEN:  the hook runs
// THEN:  additionalContext naming the expert, never a deny
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 44 - the real incident, replayed
// GIVEN: the conductor roster verbatim and the "Emit superreview skill" spawn whose
//        prompt is a vendor generator invocation (ARBITER_AGENT="plan-engine",
//        a grep over SKILL.md, .claude/agents/intent-guard.md)
// WHEN:  the hook runs
// THEN:  exactly ONE merged nudge object - running a generator is not authoring,
//        and plan-engine is only in the text as a config value
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 45 - a config-supplied weakMatch is honored on both sides
// GIVEN: a custom intents table whose single rule carries match + weakMatch
// WHEN:  the strong wording runs, then the weak one
// THEN:  deny for the strong hit, nudge for the bare artifact mention
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 46 - the weak side of the agent, hook and bash rules
// GIVEN: read-only tasks that merely mention .claude/agents/, hooks.json, a shebang
// WHEN:  the hook runs (empty roster, so nothing else can speak)
// THEN:  a nudge naming the expert - never a deny
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 47 - intentOwner stops at minScore
// GIVEN: strong skill intent and ONE project agent that covers "skill" in its own
//        words but scores below minScore
// WHEN:  the hook runs
// THEN:  the PLUGIN expert is named - a covering agent still has to earn the score
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 48 - the override token past the prompt scan window
// GIVEN: strong intent in the description and the override token at char ~2100 of
//        the prompt, well past PROMPT_SCAN_CHARS
// WHEN:  the hook runs
// THEN:  still silent - the override is matched on the untruncated text
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 49 - a roster deny must survive the winner's own name being struck out
// GIVEN: (a) an agent whose ONLY score comes from its name quoted as a config value
//        (b) an agent that scores on its trigger vocabulary alone
// WHEN:  the hook runs
// THEN:  (a) nudge - the score was coincidence; (b) deny - the score was earned
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 50 - the strong phrasings the incident review named
// GIVEN: authoring wordings with one or two words between the verb and the noun
// WHEN:  the hook runs against an empty roster
// THEN:  each names its plugin expert; `hooks.json` as a noun stays weak
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 51 - negation guard
// GIVEN: text with one or more authoring matches, some or all negated
// WHEN:  the hook runs against an empty roster
// THEN:  every match is checked; only a later non-negated match may deny
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 52 - an agent whose vocabulary IS its own name
// GIVEN: `sentry`, which declares its own name among its Triggers
// WHEN:  a sentry triage task runs
// THEN:  deny - a published name is real evidence, not a coincidence
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 53 - a stray agent name must not inflate the RUNNER-UP either
// GIVEN: payments-ledger + plan-engine, a ledger task, with and without the
//        `export ARBITER_AGENT="plan-engine"` line in the prompt
// WHEN:  the hook runs both ways
// THEN:  deny naming payments-ledger in both - the margin is computed on the same
//        name-struck ranking, so a quoted name cannot suppress a real winner
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 54 - the nudge list is ordered on the same name-struck ranking
// GIVEN: the incident fixture from case 41
// WHEN:  the hook runs
// THEN:  the unearned agent does not head the nudge list
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 55 - a weak intent and a scoring agent produce ONE merged message
// GIVEN: a bare SKILL.md mention plus an agent that scores below minScore
// WHEN:  the hook runs
// THEN:  a single nudge naming both the specialist and the candidate
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────────────────────────────────────
try {
  rmSync(BASE, { recursive: true, force: true });
} catch {
  /* ignore */
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== agent-router E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
