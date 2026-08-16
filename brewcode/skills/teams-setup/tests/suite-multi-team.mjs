#!/usr/bin/env node
/**
 * Suite C — shared ownership of the project-global agent namespace (scripts/agent-owners.sh).
 * Covers BC-V2-H02: cleanup/purge deleted `.claude/agents/<member>.md` for every row of the SELECTED
 * team, while multi-team is a supported state -- so team A's cleanup removed agents team B still
 * spawns. agent-owners.sh is the lookup every delete path must consult first.
 * Runs entirely inside an isolated temp base; never touches the real ~/.claude or the repo tree.
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const OWNERS = join(HERE, '..', 'scripts', 'agent-owners.sh');

// realpath: macOS /var is a symlink to /private/var
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'teams-multi-')));
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

/** JSON, capped: a failed comparison must not bury the report under a whole roster. */
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
  const r = spawnSync('bash', [script, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

/** stdout as the owner list the contract promises: one team name per line, no trailing blank. */
const lines = (stdout) => (stdout === '' ? [] : stdout.replace(/\n$/, '').split('\n'));

const SEPARATORS = {
  compact: '|-------|--------|---------|--------|---------|------|---------|',
  padded: '| ------- | -------- | --------- | -------- | --------- | ------ | --------- |',
  none: null,
};

/** Adds one team to `root` with the given `## Agents` roster. */
function addTeam(root, name, rows, separator = 'compact') {
  const teamDir = join(root, '.claude', 'teams', name);
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(
    join(teamDir, 'team.md'),
    [
      `# Team: ${name}`,
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| Created | 2026-08-16 |',
      '| Version | 6.0.0 |',
      `| Agents | ${rows.length} |`,
      '',
      '## Agents',
      '',
      '| Agent | Domain | Mission | Status | Updated | Kind | Version |',
      SEPARATORS[separator],
      ...rows.map((a) => `| ${a} | api | fixture mission | active | 2026-08-16 | domain | 6.0.0 |`),
      '',
    ].filter((l) => l !== null).join('\n'),
  );
  writeFileSync(join(teamDir, 'trace.jsonl'), '');
  return teamDir;
}

/** A project root with `.claude/agents/` and no team yet. */
function makeRoot(label) {
  const root = join(BASE, label, 'proj');
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  return root;
}

// ────────────────────────────────────────────────────────────────────────────
// C1 — BC-V2-H02: an agent listed by two teams reports BOTH owners.
// ────────────────────────────────────────────────────────────────────────────
{
  const root = makeRoot('c1');
  addTeam(root, 'alpha', ['shared-worker', 'alpha-only', 'intent-guard']);
  addTeam(root, 'beta', ['shared-worker', 'beta-only', 'intent-guard'], 'padded');

  const r = run(OWNERS, ['shared-worker'], root);
  check('c1.status', r.status, 0, 'a found agent exits 0');
  check('c1.owners', lines(r.stdout), ['alpha', 'beta'], 'both owning teams are listed, one per line, sorted');
  check('c1.stderr', r.stderr, '', 'nothing is written to stderr on the happy path');

  const g = run(OWNERS, ['intent-guard'], root);
  check('c1.intentGuard', [g.status, lines(g.stdout)], [0, ['alpha', 'beta']], 'the shared intent-guard row is discoverable the same way');

  const a = run(OWNERS, ['alpha-only'], root);
  check('c1.single', [a.status, lines(a.stdout)], [0, ['alpha']], 'a single-owner agent lists exactly its own team -- safe to delete');
}

// ────────────────────────────────────────────────────────────────────────────
// C2 — no owner: exit 2 with empty stdout, the only "safe to delete" answer.
// ────────────────────────────────────────────────────────────────────────────
{
  const root = makeRoot('c2');
  addTeam(root, 'alpha', ['alpha-only', 'intent-guard']);
  const r = run(OWNERS, ['ghost-worker'], root);
  check('c2.status', r.status, 2, 'an unowned agent exits 2');
  check('c2.stdout', r.stdout, '', 'stdout is empty');

  const bare = run(OWNERS, ['alpha-only'], makeRoot('c2b'));
  check('c2.noTeamsDir', [bare.status, bare.stdout], [2, ''], 'a project with no .claude/teams/ answers "no owners", not an error');
}

// ────────────────────────────────────────────────────────────────────────────
// C3 — refusal (exit 1): a caller must never read it as "no owners".
// ────────────────────────────────────────────────────────────────────────────
{
  const root = makeRoot('c3');
  addTeam(root, 'alpha', ['shared-worker']);
  addTeam(root, 'broken', ['shared-worker'], 'none');

  const r = run(OWNERS, ['shared-worker'], root);
  check('c3.status', r.status, 1, 'an unparseable roster refuses instead of answering');
  check('c3.stdout', r.stdout, '', 'stdout stays empty: a partial owner list is worse than none');
  check(
    'c3.stderr',
    r.stderr.includes('roster unreadable, owners unknown'),
    true,
    'stderr names the unreadable team.md',
  );

  const bad = run(OWNERS, ['../../../outside/README'], root);
  check('c3.traversal', [bad.status, bad.stdout], [1, ''], 'a traversal value is refused as not an agent id');
  check(
    'c3.traversalMsg',
    bad.stderr.trim(),
    'ERROR:not an agent id: ../../../outside/README (must match ^[a-z0-9][a-z0-9-]*$)',
    'the refusal quotes the offending value and the rule',
  );

  const none = run(OWNERS, [], root);
  check('c3.usage', [none.status, none.stdout], [1, ''], 'a missing argument is a usage error, not an empty answer');
  check('c3.usageMsg', none.stderr.trim(), 'Usage: agent-owners.sh <agent-name>   (run from the project root)', 'usage goes to stderr');

  const extra = run(OWNERS, ['alpha-only', 'beta-only'], root);
  check('c3.extraArg', extra.status, 1, 'a second argument is refused rather than silently ignored');
}

// ── report ──────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('suite-multi-team.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
