#!/usr/bin/env node
// Execute standalone directory blocks with real ZIP tools and a local upload stub.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const WORKFLOWS = [
  ['skills/brewpage-publish/SKILL.md', 'ClaudeCode/1.0'],
  ['openclaw/brewpage-publish/SKILL.md', 'OpenClaw/1.0'],
];
const FIXTURE = {
  'index.html': '<h1>home</h1>',
  'assets/site.css': 'body{color:#111}',
  'nested/about.html': '<h1>about</h1>',
  '.env': 'excluded fixture',
  '.env.local': 'excluded fixture',
  '.git/config': 'excluded fixture',
  'node_modules/pkg.js': 'excluded fixture',
  '.DS_Store': 'excluded fixture',
  'Thumbs.db': 'excluded fixture',
  '.idea/workspace.xml': 'excluded fixture',
  '.vscode/settings.json': 'excluded fixture',
  '.cache/build.json': 'excluded fixture',
  'assets/site.css.map': 'excluded fixture',
  'build.log': 'excluded fixture',
  'nested/.env': 'excluded fixture',
  'nested/.env.local': 'excluded fixture',
  'nested/.git/config': 'excluded fixture',
  'nested/node_modules/pkg.js': 'excluded fixture',
  'nested/.DS_Store': 'excluded fixture',
  'nested/.idea/workspace.xml': 'excluded fixture',
  'nested/.vscode/settings.json': 'excluded fixture',
  'nested/.cache/build.json': 'excluded fixture',
};
const EXPECTED_FILES = ['assets/site.css', 'index.html', 'nested/about.html'];
const FAILURES = [
  ['zip failure', 'printf partial > "$2"\nexit 3'],
  ['empty archive', ': > "$2"\nexit 0'],
  ['corrupt archive', 'printf invalid > "$2"\nexit 0'],
];

function fixture(workflow, zipStub) {
  const base = mkdtempSync(join(tmpdir(), 'standalone-publish-'));
  const site = join(base, 'built site');
  const bin = join(base, 'bin');
  mkdirSync(bin);
  for (const [name, content] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(site, name)), { recursive: true });
    writeFileSync(join(site, name), content);
  }
  const stub = (name, script) => writeFileSync(join(bin, name), `#!/bin/bash\n${script}\n`, { mode: 0o755 });
  stub('mktemp', 'archive=$(/usr/bin/mktemp "$TEST_BASE/brewpage-site-XXXXXX.zip") || exit 1\nprintf %s "$archive" > "$TEST_BASE/archive-path"\nprintf %s "$archive"');
  stub('curl', 'printf "%s\\n" "$@" > "$TEST_BASE/curl-args"\nfor arg in "$@"; do\n  case "$arg" in archive=@*) cp "${arg#archive=@}" "$TEST_BASE/uploaded.zip" || exit 1 ;; esac\ndone\nprintf %s \'{"link":"https://example.test/","fileCount":3}\'');
  for (const script of [zipStub].filter((value) => value !== undefined)) stub('zip', script);
  const source = readFileSync(join(ROOT, workflow), 'utf8');
  const block = source.split('**Site (directory)**')[1].split('```bash\n')[1].split('\n```')[0];
  const script = block.replaceAll('{directory_path}', site).replaceAll('{ns}', 'public')
    .replaceAll('{days}', '7').replaceAll('{entry_shell_quoted}', "'index.html'").replaceAll('{ttl}', '7');
  const run = () => spawnSync('bash', ['-c', script], {
    cwd: base,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_BASE: base, PASSWORD: '', DELIVERY_MODE: 'subdomain' },
    encoding: 'utf8', timeout: 20000,
  });
  return { base, run };
}

for (const [workflow, userAgent] of WORKFLOWS) {
  for (const kind of ['directory', 'ZIP file']) {
    test(`${workflow}: ${kind} preserves encoded entry paths through real curl`, async () => {
      // GIVEN: actual SITE snippets and local HTTP accept nested names with query and shell characters.
      const base = mkdtempSync(join(tmpdir(), 'standalone-entry-'));
      const site = join(base, 'site');
      const archive = join(base, 'site.zip');
      const entries = ['pages/A & B.html', "pages/quote'$(touch entry-injected)`id`.html"];
      const requests = [];
      const server = createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
          requests.push({ url: request.url, userAgent: request.headers['user-agent'],
            contentType: request.headers['content-type'], body: Buffer.concat(chunks) });
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ link: 'https://example.test/', fileCount: 2 }));
        });
      });
      try {
        mkdirSync(join(site, 'pages'), { recursive: true });
        mkdirSync(join(base, '.claude'));
        entries.forEach(entry => writeFileSync(join(site, entry), '<h1>entry fixture</h1>'));
        const packed = spawnSync('zip', ['-qr', archive, '.'], { cwd: site, encoding: 'utf8' });
        assert.equal(packed.status, 0, 'GIVEN fixture archive is valid before executing either caller');
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const endpoint = `http://127.0.0.1:${server.address().port}/api/sites`;
        const source = readFileSync(join(ROOT, workflow), 'utf8');
        const block = source.split(`**Site (${kind})**`)[1].split('```bash\n')[1].split('\n```')[0];
        const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
        // WHEN: real curl sends each extracted instruction block to the isolated HTTP server.
        const outcomes = [];
        for (const entry of entries) {
          const script = block.replaceAll('https://brewpage.app/api/sites', endpoint)
            .replaceAll('{directory_path}', site).replaceAll('{zip_file_path}', archive)
            .replaceAll('{ns}', 'fixture').replaceAll('{days}', '7').replaceAll('{ttl}', '7')
            .replaceAll('{entry_shell_quoted}', quote(entry));
          const outcome = await new Promise((resolve, reject) => {
            const child = spawn('bash', ['-c', script], { cwd: base,
              env: { ...process.env, PASSWORD: '', DELIVERY_MODE: '' }, timeout: 20000 });
            let stdout = '', stderr = '';
            child.stdout.on('data', chunk => { stdout += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });
            child.on('error', reject);
            child.on('close', status => resolve({ status, stdout, stderr }));
          });
          outcomes.push(outcome);
        }
        // THEN: each entry is a single decoded query parameter and multipart ZIP bytes survive curl.
        assert.deepEqual(outcomes.map(outcome => outcome.status), [0, 0], 'both SITE uploads exit successfully');
        assert.deepEqual(outcomes.map(outcome => outcome.stderr), ['', ''], 'shell and curl emit no failure output');
        assert.deepEqual(outcomes.map(outcome => outcome.stdout.split('\n').filter(line => line.startsWith('OK '))),
          [['OK https://example.test/ | Files: 2'], ['OK https://example.test/ | Files: 2']],
          'both callers retain the exact returned URL and file count');
        assert.equal(requests.length, 2, 'exactly one real HTTP request reaches the server per entry');
        assert.deepEqual(requests.map(request => Object.fromEntries(new URL(request.url, endpoint).searchParams)),
          entries.map(entry => ({ ns: 'fixture', ttl: '7', entry })), 'query decoding preserves every original path character');
        assert.equal(requests[0].url, '/api/sites?ns=fixture&ttl=7&entry=pages%2FA%20%26%20B.html',
          'nested slash, spaces and ampersand are percent encoded in actual HTTP request');
        assert.deepEqual(requests.map(request => request.userAgent), [userAgent, userAgent], 'runtime user agents remain unchanged');
        assert.deepEqual(requests.map(request => request.body.indexOf(Buffer.from('PK\x03\x04')) !== -1),
          [true, true], 'both multipart uploads contain a real ZIP local-file signature');
        assert.equal(existsSync(join(base, 'entry-injected')), false, 'shell syntax in an entry name never executes');
      } finally {
        await new Promise(resolve => server.close(resolve));
        rmSync(base, { recursive: true, force: true });
      }
    });
  }
}

for (const [workflow, userAgent] of WORKFLOWS) {
  test(`${workflow}: built directory uploads an intact archive with exclusions`, () => {
    // GIVEN: built assets and excluded root/nested entries use the actual workflow block.
    const { base, run } = fixture(workflow);
    try {
      // WHEN: real ZIP tools prepare the directory for the local curl stub.
      const result = run();
      // THEN: upload receives exactly the retained files and the archive is cleaned up.
      assert.equal(result.status, 0, 'directory publish exits successfully');
      const archive = join(base, 'uploaded.zip');
      assert.equal(existsSync(archive), true, 'curl receives an archive');
      const verified = spawnSync('unzip', ['-tq', archive], { encoding: 'utf8' });
      assert.equal(verified.status, 0, 'uploaded archive passes ZIP integrity validation');
      const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
      assert.equal(listing.status, 0, 'uploaded archive can be enumerated');
      assert.deepEqual(listing.stdout.trim().split('\n').filter((name) => !name.endsWith('/')).sort(),
        EXPECTED_FILES, 'relative assets remain and every excluded fixture is absent');
      const contents = EXPECTED_FILES.map((name) => spawnSync('unzip', ['-p', archive, name], { encoding: 'utf8' }));
      assert.deepEqual(contents.map((result) => result.status), [0, 0, 0], 'every retained asset can be extracted');
      assert.deepEqual(contents.map((result) => result.stdout), EXPECTED_FILES.map((name) => FIXTURE[name]),
        'all retained asset bytes survive packaging');
      assert.equal(existsSync(readFileSync(join(base, 'archive-path'), 'utf8')), false,
        'temporary archive is removed after upload');
      const args = readFileSync(join(base, 'curl-args'), 'utf8').split('\n');
      assert.equal(args.includes(`User-Agent: ${userAgent}`), true, 'workflow retains its user agent');
      assert.equal(args.includes('X-Delivery-Mode: subdomain'), true, 'delivery mode header survives archive creation');
      assert.match(result.stdout, /OK https:\/\/example\.test\/ \| Files: 3/, 'success preserves the canonical root link and trailing slash');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  for (const [failure, stub] of FAILURES) {
    test(`${workflow}: ${failure} aborts before upload`, () => {
      // GIVEN: zip fails or falsely reports success for an unusable artifact.
      const { base, run } = fixture(workflow, stub);
      try {
        // WHEN: the actual directory publish block encounters the artifact.
        const result = run();
        // THEN: failure stops curl and removes the partial archive.
        assert.equal(result.status, 1, 'archive failure exits unsuccessfully');
        assert.match(result.stdout, /FAILED: site archive creation or verification failed/, 'failure explains the archive gate');
        assert.equal(existsSync(join(base, 'curl-args')), false, 'curl is never called');
        assert.equal(existsSync(join(base, 'uploaded.zip')), false, 'no archive is uploaded');
        assert.equal(existsSync(readFileSync(join(base, 'archive-path'), 'utf8')), false,
          'failed archive is removed');
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    });
  }
}
