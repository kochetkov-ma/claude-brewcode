#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cwd = mkdtempSync(join(tmpdir(), 'manager-plan-'));
const input = { hook_event_name: 'UserPromptSubmit', cwd, prompt: '+++ plan this task' };

function invoke(file, payload, env) {
  const result = spawnSync(process.execPath, [file], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env, HOME: cwd }
  });
  assert.equal(result.status, 0, 'manager hook must exit successfully for every input');
  return JSON.parse(result.stdout);
}

try {
  for (const [runtime, file, env] of [
    ['Claude', join(root, 'brewtools/hooks/manager-prompt.mjs'), { CLAUDE_PLUGIN_ROOT: join(root, 'brewtools') }],
    ['Codex', join(root, 'brewtools/.codex/hooks/manager-prompt.mjs'), { PLUGIN_ROOT: join(root, 'brewtools') }]
  ]) {
    // GIVEN a bare +++ codeword and the documented Plan-mode payload.
    // WHEN the runtime submits the prompt.
    const planned = invoke(file, { ...input, permission_mode: 'plan' }, env);
    // THEN scheduling remains deferred, with the complete task-specific contract.
    assert.equal(planned.hookSpecificOutput.hookEventName, 'UserPromptSubmit', `${runtime} must return the prompt event`);
    const text = planned.hookSpecificOutput.additionalContext;
    for (const required of ['ANTI-DRIFT CRON PLAN', 'Stay read-only', 'one unique session cron per top-level task', 'hourly', "user's interval", 'latest 10 completed', 'HH:MM TZ · tick N · elapsed', 'completion or cancellation']) {
      assert.equal(text.includes(required), true, `${runtime} cron plan must preserve ${required}`);
    }

    // GIVEN ordinary modes, absent mode, misleading fields, or malformed input.
    // WHEN the hook evaluates +++.
    // THEN it must never infer Plan mode from user text or unrelated fields.
    for (const permission_mode of ['default', 'acceptEdits', 'bypassPermissions', 'PLAN', undefined, null, {}, true]) {
      assert.deepEqual(invoke(file, { ...input, permission_mode, collaboration_mode: 'plan' }, env), {}, `${runtime} must reject non-plan mode ${JSON.stringify(permission_mode)}`);
    }
    assert.deepEqual(invoke(file, '{malformed', env), {}, `${runtime} malformed JSON must fail open without injection`);
    assert.deepEqual(invoke(file, { ...input, permission_mode: 'plan', prompt: { codeword: '+++' } }, env), {}, `${runtime} non-string prompt must not inject`);
    for (const prompt of ['++++', 'C+++', '+++m', 'word+++', '+++word', 'задача+++слово', 'задача+++', '+++слово', '字+++字', 'e\u0301+++', 'plan this task']) {
      assert.deepEqual(invoke(file, { ...input, permission_mode: 'plan', prompt }, env), {}, `${runtime} must reject non-codeword ${prompt}`);
    }

    // GIVEN all existing codeword groups combined with +++ in Plan mode.
    // WHEN their independent blocks are composed.
    // THEN each survives and ++rr retains precedence over ++r.
    const combined = invoke(file, { ...input, permission_mode: 'plan', prompt: '+++ ++M ++A ++R ++RR' }, env).hookSpecificOutput.additionalContext;
    for (const pattern of [/ANTI-DRIFT CRON PLAN/, /MANAGER|Manager/, /Architecture|boundaries/, /regression|regressions/]) {
      assert.match(combined, pattern, `${runtime} combined codewords must retain ${pattern}`);
    }
    assert.doesNotMatch(combined, /Two-phase review discipline is active/, `${runtime} ++rr must take precedence over ++r`);
    assert.equal(combined.indexOf('ANTI-DRIFT CRON PLAN') < combined.indexOf('MANAGER'), true, `${runtime} cron contract must precede large manager prompts`);
  }
} finally {
  rmSync(cwd, { recursive: true, force: true });
}

process.stdout.write('Manager Plan-mode cron fixtures passed for Claude and Codex.\n');
