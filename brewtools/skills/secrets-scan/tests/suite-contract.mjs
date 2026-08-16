#!/usr/bin/env node
/**
 * suite-contract.mjs - the prose half of BT-F03 / BT-F04.
 *
 * The scripts cannot enforce what the agent prompt asks for, so the prompt text
 * itself is the regression surface: the moment a `content` field or the false
 * "git-ignored paths already dropped" sentence comes back, the fixed behaviour
 * is gone even though every script still passes. Also re-checks the workspace
 * skill invariants (bare name, 7-key frontmatter order, invocation flags).
 *
 * Read-only: parses SKILL.md / README.md and lists scripts/. No temp files.
 *
 * Assertion policy: unconditional exact counts, exact strings and exact arrays
 * with a description; no `if` gates.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(HERE, '..');
const SKILL = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const README = readFileSync(join(SKILL_DIR, 'README.md'), 'utf8');

// ── harness ────────────────────────────────────────────────────────────────
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

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

// ── skill invariants ───────────────────────────────────────────────────────
const fm = SKILL.split('---\n')[1];
check('fm.keys', fm.split('\n').filter((l) => l.length > 0).map((l) => l.slice(0, l.indexOf(':'))), [
  'name', 'description', 'user-invocable', 'disable-model-invocation', 'argument-hint',
  'allowed-tools', 'model',
], 'frontmatter carries the seven workspace keys in the mandated order');
check('fm.name', count(fm, 'name: secrets-scan\n'), 1,
  'the name is bare and equals the directory name');
check('fm.name.dir', basename(SKILL_DIR), 'secrets-scan', 'the directory is the one the name claims');
check('fm.invocable', count(fm, 'user-invocable: true\n'), 1, 'the skill is user-invocable');
check('fm.nomodel', count(fm, 'disable-model-invocation: true\n'), 1,
  'the model never auto-activates a secrets scanner');
check('plan.block', count(SKILL, 'PLAN — brewtools:secrets-scan'), 1,
  'the mandatory PLAN header appears exactly once');
const planBlock = SKILL.slice(SKILL.indexOf('PLAN — brewtools:secrets-scan')).split('```')[0];
check('plan.labels', planBlock.split('\n').slice(1).filter((l) => l.length > 0).map((l) => l.split(' ')[0]),
  ['INPUT:', 'MODE:', 'SCOPE:', 'DO:', 'RESULT:'],
  'the PLAN block carries the five literal labels, in order');

// ── BT-F03: no raw value anywhere in the contract ──────────────────────────
check('f03.nocontentfield', count(SKILL, '"content"'), 0,
  'the agent OUTPUT no longer has a field for the raw matched value');
check('f03.nocontentcolumn', count(SKILL, '| # | File | Line | Content | Description |'), 0,
  'the report template no longer renders a Content column');
check('f03.redactedcolumn',
  count(SKILL, '| # | File | Line | Category | Len | Fingerprint | Preview | Description |'), 1,
  'the findings table is length + fingerprint + masked preview');
check('f03.fields', [count(SKILL, 'sha256_12'), count(SKILL, 'match_len'), count(SKILL, 'preview')],
  [2, 2, 2], 'the redacted triple is named in the agent instruction and in the OUTPUT sample');
check('f03.perms', [count(SKILL, 'umask 077'), count(SKILL, 'chmod 700'), count(SKILL, 'chmod 600')],
  [1, 1, 2], 'the report dir and both written files are restricted');
check('f03.gitignore', count(SKILL, '.claude/reports/` to `.gitignore'), 1,
  'Phase 1 makes the report dir git-ignored before writing anything');
check('f03.readme', count(README, 'matched content'), 0,
  'the README no longer advertises a stored matched value');

// The OUTPUT sample is the shape agents copy; its finding keys are the contract.
const sampleLine = SKILL.split('\n').filter((l) => l.startsWith('{"agent":'));
check('f03.sample.count', sampleLine.length, 1, 'there is exactly one OUTPUT sample');
const sample = JSON.parse(sampleLine[0].replace('{N}', '1'));
check('f03.sample.keys', Object.keys(sample.findings[0]), [
  'path', 'line', 'category', 'match_len', 'sha256_12', 'preview', 'desc', 'crit',
], 'a finding carries exactly these keys - no raw value among them');

// ── BT-F04: chunk accounting ───────────────────────────────────────────────
check('f04.falsesentence', count(SKILL, 'git-ignored paths already dropped'), 0,
  'the false claim that git-ignored paths were dropped is gone');
check('f04.trackedignored', count(SKILL, 'tracked AND\n`.gitignore`d'), 1,
  'the prompt states the opposite truth: tracked-then-ignored files are live');
check('f04.invariant', count(SKILL, 'must appear exactly once across `scanned[]` + `skipped[]`'), 1,
  'the assigned-vs-accounted invariant is stated to the agent');
check('f04.reconcile', count(SKILL, 'scripts/reconcile.mjs'), 1,
  'Phase 3 runs the reconciler rather than "handling errors gracefully"');
check('f04.respawn', count(SKILL, 'Re-spawn that ONE chunk once'), 1,
  'a failing chunk is re-spawned exactly once');
check('f04.unscanned', count(SKILL, 'UNSCANNED'), 7,
  'the UNSCANNED state is carried through prompt, phase 3, report and stats');
check('f04.verdict', count(SKILL, 'INCOMPLETE'), 5,
  'the INCOMPLETE verdict is defined and used in the report and the summary');

// ── wiring: every referenced script exists ─────────────────────────────────
check('wiring.scripts', readdirSync(join(SKILL_DIR, 'scripts')).sort(),
  ['reconcile.mjs', 'redact.mjs', 'scan-init.sh'], 'the skill ships exactly these three scripts');
check('wiring.refs', [
  count(SKILL, '${CLAUDE_SKILL_DIR}/scripts/scan-init.sh'),
  count(SKILL, '${CLAUDE_SKILL_DIR}/scripts/redact.mjs'),
  count(SKILL, '${CLAUDE_SKILL_DIR}/scripts/reconcile.mjs'),
], [1, 1, 1], 'each script is invoked through the bare CLAUDE_SKILL_DIR substitution');
check('wiring.nostaleshellvar', count(SKILL, '$DIR/'), 0,
  'no block reuses a shell variable across Bash calls - {DIR} is substituted instead');

// ── report ─────────────────────────────────────────────────────────────────
console.log('\n=== secrets-scan contract TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
