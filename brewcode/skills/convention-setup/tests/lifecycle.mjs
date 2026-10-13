import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/convention.sh', import.meta.url));
const pluginRoot = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const invoke = (cwd, mode) => spawnSync('sh', [script, mode], { cwd, encoding: 'utf8' });
const state = (cwd) => JSON.parse(invoke(cwd, 'status').stdout).state;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'convention-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const setup = invoke(root, 'setup');
  assert.equal(setup.status, 0, `generation metadata resolves: ${setup.stderr}`);
  const metadata = JSON.parse(setup.stdout);
  for (const name of ['reference-patterns', 'testing-conventions', 'project-architecture']) {
    writeFileSync(join(root, `.claude/convention/${name}.md`), `---\ndoc_type: llm\nversion: "${metadata.version}"\ncontent_version: "${metadata.content_version}"\ngenerated_by: "${metadata.generated_by}"\nlast_updated: "${metadata.last_updated}"\n---\n# ${name}\n`);
  }
  return root;
}

test('status leaves an absent project untouched', (t) => {
  // GIVEN an empty project.
  const root = mkdtempSync(join(tmpdir(), 'convention-status-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // WHEN status probes it.
  assert.equal(state(root), 'missing', 'absent installation reports missing');
  // THEN status creates no directory.
  assert.equal(existsSync(join(root, '.claude')), false, 'status remains read-only');
});

test('disable and enable preserve loading bytes, and upgrade keeps a disabled installation disabled', (t) => {
  // GIVEN installed, validated convention documents and loading guidance.
  const root = fixture(t);
  assert.equal(invoke(root, 'install').status, 0, 'install succeeds with complete documents');
  const rule = join(root, '.claude/rules/convention.md');
  const body = readFileSync(rule, 'utf8');
  // WHEN loading is disabled and upgraded.
  assert.equal(invoke(root, 'disable').status, 0, 'disable succeeds');
  assert.equal(readFileSync(`${rule}.disabled`, 'utf8'), body, 'parking preserves the complete body');
  assert.equal(invoke(root, 'upgrade').status, 0, 'upgrade succeeds on a parked installation');
  assert.equal(state(root), 'disabled', 'upgrade preserves disabled state');
  // THEN enabling restores byte-identical discovery guidance.
  assert.equal(invoke(root, 'enable').status, 0, 'enable succeeds');
  assert.equal(readFileSync(rule, 'utf8'), body, 'enable restores the original bytes');
  assert.equal(state(root), 'installed', 'restored installation is current');
});

test('uninstall preserves evidence and accepted rules; purge removes only generated evidence', (t) => {
  // GIVEN convention setup plus user-owned accepted rules and an extra document.
  const root = fixture(t);
  assert.equal(invoke(root, 'install').status, 0, 'install precondition succeeds');
  const accepted = join(root, '.claude/rules/accepted.md');
  const extra = join(root, '.claude/convention/notes.md');
  writeFileSync(accepted, '# Accepted rule\n');
  writeFileSync(extra, '# Notes\n');
  // WHEN uninstall removes loading guidance.
  assert.equal(invoke(root, 'uninstall').status, 0, 'uninstall succeeds');
  assert.equal(existsSync(join(root, '.claude/convention/reference-patterns.md')), true, 'uninstall preserves generated evidence');
  // THEN purge removes known generated docs but preserves independent user material.
  assert.equal(invoke(root, 'purge').status, 0, 'purge succeeds after uninstall');
  assert.equal(existsSync(join(root, '.claude/convention/reference-patterns.md')), false, 'purge removes owned generated evidence');
  assert.equal(readFileSync(accepted, 'utf8'), '# Accepted rule\n', 'accepted coding rules remain intact');
  assert.equal(readFileSync(extra, 'utf8'), '# Notes\n', 'other convention documents remain intact');
});

test('loading collision refuses all mutations', (t) => {
  // GIVEN both live and parked discovery entries.
  const root = fixture(t);
  assert.equal(invoke(root, 'install').status, 0, 'install precondition succeeds');
  const rule = join(root, '.claude/rules/convention.md');
  const body = readFileSync(rule, 'utf8');
  writeFileSync(`${rule}.disabled`, body);
  // WHEN disable encounters the collision.
  assert.equal(invoke(root, 'disable').status, 1, 'conflicting entries fail without toggling');
  // THEN both copies survive unchanged.
  assert.equal(readFileSync(rule, 'utf8'), body, 'live entry is preserved');
  assert.equal(readFileSync(`${rule}.disabled`, 'utf8'), body, 'parked entry is preserved');
});

test('purge validates all owners before deleting any generated document', (t) => {
  // GIVEN an unowned document replacing one generated output.
  const root = fixture(t);
  const first = join(root, '.claude/convention/reference-patterns.md');
  const before = readFileSync(first, 'utf8');
  writeFileSync(join(root, '.claude/convention/testing-conventions.md'), '# User document\n');
  // WHEN purge checks ownership.
  assert.equal(invoke(root, 'purge').status, 1, 'unowned evidence blocks purge');
  // THEN even earlier generated outputs are preserved.
  assert.equal(readFileSync(first, 'utf8'), before, 'ownership preflight prevents partial deletion');
});

test('the dashboard classifies stale generated evidence and rejects missing metadata', (t) => {
  // GIVEN a current installation.
  const root = fixture(t);
  assert.equal(invoke(root, 'install').status, 0, 'install precondition succeeds');
  const doc = join(root, '.claude/convention/reference-patterns.md');
  const body = readFileSync(doc, 'utf8');
  // WHEN only a generated document carries an older content version.
  writeFileSync(doc, body.replace(/^content_version:.*$/m, 'content_version: "0.0.1"'));
  assert.equal(state(root), 'stale', 'stale document evidence makes setup stale');
  // THEN missing metadata does not count as a valid installation.
  writeFileSync(doc, '# Unstamped evidence\n');
  assert.equal(state(root), 'partial', 'unstamped evidence reports a partial setup');
});

test('setup-status reads current convention stamps and parked loading guidance from producer output', (t) => {
  // GIVEN a complete, disabled setup generated by the authoritative script.
  const root = fixture(t);
  assert.equal(invoke(root, 'install').status, 0, 'install precondition succeeds');
  assert.equal(invoke(root, 'disable').status, 0, 'disabled precondition succeeds');
  const dashboard = readFileSync(resolve(pluginRoot, 'skills/setup-status/references/phase2-stamps.md'), 'utf8');
  const stampBlock = [...dashboard.matchAll(/```bash\n([\s\S]*?)\n```/g)].map((match) => match[1]).find((block) => block.includes("<<'STAMPS'"));
  assert.equal(typeof stampBlock, 'string', 'dashboard exposes its integrated stamp probe');
  // WHEN the actual dashboard stamp probe runs against producer-shaped artifacts.
  const command = stampBlock.replace('PLUGIN_ROOT=/abs/root/printed/by/phase0', 'PLUGIN_ROOT="$CONVENTION_TEST_PLUGIN"');
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root, CONVENTION_TEST_PLUGIN: pluginRoot } });
  // THEN all convention carriers are current and enumeration remains synchronized.
  assert.equal(result.status, 0, `dashboard probe succeeds: ${result.stderr}`);
  assert.match(result.stdout, /ROWS 7\/7 for brewcode \(23 carrier lines over 11 roster rows\)/, 'dashboard carrier counts include the new setup');
  assert.equal(result.stdout.match(/^CURRENT.*\.claude\/(?:rules\/convention\.md|convention\/)/gm)?.length, 4, 'parked loading rule and all three documents read current');
});

test('purge is marked destructive in the mode table so a keyword tie asks first', () => {
  // GIVEN the shipped SKILL.md.
  const skill = readFileSync(fileURLToPath(new URL('../SKILL.md', import.meta.url)), 'utf8');
  // WHEN the purge mode row is read.
  const rows = skill.split('\n').filter((line) => line.startsWith('| `purge` |'));
  // THEN its Mutates? column is the destructive marker the prompt-contract tie-break keys on.
  assert.deepEqual(rows.map((line) => line.split('|').at(-2).trim()), ['yes, destructive'], 'purge row Mutates? = yes, destructive');
});

const handWritten = (t, names) => {
  const root = mkdtempSync(join(tmpdir(), 'convention-hand-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.claude/convention'), { recursive: true });
  for (const name of names) writeFileSync(join(root, `.claude/convention/${name}`), `# ${name}\n\nHand-written project notes.\n`);
  return root;
};
const dashboardConv = (root) => {
  const probes = readFileSync(resolve(pluginRoot, 'skills/setup-status/references/phase1-probes.md'), 'utf8');
  const block = [...probes.matchAll(/```bash\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((b) => b.includes('echo "CONV docs='));
  const r = spawnSync('bash', ['-c', block], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
  return r.stdout.split('\n').find((line) => line.startsWith('CONV ')) ?? `NO CONV LINE: ${r.stderr}`;
};

test('hand-written convention docs read missing (hand-written docs present), every doc counted, never partial or stale', (t) => {
  // GIVEN the finagra-bot shape (4 docs, other names) and the finagra-site shape (the 3 generator names + design-system.md), no loading rule.
  const bot = handWritten(t, ['architecture.md', 'logging.md', 'secrets.md', 'whatsapp.md']);
  const site = handWritten(t, ['design-system.md', 'project-architecture.md', 'reference-patterns.md', 'testing-conventions.md']);
  // WHEN the owner status and the setup-status CONV probe read both.
  const result = [bot, site].map((root) => [JSON.parse(invoke(root, 'status').stdout), dashboardConv(root)]);
  // THEN both are missing with hand-written docs, all four counted, none owned.
  assert.deepEqual(result, [
    [{ state: 'missing', rule: '', docs: 4, owned_docs: 0, hand_written: true }, 'CONV docs=4 owned=0 rule=absent names=architecture.md logging.md secrets.md whatsapp.md'],
    [{ state: 'missing', rule: '', docs: 4, owned_docs: 0, hand_written: true }, 'CONV docs=4 owned=0 rule=absent names=design-system.md project-architecture.md reference-patterns.md testing-conventions.md'],
  ], 'hand-written convention dirs must never read partial or stale, and every document must be counted');
});

test('setup-status Phase 3 classifies hand-written docs as missing and never prescribes upgrade', () => {
  // GIVEN the shipped classifier. WHEN rule 3c is read.
  const rule = readFileSync(resolve(pluginRoot, 'skills/setup-status/SKILL.md'), 'utf8').split('\n').find((line) => line.startsWith('| 3c |')) ?? 'NO RULE 3c';
  // THEN it names the state and forbids upgrade.
  assert.deepEqual([rule.includes('`missing (hand-written docs present)`'), rule.includes('never `upgrade`')], [true, true],
    'hand-written convention docs must read missing (hand-written docs present) with no upgrade');
});

test('generated convention docs without their loading rule still read partial', (t) => {
  // GIVEN the three generated documents plus a hand-written fourth, no loading rule.
  const root = fixture(t);
  writeFileSync(join(root, '.claude/convention/design-system.md'), '# design system\n');
  // WHEN the owner status and the setup-status CONV probe read it.
  const result = [JSON.parse(invoke(root, 'status').stdout), dashboardConv(root)];
  // THEN the missing loader is a partial install; the extra doc is counted, not owned.
  assert.deepEqual(result, [
    { state: 'partial', rule: '', docs: 4, owned_docs: 3, hand_written: false },
    'CONV docs=4 owned=3 rule=absent names=design-system.md project-architecture.md reference-patterns.md testing-conventions.md',
  ], 'generated docs without the loading rule must stay partial');
});
