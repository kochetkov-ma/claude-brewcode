#!/usr/bin/env node
/**
 * Emit-ownership suite for brewdoc:memory-sync-setup generate.sh.
 *
 * Regression cover for the whole-directory replace on emit (`rm -rf $TARGET && mv`):
 * it deleted a PARKED SKILL.md.disabled and every file `uninstall` had just reported
 * as KEPT. Emit owns exactly 4 paths (SKILL.md + 3 references) and must place them
 * individually; anything else in the skill dir belongs to the user.
 *
 * Each case runs the real generator as a child process against its own mkdtemp root
 * (MEMORY_SYNC_ROOT), so nothing here depends on the repo it is executed from.
 * GENERATE_SH=<path> points the suite at another copy - that is how the pre-fix
 * falsification is run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = process.env.GENERATE_SH || join(HERE, '..', 'scripts', 'generate.sh');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'memory-sync-emit-')));
const SKILL = '.claude/skills/memory-sync';

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
}

function run(root, mode, env = {}) {
  const e = { ...process.env, MEMORY_SYNC_ROOT: root };
  delete e.MEMORY_SYNC_FORCE;
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
  const r = run(root, 'emit');
  check('fresh emit exits 0', r.code, 0);
  check('fresh emit wrote the owned set', [
    existsSync(join(root, SKILL, 'SKILL.md')),
    existsSync(join(root, SKILL, 'references/memory-guide.md')),
    existsSync(join(root, SKILL, 'references/agent-audit.md')),
    existsSync(join(root, SKILL, 'references/hard-sync.md')),
  ], [true, true, true, true]);
}

// ── 2. uninstall KEEPS a user file, and the next emit must not undo that ───────
{
  const root = project('kept-after-uninstall');
  run(root, 'emit');
  const note = join(root, SKILL, 'user-note.md');
  write(note, 'hand-written by the user\n');
  const before = hash(note);

  const un = run(root, 'uninstall');
  check('uninstall exits 0', un.code, 0);
  check('uninstall reports the user file as KEPT', un.out.includes('KEPT:'), true);
  check('uninstall left the user file on disk', hash(note), before);

  // Acceptance: either the emit refuses, or it succeeds with the user file byte-identical.
  const em = run(root, 'emit');
  check('post-uninstall emit did not destroy the user file', hash(note), before);
  check('post-uninstall emit resolved (refused or succeeded, never a crash)', [em.code === 0 || em.code === 1, existsSync(join(root, SKILL, 'SKILL.md')) || em.code !== 0], [true, true]);
}

// ── 3. a PARKED install is an install ──────────────────────────────────────────
{
  const root = project('parked');
  run(root, 'emit');
  const dis = run(root, 'disable');
  check('disable exits 0', dis.code, 0);
  const parked = join(root, SKILL, 'SKILL.md.disabled');
  const before = hash(parked);
  check('disable parked SKILL.md', before === 'ABSENT', false);

  const em = run(root, 'emit');
  check('emit over a parked install refuses', em.code !== 0, true);
  check('emit over a parked install names the enable path', em.out.includes('enable'), true);
  check('parked body is byte-identical after the refused emit', hash(parked), before);

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('FORCE does not override a parked install', forced.code !== 0, true);
  check('parked body is byte-identical after the forced emit', hash(parked), before);
}

// ── 4. MEMORY_SYNC_FORCE=1 still overrides a LIVE install ──────────────────────
{
  const root = project('force');
  run(root, 'emit');
  const skill = join(root, SKILL, 'SKILL.md');
  write(skill, `${read(skill)}\nHAND EDIT\n`);
  const edited = hash(skill);

  const plain = run(root, 'emit');
  check('emit over a live install refuses', plain.code !== 0, true);
  check('refused emit left the hand-edit alone', hash(skill), edited);

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('FORCE emit exits 0', forced.code, 0);
  check('FORCE emit overwrote the hand-edit', read(skill).includes('HAND EDIT'), false);
}

// ── 5. a FORCE emit still owns only its own 4 paths ────────────────────────────
{
  const root = project('force-keeps-foreign');
  run(root, 'emit');
  const note = join(root, SKILL, 'user-note.md');
  const nested = join(root, SKILL, 'references/user-ref.md');
  write(note, 'note\n');
  write(nested, 'nested\n');
  const [n1, n2] = [hash(note), hash(nested)];

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('FORCE emit exits 0 with foreign files present', forced.code, 0);
  check('FORCE emit kept foreign files byte-identical', [hash(note), hash(nested)], [n1, n2]);
}

// ── 6. purge still wipes everything ────────────────────────────────────────────
{
  const root = project('purge');
  run(root, 'emit');
  write(join(root, SKILL, 'user-note.md'), 'note\n');
  const pu = run(root, 'purge');
  check('purge exits 0', pu.code, 0);
  check('purge removed the whole skill dir', existsSync(join(root, SKILL)), false);
}

// ── 7. a reference emitted under an OLDER name is swept; unowned files are not ──
{
  const root = project('stale-owned-ref');
  run(root, 'emit');
  const stale = join(root, SKILL, 'references/old-guide.md');
  const foreign = join(root, SKILL, 'references/user-ref.md');
  const note = join(root, SKILL, 'user-note.md');
  // Same provenance marker every emitted reference carries on its first line.
  write(stale, '<!-- brewcode-meta: version=5.0.0 content_version=5.0.0 generated_by=brewdoc:memory-sync-setup -->\n# Old Guide\n');
  write(foreign, 'a reference the user wrote by hand\n');
  write(note, 'note\n');
  const [f1, n1] = [hash(foreign), hash(note)];

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('emit exits 0 with a stale owned reference present', forced.code, 0);
  check('emit removed the stale owned reference', existsSync(stale), false);
  check('emit kept unowned files byte-identical', [hash(foreign), hash(note)], [f1, n1]);
  check('emit still wrote the owned references', [
    existsSync(join(root, SKILL, 'references/memory-guide.md')),
    existsSync(join(root, SKILL, 'references/hard-sync.md')),
  ], [true, true]);
}

// ── 8. the marker STRING is not ownership - only the line-1 provenance comment is ─
// A user file that merely mentions `generated_by=brewdoc:memory-sync-setup`, or carries the marker
// somewhere other than line 1, used to be deleted by the sweep (substring match on head -5).
{
  const root = project('marker-mention');
  run(root, 'emit');
  const MARK = '<!-- brewcode-meta: version=5.0.0 content_version=5.0.0 generated_by=brewdoc:memory-sync-setup -->';

  const mention = join(root, SKILL, 'references/mention-in-body.md');
  const past = join(root, SKILL, 'references/past-window.md');
  const notLine1 = join(root, SKILL, 'references/not-line-1.md');
  const stale = join(root, SKILL, 'references/old-guide.md');
  write(mention, `# House notes\n\nWe use generated_by=brewdoc:memory-sync-setup markers.\n`);
  write(past, `# Long note\n${'\nfiller\n'.repeat(6)}\n${MARK}\n`);
  write(notLine1, `# Hand-written\n${MARK}\n`);
  write(stale, `${MARK}\n# Old Guide\n`);
  const before = [hash(mention), hash(past), hash(notLine1)];

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('sweep emit exits 0 with marker-mentioning files present', forced.code, 0);
  check('files merely MENTIONING the marker survive byte-identical', [hash(mention), hash(past), hash(notLine1)], before);
  check('the genuinely owned stale ref is still swept', existsSync(stale), false);
}

rmSync(BASE, { recursive: true, force: true });
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
