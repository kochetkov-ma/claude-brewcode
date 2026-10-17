#!/usr/bin/env node
// Pins the e2e fixes: PLAN first (P5), awaited spawn + key rule (P4), brief labels (P8), Q2 order (O2), verbatim probes (O1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(STATUS_DIR, 'SKILL.md'), 'utf8').split('\n');
const runner = readFileSync(join(STATUS_DIR, 'references/upgrade-runner.md'), 'utf8');
const FIRST = '**First output:** the PLAN block below, as plain text, before any tool call.';
const spawn = (runner.split('### 2b. Spawn', 2)[1] ?? '').split('### 2c. After', 1)[0];
const fence = spawn.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? '';
const flat = text => text.replace(/\s+/g, ' ').trim();
const section = heading => {
  const start = skill.findIndex(line => line.startsWith(heading));
  const end = skill.findIndex((line, i) => i > start && line.startsWith('## '));
  return start < 0 ? '' : skill.slice(start, end < 0 ? undefined : end).join('\n');
};

test('GIVEN SKILL.md WHEN reading the Prompt contract THEN the PLAN block is the first output and nothing defers it', () => {
  const contract = skill.slice(skill.indexOf('## Prompt contract'), skill.indexOf('## What it runs and what it never runs'));
  assert.deepEqual({
    gap: contract.indexOf('PLAN — brewcode:setup-status') - contract.indexOf(FIRST),
    deferred: skill.filter(line => /right before the (report|first spawn)|Phase 5 warnings, the PLAN/.test(line)),
    phase0: skill.filter(line => line === '**EXECUTE** using Bash tool, after the PLAN block (the reply\'s first text):').length,
    runnerRepeat: runner.includes('The PLAN block already opened the reply; it never repeats here.'),
  }, { gap: 4, deferred: [], phase0: 1, runnerRepeat: true },
  'e2e P5: a PLAN deferred to Phase 4/6 was never printed in either run; same first-output line as plugin-update');
});

test('GIVEN upgrade-runner.md 2b WHEN reading the spawn shape THEN the template has no background key and one rule adds a boolean false only where the schema lists it', () => {
  assert.deepEqual({
    template: flat(spawn.match(/`Agent\([^`]*\)`/)?.[0] ?? ''),
    rule: flat(spawn).includes('add `run_in_background: false` (boolean, never the string `"false"`) only when the Agent tool\'s schema lists `run_in_background`'),
    why: flat(spawn).includes('the runner is sequential, 2c reads this row\'s `RESULT` and re-probes before the next spawn'),
    noKey: flat(spawn).includes('Otherwise omit it: an interactive session with fork mode on (the default) has no such key (`additionalProperties: false`)'),
    wait: flat(spawn).includes('Then wait for the notification with no other tool call: print `<i>/<M> <setup> running`, end the turn, and resume at 2c on that spawn\'s completion notification, never earlier'),
    phase6: flat(section('## Phase 6')).includes('`run_in_background: false` (boolean) only where the Agent tool\'s schema lists that key, else omit it and wait for its notification, no other call'),
    leads: [...skill, ...runner.split('\n')].filter(line => /spawn with `run_in_background|<brief>, run_in_background/.test(line)),
    foreground: [...skill, ...runner.split('\n')].filter(line => /one foreground|, foreground\./.test(line)),
  }, {
    template: '`Agent(subagent_type: "brewcode:setup-upgrader", model: <auto row model>, description: "upgrade <setup>", prompt: <brief>)`',
    rule: true, why: true, noKey: true, wait: true, phase6: true, leads: [], foreground: [],
  }, 'e2e P4 + 6.10.0 live: a template carrying the key made an interactive spawn pass "false" as a string where the schema has no such key');
});

test('GIVEN upgrade mode with Q2 pending WHEN Phase 6 and runner section 1 start THEN Q2 is asked before the run line and the first spawn', () => {
  const Q2 = 'Q2 pending (`upgrade` mode) -> ask it now, before the run line and the first spawn; its merge runs before row 1.';
  const first = text => flat(text).slice(0, Q2.length);
  assert.deepEqual({
    phase6: first(section('## Phase 6').split('\n').slice(1).join('\n')),
    runner: first((runner.split('## 1. Before the first spawn', 2)[1] ?? '').split('\n## 2.', 1)[0]),
  }, { phase6: Q2, runner: Q2 }, '6.10.0 live e2e O2: upgrade mode asked the task-tools question after the run, not before row 1');
});

test('GIVEN SKILL.md Phase 1 WHEN reading how the probes run THEN the fences run as written, never a hand-written substitute', () => {
  assert.equal(flat(section('## Phase 1 — Probe artifacts')).includes('run its fences in this order, as written (placeholders filled), never a hand-written substitute (bare globs abort in zsh)'), true,
    '6.10.0 live e2e O1: a hand-written probe with a bare glob aborted "no matches found" under zsh');
});

test('GIVEN the 2b brief WHEN reading CONTEXT THEN each version carries its kind: stamp, plugin-side stamp, release', () => {
  assert.deepEqual({
    context: fence.split('\n').filter(line => line.startsWith('CONTEXT: ')).map(line => line.match(/\(([^)]*)\)/)[1]),
    done: fence.includes('cv=<before>-><after>'),
    release: spawn.includes('`<release>` =\nthe owner plugin\'s Phase 0 `VERSION`, never a `content_version`'),
  }, {
    context: ['installed stamp <before>, plugin-side stamp <plugin>, plugin release <release>'],
    done: true,
    release: true,
  }, 'e2e P8: "plugin <content_version>" read as the plugin release made upgraders report a brief mismatch');
});
