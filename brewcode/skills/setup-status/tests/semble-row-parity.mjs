#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BC = resolve(STATUS_DIR, '../..');
const SEMBLE = join(BC, 'skills', 'semble-setup');
const TEMPLATE = join(SEMBLE, 'assets', 'semble-first.md.template');
const source = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const phase2c = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes('semble-row.mjs')) ?? 'echo NO-PHASE-2C-ROW2-BLOCK';
const TEMPLATE_CV = readFileSync(TEMPLATE, 'utf8').match(/^content_version: *"?([0-9.]+)"?$/m)[1];
const STEPS = ['prereq', 'mcp', 'permissions', 'guidance', 'agents', 'warm', 'smoke'];

function world(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-row2-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const project = join(base, 'project'), home = join(base, 'home'), cache = join(base, 'cache'), bin = join(base, 'bin');
  for (const dir of [join(project, '.claude', 'semble'), join(home, '.claude'), cache, bin]) mkdirSync(dir, { recursive: true });
  symlinkSync(process.execPath, join(bin, 'node'));
  writeFileSync(join(bin, 'claude'), '#!/usr/bin/env bash\necho "2.1.296 (Claude Code)"\n');
  chmodSync(join(bin, 'claude'), 0o755);
  writeFileSync(join(home, '.claude.json'), readFileSync(join(SEMBLE, 'tests', 'fixtures', 'claude-json', 'correct.json'), 'utf8')
    .split('__PROJECT_ROOT__').join(project).split('__CACHE_ROOT_CODE__').join(cache));
  writeFileSync(join(project, '.claude', 'semble', 'state.json'), JSON.stringify({ schema: 1, phase: 'ready', enabled: true, completed: STEPS }));
  const env = {
    PATH: `${bin}:/usr/bin:/bin`, HOME: home, TMPDIR: base, LANG: 'C', SEMBLE_TEST_HOME: home, SEMBLE_PROJECT_ROOT: project,
    SEMBLE_CACHE_ROOT_CODE: cache, SEMBLE_CLAUDE_BIN: join(bin, 'claude'), SEMBLE_NO_NETWORK: '1',
    CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: BC, CLAUDE_SKILL_DIR: STATUS_DIR,
  };
  const installs = ['rule', 'hooks', 'permissions'].map(part => spawnSync('bash',
    [join(SEMBLE, 'scripts', 'semble-guidance.sh'), 'install', '--part', part, '--json'], { env, encoding: 'utf8', timeout: 60000 }).status);
  assert.deepEqual(installs, [0, 0, 0], 'fixture install of rule, hooks and permissions must succeed');
  return { project, env, rule: join(project, '.claude', 'rules', 'semble-first.md'), settings: join(project, '.claude', 'settings.json') };
}

const editRule = (w, stamp) => {
  const body = readFileSync(w.rule, 'utf8').replace(/^content_version:.*\n/m, '').replace(/^version:.*$/m, `version: "5.3.1"${stamp}`);
  writeFileSync(w.rule, `${body}\nLocal project note: a hand-edited line.\n`);
};
const moveAllowToLocal = (w, keepLocal) => {
  const settings = JSON.parse(readFileSync(w.settings, 'utf8'));
  const allow = settings.permissions;
  delete settings.permissions;
  writeFileSync(w.settings, JSON.stringify(settings, null, 2));
  writeFileSync(join(w.project, '.claude', 'settings.local.json'), JSON.stringify(keepLocal ? { permissions: allow } : {}, null, 2));
};

const VARIANTS = {
  freshInstall: () => {},
  unstampedEditedRule: w => editRule(w, ''),
  stampedStaleEditedRule: w => editRule(w, '\ncontent_version: "5.6.0"'),
  mergedCurrentEditedRule: w => editRule(w, `\ncontent_version: "${TEMPLATE_CV}"`),
  permsOnlyInSettingsLocal: w => moveAllowToLocal(w, true),
  permsInNoLayer: w => moveAllowToLocal(w, false),
};

const route = text => [
  [/^none$/, 'ok'], [/^Run \/brewcode:semble-setup install/, 'install'], [/^Run \/brewcode:semble-setup upgrade$/, 'upgrade'],
  [/diff -u [\s\S]*upgrade --force/, 'review'], [/^\/brewcode:semble-setup status$/, 'ok'],
  [/^\/brewcode:semble-setup install /, 'install'], [/^\/brewcode:semble-setup upgrade "/, 'upgrade'],
].find(([re]) => re.test(text))?.[1] ?? `UNKNOWN: ${text}`;
const diffPair = text => text.match(/diff -u ([^\s`;]+) ([^\s`;]+)/)?.slice(1) ?? [];

function observe(t, mutate) {
  const w = world(t);
  mutate(w);
  const r = spawnSync('bash', ['-c', phase2c], { cwd: w.project, env: w.env, encoding: 'utf8', timeout: 120000 });
  const out = r.stdout.split('\n');
  const semble = JSON.parse(out.find(l => l.startsWith('{"schema"') && l.includes('"guidance"')) ?? '{}');
  const row2 = (out.find(l => l.startsWith('ROW2 ')) ?? 'ROW2 none none').split(' ');
  const command = (out.find(l => l.startsWith('COMMAND ')) ?? 'COMMAND ').slice(8);
  const sembleSide = { verdict: semble.verdict, route: route(semble.nextStep ?? ''), diff: diffPair(semble.nextStep ?? '') };
  const setupSide = { state: row2[1], signal: row2[2], route: route(command), diff: diffPair(command) };
  return { rule: w.rule, observed: { status: r.status, semble: sembleSide, setupStatus: setupSide,
    agree: sembleSide.route === setupSide.route && sembleSide.diff.join() === setupSide.diff.join() } };
}

test('GIVEN six row 2 fixtures incl. an unstamped edited rule and perms only in settings.local.json WHEN running the Phase 2c block THEN setup-status ROW2 and semble-status give one verdict', t => {
  const runs = Object.fromEntries(Object.entries(VARIANTS).map(([name, mutate]) => [name, observe(t, mutate)]));
  const actual = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run.observed]));
  const review = name => {
    const diff = [runs[name].rule, TEMPLATE];
    return { status: 0, semble: { verdict: 'partial', route: 'review', diff }, setupStatus: { state: 'partial', signal: 'edited-stale', route: 'review', diff }, agree: true };
  };
  assert.deepEqual(actual, {
    freshInstall: { status: 0, semble: { verdict: 'ready', route: 'ok', diff: [] }, setupStatus: { state: 'current', signal: 'ok', route: 'ok', diff: [] }, agree: true },
    unstampedEditedRule: review('unstampedEditedRule'),
    stampedStaleEditedRule: review('stampedStaleEditedRule'),
    mergedCurrentEditedRule: { status: 0, semble: { verdict: 'ready', route: 'ok', diff: [] }, setupStatus: { state: 'current', signal: 'edited-current', route: 'ok', diff: [] }, agree: true },
    permsOnlyInSettingsLocal: { status: 0, semble: { verdict: 'ready', route: 'ok', diff: [] }, setupStatus: { state: 'current', signal: 'ok', route: 'ok', diff: [] }, agree: true },
    permsInNoLayer: { status: 0, semble: { verdict: 'partial', route: 'install', diff: [] }, setupStatus: { state: 'partial', signal: 'install', route: 'install', diff: [] }, agree: true },
  }, 'semble-status verdict/nextStep and setup-status ROW2 must agree per fixture (policy P2 + P3)');
});
