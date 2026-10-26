#!/usr/bin/env node
// Offline audit regressions: history destinations, explicit privacy choices, bounded ZIP inspection.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const scripts = join(root, '../scripts');
const base = mkdtempSync(join(tmpdir(), 'publish-security-'));
const bin = join(base, 'bin'); mkdirSync(bin);
writeFileSync(join(bin, 'curl'), '#!/bin/sh\nprintf \'{"link":"https://example.invalid/fixture","ownerToken":"fixture"}\\n\'\n', { mode: 0o755 });
after(() => rmSync(base, { recursive: true, force: true }));

for (const type of ['site-dir', 'site-zip']) test(`${type} confirmation binds exact reviewed bytes without retaining payloads`, () => {
  // GIVEN benign flagged content and an offline curl capture WHEN review returns THEN no upload or retained payload exists.
  const project = mkdtempSync(join(base, 'review-')); const site = join(project, 'site'); mkdirSync(site);
  const temp = join(project, 'tmp'); mkdirSync(temp);
  const localBin = join(project, 'bin'); mkdirSync(localBin);
  const captured = join(project, 'captured.zip');
  writeFileSync(join(localBin, 'curl'), '#!/usr/bin/env node\nconst fs=require("node:fs"),path=require("node:path"); const arg=process.argv.find(a=>a.startsWith("archive=@")); const file=JSON.parse(arg.slice(9)); fs.writeFileSync(process.env.SOURCE_FILE,"source replaced at upload"); fs.copyFileSync(file,process.env.CAPTURED); fs.writeFileSync(process.env.CAPTURED+".json",JSON.stringify([fs.statSync(file).mode&511,fs.statSync(path.dirname(file)).mode&511])); process.stdout.write(\'{"link":"https://example.invalid/fixture","fileCount":3}\');\n', { mode: 0o700 });
  writeFileSync(join(site, 'index.html'), '<h1>fixture</h1>');
  writeFileSync(join(site, 'secret-config.json'), '{"fixture":"reviewed"}');
  const zip = join(project, 'source.zip');
  const pack = () => assert.equal(spawnSync('node', [join(scripts, 'publish.mjs'), 'pack', '--dir', site, '--out', zip]).status, 2, 'benign sensitive fixture packs with a review verdict');
  pack();
  const args = [join(scripts, 'brewpage-run.sh'), 'publish', type, '--ns', 'fixture', '--password-file', '', '--path', type === 'site-dir' ? site : zip];
  const sourceFile = type === 'site-zip' ? zip : join(site, 'secret-config.json');
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project, TMPDIR: temp, PATH: localBin + ':' + process.env.PATH, CAPTURED: captured, SOURCE_FILE: sourceFile };
  const run = flags => spawnSync('bash', [...args, ...flags], { cwd: project, env, encoding: 'utf8', timeout: 10000 });
  const digestOf = result => /^REVIEW_SHA256: ([0-9a-f]{64})$/m.exec(result.stdout)?.[1];
  const initial = run([]); const approved = digestOf(initial);
  assert.match(approved, /^[0-9a-f]{64}$/, 'review emits an exact archive digest');
  assert.deepEqual([initial.status, existsSync(captured), readdirSync(temp)], [2, false, []], 'review returns without upload or pending payload');
  const bare = run(['--confirmed']);
  assert.deepEqual([bare.status, digestOf(bare), existsSync(captured), readdirSync(temp)], [2, approved, false, []], 'bare confirmation cannot bypass a bound review');
  const unchanged = run(['--confirmed', '--review-sha256', approved]);
  assert.deepEqual([unchanged.status, createHash('sha256').update(readFileSync(captured)).digest('hex'), readdirSync(temp)], [0, approved, []], 'unchanged approved bytes upload exactly and clean temporary copies');
  assert.deepEqual(JSON.parse(readFileSync(captured + '.json', 'utf8')), [0o600, 0o700], 'inspected upload snapshot and parent remain private');
  assert.equal(readFileSync(sourceFile, 'utf8'), 'source replaced at upload', 'source replacement cannot alter the already inspected upload snapshot');
  rmSync(captured);
  // WHEN the source changes after approval THEN the old digest cannot authorize the replacement.
  writeFileSync(join(site, 'secret-config.json'), '{"fixture":"changed"}');
  writeFileSync(join(site, 'credential-new.json'), '{"fixture":"never reviewed"}'); pack();
  const changed = run(['--confirmed', '--review-sha256', approved]); const replacement = digestOf(changed);
  assert.match(replacement, /^[0-9a-f]{64}$/, 'changed content emits a fresh review digest');
  assert.equal(changed.stdout.includes('credential-new.json'), true, 'fresh manifest identifies the newly flagged member');
  assert.deepEqual([changed.status, existsSync(captured), readdirSync(temp)], [2, false, []], 'changed archive requires fresh review without upload or retention');
  const accepted = run(['--confirmed', '--review-sha256', replacement]);
  assert.deepEqual([accepted.status, createHash('sha256').update(readFileSync(captured)).digest('hex'), readdirSync(temp)], [0, replacement, []], 'only newly approved exact bytes upload');
});

test('real curl uploads only the intended multipart bytes for hostile valid paths', async t => {
  // GIVEN only benign fixtures and a curl wrapper that redirects approved URLs to loopback.
  const realCurl = process.env.BREWPAGE_TEST_REAL_CURL || spawnSync('which', ['curl'], { encoding: 'utf8' }).stdout.trim();
  const fixture = mkdtempSync(join(base, 'multipart-'));
  const guardedBin = join(fixture, 'bin'); mkdirSync(guardedBin);
  writeFileSync(join(guardedBin, 'curl'), `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const urls = args.filter(a => /^https?:/.test(a));
if (urls.length !== 1) process.exit(97);
const url = new URL(urls[0]);
if (url.origin !== 'https://brewpage.app' || !['/api/files', '/api/sites'].includes(url.pathname)) process.exit(97);
args[args.indexOf(urls[0])] = process.env.LOOPBACK_URL;
const result = spawnSync(process.env.REAL_CURL, ['--disable', '--proxy', '', ...args], { encoding: 'utf8' });
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
process.exit(result.status ?? 98);
`, { mode: 0o700 });
  const received = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.end(JSON.stringify({ link: 'https://example.invalid/fixture', fileCount: 1 }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const site = join(fixture, 'site'); mkdirSync(site);
    writeFileSync(join(site, 'index.html'), '<h1>intended fixture</h1>');
    const zip = join(fixture, 'intended.zip');
    const packed = spawnSync('node', [join(scripts, 'publish.mjs'), 'pack', '--dir', site, '--out', zip]);
    assert.equal(packed.status, 0, 'valid intended ZIP builds offline');
    const sentinel = join(fixture, 'outside-sentinel'); writeFileSync(sentinel, 'OUTSIDE_READ_SENTINEL');
    const cases = [];
    for (const type of ['file', 'site-zip']) {
      const prefix = join(fixture, `${type}-first`);
      writeFileSync(prefix, 'UNINTENDED_FIRST_FILE');
      const comma = `${prefix},${sentinel}`;
      cases.push([type, comma], [type, join(fixture, `${type};type=text/plain`)], [type, join(fixture, `${type}-quote"-back\\slash.zip`)], [type, join(fixture, `${type}-relatório-日本語.zip`)]);
    }
    cases.push(['site-dir', site]);
    for (const [type, path] of cases) await t.test(`${type}: ${basename(path)}`, async () => {
      const expected = type === 'file' ? Buffer.from('INTENDED_FILE_ONLY') : readFileSync(zip);
      if (type !== 'site-dir') { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, expected); }
      const project = mkdtempSync(join(fixture, 'project-'));
      const temp = join(project, 'tmp,;"\\'); mkdirSync(temp);
      // WHEN the actual runner uses real curl THEN its wire contains one intended file only.
      const run = await new Promise(resolve => {
        const child = spawn('bash', [join(scripts, 'brewpage-run.sh'), 'publish', type, '--ns', 'fixture', '--password-file', '', '--path', path], {
          cwd: project, timeout: 10000, env: { ...process.env, CLAUDE_PROJECT_DIR: project, TMPDIR: temp, PATH: guardedBin + ':' + process.env.PATH, REAL_CURL: realCurl, LOOPBACK_URL: `http://127.0.0.1:${server.address().port}/fixture` },
        });
        let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.on('close', status => resolve({ status, output }));
      });
      const wire = received.shift();
      assert.equal(run.status, 0, `${type} ${basename(path)} publishes locally: ${run.output}`);
      assert.equal(wire.body.includes(Buffer.from('OUTSIDE_READ_SENTINEL')), false, `${type}: no outside fixture bytes cross the wire`);
      const boundary = /boundary=(.+)$/.exec(wire.headers['content-type'])[1];
      const parts = wire.body.toString('latin1').split(`--${boundary}`).slice(1, -1);
      const payloads = parts.map(part => Buffer.from(part.slice(part.indexOf('\r\n\r\n') + 4, -2), 'latin1'));
      assert.deepEqual(payloads, [expected], `${type}: exactly one multipart payload equals intended bytes`);
      assert.equal(parts[0].includes(`name="${type === 'file' ? 'file' : 'archive'}"`), true, 'multipart field identity is preserved');
      const filename = Buffer.from((type === 'site-dir' ? 'site.zip' : basename(path)).replaceAll('"', '%22')).toString('latin1');
      assert.equal(parts[0].includes(`filename="${filename}"`), true, 'original filename is preserved by curl');
      assert.deepEqual(readdirSync(temp), [], 'private temporary run is cleaned');
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

for (const target of ['directory', 'history', 'gitignore']) test(`history rejects symlink ${target}`, () => {
  // GIVEN an attacker-controlled history destination and unchanged external fixture.
  const project = join(base, target); mkdirSync(project);
  const external = join(base, `${target}-external`);
  writeFileSync(external, 'unchanged');
  const privateDir = join(project, '.claude');
  mkdirSync(privateDir);
  const paths = { directory: privateDir, history: join(privateDir, 'brewpage-history.md'), gitignore: join(project, '.gitignore') };
  const prepare = {
    directory: () => { rmSync(privateDir, { recursive: true }); symlinkSync(base, privateDir); },
    history: () => symlinkSync(external, paths.history),
    gitignore: () => symlinkSync(external, paths.gitignore),
  };
  prepare[target]();
  spawnSync('git', ['init', '-q', project]);
  // WHEN history initialization runs THEN it refuses before following the destination.
  const result = spawnSync('bash', ['-c', '. "$LIB"; bp_history_init'], { cwd: project, encoding: 'utf8', env: { ...process.env, LIB: join(scripts, 'brewpage-lib.sh'), CLAUDE_PROJECT_DIR: project } });
  assert.deepEqual([result.status, readFileSync(external, 'utf8')], [1, 'unchanged'], 'unsafe history path fails without touching external bytes');
});

test('namespace and password choices are never synthesized from silence', () => {
  // GIVEN the runner WHEN password consent is absent THEN it fails before an upload.
  const project = join(base, 'consent'); mkdirSync(project);
  const lookup = spawnSync('bash', ['-c', 'command -v curl'], { encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH } });
  assert.deepEqual([lookup.status, lookup.stdout.trim()], [0, join(bin, 'curl')], 'curl resolves only to the offline fixture');
  const result = spawnSync('bash', [join(scripts, 'brewpage-run.sh'), 'publish', 'html', '--ns', 'fixture', '--text', 'fixture'], { cwd: project, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project, PATH: bin + ':' + process.env.PATH } });
  assert.deepEqual([result.status, result.stdout.trim()], [1, 'FAILED: explicit --password-file choice required (empty means no password)'], 'missing password choice is a closed gate');
});

test('expanded ZIP limits are checked before integrity decompression', () => {
  // GIVEN a tiny ZIP whose expanded member exceeds the site budget.
  const zip = join(base, 'bomb.zip');
  const marker = join(base, 'unzip-called');
  writeFileSync(join(bin, 'unzip'), '#!/bin/sh\nprintf called > "$UNZIP_MARKER"\n', { mode: 0o755 });
  const fixture = spawnSync('python3', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z: z.writestr("index.html", b"x" * (41 * 1024 * 1024))', zip]);
  assert.equal(fixture.status, 0, 'ZIP fixture builds');
  // WHEN inspected THEN bounded metadata rejects it before decompression.
  const result = spawnSync('node', [join(scripts, 'publish.mjs'), 'inspect', '--zip', zip], { encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: bin + ':' + process.env.PATH, UNZIP_MARKER: marker } });
  assert.deepEqual([result.status, result.stdout.trim(), existsSync(marker)], [1, 'FAILED: archive exceeds local inspection limits\nRESULT: fail', false], 'archive expansion cannot reach the integrity checker');
});

test('history failure never reports a successful publish or prints the token', () => {
  // GIVEN a successful response and a failed secure write WHEN finishing THEN no OK or token escapes.
  const result = spawnSync('bash', ['-c', '. "$LIB"; bp_history_append() { return 1; }; bp_finish \'{"link":"https://example.invalid/fixture","ownerToken":"fixture-secret"}\' 15 html'], { encoding: 'utf8', env: { ...process.env, LIB: join(scripts, 'brewpage-lib.sh') } });
  assert.deepEqual([result.status, result.stdout.trim()], [1, 'FAILED: published but owner token could not be saved securely'], 'token-save errors propagate without token disclosure');
});

test('privacy and recovery instructions fail closed in every distribution', () => {
  // GIVEN all distributed instructions WHEN read THEN silence stops and recovery keeps tokens private.
  const repo = join(root, '../../../..');
  for (const relative of ['brewdoc/skills/publish', 'skills/brewpage-publish', 'openclaw/brewpage-publish']) {
    const text = readFileSync(join(repo, relative, 'SKILL.md'), 'utf8');
    assert.deepEqual([text.includes('Never infer publication consent from silence.'), text.includes('owner token stays in private history, never chat.'), text.includes('report the new URL and owner token'), /no answer →|defaults; nothing blocks/.test(text)], [true, true, false, false], `${relative}: privacy choice and recovery rules agree`);
  }
});

test('missing secure-history runtime fails before any publish preparation', () => {
  // GIVEN PATH without python3 WHEN publishing THEN no unsafe fallback runs.
  const minimal = join(base, 'minimal'); mkdirSync(minimal);
  const dirname = spawnSync('which', ['dirname'], { encoding: 'utf8' });
  assert.equal(dirname.status, 0, 'dirname fixture source exists');
  symlinkSync(dirname.stdout.trim(), join(minimal, 'dirname'));
  const result = spawnSync('/bin/bash', [join(scripts, 'brewpage-run.sh'), 'publish', 'html', '--ns', 'fixture', '--password-file', '', '--text', 'fixture'], { encoding: 'utf8', env: { ...process.env, PATH: minimal, CLAUDE_PROJECT_DIR: base } });
  assert.deepEqual([result.status, result.stdout.trim()], [1, 'FAILED: python3 required for secure history'], 'no missing-runtime unsafe fallback exists');
});

for (const relative of ['brewpage-history.md', '.claude/brewpage-history.md']) test(`effective Git ignore protects ${relative} despite negation`, () => {
  // GIVEN a literal ignore followed by negation WHEN initializing THEN effective Git visibility is private.
  const project = mkdtempSync(join(base, 'negated-'));
  assert.equal(spawnSync('git', ['init', '-q', project]).status, 0, 'fixture repository initializes');
  assert.equal(spawnSync('git', ['-C', project, 'config', 'core.excludesFile', '/dev/null']).status, 0, 'global ignore rules are disabled for this fixture');
  writeFileSync(join(project, '.gitignore'), `${relative}\n!${relative}\n`);
  const result = spawnSync('python3', [join(scripts, 'history.py'), 'init', project, relative], { input: 'fixture history\n', encoding: 'utf8' });
  const ignored = spawnSync('git', ['-C', project, '-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', '--quiet', '--', relative]);
  assert.deepEqual([result.status, ignored.status, statSync(join(project, relative)).mode & 0o777], [0, 0, 0o600], 'successful history initialization proves effective exclusion');
});

test('nested ignore negation fails closed without writing history', () => {
  // GIVEN deeper negation overriding root rules WHEN initializing THEN no token-bearing file is created.
  const project = mkdtempSync(join(base, 'nested-negated-'));
  assert.equal(spawnSync('git', ['init', '-q', project]).status, 0, 'fixture repository initializes');
  assert.equal(spawnSync('git', ['-C', project, 'config', 'core.excludesFile', '/dev/null']).status, 0, 'global ignore rules are disabled for this fixture');
  mkdirSync(join(project, '.claude'));
  writeFileSync(join(project, '.claude/.gitignore'), '!brewpage-history.md\n');
  const result = spawnSync('python3', [join(scripts, 'history.py'), 'init', project, '.claude/brewpage-history.md'], { input: 'fixture secret\n', encoding: 'utf8' });
  assert.deepEqual([result.status, existsSync(join(project, '.claude/brewpage-history.md'))], [1, false], 'deeper negation cannot leave committable history');
});

test('unsupported native Windows runtime fails with a clear requirement', () => {
  // GIVEN native Windows capability markers WHEN helper starts THEN it refuses before opening history.
  const result = spawnSync('python3', ['-c', 'import os,runpy,sys; os.name="nt"; runpy.run_path(sys.argv[1], run_name="__main__")', join(scripts, 'history.py')], { encoding: 'utf8' });
  assert.deepEqual([result.status, result.stdout, result.stderr.trim()], [1, '', 'FAILED: secure history requires POSIX Python 3 (macOS/Linux or WSL); native Windows is unsupported'], 'unsupported OS is an explicit closed gate');
});

test('runner help describes the required explicit password choice', () => {
  // GIVEN command help WHEN rendered THEN required flags and explicit empty-password semantics agree.
  const result = spawnSync('bash', [join(scripts, 'brewpage-run.sh'), '--help'], { encoding: 'utf8' });
  assert.deepEqual([result.status, result.stdout.includes('--password-file <ABS|\'\'>'), result.stdout.includes("--password-file '' explicitly selects no password."), result.stdout.includes('Empty flag values count as omitted.')], [0, true, true, false], 'help cannot imply missing privacy choice is allowed');
});

for (const [file, bytes] of [['config', '[invalid\n'], ['index', 'invalid index']]) test(`broken Git ${file} fails closed before history write`, () => {
  // GIVEN malformed repository metadata WHEN initializing THEN no sensitive history is created.
  const project = mkdtempSync(join(base, 'broken-git-'));
  assert.equal(spawnSync('git', ['init', '-q', project]).status, 0, 'fixture repository initializes');
  writeFileSync(join(project, '.git', file), bytes);
  const result = spawnSync('python3', [join(scripts, 'history.py'), 'init', project, 'brewpage-history.md'], { input: 'fixture secret\n', encoding: 'utf8' });
  assert.deepEqual([result.status, existsSync(join(project, 'brewpage-history.md'))], [1, false], 'Git operational errors fail before history write');
});

for (const type of ['html', 'site']) for (const [name, outcome, saved] of [
  ['created', { code: 'ok', action: 'created', extras: { isOwner: false } }, true],
  ['owned merged', { code: 'duplicate', action: 'merged', extras: { isOwner: true } }, true],
  ['nonowned merged', { code: 'duplicate', action: 'merged', extras: { isOwner: false } }, false],
  ['merged without ownership metadata', { code: 'duplicate', action: 'merged' }, true],
  ['legacy without outcome', undefined, true],
]) test(`${type} ${name} preserves history and saves only supported capabilities`, () => {
  // GIVEN existing valid ownership WHEN a repeated wire response arrives THEN explicit nonownership is never saved as a capability.
  const project = mkdtempSync(join(base, 'merged-'));
  const response = { link: 'https://example.invalid/existing', ownerLink: 'https://example.invalid/api/html/fixture/existing', ownerToken: 'fixture-second', fileCount: 2, result: outcome };
  const first = { ...response, ownerToken: 'fixture-owner', result: { code: 'ok', action: 'created' } };
  const run = spawnSync('bash', ['-c', '. "$LIB"; bp_history_init && bp_finish "$FIRST" 15 html && bp_finish "$SECOND" 15 "$TYPE"'], { cwd: project, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH, LIB: join(scripts, 'brewpage-lib.sh'), CLAUDE_PROJECT_DIR: project, FIRST: JSON.stringify(first), SECOND: JSON.stringify(response), TYPE: type } });
  const tokens = [...readFileSync(join(project, '.claude/brewpage-history.md'), 'utf8').matchAll(/`(fixture-owner|fixture-second)`/g)].map(match => match[1]);
  const success = `OK ${response.link}\nOK ${response.link}${type === 'site' ? ' | Files: 2' : ''}\n`;
  const expected = saved ? [0, success, ['fixture-owner', 'fixture-second']] : [0, success + 'NOTICE: existing publication returned without ownership; no owner capability saved\n', ['fixture-owner']];
  assert.deepEqual([run.status, run.stdout, tokens], expected, 'reader success survives while previous ownership and truthful capability rows are preserved');
});
