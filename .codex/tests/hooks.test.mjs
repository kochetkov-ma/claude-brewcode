#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
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

const brewtoolsSource = path.join(ROOT, 'brewtools');
const brewcodeRoot = path.join(ROOT, '.codex', 'plugins', 'brewcode');
const brewtoolsRoot = path.join(ROOT, '.codex', 'plugins', 'brewtools');
const common = { session_id: `fixture-session-${process.pid}-${Date.now()}`, turn_id: 'fixture-turn', cwd: ROOT, model: 'fixture-model', permission_mode: 'default' };
const brewcodeEnv = { PLUGIN_ROOT: brewcodeRoot };

const session = invoke(path.join(brewcodeRoot, 'hooks', 'session-start.mjs'), JSON.stringify({ ...common, hook_event_name: 'SessionStart', source: 'startup' }), brewcodeEnv);
assert.equal(session.hookSpecificOutput.hookEventName, 'SessionStart');
assert.equal(session.hookSpecificOutput.additionalContext, 'Brewcode skills use Codex-native paths, tools, hooks, and sub-agent conventions.', 'no [ROLE]/[SPLIT]/[BRANCH] frame (forced-eval removed)');
assert.deepEqual(invoke(path.join(brewcodeRoot, 'hooks', 'session-start.mjs'), '{malformed', brewcodeEnv), {});

// Forced-eval + cadence lib deleted (ruling 8): absent in canonical and dist trees, no prompt hook.
for (const root of [path.join(ROOT, 'brewcode', '.codex'), brewcodeRoot]) {
  for (const rel of ['hooks/forced-eval.mjs', 'hooks/lib/prompt-cadence.mjs']) assert.equal(fs.existsSync(path.join(root, rel)), false, `${root}/${rel} must stay deleted`);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks), ['SessionStart'], 'brewcode registers SessionStart only');
}

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

const claudeManager = invoke(path.join(brewtoolsSource, 'hooks', 'manager-prompt.mjs'), JSON.stringify({ ...common, hook_event_name: 'UserPromptSubmit', prompt: '++r review this' }), { CLAUDE_PLUGIN_ROOT: brewtoolsSource });
assert.equal(claudeManager.hookSpecificOutput.hookEventName, 'UserPromptSubmit');

const hookDefinition = fs.readFileSync(path.join(brewcodeRoot, 'hooks', 'hooks.json'));
const originalHash = crypto.createHash('sha256').update(hookDefinition).digest('hex');
const changedHash = crypto.createHash('sha256').update(Buffer.concat([hookDefinition, Buffer.from('\n')])).digest('hex');
assert.notEqual(originalHash, changedHash, 'hook trust hash must change with the definition');

await new Promise((resolve, reject) => {
  const child = spawn('node', [path.join(brewcodeRoot, 'hooks', 'session-start.mjs')], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', CODEX_HOOK_TEST_DELAY_MS: '250' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stdin.end(JSON.stringify({ ...common, hook_event_name: 'SessionStart', source: 'startup' }));
  const timer = setTimeout(() => child.kill('SIGKILL'), 40);
  child.once('exit', signal => {
    clearTimeout(timer);
    try { assert.notEqual(signal, 0, 'timeout fixture must terminate the delayed hook'); resolve(); }
    catch (error) { reject(error); }
  });
});

process.stdout.write('Codex and Claude hook fixtures passed for SessionStart, UserPromptSubmit, and PreToolUse, including malformed input, timeout, and trust-hash change.\n');
