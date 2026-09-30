#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = path.join(ROOT, 'brewtools/skills/task-board-setup');
const GENERATOR = readFileSync(path.join(ROOT, '.codex/scripts/generate-compat.mjs'), 'utf8');

function emitNativeReferences() {
  const targetDir = mkdtempSync(path.join(tmpdir(), 'task-board-contract-'));
  const functionsStart = GENERATOR.indexOf('function skillSigil(');
  const functionsEnd = GENERATOR.indexOf('// Per-file, exact-text overrides');
  const emitStart = GENERATOR.indexOf("  if (plugin === 'brewtools' && skill === 'task-board-setup') {");
  const emitEnd = GENERATOR.indexOf("  if (plugin === 'brewdoc' && skill === 'publish') {", emitStart);
  assert.equal(functionsStart >= 0 && functionsEnd > functionsStart, true,
    'actual generator transformation/helper functions must be available');
  assert.equal(emitStart >= 0 && emitEnd > emitStart, true,
    'actual task-board producer block must be bounded before unrelated generation');
  vm.runInNewContext(
    `${GENERATOR.slice(functionsStart, functionsEnd)}\n${GENERATOR.slice(emitStart, emitEnd)}`,
    { fs, path, plugin: 'brewtools', skill: 'task-board-setup', sourceDir: SOURCE, targetDir },
    { timeout: 5000 },
  );
  return targetDir;
}

function nativeOptimizationReference(source) {
  const start = GENERATOR.indexOf('function skillSigil(');
  const end = GENERATOR.indexOf('function copyTransformedTree(');
  assert.equal(start >= 0 && end > start, true,
    'actual native transformations and exact override gate must be available');
  const context = { fs, path, source, output: null };
  vm.runInNewContext(
    `${GENERATOR.slice(start, end)}\noutput = applyTextOverrides('brewtools/skills/task-board-setup/references/07-claude-md-optimize.md', nativeWorkflowText(source));`,
    context, { timeout: 5000 },
  );
  return context.output;
}

test('native optimization projection matches current source and keeps instruction discovery explicit', () => {
  // GIVEN: the current authoritative Claude optimization reference.
  const source = readFileSync(path.join(SOURCE, 'references/07-claude-md-optimize.md'), 'utf8');
  assert.match(source, /State the verified loading rationale above: nested MODCMD reduces launch context/,
    'fixture must exercise the current source rationale that previously broke generation');

  // WHEN: actual native transformation and every exact override run against that source.
  const output = nativeOptimizationReference(source);

  // THEN: native loading mechanics and approval/security contracts survive projection.
  assert.match(output, /once per run.*global guidance.*launch CWD/,
    'native instruction chain must be bounded by launch directory and run');
  assert.match(output, /AGENTS\.override\.md.*AGENTS\.md.*configured fallback names/,
    'native discovery must preserve precedence and configured fallback semantics');
  assert.match(output, /project_doc_max_bytes.*32 KiB default/,
    'native instruction budget must use actual bytes rather than a line guarantee');
  assert.match(output, /\.codex\/rules\/\*\*\/\*\.md.*AGENTS\.local\.md.*explicit loading instructions/,
    'native rules and personal references must require explicit loading');
  assert.match(output, /root rule-index entries with path, load condition and purpose/,
    'decomposition must preserve discoverable rule loading conditions');
  assert.match(output, /Nested AGENTS\.md outside that launch path is not automatically included/,
    'reading a file outside the launch path must not claim automatic nested guidance');
  assert.doesNotMatch(output, /loaded on-demand|loaded ON-DEMAND|automatically loaded for you|never truncates|imports are eager|load only when matching files are touched/,
    'projection must remove inherited foreign loading guarantees');
  assert.match(output, /PROPOSE-ONLY: every change needs main-chat user gate approval/,
    'native correction must retain the explicit restructuring approval gate');
  assert.match(output, /NEVER expose secret values in tool output, proposals or any LLM file/,
    'native correction must retain credential exposure restrictions');
});

test('native optimization projection rejects a changed source rationale rather than skipping its override', () => {
  // GIVEN: a source fixture with a changed passage requiring native correction.
  const source = readFileSync(path.join(SOURCE, 'references/07-claude-md-optimize.md'), 'utf8');
  const passage = '> State the verified loading rationale above: nested MODCMD reduces launch context; eager `@import` does not.';
  assert.equal(source.includes(passage), true, 'current fixture must contain the exact guarded rationale');
  const changed = source.replace(passage, '> Changed source rationale requiring native review.');

  // WHEN/THEN: the actual producer refuses stale override authority.
  assert.throws(() => nativeOptimizationReference(changed), /TEXT_OVERRIDES entry.*no longer matches/,
    'source drift must fail generation instead of silently leaving unsupported runtime wording');
});

test('native optimization references retain cited vendors, model names and target-specific applicability', () => {
  // GIVEN: actual model-advice references and the scoped resource producer.
  const start = GENERATOR.indexOf('function skillSigil(');
  const end = GENERATOR.indexOf('// Per-file, exact-text overrides');
  const references = ['rules-review.md', 'max-compression.md', 'standard-compression.md'];
  for (const name of references) {
    const relative = `brewtools/skills/text-optimize/references/${name}`;
    const source = readFileSync(path.join(ROOT, relative), 'utf8');
    const context = { fs, path, source, relative, output: null };

    // WHEN: the actual resource projection handles research/model advice.
    vm.runInNewContext(`${GENERATOR.slice(start, end)}\noutput = nativeResourceText(relative, source);`,
      context, { timeout: 5000 });
    const output = context.output;

    // THEN: every original cited URL and named model token survives exactly.
    const facts = value => [...value.matchAll(/https?:\/\/[^\s`<>\])]+|\b(?:claude-(?:opus|sonnet|haiku|fable)-[\w.-]+|Claude|Opus|Sonnet|Haiku)\b/g)]
      .map(match => match[0]);
    assert.deepEqual(facts(output), facts(source), `${name} must preserve original model/vendor evidence`);
    assert.doesNotMatch(output, /Anthropic Codex|Codex\.5\+|high-reasoning model [45]|prompting-claude-high-reasoning/,
      `${name} must not fabricate upstream model names or source URLs`);
  }
  const source = readFileSync(path.join(ROOT, 'brewtools/skills/text-optimize/references/rules-review.md'), 'utf8');
  const context = { fs, path, source, output: null };
  vm.runInNewContext(`${GENERATOR.slice(start, end)}\noutput = nativeResourceText('brewtools/skills/text-optimize/references/rules-review.md', source);`,
    context, { timeout: 5000 });
  assert.match(context.output, /only when the optimized artifact targets that model\/configuration/,
    'native runner must apply model advice to the actual artifact target rather than itself');
  assert.match(context.output, /PQ\.6.*official Opus 5 guidance; do not generalize to Sonnet\/Fable/,
    'PQ.6 must retain its supported model restriction and other-model evaluation requirement');
});

test('compatibility consumer permits scoped model evidence and still rejects foreign execution and unbounded dependencies', () => {
  // GIVEN: the actual consumer predicate and a factual Anthropic citation.
  const validator = readFileSync(path.join(ROOT, '.codex/scripts/validate-compat.mjs'), 'utf8');
  const start = validator.indexOf('function hasNonNativeSyntax(');
  const end = validator.indexOf('for (const [plugin, [skillCount, agentCount]]', start);
  assert.equal(start >= 0 && end > start, true, 'actual compatibility syntax predicate must be available');
  const consumer = vm.createContext({});
  vm.runInContext(validator.slice(start, end), consumer);
  const check = (file, source) => {
    consumer.file = file;
    consumer.source = source;
    return vm.runInContext('hasNonNativeSyntax(file, source)', consumer);
  };
  const advice = 'Anthropic Claude 4 best practices; Opus 5 guidance applies only to its named target. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5';
  const files = ['brewtools/.codex/skills/text-optimize/references/rules-review.md',
    '.codex/plugins/brewtools/skills/text-optimize/references/rules-review.md'];
  for (const file of files) {
    // WHEN/THEN: both canonical and distributed evidence pass, runtime violations remain forbidden.
    assert.equal(check(file, advice), false, `${file} must permit genuine cited model evidence`);
    for (const violation of ['Skill(skill="x")', 'Agent(prompt="x")', 'Task(prompt="x")',
      'Bash("command")', 'claude -p prompt', 'CLAUDE_PLUGIN_ROOT', '.claude/rules/rule.md',
      'AskUserQuestion', 'spawn_agent(subagent_type="x")', 'npm install example@latest', '@main']) {
      assert.equal(check(file, `${advice}\n${violation}`), true,
        `${file} must retain rejection of ${violation} beside allowed model evidence`);
    }
  }
  assert.equal(check('brewtools/.codex/skills/task-board-setup/references/rules-review.md', advice), true,
    'model-name exemption must not extend to unrelated native instructions');
});

test('native approval gates use existing authorization or actual main-chat replies and optional tools remain optional', () => {
  // GIVEN: actual generic helpers, the native teams producer and current Claude sources.
  const start = GENERATOR.indexOf('function skillSigil(');
  const end = GENERATOR.indexOf('function copyTransformedTree(');
  const teamStart = GENERATOR.indexOf('function nativeTeamsWorkflow(');
  const teamEnd = GENERATOR.indexOf('function nativeTeamWorkflowProfileChecks(', teamStart);
  const teamSource = readFileSync(path.join(ROOT, 'brewcode/skills/teams-setup/SKILL.md'), 'utf8');
  const cleanupSource = readFileSync(path.join(ROOT, 'brewcode/skills/teams-setup/references/cleanup-flow.md'), 'utf8');
  const optimizationSource = readFileSync(path.join(SOURCE, 'references/07-claude-md-optimize.md'), 'utf8');
  assert.match(cleanupSource, /AskUserQuestion/, 'Claude cleanup source must retain its actual product API');
  const context = { fs, path, teamSource, cleanupSource, optimizationSource, output: null };

  // WHEN: authoritative producer functions project the three independently consumed gate surfaces.
  vm.runInNewContext(`${GENERATOR.slice(start, end)}\n${GENERATOR.slice(teamStart, teamEnd)}\noutput = [nativeTeamsWorkflow(teamSource), applyTextOverrides('brewcode/skills/teams-setup/references/cleanup-flow.md', nativeWorkflowText(cleanupSource)), applyTextOverrides('brewtools/skills/task-board-setup/references/07-claude-md-optimize.md', nativeWorkflowText(optimizationSource))];`,
    context, { timeout: 5000 });

  // THEN: approval cannot depend on a Plan-only optional tool or elapsed time.
  for (const [index, text] of context.output.entries()) {
    assert.match(text, /concrete, reviewable proposal in chat.*actual user reply before dependent action/,
      `surface ${index} must bind required approval to a real main-chat response`);
    assert.match(text, /Existing authorization for the same scope remains valid; do not ask again/,
      `surface ${index} must reuse existing authorization`);
    assert.match(text, /request_user_input_async.*only if exposed.*request_user_input.*only if available.*optional choices and never approval/,
      `surface ${index} must keep clarification tools conditional and prohibit tool-based approval`);
    assert.match(text, /Silence, elapsed time and tool errors are not approval/,
      `surface ${index} must not treat unanswered tool results as permission`);
    assert.doesNotMatch(text, /request_user_input(?:_async)?\s*\(|(?:via|requires|needs|Use)\s+`?request_user_input`?\s+(?:approval|for the documented user gates)/,
      `surface ${index} must not emit an unsupported or mandatory approval-tool call`);
  }
});

test('memory-sync scope wording follows the recursive producer and deadline wording retains partial-return semantics', () => {
  // GIVEN: current installer instructions and the authoritative runtime producer/reference.
  const memoryRoot = path.join(ROOT, 'brewdoc/skills/memory-sync-setup');
  const installer = readFileSync(path.join(memoryRoot, 'SKILL.md'), 'utf8');
  const producer = readFileSync(path.join(memoryRoot, 'scripts/generate.sh'), 'utf8');
  const emitted = readFileSync(path.join(memoryRoot, 'references/SKILL.md.template'), 'utf8');
  const rulesFunction = producer.match(/^_rules_md\(\).*$/m)?.[0];
  assert.equal(typeof rulesFunction, 'string', 'actual recursive producer function must exist');
  const target = mkdtempSync(path.join(tmpdir(), 'memory-scope-contract-'));
  try {
    for (const file of ['.claude/rules/root.md', '.claude/rules/nested/deeper.md']) {
      mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
      writeFileSync(path.join(target, file), '# Owned rule\n');
    }
    // WHEN: the actual producer enumerates a fixture with a nested rule.
    const result = spawnSync('bash', ['-c', `FIND_EXCL='';\n${rulesFunction}\n_rules_md`],
      { cwd: target, encoding: 'utf8', timeout: 5000 });
    // THEN: instructions and emitted narrowing semantics agree with actual recursive enumeration.
    assert.equal(result.status, 0, `actual rule producer must run: ${result.stderr}`);
    assert.deepEqual(result.stdout.trim().split('\n'), ['.claude/rules/nested/deeper.md', '.claude/rules/root.md'],
      'actual producer must enumerate root and deeply nested rules');
    assert.match(installer, /\.claude\/rules\/\*\*\/\*\.md.*recursive/,
      'installer surface must describe the recursive producer');
    assert.doesNotMatch(installer, /single level|non-recursively|only rules".*emphasis on rules/,
      'installer must remove the conflicting shallow inventory and widening example');
    assert.match(installer, /only rules".*user-narrowed scope: re-verify only rules, recursively/,
      'installer example must keep the user-narrowed authorized write set');
    assert.match(emitted, /"only rules" authorizes rules alone/,
      'emitted runtime must independently enforce the same narrow write set');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
  const deadline = readFileSync(path.join(ROOT, 'brewtools/skills/agent-deadline-setup/SKILL.md'), 'utf8');
  const reference = readFileSync(path.join(ROOT, 'brewcode/skills/agents/references/agent-context-and-execution.md'), 'utf8');
  assert.match(reference, /since 2\.1\.246.*partial.*continuation hint/,
    'current source authority must retain partial return and continuation behavior');
  assert.match(deadline, /since 2\.1\.246.*partial-marked result.*continuation hint.*unwritten analysis/,
    'deadline installer must preserve partial returns without promising unwritten analysis recovery');
  assert.doesNotMatch(deadline, /discards its final report/,
    'deadline installer must not describe the retired silent-return behavior');
});

test('native task-board producer emits complete controls without borrowing another runtime scheduler', () => {
  // GIVEN: the actual generator functions and bounded task-board emitter.
  const target = emitNativeReferences();
  try {
    // WHEN: emitted consumer/control resources are read from the isolated output.
    const names = ['02-task-tracker-agent', '03-task-board-skill', '04-tasks-rule', '05-features-templates',
      '10-upgrade', '11-methodology-cron'];
    const resources = Object.fromEntries(names.map(name => [name,
      readFileSync(path.join(target, 'references', `${name}.md`), 'utf8')]));

    // THEN: runtime ownership and transport limits survive the projection.
    assert.doesNotMatch(Object.values(resources).join('\n'), /CronCreate|CronList|CronDelete|\.claude\//,
      'native resources must not claim foreign scheduling tools or artifact paths');
    assert.match(resources['02-task-tracker-agent'], /Child tracker never starts timers/,
      'child tracker must return scheduling actions to the board owner');
    assert.match(resources['04-tasks-rule'], /spawned subagent via native Codex collaboration/,
      'native task rule must name supported collaboration rather than a foreign Agent tool');
    assert.match(resources['03-task-board-skill'], /Main-session task-board alone creates\/reconciles one native session-reminders schedule/,
      'main board must own one supported timer per active top-level task');
    assert.match(resources['11-methodology-cron'], /verify native termination|verify termination/,
      'timer cleanup must depend on native termination evidence');
    assert.match(resources['11-methodology-cron'], /functions\.wait \(terminate: true\)/,
      'native cleanup must use the supported running-cell termination path');
    assert.doesNotMatch(resources['11-methodology-cron'], /<N>|<local time[^>]*>|<duration>/,
      'produced prompt must keep future tick/time values as computed report labels rather than static substitutions');
    assert.match(resources['11-methodology-cron'], /24 occurrences/,
      'native finite schedule must disclose its default occurrence count');
    assert.match(resources['11-methodology-cron'], /does not guarantee interruption, exact receipt or continuity/,
      'native delivery limitations must remain explicit');
    for (const file of ['METHODOLOGY.md', 'ANTI-DRIFT.md', 'task-graph.md']) {
      assert.equal(resources['11-methodology-cron'].includes(`## \`${file}\`\n\n\`\`\`markdown\n`), true,
        `actual producer must retain an emission body for ${file}`);
    }
    assert.match(resources['10-upgrade'], /Never wholesale replace existing content, task decisions, task-local prompts, timer ids\/checkpoints or evidence/,
      'native upgrade must preserve task-specific work and timer evidence');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('legacy upgrade probe detects missing methodology consumers independently of installed spec and progress layers', () => {
  // GIVEN: a legacy board with installed spec/progress layers and one real progress task.
  const source = readFileSync(path.join(SOURCE, 'references/10-upgrade.md'), 'utf8');
  const probe = source.split('## U1. DETECT', 2)[1].match(/```bash\n([\s\S]*?)\n```/)[1];
  const target = mkdtempSync(path.join(tmpdir(), 'task-board-upgrade-probe-'));
  const files = {
    'agents/task-tracker.md': '## Spec triage\n## Session progress\n',
    'skills/task-board/SKILL.md': 'SPECS view\nPROGRESS.md\n',
    'skills/task-spec/SKILL.md': '# Task spec\n',
    'rules/tasks.md': '`spec:` = REQ FM\n## Session progress\n',
    'features/board.md': '| owner | file | spec |\n',
    'features/TRACKER.md': '## 10. Spec layer\n| in/out | status |\nPROGRESS.md\n',
    'features/TASK_TEMPLATE.md': 'spec: none\n## Scope\n| in/out | status |\n',
    'features/INDEX.md': 'specs/SPEC_TEMPLATE.md\nPROGRESS.md\n',
    'features/PROGRESS.md': '# Session progress\n',
    'features/specs/SPEC_TEMPLATE.md': '# Spec template\n',
    'features/specs/DESIGN_TEMPLATE.md': '# Design template\n',
    'features/progress/T-TOOLS-LEGACY.md': '---\nid: T-TOOLS-LEGACY\nstatus: progress\nspec: none\n---\n## Notes\nPreserve my decision.\n',
  };
  try {
    for (const [relative, body] of Object.entries(files)) {
      const file = path.join(target, '.claude', relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
    // WHEN: the exact shipped probe executes against the legacy installation.
    const command = probe.replace('TARGET="<absolute path resolved in P0>"', 'TARGET="$1"');
    const result = spawnSync('bash', ['-c', command, 'probe', target], { encoding: 'utf8', timeout: 5000 });

    // THEN: installed legacy layers are retained while every new consumer is detected as missing.
    assert.equal(result.status, 0, `read-only upgrade probe must execute: ${result.stderr}`);
    assert.deepEqual(result.stdout.match(/^PATCH   [1-6]m$/gm),
      ['PATCH   1m', 'PATCH   2m', 'PATCH   3m', 'PATCH   4m', 'PATCH   5m', 'PATCH   6m'],
      'legacy installed layers must not suppress any methodology consumer patch');
    assert.equal(result.stdout.match(/^MARK-OK /gm).length, 12,
      'legacy spec/progress consumers must remain detected as installed');
    assert.deepEqual(result.stdout.match(/^ABSENT  \.claude\/features\/.*$/gm),
      ['ABSENT  .claude/features/METHODOLOGY.md', 'ABSENT  .claude/features/ANTI-DRIFT.md',
        'ABSENT  .claude/features/task-graph.md'],
      'probe must distinguish all three absent canonical methodology controls');
    assert.match(result.stdout, /eligible=1 with-spec=1 backfill-needed=0/,
      'existing task must remain eligible without needless spec backfill');
    assert.equal(readFileSync(path.join(target, '.claude/features/progress/T-TOOLS-LEGACY.md'), 'utf8'),
      files['features/progress/T-TOOLS-LEGACY.md'], 'read-only detection must preserve task decisions byte-for-byte');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('produced task template records distinct accepted queued tasks with methodology and prepared prompts in both spec modes', () => {
  // GIVEN: actual native producer output and two independently accepted queued tasks.
  const target = emitNativeReferences();
  try {
    const source = readFileSync(path.join(target, 'references/05-features-templates.md'), 'utf8');
    const template = source.split('## `TASK_TEMPLATE.md`', 2)[1].match(/```markdown\n([\s\S]*?)\n```/)[1];
    const tasks = [
      { id: 'T-TOOLS-ACCEPT', goal: 'Require complete accepted task records',
        baseWork: 'W1 developer: repair acceptance; W2 reviewer after W1: verify queued records; W3 tester after W2: run task-board-contract.test.mjs' },
      { id: 'T-TOOLS-CRON', goal: 'Keep queued scheduling prepared until claim',
        baseWork: 'W1 developer: prepare unique prompts; W2 reviewer after W1: verify lifecycle; W3 tester after W2: run task-board-contract.test.mjs' },
    ];
    const prompts = [];
    for (const mode of ['off', 'on']) {
      for (const task of tasks) {
        const taskPath = `.codex/features/todo/${task.id}.md`;
        const prompt = `Anti-drift for ${task.id} in ${target}; goal: ${task.goal}. Read ${taskPath}, METHODOLOGY.md, ANTI-DRIFT.md, board.md, task-graph.md and latest user corrections. Base work: ${task.baseWork}. Acceptance: queued file has filled methodology and a unique prepared prompt; native contract tests pass. Reconcile graph/goal drift and report actual tick time/count, elapsed, remaining and blockers.`;
        const values = {
          '{{SPEC_FM_LINE}}': { off: '', on: 'spec: none' }[mode],
          '{{SPEC_SCOPE_BLOCK}}': { off: '', on: '## Scope\n\n| id | block | in/out | status |\n|----|-------|--------|--------|\n| S1 | task acceptance | in | not-started |\n' }[mode],
          '{{FIRST_DOMAIN}}': 'TOOLS', '{{TODAY}}': '2026-09-30',
          'T-TOOLS-REPLACE-ME': task.id,
          'title: One-line task title': `title: ${task.goal}`,
          'Why this task exists and what problem it solves.': task.goal,
          '- [ ] concrete, checkable outcome': '- [ ] Accepted queued record has filled methodology and a unique prepared prompt; contract tests pass.',
          'Goal/acceptance evidence: (derive from Context/Acceptance and current user instructions)': `Goal/acceptance evidence: ${task.goal}; node --test .codex/tests/task-board-contract.test.mjs passes.`,
          'Domain method: (reference METHODOLOGY.md; specialize review strategy and reliable check commands)': 'Domain method: METHODOLOGY.md; reviewer checks acceptance and scheduling lifecycle; node --test .codex/tests/task-board-contract.test.mjs.',
          'Base work: (bounded units with owner, dependencies and checkable completion evidence; include implementation, simplification, two-pass review, validation and board/timer closeout)': `Base work: ${task.baseWork}; owner closes board after verified validation.`,
          'Prompt: (write the COMPLETE task-specific plain prompt from ANTI-DRIFT.md before claim/scheduling; include task id, absolute root, paths, goal, base work and acceptance evidence)': `Prompt: ${prompt}`,
        };
        // WHEN: accepted task data is materialized into the produced task record before claim.
        let record = template;
        for (const [token, value] of Object.entries(values)) record = record.replaceAll(token, value);
        const file = path.join(target, mode, taskPath);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, record);

        // THEN: each queued record retains actual task-specific method/work/prompt and no live timer id.
        const accepted = readFileSync(file, 'utf8');
        assert.doesNotMatch(accepted, /\{\{[A-Z_]+\}\}|REPLACE-ME|\(derive from|\(reference METHODOLOGY|\(bounded units|\(write the COMPLETE/,
          `${mode} accepted ${task.id} record must contain resolved task data rather than template hints`);
        assert.match(accepted, /status: todo\b/,
          `${mode} accepted ${task.id} fixture must remain queued before claim`);
        assert.match(accepted, /Scheduler id\/state: -- \/ prepared/,
          `${mode} queued ${task.id} prompt must not claim a live timer`);
        assert.equal(accepted.includes(`Base work: ${task.baseWork}`), true,
          `${mode} queued ${task.id} must preserve bounded work owners and dependencies`);
        assert.equal(accepted.includes(`Prompt: ${prompt}`), true,
          `${mode} queued ${task.id} must persist its complete unique prompt before claim`);
        assert.equal(accepted.includes('spec: none'), mode === 'on',
          `${mode} record must preserve independent optional spec FM semantics`);
        prompts.push(prompt);
      }
    }
    assert.equal(new Set(prompts).size, 2, 'two distinct accepted tasks must carry two distinct task-specific prompts');
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
