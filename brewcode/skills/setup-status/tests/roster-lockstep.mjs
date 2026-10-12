#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const source = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const lines = source.split('\n');
const blocks = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1]);
const flagProbe = blocks.find(block => block.includes('flag agent-deadline'));
const parkProbe = blocks.find(block => block.includes('echo "CONFLICT $f"'));
const roster = Object.fromEntries(lines.filter(line => /^\| \d+ \| `\/brew/.test(line)).map(line => {
  const cells = line.split('|').map(cell => cell.trim());
  return [cells[1], { command: cells[2].replaceAll('`', ''), offSwitch: cells[6].split(/[:,]/)[0] }];
}));
const mechanismRows = name => lines.find(line => line.startsWith(`| **${name}** |`))
  .split('|').at(-2).split(',').map(id => id.trim());
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

const FLAG_ROWS = ['2', '6', '7', '8', '10', '11'];
const PARK_ROWS = ['1', '3', '4', '9', '12'];

test('GIVEN the plugin tree WHEN listing *-setup skill dirs THEN the roster names exactly those 11 commands', () => {
  const onDisk = ['brewcode', 'brewdoc', 'brewtools', 'brewui'].flatMap(plugin =>
    readdirSync(join(ROOT, plugin, 'skills')).filter(dir => dir.endsWith('-setup')).map(dir => `/${plugin}:${dir}`));
  assert.deepEqual(Object.values(roster).map(row => row.command).sort(), onDisk.sort(),
    'roster commands must equal the shipped *-setup dirs (root CLAUDE.md "enable + disable on all 11")');
});

test('GIVEN the roster WHEN reading each off-switch THEN Phase 1b maps flag and parking rows disjointly over all 11', () => {
  const expected = Object.fromEntries([...FLAG_ROWS.map(id => [id, 'flag']), ...PARK_ROWS.map(id => [id, 'parking'])]);
  const actual = { flag: mechanismRows('live config flag'), parking: mechanismRows('entry-file parking'),
    offSwitch: Object.fromEntries(Object.entries(roster).map(([id, row]) => [id, row.offSwitch])) };
  assert.deepEqual(actual, { flag: FLAG_ROWS, parking: PARK_ROWS, offSwitch: expected },
    'mechanism table and roster off-switch column must agree row by row');
});

test('GIVEN every -setup SKILL.md WHEN reading argument-hint THEN each offers both enable and disable', () => {
  const hints = Object.values(roster).map(row => {
    const [plugin, name] = row.command.slice(1).split(':');
    const hint = read(`${plugin}/skills/${name}/SKILL.md`).match(/^argument-hint: (.*)$/m)[1];
    return [row.command, /\benable\b/.test(hint) && /\bdisable\b/.test(hint)];
  });
  assert.deepEqual(hints, hints.map(([command]) => [command, true]), 'a -setup skill without enable+disable is a defect');
});

test('GIVEN the shipped hooks WHEN reading the enabled gate THEN absent-key polarity matches Phase 1b opt-in/opt-out rows', () => {
  const gates = {
    6: ['brewtools/skills/agent-deadline-setup/assets/agent-deadline-guard.mjs', 'cfg.enabled !== true'],
    11: ['brewtools/skills/agent-return-setup/assets/agent-return-budget.mjs', 'CONFIG.enabled === true'],
    7: ['brewtools/skills/agent-router-setup/assets/agent-router.mjs', 'raw.enabled === false'],
    10: ['brewdoc/skills/docsync-setup/assets/docsync-track.mjs', 'c.enabled !== false'],
    2: ['brewcode/skills/semble-setup/assets/semble-session.mjs', 'state.enabled === false'],
    8: ['brewtools/hooks/hardmode-guard.mjs', 'state.hard !== true'],
  };
  const found = Object.fromEntries(Object.entries(gates).map(([id, [file, gate]]) => [id, read(file).includes(gate)]));
  assert.deepEqual(found, { 2: true, 6: true, 7: true, 8: true, 10: true, 11: true },
    'each flag row\'s source gate must still read the polarity Phase 1b documents');
  assert.match(source, /\| 6, 11 \(opt-in\)[^\n]*\| live \| `disabled` \| `disabled`/, 'rows 6/11: no-key = disabled');
  assert.match(source, /\| 7, 10 \(opt-out\) \| live \| `disabled` \| live/, 'rows 7/10: no-key = live');
});

test('GIVEN the parking probe WHEN listing its entry files THEN every parking row\'s discovery file is probed', () => {
  const probed = [...parkProbe.matchAll(/\.claude\/[A-Za-z0-9_./*-]+\.md\b/g)].map(match => match[0]);
  assert.deepEqual([...new Set(probed)].sort(), [
    '.claude/agents/task-tracker.md', '.claude/rules/convention.md', '.claude/rules/tasks.md',
    '.claude/skills/memory-sync/SKILL.md', '.claude/skills/superreview/SKILL.md', '.claude/skills/task-board/SKILL.md',
    '.claude/skills/task-spec/SKILL.md', '.claude/teams/*/team.md',
  ], 'rows 1, 3, 4, 9, 12 entry files');
});

test('GIVEN mixed flag configs WHEN running the shipped flag probe THEN every config gets one explicit line', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-flags-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    '.claude/agent-deadline.json': '{}\n', '.claude/agent-return.json': '{ "enabled": true }\n',
    '.claude/docsync/config.json': '{"enabled": false}\n',
    '.claude/semble/state.json': '{"enabled": false, "phase": "disabled"}\n', '.claude/brewtools/manager/state.json': '{"hard": true}\n',
  };
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', flagProbe], {
    cwd: root, encoding: 'utf8', env: { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'cfg'), CLAUDE_PROJECT_DIR: root }, timeout: 10000,
  });
  const p = `${root}/.claude`, g = `${root}/cfg`, h = `${root}/home/.claude`;
  assert.deepEqual({ status: result.status, stdout: result.stdout.split('\n') }, { status: 0, stdout: [
    `agent-deadline ${p}/agent-deadline.json: no-key`, `agent-return ${p}/agent-return.json: "enabled":true`,
    `agent-deadline ABSENT ${g}/agent-deadline.json`, `agent-return ABSENT ${g}/agent-return.json`,
    `agent-deadline ABSENT ${h}/agent-deadline.json`, `agent-return ABSENT ${h}/agent-return.json`,
    `agent-deadline.json GOVERNING ${p}/agent-deadline.json`, `agent-return.json GOVERNING ${p}/agent-return.json`,
    'agent-router ABSENT .claude/brewtools/agent-router.json', 'docsync .claude/docsync/config.json: "enabled":false',
    '.claude/semble/state.json: "enabled":false "phase":"disabled" ', '.claude/brewtools/manager/state.json: "hard":true ',
    'OK', '',
  ] }, `flag probe output (stderr: ${result.stderr})`);
});

test('GIVEN the Phase 2b PAIRS heredoc WHEN resolving each plugin source THEN every asset exists and semble pairs equal the live HOOK_MJS', () => {
  const pairs = source.match(/<<'PAIRS'\n([\s\S]*?)\nPAIRS\n/)[1].split('\n').map(line => line.split('|'));
  const plugin = { BC: 'brewcode', BT: 'brewtools', BD: 'brewdoc' };
  const live = read('brewcode/skills/semble-setup/scripts/semble-guidance.sh').match(/^HOOK_MJS="([^"]+)"$/m)[1].split(' ');
  const actual = {
    missing: pairs.filter(([pl, , src]) => !existsSync(join(ROOT, plugin[pl], src))).map(([, , src]) => src),
    sembleHooks: pairs.map(([, dest]) => dest.match(/^\.claude\/hooks\/(semble-[a-z]+\.mjs)$/)?.[1]).filter(Boolean),
  };
  assert.deepEqual(actual, { missing: [], sembleHooks: live },
    'a PAIRS source with no plugin asset prints NOSRC; retired semble hooks belong to Phase 2c, never to PAIRS');
});
