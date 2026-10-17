#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const PLAN = join(STATUS_DIR, 'scripts', 'upgrade-plan.mjs');
const ROOTS = { brewcode: join(ROOT, 'brewcode'), brewtools: join(ROOT, 'brewtools'), brewdoc: join(ROOT, 'brewdoc') };
const ROOT_ARGS = Object.entries(ROOTS).flatMap(([plugin, dir]) => ['--root', `${plugin}=${dir}`]);
const ORDER = [11, 2, 12, 1, 7, 8, 6, 3, 4, 9, 10];
const STAGE = { 11: 1, 2: 2, 12: 3, 1: 4, 7: 5, 8: 5, 6: 5, 3: 5, 4: 6, 9: 7, 10: 7 };
const MODIFIED = 'modified: a hand edit or a missed re-copy, diff it first';
const CLASS_C = 'class C: an interview upgrade, run it yourself';
const FORCE = 'prescribes --force: your call';
const NO_DRIFT = 'disabled with no drift kind: diff it first';
// Roster row -> [command, class, scope or team token].
const ROSTER = {
  1: ['/brewcode:teams-setup', 'B', 'payments'], 2: ['/brewcode:semble-setup', 'A'], 3: ['/brewcode:superreview-setup', 'B'],
  4: ['/brewtools:task-board-setup', 'B'], 6: ['/brewtools:agent-deadline-setup', 'A', 'global'], 7: ['/brewtools:agent-router-setup', 'A'],
  8: ['/brewtools:manager-setup', 'A'], 9: ['/brewdoc:memory-sync-setup', 'B'], 10: ['/brewdoc:docsync-setup', 'A'],
  11: ['/brewtools:agent-return-setup', 'A', 'project'], 12: ['/brewcode:convention-setup', 'C'],
};
// Literal expectation per auto row for ROSTER's default input: [setup, model, global, brief ID, brief ARGUMENTS]; B owners all carry `model: opus`.
const WANT = {
  1: ['brewcode:teams-setup', 'opus', false, 'brewcode:teams-setup team=payments', 'upgrade payments --unattended'],
  2: ['brewcode:semble-setup', 'sonnet', false, 'brewcode:semble-setup', 'upgrade --unattended'],
  3: ['brewcode:superreview-setup', 'opus', false, 'brewcode:superreview-setup', 'upgrade --unattended'],
  4: ['brewtools:task-board-setup', 'opus', false, 'brewtools:task-board-setup', 'upgrade --unattended'],
  6: ['brewtools:agent-deadline-setup', 'sonnet', true, 'brewtools:agent-deadline-setup scope=global', 'upgrade global --unattended'],
  7: ['brewtools:agent-router-setup', 'sonnet', false, 'brewtools:agent-router-setup', 'upgrade --unattended'],
  8: ['brewtools:manager-setup', 'sonnet', false, 'brewtools:manager-setup', 'upgrade --unattended'],
  9: ['brewdoc:memory-sync-setup', 'opus', false, 'brewdoc:memory-sync-setup', 'upgrade --unattended'],
  10: ['brewdoc:docsync-setup', 'sonnet', false, 'brewdoc:docsync-setup', 'upgrade --unattended'],
  11: ['brewtools:agent-return-setup', 'sonnet', false, 'brewtools:agent-return-setup scope=project', 'upgrade project --unattended'],
};
const STALE = 'stale (installed 6.5.0, plugin 6.9.6)';
const SEMBLE_FORCE = 'none, the user decides: review `diff -u rule tpl`; replace: `/brewcode:semble-setup upgrade --force` (backs up rule.bak.<epoch> first)';

function row(id, extra = {}) {
  const [setup, cls, token] = ROSTER[id];
  const place = [6, 11].includes(id) ? { scope: token } : id === 1 ? { team: token } : {};
  return { row: id, setup, ...place, class: cls, state: STALE, before: '6.5.0', plugin: '6.9.6', command: `${setup} upgrade "re-copy"`, ...extra };
}

function plan(rows, ...args) {
  const r = spawnSync('node', [PLAN, ...args], { input: typeof rows === 'string' ? rows : JSON.stringify(rows), encoding: 'utf8', timeout: 10000 });
  return { rc: r.status, out: r.status === 0 ? JSON.parse(r.stdout) : r.stdout, err: r.stderr };
}

function auto(id, extra = {}, [global, ID, ARGUMENTS] = WANT[id].slice(2)) {
  const r = row(id, extra);
  const [plugin, skill] = WANT[id][0].split(':');
  const dir = join(ROOTS[plugin], 'skills', skill);
  return { row: id, stage: STAGE[id], setup: WANT[id][0], class: r.class, state: r.state, before: r.before, plugin: r.plugin, command: r.command, global, model: WANT[id][1],
    brief: { ID, SKILL: join(dir, 'SKILL.md'), CLAUDE_SKILL_DIR: dir, CLAUDE_PLUGIN_ROOT: ROOTS[plugin], ARGUMENTS } };
}

function manual(id, reason, extra = {}) {
  const r = row(id, extra);
  return { row: id, stage: STAGE[id], setup: r.setup.slice(1), class: r.class, state: r.state, before: r.before, plugin: r.plugin, command: r.command, reason };
}

const ALL = [10, 9, 4, 3, 6, 8, 7, 1, 12, 2, 11].map(id => row(id));

test('GIVEN all 11 rows stale in reverse order WHEN planning THEN auto runs in stage order with sonnet for A and the owner model for B', () => {
  const ran = ORDER.filter(id => id !== 12);
  assert.deepEqual(plan(ALL, ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: ran.map(id => auto(id)),
    manual: [manual(12, CLASS_C)],
    counts: { auto: 10, quick: 6, long: 4, manual: 1 },
  } }, 'stage order 11,2,12,1,7,8,6,3,4,9,10; class C never runs; every row carries its run-list stage; ID/ARGUMENTS carry the scope or team token');
});

test('GIVEN rows needing no command WHEN planning THEN they drop out, while a restamp-pending row and a keep-disabled behind-drift upgrade run', () => {
  const keep = '/brewtools:agent-return-setup upgrade project "re-copy, keep disabled"';
  const rows = [
    row(2, { state: 'n/a', command: 'claude plugin install brewcode@claude-brewcode' }), row(3, { state: 'missing', command: '/brewcode:superreview-setup install' }),
    row(4, { state: 'version unknown (plugin asset missing)' }), row(7, { state: 'current', command: '/brewtools:agent-router-setup status' }),
    row(9, { state: 'current (custom)', command: '/brewdoc:memory-sync-setup status' }),
    row(10, { state: 'disabled', command: '/brewdoc:docsync-setup enable' }), row(6, { state: 'disabled', command: '/brewtools:agent-deadline-setup status' }),
    row(1, { state: 'disabled', command: '', drift: null }),
    row(8, { state: 'current (restamp pending)', command: '/brewtools:manager-setup status' }),
    row(11, { state: 'disabled', drift: 'behind', command: keep }),
  ];
  assert.deepEqual(plan(rows, ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [auto(11, { state: 'disabled', command: keep }), auto(8, { state: 'current (restamp pending)', command: '/brewtools:manager-setup status' })],
    manual: [], counts: { auto: 2, quick: 2, long: 0, manual: 0 },
  } }, 'n/a, missing, version unknown, current*, and clean disabled (enable/status/empty) drop; restamp and disabled+behind+upgrade run');
});

test('GIVEN one row per manual rule WHEN planning THEN each lands in manual with its exact reason string', () => {
  const cases = [
    [12, {}, CLASS_C],
    [10, { state: 'modified (stamp current, bytes differ)' }, MODIFIED],
    [7, { state: 'stale (custom)', command: '/brewtools:agent-router-setup status' }, 'custom registration: report-only, your call'],
    [3, { state: 'disabled', drift: 'behind', command: '/brewcode:superreview-setup enable, then /brewcode:superreview-setup upgrade "x", then /brewcode:superreview-setup disable' },
      'parked: enable, upgrade and disable run by hand'],
    [2, { state: 'partial', command: '/brewcode:semble-setup upgrade --force' }, FORCE],
    [4, { state: 'partial', command: '/brewtools:task-board-setup install' }, 'prescribes install'],
    [8, { command: 'diff -u .claude/brewtools/manager/hardmode-guard.mjs the-asset' }, 'prescribes none'],
    [6, { scope: undefined }, 'no scope token'],
    [11, { scope: 'local' }, 'no scope token'],
    [1, { team: '-rf' }, 'no team name'],
  ];
  const rows = cases.map(([id, extra]) => row(id, extra));
  assert.deepEqual(plan(rows, ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [], manual: [11, 2, 12, 1, 7, 8, 6, 3, 4, 10].map(id => cases.find(c => c[0] === id)).map(([id, extra, reason]) => manual(id, reason, extra)),
    counts: { auto: 0, quick: 0, long: 0, manual: 10 },
  } }, 'first matching rule wins; manual keeps stage order and carries the run-list stage');
});

test('GIVEN disabled rows WHEN planning THEN only behind drift on a keeps-disabled upgrade runs and every other disabled row stays visible in manual', () => {
  const keep = '/brewtools:agent-deadline-setup upgrade global "re-copy both hooks; keep it disabled"';
  const chain = '/brewcode:teams-setup enable payments, then /brewcode:teams-setup upgrade payments, then /brewcode:teams-setup disable payments';
  const cases = [
    [2, { state: 'disabled', drift: 'behind', command: SEMBLE_FORCE }, FORCE],
    [2, { state: 'disabled', drift: 'differs', command: SEMBLE_FORCE }, FORCE],
    [2, { state: 'disabled', command: SEMBLE_FORCE }, FORCE],
    [1, { state: 'disabled', drift: 'differs', command: chain }, MODIFIED],
    [7, { state: 'disabled', drift: 'differs', command: '/brewtools:agent-router-setup upgrade "agent-router.mjs; keep it disabled"' }, MODIFIED],
    [8, { state: 'disabled', command: '/brewtools:manager-setup upgrade "guard; keep the wall disarmed"' }, NO_DRIFT],
    [8, { state: 'disabled', command: '/brewtools:manager-setup enable --force' }, FORCE],
    [10, { state: 'disabled', drift: 'behind', command: '/brewdoc:docsync-setup enable' }, 'prescribes enable'],
  ];
  const rows = [...cases.map(([id, extra]) => row(id, extra)), row(6, { state: 'disabled', drift: 'behind', command: keep })];
  assert.deepEqual(plan(rows, ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [auto(6, { state: 'disabled', command: keep })],
    manual: cases.map(([id, extra, reason]) => manual(id, reason, extra)),
    counts: { auto: 1, quick: 1, long: 0, manual: 8 },
  } }, 'a DIFFERS-only drift is a hand edit (never auto, even over a chain); a --force Command is never dropped or run; a drift row never drops; no drift kind fails closed');
});

test('GIVEN row 7 with a scope and row 2 with a team WHEN planning THEN both keep a bare ID and ARGUMENTS upgrade --unattended', () => {
  assert.deepEqual(plan([row(2, { team: 'payments' }), row(7, { scope: 'global' })], ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [auto(2), auto(7)], manual: [], counts: { auto: 2, quick: 2, long: 0, manual: 0 },
  } }, 'the scope/team tag follows the row id (6, 11 scope; 1 team), never the presence of a field; global stays false for row 7');
});

test('GIVEN two stale teams and both scopes of rows 6 and 11 WHEN planning THEN every object gets its own auto row in input order within a stage', () => {
  const up = (setup, token, tail) => `${setup} upgrade ${token} "${tail}"`;
  const rows = [
    row(6, { scope: 'global', command: up('/brewtools:agent-deadline-setup', 'global', 're-copy both hooks') }),
    row(1, { team: 'global', command: up('/brewcode:teams-setup', 'global', 're-copy trace-ops.sh') }),
    row(11, { scope: 'project', command: up('/brewtools:agent-return-setup', 'project', 're-copy the three hooks') }),
    row(6, { scope: 'project', command: up('/brewtools:agent-deadline-setup', 'project', 're-copy both hooks') }),
    row(1, { team: 'payments', command: up('/brewcode:teams-setup', 'payments', 're-copy trace-ops.sh') }),
    row(11, { scope: 'global', command: up('/brewtools:agent-return-setup', 'global', 're-copy the three hooks') }),
  ];
  assert.deepEqual(plan(rows, ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [
      auto(11, { scope: 'project', command: '/brewtools:agent-return-setup upgrade project "re-copy the three hooks"' },
        [false, 'brewtools:agent-return-setup scope=project', 'upgrade project --unattended']),
      auto(11, { scope: 'global', command: '/brewtools:agent-return-setup upgrade global "re-copy the three hooks"' },
        [true, 'brewtools:agent-return-setup scope=global', 'upgrade global --unattended']),
      auto(1, { team: 'global', command: '/brewcode:teams-setup upgrade global "re-copy trace-ops.sh"' },
        [false, 'brewcode:teams-setup team=global', 'upgrade global --unattended']),
      auto(1, { team: 'payments', command: '/brewcode:teams-setup upgrade payments "re-copy trace-ops.sh"' },
        [false, 'brewcode:teams-setup team=payments', 'upgrade payments --unattended']),
      auto(6, { scope: 'global', command: '/brewtools:agent-deadline-setup upgrade global "re-copy both hooks"' },
        [true, 'brewtools:agent-deadline-setup scope=global', 'upgrade global --unattended']),
      auto(6, { scope: 'project', command: '/brewtools:agent-deadline-setup upgrade project "re-copy both hooks"' },
        [false, 'brewtools:agent-deadline-setup scope=project', 'upgrade project --unattended']),
    ],
    manual: [], counts: { auto: 6, quick: 4, long: 2, manual: 0 },
  } }, 'a repeated row id is kept per team/scope, in input order; none merges or vanishes; a team named global is not the global scope');
});

test('GIVEN a scoped row with no scope field WHEN its Command names the scope after upgrade THEN the Command supplies it', () => {
  const command = '/brewtools:agent-deadline-setup upgrade project "re-copy both hooks"';
  assert.deepEqual(plan([row(6, { scope: undefined, command })], ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [auto(6, { command }, [false, 'brewtools:agent-deadline-setup scope=project', 'upgrade project --unattended'])],
    manual: [], counts: { auto: 1, quick: 1, long: 0, manual: 0 },
  } }, 'Command word `project` -> scope=project, global false');
});

test('GIVEN --quick WHEN planning all stale rows THEN only class A runs and class B goes manual as a long run', () => {
  const B = 'quick run: class B is a long run';
  assert.deepEqual(plan(ALL, '--quick', ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [11, 2, 7, 8, 6, 10].map(id => auto(id)),
    manual: [manual(12, CLASS_C), ...[1, 3, 4, 9].map(id => manual(id, B))],
    counts: { auto: 6, quick: 6, long: 0, manual: 5 },
  } }, 'Q1 "Only the quick ones (K)" re-plans with --quick');
});

test('GIVEN --spawn-depth 1 WHEN planning THEN rows 4, 6, 7 and 11 go manual because their owners delegate', () => {
  const D = 'spawn depth 1: this owner delegates to a subagent';
  assert.deepEqual(plan(ALL, '--spawn-depth', '1', ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [2, 1, 8, 3, 9, 10].map(id => auto(id)),
    manual: [manual(11, D), manual(12, CLASS_C), manual(7, D), manual(6, D), manual(4, D)],
    counts: { auto: 6, quick: 3, long: 3, manual: 5 },
  } }, 'an upgrader at depth 1 cannot spawn hook-creator or the task-board analysts');
});

test('GIVEN --spawn-depth 0 WHEN planning THEN every row is manual, in stage order', () => {
  const Z = 'spawn depth 0: no subagent can run';
  assert.deepEqual(plan(ALL, '--spawn-depth', '0', ...ROOT_ARGS), { rc: 0, err: '', out: {
    auto: [], manual: ORDER.map(id => manual(id, id === 12 ? CLASS_C : Z)),
    counts: { auto: 0, quick: 0, long: 0, manual: 11 },
  } }, 'depth 0 = no upgrader can be spawned at all');
});

test('GIVEN bad stdin, a bad field or a missing --root WHEN planning THEN rc 1 with one stderr line and no stdout', () => {
  const rc1 = [
    [plan('not json', ...ROOT_ARGS), /^upgrade-plan: stdin is not JSON: .+\n$/],
    [plan('{"row":6}', ...ROOT_ARGS), /^upgrade-plan: stdin must be a JSON array\n$/],
    [plan([row(6), { ...row(2), row: 5 }], ...ROOT_ARGS), /^upgrade-plan: row 1: needs row \(roster id\), setup, state, class A\|B\|C\n$/],
    [plan([{ ...row(2), class: 'D' }], ...ROOT_ARGS), /^upgrade-plan: row 0: needs row \(roster id\), setup, state, class A\|B\|C\n$/],
    [plan([row(2, { command: 7 })], ...ROOT_ARGS), /^upgrade-plan: row 0: command must be a string\n$/],
    [plan([row(11, { state: 'disabled', drift: 'Behind' })], ...ROOT_ARGS), /^upgrade-plan: row 0: drift must be behind\|differs\n$/],
    [plan([row(11, { scope: 'project', command: '/brewtools:agent-return-setup upgrade global "x"' })], ...ROOT_ARGS),
      /^upgrade-plan: row 0: scope project != Command scope global\n$/],
    [plan([row(1, { team: 'payments', command: '/brewcode:teams-setup upgrade billing "x"' })], ...ROOT_ARGS),
      /^upgrade-plan: row 0: team payments != Command team billing\n$/],
    [plan([row(10)], '--root', `brewcode=${ROOTS.brewcode}`), /^upgrade-plan: no --root for brewdoc \(row 10\)\n$/],
  ];
  assert.deepEqual(rc1.map(([r, re]) => [r.rc, r.out, re.test(r.err)]), rc1.map(() => [1, '', true]),
    `rc 1 = bad JSON, row or field, a Command that names another scope/team, or an auto row whose plugin has no --root (stderr: ${rc1.map(([r]) => r.err).join(' | ')})`);
});

test('GIVEN a bad argument WHEN planning THEN rc 2 with the usage line', () => {
  const usage = arg => `upgrade-plan: bad argument ${arg}; usage: [--quick] [--spawn-depth N] [--root <plugin>=<dir>]...\n`;
  const runs = [['--bogus'], ['--spawn-depth', 'x'], ['--root', 'brewcode'], ['--spawn-depth']];
  assert.deepEqual(runs.map(args => { const r = plan([row(2)], ...args); return [r.rc, r.out, r.err]; }),
    [[2, '', usage('--bogus')], [2, '', usage('--spawn-depth')], [2, '', usage('--root')], [2, '', usage('--spawn-depth')]],
    'rc 2 = usage error, before stdin is read');
});
