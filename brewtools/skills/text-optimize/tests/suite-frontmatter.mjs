#!/usr/bin/env node
// Invocation contract: model-invocable frontmatter, one scoped text-guard rule matching every shipped bash fence and agent call.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
const LINES = SKILL.split('\n');
const FM = LINES.slice(1, LINES.indexOf('---', 1));
const RULE = 'bash ${CLAUDE_SKILL_DIR}/scripts/text-guard.sh';

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++; else failed++;
  results.push(ok ? `  PASS  ${name}  (${message})`
    : `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

check('frontmatter.keys', FM.map((l) => l.split(':')[0]),
  ['name', 'description', 'user-invocable', 'disable-model-invocation', 'argument-hint', 'allowed-tools', 'model'],
  'GIVEN text-optimize frontmatter WHEN its keys are listed THEN the house key order holds, DMI key explicit');
check('frontmatter.invocation', FM.filter((l) => /^(name|user-invocable|disable-model-invocation|allowed-tools|model):/.test(l)), [
  'name: text-optimize',
  'user-invocable: true',
  'disable-model-invocation: false',
  `allowed-tools: [Read, '${RULE.replace('bash ', 'Bash(bash ')} *)', Grep, Glob, Agent, AskUserQuestion]`,
  'model: sonnet',
], 'GIVEN text-optimize frontmatter WHEN invocation keys are read THEN user- and model-invocable, one scoped Bash rule, no bare Bash/Write/Edit');

// GIVEN the one allowed-tools Bash rule WHEN every shipped bash fence is read THEN each is that single command.
const fences = [...SKILL.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));
const outsideQuotes = (cmd) => cmd.replace(/'[^']*'/g, '');
check('fences.shape', fences.map((f) => [
  f.startsWith(RULE + ' '), f.includes('\n'), /[;&|$`()<>"\\]/.test(outsideQuotes(f.slice(RULE.length))),
]), Array(4).fill([true, false, false]),
'GIVEN the rule prefix WHEN each fence is checked THEN it starts with it, is one line, no operator, double quote or expansion outside single quotes');
check('fences.subcommands', fences.map((f) => f.split(' ')[2]), ['snapshot', 'checkpoint', 'verify', 'restore'],
  'GIVEN the shipped fences WHEN their subcommands are listed THEN snapshot, checkpoint, verify and restore are covered');
// GIVEN the writer agent WHEN it checkpoints THEN its command resolves to the same rule prefix, unquoted.
const AGENT = readFileSync(join(HERE, '..', '..', '..', 'agents', 'text-optimizer.md'), 'utf8');
check('agent.checkpointShape', [...AGENT.matchAll(/`(bash [^`]*text-guard\.sh[^`]*)`/g)].map((m) => m[1]), [
  "bash ${CLAUDE_PLUGIN_ROOT}/skills/text-optimize/scripts/text-guard.sh checkpoint --run-dir '<RUN_DIR>' '<file>'",
], 'GIVEN text-optimizer.md WHEN its text-guard commands are listed THEN only the unquoted checkpoint matching the skill rule remains');
check('body.pluginRootGuardPath', SKILL.includes('${CLAUDE_PLUGIN_ROOT}/skills/text-optimize/scripts/text-guard.sh'), false,
  'GIVEN the skill body WHEN the guard path is spelled THEN the old quoted plugin-root form the rule cannot match is gone');

console.log('suite-frontmatter.mjs (text-optimize invocation contract)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
