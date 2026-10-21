#!/usr/bin/env node
// brewmod-* mods: fetched and offered with the suite, placeholders first everywhere; install placement is pinned in suite-default.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
const REF = file => readFileSync(join(ROOT, 'references', file), 'utf8');
const SECTIONS = SKILL.split(/^(?=## )/m).map(s => ({ head: s.split('\n')[0], lines: s.split('\n') }));
const where = re => SECTIONS.flatMap(s => s.lines.filter(l => re.test(l)).map(l => [s.head, l]));
const base = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-update-mods-')));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
const bin = join(base, 'bin');
mkdirSync(bin);
// Stub curl answers each raw plugin.json URL with version 9.9.9 for the plugin named in the URL.
writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash
url="\${@: -1}"
name="\${url%/.claude-plugin/plugin.json}"; name="\${name##*/}"
printf '{"name":"%s","version":"9.9.9"}' "$name"
`);
chmodSync(join(bin, 'curl'), 0o755);

// GIVEN the fetch script WHEN every raw plugin.json answers THEN the JSON carries the 4 suite plugins and both mods, keyed by name.
const r = spawnSync('/bin/bash', [join(ROOT, 'scripts', 'fetch-latest-versions.sh')], {
    encoding: 'utf8', timeout: 20000, env: { PATH: `${bin}:${process.env.PATH}` },
});
assert.equal(r.status, 0, 'THEN the fetch script exits 0');
assert.deepEqual(JSON.parse(r.stdout), {
    brewcode: '9.9.9', brewdoc: '9.9.9', brewtools: '9.9.9', brewui: '9.9.9',
    'brewmod-placeholders': '9.9.9', 'brewmod-plan-effort': '9.9.9', 'brewmod-reminders': '9.9.9',
}, 'THEN the fetch output lists suite plugins and mods');

// GIVEN SKILL.md WHEN it names the mod floor THEN the only rule is the 2.1.301 gate on offers.
assert.deepEqual(where(/2\.1\.301/), [
    ['## Critical Rules', '- Mods need Claude Code 2.1.301 or newer: below that, `plan` offers no mod and the report prints'],
    ['## Phase 6 — Report', 'for missing mods and plugins (the Claude Code 2.1.301 line, the codewords **Moved** line, install'],
], 'THEN mods are offered only on Claude Code 2.1.301+');

// GIVEN install-prompt.md THEN it installs the 3 mods and the 4 plugins, placeholders first.
assert.deepEqual(REF('install-prompt.md').match(/claude plugin install \S+/g), [
    'claude plugin install brewmod-placeholders@claude-brewcode', 'claude plugin install brewmod-plan-effort@claude-brewcode', 'claude plugin install brewmod-reminders@claude-brewcode',
    'claude plugin install brewcode@claude-brewcode', 'claude plugin install brewdoc@claude-brewcode',
    'claude plugin install brewtools@claude-brewcode', 'claude plugin install brewui@claude-brewcode',
], 'THEN install-prompt.md lists the 7 installs in the documented order');

// GIVEN update-commands.md THEN its manual loop updates one name per call, placeholders first.
assert.deepEqual(REF('update-commands.md').split('\n').filter(l => l.startsWith('for p in ')), [
    'for p in brewmod-placeholders brewmod-plan-effort brewmod-reminders brewcode brewdoc brewtools brewui; do claude plugin update "$p@claude-brewcode"; done',
], 'THEN the manual loop keeps the documented order');
console.log('suite-mods: PASS');
