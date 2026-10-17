#!/usr/bin/env node
// Suite A — teams lifecycle roster + argument safety (scripts/toggle-team.sh, verify-team.sh, detect-mode.sh).
// BCOP08: roster value in move/probe/delete paths, `../../../outside/README` renamed a file OUTSIDE; temp base, never ~/.claude.
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const TOGGLE = join(HERE, '..', 'scripts', 'toggle-team.sh');
const VERIFY = join(HERE, '..', 'scripts', 'verify-team.sh');
const OWNERS = join(HERE, '..', 'scripts', 'agent-owners.sh');
const GENERATOR = join(HERE, '..', 'scripts', 'agent-generator.sh');
const DETECT = join(HERE, '..', 'scripts', 'detect-mode.sh');
const FRAMEWORK = join(HERE, '..', 'references', 'framework-files.md');

// realpath: macOS /var is a symlink to /private/var
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'teams-lifecycle-')));
let passed = 0;
let failed = 0;
const results = [];

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

/** JSON, capped: a failed byte comparison must not bury the report under a whole agent file. */
function render(v) {
  const s = JSON.stringify(v);
  return s.length <= 220 ? s : `${s.slice(0, 220)}...<${s.length} chars>`;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(`  FAIL  ${name}  (${message} | actual=${render(actual)} expected=${render(expected)})`);
  }
}

function run(script, args, cwd) {
  // Hang guard, not a readiness wait: verify-team.sh runs the tokenizer, slow under load.
  const r = spawnSync('bash', [script, ...args], { cwd, encoding: 'utf8', timeout: 180000 });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// macOS /bin/bash 3.2 under a UTF-8 locale: a-z ranges and [:lower:] match accented letters there.
function runUtf8(script, args, cwd) {
  const r = spawnSync('/bin/bash', [script, ...args], { cwd, encoding: 'utf8', timeout: 180000, env: { ...process.env, LC_ALL: 'en_US.UTF-8' } });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// Trailing `KEY:VALUE` summary of toggle-team.sh; LAST occurrence wins (progress lines share `MOVED:`).
function summary(stdout) {
  const out = {};
  for (const key of ['ACTION', 'TEAM', 'MOVED', 'SKIPPED', 'MISSING', 'INVALID']) {
    const hits = [...stdout.matchAll(new RegExp(`^${key}:(.*)$`, 'gm'))];
    out[key] = hits.length === 0 ? '<absent>' : hits[hits.length - 1][1];
  }
  return out;
}

const linesStartingWith = (stdout, prefix) =>
  stdout.split('\n').filter((l) => l.startsWith(prefix));

const AGENT_BODY = (name) => `---
name: ${name}
description: "Fixture agent for lifecycle validation."
model: sonnet
tools: Read
doc_type: llm
version: "6.1.4"
generated_by: "brewcode:teams-setup"
last_updated: "2026-08-16"
---

## Mission
${name}: fixture mission.

## Owned surfaces
Fixture paths.

## Exclusions
Foreign work.

## Must-load references
- \`.claude/teams/t1/team.md\` first.

## Unique invariants
Preserve fixture bytes.

## Unique verification
Run lifecycle checks.
`;

// `## Agents` header separator spellings: compact (shipped template), space-padded (markdown formatter), none.
const SEPARATORS = {
  compact: '|-------|--------|---------|--------|---------|------|---------|',
  padded: '| ------- | -------- | --------- | -------- | --------- | ------ | --------- |',
  malformedSlash: '|---/|--------|---------|--------|---------|------|---------|',
  none: null,
};

// Project root with one team: `rows` = `## Agents` Agent-column values in order, `agentFiles` = names in .claude/agents/.
function makeProject(label, rows, agentFiles, separator = 'compact') {
  const root = join(BASE, label, 'proj');
  const teamDir = join(root, '.claude', 'teams', 't1');
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  mkdirSync(teamDir, { recursive: true });
  const policy = rows.includes('intent-guard') ? 'required' : 'legacy-absent';
  const domainRows = rows.filter((name) => name !== 'intent-guard')
    .map((name) => `|${name}|api|fixture mission|active|2026-08-16|domain|6.1.4|`);
  const guardRow = policy === 'required'
    ? '|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|2026-08-16|review-only|6.1.4|'
    : '';
  const framework = readFileSync(FRAMEWORK, 'utf8');
  const headingAt = framework.indexOf('## team.md');
  const fenceAt = framework.indexOf('```markdown\n', headingAt) + '```markdown\n'.length;
  const fenceEnd = framework.indexOf('\n```', fenceAt);
  const canonicalSeparator = '|---|---|---|---|---|---|---|';
  const selectedSeparator = SEPARATORS[separator] ?? '';
  const team = framework.slice(fenceAt, fenceEnd)
    .replaceAll('{TEAM_NAME}', 't1')
    .replaceAll('{DATE}', '2026-08-16')
    .replaceAll('{LAST_UPDATED}', '2026-08-16')
    .replaceAll('{PLUGIN_VERSION}', '6.1.4')
    .replaceAll('{CONTENT_VERSION}', '6.1.0')
    .replaceAll('{N}', String(domainRows.length))
    .replaceAll('{CWD}', root)
    .replaceAll('{REPORT_ROOT}', '.claude/reports')
    .replaceAll('{INTENT_GUARD_POLICY}', policy)
    .replaceAll('{INTENT_GUARD_SHARED_CONTRACT}', policy === 'required'
      ? '`intent-guard` is review-only, keeps its own output contract, and never implements.' : '')
    .replaceAll('{INTENT_GUARD_ROW}', [guardRow, ...domainRows].filter(Boolean).join('\n'))
    .replace(canonicalSeparator, selectedSeparator);
  writeFileSync(
    join(teamDir, 'team.md'),
    `${team}\n`,
  );
  writeFileSync(join(teamDir, 'trace.jsonl'), '');
  for (const f of agentFiles) writeFileSync(join(root, '.claude', 'agents', `${f}.md`), AGENT_BODY(f));
  return root;
}

/** A file that lives OUTSIDE the project root — the BCOP08 victim. */
function makeVictim(label, body) {
  const p = join(BASE, label, 'outside', 'README.md');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
}

const ls = (dir) => readdirSync(dir).sort();
// A renamed victim is the BCOP08 failure itself, so reading it must report, never throw.
const readOrGone = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '<file gone>');
const TRAVERSAL = '../../../outside/README';

// A1 — BCOP08: a traversal roster row must move nothing, inside or outside.
{
  const root = makeProject('a1', ['worker-one', TRAVERSAL, 'intent-guard'], ['worker-one', 'intent-guard']);
  const victim = makeVictim('a1', 'VICTIM\n');
  const r = run(TOGGLE, ['t1', 'disable'], root);

  check('a1.status', r.status, 1, 'disable exits 1 when a roster row is not an agent id');
  check(
    'a1.summary',
    summary(r.stdout),
    { ACTION: 'disable', TEAM: 't1', MOVED: '1', SKIPPED: '1', MISSING: '0', INVALID: '1' },
    'one valid member parked, intent-guard skipped, one row refused',
  );
  check(
    'a1.skipLines',
    linesStartingWith(r.stdout, 'SKIP:'),
    [
      'SKIP:intent-guard (shared with superreview-setup)',
      `SKIP:invalid agent id '${TRAVERSAL}' (not ^[a-z0-9][a-z0-9-]*$) -- nothing under .claude/agents touched`,
    ],
    'the canonical guard row is skipped and the refusal names the offending domain value',
  );
  check('a1.victimBytes', readOrGone(victim), 'VICTIM\n', 'the file outside the project is byte-unchanged');
  check(
    'a1.outsideDir',
    ls(join(BASE, 'a1', 'outside')),
    ['README.md'],
    'no .md.disabled was created outside the project',
  );
  check(
    'a1.agentsDir',
    ls(join(root, '.claude', 'agents')),
    ['intent-guard.md', 'worker-one.md.disabled'],
    'only the valid member was parked; intent-guard stayed live',
  );
}

// A2 — the dry run refuses the same row: `WOULD:` never names a path outside.
{
  const root = makeProject('a2', ['worker-one', TRAVERSAL], ['worker-one']);
  const victim = makeVictim('a2', 'VICTIM\n');
  const r = run(TOGGLE, ['t1', 'disable', '--dry-run'], root);

  check('a2.status', r.status, 1, 'the dry run reports the invalid row as a failure too');
  check(
    'a2.wouldLines',
    linesStartingWith(r.stdout, 'WOULD:'),
    ['WOULD:.claude/agents/worker-one.md -> .claude/agents/worker-one.md.disabled'],
    'exactly one planned move, and it is inside .claude/agents/',
  );
  check('a2.victimBytes', readOrGone(victim), 'VICTIM\n', 'dry run leaves the outside file alone');
  check(
    'a2.agentsDir',
    ls(join(root, '.claude', 'agents')),
    ['worker-one.md'],
    'dry run writes nothing',
  );
}

// A3 — the full rejected shape set: traversal, slash, leading dot, uppercase,
//      underscore. An empty Agent cell is skipped silently, as before.
{
  const bad = [TRAVERSAL, 'sub/dir', '.hidden', '..', 'Upper-Case', 'snake_case'];
  const root = makeProject('a3', [...bad, '', 'worker-one'], ['worker-one']);
  const r = run(TOGGLE, ['t1', 'disable'], root);

  check('a3.status', r.status, 1, 'any invalid id fails the run');
  check(
    'a3.summary',
    summary(r.stdout),
    { ACTION: 'disable', TEAM: 't1', MOVED: '1', SKIPPED: '0', MISSING: '0', INVALID: '6' },
    'all six malformed ids refused; the empty cell is not counted; the one real member moved',
  );
  check(
    'a3.skipCount',
    linesStartingWith(r.stdout, 'SKIP:invalid agent id').length,
    6,
    'one refusal line per malformed row',
  );
  check(
    'a3.agentsDir',
    ls(join(root, '.claude', 'agents')),
    ['worker-one.md.disabled'],
    'nothing but the valid member exists under .claude/agents/',
  );
}

// A4 — the parking contract still holds: disable/enable is a byte-preserving
//      round trip and intent-guard is never parked.
{
  const root = makeProject('a4', ['alpha-agent', 'beta-agent', 'intent-guard'],
    ['alpha-agent', 'beta-agent', 'intent-guard']);
  const agents = join(root, '.claude', 'agents');
  const before = {
    alpha: readFileSync(join(agents, 'alpha-agent.md'), 'utf8'),
    beta: readFileSync(join(agents, 'beta-agent.md'), 'utf8'),
    guard: readFileSync(join(agents, 'intent-guard.md'), 'utf8'),
  };

  const off = run(TOGGLE, ['t1', 'disable'], root);
  check('a4.disableStatus', off.status, 0, 'a clean roster disables successfully');
  check(
    'a4.disableSummary',
    summary(off.stdout),
    { ACTION: 'disable', TEAM: 't1', MOVED: '2', SKIPPED: '1', MISSING: '0', INVALID: '0' },
    'both domain members parked, intent-guard skipped, nothing invalid',
  );
  check(
    'a4.parkedDir',
    ls(agents),
    ['alpha-agent.md.disabled', 'beta-agent.md.disabled', 'intent-guard.md'],
    'parking renames only the two domain members',
  );
  check(
    'a4.parkedBytes',
    readFileSync(join(agents, 'alpha-agent.md.disabled'), 'utf8'),
    before.alpha,
    'the parked body is byte-identical',
  );

  const on = run(TOGGLE, ['t1', 'enable'], root);
  check('a4.enableStatus', on.status, 0, 'enable is the exact inverse');
  check(
    'a4.enableSummary',
    summary(on.stdout),
    { ACTION: 'enable', TEAM: 't1', MOVED: '2', SKIPPED: '1', MISSING: '0', INVALID: '0' },
    'both members restored',
  );
  check(
    'a4.restoredTree',
    {
      names: ls(agents),
      alpha: readFileSync(join(agents, 'alpha-agent.md'), 'utf8'),
      beta: readFileSync(join(agents, 'beta-agent.md'), 'utf8'),
      guard: readFileSync(join(agents, 'intent-guard.md'), 'utf8'),
    },
    {
      names: ['alpha-agent.md', 'beta-agent.md', 'intent-guard.md'],
      alpha: before.alpha,
      beta: before.beta,
      guard: before.guard,
    },
    'the round trip restores every name and every byte',
  );
}

// A5 — verify-team.sh fails the same row and probes nothing outside the tree.
{
  const root = makeProject('a5', ['worker-one', TRAVERSAL], ['worker-one']);
  const victim = makeVictim('a5', 'VICTIM\n');
  const r = run(VERIFY, ['t1'], root);

  check('a5.status', r.status, 1, 'verification fails on a roster value that is not an agent id');
  check(
    'a5.failLine',
    linesStartingWith(r.stdout, `CHECK: agent '`),
    [`CHECK: agent '${TRAVERSAL}' ... FAIL (not an agent id: must match ^[a-z0-9][a-z0-9-]*$ --`],
    'the failure quotes the offending value',
  );
  check(
    'a5.verdict',
    linesStartingWith(r.stdout, 'VERIFY:'),
    ['VERIFY: FAIL'],
    'exactly one verdict line, and it is FAIL',
  );
  check('a5.victimBytes', readOrGone(victim), 'VICTIM\n', 'verification never touches the outside file');
}

// A6 — verify-team.sh still passes a clean roster, parked or live.
{
  const root = makeProject('a6', ['alpha-agent', 'intent-guard'], ['alpha-agent', 'intent-guard']);
  const live = run(VERIFY, ['t1'], root);
  check('a6.liveStatus', live.status, 0, 'a clean live roster verifies');
  check(
    'a6.liveDisabledCount',
    linesStartingWith(live.stdout, 'DISABLED_AGENTS:'),
    ['DISABLED_AGENTS:0'],
    'no member is parked',
  );

  run(TOGGLE, ['t1', 'disable'], root);
  const parked = run(VERIFY, ['t1'], root);
  check('a6.parkedStatus', parked.status, 0, 'a parked roster is a state, not a defect');
  check(
    'a6.parkedDisabledCount',
    linesStartingWith(parked.stdout, 'DISABLED_AGENTS:'),
    ['DISABLED_AGENTS:1'],
    'the one domain member is reported as parked',
  );
  check(
    'a6.parkedExtension',
    parked.stdout.includes('agent file(s) parked as .md.disabled'),
    true,
    'the disabled summary names the Claude agent parking extension',
  );
}

// A7 — a SPACE-PADDED separator (`| ------ |`, markdown formatter output) must parse: compact-only `---|`
//      matching set past_header to 0 and printed `MOVED:0` + `✅ disable` while every agent stayed LIVE.
{
  const root = makeProject('a7', ['alpha-agent', 'beta-agent', 'intent-guard'],
    ['alpha-agent', 'beta-agent', 'intent-guard'], 'padded');
  const agents = join(root, '.claude', 'agents');
  const r = run(TOGGLE, ['t1', 'disable'], root);

  check('a7.status', r.status, 0, 'a padded separator is a valid roster, not a failure');
  check(
    'a7.summary',
    summary(r.stdout),
    { ACTION: 'disable', TEAM: 't1', MOVED: '2', SKIPPED: '1', MISSING: '0', INVALID: '0' },
    'both domain members parked from a padded roster, intent-guard skipped',
  );
  check(
    'a7.agentsDir',
    ls(agents),
    ['alpha-agent.md.disabled', 'beta-agent.md.disabled', 'intent-guard.md'],
    'disable actually parked the files -- MOVED:0 with live agents is the bug this pins',
  );

  const v = run(VERIFY, ['t1'], root);
  check('a7.verifyStatus', v.status, 0, 'verify reads the padded roster too');
  check(
    'a7.verifyDisabledCount',
    linesStartingWith(v.stdout, 'DISABLED_AGENTS:'),
    ['DISABLED_AGENTS:2'],
    'verify counts both parked members instead of seeing an empty table',
  );
  check(
    'a7.verifyExtension',
    v.stdout.includes('agent file(s) parked as .md.disabled'),
    true,
    'the disabled summary names the Claude agent parking extension',
  );
}

// A8 — a roster whose separator row is absent parses nothing. `disable` must
//      FAIL there: a success verdict over an unparsed table is the silent no-op.
{
  const root = makeProject('a8', ['alpha-agent'], ['alpha-agent'], 'none');
  const r = run(TOGGLE, ['t1', 'disable'], root);

  check('a8.status', r.status, 1, 'an unparseable ## Agents table fails the run');
  check(
    'a8.summary',
    summary(r.stdout),
    { ACTION: 'disable', TEAM: 't1', MOVED: '0', SKIPPED: '0', MISSING: '0', INVALID: '0' },
    'nothing was moved, and the counters alone would have read as a clean empty team',
  );
  check(
    'a8.failLine',
    linesStartingWith(r.stdout, '❌ FAILED -- parsed no ## Agents rows').length,
    1,
    'the run names the parse failure instead of printing a disable verdict',
  );
  check(
    'a8.verdictLines',
    linesStartingWith(r.stdout, '✅'),
    [],
    'no success line is printed while the agent file is still live',
  );
  check(
    'a8.agentsDir',
    ls(join(root, '.claude', 'agents')),
    ['alpha-agent.md'],
    'the agent file is untouched, which is exactly why the run must not exit 0',
  );
}

// A9 — valid_agent_id is a path-traversal guard: the single-`case` form must reject every shape
//      the three-block form did, and accept the ordinary ids.
{
  // The guard is exercised as the shipped source, lifted verbatim from toggle-team.sh -- a copy
  // pasted into the test would pass while the real one drifted.
  const lines = readFileSync(TOGGLE, 'utf8').split('\n');
  const from = lines.findIndex((l) => l.startsWith('valid_agent_id()'));
  const to = lines.indexOf('}', from);
  check('a9.guardFound', [from >= 0, to > from], [true, true], 'valid_agent_id() was located in toggle-team.sh');

  const probe = join(BASE, 'a9-probe.sh');
  writeFileSync(probe, [
    '#!/bin/sh',
    'set -eu',
    ...lines.slice(from, to + 1),
    'for id in "$@"; do if valid_agent_id "$id"; then echo "ACCEPT"; else echo "REJECT"; fi; done',
  ].join('\n'));

  const reject = [
    TRAVERSAL, '..', '.', '.hidden', 'sub/dir', '/abs', 'a/b', 'Upper-Case', 'snake_case',
    '-leading-dash', 'trailing space', 'semi;colon', 'dollar$sign', 'dot.ted', '',
  ];
  const accept = ['worker-one', 'intent-guard', 'a', 'a1', '9lives', 'x-y-z'];
  const r = run(probe, [...reject, ...accept], BASE);

  check(
    'a9.verdicts',
    r.stdout.trim().split('\n'),
    [...reject.map(() => 'REJECT'), ...accept.map(() => 'ACCEPT')],
    'the collapsed guard rejects every traversal/charset shape and accepts every ordinary id',
  );
  check('a9.nonAscii', runUtf8(probe, ['é1', 'café'], BASE).stdout, 'REJECT\nREJECT\n',
    'GIVEN non-ASCII ids under /bin/bash and a UTF-8 locale WHEN the guard runs THEN each is rejected');
}

// A10 — separator recognition is exact: triple hyphens inside a valid agent id
//       are data, while near-separators containing foreign bytes are unreadable.
{
  const validRoot = makeProject('a10-valid', ['foo---bar'], ['foo---bar']);
  const toggled = run(TOGGLE, ['t1', 'disable'], validRoot);
  const verified = run(VERIFY, ['t1'], validRoot);
  const owned = run(OWNERS, ['foo---bar'], validRoot);
  check('a10.validToggle', [toggled.status, summary(toggled.stdout).MOVED], [0, '1'],
    'toggle parses and parks a valid triple-hyphen agent id');
  check('a10.validVerify', [verified.status, verified.stdout.includes('CHECK: agent foo---bar ...')], [0, true],
    'verify does not skip a valid triple-hyphen roster row');
  check('a10.validOwner', [owned.status, owned.stdout], [0, 't1\n'],
    'ownership lookup retains the valid triple-hyphen row');

  const malformedRoot = makeProject('a10-malformed', ['alpha-agent'], ['alpha-agent'], 'malformedSlash');
  const malformedToggle = run(TOGGLE, ['t1', 'disable'], malformedRoot);
  const malformedVerify = run(VERIFY, ['t1'], malformedRoot);
  const malformedOwner = run(OWNERS, ['alpha-agent'], malformedRoot);
  check('a10.malformedToggle', malformedToggle.status, 1,
    'toggle refuses a foreign-byte near-separator instead of skipping it as valid');
  check('a10.malformedVerify', malformedVerify.status, 1,
    'verify refuses the same unreadable roster');
  check('a10.malformedOwner', [malformedOwner.status, malformedOwner.stdout], [1, ''],
    'ownership lookup fails closed with no partial answer');

  const scriptSources = [TOGGLE, VERIFY, OWNERS].map((path) => {
    const lines = readFileSync(path, 'utf8').split('\n');
    const from = lines.findIndex((line) => line.startsWith('is_separator_row()'));
    const to = lines.indexOf('}', from);
    return lines.slice(from, to + 1).join('\n');
  });
  check('a10.predicateParity', new Set(scriptSources).size, 1,
    'toggle, verify, and ownership use one byte-identical separator predicate');
  const probe = join(BASE, 'a10-separator-probe.sh');
  writeFileSync(probe, [
    '#!/bin/sh', 'set -eu', scriptSources[0],
    'for row in "$@"; do if is_separator_row "$row"; then echo SEP; else echo DATA; fi; done',
  ].join('\n'));
  const shells = ['/bin/sh', '/bin/bash', '/bin/zsh', '/usr/bin/dash'].filter((path) => existsSync(path));
  for (const shell of shells) {
    const result = spawnSync(shell, [probe,
      SEPARATORS.compact, SEPARATORS.padded, SEPARATORS.malformedSlash,
      '|foo---bar|api|mission|active|2026-08-28|domain|6.1.4|',
    ], { encoding: 'utf8' });
    check(`a10.shell.${shell}`, [result.status, result.stdout], [0, 'SEP\nSEP\nDATA\nDATA\n'],
      'the supported shell classifies exact separators and hostile/data rows identically');
  }
}

// A11 — detect-mode.sh argument contract: a bare pair resolves in either order,
//       flags are never the team name, a hostile name executes nothing.
{
  const root = makeProject('a11', ['worker-one'], ['worker-one']);
  mkdirSync(join(root, '.claude', 'teams', 'payments'), { recursive: true });
  rmSync(join(root, '.claude', 'teams', 't1'), { recursive: true });
  const marker = join(BASE, 'a11', 'EXECUTED');
  const detect = (args) => {
    const r = run(DETECT, [args], root);
    const pick = (key) => linesStartingWith(r.stdout, `${key}:`).map((l) => l.slice(key.length + 1));
    return [r.status, pick('MODE'), pick('TEAM_NAME'), pick('PROMPT'), pick('ERROR')];
  };
  const ok = (mode, team, prompt = []) => [0, [mode], [team], prompt, []];
  const refused = (reason) => [1, [], [], [], [reason]];
  const NAME_CHARS = 'invalid team name (alphanumeric, dash, underscore only)';
  const cases = [
    ['', ok('status', 'payments'), 'GIVEN one team WHEN no argument THEN status of that team'],
    ['payments', ok('status', 'payments'), 'GIVEN an existing team WHEN only its name THEN status'],
    ['billing', ok('install', 'billing'), 'GIVEN no such team WHEN only a name THEN install'],
    ['enable payments', ok('enable', 'payments'), 'GIVEN mode then name WHEN parsed THEN that mode'],
    ['payments enable', ok('enable', 'payments'), 'GIVEN name then mode WHEN parsed THEN the mode token wins'],
    ['payments purge', ok('purge', 'payments'), 'GIVEN name then a destructive mode WHEN parsed THEN that mode'],
    ['billing enable', ok('enable', 'billing'),
      'GIVEN no such team WHEN name then mode THEN the mode token wins and install is never chosen'],
    ['install enable', ok('install', 'enable'), 'GIVEN two mode tokens WHEN parsed THEN the first is the mode'],
    ['--skip-review install pay', ok('install', 'pay'), 'GIVEN a leading flag WHEN parsed THEN it is not the team'],
    ['install --skip-review pay fast api', ok('install', 'pay', ['fast api']),
      'GIVEN a flag after the mode WHEN parsed THEN it is neither the team nor the prompt'],
    ['upgrade payments --review', ok('upgrade', 'payments'), 'GIVEN a trailing flag WHEN parsed THEN it is dropped'],
    ['-rf', refused('invalid team name (must not start with a dash)'),
      'GIVEN a dash-led name WHEN parsed THEN it is refused'],
    [`install a"$(touch ${marker})`, refused(NAME_CHARS),
      'GIVEN a name with a quote and a command substitution WHEN parsed THEN it is refused'],
    [`my team" $(touch ${marker})`, ok('install', 'my'),
      'GIVEN prose with a command substitution WHEN parsed THEN only the first word is the name'],
  ];
  for (const [args, expected, message] of cases) check(`a11.detect[${args}]`, detect(args), expected, message);
  const accented = runUtf8(DETECT, ['install café'], root);
  check('a11.nonAsciiName', [accented.status, linesStartingWith(accented.stdout, 'ERROR:')], [1, [`ERROR:${NAME_CHARS}`]],
    'GIVEN a non-ASCII team name under /bin/bash and a UTF-8 locale WHEN parsed THEN it is refused');
  const unattended = ['--unattended upgrade payments', 'upgrade payments --unattended',
    'upgrade --unattended payments', 'payments upgrade --unattended'];
  check('a11.unattendedPositions', Object.fromEntries(unattended.map((args) => [args, detect(args)])),
    Object.fromEntries(unattended.map((args) => [args, ok('upgrade', 'payments')])),
    'GIVEN --unattended before, between or after the mode and the team WHEN parsed THEN every position is upgrade of payments');
  check('a11.nothingExecuted', existsSync(marker), false,
    'GIVEN hostile arguments WHEN detect-mode.sh ran THEN no command substitution was executed');
}

// A12 — toggle-team.sh refuses a mistyped flag (it moved files for real) and
//       a path as team name (it read a roster outside the teams dir).
{
  const root = makeProject('a12', ['worker-one', 'intent-guard'], ['worker-one', 'intent-guard']);
  const agentsDir = join(root, '.claude', 'agents');
  const marker = join(BASE, 'a12', 'EXECUTED');
  mkdirSync(join(root, 'elsewhere'), { recursive: true });
  writeFileSync(join(root, 'elsewhere', 'team.md'), readFileSync(join(root, '.claude', 'teams', 't1', 'team.md')));
  const NAME_ERROR = 'ERROR:invalid team name (alphanumeric, dash, underscore only; no leading dash)\n';

  const typo = run(TOGGLE, ['t1', 'disable', '--dryrun'], root);
  check('a12.typoFlag', [typo.status, typo.stdout],
    [1, "ERROR:unknown argument '--dryrun' (only --dry-run is accepted); nothing was touched\n"],
    'GIVEN a mistyped dry-run flag WHEN disable runs THEN it exits 1 before any move');
  const traversal = run(TOGGLE, ['../../elsewhere', 'disable'], root);
  check('a12.traversalTeam', [traversal.status, traversal.stdout], [1, NAME_ERROR],
    'GIVEN a team name that is a path WHEN disable runs THEN the foreign roster is never read');
  const hostile = run(TOGGLE, [`my te"am $(touch ${marker})`, 'disable'], root);
  check('a12.hostileTeam', [hostile.status, hostile.stdout, existsSync(marker)], [1, NAME_ERROR, false],
    'GIVEN a team name with a space, a quote and a command substitution WHEN disable runs THEN nothing executes');
  const accented = runUtf8(TOGGLE, ['café', 'disable'], root);
  check('a12.nonAsciiTeam', [accented.status, accented.stdout], [1, NAME_ERROR],
    'GIVEN a non-ASCII team name under /bin/bash and a UTF-8 locale WHEN disable runs THEN it is refused before any read');
  check('a12.tree', ls(agentsDir), ['intent-guard.md', 'worker-one.md'],
    'GIVEN three refused runs WHEN the agents dir is listed THEN every member is still live');
}

// A13 — a parked name taken by a DIRECTORY is a collision: `mv` moved the live
//       file into it, printed MOVED and left the agent discoverable.
{
  const root = makeProject('a13', ['worker-one', 'worker-two'], ['worker-one', 'worker-two']);
  const agentsDir = join(root, '.claude', 'agents');
  mkdirSync(join(agentsDir, 'worker-two.md.disabled'));
  const r = run(TOGGLE, ['t1', 'disable'], root);

  check('a13.status', r.status, 1,
    'GIVEN a directory at the parked name WHEN disable runs THEN it exits 1');
  check('a13.conflictLines', linesStartingWith(r.stdout, 'CONFLICT:'),
    [
      'CONFLICT:worker-two -- both .claude/agents/worker-two.md and .claude/agents/worker-two.md.disabled exist; '
        + 'disable would overwrite the parked file. Nothing was touched.',
      'CONFLICT:1',
    ],
    'GIVEN a directory at the parked name WHEN disable runs THEN that member is the one reported collision');
  check('a13.tree', [ls(agentsDir), ls(join(agentsDir, 'worker-two.md.disabled'))],
    [['worker-one.md', 'worker-two.md', 'worker-two.md.disabled'], []],
    'GIVEN the collision WHEN disable refused THEN no member moved and the directory is still empty');
}

// Task-board's agent: its own stamp and body shape, outside every teams contract.
const BOARD_BODY = `---
name: task-tracker
description: "Owns the .claude/features task board. Triggers: create/move/close task, groom backlog, task spec"
model: sonnet
tools: Read, Write
doc_type: llm
version: "6.5.6"
generated_by: "brewtools:task-board-setup"
last_updated: "2026-10-13"
content_version: "6.5.6"
---

## Mission
task-tracker: board curator.

## When to use
Board work.

## Methodology
${'Board lifecycle rule. '.repeat(200)}
`;

// A14 — D1: disable/enable never move a file another generator stamped; the team's own member still moves.
{
  const root = makeProject('a14', ['worker-one', 'task-tracker', 'intent-guard'], ['worker-one', 'intent-guard']);
  const agentsDir = join(root, '.claude', 'agents');
  writeFileSync(join(agentsDir, 'task-tracker.md'), BOARD_BODY);
  const off = run(TOGGLE, ['t1', 'disable'], root);
  check('a14.disable', [off.status, summary(off.stdout), linesStartingWith(off.stdout, 'SKIP:'), ls(agentsDir),
    readFileSync(join(agentsDir, 'task-tracker.md'), 'utf8')],
  [0, { ACTION: 'disable', TEAM: 't1', MOVED: '1', SKIPPED: '2', MISSING: '0', INVALID: '0' },
    ['SKIP:intent-guard (shared with superreview-setup)',
      'SKIP:task-tracker (owned by brewtools:task-board-setup; not a team member, never moved)'],
    ['intent-guard.md', 'task-tracker.md', 'worker-one.md.disabled'], BOARD_BODY],
  'GIVEN a roster listing task-board\'s task-tracker WHEN disable runs THEN only worker-one is parked and task-tracker stays live, byte-identical');

  writeFileSync(join(agentsDir, 'task-tracker.md.disabled'), BOARD_BODY);
  rmSync(join(agentsDir, 'task-tracker.md'));
  const on = run(TOGGLE, ['t1', 'enable'], root);
  check('a14.enable', [on.status, summary(on.stdout), ls(agentsDir)],
    [0, { ACTION: 'enable', TEAM: 't1', MOVED: '1', SKIPPED: '2', MISSING: '0', INVALID: '0' },
      ['intent-guard.md', 'task-tracker.md.disabled', 'worker-one.md']],
    'GIVEN task-board parked its own task-tracker WHEN teams enable runs THEN the parked foreign file stays parked');
}

// A15 — D1: verify WARNs a foreign roster row and applies no teams profile check to it.
{
  const root = makeProject('a15', ['worker-one', 'task-tracker', 'intent-guard'], ['worker-one', 'intent-guard']);
  writeFileSync(join(root, '.claude', 'agents', 'task-tracker.md'), BOARD_BODY);
  const r = run(VERIFY, ['t1'], root);
  const out = r.stdout.split('\n');
  const at = out.indexOf('CHECK: agent task-tracker ... FOREIGN (owned by brewtools:task-board-setup)');
  check('a15.verify', [r.status, out.slice(at, at + 3), out.filter((l) => l.includes('FAIL')),
    linesStartingWith(r.stdout, 'FOREIGN_AGENTS:'), linesStartingWith(r.stdout, 'VERIFY:')],
  [0, ['CHECK: agent task-tracker ... FOREIGN (owned by brewtools:task-board-setup)',
    '  WARN: not a team member; teams never verifies, moves or restamps it.',
    '        Fix: /brewcode:teams-setup upgrade drops this roster row and leaves the file untouched'],
  [], ['FOREIGN_AGENTS:1'], ['VERIFY: PASS']],
  'GIVEN task-board\'s task-tracker (no six headings, body >3200 B) on the roster WHEN verify runs THEN it is FOREIGN, WARN only, and the team passes');
}

// A16 — ownership keys on the stamp, plus task-board's reserved name: a stale teams stamp on task-tracker
//       (6.5.6 upgrade restamp) stays FOREIGN; any other teams-stamped name gets the full profile contract.
{
  const root = makeProject('a16', ['worker-one', 'task-tracker', 'board-helper', 'e2e-runner', 'intent-guard'],
    ['worker-one', 'intent-guard']);
  const agentsDir = join(root, '.claude', 'agents');
  const teamsStamped = BOARD_BODY.replace('"brewtools:task-board-setup"', '"brewcode:teams-setup"');
  writeFileSync(join(agentsDir, 'task-tracker.md'), teamsStamped);
  writeFileSync(join(agentsDir, 'board-helper.md'), teamsStamped.replace('name: task-tracker', 'name: board-helper'));
  writeFileSync(join(agentsDir, 'e2e-runner.md'),
    BOARD_BODY.replace('name: task-tracker', 'name: e2e-runner').replace('"brewtools:task-board-setup"', '"brewcode:e2e"'));
  const r = run(VERIFY, ['t1'], root);
  check('a16.verify', [r.status, linesStartingWith(r.stdout, 'CHECK: agent ').filter((l) => l.includes('FOREIGN')),
    linesStartingWith(r.stdout, 'FOREIGN_AGENTS:'), linesStartingWith(r.stdout, 'VERIFY:')],
  [1, ['CHECK: agent task-tracker ... FOREIGN (owned by brewtools:task-board-setup)',
    'CHECK: agent e2e-runner ... FOREIGN (owned by brewcode:e2e)'],
  ['FOREIGN_AGENTS:2'], ['VERIFY: FAIL']],
  'GIVEN a teams-stamped task-tracker, a teams-stamped board-helper and an e2e-stamped e2e-runner WHEN verify runs THEN only board-helper is checked as a member and fails');
}

// A17 — agent-owners.sh adds the generator owner, live or parked, any quoting; ours/unstamped/token add none.
{
  const root = makeProject('a17', ['task-tracker', 'teams-stamped', 'token-stamped', 'unstamped', 'board-stale'], []);
  const agentsDir = join(root, '.claude', 'agents');
  const stamped = (name, stamp) => `---\nname: ${name}\ndescription: "Fixture."\n${stamp === null ? '' : `generated_by: ${stamp}\n`}---\n\n# ${name}\n`;
  writeFileSync(join(agentsDir, 'teams-stamped.md'), stamped('teams-stamped', '"brewcode:teams-setup"'));
  writeFileSync(join(agentsDir, 'token-stamped.md'), stamped('token-stamped', '"{GENERATED_BY}"'));
  writeFileSync(join(agentsDir, 'unstamped.md'), stamped('unstamped', null));
  writeFileSync(join(agentsDir, 'board-stale.md'), stamped('board-stale', '"brewcode:teams-setup"'));
  writeFileSync(join(agentsDir, 'board-stale.md.disabled'), stamped('board-stale', "'brewtools:task-board-setup'"));
  writeFileSync(join(agentsDir, 'parked-board.md.disabled'), stamped('parked-board', "'brewtools:task-board-setup'"));
  writeFileSync(join(agentsDir, 'orphan-board.md'), stamped('orphan-board', 'brewtools:task-board-setup'));
  const owners = Object.fromEntries(['task-tracker', 'teams-stamped', 'token-stamped', 'unstamped', 'board-stale',
    'parked-board', 'orphan-board', 'ghost'].map((a) => {
    const o = run(OWNERS, [a], root);
    return [a, [o.status, o.stdout, o.stderr]];
  }));
  check('a17.owners', owners, {
    'task-tracker': [0, 't1\ngenerator:brewtools:task-board-setup\n', ''],
    'teams-stamped': [0, 't1\n', ''],
    'token-stamped': [0, 't1\n', ''],
    unstamped: [0, 't1\n', ''],
    'board-stale': [0, 't1\n', ''],
    'parked-board': [0, 'generator:brewtools:task-board-setup\n', ''],
    'orphan-board': [0, 'generator:brewtools:task-board-setup\n', ''],
    ghost: [2, '', ''],
  }, 'GIVEN stamped, unstamped and reserved agents WHEN owners are listed THEN only a well-formed foreign stamp (live first) or the reserved task-tracker adds a generator line');
  const refused = [run(GENERATOR, ['../outside'], root), run(GENERATOR, [], root)].map((g) => [g.status, g.stdout, g.stderr]);
  check('a17.generatorRefusals', refused, [
    [1, '', 'ERROR:not an agent id: ../outside (must match ^[a-z0-9][a-z0-9-]*$)\n'],
    [1, '', 'Usage: agent-generator.sh <agent-name>   (run from the project root)\n'],
  ], 'GIVEN a traversal value or no argument WHEN agent-generator.sh runs THEN it refuses with rc 1 and reads nothing');
  const accentedGen = runUtf8(GENERATOR, ['é1'], root);
  check('a17.generatorNonAscii', [accentedGen.status, accentedGen.stdout, linesStartingWith(accentedGen.stderr, 'ERROR:')],
    [1, '', ['ERROR:not an agent id: é1 (must match ^[a-z0-9][a-z0-9-]*$)']],
    'GIVEN a non-ASCII agent id under /bin/bash and a UTF-8 locale WHEN agent-generator.sh runs THEN it refuses with rc 1');
}

// BEGIN SOURCE UNATTENDED UPGRADE
// Claude-only: `mode-upgrade.md` and this SKILL.md text are not projected into the Codex mirror.
const SKILL = join(HERE, '..', 'SKILL.md');
const MODE_UPGRADE = join(HERE, '..', 'references', 'mode-upgrade.md');
const flat = (text) => text.replace(/\s+/g, ' ');

// The shipped U1c fence, placeholders filled as the agent fills them, run by bash from the project root.
const UPGRADE_DOC = readFileSync(MODE_UPGRADE, 'utf8');
const FENCE_FROM = UPGRADE_DOC.indexOf('```bash\n', UPGRADE_DOC.indexOf('### U1c:')) + '```bash\n'.length;
const FENCE = UPGRADE_DOC.slice(FENCE_FROM, UPGRADE_DOC.indexOf('\n```', FENCE_FROM));
const STAMP = {
  PLUGIN_VERSION: '6.10.0', CONTENT_VERSION: '6.7.0', GENERATED_BY: 'brewcode:teams-setup', LAST_UPDATED: '2026-10-16',
};
let fenceScripts = 0;
const restamp = (root, step, values = STAMP) => {
  const script = join(BASE, `u1c-fence-${fenceScripts++}.sh`);
  writeFileSync(script, Object.entries({ STEP: step, TEAM_NAME: 't1', ...values })
    .reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), FENCE));
  const r = run(script, [], root);
  return [r.status, r.stdout];
};
const teamPath = (root) => join(root, '.claude', 'teams', 't1', 'team.md');
const edit = (root, ...pairs) => writeFileSync(teamPath(root),
  pairs.reduce((text, [a, b]) => text.replace(a, b), readFileSync(teamPath(root), 'utf8')));
const OLD_DEFAULTS = '|Agent defaults|active;2026-08-16;domain;6.1.4|';
const NEW_DEFAULTS = '|Agent defaults|active;2026-10-16;domain;6.10.0|';
const OLD_GUARD_CELLS = '|active|2026-08-16|review-only|6.1.4|';
const NEW_GUARD_CELLS = '|active|2026-10-16|review-only|6.10.0|';
const verdict = (root) => {
  const r = run(VERIFY, ['t1'], root);
  return [r.status, linesStartingWith(r.stdout, 'VERIFY:'), linesStartingWith(r.stdout, 'CHECK: intent-guard roster contract')];
};
const blank = (name) => [`|${name}|api|fixture mission|active|2026-08-16|domain|6.1.4|`, `|${name}|api|fixture mission|||||`];

// A18 — U1c restamps the header quartet plus the cells verify-team.sh pins to it; legacy, unfilled or doubled input writes nothing.
{
  const current = makeProject('a18-current', ['worker-one', 'intent-guard'], ['worker-one', 'intent-guard']);
  const original = readFileSync(teamPath(current), 'utf8');
  const checked = restamp(current, 'check');
  const written = restamp(current, 'write');
  check('a18.currentHeader', { checked, written, team: readFileSync(teamPath(current), 'utf8') }, {
    checked: [0, 'HEADER ok cv=6.1.0\n✅ restamp\n'],
    written: [0, 'RESTAMPED cv=6.1.0->6.7.0\n✅ restamp\n'],
    team: original.replace('|Version|6.1.4|', '|Version|6.10.0|')
      .replace('|Content version|6.1.0|', '|Content version|6.7.0|')
      .replace('|Last update|2026-08-16|', '|Last update|2026-10-16|')
      .replace(OLD_DEFAULTS, NEW_DEFAULTS)
      .replace(OLD_GUARD_CELLS, NEW_GUARD_CELLS),
  }, 'GIVEN a current team.md WHEN check then write run THEN header, Agent defaults and intent-guard Updated/Version move and the explicit worker-one row keeps 2026-08-16/6.1.4');

  const padded = makeProject('a18-padded', ['worker-one'], ['worker-one']);
  edit(padded, ['|Version|6.1.4|', '| Version | 6.1.4 |'], ['|Content version|6.1.0|', '| Content Version | 6.1.0 |'],
    ['|Generated by|brewcode:teams-setup|', '| Generated by | brewcode:teams-setup |'],
    ['|Last update|2026-08-16|', '| Last update | 2026-08-16 |'],
    [OLD_DEFAULTS, '| Agent defaults | active;2026-08-16;domain;6.1.4 |']);
  const paddedBefore = readFileSync(teamPath(padded), 'utf8');
  check('a18.paddedHeader', [restamp(padded, 'write'), readFileSync(teamPath(padded), 'utf8')], [
    [0, 'RESTAMPED cv=6.1.0->6.7.0\n✅ restamp\n'],
    paddedBefore.replace('| Version | 6.1.4 |', '| Version | 6.10.0 |')
      .replace('| Content Version | 6.1.0 |', '| Content Version | 6.7.0 |')
      .replace('| Last update | 2026-08-16 |', '| Last update | 2026-10-16 |')
      .replace('| Agent defaults | active;2026-08-16;domain;6.1.4 |', '| Agent defaults | active;2026-10-16;domain;6.10.0 |'),
  ], 'GIVEN a space-padded header and Agent defaults WHEN write runs THEN the values change and the padding and key spelling stay');

  const mirrors = {
    doubledDefaults: [OLD_DEFAULTS, `${OLD_DEFAULTS}\n${OLD_DEFAULTS}`],
    malformedDefaults: [OLD_DEFAULTS, '|Agent defaults|active;2026-08-16;6.1.4|'],
    doubledGuard: [OLD_GUARD_CELLS, `${OLD_GUARD_CELLS}\n|intent-guard|--|x${OLD_GUARD_CELLS}`],
    shortGuard: [OLD_GUARD_CELLS, '|active|2026-08-16|review-only|'],
  };
  const broken = Object.fromEntries(Object.entries(mirrors).map(([label, pair]) => {
    const root = makeProject(`a18-${label}`, ['worker-one', 'intent-guard'], ['worker-one', 'intent-guard']);
    edit(root, pair);
    const bytes = readFileSync(teamPath(root), 'utf8');
    return [label, [...restamp(root, 'write'), readFileSync(teamPath(root), 'utf8') === bytes]];
  }));
  check('a18.mirrorRefusals', broken, {
    doubledDefaults: [0, 'ERROR doubled Agent defaults row\n❌ FAILED restamp\n', true],
    malformedDefaults: [0, 'ERROR malformed Agent defaults row\n❌ FAILED restamp\n', true],
    doubledGuard: [0, 'ERROR doubled intent-guard row\n❌ FAILED restamp\n', true],
    shortGuard: [0, 'ERROR intent-guard row lacks Updated/Version cells\n❌ FAILED restamp\n', true],
  }, 'GIVEN a doubled or malformed Agent defaults or intent-guard row WHEN write runs THEN it refuses and team.md is byte-identical, header included');

  const legacy = makeProject('a18-legacy', ['worker-one'], ['worker-one']);
  edit(legacy, ['|Content version|6.1.0|\n', '']);
  const swapped = makeProject('a18-swapped', ['worker-one'], ['worker-one']);
  edit(swapped, ['|Version|6.1.4|\n|Content version|6.1.0|\n', '|Content version|6.1.0|\n|Version|6.1.4|\n']);
  const unfilled = makeProject('a18-unfilled', ['worker-one'], ['worker-one']);
  const before = [legacy, swapped, unfilled].map((root) => readFileSync(teamPath(root), 'utf8'));
  const refusals = {
    legacyCheck: restamp(legacy, 'check'),
    legacyWrite: restamp(legacy, 'write'),
    swappedCheck: restamp(swapped, 'check'),
    unfilledWrite: restamp(unfilled, 'write', { ...STAMP, PLUGIN_VERSION: '{PLUGIN_VERSION}' }),
    unchanged: [legacy, swapped, unfilled].map((root, i) => readFileSync(teamPath(root), 'utf8') === before[i]),
  };
  check('a18.refusals', refusals, {
    legacyCheck: [0, 'HEADER legacy\n✅ restamp\n'],
    legacyWrite: [0, 'HEADER legacy\n❌ FAILED restamp\n'],
    swappedCheck: [0, 'HEADER legacy\n✅ restamp\n'],
    unfilledWrite: [0, 'ERROR unfilled or malformed stamp value\n❌ FAILED restamp\n'],
    unchanged: [true, true, true],
  }, 'GIVEN a header missing Content version, one out of order and an unfilled value WHEN the fence runs THEN it reports legacy or refuses and every team.md is byte-identical');
}

// A20 — e2e P1 regression: install-shaped team (blank default rows) passes verify-team.sh before and after U1c write.
{
  const required = makeProject('a20-required', ['intent-guard', 'worker-one', 'worker-two'], ['intent-guard', 'worker-one', 'worker-two']);
  edit(required, blank('worker-one'), blank('worker-two'));
  const absent = makeProject('a20-absent', ['worker-one', 'worker-two'], ['worker-one', 'worker-two']);
  edit(absent, blank('worker-one'));
  const restamped = (bytes) => bytes.replace('|Version|6.1.4|', '|Version|6.10.0|')
    .replace('|Content version|6.1.0|', '|Content version|6.7.0|')
    .replace('|Last update|2026-08-16|', '|Last update|2026-10-16|')
    .replace(OLD_DEFAULTS, NEW_DEFAULTS)
    .replace(OLD_GUARD_CELLS, NEW_GUARD_CELLS);
  const requiredBytes = readFileSync(teamPath(required), 'utf8');
  const absentBytes = readFileSync(teamPath(absent), 'utf8');
  const cycle = (root) => ({
    before: verdict(root),
    checked: restamp(root, 'check'),
    written: restamp(root, 'write'),
    after: verdict(root),
    team: readFileSync(teamPath(root), 'utf8'),
  });
  const pass = (guardLine) => [0, ['VERIFY: PASS'], guardLine];
  check('a20.required', cycle(required), {
    before: pass(['CHECK: intent-guard roster contract ... OK']),
    checked: [0, 'HEADER ok cv=6.1.0\n✅ restamp\n'],
    written: [0, 'RESTAMPED cv=6.1.0->6.7.0\n✅ restamp\n'],
    after: pass(['CHECK: intent-guard roster contract ... OK']),
    team: restamped(requiredBytes),
  }, 'GIVEN a required team with blank default rows WHEN U1c check then write runs THEN verify passes after and only header, defaults and intent-guard cells moved');
  check('a20.legacyAbsent', cycle(absent), {
    before: pass([]),
    checked: [0, 'HEADER ok cv=6.1.0\n✅ restamp\n'],
    written: [0, 'RESTAMPED cv=6.1.0->6.7.0\n✅ restamp\n'],
    after: pass([]),
    team: restamped(absentBytes),
  }, 'GIVEN a legacy-absent team (no intent-guard row) WHEN U1c check then write runs THEN verify passes after, no guard row appears, explicit worker-two keeps 6.1.4');
}

// A21 — ENABLE/DISABLE step 5 restamps through the U1c fence, so step 6 verify passes after a version move.
{
  const toggleDoc = flat(readFileSync(join(HERE, '..', 'references', 'mode-enable-disable.md'), 'utf8'));
  check('a21.docSteps', {
    enable: toggleDoc.includes('Then restamp the header with the U1c fence of `${CLAUDE_SKILL_DIR}/references/mode-upgrade.md`, `{STEP}` = `write`, values from the Phase 1 lines; never hand-edit the header.'),
    disable: toggleDoc.includes('then restamp the header as in ENABLE step 5.'),
    handRefresh: /refresh (all )?(the )?four header rows/.test(toggleDoc),
  }, { enable: true, disable: true, handRefresh: false },
  'GIVEN mode-enable-disable.md WHEN both steps 5 are read THEN each restamps through the U1c fence and none hand-refreshes the header');

  const control = makeProject('a21-control', ['intent-guard', 'worker-one'], ['intent-guard', 'worker-one']);
  edit(control, blank('worker-one'), ['|Version|6.1.4|', '|Version|6.10.0|'],
    ['|Content version|6.1.0|', '|Content version|6.7.0|'], ['|Last update|2026-08-16|', '|Last update|2026-10-16|']);
  const handOnly = run(VERIFY, ['t1'], control);
  check('a21.headerOnlyControl', [handOnly.status, linesStartingWith(handOnly.stdout, 'CHECK: Agent defaults'), linesStartingWith(handOnly.stdout, 'VERIFY:')],
    [1, ['CHECK: Agent defaults ... FAIL (expected exactly: |Agent defaults|active;2026-10-16;domain;6.10.0|)'], ['VERIFY: FAIL']],
    'GIVEN only the four header rows moved by hand (the old step 5) WHEN verify runs THEN Agent defaults fails: the mirror cells are required');

  const NEXT = { PLUGIN_VERSION: '6.11.0', CONTENT_VERSION: '6.8.0', GENERATED_BY: 'brewcode:teams-setup', LAST_UPDATED: '2026-10-20' };
  const parked = (name) => [`|${name}|api|fixture mission|||||`, `|${name}|api|fixture mission|disabled||||`];
  const restored = (name) => [...parked(name)].reverse();
  const state = (r) => [r.status, linesStartingWith(r.stdout, 'VERIFY:'), linesStartingWith(r.stdout, 'DISABLED_AGENTS:'),
    linesStartingWith(r.stdout, 'CHECK: intent-guard roster contract')];
  const root = makeProject('a21', ['intent-guard', 'worker-one', 'worker-two'], ['intent-guard', 'worker-one', 'worker-two']);
  edit(root, blank('worker-one'), blank('worker-two'));
  const original = readFileSync(teamPath(root), 'utf8');
  const off = run(TOGGLE, ['t1', 'disable'], root).status;
  edit(root, parked('worker-one'), parked('worker-two'));
  const offStamp = restamp(root, 'write');
  const offVerify = state(run(VERIFY, ['t1'], root));
  const on = run(TOGGLE, ['t1', 'enable'], root).status;
  edit(root, restored('worker-one'), restored('worker-two'));
  const onStamp = restamp(root, 'write', NEXT);
  const onVerify = state(run(VERIFY, ['t1'], root));
  check('a21.disableThenEnable', { off, offStamp, offVerify, on, onStamp, onVerify, team: readFileSync(teamPath(root), 'utf8') }, {
    off: 0,
    offStamp: [0, 'RESTAMPED cv=6.1.0->6.7.0\n✅ restamp\n'],
    offVerify: [0, ['VERIFY: PASS (team DISABLED -- 2 agent file(s) parked as .md.disabled)'], ['DISABLED_AGENTS:2'],
      ['CHECK: intent-guard roster contract ... OK']],
    on: 0,
    onStamp: [0, 'RESTAMPED cv=6.7.0->6.8.0\n✅ restamp\n'],
    onVerify: [0, ['VERIFY: PASS'], ['DISABLED_AGENTS:0'], ['CHECK: intent-guard roster contract ... OK']],
    team: original.replace('|Version|6.1.4|', '|Version|6.11.0|')
      .replace('|Content version|6.1.0|', '|Content version|6.8.0|')
      .replace('|Last update|2026-08-16|', '|Last update|2026-10-20|')
      .replace(OLD_DEFAULTS, '|Agent defaults|active;2026-10-20;domain;6.11.0|')
      .replace(OLD_GUARD_CELLS, '|active|2026-10-20|review-only|6.11.0|'),
  }, 'GIVEN a required team with blank rows WHEN DISABLE then ENABLE each run toggle, the Status edit and the U1c write at a new version THEN step 6 verify passes both times');
}

// A19 — SKILL.md + mode-upgrade.md unattended contract: block once after the Scope rule, RESULT table, interactive-only steps.
{
  const skill = readFileSync(SKILL, 'utf8');
  const doc = flat(readFileSync(MODE_UPGRADE, 'utf8'));
  const HEAD = '**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**';
  const scopeEnd = skill.indexOf('\n', skill.indexOf('> **Scope (normative):** `upgrade` edits only'));
  check('a19.blockPlacement', [skill.split(HEAD).length - 1, skill.indexOf(HEAD) - scopeEnd], [1, 2],
    'GIVEN SKILL.md WHEN the unattended block is located THEN it appears once, right after the UPGRADE Scope rule');

  const tableAt = skill.indexOf('| Under `--unattended` | Last line |');
  const table = Object.fromEntries(skill.slice(tableAt).split('\n\n')[0].split('\n').slice(2)
    .map((row) => row.slice(2, -2).split(' | ')));
  const id = 'RESULT skipped brewcode:teams-setup team=<name> cv=?->? pending=0 note=';
  check('a19.resultTable', table, {
    'resolved mode other than `upgrade`': `\`${id}"not-upgrade"\``,
    'team not found': `\`${id}"not installed"\``,
    'step 3 tokenizer preflight missing': `\`${id}"missing tokenizer"\``,
    'U1 prints a `PARKED` row': `\`${id}"parked: <members>"\``,
    'U1c `check` prints `HEADER legacy`': `\`${id}"legacy team.md header"\``,
    'any other STOP or `❌` before the first write': `\`${id}"<reason>"\``,
    'STOP, `❌` or `OUTSIDE` after the first write':
      '`RESULT failed brewcode:teams-setup team=<name> cv=<before>->? pending=0 note="<step>: <reason>"`',
    'U1c `write` printed `RESTAMPED`, scope gate ✅':
      '`RESULT ok brewcode:teams-setup team=<name> cv=<before>-><after> pending=0 note="tuning not run"`',
  }, 'GIVEN the UPGRADE unattended table WHEN parsed THEN every skip path and the plumbing-only ok carry their exact RESULT line');
  const grammar = /^`RESULT (ok|partial|skipped|failed) brewcode:teams-setup team=<name> cv=\S+->\S+ pending=\d+ note="[^"]+"`$/;
  check('a19.resultGrammar', Object.values(table).filter((line) => !grammar.test(line)), [],
    'GIVEN every RESULT line in the table WHEN matched against the canonical grammar THEN none deviates');

  check('a19.interactiveOnly', {
    neverRun: /Never run: (.*?)\. /.exec(flat(skill))?.[1],
    step5: skill.includes('5. Mutating modes only, skipped under `--unattended` — **ASK**'),
    tokenizer: flat(skill).includes('`--unattended` never prepares (`RESULT skipped`, `## Mode: UPGRADE`)'),
    policy: flat(skill).includes('The flag never changes `INTENT_GUARD_POLICY`: a `legacy-absent` roster never gains `intent-guard`.'),
    intro: doc.includes('Under `--unattended` (SKILL.md `## Mode: UPGRADE`, its table maps every stop to the `RESULT` line): U1, U1b and U1c only; U2-U4 never run and the cursor is never set.'),
    parked: doc.includes('Under `--unattended` this is `RESULT skipped`, note `parked: <members>`.'),
    legacy: doc.includes('`HEADER legacy` -> `RESULT skipped`, note `legacy team.md header`, nothing written.'),
    cursor: doc.includes('Set cursor (never under `--unattended`: no U2 analysis consumed the entries, so the next interactive `upgrade` reads them):'),
  }, {
    neverRun: "step 5's confirm, step 6's tokenizer prepare, U2-U4 (no tuning, deletion or agent spawn), Epilogue E1, the cursor write",
    step5: true, tokenizer: true, policy: true, intro: true, parked: true, legacy: true, cursor: true,
  }, 'GIVEN SKILL.md and mode-upgrade.md WHEN the unattended rules are read THEN the confirm, prepare, U2-U4, E1 and the cursor stay interactive-only and every skip is stated');
}
// END SOURCE UNATTENDED UPGRADE

// ── report ──────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('suite-lifecycle.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
