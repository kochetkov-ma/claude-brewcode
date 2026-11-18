#!/usr/bin/env node
// Synchronize only the maintained publishing entry, recipes and runtime files.
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = join(root, 'brewdoc/skills/publish');
const files = [
  'SKILL.md', 'references/publishing.md', 'references/page-data.md', 'references/custom-domain.md', 'references/ownership.md',
  'scripts/brewpage-lib.sh', 'scripts/brewpage-run.sh', 'scripts/history.py', 'scripts/publish.mjs',
];
const [option, ...extra] = process.argv.slice(2);
if ((option !== undefined && option !== '--check') || extra.length) {
  process.stderr.write('Usage: node .codex/scripts/sync-brewpage-publish.mjs [--check]\n');
  process.exit(2);
}

function replaceOne(text, from, to) {
  const first = text.indexOf(from);
  if (first < 0 || text.lastIndexOf(from) !== first) throw new Error(`Missing or repeated source anchor: ${from}`);
  return text.replace(from, () => to);
}

function read(path) {
  const file = lstatSync(path);
  if (!file.isFile()) throw new Error(`Expected a regular file: ${path}`);
  return { bytes: readFileSync(path), mode: file.mode & 0o777 };
}

function directory(path, optional = false) {
  const entry = lstatSync(path, { throwIfNoEntry: !optional });
  if (entry && !entry.isDirectory()) throw new Error(`Expected a directory: ${path}`);
  return entry;
}

function wrapper(text, openclaw, openclawUA) {
  text = replaceOne(text, 'name: publish\n', 'name: brewpage-publish\n');
  text = replaceOne(text, 'PLAN — brewdoc:publish', 'PLAN — brewpage-publish');
  const header = text.split('---\n')[1];
  if (!openclaw) {
    const frontmatter = header.split('\n').filter(line => /^(name|description|license):/.test(line));
    frontmatter.splice(2, 0, 'allowed-tools: Read Glob AskUserQuestion Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)');
    text = replaceOne(text, header, frontmatter.join('\n') + '\n');
    text = replaceOne(text, 'Invoke only its scoped Bash command shape.',
      'Use the actual installed skill folder if the host leaves the path marker literal. Keep the scoped command shape.');
    text = replaceOne(text, '3. Ask: use at most one `AskUserQuestion` (up to four questions) for scope choices that change the work.',
      '3. Ask: ask at most once (up to four questions) for scope choices that change the work. Use a structured question tool when available; otherwise ask in plain language.');
    return text;
  }
  const frontmatter = header.split('\n').filter(line => /^(name|description|user-invocable|license):/.test(line));
  frontmatter.splice(2, 0, 'homepage: https://brewpage.app');
  text = replaceOne(text, header, frontmatter.join('\n') + '\n');
  text = replaceOne(text, '`$ARGUMENTS` is one free-form RU/EN prompt.', 'Use the owner’s free-form RU/EN prompt.');
  text = replaceOne(text, 'use at most one `AskUserQuestion` (up to four questions)', 'ask once (up to four scope questions)');
  text = replaceOne(text, 'Invoke only its scoped Bash command shape.', 'Use the host shell tool only when permitted.');
  text = replaceOne(text, '${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh', '{baseDir}/scripts/brewpage-run.sh');
  return text.replace(/ClaudeCode\/\d+\.\d+\.\d+ \(\+https:\/\/brewpage\.app\)/g, openclawUA);
}

function openclawLibrary(text, ua) {
  const start = text.indexOf('# rc 0: $1 is HOME');
  const end = text.indexOf('BP_TMPDIR="${TMPDIR:-/tmp}"');
  if (start < 0 || end <= start) throw new Error('Missing canonical history root block');
  text = replaceOne(text, text.slice(start, end), 'BP_ROOT="$PWD"\nHISTORY_FILE="$BP_ROOT/brewpage-history.md"\n'
    + '# Run dirs stay outside the workspace; only brewpage-run.sh writes into them.\n');
  text = replaceOne(text, '# Owns token-history location (BD03) and URL-safety of prompt-derived query params (BD02).',
    '# Keeps token history at the workspace root and validates query parameters.');
  return text.replace(/ClaudeCode\/\d+\.\d+\.\d+ \(\+https:\/\/brewpage\.app\)/g, ua);
}

for (const path of [source, join(source, 'scripts'), join(source, 'references')]) directory(path);
const canonical = new Map(files.map(file => [file, read(join(source, file))]));
const changes = [];
for (const host of ['skills', 'openclaw']) {
  const destination = join(root, host, 'brewpage-publish');
  directory(destination);
  const openclaw = host === 'openclaw';
  for (const subdir of ['scripts', 'references']) {
    const target = join(destination, subdir);
    if (!directory(target, true)) continue;
    const allowed = new Set(files.filter(file => dirname(file) === subdir).map(file => file.slice(subdir.length + 1)));
    for (const name of readdirSync(target)) {
      if (!allowed.has(name)) throw new Error(`Unexpected package member: ${join(target, name)}`);
    }
  }
  const ua = openclaw && read(join(destination, 'scripts/brewpage-lib.sh')).bytes.toString()
    .match(/^BP_UA="(OpenClaw\/\d+\.\d+\.\d+ \(\+https:\/\/brewpage\.app\))"$/m)?.[1];
  if (openclaw && !ua) throw new Error('Missing the OpenClaw distribution version');
  for (const [file, canonicalFile] of canonical) {
    const { bytes, mode } = canonicalFile;
    let expected = bytes;
    if (file === 'SKILL.md') expected = Buffer.from(wrapper(bytes.toString(), openclaw, ua));
    if (openclaw && file === 'scripts/brewpage-lib.sh') expected = Buffer.from(openclawLibrary(bytes.toString(), ua));
    if (openclaw && file === 'scripts/brewpage-run.sh') {
      expected = Buffer.from(replaceOne(bytes.toString(), '# One allowed-tools rule covers every call; values arrive as single-quoted argv, never as shell source.',
        '# Values arrive as single-quoted argv, never as shell source.'));
    }
    const path = join(destination, file);
    const present = lstatSync(path, { throwIfNoEntry: false });
    const current = present && read(path);
    if (!current || !expected.equals(current.bytes) || (mode & 0o111) !== (current.mode & 0o111)) {
      changes.push({ path, expected, mode });
    }
  }
}

if (option === '--check' && changes.length) {
  for (const { path } of changes) process.stderr.write(`Publishing package differs: ${path}\n`);
  process.exitCode = 1;
} else if (option !== '--check') {
  for (const { path, expected, mode } of changes) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, expected, { mode });
    chmodSync(path, mode);
  }
}
