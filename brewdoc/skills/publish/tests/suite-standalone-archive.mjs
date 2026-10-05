#!/usr/bin/env node
// Execute standalone directory blocks with real ZIP tools and a local upload stub.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
    .replaceAll('{days}', '7').replaceAll('{entry}', 'index.html').replaceAll('{ttl}', '7');
  const run = () => spawnSync('bash', ['-c', script], {
    cwd: base,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_BASE: base, PASSWORD: '', DELIVERY_MODE: 'subdomain' },
    encoding: 'utf8', timeout: 20000,
  });
  return { base, run };
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
