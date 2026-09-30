#!/usr/bin/env node
// Execute shipped release snippets against Git mocks; no repository writes or external calls.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const skillDir = join(ROOT, 'brewtools/skills/deploy');
const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const sources = [
  ['skill', skill],
  ['agent', readFileSync(join(ROOT, 'brewtools/agents/deploy-admin.md'), 'utf8')],
  ['template', readFileSync(join(skillDir, 'templates/deploy-admin-agent.md.template'), 'utf8')],
];
const blocks = (text) => [...text.matchAll(/^[ \t]*```bash\n([\s\S]*?)^[ \t]*```/gm)].map((m) => m[1]);
const release = (text) => blocks(text).find((body) => body.includes('git add --') && body.includes('git commit') && body.includes('git push origin'));
const temp = mkdtempSync(join(tmpdir(), 'brewcode-release-chain-'));
const bin = join(temp, 'bin');
mkdirSync(bin);
writeFileSync(join(bin, 'git'), `#!/usr/bin/env node
const fs=require('node:fs'), args=process.argv.slice(2), env=process.env;
fs.appendFileSync(env.FIX_LOG, JSON.stringify(args)+'\\n');
let op;
switch(args[0]) {
  case 'rev-parse': process.exit(env.FIX_EXISTING_TAG==='yes'?0:1); break;
  case 'tag':
    switch(args[1]) {
      case '--list':
        process.stdout.write('v0.1.0\\nv1.0.0\\n'+(fs.existsSync(env.FIX_TAG) && env.FIX_BAD_COUNT!=='yes'?'v1.2.3\\n':''));
        process.exit(0); break;
      default: op='tag';
    }
    break;
  case 'add': op='stage'; break;
  case 'commit': op='commit'; break;
  case 'push': op=args[2]==='HEAD'?'head-push':'tag-push'; break;
  default: throw new Error('Unmocked Git command');
}
switch(op) {
  case env.FIX_FAIL: process.exit(Number(env.FIX_EXIT)); break;
  case 'tag': fs.writeFileSync(env.FIX_TAG, 'created'); break;
}
`, { mode: 0o755 });
writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit "$FIX_GH_EXIT"\n', { mode: 0o755 });
let count = 0;
const check = (actual, expected, why) => { assert.deepEqual(actual, expected, why); count++; };
const commands = [
  ['add', '--', 'package.json', 'CHANGELOG.md'],
  ['commit', '-m', 'v1.2.3: summary'],
  ['push', 'origin', 'HEAD'],
  ['tag', 'v1.2.3'],
  ['push', 'origin', 'refs/tags/v1.2.3'],
];
const cases = [
  ['stage', 71, 1], ['commit', 72, 2], ['head-push', 73, 3],
  ['tag', 74, 4], ['tag-push', 75, 5], ['success', 0, 5],
];
const envFor = (cwd, extra = {}) => ({
  ...process.env, PATH: bin + ':' + process.env.PATH,
  FIX_LOG: join(cwd, 'git-log'), FIX_TAG: join(cwd, 'tag-created'), FIX_EXIT: '0',
  DEPLOY_TIMEOUT_BIN: 'none', CLAUDE_SKILL_DIR: skillDir, ...extra,
});
const run = (body, cwd, env) => spawnSync('/bin/bash', ['-c', body], { cwd, env, encoding: 'utf8' });
const mutations = (cwd) => readFileSync(join(cwd, 'git-log'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  .filter((args) => args[0] !== 'rev-parse' && !(args[0] === 'tag' && args[1] === '--list'));
try {
  // GIVEN every shipped release surface WHEN one chain link fails THEN status and stopping boundary are exact.
  for (const [label, text] of sources) {
    check(blocks(text).filter((body) => body.includes('git add --') && body.includes('git commit') && body.includes('git push origin')).length,
      1, label + ': exactly one release fence is covered');
    const body = release(text).replaceAll('X.Y.Z', '1.2.3').replaceAll('<paths>', 'package.json CHANGELOG.md').replaceAll('<summary>', 'summary');
    for (const [failure, status, callCount] of cases) {
      const cwd = join(temp, label + '-' + failure);
      mkdirSync(cwd);
      const result = run(body, cwd, envFor(cwd, { FIX_FAIL: failure, FIX_EXIT: String(status) }));
      check(result.status, status, label + ': ' + failure + ' preserves its exit status');
      check(mutations(cwd), commands.slice(0, callCount), label + ': ' + failure + ' stops at the exact Git link');
      check(result.stdout, failure === 'success' ? 'RELEASED v1.2.3\n' : '', label + ': RELEASED is emitted only after complete success');
      check(result.stderr, failure === 'success' ? '' : 'FAILED release (exit ' + status + ')\n',
        label + ': failure stays visible instead of being reported as success');
    }
  }
  // GIVEN the guarded source skill/agent WHEN tag count is wrong or the tag exists THEN tag publication is excluded.
  for (const [label, text] of sources.slice(0, 2)) {
    const body = release(text).replaceAll('X.Y.Z', '1.2.3').replaceAll('<summary>', 'summary');
    const countDir = join(temp, label + '-bad-count');
    mkdirSync(countDir);
    const badCount = run(body, countDir, envFor(countDir, { FIX_BAD_COUNT: 'yes' }));
    check(badCount.status, 1, label + ': tag-count guard fails');
    check(mutations(countDir), commands.slice(0, 4), label + ': tag-count guard prevents tag push after the public HEAD push');
    check(badCount.stdout, '', label + ': failed tag-count guard emits no RELEASED');
    const existingDir = join(temp, label + '-existing');
    mkdirSync(existingDir);
    const existing = run(body, existingDir, envFor(existingDir, { FIX_EXISTING_TAG: 'yes' }));
    check(existing.status, 1, label + ': pre-existing tag aborts');
    check(mutations(existingDir), [], label + ': pre-existing tag prevents all release writes');
  }
  // GIVEN the emitted bump command WHEN it fails THEN the release fence is never reached.
  const bumpLine = skill.split('\n').find((line) => line.startsWith('| found |'));
  const bump = bumpLine.match(/`([^`]+)`/)[1].replaceAll('\\|', '|');
  const bumpScript = join(temp, 'bump version.sh');
  writeFileSync(bumpScript, '#!/bin/sh\nexit "$FIX_BUMP_EXIT"\n');
  for (const [status, calls, output, error] of [
    [76, [], '', 'FAILED bump\n'],
    [0, commands, 'OK bump\nRELEASED v1.2.3\n', ''],
  ]) {
    const cwd = join(temp, 'bump-' + status);
    mkdirSync(cwd);
    writeFileSync(join(cwd, 'git-log'), '');
    const body = bump.replace('<BUMP_SCRIPT>', bumpScript).replaceAll('X.Y.Z', '1.2.3') + '\n' +
      release(skill).replaceAll('X.Y.Z', '1.2.3').replaceAll('<summary>', 'summary');
    const result = run(body, cwd, envFor(cwd, { FIX_BUMP_EXIT: String(status) }));
    check(result.status, status, 'bump ' + status + ': original status is preserved');
    check(mutations(cwd), calls, 'bump ' + status + ': only successful bump permits release Git writes');
    check(result.stdout, output, 'bump ' + status + ': success markers match the actual lifecycle');
    check(result.stderr, error, 'bump ' + status + ': error is visible');
  }
  // GIVEN gh failure WHEN the monitor saves rc THEN it reports that saved classification and original exit.
  const monitor = blocks(skill).find((body) => body.includes('FAILED runs'));
  for (const [status, reason] of [[0, 'ok'], [124, 'timeout'], [127, 'no_tool'], [9, 'failed']]) {
    const cwd = join(temp, 'monitor-' + status);
    mkdirSync(cwd);
    const result = run(monitor, cwd, envFor(cwd, { FIX_GH_EXIT: String(status) }));
    check(result.status, status, 'monitor ' + status + ': saved status is preserved');
    check(result.stdout, status === 0 ? 'OK runs\n' : '', 'monitor ' + status + ': only success emits OK');
    check(result.stderr, status === 0 ? '' : 'FAILED runs (reason=' + reason + ' watchdog=bash)\n',
      'monitor ' + status + ': diagnostics classify the saved gh exit');
  }
  console.log('PASS release-chain: ' + count + ' assertions; actual skill, agent and emitted template Git/bump/monitor commands mocked');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
