#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { diff, guideVerdicts, loadData, offers, releaseNotes, staleGuides } from '../scripts/update-flow.mjs';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const SCRIPT = join(STATUS_DIR, 'scripts/update-flow.mjs');
const MD = readFileSync(join(STATUS_DIR, 'references/update-flow.md'), 'utf8');
const DATA = loadData();
const ID = name => `${name}@claude-brewcode`;
const row = (name, version, scope = 'user', projectPath = null) => ({ id: name.includes('@') ? name : ID(name), version, scope, projectPath });
const ALL = v => ({ 'brewmod-placeholders': v, 'brewmod-plan-effort': v, 'brewmod-reminders': v, brewcode: v, brewdoc: v, brewtools: v, brewui: v });
const MOVED = 'the codewords `++m`, `++a`, `++r`, `++rr` and `+++` now come from **brewmod-placeholders**, not from brewtools.';
const VALUES = { placeholders: '`++r` and other prompt blocks', planEffort: 'effort `xhigh` in plan mode', reminders: 'durable reminders that survive sessions',
  brewdoc: 'doc-staleness tracking, installation guides, Markdown to PDF, publishing', brewui: 'placeholder for future UI tools, no skills yet' };

const NOTES = `# Release Notes

---

## v2.3.0 (2026-01-06)

> Docs: [x](https://example.test/x)

**What changed for you**

❗ **Update Claude Code first:** newest requirement.

- c1
- c2
- c3
- c4

More: [notes](https://example.test/more)

### brewcode

- technical bullet, never shown

## v2.2.0 (2026-01-05)

**What changed for you**

❗ **Update Claude Code first:** older requirement.

- b1
- b2
- b3
- b4
- b5
Update: run the update.

**Migration:**

- m1
- m2

### brewtools

- technical

## v2.1.0 (2026-01-04)

**What changed for you**

- a1
- a2
- a3

## v2.0.2 (2026-01-03)

**What changed for you**

- d1
- d2

## v2.0.1 (2026-01-02)

> Docs: [y](https://example.test/y)

Fix-only patch: the summary line.

### brewdoc

- tech

---

## v2.0.0 (2026-01-01)

**What changed for you**

- z1
- z2
`;

const REPORT_NOTES = `## v6.9.6 (2026-10-16)

**What changed for you**

❗ **Update Claude Code first:** the mods need Claude Code 2.1.301 or newer.

- n1 newest
- n2

## v6.8.0 (2026-10-15)

**What changed for you**

❗ **Update Claude Code first:** older line.

- e1

**Migration:**

- mig1

## v6.7.1 (2026-10-15)

**What changed for you**

- old, excluded by the lower bound
`;

function tmp(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function put(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
}

function run(args, { cwd = ROOT, env = {}, script = SCRIPT } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, HOME: cwd, CLAUDE_CONFIG_DIR: join(cwd, 'no-profile'), ...env } });
  return { rc: r.status, stdout: r.stdout, stderr: r.stderr };
}

// One report scenario: before/after snapshots (after undefined = no file, a string = raw file body, a function = rows built from the project dir), latest.json, cc.txt, a project cwd with a stale guide.
function scenario(t, { before, after, cc = '2.1.301 (Claude Code)\n', autoUpdate = false, notes = REPORT_NOTES, versions = ALL('6.9.6') }) {
  const base = tmp(t, 'update-flow-report-');
  const dir = join(base, 'run');
  const notesPath = put(join(base, 'RELEASE-NOTES.md'), notes);
  const files = { 'before.json': before, ...(after === undefined ? {} : { 'after.json': after }),
    'latest.json': { versions, autoUpdate, installLocation: base, notes: notesPath }, 'cc.txt': cc };
  Object.entries(files).forEach(([name, body]) => put(join(dir, name), typeof body === 'function' ? body(base) : body));
  const guide = '.claude/brewdoc/my-claude/20261001_my-claude-internal.md';
  put(join(base, guide), '---\ndoc_type: user\nversion: "6.9.5"\n---\n# guide\n');
  put(join(base, '.claude/brewdoc/INDEX.jsonl'), `${JSON.stringify({ ts: '2026-10-01T10:00:00', mode: 'internal', path: guide, title: 'g', version: '1.0' })}\n`);
  return run(['report', dir], { cwd: base });
}

const BEFORE = [row('brewtools', '6.7.1'), row('brewcode', '6.7.1'), row('brewdoc', '6.9.6')];
const AFTER = [row('brewtools', '6.9.6'), row('brewcode', '6.9.6'), row('brewdoc', '6.9.6'), row('brewmod-placeholders', '6.9.6')];
// Default cc 2.1.301 meets the mods floor: no requirement line (P6).
const WHAT_CHANGED = `### What changed for you (6.7.1 → 6.9.6)

- **v6.8.0 migration:** mig1
- **v6.9.6:** n1 newest
- **v6.9.6:** n2
- **v6.8.0:** e1`;
const REFRESH = '🔵 **`/brewdoc:my-claude refresh`**: your installation guide `.claude/brewdoc/my-claude/20261001_my-claude-internal.md` is older than brewdoc **6.9.6**.';
const FULL = ['brewmod-placeholders', 'brewcode', 'brewdoc', 'brewtools', 'brewui'].map(n => row(n, '6.9.0'));
const OFFLINE = ALL('unknown');
const REMINDERS_OFFER = '🔵 **brewmod-reminders** is not installed (durable reminders that survive sessions): `claude plugin install brewmod-reminders@claude-brewcode`';
const PLAN_EFFORT_OFFER = '🔵 **brewmod-plan-effort** is not installed (effort `xhigh` in plan mode): `claude plugin install brewmod-plan-effort@claude-brewcode`';
const AUTO = '🔵 Auto-update is off for claude-brewcode: `/plugin` -> Marketplaces -> claude-brewcode -> **Enable auto-update**.';

test('GIVEN notes with blocks, a fallback section and a migration WHEN extracting (2.0.0, 2.3.0] THEN caps 3/10 apply newest first and ❗ is kept once', () => {
  const opts = { source: 'S', link: 'L', caps: DATA.caps };
  assert.deepEqual({ range: releaseNotes(NOTES, '2.0.0', '2.3.0', opts), fallback: releaseNotes(NOTES, '2.0.0', '2.0.1', opts) }, {
    range: {
      source: 'S', requirement: '**Update Claude Code first:** newest requirement.',
      migration: [{ version: '2.2.0', text: 'm1' }, { version: '2.2.0', text: 'm2' }],
      versions: [
        { version: '2.3.0', bullets: ['c1', 'c2', 'c3'], count: 4, fallback: false },
        { version: '2.2.0', bullets: ['b1', 'b2', 'b3'], count: 5, fallback: false },
        { version: '2.1.0', bullets: ['a1', 'a2', 'a3'], count: 3, fallback: false },
        { version: '2.0.2', bullets: ['d1'], count: 2, fallback: false },
        { version: '2.0.1', bullets: [], count: 1, fallback: true },
      ],
      hidden: 5, missing: false, link: 'L',
    },
    fallback: {
      source: 'S', requirement: null, migration: [],
      versions: [{ version: '2.0.1', bullets: ['Fix-only patch: the summary line.'], count: 1, fallback: true }], hidden: 0, missing: false, link: 'L',
    },
  }, 'block bullets stop at the first plain line, technical sections never leak, the lower bound is exclusive, caps hold');
});

test('GIVEN no notes file, a range past the file, an empty range or no installed version WHEN extracting THEN missing is set only when notes were due', () => {
  const opts = { source: 'S', link: 'L' };
  const none = { source: null, requirement: null, migration: [], versions: [], hidden: 0, missing: false, link: 'L' };
  assert.deepEqual({
    noFile: releaseNotes(null, '2.0.0', '2.3.0', opts), past: releaseNotes(NOTES, '2.3.0', '2.4.0', opts),
    empty: releaseNotes(NOTES, '2.3.0', '2.3.0', opts), nothingInstalled: releaseNotes(NOTES, null, '2.3.0', opts),
    bound: releaseNotes(NOTES, '2.2.0', '2.3.0', opts).versions.map(v => v.version),
  }, { noFile: { ...none, missing: true }, past: { ...none, source: 'S', missing: true }, empty: none, nothingInstalled: none, bound: ['2.3.0'] },
  'a missing source or section is reported as missing; an empty range is not');
});

test('GIVEN a clone whose notes stop below the latest version WHEN extracting and reporting THEN missing is set, its sections stay and one line names the gap', t => {
  const opts = { source: 'S', link: 'L', caps: DATA.caps };
  const stale = REPORT_NOTES.slice(REPORT_NOTES.indexOf('## v6.8.0'));
  const block = r => ({ rc: r.rc, text: r.stdout.slice(r.stdout.indexOf('### What changed'), r.stdout.indexOf('\n\n### Next steps')) });
  assert.deepEqual({
    data: releaseNotes(stale, '6.7.1', '6.9.6', opts), topPresent: releaseNotes(NOTES, '2.1.0', '2.2.0', opts).missing,
    check: block(scenario(t, { before: BEFORE, notes: stale, cc: '2.1.300 (Claude Code)\n' })), none: block(scenario(t, { before: BEFORE, notes: '# Release Notes\n' })),
  }, {
    data: { source: 'S', requirement: '**Update Claude Code first:** older line.', migration: [{ version: '6.8.0', text: 'mig1' }],
      versions: [{ version: '6.8.0', bullets: ['e1'], count: 1, fallback: false }], hidden: 0, missing: true, link: 'L' },
    topPresent: false,
    check: { rc: 0, text: `### What changed for you (6.7.1 → 6.9.6)

🔵 Notes for versions after 6.8.0 are not in your local marketplace copy yet: [release notes](${DATA.notesUrl}).

🔵 **Update Claude Code first:** older line.

- **v6.8.0 migration:** mig1
- **v6.8.0:** e1` },
    none: { rc: 0, text: `### What changed for you (6.7.1 → 6.9.6)

🔵 The release notes for these versions are not available here: [release notes](${DATA.notesUrl}).` },
  }, 'a stale clone (check mode, failed refresh) must never pass for complete notes; no section at all keeps the old line');
});

test('GIVEN a block bullet repeated as a migration bullet of its version WHEN extracting and reporting THEN it shows once, as the migration, and frees its cap slot', t => {
  const dup = `## v6.9.6 (2026-10-16)

**What changed for you**

- n1

## v6.8.0 (2026-10-15)

**What changed for you**

- e1
- Update brewtools and the mods together.
- e3
- e4

**Migration:**

- Update brewtools and the mods together.
- mig2
`;
  const real = releaseNotes(readFileSync(join(ROOT, 'RELEASE-NOTES.md'), 'utf8'), '6.7.1', '6.8.0', { caps: DATA.caps });
  const report = scenario(t, { before: BEFORE, notes: dup }).stdout;
  assert.deepEqual({
    data: releaseNotes(dup, '6.7.1', '6.8.0', { source: 'S', link: 'L', caps: DATA.caps }),
    realRepeats: real.versions.flatMap(v => v.bullets.filter(b => real.migration.some(m => m.version === v.version && m.text === b))),
    realShown: real.versions.map(v => [v.version, v.bullets.length, real.migration.length]),
    text: report.slice(report.indexOf('### What changed'), report.indexOf('\n\n### Next steps')),
  }, {
    data: { source: 'S', requirement: null, migration: [{ version: '6.8.0', text: 'Update brewtools and the mods together.' }, { version: '6.8.0', text: 'mig2' }],
      versions: [{ version: '6.8.0', bullets: ['e1', 'e3', 'e4'], count: 4, fallback: false }], hidden: 0, missing: false, link: 'L' },
    realRepeats: [],
    realShown: [['6.8.0', 3, 5]],
    text: `### What changed for you (6.7.1 → 6.9.6)

- **v6.8.0 migration:** Update brewtools and the mods together.
- **v6.8.0 migration:** mig2
- **v6.9.6:** n1
- **v6.8.0:** e1
- **v6.8.0:** e3
- **v6.8.0:** e4`,
  }, 'a 6.7.x user sees the v6.8.0 "update together" line once; count stays the source block size');
});

test('GIVEN the real RELEASE-NOTES.md WHEN linting every version from 6.7.0 up THEN each has a 2-5 bullet block and v6.8.0 carries 5 migration bullets', () => {
  const text = readFileSync(join(ROOT, 'RELEASE-NOTES.md'), 'utf8');
  const all = releaseNotes(text, '6.6.99', '999.0.0', { caps: { perVersion: 99, total: 999 } });
  const pinned = ['6.9.6', '6.9.5', '6.9.4', '6.9.3', '6.9.2', '6.9.1', '6.9.0', '6.8.0', '6.7.1', '6.7.0'];
  assert.deepEqual({
    violations: all.versions.filter(v => v.fallback || ![2, 3, 4, 5].includes(v.count)).map(v => v.version),
    counts: Object.fromEntries(all.versions.filter(v => pinned.includes(v.version)).map(v => [v.version, v.count])),
    migration680: all.migration.filter(m => m.version === '6.8.0').length,
    requirement696: releaseNotes(text, '6.9.5', '6.9.6').requirement,
  }, {
    violations: [],
    counts: { '6.9.6': 5, '6.9.5': 4, '6.9.4': 4, '6.9.3': 4, '6.9.2': 5, '6.9.1': 5, '6.9.0': 5, '6.8.0': 4, '6.7.1': 4, '6.7.0': 5 },
    migration680: 5,
    requirement696: '**Update Claude Code first:** the mods need Claude Code 2.1.301 or newer. Run `claude update`, restart Claude Code (exit, then run `claude`), and check with `claude --version`.',
  }, 'every release from 6.7.0 needs a What-changed block of 2-5 bullets (best-practice row 8), parsed by the plugin-update rule');
});

test('GIVEN before/after snapshots across scopes and marketplaces WHEN diffing THEN each row gets its status, mods first', () => {
  const before = [row('brewcode', '6.7.1'), row('brewcode', '6.7.1', 'project', '/p'), row('brewtools', '6.7.1'), row('brewdoc', '6.9.6'),
    row('brewui', '6.7.1'), row('other@mkt', '1.0.0'), row('local@inline', 'unknown')];
  const after = [row('brewcode', '6.9.6'), row('brewcode', '6.9.6', 'project', '/p'), row('brewtools', '6.9.6'), row('brewdoc', '6.9.6'),
    row('brewui', '6.7.1'), row('brewmod-placeholders', '6.9.6'), row('other@mkt', '1.1.0'), row('local@inline', 'unknown')];
  const r = (name, scope, projectPath, b, a, status) => ({ name, id: ID(name), scope, projectPath, before: b, after: a, latest: '6.9.6', status });
  assert.deepEqual({ update: diff(before, after, ALL('6.9.6'), DATA), check: diff(before, null, ALL('6.9.6'), DATA) }, {
    update: [
      r('brewmod-placeholders', 'user', null, null, '6.9.6', 'installed'), r('brewmod-plan-effort', null, null, null, null, 'not-installed'), r('brewmod-reminders', null, null, null, null, 'not-installed'),
      r('brewcode', 'user', null, '6.7.1', '6.9.6', 'updated'), r('brewcode', 'project', '/p', '6.7.1', '6.9.6', 'updated'),
      r('brewdoc', 'user', null, '6.9.6', '6.9.6', 'current'), r('brewtools', 'user', null, '6.7.1', '6.9.6', 'updated'),
      r('brewui', 'user', null, '6.7.1', '6.7.1', 'behind'),
      { name: 'other@mkt', id: 'other@mkt', scope: 'user', projectPath: null, before: '1.0.0', after: '1.1.0', latest: null, status: 'updated' },
    ],
    check: [
      r('brewmod-placeholders', null, null, null, null, 'not-installed'), r('brewmod-plan-effort', null, null, null, null, 'not-installed'), r('brewmod-reminders', null, null, null, null, 'not-installed'),
      r('brewcode', 'user', null, '6.7.1', null, 'behind'), r('brewcode', 'project', '/p', '6.7.1', null, 'behind'),
      r('brewdoc', 'user', null, '6.9.6', null, 'current'), r('brewtools', 'user', null, '6.7.1', null, 'behind'),
      r('brewui', 'user', null, '6.7.1', null, 'behind'),
    ],
  }, 'a row still below latest after the update is a failure; non-marketplace rows never show');
});

test('GIVEN brewtools without placeholders WHEN offering on CC 2.1.301, 2.1.300 and garbage THEN mods are offered only on the floor, codewords marked', () => {
  const rows = [row('brewtools', '6.7.1'), row('brewcode', '6.7.1'), row('brewui', '6.7.1')];
  const plugins = [{ name: 'brewdoc', value: VALUES.brewdoc }];
  const moved = { id: 'codewords-to-placeholders', crossed: true, message: MOVED, docsUrl: 'https://doc-claude.brewcode.app/mods/placeholders/' };
  assert.deepEqual({
    ok: offers(rows, ALL('6.9.6'), '2.1.301 (Claude Code)\n', DATA),
    low: offers(rows, ALL('6.9.6'), '2.1.300 (Claude Code)\n', DATA),
    garbage: offers(rows, ALL('6.9.6'), 'garbage', DATA),
    notCrossed: offers([row('brewtools', '6.9.0')], ALL('6.9.6'), '2.1.305', DATA).mods.map(m => m.migration && m.migration.crossed),
    hasPlaceholders: offers([...rows, row('brewmod-placeholders', '6.9.6')], ALL('6.9.6'), '2.1.301', DATA).mods,
  }, {
    ok: { ccOk: true, cc: '2.1.301', ccMin: '2.1.301', plugins, mods: [
      { name: 'brewmod-placeholders', value: VALUES.placeholders, migration: moved },
      { name: 'brewmod-plan-effort', value: VALUES.planEffort, migration: null },
      { name: 'brewmod-reminders', value: VALUES.reminders, migration: null }] },
    low: { ccOk: false, cc: '2.1.300', ccMin: '2.1.301', mods: [], plugins },
    garbage: { ccOk: false, cc: null, ccMin: '2.1.301', mods: [], plugins },
    notCrossed: [false, null, null],
    hasPlaceholders: [{ name: 'brewmod-plan-effort', value: VALUES.planEffort, migration: null }, { name: 'brewmod-reminders', value: VALUES.reminders, migration: null }],
  }, 'mods need Claude Code 2.1.301+; the codewords migration fires while brewtools is installed and placeholders is not');
});

test('GIVEN a fixture marketplace WHEN `latest` runs THEN versions come from the clone, absent ones unknown; no marketplace -> rc 1', t => {
  const base = tmp(t, 'update-flow-latest-');
  const loc = join(base, 'market');
  for (const n of ['brewmod-placeholders', 'brewmod-plan-effort', 'brewmod-reminders', 'brewcode', 'brewdoc', 'brewtools']) put(join(loc, n, '.claude-plugin/plugin.json'), { name: n, version: '6.9.6' });
  put(join(loc, 'RELEASE-NOTES.md'), NOTES);
  put(join(base, 'cfg/plugins/known_marketplaces.json'), { 'claude-brewcode': { installLocation: loc, autoUpdate: false }, other: { installLocation: base } });
  mkdirSync(join(base, 'empty'));
  const expected = { versions: { ...ALL('6.9.6'), brewui: 'unknown' }, autoUpdate: false, installLocation: loc, notes: join(loc, 'RELEASE-NOTES.md') };
  const parsed = env => { const r = run(['latest'], { cwd: base, env }); return { rc: r.rc, out: JSON.parse(r.stdout) }; };
  assert.deepEqual({
    profile: parsed({ CLAUDE_CONFIG_DIR: join(base, 'cfg') }),
    cacheDir: parsed({ CLAUDE_CONFIG_DIR: join(base, 'empty'), CLAUDE_CODE_PLUGIN_CACHE_DIR: join(base, 'cfg/plugins') }),
    none: run(['latest'], { cwd: base, env: { CLAUDE_CONFIG_DIR: join(base, 'empty') } }),
  }, { profile: { rc: 0, out: expected }, cacheDir: { rc: 0, out: expected }, none: { rc: 1, stdout: '{"error":"no-marketplace"}\n', stderr: '' } },
  'latest reads the marketplace clone the CLI installs from, never the network');
});

test('GIVEN one golden INDEX WHEN staleGuides and the my-claude scan fence read it THEN every key gets the same verdict, and only STALE keys are listed', t => {
  const base = tmp(t, 'update-flow-guides-');
  const home = join(base, 'home');
  const MC = '.claude/brewdoc/my-claude';
  const LEGACY = '~/.claude/brewdoc/external/20260302_context-schema.md';
  const skill = readFileSync(join(ROOT, 'brewdoc/skills/my-claude/SKILL.md'), 'utf8');
  const fence = skill.slice(skill.indexOf('\n## REFRESH Mode\n')).match(/^```bash\n([\s\S]*?)^```$/m)[1];
  const doc = (file, fm) => put(file, `---\n${fm}\n---\n# guide\n`);
  doc(join(base, MC, '20260501_my-claude-internal.md'), 'doc_type: user\nversion: "6.9.6"');
  doc(join(base, MC, '20260101_my-claude-internal.md'), 'doc_type: user\nversion: "6.10.0"');
  doc(join(base, MC, '20260501_my-claude-external.md'), 'version: 6.10.0');
  doc(join(base, MC, '20260502_my-claude-external.md'), "version: 'v6.10.0'");
  doc(join(home, '.claude/brewdoc/external/20260302_context-schema.md'), 'version: "6.10.0"');
  doc(join(base, MC, '20260501_research-alpha.md'), 'version: "6.10.0-rc.1"');
  doc(join(base, MC, '20260501_research-beta.md'), 'version: "{PLUGIN_VERSION}"');
  doc(join(base, MC, '20260501_research-gamma.md'), 'version: "6.7.1"');
  doc(join(base, MC, '20260501_research-epsilon.md'), 'doc_type: skip\nversion: "6.7.1"');
  doc(join(base, MC, '20260501_research-zeta.md'), 'doc_type: user');
  doc(join(base, MC, '20260501_research-refresh.md'), 'version: "6.7.1"');
  const line = (ts, mode, path) => JSON.stringify({ ts, mode, path, title: 't', version: '1.0' });
  put(join(base, '.claude/brewdoc/INDEX.jsonl'), `${[
    line('2026-05-01T00:00:00', 'internal', `${MC}/20260501_my-claude-internal.md`), line('2026-01-01T00:00:00', 'internal', `${MC}/20260101_my-claude-internal.md`),
    line('2026-05-01T00:00:00', 'external', `${MC}/20260501_my-claude-external.md`), line('2026-05-01T00:00:00', 'external', `${MC}/20260502_my-claude-external.md`),
    '{not json', line('2026-03-02T00:00:00', 'external', LEGACY),
    ...['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'refresh'].map(n => line('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-${n}.md`)),
    line('2026-05-01T00:00:00', 'research', `${MC}/notes.md`), line('2026-05-01T00:00:00', 'pdf', '.claude/brewdoc/other.pdf')].join('\n')}\n`);
  put(join(base, 'plugin/.claude-plugin/plugin.json'), { name: 'brewdoc', version: '6.10.0' });
  const scan = (prompt, n) => {
    const script = put(join(base, `scan-${n}.sh`), fence.replaceAll('$ARGUMENTS', prompt));
    const r = spawnSync('/bin/bash', [script], { cwd: base, encoding: 'utf8', timeout: 15000,
      env: { PATH: process.env.PATH, HOME: home, CLAUDE_PROJECT_DIR: base, CLAUDE_PLUGIN_ROOT: join(base, 'plugin') } });
    const rows = r.stdout.split('\n').filter(l => /^(STALE|CURRENT|SKIP|MISSING) /.test(l)).map(l => l.split(' '));
    return { rc: r.status, stderr: r.stderr, installed: [...new Set(rows.map(c => c[4]))],
      rows: rows.map(([verdict, key, path, d]) => ({ verdict, key, path, doc: d.slice(4) })) };
  };
  const named = scan('refresh alpha, beta research-delta epsilon zeta', 0);
  const plain = scan('refresh', 1);
  const byPath = (a, b) => a.path.localeCompare(b.path);
  const rowOf = (verdict, key, file, d) => ({ verdict, key, path: file, doc: d });
  const GOLDEN = [
    rowOf('STALE', 'internal', `${MC}/20260501_my-claude-internal.md`, '6.9.6'),
    rowOf('STALE', 'external', `${MC}/20260502_my-claude-external.md`, 'v6.10.0'),
    rowOf('CURRENT', 'external/context-schema', LEGACY, '6.10.0'),
    rowOf('CURRENT', 'research/alpha', `${MC}/20260501_research-alpha.md`, '6.10.0-rc.1'),
    rowOf('STALE', 'research/beta', `${MC}/20260501_research-beta.md`, 'unsubstituted'),
    rowOf('SKIP', 'research/gamma', `${MC}/20260501_research-gamma.md`, '6.7.1'),
    rowOf('MISSING', 'research/delta', `${MC}/20260501_research-delta.md`, 'none'),
    rowOf('SKIP', 'research/epsilon', `${MC}/20260501_research-epsilon.md`, '6.7.1'),
    rowOf('STALE', 'research/zeta', `${MC}/20260501_research-zeta.md`, 'none'),
    rowOf('STALE', 'research/refresh', `${MC}/20260501_research-refresh.md`, '6.7.1'),
  ];
  const STALE_PLAIN = [GOLDEN[0], GOLDEN[9], GOLDEN[1]];
  assert.deepEqual({
    fence: named, core: { rc: 0, stderr: '', installed: ['installed=6.10.0'], rows: guideVerdicts(base, '6.10.0', { prompt: 'refresh alpha, beta research-delta epsilon zeta', home }) },
    stale: { fence: plain.rows.filter(r => r.verdict === 'STALE').sort(byPath), core: staleGuides(base, '6.10.0', { home }) },
    noIndex: staleGuides(join(base, 'nowhere'), '6.10.0', { home }), noVersion: staleGuides(base, 'garbage', { home }),
  }, {
    fence: { rc: 0, stderr: '', installed: ['installed=6.10.0'], rows: GOLDEN },
    core: { rc: 0, stderr: '', installed: ['installed=6.10.0'], rows: GOLDEN },
    stale: { fence: STALE_PLAIN, core: STALE_PLAIN }, noIndex: [], noVersion: [],
  }, 'the newest ts row per key (equal ts: later line), ~/ legacy paths, rc/v-prefixed/unsubstituted/absent versions, unnamed research, a deleted file and doc_type skip give one verdict in both; MISSING and SKIP are never listed');
});

test('GIVEN brewdoc installed at several scopes WHEN the report picks the version guides are compared with THEN only installs loadable in this project count and the lowest wins', t => {
  const refresh = r => r.stdout.split('\n').filter(l => l.includes('my-claude refresh'));
  const guideAt = '6.9.5';
  const cases = {
    otherProjectOnly: scenario(t, { before: [row('brewdoc', guideAt), row('brewdoc', '6.9.6', 'project', '/elsewhere/proj')] }),
    ownProjectLower: scenario(t, { before: base => [row('brewdoc', '6.9.6'), row('brewdoc', guideAt, 'project', base)] }),
    userOnly: scenario(t, { before: [row('brewdoc', '6.9.6')] }),
    notInstalled: scenario(t, { before: [row('brewcode', '6.9.6')] }),
  };
  assert.deepEqual(Object.fromEntries(Object.entries(cases).map(([k, r]) => [k, refresh(r)])), {
    otherProjectOnly: [], ownProjectLower: [], userOnly: [`1. ${REFRESH}`], notInstalled: [],
  }, "another project's install never raises the version; the lowest loadable one is what refresh compares with; no brewdoc here -> no suggestion");
});

test('GIVEN saved inputs WHEN `plan` runs per mode THEN the update set, offers and notes match; unreadable inputs degrade with rc 1', t => {
  const base = tmp(t, 'update-flow-plan-');
  const proj = join(base, 'proj');
  mkdirSync(proj);
  const notesPath = put(join(base, 'RELEASE-NOTES.md'), REPORT_NOTES);
  const before = [row('brewtools', '6.7.1'), row('brewcode', '6.7.1'), row('brewcode', '6.7.1', 'project', proj), row('brewcode', '6.7.1', 'local', join(base, 'gone')),
    row('brewdoc', '6.9.6'), row('brewui', '6.7.1'), row('other@mkt', '1.0.0'), row('x@inline', 'unknown')].map(r => ({ ...r, enabled: true }));
  const latest = { versions: { ...ALL('6.9.6'), brewui: 'unknown' }, autoUpdate: false, installLocation: base, notes: notesPath };
  const dir = (name, files) => { const d = join(base, name); mkdirSync(d); for (const [f, b] of Object.entries(files)) put(join(d, f), b); return d; };
  const full = dir('full', { 'before.json': before, 'latest.json': latest, 'cc.txt': '2.1.301 (Claude Code)\n' });
  const plan = (d, mode) => { const r = run(['plan', d, '--mode', mode], { cwd: base }); return { rc: r.rc, out: JSON.parse(r.stdout) }; };
  const u = (projectPath, scope = 'user', l = '6.9.6', orphan = false) => ({ id: ID('brewcode'), scope, projectPath, before: '6.7.1', latest: l, orphan });
  const update = [u(null), u(proj, 'project'), u(join(base, 'gone'), 'local', '6.9.6', true),
    { ...u(null), id: ID('brewtools') }, { ...u(null, 'user', null), id: ID('brewui') }];
  const check = plan(full, 'check');
  const scopes = [{ scope: 'user', projectPath: null }, { scope: 'project', projectPath: proj }, { scope: 'local', projectPath: join(base, 'gone') }];
  const noLatest = { rc: 1, out: { mode: 'update', range: { from: '6.7.1', to: null },
    update: [u(null, 'user', null), u(proj, 'project', null), u(join(base, 'gone'), 'local', null, true),
      { ...u(null, 'user', null), id: ID('brewdoc'), before: '6.9.6' }, { ...u(null, 'user', null), id: ID('brewtools') }, { ...u(null, 'user', null), id: ID('brewui') }],
    scopes, offers: { ccOk: false, cc: null, ccMin: '2.1.301', plugins: [], mods: [] },
    notes: { source: null, requirement: null, migration: [], versions: [], hidden: 0, missing: false, link: DATA.notesUrl }, autoUpdate: null, error: 'no-latest' } };
  assert.deepEqual({
    update: plan(full, 'update'),
    all: plan(full, 'all').out.update.map(x => x.id),
    check: { rc: check.rc, mode: check.out.mode, update: check.out.update },
    discover: plan(dir('discover', { 'before.json': { marketplaces: ['claude-brewcode'], enabledPlugins: [], installed: { brewcode: { version: '6.7.1', marketplace: 'claude-brewcode' } }, cache_dir: 'c' },
      'latest.json': ALL('6.9.6') }), 'update').out.update,
    noInventory: plan(dir('no-inventory', { 'latest.json': latest }), 'update'),
    noLatest: plan(dir('no-latest', { 'before.json': before }), 'update'),
    offlineNested: plan(dir('offline-nested', { 'before.json': before, 'latest.json': { ...latest, versions: ALL('unknown') } }), 'update'),
    offlineFlat: plan(dir('offline-flat', { 'before.json': before, 'latest.json': ALL('unknown') }), 'update'),
  }, {
    update: { rc: 0, out: {
      mode: 'update', range: { from: '6.7.1', to: '6.9.6' }, update, scopes,
      offers: { ccOk: true, cc: '2.1.301', ccMin: '2.1.301', plugins: [], mods: [
        { name: 'brewmod-placeholders', value: VALUES.placeholders, migration: { id: 'codewords-to-placeholders', crossed: true, message: MOVED, docsUrl: 'https://doc-claude.brewcode.app/mods/placeholders/' } },
        { name: 'brewmod-plan-effort', value: VALUES.planEffort, migration: null },
      { name: 'brewmod-reminders', value: VALUES.reminders, migration: null }] },
      notes: { source: notesPath, requirement: '**Update Claude Code first:** the mods need Claude Code 2.1.301 or newer.', migration: [{ version: '6.8.0', text: 'mig1' }],
        versions: [{ version: '6.9.6', bullets: ['n1 newest', 'n2'], count: 2, fallback: false }, { version: '6.8.0', bullets: ['e1'], count: 1, fallback: false }],
        hidden: 0, missing: false, link: DATA.notesUrl },
      autoUpdate: false } },
    all: [ID('brewcode'), ID('brewcode'), ID('brewcode'), ID('brewtools'), ID('brewui'), 'other@mkt'],
    check: { rc: 0, mode: 'check', update },
    discover: [{ id: ID('brewcode'), scope: 'user', projectPath: null, before: '6.7.1', latest: '6.9.6', orphan: false }],
    noInventory: { rc: 1, out: { mode: 'update', range: { from: null, to: '6.9.6' }, update: [], scopes: [],
      offers: { ccOk: false, cc: null, ccMin: '2.1.301', mods: [], plugins: [] },
      notes: { source: null, requirement: null, migration: [], versions: [], hidden: 0, missing: false, link: DATA.notesUrl }, autoUpdate: false, error: 'no-inventory' } },
    noLatest, offlineNested: noLatest, offlineFlat: noLatest,
  }, 'plan feeds the PLAN block, the one question and Phase 4: mods first, orphans flagged, scopes for the prune, an all-"unknown" latest is no-latest');
});

test('GIVEN update, failure, no-op, check, offline and unreadable-list runs WHEN `report` renders THEN the seven titles match update-flow.md §5 and the full goldens hold', t => {
  const green = scenario(t, { before: BEFORE, after: AFTER });
  const red = scenario(t, { before: BEFORE, after: [row('brewtools', '6.7.1'), row('brewcode', '6.9.6'), row('brewdoc', '6.9.6')] });
  const current = [row('brewtools', '6.9.6'), row('brewcode', '6.9.6'), row('brewdoc', '6.9.6')];
  const white = scenario(t, { before: current, after: current, autoUpdate: true });
  const check = scenario(t, { before: BEFORE });
  const offlineUpdate = scenario(t, { before: FULL, after: FULL, versions: OFFLINE });
  const offlineCheck = scenario(t, { before: FULL, versions: OFFLINE });
  const unread = scenario(t, { before: BEFORE, after: '' });
  const runs = [green, red, white, check, offlineUpdate, offlineCheck, unread];
  const titles = runs.map(r => r.stdout.split('\n').find(l => l.startsWith('## ')));
  const templates = MD.slice(MD.indexOf('Titles (N, M, K')).match(/```text\n([\s\S]*?)\n```/)[1].split('\n');
  const offerLines = ['🔵 **brewmod-plan-effort** is not installed (effort `xhigh` in plan mode): `claude plugin install brewmod-plan-effort@claude-brewcode`',
    REMINDERS_OFFER,
    '🔵 **brewui** is not installed (placeholder for future UI tools, no skills yet): `claude plugin install brewui@claude-brewcode`'];
  assert.deepEqual({
    rcs: runs.map(r => r.rc), titles,
    templates: titles.map(x => x.replace(/\d+ of \d+/, 'N of M').replace(/\d+ updated, \d+ failed/, 'N updated, K failed')),
    green: green.stdout, check: check.stdout,
  }, {
    rcs: [0, 0, 0, 0, 1, 1, 1],
    titles: ['## 🟢 brewcode updated: 3 of 4 components', '## 🔴 brewcode: 1 updated, 1 failed', '## ⚪ brewcode is current', '## 🔵 brewcode check: 2 of 3 components can be updated',
      '## ⚪ brewcode: latest versions unknown (offline?)', '## 🔵 brewcode check: latest versions unknown', '## 🔴 brewcode: update result unknown (plugin list unreadable)'],
    templates,
    green: `## 🟢 brewcode updated: 3 of 4 components

| Component | Before | After | |
|---|---|---|---|
| **brewmod-placeholders** | — | **6.9.6** | 🟢 installed |
| **brewmod-plan-effort** | — | — | ⚪ not installed |
| **brewmod-reminders** | — | — | ⚪ not installed |
| **brewcode** | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewui** | — | — | ⚪ not installed |

${offerLines.join('\n\n')}

${WHAT_CHANGED}

### Next steps

1. 🔵 **\`/reload-plugins\`**: activates the new versions in this session (or \`exit\`, then \`claude\`).
2. 🔵 **\`/brewcode:setup-status upgrade\`**: brings this project's setups up to **6.9.6** in one run; repeat it in every project you use.
3. ${REFRESH}

${AUTO}
`,
    check: `## 🔵 brewcode check: 2 of 3 components can be updated

| Component | Installed | Latest | |
|---|---|---|---|
| **brewmod-placeholders** | — | 6.9.6 | ⚪ not installed |
| **brewmod-plan-effort** | — | 6.9.6 | ⚪ not installed |
| **brewmod-reminders** | — | 6.9.6 | ⚪ not installed |
| **brewcode** | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewui** | — | 6.9.6 | ⚪ not installed |

🔵 **Moved:** ${MOVED} ([docs](https://doc-claude.brewcode.app/mods/placeholders/))

🔵 **brewmod-placeholders** is not installed (\`++r\` and other prompt blocks): \`claude plugin install brewmod-placeholders@claude-brewcode\`

${offerLines.join('\n\n')}

${WHAT_CHANGED}

### Next steps

1. 🔵 **\`/brewtools:plugin-update\`**: applies the 2 updates.
2. ${REFRESH}

${AUTO}
`,
  }, 'plugin-update prints this report verbatim: before -> after, what changed, numbered next steps');
});

test('GIVEN no known latest version WHEN diffing THEN installed rows are unknown (never current or updated) and a row gone after the update stays behind', () => {
  const before = [row('brewcode', '6.7.1'), row('brewdoc', '6.9.6')];
  const status = rows => rows.map(r => [r.name, r.status]);
  assert.deepEqual({
    check: status(diff(before, null, {}, DATA)),
    update: status(diff(before, [row('brewcode', '6.9.6')], OFFLINE, DATA)),
    partial: status(diff([row('brewui', '6.7.1'), row('brewcode', '6.7.1')], null, { ...ALL('6.9.6'), brewui: 'unknown' }, DATA)).filter(([n]) => ['brewcode', 'brewui'].includes(n)),
  }, {
    check: [['brewmod-placeholders', 'not-installed'], ['brewmod-plan-effort', 'not-installed'], ['brewmod-reminders', 'not-installed'], ['brewcode', 'unknown'], ['brewdoc', 'unknown'], ['brewtools', 'not-installed'], ['brewui', 'not-installed']],
    update: [['brewmod-placeholders', 'not-installed'], ['brewmod-plan-effort', 'not-installed'], ['brewmod-reminders', 'not-installed'], ['brewcode', 'unknown'], ['brewdoc', 'behind'], ['brewtools', 'not-installed'], ['brewui', 'not-installed']],
    partial: [['brewcode', 'behind'], ['brewui', 'unknown']],
  }, 'a null latest is never current, never counted as updated; a vanished install is still a failure');
});

test('GIVEN an offline fetch (every latest unknown) WHEN `report` renders THEN no run claims "current", the rows say "latest unknown" and rc is 1', t => {
  const offlineUpdate = scenario(t, { before: FULL, after: FULL, versions: OFFLINE });
  const offlineCheck = scenario(t, { before: FULL, versions: OFFLINE });
  const rows = last => ['brewmod-placeholders', 'brewmod-plan-effort', 'brewmod-reminders', 'brewcode', 'brewdoc', 'brewtools', 'brewui'].map(n => (n.startsWith('brewmod-') && n !== 'brewmod-placeholders'
    ? `| **${n}** | — | — | ⚪ not installed |` : `| **${n}** | 6.9.0 | ${last} | ⚪ latest unknown |`));
  assert.deepEqual({ update: offlineUpdate, check: offlineCheck }, {
    update: { rc: 1, stderr: '', stdout: `## ⚪ brewcode: latest versions unknown (offline?)

| Component | Before | After | |
|---|---|---|---|
${rows('6.9.0').join('\n')}

${PLAN_EFFORT_OFFER}

${REMINDERS_OFFER}

### Next steps

1. 🔵 **\`/reload-plugins\`**: activates the new versions in this session (or \`exit\`, then \`claude\`).
2. 🔵 **\`/brewcode:setup-status upgrade\`**: brings this project's setups up to **6.9.0** in one run; repeat it in every project you use.
` },
    check: { rc: 1, stderr: '', stdout: `## 🔵 brewcode check: latest versions unknown

| Component | Installed | Latest | |
|---|---|---|---|
${rows('—').join('\n')}

${PLAN_EFFORT_OFFER}

${REMINDERS_OFFER}
` },
  }, 'an unreachable latest must never read as an empty or current result (superreview F1)');
});

test('GIVEN an after.json that exists but cannot be read WHEN `report` renders THEN it is the update variant: After "—", a red title, /reload-plugins first, rc 1', t => {
  const expected = { rc: 1, stderr: '', stdout: `🔴 The plugin list after the update could not be read: the table shows the versions from before it.

## 🔴 brewcode: update result unknown (plugin list unreadable)

| Component | Before | After | |
|---|---|---|---|
| **brewmod-placeholders** | — | — | ⚪ not installed |
| **brewmod-plan-effort** | — | — | ⚪ not installed |
| **brewmod-reminders** | — | — | ⚪ not installed |
| **brewcode** | 6.7.1 | — | 🔴 not verified, latest 6.9.6 |
| **brewdoc** | 6.9.6 | — | ⚪ already current |
| **brewtools** | 6.7.1 | — | 🔴 not verified, latest 6.9.6 |
| **brewui** | — | — | ⚪ not installed |

🔵 **Moved:** ${MOVED} ([docs](https://doc-claude.brewcode.app/mods/placeholders/))

🔵 **brewmod-placeholders** is not installed (\`++r\` and other prompt blocks): \`claude plugin install brewmod-placeholders@claude-brewcode\`

${PLAN_EFFORT_OFFER}

${REMINDERS_OFFER}

🔵 **brewui** is not installed (placeholder for future UI tools, no skills yet): \`claude plugin install brewui@claude-brewcode\`

${WHAT_CHANGED}

### Next steps

1. 🔵 **\`/reload-plugins\`**: activates the new versions in this session (or \`exit\`, then \`claude\`).
2. 🔵 **\`/brewcode:setup-status upgrade\`**: brings this project's setups up to **6.9.6** in one run; repeat it in every project you use.
3. ${REFRESH}

${AUTO}
` };
  assert.deepEqual({
    empty: scenario(t, { before: BEFORE, after: '' }),
    notJson: scenario(t, { before: BEFORE, after: '{not json' }),
    wrongShape: scenario(t, { before: BEFORE, after: { error: 'x' } }),
  }, { empty: expected, notJson: expected, wrongShape: expected },
  'only a missing after.json is a check run; a present but unusable one never prints the check report (superreview F2)');
});

test('GIVEN project rows whose directory is gone WHEN `report` renders THEN they show "orphan install", never failed or updatable, in update and check runs', t => {
  const gone = '/nonexistent/update-flow-orphan';
  const suite = (brewcode, orphan) => [row('brewmod-placeholders', '6.9.6'), row('brewmod-plan-effort', '6.9.6'), row('brewmod-reminders', '6.9.6'), row('brewcode', brewcode), row('brewcode', orphan, 'project', gone),
    row('brewdoc', '6.9.6'), row('brewtools', '6.9.6'), row('brewui', '6.9.6')];
  const update = scenario(t, { before: suite('6.7.1', '6.7.1'), after: suite('6.9.6', '6.7.1') });
  const check = scenario(t, { before: suite('6.7.1', '6.7.1') });
  assert.deepEqual({ update, check: { rc: check.rc, text: check.stdout.split('\n').slice(0, 12).join('\n') } }, {
    update: { rc: 0, stderr: '', stdout: `## 🟢 brewcode updated: 1 of 8 components

| Component | Before | After | |
|---|---|---|---|
| **brewmod-placeholders** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewmod-plan-effort** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewmod-reminders** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewcode** | 6.7.1 | **6.9.6** | 🟢 updated |
| **brewcode** (project: \`${gone}\`) | 6.7.1 | 6.7.1 | ⚪ orphan install |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewui** | 6.9.6 | 6.9.6 | ⚪ already current |

${WHAT_CHANGED}

### Next steps

1. 🔵 **\`/reload-plugins\`**: activates the new versions in this session (or \`exit\`, then \`claude\`).
2. 🔵 **\`/brewcode:setup-status upgrade\`**: brings this project's setups up to **6.9.6** in one run; repeat it in every project you use.
3. ${REFRESH}

${AUTO}
` },
    check: { rc: 0, text: `## 🔵 brewcode check: 1 of 8 components can be updated

| Component | Installed | Latest | |
|---|---|---|---|
| **brewmod-placeholders** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewmod-plan-effort** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewmod-reminders** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewcode** | 6.7.1 | **6.9.6** | 🔵 update available |
| **brewcode** (project: \`${gone}\`) | 6.7.1 | 6.9.6 | ⚪ orphan install |
| **brewdoc** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewtools** | 6.9.6 | 6.9.6 | ⚪ already current |
| **brewui** | 6.9.6 | 6.9.6 | ⚪ already current |` },
  }, 'an orphan install is reported, not counted: it neither fails the run nor inflates "can be updated"');
});

test('GIVEN a two-digit minor WHEN comparing 6.9.6 with 6.10.0 THEN the row is behind (not lexicographic) and the notes list 6.10.0 first', () => {
  const text = '## v6.10.0 (2026-10-17)\n\n**What changed for you**\n\n- t1\n\n## v6.9.7 (2026-10-16)\n\n**What changed for you**\n\n- s7\n\n## v6.9.6 (2026-10-15)\n\n**What changed for you**\n\n- s6\n';
  const status = (before, after) => diff(before, after, ALL('6.10.0'), DATA).filter(r => r.name === 'brewcode').map(r => r.status);
  const versions = (from, to) => releaseNotes(text, from, to, { caps: DATA.caps }).versions.map(v => v.version);
  assert.deepEqual({
    check: status([row('brewcode', '6.9.6')], null), failed: status([row('brewcode', '6.9.6')], [row('brewcode', '6.9.6')]),
    updated: status([row('brewcode', '6.9.6')], [row('brewcode', '6.10.0')]), current: status([row('brewcode', '6.10.0')], null),
    fromBelow: versions('6.9.5', '6.10.0'), fromSix96: versions('6.9.6', '6.10.0'), empty: versions('6.10.0', '6.9.6'),
  }, {
    check: ['behind'], failed: ['behind'], updated: ['updated'], current: ['current'],
    fromBelow: ['6.10.0', '6.9.7', '6.9.6'], fromSix96: ['6.10.0', '6.9.7'], empty: [],
  }, 'versions compare numerically per component: 6.10.0 is newer than 6.9.7 and 6.9.6');
});

test('GIVEN update-flow.md with CRLF line endings WHEN loading the data and running the CLI THEN the json fence still parses', t => {
  const base = tmp(t, 'update-flow-crlf-');
  const crlf = MD.replace(/\n/g, '\r\n');
  const script = put(join(base, 'skill/scripts/update-flow.mjs'), readFileSync(SCRIPT, 'utf8'));
  put(join(base, 'skill/references/update-flow.md'), crlf);
  const dir = join(base, 'run');
  put(join(dir, 'before.json'), []);
  put(join(dir, 'latest.json'), ALL('6.9.6'));
  const r = run(['plan', dir, '--mode', 'update'], { cwd: base, script });
  assert.deepEqual({ data: loadData(crlf), cli: { rc: r.rc, stderr: r.stderr, plugins: JSON.parse(r.stdout).offers.plugins.map(p => p.name) } }, {
    data: DATA, cli: { rc: 0, stderr: '', plugins: ['brewcode', 'brewdoc', 'brewtools', 'brewui'] },
  }, 'a Windows checkout (autocrlf) must not break the data block');
});

test('GIVEN every report variant and the real release notes WHEN census-ing markers THEN only 🟢🔵🔴⚪ appear and ❗ never does; low CC prints the floor line', t => {
  const low = scenario(t, { before: BEFORE, cc: '2.1.300 (Claude Code)\n' });
  const realNotes = scenario(t, { before: [row('brewtools', '6.6.2'), row('brewcode', '6.6.2')], after: [row('brewtools', '6.9.6'), row('brewcode', '6.9.6')],
    notes: readFileSync(join(ROOT, 'RELEASE-NOTES.md'), 'utf8'), cc: '2.1.300 (Claude Code)\n' });
  const texts = [low, realNotes, scenario(t, { before: BEFORE, after: AFTER }), scenario(t, { before: BEFORE, after: BEFORE }), scenario(t, { before: BEFORE })].map(r => r.stdout);
  const emoji = [...new Set(texts.join('\n').match(/\p{Extended_Pictographic}/gu))].sort();
  assert.deepEqual({
    foreign: emoji.filter(e => !['🟢', '🔵', '🔴', '⚪'].includes(e)),
    requirementLines: texts.map(x => x.split('\n').filter(l => l.startsWith('🔵 **Update Claude Code first:**')).length),
    low: low.stdout.split('\n').filter(l => l.includes('Claude Code **') || l.includes('is not installed')),
  }, {
    foreign: [],
    requirementLines: [1, 1, 0, 0, 0],
    low: ['🔵 Mods need Claude Code **2.1.301** or newer (you have **2.1.300**): run `claude update`, restart Claude Code, then run `/brewtools:plugin-update` again.',
      '🔵 **brewui** is not installed (placeholder for future UI tools, no skills yet): `claude plugin install brewui@claude-brewcode`'],
  }, 'report markers are the house set; below the Claude Code floor mods are never offered');
});

test('GIVEN Claude Code 2.1.300, 2.1.301, 2.1.302, 2.1.40 and an unreadable version WHEN `report` renders the notes THEN the ❗ requirement line shows only below 2.1.301 or when unreadable', t => {
  const block = cc => { const out = scenario(t, { before: BEFORE, after: AFTER, cc }).stdout; return out.slice(out.indexOf('### What changed'), out.indexOf('\n\n### Next steps')); };
  const low = `### What changed for you (6.7.1 → 6.9.6)

🔵 **Update Claude Code first:** the mods need Claude Code 2.1.301 or newer.

- **v6.8.0 migration:** mig1
- **v6.9.6:** n1 newest
- **v6.9.6:** n2
- **v6.8.0:** e1`;
  assert.deepEqual({
    below: block('2.1.300 (Claude Code)\n'), floor: block('2.1.301 (Claude Code)\n'), above: block('2.1.302 (Claude Code)\n'),
    numeric: block('2.1.40 (Claude Code)\n'), unreadable: block(''),
  }, { below: low, floor: WHAT_CHANGED, above: WHAT_CHANGED, numeric: low, unreadable: low },
  'update-Claude-Code-first is advice for Claude Code below the mods floor only (P6: printed on 2.1.302); 2.1.40 < 2.1.301 numerically');
});

test('GIVEN bad invocations WHEN the CLI runs THEN each exits 2 with nothing on stdout', t => {
  const base = tmp(t, 'update-flow-usage-');
  const missing = join(base, 'missing');
  const cases = [[], ['nope'], ['latest', 'x'], ['plan', base], ['plan', base, '--mode', 'bogus'], ['plan', '--mode', 'update'],
    ['plan', missing, '--mode', 'update'], ['plan', base, base, '--mode', 'update'], ['report'], ['report', missing], ['report', base, 'extra']];
  assert.deepEqual(cases.map(args => { const r = run(args, { cwd: base }); return { rc: r.rc, stdout: r.stdout }; }), cases.map(() => ({ rc: 2, stdout: '' })),
    'usage errors are rc 2 and never print a plan or report a caller could mistake for data');
});

test('GIVEN the §4 RESULT grammar WHEN matching setup result lines THEN the four outcomes with scope/team parse and the pre-fix forms do not', () => {
  const re = new RegExp(MD.slice(MD.indexOf('## 4.')).match(/```text\n(\^RESULT .*)\n```/)[1]);
  const lines = ['RESULT ok brewtools:agent-return-setup scope=global cv=6.5.0->6.9.0 pending=0 note="thresholds kept"',
    'RESULT partial brewtools:task-board-setup cv=6.5.6->6.5.6 pending=2 note="2 PATCH rows declined"',
    'RESULT skipped brewcode:teams-setup team=payments cv=?->? pending=0 note="not-upgrade"',
    'RESULT failed brewdoc:memory-sync-setup cv=6.6.0->? pending=1 note="validate failed"',
    'RESULT skipped not-upgrade', 'RESULT skipped <reason>', 'RESULT ok brewcode:semble-setup scope=team cv=1.0.0->1.0.1 pending=0 note="x"',
    'RESULT done brewcode:x cv=?->? pending=0 note="x"', 'RESULT ok brewcode:x cv=1.0.0->1.0.1 pending=0 note="x" trailing'];
  assert.deepEqual(lines.map(l => re.test(l)), [true, true, true, true, false, false, false, false, false],
    'the runner parses exactly one grammar; the spec 7.1 forms without <id> are rejected');
});
