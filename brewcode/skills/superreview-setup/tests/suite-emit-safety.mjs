#!/usr/bin/env node
// Emit-ownership suite for superreview-setup generate.sh: a stack switch (A -> B) must not leave A's owned ref installed.
// Each case runs the real generator, cwd = own mkdtemp root; GENERATE_SH=<path> targets another copy (pre-fix falsification).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = process.env.GENERATE_SH || join(HERE, '..', 'scripts', 'generate.sh');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'superreview-emit-')));
const SKILL = '.claude/skills/superreview';
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
    existsSync(join(root, '.claude/agents/intent-guard.md')),
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
  check('uninstall kept intent-guard', existsSync(join(root, '.claude/agents/intent-guard.md')), true);

  run(root, 'emit', { STACK_REF: 'python.md' });
  const pu = run(root, 'purge');
  check('purge exits 0', pu.code, 0);
  check('purge removed the skill dir', existsSync(join(root, SKILL)), false);
}

// ── 7. the marker STRING is not ownership - only the anchored frontmatter key is ─
// A body mention of `generated_by: "brewcode:superreview-setup"`, or one outside the leading `---` block, used to be swept (head -10 substring).
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

// ── 8. upgrade restamps every live artifact, on every stack ───────────────────
// Cover for the gap that let `upgrade` abort on references shipped without content_version.
const SKILL_SRC = join(dirname(GEN), '..');
const TODAY = spawnSync('date', ['+%F'], { encoding: 'utf8' }).stdout.trim();
const RELEASE_STAMP = {
  version: JSON.parse(readFileSync(join(SKILL_SRC, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8')).version,
  content_version: /brewcode-meta:.*content_version=(\d+\.\d+\.\d+)/.exec(readFileSync(join(SKILL_SRC, 'SKILL.md'), 'utf8'))[1],
  generated_by: 'brewcode:superreview-setup',
  last_updated: TODAY,
};
const stamp = p => Object.fromEntries(
  read(p).split('\n---\n')[0].split('\n')
    .map(l => /^(version|content_version|generated_by|last_updated): "(.*)"$/.exec(l))
    .filter(Boolean)
    .map(m => [m[1], m[2]]));

for (const stack of ['go.md', 'java-kotlin.md', 'python.md', 'typescript-react.md']) {
  // GIVEN a fresh install on this stack
  const root = project(`upgrade-${stack}`);
  run(root, 'emit', { STACK_REF: stack });
  const live = ['SKILL.md', 'references/agent-prompt.md', 'references/report-template.md', 'references/scope.md', `references/${stack}`];

  // WHEN upgrade runs with a bare environment
  const up = run(root, 'upgrade');

  // THEN it exits 0, restamps each live artifact once, and all five carry one release stamp
  check(`upgrade exits 0 (${stack})`, up.code, 0);
  check(`upgrade restamps each live artifact once (${stack})`,
    up.out.split('\n').filter(l => l.startsWith('RESTAMP: ')).map(l => l.split(' ')[1]),
    live.map(rel => `${SKILL}/${rel}`));
  check(`every live artifact carries the release stamp (${stack})`,
    live.map(rel => stamp(join(root, SKILL, rel))), live.map(() => RELEASE_STAMP));
}

// ── 9. an install whose references predate content_version still upgrades ─────
{
  // GIVEN live and baseline references carrying the old three-key stamp
  const root = project('upgrade-old-install');
  run(root, 'emit', { STACK_REF: 'python.md' });
  const refs = ['references/agent-prompt.md', 'references/report-template.md', 'references/python.md'];
  const strip = p => write(p, read(p).replace(/^content_version: .*\n/m, ''));
  refs.forEach(rel => { strip(join(root, SKILL, rel)); strip(join(root, SKILL, '.template-baseline', rel)); });
  check('precondition: old references carry no content_version',
    refs.map(rel => 'content_version' in stamp(join(root, SKILL, rel))), [false, false, false]);
  const bodies = refs.map(rel => read(join(root, SKILL, rel)).split('\n---\n').slice(1).join('\n---\n'));

  // WHEN upgrade runs
  const up = run(root, 'upgrade');

  // THEN it exits 0, the old references gain the full stamp, and their bodies are byte-identical
  check('upgrade of an old install exits 0', up.code, 0);
  check('old references gain the full release stamp',
    refs.map(rel => stamp(join(root, SKILL, rel))), refs.map(() => RELEASE_STAMP));
  check('old reference bodies are byte-identical after the restamp',
    refs.map(rel => read(join(root, SKILL, rel)).split('\n---\n').slice(1).join('\n---\n')), bodies);
}

// ── 10. nested agents: Claude Code scans .claude/agents/ recursively ──────────
{
  // GIVEN one top-level and one nested agent
  const root = project('nested-agents');
  write(join(root, '.claude/agents/top.md'), '---\nname: top\ndescription: top owner\n---\n');
  write(join(root, '.claude/agents/review/expert.md'), '---\nname: expert\ndescription: nested owner\n---\n');
  const rows = out => out.split('\n').filter(l => l.startsWith('.claude/agents/')).map(l => l.split(' :: ')[0]);

  // WHEN scan runs
  const scan = run(root, 'scan');

  // THEN the roster and its count include the nested agent
  check('scan roster lists the nested agent', rows(scan.out), ['.claude/agents/review/expert.md', '.claude/agents/top.md']);
  check('scan counts the nested agent', scan.out.split('\n').filter(l => l.startsWith('agents=')), ['agents=2']);

  // WHEN the emitted runtime roster probe runs
  run(root, 'emit', { STACK_REF: 'python.md' });
  const prompt = read(join(root, REFS, 'agent-prompt.md')).split('\n');
  const start = prompt.indexOf('# Live roster: name + description of every project agent');
  write(join(root, 'roster.sh'), `${prompt.slice(start, prompt.indexOf('```', start)).join('\n')}\n`);
  const probe = spawnSync('bash', [join(root, 'roster.sh')], { cwd: root, encoding: 'utf8' });

  // THEN it lists the nested agent too (intent-guard is written by emit)
  check('emitted roster probe lists the nested agent', rows(probe.stdout),
    ['.claude/agents/intent-guard.md', '.claude/agents/review/expert.md', '.claude/agents/top.md']);

  // WHEN validate sees a nested agent and an unknown one referenced
  const sk = join(root, SKILL, 'SKILL.md');
  write(sk, `${read(sk)}\nsubagent_type="expert"\nsubagent_type="ghost"\n`);
  const val = run(root, 'validate');

  // THEN only the unknown one is rejected
  check('validate allowlist accepts the nested agent only',
    val.out.split('\n').filter(l => l.startsWith('❌ unknown agent referenced')),
    ['❌ unknown agent referenced in SKILL.md: ghost (not in target .claude/agents/ nor built-in Explore|Plan|general-purpose)']);
}

rmSync(BASE, { recursive: true, force: true });
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
