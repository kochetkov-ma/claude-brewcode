#!/usr/bin/env node
/**
 * Emit-ownership suite for brewcode:superreview-setup generate.sh.
 *
 * Cover for the stale-owned-artifact gap: emit writes only the SELECTED $STACK_REF
 * and never replaced the target wholesale, so switching stack A -> stack B left A's
 * reference installed forever and every later restamp treated it as current.
 *
 * Each case runs the real generator as a child process with cwd set to its own
 * mkdtemp root (the generator's target is cwd-relative), so nothing here depends on
 * the repo it is executed from. GENERATE_SH=<path> points the suite at another copy -
 * that is how the pre-fix falsification is run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = process.env.GENERATE_SH || join(HERE, '..', 'scripts', 'generate.sh');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'superreview-emit-')));
const SKILL = '.codex/skills/superreview';
const REFS = `${SKILL}/references`;

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
}

function run(root, mode, env = {}) {
  const e = { ...process.env };
  delete e.SUPERREVIEW_FORCE;
  delete e.STACK_REF;
  const r = spawnSync('bash', [GEN, mode], { cwd: root, encoding: 'utf8', env: { ...e, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function project(name) {
  const root = join(BASE, name);
  mkdirSync(root, { recursive: true });
  return root;
}

const hash = p => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'ABSENT');
// A file a mode failed to write is a FAILing assertion, never a suite crash that swallows the rest.
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '(ABSENT)');
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };

// ── 1. baseline emit ───────────────────────────────────────────────────────────
{
  const root = project('fresh');
  const r = run(root, 'emit', { STACK_REF: 'python.md' });
  check('fresh emit exits 0', r.code, 0);
  check('fresh emit wrote the owned set', [
    existsSync(join(root, SKILL, 'SKILL.md')),
    existsSync(join(root, REFS, 'agent-prompt.md')),
    existsSync(join(root, REFS, 'report-template.md')),
    existsSync(join(root, REFS, 'scope.md')),
    existsSync(join(root, REFS, 'python.md')),
    existsSync(join(root, '.codex/agents/intent-guard.toml')),
  ], [true, true, true, true, true, true]);
}

// ── 2. emit refuses over a LIVE install; FORCE overrides ───────────────────────
{
  const root = project('force');
  run(root, 'emit', { STACK_REF: 'python.md' });
  const skill = join(root, SKILL, 'SKILL.md');
  write(skill, `${read(skill)}\nHAND EDIT\n`);
  const edited = hash(skill);

  const plain = run(root, 'emit', { STACK_REF: 'python.md' });
  check('emit over a live install refuses', plain.code !== 0, true);
  check('refused emit left the hand-edit alone', hash(skill), edited);

  const forced = run(root, 'emit', { STACK_REF: 'python.md', SUPERREVIEW_FORCE: '1' });
  check('FORCE emit exits 0', forced.code, 0);
  check('FORCE emit overwrote the hand-edit', read(skill).includes('HAND EDIT'), false);
}

// ── 3. a PARKED install is an install - park/enable semantics unchanged ────────
{
  const root = project('parked');
  run(root, 'emit', { STACK_REF: 'python.md' });
  const dis = run(root, 'disable');
  check('disable exits 0', dis.code, 0);
  const parked = join(root, SKILL, 'SKILL.md.disabled');
  const before = hash(parked);
  check('disable parked SKILL.md', before === 'ABSENT', false);

  const em = run(root, 'emit', { STACK_REF: 'python.md' });
  check('emit over a parked install refuses', em.code !== 0, true);
  check('refused emit names the parked artifact', em.out.includes('SKILL.md.disabled'), true);
  check('parked body is byte-identical after the refused emit', hash(parked), before);

  // FORCE is the documented destructive override for the LIVE set; the parked body is not in it.
  const forced = run(root, 'emit', { STACK_REF: 'python.md', SUPERREVIEW_FORCE: '1' });
  check('FORCE emit over a parked install exits 0', forced.code, 0);
  check('parked body is byte-identical after the forced emit', hash(parked), before);

  const en = run(root, 'enable');
  check('enable exits 0', en.code, 0);
  check('enable removed the parked marker', existsSync(parked), false);
}

// ── 4. emit owns only its own paths - foreign files survive ───────────────────
{
  const root = project('keeps-foreign');
  run(root, 'emit', { STACK_REF: 'python.md' });
  const note = join(root, SKILL, 'user-note.md');
  const nested = join(root, REFS, 'user-ref.md');
  write(note, 'note\n');
  write(nested, 'a reference the user wrote by hand\n');
  const [n1, n2] = [hash(note), hash(nested)];

  const forced = run(root, 'emit', { STACK_REF: 'python.md', SUPERREVIEW_FORCE: '1' });
  check('FORCE emit exits 0 with foreign files present', forced.code, 0);
  check('FORCE emit kept foreign files byte-identical', [hash(note), hash(nested)], [n1, n2]);
}

// ── 5. switching stacks sweeps the ref the PREVIOUS emit owned ────────────────
{
  const root = project('stack-switch');
  const a = run(root, 'emit', { STACK_REF: 'python.md' });
  check('stack A emit exits 0', a.code, 0);
  check('stack A ref present', existsSync(join(root, REFS, 'python.md')), true);

  const foreign = join(root, REFS, 'user-ref.md');
  write(foreign, 'a reference the user wrote by hand\n');
  const f1 = hash(foreign);

  const b = run(root, 'emit', { STACK_REF: 'go.md', SUPERREVIEW_FORCE: '1' });
  check('stack B emit exits 0', b.code, 0);
  check('stack B ref present', existsSync(join(root, REFS, 'go.md')), true);
  check('stack A ref swept', existsSync(join(root, REFS, 'python.md')), false);
  check('unowned file survived the sweep byte-identical', hash(foreign), f1);
  check('stack-independent refs still in place', [
    existsSync(join(root, REFS, 'agent-prompt.md')),
    existsSync(join(root, REFS, 'report-template.md')),
    existsSync(join(root, REFS, 'scope.md')),
  ], [true, true, true]);

  // What the install REPORTS as live must agree with the sweep: the refusal lists artifacts.
  const refused = run(root, 'emit', { STACK_REF: 'go.md' });
  check('live-artifact report names only the current stack', [
    refused.out.includes('references/go.md'),
    refused.out.includes('references/python.md'),
  ], [true, false]);
}

// ── 6. uninstall / purge ──────────────────────────────────────────────────────
{
  const root = project('remove');
  run(root, 'emit', { STACK_REF: 'python.md' });
  const un = run(root, 'uninstall');
  check('uninstall exits 0', un.code, 0);
  check('uninstall removed the skill dir', existsSync(join(root, SKILL)), false);
  check('uninstall kept intent-guard', existsSync(join(root, '.codex/agents/intent-guard.toml')), true);

  run(root, 'emit', { STACK_REF: 'python.md' });
  const pu = run(root, 'purge');
  check('purge exits 0', pu.code, 0);
  check('purge removed the skill dir', existsSync(join(root, SKILL)), false);
}

// ── 7. the marker STRING is not ownership - only the anchored frontmatter key is ─
// A user file that merely mentions `generated_by: "brewcode:superreview-setup"`, or carries it
// outside the leading `---` block, used to be deleted by the sweep (substring match on head -10).
{
  const root = project('marker-mention');
  run(root, 'emit', { STACK_REF: 'python.md' });

  const mention = join(root, REFS, 'mention-in-body.md');
  const past = join(root, REFS, 'past-window.md');
  const unanchored = join(root, REFS, 'not-anchored.md');
  write(mention, [
    '---', 'doc_type: notes', '---', '',
    '# House notes', '',
    'Emitted refs are stamped `generated_by: "brewcode:superreview-setup"` in their frontmatter.', '',
  ].join('\n'));
  write(past, `# Long note\n${'\nfiller\n'.repeat(12)}\ngenerated_by: "brewcode:superreview-setup"\n`);
  write(unanchored, '---\ndoc_type: notes\n  generated_by: "brewcode:superreview-setup"\nx_generated_by: "brewcode:superreview-setup"\n---\n\n# Indented, so not the key\n');
  const before = [hash(mention), hash(past), hash(unanchored)];

  const sw = run(root, 'emit', { STACK_REF: 'go.md', SUPERREVIEW_FORCE: '1' });
  check('sweep emit exits 0 with marker-mentioning files present', sw.code, 0);
  check('files merely MENTIONING the marker survive byte-identical', [hash(mention), hash(past), hash(unanchored)], before);
  check('the genuinely owned stale ref is still swept', existsSync(join(root, REFS, 'python.md')), false);
}

rmSync(BASE, { recursive: true, force: true });
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
