#!/usr/bin/env node
// Producer-shaped inventory fixtures distinguish discovery from actual runtime loading.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scanner = join(dirname(fileURLToPath(import.meta.url)), '../scripts/context-scan.sh');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'context-scan-')));
const root = join(base, 'project');
const home = join(base, 'home');
function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}
function scan(args = [], expectedStatus = 0, extraEnv = {}) {
  const result = spawnSync('bash', [scanner, '--root', root, ...args], {
    cwd: root, env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: root, ...extraEnv },
    encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, expectedStatus, 'WHEN scanner runs THEN exit distinguishes complete from partial JSON inventory');
  return JSON.parse(result.stdout);
}
try {
  // GIVEN nested conditional rules and lazy sources WHEN scanning THEN retain loading conditions.
  const startup = write(join(root, 'CLAUDE.md'), 'Startup rules\n');
  const scoped = write(join(root, '.claude/rules/nested/scoped.md'), '---\npaths: ["src/**"]\n---\nScoped only\n');
  const unscoped = write(join(root, '.claude/rules/nested/general.md'), 'General rule\n');
  const convention = write(join(root, '.claude/convention/style.md'), 'Imported conventions\n');
  const memory = write(join(home, '.claude/projects', root.replaceAll('/', '-'), 'memory/MEMORY.md'), 'Index\n');
  const topic = write(join(home, '.claude/projects', root.replaceAll('/', '-'), 'memory/nested/topic.md'), 'Lazy topic\n');
  const skill = write(join(root, 'product/skills/example/SKILL.md'), 'Skill instructions\n');
  const reference = write(join(root, 'product/skills/example/references/nested/detail.md'), 'Привет 🌱\n');
  const privateFile = write(join(home, '.claude/rules/private.md'), 'Global private instruction\n');
  write(join(root, '.codex/rules/excluded.md'), 'Private Codex instruction\n');
  write(join(root, 'reports/skills/copy/SKILL.md'), 'Snapshot copy\n');
  write(join(root, 'product/skills/example/references/reports/copy.md'), 'Reference snapshot\n');
  const hook = write(join(root, 'product/hooks/inject.mjs'), 'const CONTEXT_TEXT = "Hook payload";\n');
  const result = scan();
  const rows = Object.fromEntries(result.files.map(row => [row.path, row]));
  assert.deepEqual(result.measurement, {
    scope: 'potential-inventory', token_proxy: 'bytes/4', actual_loading_observed: false,
  }, 'THEN metadata explicitly declines actual-loading claims');
  assert.equal(result.token_model, 'chars/4', 'THEN legacy token-model field remains compatible');
  assert.deepEqual(Object.keys(rows).sort(), [startup, scoped, unscoped, convention, memory, topic, skill, reference, hook].sort(),
    'THEN recursive inventory includes exact sources while excluding private and snapshot trees');
  assert.equal(rows[scoped].loading, 'path-scoped-rule', 'THEN nested scoped rules remain conditional');
  assert.equal(rows[unscoped].loading, 'unscoped-rule', 'THEN nested general rules carry startup eligibility');
  assert.equal(rows[convention].loading, 'import-or-read-required', 'THEN conventions require import or read');
  assert.equal(rows[memory].loading, 'memory-index-limited', 'THEN auto-memory index size is not claimed fully loaded');
  assert.equal(rows[topic].loading, 'on-demand', 'THEN memory topics remain lazy');
  assert.equal(rows[reference].loading, 'on-demand', 'THEN nested references remain lazy');
  assert.equal(rows[reference].bytes, Buffer.byteLength('Привет 🌱\n'), 'THEN Unicode measurement uses exact UTF-8 bytes');
  assert.equal(rows[reference].tokens, Math.floor(Buffer.byteLength('Привет 🌱\n') / 4), 'THEN Unicode proxy remains bytes divided by four');
  assert.deepEqual([rows[hook].kind, rows[hook].estimated, rows[hook].bytes], ['hook-payload', true, Buffer.byteLength('"Hook payload"\n')],
    'THEN hook string estimation preserves producer byte accounting');
  assert.deepEqual(result.totals['always-on'].files, 7, 'THEN legacy instruction tier counts potential sources');
  assert.deepEqual(result.totals['per-invocation'].files, 2, 'THEN invocation tier counts body and lazy reference');
  assert.deepEqual(scan(['--tier', 'per-invocation']).files.map(row => row.path).sort(), [skill, reference].sort(),
    'THEN tier filtering preserves inventory selection');
  assert.equal(scan(['--global']).files.filter(row => row.path === privateFile).length, 1,
    'THEN global source discovery requires explicit scope extension');

  // GIVEN linked rule roots/files and reference directories WHEN scanning THEN retain exact logical paths.
  const sharedRules = join(base, 'shared-rules');
  write(join(sharedRules, 'nested/shared.md'), 'Linked nested rule\n');
  write(join(sharedRules, 'reports/excluded.md'), 'Pruned linked snapshot\n');
  const linkedRules = join(root, '.claude/rules/shared');
  symlinkSync(sharedRules, linkedRules);
  const ruleTarget = write(join(base, 'shared-file.md'), '---\npaths: ["lib/**"]\n---\nLinked file\n');
  const linkedRuleFile = join(root, '.claude/rules/linked-file.md');
  symlinkSync(ruleTarget, linkedRuleFile);
  const rootRulesTarget = join(base, 'root-rules');
  write(join(rootRulesTarget, 'root.md'), 'Linked root rule\n');
  symlinkSync(rootRulesTarget, join(root, 'rules'));
  const linkedSkill = write(join(root, 'product/skills/linked/SKILL.md'), 'Linked-reference skill\n');
  const sharedReferences = join(base, 'shared-references');
  write(join(sharedReferences, 'nested/linked.md'), 'Linked reference 🌱\n');
  write(join(sharedReferences, 'reports/excluded.md'), 'Pruned reference snapshot\n');
  symlinkSync(sharedReferences, join(dirname(linkedSkill), 'references'));
  const linkedReferenceFile = join(root, 'product/skills/example/references/linked-file.md');
  symlinkSync(write(join(base, 'reference-file.md'), 'Linked file reference\n'), linkedReferenceFile);
  const privateTarget = join(base, 'private');
  write(join(privateTarget, 'rules/private.md'), 'Do not traverse unrelated linked trees\n');
  symlinkSync(privateTarget, join(root, 'unrelated-link'));
  const linkedResult = scan();
  const linkedPaths = [
    join(linkedRules, 'nested/shared.md'), linkedRuleFile, join(root, 'rules/root.md'), linkedSkill,
    join(dirname(linkedSkill), 'references/nested/linked.md'), linkedReferenceFile,
  ];
  assert.deepEqual(linkedResult.files.map(row => row.path).sort(), [...Object.keys(rows), ...linkedPaths].sort(),
    'THEN linked files/directories remain discoverable while prune and unrelated-link boundaries hold');
  assert.deepEqual(linkedResult.measurement, result.measurement,
    'THEN linked potential inventory still makes no actual-loading claim');
  assert.deepEqual(linkedResult.scan_issues, [], 'THEN successful linked discovery reports no invented issues');
  const linkedRows = Object.fromEntries(linkedResult.files.map(row => [row.path, row]));
  const expectedLinkedRows = [
    [linkedPaths[0], 'always-on', 'Linked nested rule\n', 'unscoped-rule'],
    [linkedPaths[1], 'always-on', '---\npaths: ["lib/**"]\n---\nLinked file\n', 'path-scoped-rule'],
    [linkedPaths[2], 'always-on', 'Linked root rule\n', 'unscoped-rule'],
    [linkedPaths[3], 'per-invocation', 'Linked-reference skill\n', 'invoked-skill'],
    [linkedPaths[4], 'per-invocation', 'Linked reference 🌱\n', 'on-demand'],
    [linkedPaths[5], 'per-invocation', 'Linked file reference\n', 'on-demand'],
  ].map(([path, tier, text, loading]) => ({
    path, root: 'project', tier, kind: 'file', bytes: Buffer.byteLength(text),
    tokens: Math.floor(Buffer.byteLength(text) / 4), estimated: false, loading,
  }));
  assert.deepEqual(linkedPaths.map(path => linkedRows[path]), expectedLinkedRows,
    'THEN every linked row preserves exact logical path, loading, bytes and token proxy');

  // GIVEN a link cycle WHEN scanning THEN traversal terminates and any native discovery issue is explicit.
  const cycle = join(root, '.claude/rules/cycle');
  symlinkSync(join(root, '.claude/rules'), cycle);
  const cycleProbe = spawnSync('find', ['-L', join(root, '.claude/rules'), '-type', 'f', '-name', '*.md'], { encoding: 'utf8' });
  const nativeCycleIssue = Number(cycleProbe.status !== 0 || cycleProbe.stderr.length !== 0);
  const cyclicResult = scan([], nativeCycleIssue * 2);
  assert.deepEqual(cyclicResult.files, linkedResult.files, 'THEN cycle detection retains every available inventory row');
  assert.deepEqual(cyclicResult.scan_issues.map(({ root: label, path, kind }) => ({ root: label, path, kind })),
    Array(nativeCycleIssue).fill({ root: 'project', path: join(root, '.claude/rules'), kind: 'discovery-incomplete' }),
    'THEN silently skipped cycles invent no errors while native issues identify the instruction root');
  assert.deepEqual(cyclicResult.scan_issues.map(issue => issue.exit_status), Array(nativeCycleIssue).fill(cycleProbe.status),
    'THEN cycle diagnostics preserve native find status across platform behavior');
  rmSync(cycle);

  // GIVEN a find error after partial discovery WHEN scanning THEN stderr is valid JSON and exit is nonzero.
  const findCommand = spawnSync('bash', ['-c', 'command -v find'], { encoding: 'utf8' });
  assert.equal(findCommand.status, 0, 'GIVEN the fixture has a real find executable');
  const bin = join(base, 'bin');
  const findShim = write(join(bin, 'find'), '#!/usr/bin/env bash\n"$SCAN_REAL_FIND" "$@"\nrc=$?\nif [ "$1" = "-L" ] && [ "$2" = "$SCAN_FAIL_PATH" ]; then printf \'fixture "discovery" failure\\nsecond\\tline\\n\' >&2; exit 7; fi\nexit "$rc"\n');
  chmodSync(findShim, 0o755);
  const failedPath = join(dirname(linkedSkill), 'references');
  const failedResult = scan([], 2, {
    PATH: `${bin}:${process.env.PATH}`, SCAN_REAL_FIND: findCommand.stdout.trim(), SCAN_FAIL_PATH: failedPath,
  });
  assert.deepEqual(failedResult.files, linkedResult.files, 'THEN a failed find retains its already discovered rows');
  assert.deepEqual(failedResult.scan_issues, [{
    root: 'project', path: failedPath, kind: 'discovery-incomplete', exit_status: 7, detail: 'fixture "discovery" failure\nsecond\tline',
  }], 'THEN discovery errors preserve escaped quotes, newline and tab without claiming success');
  console.log('PASS context scanner: recursive inventory, loading conditions, exact bytes, filters and exclusions');
} finally {
  rmSync(base, { recursive: true, force: true });
}
