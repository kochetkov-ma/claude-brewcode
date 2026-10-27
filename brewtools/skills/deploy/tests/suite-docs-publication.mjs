#!/usr/bin/env node
// Exercise current docs-only publication guards with local API and command fixtures.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const YAML = { parse(input) {
  const parsed = spawnSync('python3', ['-c', 'import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin.read())))'], { input, encoding: 'utf8' });
  assert.equal(parsed.status, 0, 'GIVEN current workflow YAML WHEN parsed THEN it is valid');
  return JSON.parse(parsed.stdout);
} };

const workflowPaths = ['.github/workflows/docs.yml', '.github/workflows/deploy-docs.yml'];
const [docs, deploy] = workflowPaths.map(file => YAML.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const source = deploy.jobs.deploy.steps.find(step => step.name === 'Verify successful source build').with.script;
const guard = deploy.jobs.publication.steps[0].with.script;
const sha = 'a'.repeat(40);
const baseRun = {
  status: 'completed', conclusion: 'success', head_sha: sha, run_attempt: 2,
  event: 'workflow_dispatch', head_branch: 'main', head_repository: { full_name: 'owner/repo' },
  workflow_id: 7, id: 123,
};
const baseJob = {
  name: 'build', head_sha: sha, conclusion: 'success',
  steps: [{ name: 'Authorize manual docs publication', status: 'completed', conclusion: 'success' }],
};
let checks = 0;
function passed(name) { checks++; console.log(`PASS ${checks}: ${name}`); }

async function execute(script, {
  run = baseRun, jobs = [baseJob], version = '4.0.0-manual-123',
  workflowPath = '.github/workflows/docs.yml',
} = {}) {
  const checkAttempt = args => {
    assert.equal(args.run_id, 123, 'API correlation pins source build run 123');
    assert.equal(args.attempt_number, 2, 'API correlation pins source build attempt 2');
  };
  const github = {
    request: async (route, args) => { checkAttempt(args); return { data: run }; },
    rest: { actions: { getWorkflow: async () => ({ data: { path: workflowPath } }) } },
    paginate: async (route, args) => { checkAttempt(args); return jobs; },
  };
  return new AsyncFunction('github', 'context', 'process', script)(github, {
    repo: { owner: 'owner', repo: 'repo' }, eventName: 'workflow_run', payload: { workflow_run: run },
  }, { env: { BUILD_RUN_ID: '123', BUILD_ATTEMPT: '2', BUILD_SHA: sha, BUILD_VERSION: version } });
}

async function main() {
  // GIVEN valid publication provenance WHEN the extracted source verifier runs THEN accept the exact source attempt.
  await execute(source);
  passed('explicit main publication accepted');
  await execute(source, { run: { ...baseRun, event: 'push', head_branch: 'v4.0.0' }, version: '4.0.0' });
  passed('stable release source accepted');

  // GIVEN altered provenance WHEN the extracted source verifier runs THEN reject every altered case.
  for (const [name, change] of [
    ['skipped authorization gate rejected', { jobs: [{ ...baseJob, steps: [{ ...baseJob.steps[0], conclusion: 'skipped' }] }] }],
    ['failed authorization gate rejected', { jobs: [{ ...baseJob, steps: [{ ...baseJob.steps[0], conclusion: 'failure' }] }] }],
    ['missing authorization gate rejected', { jobs: [{ ...baseJob, steps: [] }] }],
    ['wrong job commit rejected', { jobs: [{ ...baseJob, head_sha: 'b'.repeat(40) }] }],
    ['non-main manual source rejected', { run: { ...baseRun, head_branch: 'feature' } }],
    ['wrong source commit rejected', { run: { ...baseRun, head_sha: 'b'.repeat(40) } }],
    ['wrong source attempt rejected', { run: { ...baseRun, run_attempt: 1 } }],
    ['failed source build rejected', { run: { ...baseRun, conclusion: 'failure' } }],
    ['fork source rejected', { run: { ...baseRun, head_repository: { full_name: 'fork/repo' } } }],
    ['wrong source workflow rejected', { workflowPath: '.github/workflows/other.yml' }],
    ['unsupported source event rejected', { run: { ...baseRun, event: 'pull_request' } }],
    ['wrong manual version run rejected', { version: '4.0.0-manual-124' }],
    ['prerelease push rejected', { run: { ...baseRun, event: 'push', head_branch: 'v4.0.0-beta' }, version: '4.0.0-beta' }],
  ]) {
    await assert.rejects(() => execute(source, change), undefined, name);
    passed(name);
  }

  // GIVEN source job evidence WHEN the extracted preflight guard runs THEN build-only sources skip deployment.
  assert.equal(await execute(guard), true, 'Explicit successful main publication passes preflight');
  passed('explicit main publication passes preflight');
  assert.equal(await execute(guard, { jobs: [{ ...baseJob, steps: [{ ...baseJob.steps[0], conclusion: 'skipped' }] }] }), false,
    'A skipped publication gate prevents build-only dispatch deployment');
  passed('build-only dispatch fails preflight');
  assert.equal(await execute(guard, { jobs: [] }), false, 'Missing job evidence prevents deployment');
  passed('missing jobs fail preflight');
  assert.equal(await execute(guard, { run: { ...baseRun, event: 'push', head_branch: 'v4.0.0' } }), true,
    'Stable release tags retain automatic publication authorization');
  passed('stable release passes preflight');
  assert.equal(await execute(guard, { run: { ...baseRun, event: 'push', head_branch: 'v4.0.0-beta' } }), false,
    'Prerelease tags cannot authorize docs deployment');
  passed('prerelease fails preflight');
  assert.equal(docs.true.workflow_dispatch.inputs.publish.default, false, 'Manual Docs runs default to build-only');
  passed('manual publication defaults to false');

  // GIVEN a requested source ref WHEN the extracted authorization shell runs THEN only main succeeds.
  const gate = docs.jobs.build.steps.find(step => step.name === 'Authorize manual docs publication').run;
  for (const [ref, status] of [['refs/heads/main', 0], ['refs/heads/feature', 1], ['refs/tags/v4.0.0', 1]]) {
    assert.equal(spawnSync('bash', ['-c', gate], { env: { ...process.env, GITHUB_REF: ref }, encoding: 'utf8' }).status, status,
      `Publication authorization for ${ref} exits ${status}`);
    passed(`authorization ref ${ref}: exit ${status}`);
  }

  // GIVEN an isolated manifest and fixed checkout SHA WHEN metadata runs THEN product and image versions remain distinct.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-version-evidence-'));
  try {
    fs.mkdirSync(path.join(fixture, 'brewcode/.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(fixture, 'bin'));
    fs.writeFileSync(path.join(fixture, 'bin/git'), `#!/bin/sh\n[ "$1" = rev-parse ] && [ "$2" = HEAD ] || exit 1\nprintf '%s\\n' '${sha}'\n`, { mode: 0o700 });
    const manifest = path.join(fixture, 'brewcode/.claude-plugin/plugin.json');
    fs.writeFileSync(manifest, JSON.stringify({ version: '6.12.5' }));
    const output = path.join(fixture, 'outputs');
    const env = {
      ...process.env, PATH: path.join(fixture, 'bin') + path.delimiter + process.env.PATH,
      GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_REF_NAME: 'main',
      GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', PUBLISH_REQUESTED: 'true',
      IMAGE: 'ghcr.io/example/docs', GITHUB_OUTPUT: output,
    };
    const compute = docs.jobs.build.steps.find(step => step.id === 'meta').run;
    const build = docs.jobs.build.steps.find(step => step.name === 'Build docs image');
    let result = spawnSync('bash', ['-c', compute], { cwd: fixture, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `Valid product manifest produces metadata: ${result.stderr}`);
    passed('metadata computation succeeds with valid manifest');
    const values = Object.fromEntries(fs.readFileSync(output, 'utf8').trim().split('\n').map(row => {
      const index = row.indexOf('='); return [row.slice(0, index), row.slice(index + 1)];
    }));
    assert.equal(values.product_version, '6.12.5', 'Product version equals the manifest version');
    passed('product version equals manifest 6.12.5');
    assert.equal(values.version, '6.12.5-manual-123', 'Image version includes its producing manual run');
    passed('image version includes manual run identity');
    assert.equal(values.publish, 'true', 'Metadata preserves the explicit publication request');
    passed('metadata preserves explicit publish request');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'web/docs/public/build-info.json'), 'utf8')), {
      version: '6.12.5-manual-123', sha, buildRunId: '123',
    }, 'Build-info retains exact version, checkout SHA, and producing run identity');
    passed('build-info retains exact synthetic image metadata');
    assert.equal(build.with['build-args'], 'VERSION=${{ steps.meta.outputs.product_version }}',
      'Docker VERSION receives the product version instead of the synthetic image version');
    passed('Docker VERSION receives product version');
    assert.match(build.with.labels, /org.opencontainers.image.version=\$\{\{ steps.meta.outputs.version \}\}/,
      'OCI image version retains the synthetic build identity');
    passed('image label retains synthetic image version');

    // GIVEN an invalid product version WHEN metadata runs THEN reject before publishing new outputs.
    fs.writeFileSync(manifest, JSON.stringify({ version: '6.12.5-manual-untrusted' }));
    result = spawnSync('bash', ['-c', compute], { cwd: fixture, env, encoding: 'utf8' });
    assert.equal(result.status, 1, 'Invalid product version fails metadata computation');
    passed('invalid product manifest exits 1');
    assert.match(result.stdout, /Invalid product version/, 'Invalid product version emits a descriptive refusal');
    passed('invalid product manifest emits explicit refusal');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  assert.equal(checks, 33, 'All 33 docs publication checks were executed');
  for (const file of workflowPaths) console.log(`SHA256 ${createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex')}  ${file}`);
  console.log(`PASS: ${checks} workflow checks`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
