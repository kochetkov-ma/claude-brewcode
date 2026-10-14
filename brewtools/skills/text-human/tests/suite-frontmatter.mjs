#!/usr/bin/env node
// Invocation contract: model-invocable frontmatter, no Bash/Write/Edit grant, one-command dirty-path gate fence.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
const LINES = SKILL.split('\n');
const FM = LINES.slice(1, LINES.indexOf('---', 1));

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
  'GIVEN text-human frontmatter WHEN its keys are listed THEN the house key order holds, DMI key explicit');
check('frontmatter.invocation', FM.filter((l) => /^(name|user-invocable|disable-model-invocation|allowed-tools|model):/.test(l)), [
  'name: text-human',
  'user-invocable: true',
  'disable-model-invocation: false',
  'allowed-tools: [Read, Grep, Glob, Agent, AskUserQuestion]',
  'model: sonnet',
], 'GIVEN text-human frontmatter WHEN invocation keys are read THEN user- and model-invocable, no Bash/Write/Edit pre-approval');

// GIVEN the Phase 0.5 gate WHEN its shell fences are read THEN it is one read-only git command, single-quoted path.
const commands = [...SKILL.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''))
  .filter((f) => !f.startsWith('/brewtools:text-human'));
check('fences.gate', commands, ["git status --porcelain -- '<resolved path>'"],
  'GIVEN the non-example bash fences WHEN listed THEN only the dirty-path gate remains, one line, no comment or double quotes');

console.log('suite-frontmatter.mjs (text-human invocation contract)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
