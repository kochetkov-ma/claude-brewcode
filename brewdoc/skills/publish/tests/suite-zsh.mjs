#!/usr/bin/env node
// D1 regression: shipped html/site blocks under `zsh -f` (macOS Bash-tool shell), fake curl, no network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, statSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const zshProbe = spawnSync('zsh', ['-f', '--version'], { encoding: 'utf8' });
if (zshProbe.error && zshProbe.error.code === 'ENOENT') {
  console.log('SKIP publish zsh: zsh not found on PATH - D1 zsh regression not exercised');
  process.exit(0);
}

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'publish-zsh-')));
const root = join(base, 'project');
const bin = join(base, 'bin');
const tmp = join(base, 'tmp');
mkdirSync(root); mkdirSync(bin); mkdirSync(tmp);
const curl = join(bin, 'curl');
writeFileSync(curl, [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const args = process.argv.slice(2);',
  'const files = {};',
  'for (const a of args) { const m = /^(?:[a-z]+=)?@(.+)$/.exec(a); if (m) files[m[1]] = fs.existsSync(m[1]) ? fs.readFileSync(m[1]).length : null; }',
  'const d = args.includes("-d") ? args[args.indexOf("-d") + 1].slice(1) : "";',
  'const payload = d && fs.existsSync(d) ? fs.readFileSync(d, "utf8") : null;',
  'fs.writeFileSync(process.env.CURL_LOG, JSON.stringify({ args, files, payload }));',
  'process.stdout.write(process.env.CURL_RESPONSE);',
].join('\n'));
chmodSync(curl, 0o755);

const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1].replaceAll('${CLAUDE_SKILL_DIR}', skillDir));
function shipped(marker) {
  const found = blocks.filter(b => b.includes(marker));
  assert.equal(found.length, 1, 'GIVEN exactly one shipped block contains ' + marker);
  return found[0];
}
const shippedBlocks = { html: shipped('api/html?'), dir: shipped('publish.mjs" pack'), zip: shipped('publish.mjs" inspect') };
const response = JSON.stringify({ link: 'https://fixture.brewpage.app/', ownerToken: 'zsh-owner', fileCount: 3 });
let seq = 0;

function zsh(code, log) {
  const file = join(base, 'case-' + (seq++) + '.zsh');
  writeFileSync(file, code);
  return spawnSync('zsh', ['-f', file], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, TMPDIR: tmp + '/', PATH: bin + ':' + process.env.PATH, CURL_LOG: log, CURL_RESPONSE: response },
  });
}
function prepare() {
  const r = zsh('. "' + skillDir + '/scripts/brewpage-lib.sh" || exit 1\nbp_prepare\n', join(base, 'unused'));
  assert.equal(r.status, 0, 'GIVEN bp_prepare succeeds under zsh: ' + r.stderr);
  const dir = r.stdout.trim();
  assert.equal(statSync(dir).mode & 0o777, 0o700, 'GIVEN the zsh-allocated run dir is private');
  assert.equal(dirname(dir), tmp, 'GIVEN zsh allocates under $TMPDIR (trailing slash, as macOS sets it)');
  return dir;
}
// Drops one lib setopt via a function shadowing the builtin: proves each option is load-bearing.
function without(option) {
  return 'setopt() { local o; for o in "$@"; do [ "$o" = ' + option + ' ] || builtin setopt "$o"; done; }\n';
}
function runBlock(kind, entry, input, prefix = '') {
  const run = prepare();
  writeFileSync(join(run, input.name), input.body);
  const log = join(base, 'curl-' + seq + '.json');
  const code = shippedBlocks[kind].replaceAll('{ns}', 'public').replaceAll('{days}', '15').replaceAll('{entry}', entry)
    .replaceAll('{run_id}', basename(run)).replaceAll('{password_mode}', 'none').replaceAll('{delivery_mode}', '');
  const result = zsh(prefix + code, log);
  return { run, log, result, curl: existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : null };
}
function manifest(zipName, bytes) {
  return ['ARCHIVE MANIFEST — ' + zipName, '  index.html', '  sub/page.html', '  sub/style.css', 'FILES: 3',
    'BYTES: ' + bytes, 'ENTRY: sub/page.html', 'SKIPPED: 0', 'RESULT: ok'].join('\n') + '\n';
}

try {
  const site = join(base, 'site');
  mkdirSync(join(site, 'sub'), { recursive: true });
  writeFileSync(join(site, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(site, 'sub/page.html'), '<h1>page</h1>');
  writeFileSync(join(site, 'sub/style.css'), 'h1{}');
  const fixtureZip = join(base, 'fixture.zip');
  const packed = spawnSync('node', [join(skillDir, 'scripts/publish.mjs'), 'pack', '--dir', site, '--out', fixtureZip], { encoding: 'utf8' });
  assert.equal(packed.status, 0, 'GIVEN the fixture zip packs: ' + packed.stdout);
  const fixtureBytes = statSync(fixtureZip).size;
  const dirInput = { name: 'brewpage-target-path.txt', body: site + '\n' };
  const zipInput = { name: 'brewpage-target-path.txt', body: fixtureZip + '\n' };

  // GIVEN the shipped HTML block WHEN run under zsh -f THEN the payload survives bp_begin and reaches curl.
  const html = runBlock('html', '', { name: 'brewpage-content.md', body: 'Fixture markdown\n' });
  assert.equal(html.result.status, 0, 'THEN zsh HTML block exits 0: ' + html.result.stderr);
  assert.equal(html.result.stdout, 'OK https://fixture.brewpage.app/\n', 'THEN zsh HTML block prints only the URL line');
  assert.equal(html.result.stderr, '', 'THEN zsh HTML block writes nothing to stderr');
  const payload = '{\n  "content": "Fixture markdown\\n"\n}\n';
  assert.deepEqual(html.curl, {
    args: ['-s', '-X', 'POST', 'https://brewpage.app/api/html?ns=public&ttl=15&format=markdown',
      '-H', 'Content-Type: application/json', '-d', '@' + html.run + '/payload.json'],
    files: { [html.run + '/payload.json']: Buffer.byteLength(payload) }, payload,
  },'THEN curl gets exact argv and the payload file still exists at call time');
  assert.equal(existsSync(html.run), false, 'THEN the EXIT trap removes the run dir only after the block ends');

  // GIVEN the shipped site (directory) block and a nested entry WHEN run under zsh -f THEN --entry splits into two words.
  const dir = runBlock('dir', 'sub/page.html', dirInput);
  assert.equal(dir.result.status, 0, 'THEN zsh site-dir block exits 0: ' + dir.result.stdout + dir.result.stderr);
  const dirBytes = dir.curl.files[dir.run + '/site.zip'];
  assert.equal(dir.result.stdout, manifest('site.zip', dirBytes) + 'OK https://fixture.brewpage.app/ | Files: 3\n',
    'THEN zsh site-dir block prints the manifest with the requested entry and the URL line');
  assert.equal(dir.result.stderr, '', 'THEN zsh site-dir block writes nothing to stderr');
  assert.deepEqual(dir.curl.args, ['-s', '-X', 'POST', 'https://brewpage.app/api/sites?ns=public&ttl=15&entry=sub%2Fpage.html',
    '-H', 'User-Agent: ClaudeCode/1.0', '-F', 'archive=@' + dir.run + '/site.zip'], 'THEN curl gets the encoded entry and the run-dir archive');
  assert.equal(typeof dirBytes, 'number', 'THEN the packed archive exists when curl reads it');
  assert.equal(existsSync(dir.run), false, 'THEN the site-dir run dir is removed at exit');

  // GIVEN the shipped site (ZIP) block and a nested entry WHEN run under zsh -f THEN inspect honours the entry.
  const zip = runBlock('zip', 'sub/page.html', zipInput);
  assert.equal(zip.result.status, 0, 'THEN zsh site-zip block exits 0: ' + zip.result.stdout + zip.result.stderr);
  assert.equal(zip.result.stdout, manifest('fixture.zip', fixtureBytes) + 'OK https://fixture.brewpage.app/ | Files: 3\n',
    'THEN zsh site-zip block prints the manifest with the requested entry and the URL line');
  assert.equal(zip.result.stderr, '', 'THEN zsh site-zip block writes nothing to stderr');
  assert.deepEqual(zip.curl, {
    args: ['-s', '-X', 'POST', 'https://brewpage.app/api/sites?ns=public&ttl=15&entry=sub%2Fpage.html',
      '-H', 'User-Agent: ClaudeCode/1.0', '-F', 'archive=@' + fixtureZip],
    files: { [fixtureZip]: fixtureBytes }, payload: null,
  }, 'THEN curl uploads the user zip unchanged');
  assert.equal(existsSync(fixtureZip), true, 'THEN the user-supplied zip is preserved');
  assert.equal(existsSync(zip.run), false, 'THEN the site-zip run dir is removed at exit');

  // GIVEN POSIX_TRAPS dropped WHEN blocks run THEN the D1 trap defect reproduces (suite sensitivity control).
  const noTrapHtml = runBlock('html', '', { name: 'brewpage-content.md', body: 'Fixture markdown\n' }, without('POSIX_TRAPS'));
  assert.equal(noTrapHtml.result.status, 1, 'THEN without POSIX_TRAPS the HTML block fails');
  assert.equal(noTrapHtml.result.stdout, '', 'THEN without POSIX_TRAPS the HTML block prints no OK line');
  assert.match(noTrapHtml.result.stderr, new RegExp(': no such file or directory: ' + noTrapHtml.run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/payload\\.json\\n$'),
    'THEN the run dir was deleted when bp_begin returned');
  assert.equal(noTrapHtml.curl, null, 'THEN without POSIX_TRAPS curl is never reached by the HTML block');
  const noTrapDir = runBlock('dir', '', dirInput, without('POSIX_TRAPS'));
  assert.equal(noTrapDir.result.status, 1, 'THEN without POSIX_TRAPS the site-dir block fails');
  assert.equal(noTrapDir.result.stdout, 'FAILED: target path missing\n', 'THEN without POSIX_TRAPS the target path file is already gone');
  assert.equal(noTrapDir.curl, null, 'THEN without POSIX_TRAPS curl is never reached by the site-dir block');

  // GIVEN SH_WORD_SPLIT dropped WHEN site blocks pass an entry THEN `--entry <name>` stays one word (D1 split defect).
  for (const [kind, input] of [['dir', dirInput], ['zip', zipInput]]) {
    const noSplit = runBlock(kind, 'sub/page.html', input, without('SH_WORD_SPLIT'));
    assert.equal(noSplit.result.status, 1, 'THEN without SH_WORD_SPLIT the site-' + kind + ' block fails');
    assert.equal(noSplit.result.stdout, 'FAILED: bad argument near "--entry sub/page.html"\nRESULT: fail\n'
      + 'FAILED: archive not verified (publish.mjs exit 1) — nothing was uploaded\n', 'THEN publish.mjs rejects the unsplit entry word: ' + kind);
    assert.equal(noSplit.curl, null, 'THEN without SH_WORD_SPLIT curl is never reached: ' + kind);
    assert.equal(existsSync(noSplit.run), false, 'THEN the failed site-' + kind + ' run dir is still removed at exit');
  }
  console.log('PASS publish zsh: shipped html, site-dir and site-zip blocks under zsh -f; POSIX_TRAPS and SH_WORD_SPLIT controls fail as D1');
} finally {
  rmSync(base, { recursive: true, force: true });
}
