#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const EMIT = join(HERE, '..', '..', 'superreview-setup', 'scripts', 'emit-intent-guard.sh');
const TEMPLATE = join(HERE, '..', '..', 'superreview-setup', 'references', 'intent-guard.toml.template');
const VERIFY = join(HERE, '..', 'scripts', 'verify-team.sh');
const FRAMEWORK = join(HERE, '..', 'references', 'framework-files.md');
const TRACE_OPS = join(HERE, '..', 'scripts', 'trace-ops.sh');
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

function runConcurrent(root) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [EMIT, root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, output }));
  });
}

function parse(path) {
  const result = spawnSync('python3', ['-c', 'import json,pathlib,sys,tomllib; print(json.dumps(tomllib.loads(pathlib.Path(sys.argv[1]).read_text()), sort_keys=True))', path], { encoding: 'utf8' });
  return { status: result.status, data: result.status === 0 ? JSON.parse(result.stdout) : null };
}

function makeBootstrap(root) {
  const teamDir = join(root, '.codex', 'teams', 'fresh');
  mkdirSync(teamDir, { recursive: true });
  const skill = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
  const meta = /brewcode-meta: version=([0-9]+\.[0-9]+\.[0-9]+) content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(skill);
  const date = '2026-08-27';
  const fenced = /## team\.md\n\n```markdown\n([\s\S]*?)\n```/.exec(readFileSync(FRAMEWORK, 'utf8'));
  const guardRow = '|intent-guard|--|Anti-drift check: what was ASKED vs what was DELIVERED|active|' + date + '|review-only|' + meta[1] + '|';
  const team = fenced[1]
    .replaceAll('{TEAM_NAME}', 'fresh')
    .replaceAll('{DATE}', date)
    .replaceAll('{LAST_UPDATED}', date)
    .replaceAll('{PLUGIN_VERSION}', meta[1])
    .replaceAll('{CONTENT_VERSION}', meta[2])
    .replaceAll('{N}', '0')
    .replaceAll('{CWD}', root)
    .replaceAll('{REPORT_ROOT}', '.codex/reports')
    .replaceAll('{INTENT_GUARD_POLICY}', 'required')
    .replaceAll('{INTENT_GUARD_SHARED_CONTRACT}', '`intent-guard` is review-only, keeps its own output contract, and never implements.')
    .replaceAll('{INTENT_GUARD_ROW}', guardRow) + '\n';
  writeFileSync(join(teamDir, 'team.md'), team);
  writeFileSync(join(teamDir, 'trace.jsonl'), '');
  copyFileSync(TRACE_OPS, join(teamDir, 'trace-ops.sh'));
  chmodSync(join(teamDir, 'trace-ops.sh'), 0o755);
}

function verify(root) {
  const result = spawnSync('bash', [VERIFY, 'fresh'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  return { status: result.status, output: (result.stdout || '') + (result.stderr || '') };
}

const template = parse(TEMPLATE);
check('template.parse', template.status, 0, 'shared native template is valid TOML');
check('template.keys', Object.keys(template.data).sort().join(','), 'description,developer_instructions,name', 'template has exactly three keys');
check('template.name', template.data.name, 'intent-guard', 'template name is fixed');
const emitterSource = readFileSync(EMIT, 'utf8');
check('emitter.normalizedAllowlist', emitterSource.includes('approved_contracts'), true, 'emitter uses a closed normalized contract allowlist');
check('emitter.noMutationVerbDenylist', emitterSource.includes('forbidden_action') || emitterSource.includes('weakening ='), false, 'emitter contains no mutation-verb denylist');
check('emitter.atomicNoReplace', emitterSource.includes('os.link(source, target)'), true, 'emitter publishes with atomic hard-link no-replace semantics');
check('emitter.noRenameOverwrite', emitterSource.includes('mv "$tmp" "$target"'), false, 'emitter never renames over an existing target');

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
  const root = mkdtempSync(join(tmpdir(), 'native-intent-bootstrap-'));
  makeBootstrap(root);
  const team = readFileSync(join(root, '.codex', 'teams', 'fresh', 'team.md'), 'utf8');
  const result = run(root);
  const verified = verify(root);
  check('bootstrap.zeroDomainRows', team.includes('|Agents|0|'), true, 'fresh bootstrap starts with zero domain rows');
  check('bootstrap.guardRow', team.match(/^\|intent-guard\|/gm)?.length, 1, 'fresh bootstrap carries exactly one required guard row');
  check('bootstrap.emit.exit', result.status, 0, 'fresh bootstrap emits the guard before full verification');
  check('bootstrap.verify.exit', verified.status, 0, 'full verifier passes after create-only guard emission');
  rmSync(root, { recursive: true, force: true });
}

for (const [name, instructions] of [
  ['templateContract', "REVIEW-ONLY.   COMPARE   WHAT   WAS   REQUESTED   WITH   WHAT   WAS   DELIVERED,   REPORT   CONCRETE   DRIFT   WITH   FILE:LINE   EVIDENCE.   NEVER   IMPLEMENT   AND   NEVER   MUTATE   PROJECT   FILES."],
  ['compactContract', "REVIEW-ONLY.   NEVER   IMPLEMENT   AND   NEVER   MUTATE   PROJECT   FILES.   REPORT   A   VERDICT   WITH   FILE:LINE   EVIDENCE."],
]) {
  const root = mkdtempSync(join(tmpdir(), 'native-intent-reuse-' + name + '-'));
  const agents = join(root, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const target = join(agents, 'intent-guard.toml');
  const existing = 'name = "intent-guard"\ndescription = "Existing review-only agent."\ndeveloper_instructions = ' + JSON.stringify(instructions) + '\n';
  writeFileSync(target, existing);
  const result = run(root);
  check(name + '.exit', result.status, 0, 'approved normalized existing regular file is reused');
  check(name + '.verdict', result.output.trim(), 'INTENT_GUARD: REUSE .codex/agents/intent-guard.toml', 'reuse verdict is explicit');
  check(name + '.bytes', readFileSync(target, 'utf8'), existing, 'reuse preserves existing bytes');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-directory-'));
  const target = join(root, '.codex', 'agents', 'intent-guard.toml');
  mkdirSync(target, { recursive: true });
  const result = run(root);
  check('existingDirectory.exit', result.status, 1, 'create-only emission rejects an existing directory');
  check('existingDirectory.reason', result.output.includes('non-symlink regular file'), true, 'directory failure names the accepted file kind');
  check('existingDirectory.preserved', statSync(target).isDirectory(), true, 'directory target remains untouched');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-dangling-'));
  const agents = join(root, '.codex', 'agents');
  const target = join(agents, 'intent-guard.toml');
  mkdirSync(agents, { recursive: true });
  symlinkSync('missing-intent-guard.toml', target);
  const result = run(root);
  check('danglingSymlink.exit', result.status, 1, 'create-only emission rejects a dangling symlink');
  check('danglingSymlink.reason', result.output.includes('non-symlink regular file'), true, 'dangling-symlink failure names the accepted file kind');
  check('danglingSymlink.preserved', readlinkSync(target), 'missing-intent-guard.toml', 'dangling symlink remains untouched');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-live-symlink-'));
  const agents = join(root, '.codex', 'agents');
  const target = join(agents, 'intent-guard.toml');
  const victim = join(agents, 'approved-victim.toml');
  mkdirSync(agents, { recursive: true });
  const bytes = readFileSync(TEMPLATE, 'utf8');
  writeFileSync(victim, bytes);
  symlinkSync('approved-victim.toml', target);
  const result = run(root);
  check('liveSymlink.exit', result.status, 1, 'create-only emission rejects a symlink to an approved regular file');
  check('liveSymlink.reason', result.output.includes('non-symlink regular file'), true, 'live-symlink failure names the accepted file kind');
  check('liveSymlink.preserved', readlinkSync(target), 'approved-victim.toml', 'live symlink remains untouched');
  check('liveSymlink.victimBytes', readFileSync(victim, 'utf8'), bytes, 'symlink victim remains byte-identical');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = mkdtempSync(join(tmpdir(), 'native-intent-concurrent-'));
  const attempts = await Promise.all(Array.from({ length: 12 }, () => runConcurrent(root)));
  const creates = attempts.filter(result => result.status === 0 && result.output.includes('INTENT_GUARD: CREATED'));
  const safeFollowers = attempts.filter(result =>
    (result.status === 0 && result.output.includes('INTENT_GUARD: REUSE')) ||
    (result.status !== 0 && result.output.includes('target appeared during create')));
  const target = join(root, '.codex', 'agents', 'intent-guard.toml');
  check('concurrent.oneCreate', creates.length, 1, 'exactly one concurrent invocation publishes the target');
  check('concurrent.followersSafe', safeFollowers.length, 11, 'every follower either safely reuses or loses atomic publication without mutation');
  check('concurrent.targetBytes', readFileSync(target, 'utf8'), readFileSync(TEMPLATE, 'utf8'), 'atomic publication and reuse never overwrite target bytes');
  check('concurrent.noTemps', readdirSync(join(root, '.codex', 'agents')).filter(name => name.startsWith('.intent-guard.')).length, 0, 'all private temp files are removed');
  rmSync(root, { recursive: true, force: true });
}

const approvedCompact = "Review-only. Never implement and never mutate project files. Report a verdict with file:line evidence.";
for (const [name, instructions, reason] of [
  ['emptyInstructions', '', 'contract mismatch'],
  ['hostileMutation', 'Review-only. Implement fixes and mutate project files. Report a verdict with file:line evidence.', 'contract mismatch'],
  ['missingOutput', 'Review-only. Never implement and never mutate project files.', 'contract mismatch'],
  ['suffixImplement', approvedCompact + ' Implement fixes after reporting.', 'contract mismatch'],
  ['suffixMutate', approvedCompact + ' Then mutate project files.', 'contract mismatch'],
  ['suffixApplyEdit', approvedCompact + ' Apply fixes and edit project files.', 'contract mismatch'],
  ['suffixWriteDelete', approvedCompact + ' You may write or delete project files.', 'contract mismatch'],
  ['suffixCreate', approvedCompact + ' Create project files after reporting.', 'contract mismatch'],
  ['suffixGenerate', approvedCompact + ' Generate replacement artifacts after reporting.', 'contract mismatch'],
  ['suffixRefactor', approvedCompact + ' Refactor the affected source after reporting.', 'contract mismatch'],
  ['suffixRemove', approvedCompact + ' Remove stale files after reporting.', 'contract mismatch'],
  ['suffixCommit', approvedCompact + ' Commit the repaired code after reporting.', 'contract mismatch'],
  ['suffixAlter', approvedCompact + ' Alter configuration after reporting.', 'contract mismatch'],
  ['suffixTouch', approvedCompact + ' Touch project files after reporting.', 'contract mismatch'],
  ['suffixExecute', approvedCompact + ' Execute remediation after reporting.', 'contract mismatch'],
  ['suffixProduce', approvedCompact + ' Produce a patch after reporting.', 'contract mismatch'],
  ['suffixShip', approvedCompact + ' Ship corrections after reporting.', 'contract mismatch'],
  ['suffixRewrite', approvedCompact + ' Rewrite tests after reporting.', 'contract mismatch'],
  ['suffixOverwrite', approvedCompact + ' Overwrite manifests after reporting.', 'contract mismatch'],
  ['suffixScaffold', approvedCompact + ' Scaffold missing modules after reporting.', 'contract mismatch'],
  ['suffixSynchronize', approvedCompact + ' Synchronize source files after reporting.', 'contract mismatch'],
]) {
  const root = mkdtempSync(join(tmpdir(), 'native-intent-' + name + '-'));
  const agents = join(root, '.codex', 'agents');
  mkdirSync(agents, { recursive: true });
  const target = join(agents, 'intent-guard.toml');
  const body = 'name = "intent-guard"\ndescription = "Review-only."\ndeveloper_instructions = ' + JSON.stringify(instructions) + '\n';
  writeFileSync(target, body);
  const result = run(root);
  check(name + '.exit', result.status, 1, 'invalid existing artifact fails closed');
  check(name + '.reason', result.output.includes(reason), true, 'failure names the structural defect');
  check(name + '.bytes', readFileSync(target, 'utf8'), body, 'failure never overwrites existing bytes');
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
  check(name + '.exit', result.status, 1, 'structurally invalid existing artifact fails closed');
  check(name + '.reason', result.output.includes(reason), true, 'failure names the structural defect');
  check(name + '.bytes', readFileSync(target, 'utf8'), body, 'failure never overwrites existing bytes');
  rmSync(root, { recursive: true, force: true });
}

console.log('suite-intent-guard.mjs');
for (const line of results) console.log(line);
console.log('  ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
