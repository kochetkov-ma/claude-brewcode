#!/usr/bin/env node
// Execute shipped CI producers/verifiers with local command/API fixtures; no daemon or network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const text = readFileSync(join(ROOT, 'brewtools/skills/deploy/references/workflow-templates.md'), 'utf8');
const fences = [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]);
const values = {
  WORKFLOW_NAME: 'Docs', CONCURRENCY_GROUP: 'docs', OWNER: 'kochetkov-ma',
  IMAGE_NAME: 'claude-brewcode-docs', DOCKER_CONTEXT: 'web/docs', UPSTREAM_WORKFLOW: 'Docs',
  HEALTH_CHECK_URL: 'https://doc-claude.brewcode.app/getting-started/',
  BUILD_INFO_URL: 'https://doc-claude.brewcode.app/build-info.json',
  INTERNAL_BUILD_INFO_URL: 'https://doc-claude.brewcode.app/build-info.json',
  INTERNAL_HEALTH_URL: 'https://doc-claude.brewcode.app/getting-started/',
  UPSTREAM_WORKFLOW_PATH: '.github/workflows/docs.yml', BUILT_HEALTH_PAGE: '/srv/getting-started/index.html',
  ENVIRONMENT: 'docs', SERVICE: 'docs', SERVICE_NAME: 'docs', TAG_VAR: 'DOCS_TAG',
  DEPLOY_FILES_SOURCE: 'web/docs/deploy/docker-compose.yml', DEPLOY_SYNC_DIR: 'brewcode-docs-sync',
  STRIP_COMPONENTS: '3', VPS_DEPLOY_PATH: '/opt/brewcode-docs', PUBLIC_URL: 'https://doc-claude.brewcode.app',
};
const expand = (str) => str.replace(/(?<!\$)\{\{([A-Z_]+)\}\}/g, (_, key) => values[key]);
const parse = (str) => {
  const result = spawnSync('python3', ['-c', 'import sys,yaml,json; print(json.dumps(yaml.safe_load(sys.stdin.read())))'], { input: str, encoding: 'utf8' });
  assert.equal(result.status, 0, 'GIVEN a shipped workflow WHEN parsed THEN YAML is valid');
  return JSON.parse(result.stdout);
};
const pairs = [
  ['source', parse(readFileSync(join(ROOT, '.github/workflows/docs.yml'), 'utf8')), parse(readFileSync(join(ROOT, '.github/workflows/deploy-docs.yml'), 'utf8'))],
  ['template', parse(expand(fences[0])), parse(expand(fences[1]))],
];
const step = (doc, name) => doc.jobs[Object.keys(doc.jobs)[0]].steps.find((item) => item.name === name);
const temp = mkdtempSync(join(tmpdir(), 'brewcode-provenance-'));
const bin = join(temp, 'bin');
mkdirSync(bin);
const SHA = 'a'.repeat(40), OTHER_SHA = 'b'.repeat(40);
const IMAGE = 'ghcr.io/kochetkov-ma/claude-brewcode-docs';
const DIGEST = IMAGE + '@sha256:' + 'c'.repeat(64);
const PAGE = '<html><footer>v1.2.3</footer><main>new documentation</main></html>';
const HASH = createHash('sha256').update(PAGE).digest('hex');
const info = { version: '1.2.3', sha: SHA, buildRunId: '123' };
writeFileSync(join(temp, 'page'), PAGE);
writeFileSync(join(temp, 'info'), JSON.stringify(info) + '\n');
writeFileSync(join(temp, 'bad-info'), JSON.stringify({ ...info, sha: OTHER_SHA }));
writeFileSync(join(temp, 'old-page'), '<html>old healthy site</html>');
const stub = (name, source) => writeFileSync(join(bin, name), '#!/usr/bin/env node\n' + source, { mode: 0o755 });
stub('git', `const args=process.argv.slice(2); process.stdout.write(args[0]==='describe'?'v1.2.3-2-gaaaaaaa\\n':process.env.FIX_SHA+'\\n');`);
stub('sleep', 'process.exit(0);');
stub('sed', `
const fs = require('node:fs'), { spawnSync } = require('node:child_process'), args=process.argv.slice(2);
switch(args[0]) {
  case '-i': {
    const [, expression, path] = args;
    const replacement = expression.split(':')[2];
    fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(/^DOCS_TAG=.*$/m, replacement));
    break;
  }
  default: process.exit(spawnSync('/usr/bin/sed', args, { stdio: 'inherit' }).status);
}
`);
stub('docker', `
const fs = require('node:fs'), args = process.argv.slice(2), fmt = args.at(-1);
// Mirrors the real CLI: config dir = DOCKER_CONFIG, else HOME/.docker; each call logs the config it saw.
const cfg = process.env.DOCKER_CONFIG || process.env.HOME + '/.docker', file = cfg + '/config.json';
const read = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
fs.appendFileSync(process.env.FIX_LOG, JSON.stringify({ args, cfg: process.env.DOCKER_CONFIG ?? null, config: read(),
  plugins: fs.existsSync(cfg + '/cli-plugins/docker-compose') })+'\\n');
const store = (mutate) => { const data = read() || {}; data.auths = data.auths || {}; mutate(data.auths);
  fs.mkdirSync(cfg, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };
const labels = {
  'org.opencontainers.image.revision': process.env.FIX_IMAGE_SHA,
  'org.opencontainers.image.version': process.env.FIX_VERSION,
  'io.brewcode.docs.build-run-id': process.env.FIX_RUN,
  'io.brewcode.docs.build-attempt': process.env.FIX_ATTEMPT,
};
switch(args[0]) {
  case 'image':
    switch(true) {
      case fmt.includes('RepoDigests'):
        process.stdout.write((process.env.FIX_ALIAS_DIGEST && args[2].includes(':sha-') ? process.env.FIX_ALIAS_DIGEST : process.env.FIX_DIGEST)+'\\n'); break;
      case fmt === '{{.Id}}': process.stdout.write('sha256:fixture-image\\n'); break;
      default: process.stdout.write(labels[Object.keys(labels).find(key=>fmt.includes(key))]+'\\n');
    }
    break;
  case 'inspect':
    process.stdout.write(fmt === '{{.Image}}' ? 'sha256:fixture-image\\n' : labels[Object.keys(labels).find(key=>fmt.includes(key))]+'\\n'); break;
  case 'run':
    process.stdout.write(args.includes('cat') ? fs.readFileSync(process.env.FIX_INFO, 'utf8') : process.env.FIX_HASH+'  /srv/getting-started/index.html\\n'); break;
  case 'compose':
    process.stdout.write(args[1]==='ps' ? 'fixture-container\\n' : ''); break;
  case 'login': {
    const secret = fs.readFileSync(0, 'utf8');
    fs.appendFileSync(process.env.FIX_STDIN_LOG, JSON.stringify(secret)+'\\n');
    if (secret) store((auths) => { auths[args[1]] = { auth: Buffer.from(args[3] + ':' + secret).toString('base64') }; });
    process.exitCode = secret ? 0 : 1; break;
  }
  case 'logout':
    if (read()) store((auths) => { delete auths[args[1]]; });
    break;
}
`);
stub('curl', `
const fs = require('node:fs');
process.exitCode = Number(process.env.FIX_CURL_EXIT || 0);
process.stdout.write(process.exitCode === 0 ? fs.readFileSync(process.argv.at(-1).includes('build-info.json') ? process.env.FIX_INFO : process.env.FIX_PAGE, 'utf8') : '');
`);
stub('cp', `
const { spawnSync } = require('node:child_process'), args=process.argv.slice(2);
process.exit(args.some(arg=>arg.startsWith('/tmp/brewcode-docs-sync')) ? 0 : spawnSync('/bin/cp', args).status);
`);
stub('rm', `
const { spawnSync } = require('node:child_process'), args=process.argv.slice(2);
process.exit(args.includes('/tmp/brewcode-docs-sync') ? 0 : spawnSync('/bin/rm', args).status);
`);
let count = 0;
const check = (actual, expected, why) => { assert.deepEqual(actual, expected, why); count++; };
// Stub VPS user: a shared config holding another stack's ghcr.io cred, and a per-user compose plugin.
const home = join(temp, 'home'), shared = join(home, '.docker/config.json');
const SHARED = JSON.stringify({ auths: { 'ghcr.io': { auth: Buffer.from('other-stack:kept-token').toString('base64') } } });
mkdirSync(join(home, '.docker/cli-plugins'), { recursive: true });
writeFileSync(join(home, '.docker/cli-plugins/docker-compose'), 'plugin');
const { DOCKER_CONFIG: _inherited, ...hostEnv } = process.env;
const base = {
  ...hostEnv, HOME: home, PATH: bin + ':' + process.env.PATH, IMAGE,
  FIX_SHA: SHA, FIX_IMAGE_SHA: SHA, FIX_VERSION: '1.2.3', FIX_RUN: '123', FIX_ATTEMPT: '1', GITHUB_RUN_ATTEMPT: '1',
  FIX_DIGEST: DIGEST, FIX_INFO: join(temp, 'info'), FIX_PAGE: join(temp, 'page'),
  FIX_HASH: HASH, FIX_LOG: join(temp, 'commands.log'), FIX_STDIN_LOG: join(temp, 'login-stdin.log'),
};
const GHCR_USER = 'fixture-actor', GHCR_TOKEN = 'fixture-ghcr-token-value';
const LOGIN = 'login ghcr.io -u ' + GHCR_USER + ' --password-stdin', PULL = 'compose pull docs';
const JOB_AUTH = { auths: { 'ghcr.io': { auth: Buffer.from(GHCR_USER + ':' + GHCR_TOKEN).toString('base64') } } };
// Template mirrors source: job-token login into a private DOCKER_CONFIG before any pull (6.5.1 F5, F11).
const SEEDED = { auths: { 'ghcr.io': {} } };
const reset = () => { writeFileSync(base.FIX_LOG, ''); writeFileSync(base.FIX_STDIN_LOG, ''); writeFileSync(shared, SHARED); };
const lines = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const isRegistry = ({ args }) => ['login', 'logout'].includes(args[0]) || (args[0] === 'compose' && args[1] === 'pull');
const registryEvents = () => lines(base.FIX_LOG).filter(isRegistry).map(({ args }) => args.join(' '));
const registryCalls = () => lines(base.FIX_LOG).filter(isRegistry).map(({ args, ...seen }) => ({ call: args.join(' '), ...seen }));
const configDirs = () => [...new Set(lines(base.FIX_LOG).map(({ cfg }) => cfg))];
const bash = (body, env, cwd) => spawnSync('/bin/bash', ['-c', body], { cwd, env: { ...base, ...env }, encoding: 'utf8' });
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
async function api(body, env, runPatch = {}, workflowPatch = {}) {
  const saved = { ...process.env }, deployments = [], requests = [];
  Object.assign(process.env, env);
  const github = {
    request: async (route, params) => { requests.push({ route, params }); return { data: {
      status: 'completed', conclusion: 'success', head_sha: SHA, run_attempt: 1,
      event: 'push', head_branch: 'v1.2.3', head_repository: { full_name: 'kochetkov-ma/claude-brewcode' }, workflow_id: 9,
      ...runPatch,
    }}; },
    rest: {
    actions: {
      getWorkflowRun: async () => { throw new Error('Latest run row is intentionally unusable; verify the artifact attempt'); },
      getWorkflow: async () => ({ data: { path: '.github/workflows/docs.yml', ...workflowPatch } }),
    },
    repos: {
      createDeployment: async (data) => { deployments.push(data); return { data: { id: 10 } }; },
      createDeploymentStatus: async () => ({}),
    },
  }};
  try {
    await new AsyncFunction('github', 'context', body)(github, {
      repo: { owner: 'kochetkov-ma', repo: 'claude-brewcode' }, sha: OTHER_SHA, runId: 456, serverUrl: 'https://github.com',
    });
    return { status: 0, deployments, requests };
  } catch { return { status: 1, deployments, requests }; }
  finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}
try {
  for (const [label, producer, consumer] of pairs) {
    const cwd = join(temp, label), output = join(cwd, 'output');
    mkdirSync(cwd);
    writeFileSync(output, '');
    // GIVEN the actual producer WHEN building a release THEN its metadata feeds the verifier unchanged.
    check(bash(step(producer, 'Compute image tags').run, {
      GITHUB_OUTPUT: output, GITHUB_REF: 'refs/tags/v1.2.3', GITHUB_REF_NAME: 'v1.2.3', GITHUB_RUN_ID: '123', GITHUB_SHA: OTHER_SHA,
    }, cwd).status, 0, label + ': release producer succeeds');
    const metadataPath = join(cwd, 'web/docs/public/build-info.json');
    check(JSON.parse(readFileSync(metadataPath, 'utf8')), info, label + ': exact version/SHA/run JSON');
    check(readFileSync(output, 'utf8').split('\n').filter(Boolean), [
      'tags=' + IMAGE + ':1.2.3,' + IMAGE + ':sha-' + SHA + '-123-1', 'version=1.2.3', 'sha=' + SHA,
    ], label + ': bounded tags and actual checkout SHA');
    check(step(producer, 'Build and push').with.labels.trim().split('\n').sort(), [
      'io.brewcode.docs.build-attempt=${{ github.run_attempt }}',
      'io.brewcode.docs.build-run-id=${{ github.run_id }}',
      'org.opencontainers.image.revision=${{ steps.meta.outputs.sha }}',
      'org.opencontainers.image.version=${{ steps.meta.outputs.version }}',
    ], label + ': OCI labels use the same producer fields');
    // GIVEN the same commit/run WHEN rerun THEN the attempt creates a distinct deployment alias.
    writeFileSync(output, '');
    check(bash(step(producer, 'Compute image tags').run, {
      GITHUB_OUTPUT: output, GITHUB_REF: 'refs/tags/v1.2.3', GITHUB_REF_NAME: 'v1.2.3', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
    }, cwd).status, 0, label + ': rerun producer succeeds');
    check(readFileSync(output, 'utf8').split('\n').filter(Boolean), [
      'tags=' + IMAGE + ':1.2.3,' + IMAGE + ':sha-' + SHA + '-123-2', 'version=1.2.3', 'sha=' + SHA,
    ], label + ': second attempt publishes its own alias');
    check(JSON.parse(readFileSync(metadataPath, 'utf8')), info,
      label + ': rerun preserves the public three-field metadata contract');
    check(bash(step(producer, 'Compute image tags').run, {
      GITHUB_OUTPUT: output, GITHUB_REF: 'refs/tags/v1.2.3;touch HACKED',
      GITHUB_REF_NAME: 'v1.2.3;touch HACKED', GITHUB_RUN_ID: '123',
    }, cwd).status, 1, label + ': malformed release ref fails');
    // GIVEN untrusted input WHEN routing THEN only bounded version/SHA-run tags survive.
    for (const [tag, status] of [
      ['1.2.3', 0], ['1.2.3-feature-2', 0], ['sha-' + SHA + '-123-1', 0],
      ['latest', 1], ['main', 1], ['stable', 1], ['', 1], ['1.2.3$(touch HACKED)', 1],
      ['1.2.3\nvalue=bad', 1], ['1.2.3-' + 'x'.repeat(128), 1],
    ]) {
      check(bash(step(consumer, 'Resolve image tag').run, {
        EVENT_NAME: 'workflow_dispatch', INPUT_TAG: tag, GITHUB_OUTPUT: output,
      }, cwd).status, status, label + ': manual tag ' + JSON.stringify(tag));
    }
    check(bash(step(consumer, 'Resolve image tag').run, {
      EVENT_NAME: 'workflow_run', UPSTREAM_SHA: SHA, UPSTREAM_RUN_ID: '123', UPSTREAM_RUN_ATTEMPT: '1', UPSTREAM_REF: 'v1.2.3', GITHUB_OUTPUT: output,
    }, cwd).status, 0, label + ': upstream run selects SHA/run alias');
    // GIVEN producer-shaped labels/metadata WHEN verifying THEN any mismatch fails closed.
    const imageEnv = { REQUEST_TAG: '1.2.3', UPSTREAM_SHA: SHA, UPSTREAM_RUN_ID: '123', UPSTREAM_RUN_ATTEMPT: '1', GITHUB_OUTPUT: output, FIX_INFO: metadataPath };
    for (const [name, changes, expected] of [
      ['valid', {}, 0], ['head SHA', { UPSTREAM_SHA: OTHER_SHA }, 1],
      ['run ID', { UPSTREAM_RUN_ID: '456' }, 1], ['missing label', { FIX_RUN: '' }, 1],
      ['build attempt', { UPSTREAM_RUN_ATTEMPT: '2' }, 1], ['missing attempt label', { FIX_ATTEMPT: '' }, 1],
      ['alias digest', { FIX_ALIAS_DIGEST: IMAGE + '@sha256:' + 'd'.repeat(64) }, 1],
      ['metadata SHA', { FIX_INFO: join(temp, 'bad-info') }, 1],
    ]) {
      check(bash(step(consumer, 'Verify image provenance').run, { ...imageEnv, ...changes }, cwd).status,
        expected, label + ': image ' + name);
    }
    // GIVEN the run API WHEN correlating THEN wrong source, workflow or status fails.
    for (const [name, runPatch, workflowPatch, expected] of [
      ['valid', {}, {}, 0], ['SHA', { head_sha: OTHER_SHA }, {}, 1],
      ['attempt', { run_attempt: 2 }, {}, 1],
      ['failure', { conclusion: 'failure' }, {}, 1], ['in progress', { status: 'in_progress' }, {}, 1],
      ['fork', { head_repository: { full_name: 'outsider/fork' } }, {}, 1],
      ['other event', { event: 'pull_request' }, {}, 1], ['other workflow', {}, { path: '.github/workflows/release.yml' }, 1],
    ]) {
      check((await api(step(consumer, 'Verify successful source build').with.script,
        { BUILD_SHA: SHA, BUILD_RUN_ID: '123', BUILD_ATTEMPT: '1', BUILD_VERSION: '1.2.3' }, runPatch, workflowPatch)).status,
        expected, label + ': source build ' + name);
    }
    const correlated = await api(step(consumer, 'Verify successful source build').with.script,
      { BUILD_SHA: SHA, BUILD_RUN_ID: '123', BUILD_ATTEMPT: '1', BUILD_VERSION: '1.2.3' });
    check(correlated.requests, [{
      route: 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}',
      params: { owner: 'kochetkov-ma', repo: 'claude-brewcode', run_id: 123, attempt_number: 1 },
    }], label + ': API request pins the successful image attempt instead of the potentially advanced latest row');
    const deployment = await api(step(consumer, 'Create deployment').with.script, {
      BUILD_SHA: SHA, IMAGE_TAG: 'sha-' + SHA + '-123-1', IMAGE_DIGEST: DIGEST, BUILD_RUN_ID: '123', BUILD_ATTEMPT: '1',
    });
    check(deployment.deployments[0].ref, SHA, label + ': deployment uses artifact SHA despite callback SHA');
    check(deployment.deployments[0].payload, { imageDigest: DIGEST, buildRunId: '123', buildAttempt: '1' },
      label + ': deployment records digest and producing run');
    // GIVEN the resolved artifact SHA WHEN checking the actual checkout THEN a callback SHA cannot replace it.
    check(bash(step(consumer, 'Verify checkout').run, { BUILD_SHA: SHA }, cwd).status, 0,
      label + ': matching artifact checkout passes');
    check(bash(step(consumer, 'Verify checkout').run, { BUILD_SHA: OTHER_SHA }, cwd).status, 1,
      label + ': mismatched actual checkout fails');
    const verifierEnv = { EXPECTED_SHA: SHA, EXPECTED_VERSION: '1.2.3', EXPECTED_RUN: '123',
      EXPECTED_PAGE_HASH: HASH, HEALTH_URL: values.HEALTH_CHECK_URL, BUILD_INFO_URL: values.BUILD_INFO_URL, FIX_INFO: metadataPath };
    for (const [name, changes, expected] of [
      ['valid', {}, 0], ['healthy old metadata', { FIX_INFO: join(temp, 'bad-info') }, 1],
      ['healthy old HTML', { FIX_PAGE: join(temp, 'old-page') }, 1], ['unhealthy', { FIX_CURL_EXIT: '22' }, 1],
    ]) {
      check(bash(step(consumer, 'Verify from runner').run, { ...verifierEnv, ...changes }, cwd).status,
        expected, label + ': served ' + name);
    }
    // GIVEN a started service WHEN verification fails THEN rollback is attempted and failure stays nonzero.
    const remoteStep = consumer.jobs.deploy.steps.find((item) => item.uses?.startsWith('appleboy/ssh-action'));
    const remote = remoteStep.with.script.replace('DOCS_PATH=/opt/brewcode-docs', 'DOCS_PATH="' + cwd + '"');
    const remoteEnv = { ...verifierEnv, TAG: 'sha-' + SHA + '-123-1', EXPECTED_DIGEST: DIGEST, EXPECTED_ATTEMPT: '1', GHCR_USER, GHCR_TOKEN };
    const PRIVATE = /^\/tmp\/ghcr-auth\.[A-Za-z0-9]{8}$/;
    // GIVEN one run WHEN docker is called THEN every call shares one fresh private dir, gone after exit.
    const privateDir = (name) => {
      const dirs = configDirs();
      check([dirs.length, PRIVATE.test(dirs[0])], [1, true], label + ': remote ' + name + ' one fresh DOCKER_CONFIG ' + dirs);
      check([PRIVATE.test(String(dirs[0])), existsSync(String(dirs[0]))], [true, false],
        label + ': remote ' + name + ' private DOCKER_CONFIG removed on exit');
      check(readFileSync(shared, 'utf8'), SHARED, label + ': remote ' + name + ' shared ~/.docker/config.json never written');
      check(readFileSync(join(home, '.docker/cli-plugins/docker-compose'), 'utf8'), 'plugin',
        label + ': remote ' + name + ' cleanup never follows the linked user cli-plugins');
      return dirs[0];
    };
    for (const [name, changes, expected, restoredTag, pulls] of [
      ['valid', {}, 0, 'DOCS_TAG=sha-' + SHA + '-123-1\n', [PULL]],
      ['metadata mismatch', { FIX_INFO: join(temp, 'bad-info') }, 1, 'DOCS_TAG=1.2.2\n', [PULL, PULL]],
      ['runtime label mismatch', { FIX_IMAGE_SHA: OTHER_SHA }, 1, 'DOCS_TAG=1.2.2\n', [PULL, PULL]],
      ['runtime attempt mismatch', { FIX_ATTEMPT: '2' }, 1, 'DOCS_TAG=1.2.2\n', [PULL, PULL]],
    ]) {
      writeFileSync(join(cwd, '.env'), 'DOCS_TAG=1.2.2\n');
      reset();
      const result = bash(remote, { ...remoteEnv, ...changes }, cwd);
      check(result.status, expected, label + ': remote ' + name + ' ' + result.stderr);
      check(readFileSync(join(cwd, '.env'), 'utf8'), restoredTag, label + ': remote ' + name + ' version selection');
      const cfg = privateDir(name);
      // Exact order and config: seeded login first, then deploy and rollback pulls with the job cred; no logout.
      check(registryCalls(), [
        { call: LOGIN, cfg, config: SEEDED, plugins: true },
        ...pulls.map((call) => ({ call, cfg, config: JOB_AUTH, plugins: true })),
      ], label + ': remote ' + name + ' GHCR login/pull run with the private DOCKER_CONFIG');
      check(lines(base.FIX_STDIN_LOG), [GHCR_TOKEN], label + ': remote ' + name + ' token reaches docker login via stdin');
      check(readFileSync(base.FIX_LOG, 'utf8').includes(GHCR_TOKEN), false, label + ': remote ' + name + ' token never in docker argv');
    }
    // GIVEN no job token WHEN the remote script starts THEN source and template fail before any pull or .env edit.
    writeFileSync(join(cwd, '.env'), 'DOCS_TAG=1.2.2\n');
    reset();
    const tokenless = bash(remote, { ...remoteEnv, GHCR_TOKEN: undefined }, cwd);
    check(tokenless.status, 1, label + ': remote without GHCR_TOKEN fails closed ' + tokenless.stderr);
    check(registryEvents(), [LOGIN], label + ': remote without GHCR_TOKEN pulls nothing after a failed login');
    privateDir('without GHCR_TOKEN');
    check(lines(base.FIX_STDIN_LOG), [''], label + ': remote without GHCR_TOKEN sends an empty stdin');
    check(readFileSync(join(cwd, '.env'), 'utf8'), 'DOCS_TAG=1.2.2\n',
      label + ': remote without GHCR_TOKEN leaves the previous version selected');
    // GIVEN a branch ref WHEN deriving its version THEN routing keeps the original bounded branch policy.
    check(bash(step(producer, 'Compute image tags').run, {
      GITHUB_OUTPUT: output, GITHUB_REF: 'refs/heads/feature/one', GITHUB_REF_NAME: 'feature/one', GITHUB_RUN_ID: '123',
    }, cwd).status, 0, label + ': branch producer succeeds');
    check(JSON.parse(readFileSync(metadataPath, 'utf8')), { ...info, version: '1.2.3-feature-one-2' },
      label + ': branch metadata matches sanitized branch and git describe distance');
    check(bash(step(producer, 'Compute image tags').run, {
      GITHUB_OUTPUT: output, GITHUB_REF: 'refs/heads/feature/one', GITHUB_REF_NAME: 'feature$(touch HACKED)', GITHUB_RUN_ID: '123',
    }, cwd).status, 0, label + ': untrusted branch text stays data during sanitization');
    check(existsSync(join(cwd, 'HACKED')), false, label + ': malicious ref/tag input never executes');
  }
  // GIVEN the shipped deploy workflow and template WHEN the producing build is not a release tag THEN nothing deploys.
  for (const [label, , deploy] of pairs) {
    const gateDir = join(temp, label + '-gate');
    mkdirSync(gateDir);
    for (const [ref, status] of [['v1.2.3', 0], ['v1.2.3-rc.1', 0], ['feature/one', 1], ['main', 1], ['', 1]]) {
      check(bash(step(deploy, 'Resolve image tag').run, {
        EVENT_NAME: 'workflow_run', UPSTREAM_SHA: SHA, UPSTREAM_RUN_ID: '123', UPSTREAM_RUN_ATTEMPT: '1', UPSTREAM_REF: ref,
        GITHUB_OUTPUT: join(gateDir, 'output'),
      }, gateDir).status, status, label + ': upstream ref ' + JSON.stringify(ref));
    }
    for (const [name, headBranch, version, expected] of [
      ['release tag', 'v1.2.3', '1.2.3', 0], ['branch preview', 'feature/one', '1.2.3-feature-one-2', 1],
      ['tag-named branch', 'v1.2.3', '1.2.3-v1.2.3-2', 1], ['other tag', 'v1.2.4', '1.2.3', 1],
    ]) {
      check((await api(step(deploy, 'Verify successful source build').with.script,
        { BUILD_SHA: SHA, BUILD_RUN_ID: '123', BUILD_ATTEMPT: '1', BUILD_VERSION: version }, { head_branch: headBranch })).status,
        expected, label + ': source build ' + name);
    }
    check(deploy.jobs.deploy.if.includes("startsWith(github.event.workflow_run.head_branch, 'v')"), true,
      label + ': a branch-triggered upstream run skips the deploy job');
    check(deploy.jobs.deploy.if.includes("github.event.workflow_run.event == 'push'"), true,
      label + ': only a push-triggered upstream build deploys');
  }
  // GIVEN live release.yml + footer WHEN its changelog step runs as Actions does THEN body = section + --- + footer in RUNNER_TEMP (H3).
  const releaseSrc = readFileSync(process.env.RELEASE_YML || join(ROOT, '.github/workflows/release.yml'), 'utf8');
  const release = parse(releaseSrc), relStep = step(release, 'Extract changelog for tag version').run;
  const footer = readFileSync(join(ROOT, '.github/release-footer.md'), 'utf8');
  const NOTES = '## v9.8.7 (2026-10-13)\n- fixture note\n\n## v9.8.6 (2026-10-12)\n- older\n';
  // Actions default `run:` shell (no `shell:` key, no `set -e` in the body): errexit + pipefail.
  const actionsBash = (body, env, cwd) => spawnSync('/bin/bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', body],
    { cwd, env: { ...base, ...env }, encoding: 'utf8' });
  const relDir = join(temp, 'release'), runnerTemp = join(temp, 'runner-temp');
  mkdirSync(join(relDir, '.github'), { recursive: true }); mkdirSync(runnerTemp);
  writeFileSync(join(relDir, 'RELEASE-NOTES.md'), NOTES);
  writeFileSync(join(relDir, '.github/release-footer.md'), footer);
  const relRun = actionsBash(relStep, { GITHUB_REF_NAME: 'v9.8.7', GITHUB_OUTPUT: join(relDir, 'output'), RUNNER_TEMP: runnerTemp }, relDir);
  const relBody = join(runnerTemp, 'release-body.md');
  check(existsSync(relBody), true, 'release.yml: step writes $RUNNER_TEMP/release-body.md ' + relRun.stderr);
  const builtBody = readFileSync(relBody, 'utf8');
  check({
    status: relRun.status, stderr: relRun.stderr, runnerTemp: spawnSync('ls', [runnerTemp], { encoding: 'utf8' }).stdout,
    body: builtBody,
    bodyPath: step(release, 'Create GitHub Release').with.body_path,
    fixedTmp: releaseSrc.split('\n').filter((line) => line.includes('/tmp')),
  }, {
    status: 0, stderr: '', runnerTemp: 'release-body.md\n',
    body: '## v9.8.7 (2026-10-13)\n- fixture note\n\n---\n\n' + footer.replaceAll('__TAG__', 'v9.8.7'),
    bodyPath: '${{ runner.temp }}/release-body.md', fixedTmp: [],
  }, 'release.yml: whole body = changelog section + separator + footer with __TAG__ -> tag, in $RUNNER_TEMP, no fixed /tmp path');
  check(builtBody.split('__TAG__').length - 1, 0, 'release.yml: built body from the live footer keeps no __TAG__ placeholder');
  // GIVEN a footer with __TAG__ twice on one line WHEN the step runs THEN both become the tag (sed /g).
  const tagDir = join(temp, 'release-tag-footer'), tagTemp = join(temp, 'runner-temp-tag-footer');
  mkdirSync(join(tagDir, '.github'), { recursive: true }); mkdirSync(tagTemp);
  writeFileSync(join(tagDir, 'RELEASE-NOTES.md'), NOTES);
  writeFileSync(join(tagDir, '.github/release-footer.md'), 'Notes for __TAG__: https://github.com/o/r/releases/tag/__TAG__\n');
  const tagRun = actionsBash(relStep,
    { GITHUB_REF_NAME: 'v9.8.7', GITHUB_OUTPUT: join(tagDir, 'output'), RUNNER_TEMP: tagTemp }, tagDir);
  const tagBody = readFileSync(join(tagTemp, 'release-body.md'), 'utf8');
  check({ status: tagRun.status, stderr: tagRun.stderr, body: tagBody, leftover: tagBody.split('__TAG__').length - 1 }, {
    status: 0, stderr: '',
    body: '## v9.8.7 (2026-10-13)\n- fixture note\n\n---\n\nNotes for v9.8.7: https://github.com/o/r/releases/tag/v9.8.7\n',
    leftover: 0,
  }, 'release.yml: both __TAG__ tokens in one footer line are replaced with the release tag, none left');
  // GIVEN no .github/release-footer.md WHEN the step runs as Actions does THEN it fails before the preview.
  const noFooterDir = join(temp, 'release-no-footer'), noFooterTemp = join(temp, 'runner-temp-no-footer');
  mkdirSync(noFooterDir); mkdirSync(noFooterTemp);
  writeFileSync(join(noFooterDir, 'RELEASE-NOTES.md'), NOTES);
  const noFooter = actionsBash(relStep,
    { GITHUB_REF_NAME: 'v9.8.7', GITHUB_OUTPUT: join(noFooterDir, 'output'), RUNNER_TEMP: noFooterTemp }, noFooterDir);
  check({ status: noFooter.status, stdout: noFooter.stdout, stderr: noFooter.stderr }, {
    status: 1, stdout: '', stderr: 'cat: .github/release-footer.md: No such file or directory\n',
  }, 'release.yml: a missing footer fails the step (status 1) and no preview is printed');
  console.log('PASS provenance: ' + count + ' assertions; shipped producer/verifiers executed without network');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
