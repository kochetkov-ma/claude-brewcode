#!/usr/bin/env node
/**
 * Suite B — intent-guard provenance (superreview-setup/scripts/generate.sh emit-agent), the ONE writer
 * of .codex/agents/intent-guard.toml that $brewcode:teams-setup Phase 3 calls.
 * Covers BCOP09: the runnability tests used to run before the provenance probes, so a hand-written
 * agent that merely mentioned a `{TOKEN}` was classified BROKEN and overwritten with no backup.
 * Runs entirely inside an isolated temp base; never touches the real ~/.codex or the repo tree.
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const GENERATE = join(HERE, '..', '..', 'superreview-setup', 'scripts', 'generate.sh');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'teams-intent-guard-')));
const IG_REL = '.codex/agents/intent-guard.toml';
const STAMP = '<!-- generated_by: brewcode:superreview-setup v9.9.9 -->';
const LEGACY_STAMP = '<!-- intent-guard template v2 - emitted 2025-01-01 - source: fixture -->';

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, message) {
  if (actual === expected) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

/** A project root with an optional pre-existing intent-guard.toml. */
function makeProject(label, body) {
  const root = join(BASE, label);
  mkdirSync(join(root, '.codex', 'agents'), { recursive: true });
  if (body !== null) writeFileSync(join(root, IG_REL), body);
  return root;
}

function emitAgent(root) {
  const r = spawnSync('bash', [GENERATE, 'emit-agent'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  return { stdout: (r.stdout || '').trim(), stderr: r.stderr || '', status: r.status };
}

const agentNames = (root) => readdirSync(join(root, '.codex', 'agents')).sort();
const backups = (root) =>
  agentNames(root).filter((n) => /^intent-guard\.toml\.bak-[0-9]{8}-[0-9]{6}$/.test(n));
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

const FOREIGN_WITH_TOKEN = [
  '---',
  'name: intent-guard',
  'description: our own hand-written drift check',
  '---',
  '',
  '# intent-guard',
  '',
  'Use {REQUEST_ID} to correlate the review with the ticket.',
  '',
].join('\n');

// ────────────────────────────────────────────────────────────────────────────
// B1 — BCOP09: an UNSTAMPED file carrying a {TOKEN} is the project's own agent.
//      REUSE, byte-identical, no backup, tokens reported as a conflict.
// ────────────────────────────────────────────────────────────────────────────
{
  const root = makeProject('b1', FOREIGN_WITH_TOKEN);
  const r = emitAgent(root);

  check('b1.status', r.status, 0, 'emit-agent succeeds on a foreign agent');
  check('b1.stdout', r.stdout, `INTENT_GUARD: REUSE ${IG_REL}`, 'exactly one status line, and it is REUSE');
  check('b1.bytes', read(root, IG_REL), FOREIGN_WITH_TOKEN, 'the hand-written file is byte-identical');
  check('b1.backupCount', backups(root).length, 0, 'nothing was backed up because nothing was rewritten');
  check('b1.tree', agentNames(root).join(','), 'intent-guard.toml', 'no extra file was created');
  check(
    'b1.conflictReported',
    r.stderr.includes('{REQUEST_ID}'),
    true,
    'the token is reported on stderr as a conflict',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// B2 — an unstamped file WITHOUT `name: intent-guard` frontmatter is still
//      foreign: unrunnable by our rules, but not ours to overwrite.
// ────────────────────────────────────────────────────────────────────────────
{
  const body = '# somebody else\n\nnotes about {TICKET_ID}\n';
  const root = makeProject('b2', body);
  const r = emitAgent(root);

  check('b2.stdout', r.stdout, `INTENT_GUARD: REUSE ${IG_REL}`, 'REUSE, not RECREATE');
  check('b2.bytes', read(root, IG_REL), body, 'a foreign file without our frontmatter survives byte-identical');
  check('b2.backupCount', backups(root).length, 0, 'no backup, because no write');
}

// ────────────────────────────────────────────────────────────────────────────
// B3 — control: the same foreign file with no token at all also REUSEs. This is
//      the pre-fix behaviour and must not change.
// ────────────────────────────────────────────────────────────────────────────
{
  const body = FOREIGN_WITH_TOKEN.replace('{REQUEST_ID}', 'the ticket id');
  const root = makeProject('b3', body);
  const r = emitAgent(root);

  check('b3.stdout', r.stdout, `INTENT_GUARD: REUSE ${IG_REL}`, 'token-free foreign file reuses too');
  check('b3.bytes', read(root, IG_REL), body, 'byte-identical');
  check('b3.stderrEmpty', r.stderr, '', 'no conflict to report, so stderr stays silent');
}

// ────────────────────────────────────────────────────────────────────────────
// B4 — OUR OWN stamped file with an unresolved token is BROKEN: recreated, but
//      only after its bytes are copied to <path>.bak-<ts>.
// ────────────────────────────────────────────────────────────────────────────
{
  const body = ['---', 'name: intent-guard', '---', '', 'half-substituted {PROJECT_NAME}', '', STAMP, ''].join('\n');
  const root = makeProject('b4', body);
  const r = emitAgent(root);

  const bak = backups(root);
  check('b4.stdout', r.stdout, `INTENT_GUARD: CREATED ${IG_REL}`, 'our own broken file is recreated');
  check('b4.backupCount', bak.length, 1, 'exactly one backup was written');
  check(
    'b4.backupBytes',
    // concatenation, not indexing: zero backups yields '' and fails the check instead of throwing
    bak.map((n) => read(root, join('.codex', 'agents', n))).join(''),
    body,
    'the backup holds the original bytes verbatim',
  );
  check(
    'b4.recreated',
    read(root, IG_REL).includes('<!-- generated_by: brewcode:superreview-setup'),
    true,
    'the live file now carries the current tail anchor',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// B5 — an EMPTY file is BROKEN with nothing to lose: recreated, no backup.
// ────────────────────────────────────────────────────────────────────────────
{
  const root = makeProject('b5', '');
  const r = emitAgent(root);

  check('b5.stdout', r.stdout, `INTENT_GUARD: CREATED ${IG_REL}`, 'an empty file is recreated');
  check('b5.backupCount', backups(root).length, 0, 'an empty file has no bytes worth backing up');
}

// ────────────────────────────────────────────────────────────────────────────
// B6 — a pre-standard file OF OURS still MIGRATEs: metadata only, body kept.
// ────────────────────────────────────────────────────────────────────────────
{
  const marker = 'TAILORED-LINE-KEEP-ME';
  const body = ['---', 'name: intent-guard', '---', '', `## 1. Scope`, '', marker, '', LEGACY_STAMP, ''].join('\n');
  const root = makeProject('b6', body);
  const r = emitAgent(root);

  check('b6.stdout', r.stdout, `INTENT_GUARD: MIGRATED ${IG_REL}`, 'the retired stamp triggers a restamp');
  check('b6.bodyKept', read(root, IG_REL).includes(marker), true, 'the tailored body line survived the migration');
  check('b6.backupCount', backups(root).length, 0, 'a migration rewrites metadata only, so no backup is needed');
}

// ────────────────────────────────────────────────────────────────────────────
// B7 — no file at all: CREATE, the ordinary first-run path.
// ────────────────────────────────────────────────────────────────────────────
{
  const root = makeProject('b7', null);
  const r = emitAgent(root);

  check('b7.status', r.status, 0, 'first run succeeds');
  check('b7.stdout', r.stdout, `INTENT_GUARD: CREATED ${IG_REL}`, 'the agent is created from the template');
  check('b7.tree', agentNames(root).join(','), 'intent-guard.toml', 'exactly one file, no backups');
}

// ── report ──────────────────────────────────────────────────────────────────
rmSync(BASE, { recursive: true, force: true });
console.log('suite-intent-guard.mjs');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
