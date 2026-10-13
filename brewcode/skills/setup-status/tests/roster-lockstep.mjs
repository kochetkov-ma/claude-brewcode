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
const source = ['SKILL.md', 'references/phase1-probes.md', 'references/phase2-stamps.md', 'references/task-tools-offer.md']
  .map(f => readFileSync(join(STATUS_DIR, f), 'utf8')).join('\n');
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
    `agent-deadline.json CLIMB-START ${root}`, `agent-deadline.json GOVERNING ${p}/agent-deadline.json`,
    `agent-return.json CLIMB-START ${root}`, `agent-return.json GOVERNING ${p}/agent-return.json`,
    'agent-router ABSENT .claude/brewtools/agent-router.json', 'docsync .claude/docsync/config.json: "enabled":false',
    '.claude/semble/state.json: "enabled":false "phase":"disabled" ', '.claude/brewtools/manager/state.json: "hard":true ',
    'OK', '',
  ] }, `flag probe output (stderr: ${result.stderr})`);
});

test('GIVEN configs only in an ancestor of the session dir WHEN running the flag probe THEN GOVERNING names the file each guard loads', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-climb-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const top = join(root, 'top'), parent = join(top, 'a'), session = join(parent, 'sub'), tmp = join(root, 'tmp'), cfg = join(root, 'cfg');
  for (const dir of [join(parent, '.claude'), join(session, '.claude'), tmp, cfg]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(parent, '.claude', 'agent-deadline.json'), JSON.stringify({ enabled: true, defaultMinutes: 9 }));
  writeFileSync(join(parent, '.claude', 'agent-return.json'), JSON.stringify({ enabled: true, passTokens: 1111 }));
  writeFileSync(join(cfg, 'agent-deadline.json'), JSON.stringify({ enabled: true, defaultMinutes: 30 }));
  writeFileSync(join(cfg, 'agent-return.json'), JSON.stringify({ enabled: true, passTokens: 2222 }));
  const env = { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: cfg, CLAUDE_PROJECT_DIR: session, TMPDIR: tmp, PWD: session };
  const probe = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', flagProbe], { cwd: session, encoding: 'utf8', env, timeout: 10000 });
  const assets = join(ROOT, 'brewtools', 'skills');
  const payload = JSON.stringify({ session_id: 'CLIMB', cwd: session, hook_event_name: 'PreToolUse', agent_id: 'C1', agent_type: 'developer', tool_name: 'Bash', tool_input: {} });
  const guard = spawnSync('node', [join(assets, 'agent-deadline-setup', 'assets', 'agent-deadline-guard.mjs')], { input: payload, cwd: session, env, encoding: 'utf8', timeout: 10000 });
  const contract = spawnSync('node', [join(assets, 'agent-return-setup', 'assets', 'agent-return-contract.mjs')], { input: '{}', cwd: session, env, encoding: 'utf8', timeout: 10000 });
  const deadlineState = join(tmp, 'brewtools-agent-deadline', 'CLIMB', 'C1.json');
  const actual = {
    status: probe.status,
    governing: probe.stdout.split('\n').filter(line => line.includes(' GOVERNING ')),
    deadlineGuardLoads: existsSync(deadlineState) ? JSON.parse(readFileSync(deadlineState, 'utf8')).config : `NO STATE: ${guard.stderr}`,
    returnHookBudget: contract.stdout.match(/Keep it under ~\d+ tokens/)?.[0] ?? `NO BUDGET: ${contract.stderr}`,
  };
  assert.deepEqual(actual, {
    status: 0,
    governing: [`agent-deadline.json GOVERNING ${parent}/.claude/agent-deadline.json`, `agent-return.json GOVERNING ${parent}/.claude/agent-return.json`],
    deadlineGuardLoads: `${parent}/.claude/agent-deadline.json`,
    returnHookBudget: 'Keep it under ~1111 tokens',
  }, `gov() climbs like loadConfig, never only $PWD/.claude (stderr: ${probe.stderr})`);
});

test('GIVEN a session dir above the shell cwd WHEN running the flag probe THEN row 6 climbs from the cwd and row 11 from the session dir', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-cwd-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const session = join(root, 'top'), parent = join(session, 'a'), cwd = join(parent, 'sub'), cfg = join(root, 'cfg');
  for (const dir of [join(session, '.claude'), join(parent, '.claude'), cwd, cfg]) mkdirSync(dir, { recursive: true });
  for (const name of ['agent-deadline.json', 'agent-return.json']) {
    writeFileSync(join(parent, '.claude', name), '{"enabled":true}');
    writeFileSync(join(cfg, name), '{"enabled":true}');
  }
  const probe = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', flagProbe], {
    cwd, encoding: 'utf8', env: { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: cfg, CLAUDE_PROJECT_DIR: session, PWD: cwd }, timeout: 10000,
  });
  assert.deepEqual([probe.status, probe.stdout.split('\n').filter(line => line.includes(' GOVERNING '))], [0, [
    `agent-deadline.json GOVERNING ${parent}/.claude/agent-deadline.json`, `agent-return.json GOVERNING ${cfg}/agent-return.json`,
  ]], `deadline guard reads payload cwd, agent-return hooks read CLAUDE_PROJECT_DIR (stderr: ${probe.stderr})`);
});

test('GIVEN HOME with a profile .claude and a marker-less cwd below it WHEN running the flag probe without CLAUDE_PROJECT_DIR THEN row 11 climbs from the cwd, never HOME', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-home-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'), cwd = join(home, 'notes', 'misc'), prof = join(root, 'prof'), profCwd = join(prof, 'work');
  for (const dir of [join(home, '.claude'), cwd, join(prof, '.claude'), profCwd]) mkdirSync(dir, { recursive: true });
  const run = (dir, cfg) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', flagProbe], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: cfg, CLAUDE_PROJECT_DIR: '', PWD: dir }, timeout: 10000,
  });
  const climbs = r => [r.status, r.stdout.split('\n').filter(line => line.startsWith('agent-return.json CLIMB-START '))];
  assert.deepEqual({ home: climbs(run(cwd, '')), profileParent: climbs(run(profCwd, join(prof, '.claude'))) }, {
    home: [0, [`agent-return.json CLIMB-START ${cwd}`]],
    profileParent: [0, [`agent-return.json CLIMB-START ${profCwd}`]],
  }, 'policy P4: the .git/.claude walk skips HOME and the active config dir parent, as agent-return-budget projectRoot()');
});

test('GIVEN an orphan project config WHEN reading rows 6/11 notes and both owning skills THEN the fix is purge project, never upgrade', () => {
  const notes = read('brewcode/skills/setup-status/references/row-notes.md');
  const orphan = notes.slice(notes.indexOf('## Rows 6 and 11')).split('\n').find(line => line.startsWith('- Orphan config:')) ?? 'NO ORPHAN NOTE';
  const owners = ['agent-deadline-setup', 'agent-return-setup'].map(name => read(`brewtools/skills/${name}/SKILL.md`))
    .map(skill => [skill.includes('orphan_config=$ORPHAN'), skill.includes('never for a scope with `orphan_config=yes`')]);
  assert.deepEqual([orphan.includes('purge project'), orphan.includes('Never `upgrade`'), owners],
    [true, true, [[true, true], [true, true]]], 'orphan config routes to purge project in setup-status and in both owning status probes');
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

test('GIVEN absolute-path hook rows as the whole row 2 wiring signal WHEN reading Phase 2c, row-notes Row 2 and semble-setup THEN each prescribes upgrade ahead of the install fallback', () => {
  const PAIR = ['`staleEntries == absoluteCount`', '`wiredCount + absoluteCount == wantCount`'];
  const row = lines.find(line => line.startsWith('| `guidance`:')) ?? 'NO GUIDANCE ROW';
  const clauses = row.split('|')[2].split('; otherwise ').map(clause =>
    [clause.match(/`(retired|absoluteCount|staleEntries)`/)?.[1], clause.match(/prescribing `(\w+)`/)?.[1]]);
  const absClause = row.split('; otherwise ').find(clause => clause.startsWith('`absoluteCount`')) ?? '';
  const notes = read('brewcode/skills/setup-status/references/row-notes.md').split('\n')
    .find(line => line.startsWith('- Absolute-path hook rows')) ?? '';
  const ladder = read('brewcode/skills/semble-setup/SKILL.md').split('\n').find(line => line.startsWith('> `partial` -> `.nextStep`:')) ?? '';
  const actual = {
    fieldListed: row.split('|')[1].includes('`absoluteCount`'),
    clauses,
    absPair: PAIR.map(cond => absClause.includes(cond)),
    notesPair: [...PAIR.map(cond => notes.includes(cond.replace(' == ', '` == `').replace(' + ', '` + `'))), notes.includes('Command `upgrade`')],
    sembleLadder: /only absolute-path hook rows \(`\.guidance\.absoluteCount`[^;]*-> `upgrade`/.test(ladder),
  };
  assert.deepEqual(actual, {
    fieldListed: true,
    clauses: [['retired', 'upgrade'], ['absoluteCount', 'upgrade'], ['staleEntries', 'install']],
    absPair: [true, true], notesPair: [true, true, true], sembleLadder: true,
  }, 'absolute-only drift -> upgrade from the counts (never nextStep), in setup-status, its row notes and the semble ladder');
});
