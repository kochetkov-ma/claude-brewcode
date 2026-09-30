#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENERATOR = fs.readFileSync(path.join(ROOT, '.codex/scripts/generate-compat.mjs'), 'utf8');
const start = GENERATOR.indexOf('function skillSigil(');
const end = GENERATOR.indexOf('// Per-file, exact-text overrides');
assert.equal(start >= 0 && end > start, true, 'actual generator helper functions must be bounded');
const producer = vm.createContext({ fs, path });
vm.runInContext(GENERATOR.slice(start, end), producer);

function project(value) {
  producer.input = value;
  return vm.runInContext('nativeWorkflowText(input)', producer);
}

function consumeCalls(value) {
  const calls = [];
  const consumer = vm.createContext({ spawn_agent: parameters => calls.push(parameters) });
  vm.runInContext(value, consumer);
  return JSON.parse(JSON.stringify(calls));
}

test('current Agent and legacy Task calls project to executable native calls with only task_name and message', () => {
  // GIVEN: actual Claude authoring calls with multiline briefs, parenthesized text and legacy fields.
  const source = [
    'Agent(subagent_type="domain-agent", model="opus", run_in_background=true, prompt="GOAL: Review fn(a, b).\\nROLE: Preserve Task Acceptance Protocol and TaskCreate, TaskGet, TaskList, TaskUpdate.\\nDONE: Return \\"quoted evidence\\".")',
    'Task(subagent_type="legacy-reviewer", prompt="Verify task graph (all dependencies).", model="sonnet")',
    'Agent(subagent_type: "text-optimizer", prompt: "GOAL: Compress instructions.\nROLE: Keep task meaning and all negations.")',
  ].join('\n');

  // WHEN: actual generator projection is executed by a schema-shaped native consumer.
  const native = project(source);
  const calls = consumeCalls(native);

  // THEN: every invocation is valid and preserves the complete meaningful brief.
  assert.equal(calls.length, 3, 'all modern, legacy and colon-style authoring calls must project');
  assert.deepEqual(calls.map(call => Object.keys(call).sort()),
    Array(3).fill(['message', 'task_name']), 'projected calls must contain only supported native fields');
  assert.deepEqual(calls.map(call => call.task_name),
    ['domain_agent_1', 'legacy_reviewer_2', 'text_optimizer_3'], 'projected names must be valid and distinct');
  assert.equal(calls.every(call => call.message.includes('do not spawn or delegate children.')), true,
    'each emitted child brief must preserve main-only delegation without asking children to find another agent');
  assert.equal(calls[0].message.endsWith('GOAL: Review fn(a, b).\nROLE: Preserve Task Acceptance Protocol and TaskCreate, TaskGet, TaskList, TaskUpdate.\nDONE: Return "quoted evidence".'), true,
    'multiline prompt, parenthesized code, quoted evidence and current task tool names must survive');
  assert.equal(calls[1].message.endsWith('Verify task graph (all dependencies).'), true,
    'legacy delegation must retain its task brief while removing source-only model kwargs');
  assert.equal(calls[2].message.endsWith('GOAL: Compress instructions.\nROLE: Keep task meaning and all negations.'), true,
    'colon-style template delegation must retain its multiline brief');
  assert.doesNotMatch(native, /\b(?:Agent|Task)\s*\(|subagent_type\s*[:=]|run_in_background\s*[:=]|model\s*[:=]/,
    'native call syntax must contain no foreign callable or invocation kwargs');
});

test('native prose transformation preserves task entities and main-only delegation policy', () => {
  // GIVEN: actual task terminology next to delegation tool prose.
  const source = 'Task Acceptance Protocol; Task Scope; TaskCreate/TaskUpdate/TaskGet/TaskList.\nUse the Agent tool via Agent. Agent calls start from MAIN only; never nest. Task tool is the legacy delegation alias.';

  // WHEN: the same generator transformation projects prose.
  const native = project(source);

  // THEN: task concepts stay intact while the runtime instruction uses native collaboration.
  assert.equal(native.split('\n')[0], 'Task Acceptance Protocol; Task Scope; TaskCreate/TaskUpdate/TaskGet/TaskList.',
    'ordinary task entities and current task tool identifiers must not be renamed as delegation');
  assert.match(native, /MAIN only; never nest/,
    'projection must preserve the local prohibition on nested delegation');
  assert.doesNotMatch(native, /Agent tool|Task tool|via Agent|Agent calls/,
    'projected prose must name supported native collaboration instead of the foreign delegation tool');
});

test('current task-board analysis and spec templates reach the native call consumer', () => {
  // GIVEN: the actual updated product analysis/spec templates.
  const paths = ['references/01-analysis.md', 'references/08-task-spec-skill.md'];
  const expected = [3, 2];
  for (const [index, relative] of paths.entries()) {
    const source = fs.readFileSync(path.join(ROOT, 'brewtools/skills/task-board-setup', relative), 'utf8');
    assert.doesNotMatch(source, /\bTask\s*\(/, `${relative} must author the current Claude Agent invocation`);

    // WHEN: actual producer transforms the file and the emitted calls execute in the native consumer.
    const native = project(source);
    const examples = [...native.matchAll(/spawn_agent\((\{[^\n]*\})\)/g)].map(match => `spawn_agent(${match[1]})`).join('\n');
    const calls = consumeCalls(examples);

    // THEN: every domain-analysis/design/review brief remains callable and properly scoped.
    assert.equal(calls.length, expected[index], `${relative} must project each documented delegation`);
    assert.equal(calls.every(call => /^GOAL:/m.test(call.message) && /^ROLE:/m.test(call.message)
      && /^SCOPE:/m.test(call.message) && /^CONTEXT:/m.test(call.message)
      && /^CONSUMER:/m.test(call.message) && /^DONE:/m.test(call.message)), true,
    `${relative} must preserve each complete bounded delegation brief`);
    assert.equal(calls.every(call => Object.keys(call).sort().join(',') === 'message,task_name'), true,
      `${relative} must not emit source-only invocation fields`);
  }
});
