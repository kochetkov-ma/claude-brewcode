#!/usr/bin/env node
// update-plugin.sh install step: update first; uninstall+install only as a fallback that keeps userConfig and the disabled flag.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = JSON.parse(readFileSync(join(SCRIPTS, '..', '..', 'brewcode/.claude-plugin/plugin.json'), 'utf8')).version;
const ID = 'brewcode@claude-brewcode';

// Stub `claude`: logs args; `update` fails when $STUB_FAIL_UPDATE is set; `update`/`install` create the VER cache dir; `list` prints $STUB_LIST (DEF: brewcode installed at user scope).
const STUB = `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + '\\n');
if (args[1] === 'list') { process.stdout.write(process.env.STUB_LIST || '[{"id":"brewcode@claude-brewcode","scope":"user"}]'); process.exit(0); }
if (args[1] === 'update' && process.env.STUB_FAIL_UPDATE) { console.error('stub update failure'); process.exit(1); }
if (args[1] === 'update' || args[1] === 'install') {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins/cache/claude-brewcode', args[2].split('@')[0], process.env.STUB_VERSION);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), '{}');
}
`;

const HOMES = [];
process.on('exit', () => HOMES.forEach(h => rmSync(h, { recursive: true, force: true })));

function sandbox(settings) {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'g3-install-')));
    HOMES.push(home);
    const profile = join(home, '.claude-t');
    const bin = join(home, 'bin');
    for (const d of [join(profile, 'plugins'), bin]) mkdirSync(d, { recursive: true });
    writeFileSync(join(profile, 'settings.json'), JSON.stringify(settings));
    writeFileSync(join(bin, 'claude'), STUB);
    chmodSync(join(bin, 'claude'), 0o755);
    return { home, profile, bin, log: join(home, 'stub.log'), updateLog: join(home, 'update.log') };
}

function run(sb, args, extraEnv = {}) {
    const r = spawnSync('/bin/bash', [join(SCRIPTS, 'update-plugin.sh'), ...args], {
        cwd: sb.home, encoding: 'utf8', timeout: 60000,
        env: { PATH: `${sb.bin}:${process.env.PATH}`, HOME: sb.home, CLAUDE_CONFIG_DIR: sb.profile,
            STUB_LOG: sb.log, STUB_VERSION: VER, BREWCODE_UPDATE_LOG: sb.updateLog, ...extraEnv },
    });
    const calls = existsSync(sb.log) ? readFileSync(sb.log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    return { rc: r.status, calls, lines: r.stdout.split('\n') };
}

const SETTINGS = {
    enabledPlugins: { [ID]: false },
    pluginConfigs: { [ID]: { options: { planEffort: 'max', statusLine: false, label: 'a=b c' } } },
};

// GIVEN the target version is not cached yet WHEN update-plugin.sh runs and `claude plugin update` succeeds
// THEN only update runs: no uninstall, no install.
{
    const sb = sandbox(SETTINGS);
    const r = run(sb, ['brewcode']);
    assert.deepEqual({ rc: r.rc, calls: r.calls }, {
        rc: 0,
        calls: [
            ['plugin', 'marketplace', 'update', 'claude-brewcode'],
            ['plugin', 'list', '--json'],
            ['plugin', 'update', ID],
            ['plugin', 'list', '--json'],
        ],
    }, 'THEN a missing new-version cache no longer triggers uninstall+install');
}

// GIVEN a disabled plugin with saved userConfig WHEN update fails and the cache stays missing
// THEN uninstall+install runs with every saved option as --config and the plugin is disabled again.
{
    const sb = sandbox(SETTINGS);
    const r = run(sb, ['brewcode'], { STUB_FAIL_UPDATE: '1' });
    assert.deepEqual({ rc: r.rc, calls: r.calls }, {
        rc: 0,
        calls: [
            ['plugin', 'marketplace', 'update', 'claude-brewcode'],
            ['plugin', 'list', '--json'],
            ['plugin', 'update', ID],
            ['plugin', 'uninstall', 'brewcode'],
            ['plugin', 'install', ID, '--config', 'planEffort=max', '--config', 'statusLine=false', '--config', 'label=a=b c'],
            ['plugin', 'disable', ID],
            ['plugin', 'list', '--json'],
        ],
    }, 'THEN the fallback restores config and disabled state');
}

// GIVEN an enabled plugin without saved config WHEN update fails and the cache stays missing
// THEN the fallback installs with no --config and does not call disable.
{
    const sb = sandbox({});
    const r = run(sb, ['brewcode'], { STUB_FAIL_UPDATE: '1' });
    assert.deepEqual({ rc: r.rc, calls: r.calls }, {
        rc: 0,
        calls: [
            ['plugin', 'marketplace', 'update', 'claude-brewcode'],
            ['plugin', 'list', '--json'],
            ['plugin', 'update', ID],
            ['plugin', 'uninstall', 'brewcode'],
            ['plugin', 'install', ID],
            ['plugin', 'list', '--json'],
        ],
    }, 'THEN a plain reinstall adds nothing');
}

// GIVEN the target version is not cached WHEN --dry-run runs THEN the plan says update first and changes nothing.
{
    const sb = sandbox(SETTINGS);
    const r = run(sb, ['brewcode', '--dry-run']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, planned: r.lines.filter(l => l.includes('plugin update')) }, {
        rc: 0,
        calls: [['plugin', 'list', '--json'], ['plugin', 'list', '--json']],
        planned: [`  claude plugin update ${ID} -> ${join(sb.profile, 'plugins/cache/claude-brewcode/brewcode', VER)} (uninstall + install only if update fails or leaves the cache missing)`],
    }, 'THEN dry-run plans update, not uninstall+install');
}

const MOD = 'brewmod-placeholders';
const MOD_ID = `${MOD}@claude-brewcode`;
const MOD_VER = JSON.parse(readFileSync(join(SCRIPTS, '..', '..', MOD, '.claude-plugin/plugin.json'), 'utf8')).version;
const modCache = sb => join(sb.profile, 'plugins/cache/claude-brewcode', MOD, MOD_VER);

// GIVEN the mod's version dir is already cached but the mod is absent from the user-scope list
// WHEN the single-name run happens THEN install runs (no update, no uninstall) and rc is 0.
{
    const sb = sandbox({});
    mkdirSync(modCache(sb), { recursive: true });
    writeFileSync(join(modCache(sb), 'plugin.json'), '{}');
    const r = run(sb, [MOD], { STUB_LIST: '[]', STUB_VERSION: MOD_VER });
    assert.deepEqual({ rc: r.rc, calls: r.calls }, {
        rc: 0,
        calls: [
            ['plugin', 'marketplace', 'update', 'claude-brewcode'],
            ['plugin', 'list', '--json'],
            ['plugin', 'install', MOD_ID],
            ['plugin', 'list', '--json'],
        ],
    }, 'THEN a pre-existing cache dir does not skip the first install');
}

// GIVEN the mod is installed at user scope and its version dir is cached WHEN the single-name run happens
// THEN only update runs: no install, no uninstall.
{
    const sb = sandbox({});
    mkdirSync(modCache(sb), { recursive: true });
    writeFileSync(join(modCache(sb), 'plugin.json'), '{}');
    const r = run(sb, [MOD], { STUB_LIST: JSON.stringify([{ id: MOD_ID, scope: 'user' }]), STUB_VERSION: MOD_VER });
    assert.deepEqual({ rc: r.rc, calls: r.calls }, {
        rc: 0,
        calls: [
            ['plugin', 'marketplace', 'update', 'claude-brewcode'],
            ['plugin', 'list', '--json'],
            ['plugin', 'update', MOD_ID],
            ['plugin', 'list', '--json'],
        ],
    }, 'THEN an installed mod is only updated');
}

// GIVEN the mod is absent from the user-scope list WHEN --dry-run runs THEN the plan says install and nothing changes.
{
    const sb = sandbox({});
    const r = run(sb, [MOD, '--dry-run'], { STUB_LIST: '[]' });
    assert.deepEqual({ rc: r.rc, calls: r.calls, planned: r.lines.filter(l => l.includes('plugin install')) }, {
        rc: 0,
        calls: [['plugin', 'list', '--json'], ['plugin', 'list', '--json']],
        planned: [`  claude plugin install ${MOD_ID} -> ${modCache(sb)} (not installed at user scope)`],
    }, 'THEN dry-run plans install for a mod that is not installed');
}

console.log('suite-update-install: all assertions passed');
