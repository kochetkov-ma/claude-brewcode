#!/usr/bin/env node
// Offline audit regressions: history destinations, explicit privacy choices, bounded ZIP inspection.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const scripts = join(root, '../scripts');
const base = mkdtempSync(join(tmpdir(), 'publish-security-'));
const bin = join(base, 'bin'); mkdirSync(bin);
writeFileSync(join(bin, 'curl'), '#!/bin/sh\nprintf \'{"link":"https://example.invalid/fixture","ownerToken":"fixture"}\\n\'\n', { mode: 0o755 });
after(() => rmSync(base, { recursive: true, force: true }));

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
