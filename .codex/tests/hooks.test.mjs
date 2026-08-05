#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function invoke(file, input, env = {}) {
  const result = spawnSync('node', [file], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout || '{}');
}

const brewcodeSource = path.join(ROOT, 'brewcode');
const brewtoolsSource = path.join(ROOT, 'brewtools');
const brewcodeRoot = path.join(ROOT, '.codex', 'plugins', 'brewcode');
const brewtoolsRoot = path.join(ROOT, '.codex', 'plugins', 'brewtools');
const common = { session_id: 'fixture-session', turn_id: 'fixture-turn', cwd: ROOT, model: 'fixture-model', permission_mode: 'default' };
const brewcodeStateDir = path.join(os.tmpdir(), `brewcode-hook-test-${process.pid}-${Date.now()}`);
const brewcodeEnv = { PLUGIN_ROOT: brewcodeRoot, PLUGIN_DATA: brewcodeStateDir };

const session = invoke(path.join(brewcodeRoot, 'hooks', 'session-start.mjs'), JSON.stringify({ ...common, hook_event_name: 'SessionStart', source: 'startup' }), brewcodeEnv);
assert.equal(session.hookSpecificOutput.hookEventName, 'SessionStart');
assert.match(session.hookSpecificOutput.additionalContext, /\[ROLE\][\s\S]*\[SPLIT\][\s\S]*\[BRANCH\]/);

for (let index = 1; index <= 10; index += 1) {
  const forced = invoke(
    path.join(brewcodeRoot, 'hooks', 'forced-eval.mjs'),
    JSON.stringify({ ...common, hook_event_name: 'UserPromptSubmit', prompt: `Implement change ${index}` }),
    brewcodeEnv
  );
  if (index === 5 || index === 10) assert.equal(forced.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  else assert.deepEqual(forced, {});
}
assert.deepEqual(invoke(path.join(brewcodeRoot, 'hooks', 'forced-eval.mjs'), '{malformed', brewcodeEnv), {});
fs.rmSync(brewcodeStateDir, { recursive: true, force: true });

const managerHook = path.join(brewtoolsRoot, 'hooks', 'manager-prompt.mjs');
const invokeManager = (prompt, permissionMode = 'default') => invoke(
  managerHook,
  JSON.stringify({ ...common, permission_mode: permissionMode, hook_event_name: 'UserPromptSubmit', prompt }),
  { PLUGIN_ROOT: brewtoolsRoot }
);
const manager = invokeManager('++M coordinate this');
const managerFull = manager.hookSpecificOutput.additionalContext;
assert.equal(manager.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
assert.match(managerFull, /\[ROLE: MANAGER\]/);
assert.doesNotMatch(managerFull, /\[ADDON: PLAN MODE\]/);
const managerPlan = invokeManager('++M plan this', 'plan').hookSpecificOutput.additionalContext;
assert.match(managerPlan, /\[ROLE: MANAGER\]/);
assert.match(managerPlan, /\[ADDON: PLAN MODE\]/);
assert.ok(managerPlan.length > managerFull.length, 'Plan mode must extend the full Manager prompt');
assert.match(invokeManager('++A review this').hookSpecificOutput.additionalContext, /system boundaries/);
assert.match(invokeManager('++R review this').hookSpecificOutput.additionalContext, /two passes/);
assert.match(invokeManager('++RR review this').hookSpecificOutput.additionalContext, /behavioral regressions/);
const combinedManager = invokeManager('++M ++A ++R').hookSpecificOutput.additionalContext;
assert.match(combinedManager, /\[ROLE: MANAGER\]/);
assert.match(combinedManager, /system boundaries/);
assert.match(combinedManager, /two passes/);
assert.match(invokeManager('++m lowercase remains supported').hookSpecificOutput.additionalContext, /\[ROLE: MANAGER\]/);
assert.deepEqual(invokeManager('C++ modules and R values are not codewords'), {});
assert.deepEqual(invoke(managerHook, '{malformed', { PLUGIN_ROOT: brewtoolsRoot }), {});
assert.deepEqual(invoke(path.join(brewtoolsRoot, 'hooks', 'session-start.mjs'), JSON.stringify({ ...common, hook_event_name: 'SessionStart', source: 'resume' })), {});

const claudeForced = invoke(path.join(brewcodeSource, 'hooks', 'forced-eval.mjs'), JSON.stringify({ ...common, hook_event_name: 'UserPromptSubmit', prompt: 'Review this code' }));
assert.equal(claudeForced.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
const claudeManager = invoke(path.join(brewtoolsSource, 'hooks', 'manager-prompt.mjs'), JSON.stringify({ ...common, hook_event_name: 'UserPromptSubmit', prompt: '++r review this' }), { CLAUDE_PLUGIN_ROOT: brewtoolsSource });
assert.equal(claudeManager.hookSpecificOutput.hookEventName, 'UserPromptSubmit');

const thinkAssets = path.join(brewtoolsRoot, 'skills', 'think-short', 'assets');
const thinkSessionId = `fixture-${process.pid}-${Date.now()}`;
const thinkSession = invoke(path.join(thinkAssets, 'think-short-session.mjs'), JSON.stringify({ ...common, session_id: thinkSessionId, hook_event_name: 'SessionStart', source: 'startup' }));
assert.equal(thinkSession.hookSpecificOutput.hookEventName, 'SessionStart');
for (let index = 1; index <= 10; index += 1) {
  const result = invoke(path.join(thinkAssets, 'think-short-prompt-counter.mjs'), JSON.stringify({ ...common, session_id: thinkSessionId, hook_event_name: 'UserPromptSubmit', prompt: `fixture ${index}` }));
  if (index === 5 || index === 10) assert.equal(result.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  else assert.deepEqual(result, {});
}
assert.doesNotThrow(() => invoke(path.join(thinkAssets, 'think-short-prompt-counter.mjs'), '{malformed'));
fs.rmSync(path.join(os.tmpdir(), 'brewtools-think-short', `${thinkSessionId}.think-short-counter`), { force: true });
const hookDefinition = fs.readFileSync(path.join(brewcodeRoot, 'hooks', 'hooks.json'));
const originalHash = crypto.createHash('sha256').update(hookDefinition).digest('hex');
const changedHash = crypto.createHash('sha256').update(Buffer.concat([hookDefinition, Buffer.from('\n')])).digest('hex');
assert.notEqual(originalHash, changedHash, 'hook trust hash must change with the definition');

await new Promise((resolve, reject) => {
  const child = spawn('node', [path.join(brewcodeRoot, 'hooks', 'forced-eval.mjs')], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', CODEX_HOOK_TEST_DELAY_MS: '250' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdin.end(JSON.stringify({ ...common, hook_event_name: 'UserPromptSubmit', prompt: 'timeout fixture' }));
  const timer = setTimeout(() => child.kill('SIGKILL'), 40);
  child.once('exit', signal => {
    clearTimeout(timer);
    try { assert.notEqual(signal, 0, 'timeout fixture must terminate the delayed hook'); resolve(); }
    catch (error) { reject(error); }
  });
});

process.stdout.write('Codex and Claude hook fixtures passed for SessionStart, UserPromptSubmit, and PreToolUse, including malformed input, timeout, and trust-hash change.\n');
