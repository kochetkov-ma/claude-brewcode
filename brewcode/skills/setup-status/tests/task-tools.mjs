#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const source = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'SKILL.md'), 'utf8');
const fence = marker => [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes(marker));
const code = marker => /node --input-type=module -e '([\s\S]*?)' /.exec(fence(marker))[1];
const probe = code('TODO_TOOLS ${');
const merge = code('WROTE ${file}');

// Every sandbox base this suite made; removed on exit, pass or fail.
const bases = [];
process.on('exit', () => { for (const b of bases) rmSync(b, { recursive: true, force: true }); });
function sandbox(layers) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sstatus-todo-')));
  bases.push(dir);
  const cwd = join(dir, 'repo'), cfg = join(dir, 'profile');
  const files = { local: join(cwd, '.claude', 'settings.local.json'), project: join(cwd, '.claude', 'settings.json'), global: join(cfg, 'settings.json') };
  mkdirSync(join(cwd, '.claude'), { recursive: true });
  mkdirSync(cfg, { recursive: true });
  for (const [name, body] of Object.entries(layers)) writeFileSync(files[name], body);
  return { cwd, cfg, files };
}
function run(js, arg, box, envValue) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: box.cfg };
  delete env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
  if (envValue !== undefined) env.CLAUDE_CODE_ENABLE_TODO_TOOLS = envValue;
  const r = spawnSync('node', ['--input-type=module', '-e', js, arg], { cwd: box.cwd, env, encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  return { status: r.status, first: lines[0], last: lines.at(-1), stderr: r.stderr.trim() };
}
const key = v => JSON.stringify({ env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: v } });

test('GIVEN keys in several layers WHEN Phase 1c probes THEN the highest carrier decides with CC truthy values', () => {
  const cases = {
    localZeroBeatsGlobalOne: [{ local: key('0'), global: key('1') }, undefined],
    projectOneBeatsGlobalZero: [{ project: key('1'), global: key('0') }, undefined],
    globalTrueMixedCase: [{ global: key(' TRUE ') }, undefined],
    globalTwoIsOff: [{ global: key('2') }, undefined],
    settingsZeroBeatsShellOne: [{ project: key('0') }, '1'],
    shellOnlyYes: [{}, 'yes'],
    shellOnlyZero: [{}, '0'],
    nothing: [{}, undefined],
  };
  const actual = Object.fromEntries(Object.entries(cases).map(([name, [layers, envValue]]) =>
    [name, run(probe, '2.1.296', sandbox(layers), envValue).last]));
  assert.deepEqual(actual, {
    localZeroBeatsGlobalOne: 'TODO_TOOLS off (local)',
    projectOneBeatsGlobalZero: 'TODO_TOOLS on (project)',
    globalTrueMixedCase: 'TODO_TOOLS on (global)',
    globalTwoIsOff: 'TODO_TOOLS off (global)',
    settingsZeroBeatsShellOne: 'TODO_TOOLS off (project)',
    shellOnlyYes: 'TODO_TOOLS on (session-env)',
    shellOnlyZero: 'TODO_TOOLS off',
    nothing: 'TODO_TOOLS off',
  }, 'precedence local > project > global > shell; on only for 1/true/yes/on (CC 2.1.296 bool parser)');
});

test('GIVEN a fresh settings.json.lock held by another installer WHEN Phase 4 merges THEN it aborts and writes nothing', () => {
  const box = sandbox({ global: '{"model":"x"}\n' });
  mkdirSync(`${box.files.global}.lock`);
  const r = run(merge, 'global', box);
  assert.deepEqual({ status: r.status, stderr: r.stderr, body: readFileSync(box.files.global, 'utf8'), lock: existsSync(`${box.files.global}.lock`) },
    { status: 1, stderr: `ABORT ${box.files.global}.lock is held by another installer; nothing was written`, body: '{"model":"x"}\n', lock: true },
    'held lock (shared with agent-return/docsync merges) must abort the write and leave the peer lock in place');
});

test('GIVEN a stale settings.json.lock WHEN Phase 4 merges THEN it breaks the lock, merges one key and releases', () => {
  const box = sandbox({ global: '{"model":"x","env":{"A":"b"}}\n' });
  const lock = `${box.files.global}.lock`;
  mkdirSync(lock);
  const old = new Date(Date.now() - 60000);
  utimesSync(lock, old, old);
  const r = run(merge, 'global', box);
  assert.deepEqual({ status: r.status, last: r.last, cfg: JSON.parse(readFileSync(box.files.global, 'utf8')), lock: existsSync(lock) },
    { status: 0, last: `WROTE ${box.files.global} env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, cfg: { model: 'x', env: { A: 'b', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } }, lock: false },
    'a lock older than 30 s is stale; the merge keeps foreign keys and removes its lock on exit');
});

test('GIVEN a settings file holding a JSON array WHEN Phase 4 merges THEN it refuses and releases the lock', () => {
  const box = sandbox({ project: '[]\n' });
  const r = run(merge, 'project', box);
  assert.deepEqual({ status: r.status, stderr: r.stderr, body: readFileSync(box.files.project, 'utf8'), lock: existsSync(`${box.files.project}.lock`) },
    { status: 1, stderr: `REFUSED ${box.files.project} is not a JSON object — fix it by hand`, body: '[]\n', lock: false },
    'a non-object settings file is refused, never rewritten');
});

test('GIVEN claude --version unresolvable or unparsable WHEN Phase 1c probes THEN the version is unknown and the check still runs', () => {
  const actual = Object.fromEntries(['', 'garbage', '2.1.100'].map(arg => {
    const r = run(probe, arg, sandbox({}));
    return [arg, { status: r.status, first: r.first, last: r.last }];
  }));
  assert.deepEqual(actual, {
    '': { status: 0, first: 'CC version unknown — gate assumed', last: 'TODO_TOOLS off' },
    garbage: { status: 0, first: 'CC version unknown — gate assumed', last: 'TODO_TOOLS off' },
    '2.1.100': { status: 0, first: 'CC 2.1.100 < 2.1.233 — task tools on by default, check skipped', last: 'CC 2.1.100 < 2.1.233 — task tools on by default, check skipped' },
  }, 'an unknown version must never read as a pre-2.1.233 build that has the tools on; only a real old version skips');
});

test('GIVEN the shell cwd in a project subdirectory WHEN the Phase 1c and Phase 4 fences run THEN both use the session project dir', () => {
  const box = sandbox({ project: key('0') });
  const sub = join(box.cwd, 'src');
  mkdirSync(sub);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: box.cfg, CLAUDE_PROJECT_DIR: box.cwd };
  delete env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
  const sh = script => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: sub, env, encoding: 'utf8' }).stdout.trim().split('\n');
  const probeOut = sh(fence('TODO_TOOLS ${').replace(/"\$\(claude --version[^\n]*?\)"/, '2.1.296'));
  const mergeOut = sh(fence('WROTE ${file}').replace("' global && echo", "' project && echo"));
  assert.deepEqual({ probeOut, mergeOut, cfg: JSON.parse(readFileSync(box.files.project, 'utf8')), subSettings: existsSync(join(sub, '.claude')) }, {
    probeOut: ['CC 2.1.296 >= 2.1.233 — gate applies', 'session-env no-key', `local ABSENT ${box.files.local}`,
      `project "0" ${box.files.project}`, `global ABSENT ${box.files.global}`, 'TODO_TOOLS off (project)', '✅'],
    mergeOut: [`WROTE ${box.files.project} env.CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, '✅'],
    cfg: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } },
    subSettings: false,
  }, 'a subdir cwd must not move the read layers or the project write away from CLAUDE_PROJECT_DIR');
});
