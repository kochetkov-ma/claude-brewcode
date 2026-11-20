#!/usr/bin/env node
// Standalone copies (skills/ + openclaw/): frontmatter, one-command fences, script drift vs brewdoc, run safety.
// Offline: fake curl, mkdtemp fixtures removed at the end.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const CANONICAL = join(HERE, '..');
const REFERENCE_FILES = ['custom-domain.md', 'ownership.md', 'page-data.md', 'publishing.md'];
const description = readFileSync(join(CANONICAL, 'SKILL.md'), 'utf8').match(/^description: .+$/m)[0];
const COPIES = [
  { name: 'skills', dir: join(ROOT, 'skills/brewpage-publish'), token: '${CLAUDE_SKILL_DIR}', history: '.claude/brewpage-history.md' },
  { name: 'openclaw', dir: join(ROOT, 'openclaw/brewpage-publish'), token: '{baseDir}', history: 'brewpage-history.md' },
];
const FRONTMATTER = {
  skills: [
    'name: brewpage-publish',
    description,
    'allowed-tools: Read Glob AskUserQuestion Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)',
    'license: MIT',
  ],
  openclaw: [
    'name: brewpage-publish',
    description.replace(' Use for', ' Keeps the private owner key of an anonymous publication so its owner can edit or delete it later: '
      + 'saves it to the workspace file brewpage-history.md, recovers it from a local receipt, and reconciles an interrupted create. '
      + 'Its bundled runner talks only to brewpage.app. Use for'),
    'homepage: https://brewpage.app',
    'user-invocable: true',
    'license: MIT',
  ],
};
// User-Agent per copy: ClaudeCode/<brewdoc plugin version>; OpenClaw/<ClawHub version>, bumped by hand on each ClawHub publish.
const UA_TAIL = ' (+https://brewpage.app)';
const claudeUa = 'ClaudeCode/' + JSON.parse(readFileSync(join(ROOT, 'brewdoc/.claude-plugin/plugin.json'), 'utf8')).version + UA_TAIL;
const libUa = dir => /^BP_UA="(.*)"$/m.exec(readFileSync(join(dir, 'scripts/brewpage-lib.sh'), 'utf8'))?.[1];
const UA = { brewdoc: claudeUa, skills: claudeUa, openclaw: libUa(join(ROOT, 'openclaw/brewpage-publish')) };

const base = realpathSync(mkdtempSync(join(tmpdir(), 'standalone-publish-')));
const bin = join(base, 'bin');
const tmp = join(base, 'tmp');
mkdirSync(bin); mkdirSync(tmp);
writeFileSync(join(bin, 'curl'), [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const args = process.argv.slice(2);',
  'fs.writeFileSync(process.env.CURL_ARGS, JSON.stringify(args));',
  'const headers = args.filter((value, index) => args[index - 1] === "-H" && value.startsWith("@"));',
  'fs.writeFileSync(process.env.CURL_HEADERS, Buffer.concat(headers.map(value => fs.readFileSync(value.slice(1)))));',
  'const data = args[args.indexOf("-d") + 1];',
  'fs.writeFileSync(process.env.CURL_ARGS + ".payload", args.includes("-d") ? fs.readFileSync(data.slice(1)) : "");',
  'const file = args.find(arg => arg.startsWith("file=@"));',
  'if (file) fs.writeFileSync(process.env.CURL_ARGS + ".file", fs.readFileSync(JSON.parse(file.slice(6))));',
  'const body = JSON.parse(process.env.CURL_RESPONSE);',
  'const url = new URL(args.find(arg => arg.startsWith("https://")));',
  'if (body.link && !body.ownerLink) { body.id = "Fixture123"; body.namespace = url.searchParams.get("ns"); body.ownerLink = url.origin + url.pathname + "/" + body.namespace + "/" + body.id; }',
  'process.stdout.write(JSON.stringify(body) + (args.includes("-w") ? "\\nBP_HTTP_STATUS:" + (process.env.CURL_HTTP_STATUS || "201") : ""));',
].join('\n'), { mode: 0o755 });
const leakyBin = join(base, 'leaky-bin');
mkdirSync(leakyBin);
writeFileSync(join(leakyBin, 'mktemp'), '#!/bin/sh\nd="${2%XXXXXX}LEAKED"; mkdir "$d" && chmod 755 "$d" && printf \'%s\\n\' "$d"\n', { mode: 0o755 });
const password = 'fixture-$(id)-пароль';
const passwordSource = join(base, 'source-password.txt');
writeFileSync(passwordSource, password + '\n', { mode: 0o600 });
writeFileSync(join(base, 'short-password.txt'), 'abc\n');

const skillText = copy => readFileSync(join(copy.dir, 'SKILL.md'), 'utf8');
const frontmatter = copy => { const lines = skillText(copy).split('\n'); return lines.slice(1, lines.indexOf('---', 1)); };
const reference = (copy, file) => readFileSync(join(copy.dir, 'references', file), 'utf8');
const recipes = copy => copy.name === 'openclaw' ? [...REFERENCE_FILES, 'rest-runner.md'].sort() : REFERENCE_FILES;
const instructions = copy => [skillText(copy), ...['publishing.md', 'rest-runner.md', 'ownership.md']
  .filter(file => recipes(copy).includes(file)).map(file => reference(copy, file))].join('\n');
const fences = copy => [...instructions(copy).matchAll(/```bash\n([\s\S]*?)```/g)]
  .map(m => m[1].trimEnd().replace('{runner}', copy.token + '/scripts/brewpage-run.sh'));
const prefix = copy => 'bash ' + copy.token + '/scripts/brewpage-run.sh';
const projectOf = copy => join(base, copy.name + '-project');
const outFile = (copy, suffix) => join(base, copy.name + '-args-' + suffix);
const runNames = () => readdirSync(tmp).filter(name => name.startsWith('brewpage.')).sort();
const runFiles = id => readdirSync(tmp, { recursive: true }).filter(name => name === id || name.startsWith(id + '/')).sort();
const fixtureLink = 'https://brewpage.app/my/Fixture123';
const fixtureOwner = 'A'.repeat(32);
const response = token => JSON.stringify({ link: fixtureLink, ownerToken: token });
const HTTP_STATUS_ARGS = ['-w', '\nBP_HTTP_STATUS:%{http_code}'];
const saved = () => 'OWNER TOKEN SAVED\n';
const receipt = copy => `OK ${fixtureLink}\n${saved(copy)}`;

// The one fence holding `marker` as { code, env }: skill dir and path slots -> env refs (paths never enter the command text),
// other slots single-quote-escaped as the model fills them.
const PATH_SLOTS = { path: 'SUBST_PATH', password_file: 'SUBST_PASSWORD_FILE' };
function fill(copy, marker, slots) {
  const found = fences(copy).filter(f => f.includes(marker));
  assert.equal(found.length, 1, 'GIVEN exactly one ' + copy.name + ' fence contains ' + marker);
  const env = { SUBST_SKILL_DIR: copy.dir };
  const code = Object.entries(slots).reduce((text, [key, value]) => {
    if (!(key in PATH_SLOTS)) return text.replaceAll('{' + key + '}', value.replaceAll("'", "'\\''"));
    env[PATH_SLOTS[key]] = value;
    return text.replaceAll('{' + key + '}', `'"$${PATH_SLOTS[key]}"'`);
  }, found[0].replaceAll(copy.token, '${SUBST_SKILL_DIR}'));
  return { code, env };
}
function run(copy, { code, env }, suffix, extraEnv = {}, shell = ['bash', '-c']) {
  return spawnSync(shell[0], [...shell.slice(1), code], {
    cwd: projectOf(copy), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectOf(copy), TMPDIR: tmp, PATH: bin + ':' + process.env.PATH,
      CURL_ARGS: outFile(copy, suffix), CURL_HEADERS: outFile(copy, suffix) + '.headers', CURL_RESPONSE: response(fixtureOwner), ...env, ...extraEnv },
  });
}
function anonymousPublish(copy, marker, slots) {
  const { code, env } = fill(copy, marker, slots);
  return { code: code + ' --anonymous', env };
}
const textPublish = (copy, slots) => anonymousPublish(copy, "--text '{content}'",
  { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: '', ...slots });
const runPublish = (copy, runId, passwordFile) => anonymousPublish(copy, "--password-file '{password_file}' --run '{run_id}'",
  { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: passwordFile, run_id: runId });
const pathPublish = (copy, slots) => anonymousPublish(copy, " publish {type} --ns '{ns}' --ttl '{days}' --entry '{entry}'", slots);
const stage = (copy, runId, chunk, suffix, extraEnv) => run(copy, fill(copy, ' stage --run', { run_id: runId, chunk }), suffix, extraEnv);
// Per-copy tool-rule case: skills scopes Bash by one rule, OpenClaw has no allowed-tools key at all.
const TOOL_RULE = {
  skills: ['the portable scalar rule and runner agree', copy => assert.deepEqual(
    [...skillText(copy).matchAll(/^allowed-tools: Read Glob AskUserQuestion Bash\(([^)]*) \*\)$/gm)].map(m => m[1]),
    [prefix(copy)], 'one scoped Bash grant, same prefix as every fence')],
  openclaw: ['frontmatter has no allowed-tools key', copy => assert.deepEqual(frontmatter(copy).filter(line => line.startsWith('allowed-tools:')), [],
    'OpenClaw frontmatter carries no allowed-tools key')],
};

test('every brewpage.app request in all three copies sends the copy User-Agent', () => {
  // GIVEN each copy's scripts and docs WHEN curl lines and UA literals are collected THEN each carries exactly the copy UA.
  const docs = { brewdoc: ['SKILL.md', 'README.md', '../../../web/docs/src/content/docs/brewdoc/skills/publish.mdx'], skills: ['SKILL.md', 'README.md'], openclaw: ['SKILL.md', 'README.md'] };
  const dirs = { brewdoc: CANONICAL, skills: COPIES[0].dir, openclaw: COPIES[1].dir };
  const rows = Object.keys(dirs).map(name => {
    const read = f => readFileSync(join(dirs[name], f), 'utf8');
    const scripts = ['brewpage-run.sh', 'brewpage-lib.sh'].map(f => read('scripts/' + f));
    const code = scripts.flatMap(s => s.split('\n')).filter(l => /^\s*[^#\s>]/.test(l) && /\bcurl -/.test(l));
    const shown = [...docs[name], 'scripts/brewpage-lib.sh'].flatMap(f => read(f).split('\n'))
      .filter(l => /\bcurl -/.test(l) && !l.includes('-A "$BP_UA"'));
    const literals = [...docs[name], 'scripts/brewpage-lib.sh'].flatMap(f => [...read(f).matchAll(/(?:ClaudeCode|OpenClaw)\/[0-9][^"`)]*\)/g)].map(m => m[0]));
    return [name, libUa(dirs[name]), code.length, code.filter(l => !l.includes('-A "$BP_UA"')), shown.length > 0, shown.filter(l => !l.includes(`-A "${UA[name]}"`)),
      [...new Set(literals)]];
  });
  assert.match(UA.openclaw, /^OpenClaw\/\d+\.\d+\.\d+ \(\+https:\/\/brewpage\.app\)$/, 'OpenClaw UA is OpenClaw/<semver> (+https://brewpage.app)');
  assert.deepEqual(rows, [['brewdoc', UA.brewdoc, 2, [], true, [], [UA.brewdoc]], ['skills', UA.skills, 2, [], true, [], [UA.skills]],
    ['openclaw', UA.openclaw, 2, [], true, [], [UA.openclaw]]],
    'both live curl sites and every shown command use the installed package User-Agent');
});

test('standalone packages match their generated source', () => {
  // GIVEN both shipped packages WHEN checking generation THEN all generated bytes and modes match.
  const check = spawnSync(process.execPath, [join(ROOT, '.codex/scripts/sync-brewpage-publish.mjs'), '--check'], { encoding: 'utf8' });
  assert.deepEqual([check.status, check.stdout, check.stderr], [0, '', ''], 'generation check is a clean, non-writing read');
});

for (const copy of COPIES) {
  mkdirSync(projectOf(copy));
  spawnSync('git', ['init', '-q', projectOf(copy)]);

  test(`${copy.name}: frontmatter is exact`, () => {
    // GIVEN the shipped SKILL.md WHEN its frontmatter lines are read THEN they match the pinned contract.
    assert.deepEqual(frontmatter(copy), FRONTMATTER[copy.name], 'frontmatter lines and key order are exact');
  });

  test(`${copy.name}: every fence is one plain brewpage-run.sh command`, () => {
    // GIVEN the shipped fences WHEN each is checked THEN one line, script prefix, no operator or expansion outside single quotes.
    const all = fences(copy);
    assert.equal(skillText(copy).match(/```text\n([^\n]+\/scripts\/brewpage-run\.sh)\n```/)?.[1],
      copy.token + '/scripts/brewpage-run.sh', 'the entry assigns the installed runner path');
    const outsideQuotes = cmd => cmd.replace(/'[^']*'/g, '');
    assert.deepEqual(all.map(f => [f.startsWith(prefix(copy) + ' '), f.includes('\n'), /[;&|$`()<>"\\]/.test(outsideQuotes(f.slice(prefix(copy).length)))]),
      Array(13).fill([true, false, false]), 'thirteen single-line commands, all inert outside single-quoted slots');
    assert.deepEqual(all.map(f => f.split(' ')[2]), ['probe', 'limits', 'publish', 'publish', 'stage', 'publish', 'cleanup', 'preflight', 'update', 'owner-store', 'owner-recovery', 'owner-pending', 'owner-reconcile'],
      'every documented runner operation has a command');
    assert.deepEqual(all.filter(f => f.includes(' publish ')).map(f => [f.split(' ')[3], ...[...f.matchAll(/ --([a-z-]+) '\{?([a-z_]*)\}?'/g)].map(m => m[1] + '=' + m[2])]), [
      ['{type}', 'ns=ns', 'ttl=days', 'entry=entry', 'delivery-mode=delivery_mode', 'password-file=password_file', 'path=path'],
      ['{type}', 'ns=ns', 'ttl=days', 'entry=', 'delivery-mode=delivery_mode', 'password-file=password_file', 'text=content'],
      ['{type}', 'ns=ns', 'ttl=days', 'entry=', 'delivery-mode=delivery_mode', 'password-file=password_file', 'run=run_id'],
    ], 'every publish value sits in a single-quoted slot');
    assert.deepEqual(['RESPONSE=$(', 'BREWPAGE_EOF', 'PASS_H', '$PASSWORD', 'tr -dc', 'mktemp', '{original_json}', '{entry_shell_quoted}']
      .filter(legacy => instructions(copy).includes(legacy)), [], 'no inline heredoc, inline password or hand-built archive is left');
  });

  test(`${copy.name}: package contains the shared recipes and unchanged safety modules`, () => {
    // GIVEN the shipped package WHEN inspecting the common files THEN exact members and source bytes match.
    assert.deepEqual(readdirSync(join(copy.dir, 'references')).sort(), recipes(copy), 'only the expected recipes are packaged');
    const split = copy.name === 'openclaw' ? ['publishing.md', 'ownership.md'] : [];
    const shared = [...REFERENCE_FILES.filter(file => !split.includes(file)).map(file => 'references/' + file), 'scripts/publish.mjs', 'scripts/history.py'];
    assert.deepEqual(shared.map(path => readFileSync(join(copy.dir, path))), shared.map(path => readFileSync(join(CANONICAL, path))),
      'all shared recipe and safety files match canonical bytes');
    const commands = text => [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1]);
    assert.deepEqual(commands(['publishing.md', 'rest-runner.md'].filter(file => recipes(copy).includes(file)).map(file => reference(copy, file)).join('\n')),
      commands(readFileSync(join(CANONICAL, 'references/publishing.md'), 'utf8')), 'the shipped recipes carry every canonical runner command in order');
  });

  test(`${copy.name}: ${TOOL_RULE[copy.name][0]}`, () => {
    // GIVEN the shipped frontmatter WHEN its tool rule is read THEN it matches this copy's case.
    TOOL_RULE[copy.name][1](copy);
  });

  test(`${copy.name}: probe types a markdown file and it publishes as a rendered page`, () => {
    // GIVEN a relative .md path WHEN probed and published as the table says THEN /api/html format=markdown gets the file text.
    mkdirSync(join(projectOf(copy), 'notes'));
    writeFileSync(join(projectOf(copy), 'notes/report.md'), '# Report\n');
    const probe = run(copy, fill(copy, ' probe ', { path: 'notes/report.md' }), 'probe');
    const abs = join(projectOf(copy), 'notes/report.md');
    assert.deepEqual([probe.status, probe.stdout.split('\n').slice(0, 3)], [0, ['TYPE: markdown', 'PATH: ' + abs, 'BYTES: 9']],
      'probe prints type, absolute path and size');
    const rows = [['notes/report.md', 'html'], ['notes/report.md', 'file'], ['notes/REPORT.MD', 'html'], ['notes/report.markdown', 'html']];
    const outcomes = rows.map(([path, type], i) => {
      writeFileSync(join(projectOf(copy), path), '# Report\n');
      const typed = run(copy, fill(copy, ' probe ', { path }), 'md-probe-' + i).stdout.split('\n')[0];
      const r = run(copy, pathPublish(copy, { type, ns: 'my', days: '7', entry: '', delivery_mode: '', password_file: '', path: join(projectOf(copy), path) }), 'md-' + i);
      return [typed, r.status, r.stdout, JSON.parse(readFileSync(outFile(copy, 'md-' + i), 'utf8')).map(arg => arg.replace(/brewpage\.[A-Za-z0-9]{6}/, 'brewpage.RUN')),
        JSON.parse(readFileSync(outFile(copy, 'md-' + i) + '.payload', 'utf8')), runNames()];
    });
    assert.deepEqual(outcomes, rows.map(() => ['TYPE: markdown', 0, receipt(copy),
      ['-q', '-s', '-A', UA[copy.name], '-X', 'POST', 'https://brewpage.app/api/html?ns=my&ttl=7&format=markdown', '-H', 'Content-Type: application/json', '-d', '@' + tmp + '/brewpage.RUN/payload.json', ...HTTP_STATUS_ARGS],
      { content: '# Report\n' }, []]), 'every markdown spelling and caller type reaches /api/html, never /api/files');
  });

  test(`${copy.name}: hostile text reaches the payload verbatim and the token only the history`, () => {
    // GIVEN text with quote, substitution, backtick and operators WHEN the text fence runs THEN nothing executes.
    const hostile = "Fixture it's $(touch injected) `id`; && | markdown";
    const owner = 'B'.repeat(32);
    const r = run(copy, textPublish(copy, { content: hostile }), 'hostile', { CURL_RESPONSE: response(owner) });
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, receipt(copy), ''], 'reader and verified storage appear without raw proof');
    assert.deepEqual(JSON.parse(readFileSync(outFile(copy, 'hostile'), 'utf8')).map(arg => arg.replace(/brewpage\.[A-Za-z0-9]{6}/, 'brewpage.RUN')),
      ['-q', '-s', '-A', UA[copy.name], '-X', 'POST', 'https://brewpage.app/api/html?ns=my&ttl=15&format=markdown', '-H', 'Content-Type: application/json',
        '-d', '@' + tmp + '/brewpage.RUN/payload.json', ...HTTP_STATUS_ARGS], 'file-backed payload from a private run dir');
    assert.deepEqual(JSON.parse(readFileSync(outFile(copy, 'hostile') + '.payload', 'utf8')), { content: hostile }, 'text arrives byte-identical');
    assert.equal(existsSync(join(projectOf(copy), 'injected')), false, 'no substitution in the text ran');
    assert.deepEqual(runNames(), [], 'the run dir is removed');
    const history = join(projectOf(copy), copy.history);
    assert.deepEqual([readFileSync(history, 'utf8').split('`' + owner + '`').length - 1, statSync(history).mode & 0o777],
      [1, 0o600], 'owner token lands once in the private per-copy history file');
    assert.deepEqual(readFileSync(join(projectOf(copy), '.gitignore'), 'utf8').split('\n').filter(Boolean),
      [copy.history, copy.history.replace('brewpage-history.md', 'brewpage-recovery.json'), 'brewpage-reconciliation.json'], 'history, fallback and external reconciliation are git-ignored');
  });

  test(`${copy.name}: hostile text survives zsh parsing too`, () => {
    // GIVEN the macOS Bash-tool shell WHEN zsh -f parses the filled fence THEN argv is identical to bash.
    assert.equal(spawnSync('zsh', ['-f', '--version']).error, undefined, 'GIVEN zsh on PATH (CI plugins shard installs it)');
    const hostile = "zsh it's $(touch zsh-injected) `id` *.md ~ !";
    const file = join(base, copy.name + '-case.zsh');
    const filled = textPublish(copy, { content: hostile });
    writeFileSync(file, filled.code);
    const r = run(copy, { ...filled, code: file }, 'zsh', {}, ['zsh', '-f']);
    assert.deepEqual([r.status, r.stdout, JSON.parse(readFileSync(outFile(copy, 'zsh') + '.payload', 'utf8')), existsSync(join(projectOf(copy), 'zsh-injected'))],
      [0, receipt(copy), { content: hostile }, false], 'zsh passes the slot verbatim and runs nothing');
  });

  test(`${copy.name}: a relative password file is rejected before any run or upload`, () => {
    // GIVEN a password path that exists only relative to cwd WHEN publishing THEN fail with no run dir and no curl.
    writeFileSync(join(projectOf(copy), 'relative-password.txt'), 'fixture-relative\n');
    const r = run(copy, textPublish(copy, { password_file: 'relative-password.txt', content: 'x' }), 'relative');
    assert.deepEqual([r.status, r.stdout, runNames(), existsSync(outFile(copy, 'relative'))],
      [1, 'FAILED: password file must be an absolute path\n', [], false], 'relative path refused up front');
  });

  test(`${copy.name}: staged text survives bad password files and the retry publishes it`, () => {
    // GIVEN two staged chunks WHEN publish names bad password files THEN the run is untouched; a good one publishes.
    const first = stage(copy, '', 'part one', 'stage-1');
    const staged = first.stdout.split('\n')[0].replace('RUN: ', '');
    assert.match(staged, /^brewpage\.[A-Za-z0-9]{6}$/, 'first stage allocates a run id');
    assert.equal(stage(copy, staged, "part two's", 'stage-2').stdout, 'RUN: ' + staged + '\nBYTES: 19\n', 'second chunk appends');
    const bad = [
      ['relative-password.txt', 'FAILED: password file must be an absolute path\n'],
      [join(base, 'missing-password.txt'), 'FAILED: password source must be a non-symlink regular file\n'],
      [join(base, 'short-password.txt'), 'FAILED: password must have at least 4 characters and no control characters\n'],
    ];
    const outcomes = bad.map(([file], index) => {
      const r = run(copy, runPublish(copy, staged, file), 'pw-bad-' + index);
      return [r.status, r.stdout, runFiles(staged), existsSync(outFile(copy, 'pw-bad-' + index))];
    });
    assert.deepEqual(outcomes, bad.map(([, message]) => [1, message, [staged, staged + '/brewpage-content.md'], false]),
      'each password error leaves the staged run byte-for-byte and never uploads');
    const retry = run(copy, runPublish(copy, staged, passwordSource), 'pw-retry');
    assert.deepEqual([retry.stdout, readFileSync(outFile(copy, 'pw-retry') + '.headers', 'utf8'),
      JSON.parse(readFileSync(outFile(copy, 'pw-retry') + '.payload', 'utf8')), runNames()],
    [receipt(copy), 'X-Password: ' + password + '\n', { content: "part one\npart two's" }, []],
    'retry sends the header from a file, publishes the joined chunks and removes the run');
    assert.equal(JSON.parse(readFileSync(outFile(copy, 'pw-retry'), 'utf8')).some(arg => arg.includes(password)), false, 'no curl argv carries the password');
  });

  test(`${copy.name}: cleanup removes an abandoned staged run`, () => {
    // GIVEN a staged but cancelled run WHEN cleanup runs THEN only that run goes.
    const id = stage(copy, '', 'drop me', 'abandon').stdout.split('\n')[0].replace('RUN: ', '');
    const r = run(copy, fill(copy, ' cleanup --run', { run_id: id }), 'cleanup');
    assert.deepEqual([r.status, r.stdout, runNames()], [0, 'CLEANED: ' + id + '\n', []], 'cleanup prints the id and leaves no run');
  });

  test(`${copy.name}: a fresh run dir failing the private check is discarded`, () => {
    // GIVEN mktemp yields a non-private dir WHEN stage or publish allocates THEN it is removed and nothing uploads.
    const leaky = { PATH: leakyBin + ':' + bin + ':' + process.env.PATH };
    const unsafe = 'FAILED: publish run directory must be owned, private and non-symlink\n';
    const staged = stage(copy, '', 'x', 'leak-stage', leaky);
    const published = run(copy, textPublish(copy, { content: 'x' }), 'leak-publish', leaky);
    assert.deepEqual([staged.status, staged.stdout, published.status, published.stdout, runNames(), existsSync(outFile(copy, 'leak-publish'))],
      [1, unsafe, 1, unsafe, [], false], 'both allocations are discarded, no upload');
  });

  test(`${copy.name}: OLD/NEW winners keep the exact server identity`, () => {
    // GIVEN OLD/NEW server winners WHEN the text fence publishes per delivery mode THEN link, management link, header and history are exact.
    const manage = 'https://brewpage.app/manage/html/public/Fixture123#k=fixture-key';
    const responses = [
      { link: 'https://fixture123.brewpage.app/', ownerToken: 'C'.repeat(32), manageUrl: manage, ownerLink: 'https://brewpage.app/api/html/public/Fixture123',
        id: 'Fixture123', namespace: 'public', routingCohort: 'new-v1', deliveryMode: 'subdomain', modeLocked: false, hostingVersion: 1,
        createdAt: '2026-10-01T12:00:00Z', expiresAt: '2026-10-16T12:00:00Z' },
      { link: 'https://brewpage.app/public/Legacy1234', ownerLink: 'https://brewpage.app/api/html/public/Legacy1234', id: 'Legacy1234', namespace: 'public', ownerToken: 'D'.repeat(32) },
      { link: 'https://brewpage.app/public/LegacyNull', ownerLink: 'https://brewpage.app/api/html/public/LegacyNull', id: 'LegacyNull', namespace: 'public', ownerToken: 'E'.repeat(32), routingCohort: 'old', deliveryMode: null, hostingVersion: null },
    ];
    const fields = ['id', 'namespace', 'type', 'routingCohort', 'deliveryMode', 'modeLocked', 'hostingVersion', 'managementLink', 'manageUrl', 'entryFile', 'createdAt', 'expiresAt'];
    const nulls = Object.fromEntries(fields.map(key => [key, null]));
    const modes = [['', 'default', []], ['path', 'path', ['X-Delivery-Mode: path']], ['subdomain', 'subdomain', ['X-Delivery-Mode: subdomain']]];
    const outcomes = [];
    const expected = [];
    for (const [mode, label, header] of modes) for (const [index, winner] of responses.entries()) {
      const suffix = 'winner-' + label + '-' + index;
      const r = run(copy, textPublish(copy, { ns: 'public', delivery_mode: mode, content: 'Fixture markdown' }), suffix, { CURL_RESPONSE: JSON.stringify(winner) });
      const history = readFileSync(join(projectOf(copy), copy.history), 'utf8');
      const known = { ...nulls, ...winner };
      const identity = JSON.stringify(Object.fromEntries(fields.map(key => [key, known[key]])));
      outcomes.push([r.status, r.stdout, r.stderr, JSON.parse(readFileSync(outFile(copy, suffix), 'utf8')).filter(arg => arg.startsWith('X-Delivery-Mode:')),
        JSON.parse(readFileSync(outFile(copy, suffix) + '.payload', 'utf8')),
        history.includes('[' + winner.link + '](' + winner.link + ')'), history.includes('`' + winner.ownerToken + '`'), history.includes('`' + identity + '`')]);
      expected.push([0, 'OK ' + winner.link + '\n' + saved(copy), '', header, { content: 'Fixture markdown' }, true, true, true]);
    }
    assert.deepEqual(outcomes, expected, 'exact reader URL, management capability only in private history, header only when asked, identity outside the payload');
    const invalid = run(copy, textPublish(copy, { delivery_mode: 'invalid', content: 'x' }), 'winner-invalid');
    const rejected = run(copy, textPublish(copy, { content: 'x' }), 'winner-rejected', {
      CURL_RESPONSE: JSON.stringify({ status: 400, message: 'fixture rejection', ownerToken: 'error-private-owner' }), CURL_HTTP_STATUS: '400' });
    assert.deepEqual([invalid.status, invalid.stdout, existsSync(outFile(copy, 'winner-invalid')), rejected.status, rejected.stdout, rejected.stderr,
      readFileSync(join(projectOf(copy), copy.history), 'utf8').includes('error-private-owner'), runNames()],
    [1, 'FAILED: delivery mode must be path or subdomain\n', false, 1, 'FAILED: publish rejected (HTTP 400: fixture rejection)\n', '', false, []],
    'an invalid mode never uploads; a rejected response reveals no body and stores no token');
  });
}

const BREWDOC = { name: 'brewdoc', dir: join(ROOT, 'brewdoc/skills/publish'), token: '${CLAUDE_SKILL_DIR}', history: '.claude/brewpage-history.md' };
const HTML_PAGE = '<!doctype html>\n<html><body><p>Fixture</p></body></html>\n';
const htmlUpload = (copy, ns, ttl, format, argsMatch) => ['-q', '-s', '-A', UA[copy.name], '-X', 'POST', `https://brewpage.app/api/html?ns=${ns}&ttl=${ttl}&format=${format}&verbatim=true`,
  ...argsMatch, '-H', 'Content-Type: application/json', '-d', '@' + tmp + '/brewpage.RUN/payload.json', ...HTTP_STATUS_ARGS];
const withRunId = args => args.map(arg => arg.replace(/brewpage\.[A-Za-z0-9]{6}/, 'brewpage.RUN'));

for (const copy of [...COPIES, BREWDOC]) {
  test(`${copy.name}: html files publish as pages, whole-document text as html, the rest as today`, () => {
    // GIVEN each html file spelling, namespace, password choice and caller type WHEN probed and published THEN format=html with the file bytes.
    const dir = join(base, copy.name + '-html-routes');
    mkdirSync(dir);
    mkdirSync(projectOf(copy), { recursive: true });
    const fileRows = [
      ['page.html', 'html-file', 'public', ''],
      ['PAGE.HTM', 'html-file', 'my', ''],
      ['secret.html', 'html-file', 'my', passwordSource],
      ['stale-file-type.html', 'file', 'public', ''],
      ['stale-html-type.htm', 'html', 'my', ''],
    ];
    const fileOutcomes = fileRows.map(([name, type, ns, passwordFile], i) => {
      const path = join(dir, name);
      writeFileSync(path, HTML_PAGE);
      const probe = run(copy, fill(copy, ' probe ', { path }), 'html-probe-' + i);
      const r = run(copy, pathPublish(copy, { type, ns, days: '7', entry: '', delivery_mode: '', password_file: passwordFile, path }), 'html-file-' + i);
      return { probe: probe.stdout.split('\n').slice(0, 2), status: r.status, stdout: r.stdout,
        args: withRunId(JSON.parse(readFileSync(outFile(copy, 'html-file-' + i), 'utf8'))).filter(arg => !arg.startsWith('@' + tmp + '/brewpage.RUN/password-header')),
        headers: readFileSync(outFile(copy, 'html-file-' + i) + '.headers', 'utf8'),
        payload: JSON.parse(readFileSync(outFile(copy, 'html-file-' + i) + '.payload', 'utf8')) };
    });
    assert.deepEqual(fileOutcomes, fileRows.map(([name, , ns, passwordFile]) => ({
      probe: ['TYPE: html-file', 'PATH: ' + join(dir, name)], status: 0, stdout: receipt(copy),
      args: htmlUpload(copy, ns, 7, 'html', passwordFile ? ['-H'] : []),
      headers: passwordFile ? 'X-Password: ' + password + '\n' : '', payload: { content: HTML_PAGE } })),
    'every html file reaches /api/html as format=html, password only in its header file');

    // GIVEN inline text WHEN published THEN only a whole document goes format=html.
    const textRows = [
      ['<!doctype html><p>x</p>', 'html'],
      ['\n \t<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p>x</p>', 'html'],
      ['<html lang="en"><body>x</body></html>', 'html'],
      ['﻿<HTML>\n<body>x</body></HTML>', 'html'],
      ['<div>fragment</div>', 'markdown'],
      ['<htmlfoo>not a page</htmlfoo>', 'markdown'],
      ['# Title\n<!doctype html>', 'markdown'],
      ['plain text', 'markdown'],
    ];
    const textOutcomes = textRows.map(([content], i) => {
      const r = run(copy, textPublish(copy, { content }), 'html-text-' + i);
      return [r.status, JSON.parse(readFileSync(outFile(copy, 'html-text-' + i), 'utf8'))[6], JSON.parse(readFileSync(outFile(copy, 'html-text-' + i) + '.payload', 'utf8'))];
    });
    assert.deepEqual(textOutcomes, textRows.map(([content, format]) => [0, `https://brewpage.app/api/html?ns=my&ttl=15&format=${format}` + (format === 'html' ? '&verbatim=true' : ''), { content }]),
      'format follows the document test and the text stays verbatim');

    // GIVEN a whole document staged in chunks WHEN published by run id THEN the rejoined text goes format=html.
    const staged = stage(copy, '', '<!doctype html>', 'html-stage-1').stdout.split('\n')[0].replace('RUN: ', '');
    stage(copy, staged, '<p>x</p>', 'html-stage-2');
    const stagedRun = run(copy, runPublish(copy, staged, ''), 'html-staged');
    assert.deepEqual([stagedRun.status, JSON.parse(readFileSync(outFile(copy, 'html-staged'), 'utf8'))[6], JSON.parse(readFileSync(outFile(copy, 'html-staged') + '.payload', 'utf8'))],
      [0, 'https://brewpage.app/api/html?ns=my&ttl=15&format=html&verbatim=true', { content: '<!doctype html>\n<p>x</p>' }], 'staged documents are detected too');

    // GIVEN other files WHEN published THEN their routes are unchanged, whatever the bytes say.
    const filePath = join(dir, 'page.txt');
    const mdPath = join(dir, 'page.md');
    writeFileSync(filePath, HTML_PAGE);
    writeFileSync(mdPath, HTML_PAGE);
    const pathRun = (type, path, suffix) => run(copy, pathPublish(copy, { type, ns: 'my', days: '7', entry: '', delivery_mode: '', password_file: '', path }), suffix);
    assert.deepEqual([pathRun('file', filePath, 'html-txt').status, JSON.parse(readFileSync(outFile(copy, 'html-txt'), 'utf8'))[6],
      pathRun('html', mdPath, 'html-md').status, JSON.parse(readFileSync(outFile(copy, 'html-md'), 'utf8'))[6]],
    [0, 'https://brewpage.app/api/files?ns=my&ttl=7', 0, 'https://brewpage.app/api/html?ns=my&ttl=7&format=markdown'], 'a .txt stays a file, a markdown path stays markdown');

    // GIVEN bad html-file input WHEN published THEN it fails with no run dir and no upload.
    const refused = [[filePath, 'html-file', 'FAILED: html-file takes a .html or .htm --path\n']];
    assert.deepEqual(refused.map(([path, type], i) => {
      const r = pathRun(type, path, 'html-refused-' + i);
      return [r.status, r.stdout, existsSync(outFile(copy, 'html-refused-' + i)), runNames()];
    }), refused.map(([, , message]) => [1, message, false, []]), 'bad input is refused before any upload');
  });

  test(`${copy.name}: non-UTF-8 html and markdown go multipart to /api/files with their bytes untouched`, () => {
    // GIVEN non-UTF-8 input WHEN published THEN the multipart file snapshot preserves its bytes.
    const dir = join(base, copy.name + '-html-legacy');
    mkdirSync(dir);
    mkdirSync(projectOf(copy), { recursive: true });
    const bytes = Buffer.from('<!doctype html><p>caf\xe9</p>', 'latin1');
    const rows = [['latin1.html', 'html-file', ''], ['LATIN1.HTM', 'html-file', ''], ['stale-file.html', 'file', ''], ['stale-html.htm', 'html', ''], ['secret.html', 'html-file', passwordSource], ['latin1.md', 'html', ''], ['stale-file.markdown', 'file', '']];
    const outcomes = rows.map(([name, type, passwordFile], i) => {
      const path = join(dir, name);
      writeFileSync(path, bytes);
      const probe = run(copy, fill(copy, ' probe ', { path }), 'legacy-probe-' + i);
      const r = run(copy, pathPublish(copy, { type, ns: 'my', days: '7', entry: '', delivery_mode: '', password_file: passwordFile, path }), 'legacy-' + i);
      return { probe: probe.stdout.split('\n')[0], status: r.status, stdout: r.stdout,
        args: withRunId(JSON.parse(readFileSync(outFile(copy, 'legacy-' + i), 'utf8'))),
        headers: readFileSync(outFile(copy, 'legacy-' + i) + '.headers', 'utf8'),
        payload: readFileSync(outFile(copy, 'legacy-' + i) + '.payload', 'utf8'), source: readFileSync(path),
        sent: readFileSync(outFile(copy, 'legacy-' + i) + '.file'), runs: runNames() };
    });
    assert.deepEqual(outcomes, rows.map(([name, , passwordFile]) => ({
      probe: /\.(md|markdown)$/.test(name) ? 'TYPE: markdown' : 'TYPE: html-file', status: 0, stdout: receipt(copy),
      args: ['-q', '-s', '-A', UA[copy.name], '-X', 'POST', 'https://brewpage.app/api/files?ns=my&ttl=7',
        ...(passwordFile ? ['-H', '@' + tmp + '/brewpage.RUN/password-header.txt'] : []), '-F', 'file=@"' + join(tmp, 'brewpage.RUN/checked', name) + '"', ...HTTP_STATUS_ARGS],
      headers: passwordFile ? 'X-Password: ' + password + '\n' : '', payload: '', source: bytes, sent: bytes, runs: [] })),
    'every row sends exact source bytes from its private snapshot, with password only in the header file');
  });

  test(`${copy.name}: --state rides in the page body or the site form, anything else is refused before upload`, () => {
    // GIVEN a shipped publish fence with ` --state '{state}'` appended WHEN it runs THEN the compact config reaches the request.
    const dir = join(base, copy.name + '-state');
    mkdirSync(join(dir, 'site'), { recursive: true });
    writeFileSync(join(dir, 'form.html'), HTML_PAGE);
    writeFileSync(join(dir, 'site/index.html'), HTML_PAGE);
    writeFileSync(join(dir, 'notes.txt'), 'x');
    const doc = '<!doctype html><p>x</p>';
    const rsvp = { collections: { rsvps: { choices: { coming: ['yes', "it's"] } } } };
    const withState = ({ code, env }, state) => ({ code: code + " --state '" + state.replaceAll("'", "'\\''") + "'", env });
    const byPath = (type, path) => pathPublish(copy, { type, ns: 'my', days: '7', entry: '', delivery_mode: '', password_file: '', path: join(dir, path) });
    const pages = [
      ['text', textPublish(copy, { content: doc }), '{}', { content: doc, state: {} }],
      ['spaced', textPublish(copy, { content: doc }), ' {"collections": {"g": {"mode": "shared"}}} ', { content: doc, state: { collections: { g: { mode: 'shared' } } } }],
      ['file', byPath('html-file', 'form.html'), JSON.stringify(rsvp), { content: HTML_PAGE, state: rsvp }],
    ];
    const payloadOf = suffix => JSON.parse(readFileSync(outFile(copy, 'state-' + suffix) + '.payload', 'utf8'));
    assert.deepEqual(pages.map(([suffix, fence, state]) => [run(copy, withState(fence, state), 'state-' + suffix).status, payloadOf(suffix), runNames()]),
      pages.map(([, , , payload]) => [0, payload, []]), 'every page body carries {content, state}, state compacted to one object');

    const site = run(copy, withState(byPath('site-dir', 'site'), '{ }'), 'state-site');
    const siteArgs = JSON.parse(readFileSync(outFile(copy, 'state-site'), 'utf8'));
    assert.deepEqual([site.status, siteArgs.slice(-4), runNames()], [0, ['--form-string', 'state={}', ...HTTP_STATUS_ARGS], []], 'a site sends state as one literal form field and captures its one response status');

    const refused = [
      ['array', textPublish(copy, { content: doc }), '[]', 'FAILED: --state must be one JSON object, e.g. {}\n'],
      ['two', textPublish(copy, { content: doc }), '{} {}', 'FAILED: --state must be one JSON object, e.g. {}\n'],
      ['plain', byPath('file', 'notes.txt'), '{}', 'FAILED: --state applies to UTF-8 HTML pages and sites only\n'],
    ];
    assert.deepEqual(refused.map(([suffix, fence, state]) => {
      const r = run(copy, withState(fence, state), 'state-' + suffix);
      return [r.status, r.stdout, existsSync(outFile(copy, 'state-' + suffix)), runNames()];
    }), refused.map(([, , , message]) => [1, message, false, []]), 'bad state or a non-page type fails before any upload or run dir');
  });
}

after(() => rmSync(base, { recursive: true, force: true }));
