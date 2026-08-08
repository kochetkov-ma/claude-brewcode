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

// ── message builders, mirrored verbatim from assets/agent-router.mjs ─────────
const TAIL = '(Deliberate? retry once and it passes.)';

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
// 31 - no subagent_type / empty task text
// GIVEN: a payload with no subagent_type, and one with a generic type but no text
// WHEN: the hook runs
// THEN: stdout empty for both
// ─────────────────────────────────────────────────────────────────────────────
{
  const { proj, env } = newRoot('t31');
  standardRoster(proj);
  const noType = JSON.stringify({
    session_id: 'S1',
    cwd: proj,
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: { description: INTENT_SKILL, prompt: '' },
  });
  check('31-no-subagent-type', run(noType, env).stdout, '', 'no subagent_type must allow silently');
  const rEmptyText = run(payload({ cwd: proj }), env);
  check('31-empty-task-text', rEmptyText.stdout, '', 'no task text must allow silently');
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
