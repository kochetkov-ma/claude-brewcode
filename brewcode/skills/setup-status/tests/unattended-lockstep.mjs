#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');
const STATUS = 'brewcode/skills/setup-status';
const FLOW = read(`${STATUS}/references/update-flow.md`);
const RUNNER = read(`${STATUS}/references/upgrade-runner.md`);
const BLOCK = (FLOW.split('## 6. Unattended block', 2)[1] ?? '').match(/```md\n([\s\S]*?)\n```/)?.[1] ?? 'NO CANONICAL BLOCK';
const GRAMMAR = new RegExp((FLOW.split('## 4. Plans and the RESULT grammar', 2)[1] ?? '').match(/```text\n(\^RESULT [^\n]*)\n```/)?.[1] ?? '^NO GRAMMAR$');
const BOLD = '**Unattended (';

const roster = read(`${STATUS}/SKILL.md`).split('\n').filter(line => /^\| \d+ \| `\/brew/.test(line))
  .map(line => line.split('|').map(cell => cell.trim()))
  .map(cells => ({ dir: cells[2].replace(/^`\/([a-z]+):([a-z-]+)`$/, '$1/skills/$2'), cls: cells.at(-2) }));
const OWNERS = roster.filter(row => row.cls !== 'C').map(row => row.dir);
const INTERVIEW = roster.filter(row => row.cls === 'C').map(row => row.dir);

// Where the block sits: under its owner's upgrade heading, or (no heading) 2 lines below the line starting `upgrade` asks nothing.
const ASKS_NOTHING = { line: '`upgrade` asks nothing', offset: 2 };
const ANCHORS = {
  'brewcode/skills/teams-setup': { heading: '## Mode: UPGRADE (self-reflection)' },
  'brewcode/skills/semble-setup': { heading: '### `upgrade`' },
  'brewcode/skills/superreview-setup': { heading: '### Phase 2b — Already installed? `upgrade`, never re-emit' },
  'brewtools/skills/task-board-setup': { heading: '## PU: Upgrade mode  (retrofit onto a deployed board)' },
  'brewtools/skills/agent-deadline-setup': ASKS_NOTHING,
  'brewtools/skills/agent-router-setup': ASKS_NOTHING,
  'brewtools/skills/manager-setup': { heading: '### upgrade  (re-emit the guard from the current plugin version — arm state kept, provenance restamped)' },
  'brewdoc/skills/memory-sync-setup': { heading: '### Mode: upgrade' },
  'brewdoc/skills/docsync-setup': { heading: '## Mode: upgrade' },
  'brewtools/skills/agent-return-setup': ASKS_NOTHING,
};

function blockStarts(lines) {
  const want = BLOCK.split('\n');
  return lines.map((_, i) => i).filter(i => want.every((line, k) => lines[i + k] === line));
}

function headingAbove(lines, index) {
  let fence = false, heading = 'NO HEADING';
  lines.slice(0, index).forEach(line => {
    if (/^\s*```/.test(line)) fence = !fence;
    else if (!fence && /^#{1,6} /.test(line)) heading = line;
  });
  return heading;
}

function placement(dir) {
  const lines = read(`${dir}/SKILL.md`).split('\n');
  const starts = blockStarts(lines);
  const anchor = ANCHORS[dir] ?? {};
  const at = starts[0] ?? 0;
  const where = anchor.heading ? { under: headingAbove(lines, at) }
    : { above: (lines[at - (anchor.offset ?? 0)] ?? '').slice(0, (anchor.line ?? '').length), offset: anchor.offset };
  return { count: starts.length, ...where };
}

function expectedPlacement(dir) {
  const anchor = ANCHORS[dir];
  return { count: 1, ...(anchor.heading ? { under: anchor.heading } : { above: anchor.line, offset: anchor.offset }) };
}

test('GIVEN roster classes A and B WHEN reading each owner SKILL.md THEN the canonical block sits byte-exact once in its upgrade section', () => {
  assert.deepEqual({
    owners: [...OWNERS].sort(), interview: INTERVIEW, blockLines: BLOCK.split('\n').length,
    placement: Object.fromEntries(OWNERS.map(dir => [dir, placement(dir)])),
  }, {
    owners: Object.keys(ANCHORS).sort(), interview: ['brewcode/skills/convention-setup'], blockLines: 8,
    placement: Object.fromEntries(OWNERS.map(dir => [dir, expectedPlacement(dir)])),
  }, 'update-flow.md §6 block, copied once, after the upgrade heading (trio: 2 lines below "`upgrade` asks nothing")');
});

test('GIVEN every shipped SKILL.md WHEN looking for the Unattended block THEN only the 10 A/B owners carry it and convention-setup lacks it', () => {
  const carriers = ['brewcode', 'brewdoc', 'brewtools', 'brewui'].flatMap(plugin =>
    readdirSync(join(ROOT, plugin, 'skills')).map(name => `${plugin}/skills/${name}`))
    .filter(dir => existsSync(join(ROOT, dir, 'SKILL.md')) && read(`${dir}/SKILL.md`).includes(BOLD));
  const convention = read('brewcode/skills/convention-setup/SKILL.md');
  assert.deepEqual({ carriers: carriers.sort(), convention: [blockStarts(convention.split('\n')).length, convention.includes(BOLD)] },
    { carriers: Object.keys(ANCHORS).sort(), convention: [0, false] },
    'class C (interview) is never run unattended, so its owner must not advertise the block');
});

test('GIVEN each owner frontmatter WHEN reading argument-hint THEN the 10 A/B owners list [--unattended] and convention-setup does not', () => {
  const hint = dir => (read(`${dir}/SKILL.md`).match(/^argument-hint: (.*)$/m) ?? ['', ''])[1];
  const actual = Object.fromEntries([...OWNERS, ...INTERVIEW].map(dir => [dir, hint(dir).includes('[--unattended]')]));
  assert.deepEqual(actual, Object.fromEntries([...OWNERS.map(dir => [dir, true]), ...INTERVIEW.map(dir => [dir, false])]),
    'the flag is a documented prompt token on every owner setup-status may run');
});

const FILL = [['<ok|partial|skipped|failed>', 'partial'], ['<id>', 'brewtools:agent-return-setup scope=global'],
  ['<ID>', 'brewcode:teams-setup team=payments'], ['<name>', 'payments'], ['<before>', '6.9.4'], ['<after>', '6.10.0'], ['<n>', '2']];
const SAMPLE = /RESULT (?:ok|partial|skipped|failed|<ok\|partial\|skipped\|failed>) [^`\n]*/g;

test('GIVEN every RESULT sample in the owners, the runner and the agent WHEN placeholders are filled THEN each matches the update-flow.md §4 grammar', () => {
  const refs = dir => (existsSync(join(ROOT, dir, 'references')) ? readdirSync(join(ROOT, dir, 'references')) : [])
    .filter(name => name.endsWith('.md')).map(name => `${dir}/references/${name}`);
  const files = [...OWNERS.flatMap(dir => [`${dir}/SKILL.md`, ...refs(dir)]),
    `${STATUS}/SKILL.md`, `${STATUS}/references/upgrade-runner.md`, 'brewcode/agents/setup-upgrader.md'];
  const found = files.map(file => [file, [...read(file).matchAll(SAMPLE)].map(match => match[0])]).filter(([, samples]) => samples.length);
  const fill = sample => FILL.reduce((text, [token, value]) => text.replaceAll(token, value), sample);
  const bad = Object.fromEntries(found.map(([file, samples]) => [file, samples.filter(s => !GRAMMAR.test(fill(s)))]));
  const control = ['RESULT ok brewcode:teams-setup team=payments cv=6.9.4->6.10.0 pending=0 note="tuning not run"',
    'RESULT done brewcode:teams-setup cv=6.9.4->? pending=0 note="x"', 'RESULT ok brewcode:teams-setup cv=6.9->? pending=0 note="x"'];
  assert.deepEqual({ bad, control: control.map(line => GRAMMAR.test(line)) }, {
    bad: Object.fromEntries([...OWNERS.map(dir => `${dir}/SKILL.md`), `${STATUS}/references/upgrade-runner.md`,
      'brewcode/agents/setup-upgrader.md'].map(file => [file, []])),
    control: [true, false, false],
  }, 'runner parses every RESULT line with the update-flow.md §4 regex: a sample off it is a broken contract');
});

// Only the settings files are common; runtime files are skipped inside scope-guard.sh (its SKIP list), for every gate alike.
const COMMON = ['.claude/settings.json', '.claude/settings.local.json'];

test('GIVEN the owners with a Scope rule WHEN reading upgrade-runner.md section 4 THEN each row owns every path its Scope rule names', () => {
  const OWNER_ROWS = { 'brewcode/skills/teams-setup': '1 teams', 'brewcode/skills/superreview-setup': '3 superreview',
    'brewtools/skills/task-board-setup': '4 task-board', 'brewdoc/skills/memory-sync-setup': '9 memory-sync' };
  const ticks = text => [...text.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const table = RUNNER.split('## 4. Owned prefixes per row', 2)[1] ?? '';
  const owned = row => ticks((table.split('\n').find(line => line.startsWith(`| ${row} |`)) ?? '').split('|')[2] ?? '');
  const scope = dir => {
    const rule = read(`${dir}/SKILL.md`).split('\n').find(line => line.includes('**Scope (normative):**')) ?? '';
    const items = (rule.split('owned paths: ', 2)[1] ?? '').split('. Any other change')[0].split(', ');
    return { unattended: items.filter(item => !item.includes('only after')).map(item => ticks(item)[0].replace('{TEAM_NAME}', '<team>')),
      interactiveOnly: items.filter(item => item.includes('only after')).map(item => ticks(item)[0]) };
  };
  const actual = Object.fromEntries(Object.entries(OWNER_ROWS).map(([dir, row]) => {
    const { unattended, interactiveOnly } = scope(dir);
    return [dir, { size: unattended.length, interactiveOnly, missing: unattended.filter(path => !owned(row).includes(path)) }];
  }));
  const common = ticks(RUNNER.split('## 3. Common prefixes', 2)[1]?.split('\n## ')[0] ?? '').filter(path => path.startsWith('.claude/'));
  const fence = (RUNNER.split('### 2c. After', 2)[1] ?? '').match(/```bash\n([\s\S]*?)\n```/)?.[1] ?? '';
  const checked = [...fence.matchAll(/"\$P(\.claude\/[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual({ actual, common, checked }, {
    actual: {
      'brewcode/skills/teams-setup': { size: 2, interactiveOnly: ['CLAUDE.md'], missing: [] },
      'brewcode/skills/superreview-setup': { size: 3, interactiveOnly: [], missing: [] },
      'brewtools/skills/task-board-setup': { size: 5, interactiveOnly: [], missing: [] },
      'brewdoc/skills/memory-sync-setup': { size: 1, interactiveOnly: [], missing: [] },
    },
    common: COMMON,
    checked: [...COMMON, ...owned('6 agent-deadline')],
  }, 'an owned path the runner omits makes its own upgrade an OUTSIDE stop; the check fence passes section 3, then its sample row 6, nothing else');
});

test('GIVEN --unattended before, between or after the mode and team WHEN teams detect-mode.sh parses THEN it reads upgrade of payments', t => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'unattended-detect-')));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const detect = args => {
    const r = spawnSync('sh', [join(ROOT, 'brewcode/skills/teams-setup/scripts/detect-mode.sh'), args], { cwd, encoding: 'utf8', timeout: 10000 });
    return [r.status, r.stdout.split('\n').filter(line => /^(MODE|TEAM_NAME|PROMPT|ERROR):/.test(line))];
  };
  const args = ['--unattended upgrade payments', 'upgrade payments --unattended', 'upgrade --unattended payments'];
  assert.deepEqual(Object.fromEntries(args.map(a => [a, detect(a)])),
    Object.fromEntries(args.map(a => [a, [0, ['MODE:upgrade', 'TEAM_NAME:payments']]])),
    'the flag is stripped before the positional parse: never a team named --unattended, never a prompt');
});
