#!/usr/bin/env node
// brewmod-* mods: fetched and updated when installed, never installed by this skill.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = readFileSync(join(ROOT, 'SKILL.md'), 'utf8');
const phase = (from, to) => SKILL.slice(SKILL.indexOf(from), SKILL.indexOf(to));
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
    'brewmod-placeholders': '9.9.9', 'brewmod-plan-effort': '9.9.9',
}, 'THEN the fetch output lists suite plugins and mods');

// GIVEN Phase 3 WHEN it describes installs THEN mods are never installed and never offered.
assert.deepEqual(phase('## Phase 3', '## Phase 4').split('\n').filter(l => l.includes('Mods are never installed')), [
    '`update` skips install. Mods are never installed here, in any mode, even when named in the prompt.',
], 'THEN Phase 3 forbids installing mods in every mode');
assert.deepEqual(phase('## Phase 3', '## Phase 4').match(/claude plugin install [^\n]*/g), ['claude plugin install <plugin>@claude-brewcode && echo "✅ install <plugin> OK" || echo "❌ install <plugin> FAILED"'],
    'THEN the only install command in Phase 3 is the suite template');

// GIVEN Phase 4 WHEN the update set is built THEN installed mods join it.
assert.deepEqual(phase('## Phase 4', '## Phase 5').split('\n').filter(l => l.includes('installed mods')), [
    'Update set from that answer only: "Update all" = outdated suite + outdated installed mods + every `other` marketplace row',
    '(latest unknown; update is a no-op when current); "Update suite only" = outdated suite + outdated installed mods; "Update',
], 'THEN Phase 4 updates installed mods');

// GIVEN install-prompt.md THEN it stays at the four suite plugins.
const install = readFileSync(join(ROOT, 'references', 'install-prompt.md'), 'utf8');
assert.deepEqual(install.match(/claude plugin install \S+/g), [
    'claude plugin install brewcode@claude-brewcode', 'claude plugin install brewdoc@claude-brewcode',
    'claude plugin install brewtools@claude-brewcode', 'claude plugin install brewui@claude-brewcode',
], 'THEN install-prompt.md has no mod install');
console.log('suite-mods: PASS');
