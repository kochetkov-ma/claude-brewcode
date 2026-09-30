#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const TOOLS = join(ROOT, 'brewtools');
const source = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const blocks = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1]);
const presence = blocks.find(block => block.startsWith('cd "$PWD"'));
const parking = blocks.find(block => block.includes('echo "CONFLICT $f"'));
const stamps = blocks.find(block => block.includes("<<'STAMPS'"));
const row = source.split('\n').find(line => line.startsWith('| 4 | `/brewtools:task-board-setup`'));
const artifacts = [...row.split('|').slice(4, 6).join('\n').matchAll(/\.claude\/[A-Za-z0-9_./-]+/g)].map(match => match[0]);
const templates = readFileSync(join(TOOLS, 'skills/task-board-setup/references/05-features-templates.md'), 'utf8');
const templateBody = templates.split('## `TASK_TEMPLATE.md`', 2)[1].match(/```markdown\n([\s\S]*?)\n```/)[1];
const stampBody = templates.split('## `board.md`', 2)[1].match(/---\ndoc_type: llm[\s\S]*?\n---/)[0];
const producer = readFileSync(join(TOOLS, 'skills/task-board-setup/SKILL.md'), 'utf8');
const contentVersion = producer.match(/brewcode-meta:.*?content_version=([^\s>]+)/)[1];
const release = JSON.parse(readFileSync(join(TOOLS, '.claude-plugin/plugin.json'), 'utf8')).version;

function fixture(t, mode) {
  const root = mkdtempSync(join(tmpdir(), 'task-board-status-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const metadata = stampBody.replaceAll('{PLUGIN_VERSION}', release)
    .replaceAll('{CONTENT_VERSION}', contentVersion)
    .replaceAll('{GENERATED_BY}', 'brewtools:task-board-setup')
    .replaceAll('{LAST_UPDATED}', '2026-09-30');
  const deployed = artifacts.filter(file => mode === 'on' || file !== '.claude/skills/task-spec/SKILL.md');
  for (const file of deployed) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `${metadata}\n# Producer-shaped artifact\n`);
  }
  writeFileSync(join(root, '.claude/features/TASK_TEMPLATE.md'), templateBody
    .replaceAll('{{SPEC_FM_LINE}}', { on: 'spec: none', off: '' }[mode])
    .replaceAll('{{SPEC_SCOPE_BLOCK}}', ''));
  return { root, deployed };
}

function probe(root) {
  const command = presence.replace(/done <<'PATHS'\n[\s\S]*?\nPATHS/,
    `done <<'PATHS'\n${artifacts.join('\n')}\nPATHS`);
  const result = run(root, command);
  return { text: result, mode: result.match(/^TASK_SPEC_MODE=(on|off|unknown)$/m)[1] };
}

function run(root, command, mode = 'unknown') {
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    cwd: root, encoding: 'utf8', env: { ...process.env, HOME: root, TASK_SPEC_MODE: mode }, timeout: 10000,
  });
  assert.equal(result.status, 0, `actual shipped read-only probe must succeed: ${result.stderr}`);
  return result.stdout;
}

function readStamps(root, mode) {
  const command = stamps.replace('PLUGIN_ROOT=/abs/root/printed/by/phase0', `PLUGIN_ROOT="${TOOLS}"`)
    .replace('PLUGIN=brewcode ', 'PLUGIN=brewtools ')
    .replaceAll('${CLAUDE_SKILL_DIR}', STATUS_DIR);
  return run(root, command, mode);
}

test('actual off/on task-template gate controls optional presence, parking and all canonical content-version probes', t => {
  // GIVEN: actual source template gates and canonical stamped artifact inventory.
  assert.equal(artifacts.length, 12, 'on-mode inventory must include twelve authoritative carriers');
  assert.match(templateBody, /\{\{SPEC_FM_LINE\}\}/, 'fixture must resolve the actual producer spec-field gate');
  for (const mode of ['off', 'on']) {
    const { root, deployed } = fixture(t, mode);
    // WHEN: all three actual dashboard probes consume the producer-shaped installation.
    const found = probe(root);
    const toggles = run(root, parking, found.mode);
    const versions = readStamps(root, found.mode);
    // THEN: optional absence is ignored only off; every real emitted carrier is checked.
    assert.equal(found.mode, mode, `${mode} must derive from the actual emitted task-template field`);
    assert.equal(found.text.includes('OPTIONAL .claude/skills/task-spec/SKILL.md'), mode === 'off', `${mode} presence must respect the optional spec layer`);
    assert.equal(toggles.includes('OPTIONAL .claude/skills/task-spec/SKILL.md'), mode === 'off', `${mode} parking must respect the same derived mode`);
    assert.doesNotMatch(found.text, /^MISS /m, `${mode} complete installation must have no required secondary MISS`);
    for (const file of deployed) {
      assert.equal(versions.includes(`CURRENT   ${file} (`), true, `${mode} must compare ${file} against its producer CV`);
    }
    assert.match(versions, /ROWS 13\/13 for brewtools \(23 carrier lines over 11 roster rows\)/,
      `${mode} must preserve the logical source-carrier census`);
  }
});

test('enabled missing task-spec and missing-template legacy installs retain their required absence signal', t => {
  // GIVEN: an enabled installation with its spec artifact removed.
  const enabled = fixture(t, 'on');
  rmSync(join(enabled.root, '.claude/skills/task-spec/SKILL.md'));
  // WHEN/THEN: the actual field keeps spec required despite its missing discovery entry.
  const found = probe(enabled.root);
  assert.equal(found.mode, 'on', 'spec field must retain enabled-layer authority');
  assert.match(found.text, /^MISS \.claude\/skills\/task-spec\/SKILL\.md$/m, 'enabled absence must remain a required secondary MISS');
  assert.match(run(enabled.root, parking, found.mode), /^ABSENT \.claude\/skills\/task-spec\/SKILL\.md$/m, 'enabled absence must not look parked or optional');
  assert.match(readStamps(enabled.root, found.mode), /^MISSING\s+\.claude\/skills\/task-spec\/SKILL\.md$/m, 'enabled missing stamp carrier must remain visible');

  // GIVEN/WHEN: an old installation has neither task template nor task-spec.
  const legacy = fixture(t, 'off');
  rmSync(join(legacy.root, '.claude/features/TASK_TEMPLATE.md'));
  const unknown = probe(legacy.root);
  // THEN: missing producer evidence cannot silently infer off.
  assert.equal(unknown.mode, 'unknown', 'missing template must retain legacy unknown state');
  assert.match(unknown.text, /^MISS \.claude\/skills\/task-spec\/SKILL\.md$/m, 'legacy unknown must preserve the existing upgrade/partial signal');
  assert.doesNotMatch(unknown.text, /^OPTIONAL /m, 'unknown must never manufacture optional absence');
});

test('off-mode parked and mixed entries preserve disabled/partial precedence and parked stamp reads', t => {
  // GIVEN: an off-mode install and its three deployed discovery entries.
  const { root } = fixture(t, 'off');
  const entries = ['.claude/agents/task-tracker.md', '.claude/skills/task-board/SKILL.md', '.claude/rules/tasks.md'];
  renameSync(join(root, entries[0]), join(root, `${entries[0]}.disabled`));
  // WHEN: one parked entry leaves a mixed toggle.
  let toggles = run(root, parking, probe(root).mode);
  // THEN: existing mixed-toggle evidence is retained.
  assert.equal(entries.filter(file => toggles.includes(`LIVE   ${file}\n`)).length, 2, 'mixed toggle must retain two live members');
  assert.equal(entries.filter(file => toggles.includes(`PARKED ${file}.disabled\n`)).length, 1, 'mixed toggle must retain one parked member');
  assert.match(source, /some `LIVE`, some `PARKED`.*`partial`/, 'actual classification contract must retain mixed-toggle partial precedence');
  for (const file of entries.slice(1)) renameSync(join(root, file), join(root, `${file}.disabled`));
  // WHEN: all deployed entries are parked.
  toggles = run(root, parking, probe(root).mode);
  // THEN: absent optional task-spec remains outside the deployed set and all real stamps stay readable.
  assert.equal(entries.filter(file => toggles.includes(`PARKED ${file}.disabled\n`)).length, 3, 'all three deployed members must count as parked');
  assert.match(toggles, /^OPTIONAL \.claude\/skills\/task-spec\/SKILL\.md/m, 'off-mode task-spec must not become an absent parked member');
  const versions = readStamps(root, 'off');
  for (const file of entries) assert.equal(versions.includes(`CURRENT   ${file}.disabled (`), true, `parked ${file} must retain real CV comparison`);
  assert.match(source, /\| 2 \| Phase 1b.*`disabled`/, 'disabled must stay before partial/stale classification');
});

test('missing methodology controls and stale real carriers remain defects even with the optional spec layer off', t => {
  // GIVEN: the producer-shaped off-mode installation includes all three ungated controls.
  const { root } = fixture(t, 'off');
  const controls = ['METHODOLOGY.md', 'ANTI-DRIFT.md', 'task-graph.md'];
  for (const file of controls) {
    const target = join(root, '.claude/features', file);
    const body = readFileSync(target, 'utf8');
    // WHEN: a real control CV differs from the producer while task-spec remains optional.
    writeFileSync(target, body.replace(/^content_version:.*$/m, 'content_version: "0.0.1"'));
    // THEN: optional spec absence never suppresses another carrier's drift.
    assert.equal(readStamps(root, 'off').includes(`BEHIND    .claude/features/${file} (0.0.1 -> ${contentVersion}, cv-src)`), true,
      `${file} stale content must remain an independent finding`);
    writeFileSync(target, body);
  }
  for (const file of controls) rmSync(join(root, '.claude/features', file));
  const found = probe(root);
  for (const file of controls) assert.equal(found.text.includes(`MISS .claude/features/${file}\n`), true,
    `${file} missing control must prevent a legacy board from appearing complete`);
  assert.match(source, /any required secondary MISS \(`OPTIONAL` is excluded\)/,
    'actual partial classification must apply to every required missing methodology control');
});
