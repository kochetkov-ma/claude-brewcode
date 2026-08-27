#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const EMIT = join(HERE, '..', '..', 'superreview-setup', 'scripts', 'emit-intent-guard.sh');
const TEMPLATE = join(HERE, '..', '..', 'superreview-setup', 'references', 'intent-guard.toml.template');
let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, description) {
  if (actual === expected) {
    passed += 1;
    results.push('  PASS  ' + name + '  (' + description + ')');
  } else {
    failed += 1;
    results.push('  FAIL  ' + name + '  (' + description + ' | actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected) + ')');
  }
}

function run(root) {
  const result = spawnSync('bash', [EMIT, root], { encoding: 'utf8', timeout: 30000 });
  return { status: result.status, output: (result.stdout || '') + (result.stderr || '') };
}

function parse(path) {
  const result = spawnSync('python3', ['-c', 'import json,pathlib,sys,tomllib; print(json.dumps(tomllib.loads(pathlib.Path(sys.argv[1]).read_text()), sort_keys=True))', path], { encoding: 'utf8' });
  return { status: result.status, data: result.status === 0 ? JSON.parse(result.stdout) : null };
}

const template = parse(TEMPLATE);
check('template.parse', template.status, 0, 'shared native template is valid TOML');
check('template.keys', Object.keys(template.data).sort().join(','), 'description,developer_instructions,name', 'template has exactly three keys');
check('template.name', template.data.name, 'intent-guard', 'template name is fixed');

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-create-'));
  const result = run(root);
  const target = join(root, '.codex', 'agents', 'intent-guard.toml');
  check('create.exit', result.status, 0, 'first run succeeds');
  check('create.verdict', result.output.trim(), 'INTENT_GUARD: CREATED .codex/agents/intent-guard.toml', 'first run reports creation');
  check('create.bytes', readFileSync(target, 'utf8'), readFileSync(TEMPLATE, 'utf8'), 'created file equals shared authority byte-for-byte');
  check('create.parse', parse(target).status, 0, 'created file remains structurally valid TOML');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-reuse-'));
  const agents = join(root, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const target = join(agents, 'intent-guard.toml');
  const foreign = 'name = "intent-guard"\ndescription = "Foreign review-only agent."\ndeveloper_instructions = "Review only; preserve these bytes."\n';
  writeFileSync(target, foreign);
  const result = run(root);
  check('reuse.exit', result.status, 0, 'valid existing native agent is reused');
  check('reuse.verdict', result.output.trim(), 'INTENT_GUARD: REUSE .codex/agents/intent-guard.toml', 'reuse is explicit');
  check('reuse.bytes', readFileSync(target, 'utf8'), foreign, 'reuse preserves foreign bytes');
  rmSync(root, { recursive: true, force: true });
}

for (const [name, body, reason] of [
  ['renamedMarkdown', '---\nname: intent-guard\n---\n', 'invalid TOML'],
  ['extraKey', 'name = "intent-guard"\ndescription = "Review."\ndeveloper_instructions = "Review."\nmodel = "legacy"\n', 'keys must be exactly'],
]) {
  const root = mkdtempSync(join(tmpdir(), 'native-intent-' + name + '-'));
  const agents = join(root, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const target = join(agents, 'intent-guard.toml');
  writeFileSync(target, body);
  const result = run(root);
  check(name + '.exit', result.status, 1, 'invalid existing artifact fails closed');
  check(name + '.reason', result.output.includes(reason), true, 'failure names the structural defect');
  check(name + '.bytes', readFileSync(target, 'utf8'), body, 'failure never overwrites existing bytes');
  rmSync(root, { recursive: true, force: true });
}

console.log('suite-intent-guard.mjs');
for (const line of results) console.log(line);
console.log('  ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
