#!/usr/bin/env node
/**
 * suite-templates.mjs — static gates on everything this skill SHIPS into a
 * consumer repo: the four workflow templates, the deploy-admin agent template,
 * SKILL.md and the reference docs.
 *
 * Covers BT-F09 (no `${{ }}` interpolation into shell/JS source, validated
 * inputs, no floating refs), BT-F18 (a failed health check exits non-zero),
 * BT-F08 (`git add -A` / `git push --tags` banned at every site) and the skill
 * frontmatter invariants from CLAUDE.md.
 *
 * Standalone: no network, no `gh`. YAML validity is proven by parsing every
 * fenced block with python3 + PyYAML (run.sh checks that prerequisite).
 *
 * Assertion policy: unconditional exact-equality / exact-set checks with a
 * description; no `if` gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, '..');
const TEMPLATES = join(SKILL, 'references', 'workflow-templates.md');
const AGENT_TPL = join(SKILL, 'templates', 'deploy-admin-agent.md.template');
const SKILL_MD = join(SKILL, 'SKILL.md');
const BEST = join(SKILL, 'references', 'release-best-practices.md');
const SAFETY = join(SKILL, 'references', 'safety-rules.md');
// The two shipped agents: distributed as-is, so the same string gates apply to them.
const DEPLOY_AGENT = join(SKILL, '..', '..', 'agents', 'deploy-admin.md');
const SSH_AGENT = join(SKILL, '..', '..', 'agents', 'ssh-admin.md');

// ── harness ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(`  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
  }
}

const tplText = readFileSync(TEMPLATES, 'utf8');
const agentText = readFileSync(AGENT_TPL, 'utf8');
const skillText = readFileSync(SKILL_MD, 'utf8');
const deployAgentText = readFileSync(DEPLOY_AGENT, 'utf8');

/** Fenced ```yaml blocks, in document order. */
function yamlBlocks(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (cur === null && line.trim() === '```yaml') { cur = []; continue; }
    if (cur !== null && line.trim() === '```') { out.push(cur.join('\n')); cur = null; continue; }
    if (cur !== null) cur.push(line);
  }
  return out;
}

/**
 * Bodies of every `run: |` and `script: |` literal block — the two places where
 * a `${{ }}` expression becomes source code before any parser sees it.
 */
function sourceBodies(block) {
  const lines = block.split('\n');
  const bodies = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(run|script):\s*\|\s*$/);
    if (!m) continue;
    const indent = m[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') { body.push(l); continue; }
      const li = l.length - l.replace(/^\s*/, '').length;
      if (li <= indent) break;
      body.push(l);
    }
    bodies.push({ kind: m[2], body: body.join('\n') });
  }
  return bodies;
}

const blocks = yamlBlocks(tplText);
check('yaml.count', blocks.length, 4, 'the reference ships exactly four workflow templates');

// ── 1. BT-F09: no expression interpolation into shell or JS source ─────────
{
  const offenders = [];
  blocks.forEach((b, i) => {
    for (const { kind, body } of sourceBodies(b)) {
      body.split('\n').forEach((l, n) => {
        if (l.includes('${{')) offenders.push(`T${i + 1}:${kind}:${n + 1}:${l.trim()}`);
      });
    }
  });
  check('f09.no-interpolation', offenders, [],
    'BT-F09: every context reaches shell/JS through env:, never pasted into the source by ${{ }}');
}
check('f09.input-validated', (tplText.match(/\^\[A-Za-z0-9\._-\]\{1,128\}\$/g) || []).length, 2,
  'the image_tag allowlist appears twice: the regex test and its ::error:: message');
check('f09.deployment-id-parsed', (tplText.match(/Number\.parseInt\(process\.env\.DEPLOYMENT_ID/g) || []).length, 2,
  'both deployment-status steps parse the id as an integer instead of pasting it into JS');
check('f09.no-pr-target', blocks.flatMap((b) => b.split('\n').filter((l) => l.includes('pull_request_target'))), [],
  'pull_request_target appears only in the prose that forbids it, never in a shipped workflow');
{
  const permBlocks = blocks.filter((b) => /^permissions:/m.test(b)).length;
  check('f09.permissions', permBlocks, 4, 'all four templates declare explicit minimal permissions');
}

// ── 2. pinning (~/.claude/rules/avoid.md #4) ──────────────────────────────
{
  const uses = [];
  for (const b of blocks) for (const l of b.split('\n')) {
    const m = l.match(/^\s*uses:\s*(\S+)\s*$/);
    if (m) uses.push(m[1]);
  }
  check('pin.uses-count', uses.length, 15, 'every step that uses an action is accounted for');
  check('pin.uses-set', [...new Set(uses)].sort(), [
    'actions/checkout@v7.0.1',
    'actions/github-script@v9.0.0',
    'appleboy/scp-action@v1.0.0',
    'appleboy/ssh-action@v1.2.5',
    'docker/build-push-action@v7.3.0',
    'docker/login-action@v4.6.0',
    'docker/setup-buildx-action@v4.2.0',
    'github/codeql-action/upload-sarif@v3.37.7',
    'softprops/action-gh-release@v3.0.2',
    '{{SCANNER_ACTION}}',
  ], 'every action is pinned to an exact vX.Y.Z verified at its source repo (the one placeholder is filled at generation)');
  check('pin.floating-refs', uses.filter((u) => /@(main|master|latest)$/.test(u) || /@v\d+$/.test(u)), [],
    'no @main, @master or bare major ref survives in a shipped template');
  const latestInYaml = blocks.flatMap((b, i) => b.split('\n')
    .filter((l) => l.includes('latest') && !l.includes('runs-on'))
    .map((l) => `T${i + 1}:${l.trim()}`));
  check('pin.no-latest-tag', latestInYaml, [],
    'BT-F09 bonus: neither the pushed image tags nor a workflow input default is floating `latest`');
  check('pin.scanner-example', (tplText.match(/aquasecurity\/trivy-action@v0\.36\.0/g) || []).length, 1,
    'the scanner example names an exact tag instead of @master');
}

// ── 3. BT-F18: a failed verification fails the step ───────────────────────
{
  const verify = blocks[1].split('\n');
  const start = verify.findIndex((l) => l.includes('name: Verify from runner'));
  const end = verify.findIndex((l, i) => i > start && /^\s{6}- name:/.test(l));
  const step = verify.slice(start, end).join('\n');
  check('f18.step-found', [start > -1, end > start], [true, true], 'the runner verification step is located in T2');
  check('f18.error-annotation', (step.match(/::error::/g) || []).length, 1,
    'BT-F18: the exhausted health loop emits ::error::, not ::warning::');
  check('f18.exits-nonzero', step.trim().endsWith('exit 1'), true,
    'BT-F18: the step ends in `exit 1`, so `if: success()` cannot post a successful deployment for a broken site');
  check('f18.no-warning-anywhere', blocks.flatMap((b) => b.split('\n').filter((l) => l.includes('::warning::'))), [],
    'no shipped template ends a verification in a warning');

  // The shipped agent is a third copy of the release procedure and drifted once:
  // it kept `gh run list -L 3` after the skill and the template were fixed.
  for (const [label, text] of [['agent-template', agentText], ['deploy-agent', deployAgentText]]) {
    check(`f18.ci-by-sha.${label}`, [
      (text.match(/select\(\.headSha == \\"\$SHA\\"\)/g) || []).length,
      (text.match(/gh run watch "\$RUN_ID" --exit-status/g) || []).length,
    ], [1, 1],
      'BT-F18: CI is verified by resolving the run for the pushed SHA and watching it with --exit-status');
    check(`f18.no-newest-rows.${label}`, text.split('\n').filter((l) => l.includes('gh run list -L 3') && !l.includes('never')), [],
      'BT-F18: `gh run list -L 3` survives only in the sentence forbidding it — an unrelated green run is not release success');
  }
}

// ── 4. BT-F08: banned git idioms at every shipped site ────────────────────
{
  // A banned idiom may only appear on a line that also carries ITS OWN correct
  // replacement or the word "banned" — i.e. as documentation of the ban, never
  // as an instruction to run it. The pairing is per idiom: a shared allowlist
  // let `git push --tags && git push origin HEAD` clear the check on the
  // strength of the unrelated second half.
  const banned = [
    { re: /git add -A/, paired: /banned|git add -- / },
    { re: /git push --tags/, paired: /banned|git push origin refs\/tags\// },
  ];
  for (const [label, file] of [
    ['skill', SKILL_MD], ['agent-template', AGENT_TPL], ['best-practices', BEST], ['safety-rules', SAFETY],
    ['deploy-agent', DEPLOY_AGENT], ['ssh-agent', SSH_AGENT],
  ]) {
    const offending = readFileSync(file, 'utf8').split('\n')
      .filter((l) => banned.some((b) => b.re.test(l) && !b.paired.test(l)));
    check(`f08.banned.${label}`, offending, [],
      'BT-F08: `git add -A` / `git push --tags` survive only next to the replacement idiom or the word banned');
  }
  check('f08.explicit-push', (skillText.match(/git push origin "?refs\/tags\//g) || []).length, 3,
    'the skill names exactly the release tag at all three sites: the transaction, the rule table and the post-push irreversibility note');
  check('f08.agent-explicit-push', (agentText.match(/git push origin refs\/tags\//g) || []).length, 3,
    'the shipped agent template carries the same explicit-refspec idiom at all three sites');
  const gateIdx = skillText.indexOf('### Step 3: Confirmation Gate (BEFORE the first write)');
  const bumpIdx = skillText.indexOf('### Step 4: Bump Version (first write)');
  const changelogIdx = skillText.indexOf('### Step 5: Update Changelog');
  check('f08.gate-order', [gateIdx > -1, gateIdx < bumpIdx, bumpIdx < changelogIdx], [true, true, true],
    'BT-F08: the confirmation gate precedes BOTH writing steps, so Cancel leaves the tree untouched');
  check('f08.no-masked-exit', skillText.split('\n').filter((l) => /git (add|commit|tag|push)/.test(l) && l.includes('|| echo')), [],
    'BT-F08: no release git command masks its exit code behind `|| echo "FAILED"`');
}

// ── 5. approval-envelope contract in the shipped agent ────────────────────
{
  check('envelope.no-askuser', (agentText.match(/AskUserQuestion/g) || []).length, 1,
    'AskUserQuestion survives only in the sentence explaining that it is removed at runtime');
  check('envelope.tools', agentText.split('\n').filter((l) => l.startsWith('tools:')),
    ['tools: Read, Write, Edit, Bash, Grep, Glob'],
    'the generated agent no longer declares a tool it cannot have');
  check('envelope.block', (agentText.match(/## APPROVAL REQUIRED/g) || []).length, 2,
    'the approval block is specified once and referenced once by the emergency stop');
  check('envelope.fields', ['COMMAND:', 'HOST:', 'EFFECT:', 'ROLLBACK:', 'EVIDENCE:', 'PRECONDITION:']
    .filter((f) => agentText.includes(f)).length, 6, 'all six envelope fields are specified');
  check('envelope.skill-side', (skillText.match(/## APPROVAL REQUIRED/g) || []).length, 1,
    'the skill documents the same envelope it will receive back from a spawned agent');
  check('envelope.approved-token', [agentText.includes('APPROVED:'), skillText.includes('APPROVED:')], [true, true],
    'both halves name the approval token as the only authorization to execute');
  check('envelope.no-body-secret', (agentText.match(/gh secret set \w+ --body/g) || []).length, 0,
    'the agent never writes a secret value on a command line');
  // `APPROVED: A1 A3` is what the caller sends back, so every copy of the
  // contract must number its envelopes the same way.
  for (const [label, file] of [['deploy-agent', DEPLOY_AGENT], ['ssh-agent', SSH_AGENT]]) {
    const lines = readFileSync(file, 'utf8').split('\n');
    check(`envelope.ids.${label}`, [
      lines.filter((l) => l === '### A1').length,
      lines.filter((l) => l.trim() === '1.').length,
    ], [1, 0],
      'the shipped agent numbers its envelopes `### A1`, matching the `APPROVED: A1 A3` round-trip');
  }
}

// ── 6. skill invariants (CLAUDE.md) ───────────────────────────────────────
{
  const fm = skillText.split('---')[1].split('\n').filter((l) => l.trim() !== '');
  check('skill.fm-keys', fm.map((l) => l.split(':')[0]),
    ['name', 'description', 'user-invocable', 'disable-model-invocation', 'argument-hint', 'allowed-tools', 'model'],
    'frontmatter carries the seven keys in the mandated order');
  check('skill.name', fm[0], 'name: deploy', 'the name is bare and equals the directory name');
  check('skill.invocation', [fm[2], fm[3]], ['user-invocable: true', 'disable-model-invocation: true'],
    'user-invoked only — the model never auto-activates this skill');
  check('skill.plan-block', (skillText.match(/^PLAN — brewtools:deploy$/m) || []).length, 1,
    'the prompt contract PLAN block is present exactly once');
}

// ── 7. every template is valid YAML ───────────────────────────────────────
{
  const dir = mkdtempSync(join(tmpdir(), 'deploy-yaml-'));
  const files = blocks.map((b, i) => {
    // Placeholders are filled at generation time; substitute them so the
    // structure — not the token syntax — is what gets validated.
    const f = join(dir, `t${i + 1}.yml`);
    writeFileSync(f, b.replace(/\{\{[^}]*\}\}/g, 'PLACEHOLDER'));
    return f;
  });
  const py = spawnSync('python3', ['-c',
    'import sys,yaml\nfor f in sys.argv[1:]:\n    yaml.safe_load(open(f))\nprint("OK", len(sys.argv)-1)',
    ...files], { encoding: 'utf8' });
  check('yaml.parses', (py.stdout || '').trim(), 'OK 4',
    `all four templates parse as YAML (${(py.stderr || '').trim().split('\n').slice(-1)[0]})`);
  rmSync(dir, { recursive: true, force: true });
}

// ── report ─────────────────────────────────────────────────────────────────
console.log('suite-templates.mjs (BT-F08 / BT-F09 / BT-F18 + shipped-artifact invariants)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
