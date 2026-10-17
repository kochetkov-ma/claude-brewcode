#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8');
const phase0 = SKILL.split('## Phase 0 — Resolve plugin roots', 2)[1] ?? '';
const fence = [...phase0.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1]).find(block => block.includes('RELOAD-NEEDED')) ?? 'echo NO-PHASE0-FENCE; exit 1';

// GIVEN a config dir whose plugin cache holds brewcode at each version; installed_plugins.json rows = installs(project dir).
function world(t, cached, installs) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'reload-guard-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cache = join(root, 'cfg', 'plugins', 'cache', 'claude-brewcode', 'brewcode');
  const plugin = (dir, version) => {
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
    mkdirSync(join(dir, 'skills', 'setup-status'), { recursive: true });
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'brewcode', version }));
  };
  for (const version of cached) plugin(join(cache, version), version);
  plugin(join(root, 'checkout', 'brewcode'), '6.9.4');
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  const rows = installs(project).map(row => ({ ...row, installPath: join(cache, row.version) }));
  writeFileSync(join(root, 'cfg', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'brewcode@claude-brewcode': rows } }));
  return { root, cache, project, checkout: join(root, 'checkout', 'brewcode') };
}

function phase0Run(w, pluginRoot, depth) {
  const env = { ...process.env, HOME: join(w.root, 'home'), CLAUDE_CONFIG_DIR: join(w.root, 'cfg'),
    CLAUDE_PROJECT_DIR: w.project, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: depth };
  delete env.CLAUDE_CODE_PLUGIN_CACHE_DIR;
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', fence], { cwd: w.root, env, encoding: 'utf8', timeout: 10000 });
  return { status: r.status, lines: r.stdout.split('\n').filter(line => /^(brewcode ROOT=|RELOAD-NEEDED|SPAWN_DEPTH=|OK$)/.test(line)), stderr: r.stderr };
}

test('GIVEN loaded 6.9.4 while the user scope installs 6.9.5 WHEN Phase 0 runs THEN it prints RELOAD-NEEDED with both versions and the scope', t => {
  const w = world(t, ['6.9.4', '6.9.5'], () => [{ scope: 'user', version: '6.9.5' }]);
  const loaded = join(w.cache, '6.9.4');
  assert.deepEqual(phase0Run(w, loaded, ''), { status: 0, stderr: '', lines: [
    `brewcode ROOT=${loaded} VERSION=6.9.4`, 'RELOAD-NEEDED loaded=6.9.4 installed=6.9.5 scope=user', 'SPAWN_DEPTH=default', 'OK',
  ] }, 'an update without /reload-plugins: verdicts would mix two releases, so upgrade and Q1 are refused');
});

test('GIVEN loaded 6.9.9 and installed 6.9.10 with a trailing slash WHEN Phase 0 runs THEN the version sort is numeric, not lexical', t => {
  const w = world(t, ['6.9.9', '6.9.10'], () => [{ scope: 'user', version: '6.9.10' }]);
  assert.deepEqual(phase0Run(w, `${join(w.cache, '6.9.9')}/`, '1'), { status: 0, stderr: '', lines: [
    `brewcode ROOT=${join(w.cache, '6.9.9')} VERSION=6.9.9`, 'RELOAD-NEEDED loaded=6.9.9 installed=6.9.10 scope=user', 'SPAWN_DEPTH=1', 'OK',
  ] }, 'sort -V puts 6.9.10 above 6.9.9; a trailing slash on the root changes nothing');
});

test('GIVEN the loaded root is the installed version WHEN Phase 0 runs THEN no RELOAD-NEEDED line', t => {
  const w = world(t, ['6.9.4', '6.9.5'], () => [{ scope: 'user', version: '6.9.5' }]);
  const loaded = join(w.cache, '6.9.5');
  assert.deepEqual(phase0Run(w, loaded, undefined), { status: 0, stderr: '', lines: [`brewcode ROOT=${loaded} VERSION=6.9.5`, 'SPAWN_DEPTH=default', 'OK'] },
    'a current session gets no guard; an unset spawn depth echoes default');
});

test('GIVEN a --plugin-dir checkout outside the cache WHEN Phase 0 runs THEN no RELOAD-NEEDED line however new the install is', t => {
  const w = world(t, ['6.9.4', '6.9.5'], () => [{ scope: 'user', version: '6.9.5' }]);
  assert.deepEqual(phase0Run(w, w.checkout, '0'), { status: 0, stderr: '', lines: [
    `brewcode ROOT=${w.checkout} VERSION=6.9.4`, 'SPAWN_DEPTH=0', 'OK',
  ] }, 'the checkout is the plugin in use: no guard');
});

test('GIVEN this project pins 6.9.4 at project scope and the user scope moved to 6.9.5 WHEN Phase 0 runs loaded at 6.9.4 THEN no RELOAD-NEEDED line', t => {
  const w = world(t, ['6.9.4', '6.9.5'], project => [{ scope: 'project', version: '6.9.4', projectPath: project }, { scope: 'user', version: '6.9.5' }]);
  const loaded = join(w.cache, '6.9.4');
  assert.deepEqual(phase0Run(w, loaded, ''), { status: 0, stderr: '', lines: [`brewcode ROOT=${loaded} VERSION=6.9.4`, 'SPAWN_DEPTH=default', 'OK'] },
    'the project scope is what this project loads: a newer user-scope install is no reload (R3#9: else RELOAD-NEEDED forever)');
});

test('GIVEN local 6.9.5, project 6.9.4 and user 6.9.4 for this project WHEN Phase 0 runs loaded at 6.9.4 THEN local scope decides', t => {
  const w = world(t, ['6.9.4', '6.9.5'], project => [{ scope: 'user', version: '6.9.4' }, { scope: 'project', version: '6.9.4', projectPath: project },
    { scope: 'local', version: '6.9.5', projectPath: project }]);
  const loaded = join(w.cache, '6.9.4');
  assert.deepEqual(phase0Run(w, loaded, ''), { status: 0, stderr: '', lines: [
    `brewcode ROOT=${loaded} VERSION=6.9.4`, 'RELOAD-NEEDED loaded=6.9.4 installed=6.9.5 scope=local', 'SPAWN_DEPTH=default', 'OK',
  ] }, 'precedence local > project > user, as Claude Code settings scopes');
});

test('GIVEN a project-scope install for another project and user 6.9.5 WHEN Phase 0 runs loaded at 6.9.4 THEN the user scope decides', t => {
  const w = world(t, ['6.9.4', '6.9.5'], () => [{ scope: 'project', version: '6.9.4', projectPath: '/elsewhere' }, { scope: 'user', version: '6.9.5' }]);
  const loaded = join(w.cache, '6.9.4');
  assert.deepEqual(phase0Run(w, loaded, ''), { status: 0, stderr: '', lines: [
    `brewcode ROOT=${loaded} VERSION=6.9.4`, 'RELOAD-NEEDED loaded=6.9.4 installed=6.9.5 scope=user', 'SPAWN_DEPTH=default', 'OK',
  ] }, 'an install row of another projectPath never applies here');
});

test('GIVEN installed_plugins.json absent, then corrupt WHEN Phase 0 runs loaded at 6.9.4 with 6.9.5 cached THEN no RELOAD-NEEDED line and rc 0', t => {
  const absent = world(t, ['6.9.4', '6.9.5'], () => []);
  rmSync(join(absent.root, 'cfg', 'plugins', 'installed_plugins.json'));
  const corrupt = world(t, ['6.9.4', '6.9.5'], () => []);
  writeFileSync(join(corrupt.root, 'cfg', 'plugins', 'installed_plugins.json'), '{"plugins": ');
  const quiet = w => ({ status: 0, stderr: '', lines: [`brewcode ROOT=${join(w.cache, '6.9.4')} VERSION=6.9.4`, 'SPAWN_DEPTH=default', 'OK'] });
  assert.deepEqual([phase0Run(absent, join(absent.cache, '6.9.4'), ''), phase0Run(corrupt, join(corrupt.cache, '6.9.4'), '')],
    [quiet(absent), quiet(corrupt)], 'no readable install record: the guard fails open, never a refusal and never the newest cache dir');
});
