#!/usr/bin/env node
// fetch-latest-versions.sh fallback: every raw fetch fails -> the release tag, resolved by ONE gh call per run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-update-fallback-')));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
const bin = join(base, 'bin'), calls = join(base, 'gh.calls');
mkdirSync(bin);
writeFileSync(join(bin, 'curl'), '#!/usr/bin/env bash\nexit 22\n');
writeFileSync(join(bin, 'gh'), `#!/usr/bin/env bash\necho call >> "${calls}"\nprintf '%s\\n' "\${GH_TAG:-}"\n`);
chmodSync(join(bin, 'curl'), 0o755);
chmodSync(join(bin, 'gh'), 0o755);
const NAMES = ['brewcode', 'brewdoc', 'brewtools', 'brewui', 'brewmod-placeholders', 'brewmod-plan-effort'];
const everyPlugin = (version) => Object.fromEntries(NAMES.map((name) => [name, version]));
const run = (ghTag) => {
    rmSync(calls, { force: true });
    const r = spawnSync('/bin/bash', [join(ROOT, 'scripts', 'fetch-latest-versions.sh')], {
        encoding: 'utf8', timeout: 20000, env: { PATH: `${bin}:${process.env.PATH}`, GH_TAG: ghTag },
    });
    return { status: r.status, json: JSON.parse(r.stdout), ghCalls: existsSync(calls) ? readFileSync(calls, 'utf8') : '' };
};

// GIVEN curl fails for every plugin and gh answers a release tag WHEN fetched THEN all six get that tag from one gh call.
assert.deepEqual(run('v9.8.7'), { status: 0, json: everyPlugin('9.8.7'), ghCalls: 'call\n' },
    'THEN the release tag is resolved once and shared by all six plugins');

// GIVEN curl fails and gh answers nothing WHEN fetched THEN every plugin is "unknown" and gh is still asked only once.
assert.deepEqual(run(''), { status: 0, json: everyPlugin('unknown'), ghCalls: 'call\n' },
    'THEN an empty release answer is not retried per plugin');

console.log('suite-fetch-fallback: PASS');
