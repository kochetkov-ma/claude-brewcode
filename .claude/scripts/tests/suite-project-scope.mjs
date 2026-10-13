#!/usr/bin/env node
// update-plugin.sh + clean-plugin-cache.sh: project/local installs update from their projectPath before the prune.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SCRIPTS, '..', '..');
const VER = JSON.parse(readFileSync(join(REPO, 'brewcode/.claude-plugin/plugin.json'), 'utf8')).version;
const OLD = '0.0.1';
const ID = 'brewcode@claude-brewcode';

// Stub `claude`: logs {cwd,args}; `update` moves rows of that scope (project/local: projectPath == cwd) to $STUB_VERSION.
const STUB = `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), cwd = fs.realpathSync(process.cwd());
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd, args }) + '\\n');
const file = path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins', 'installed_plugins.json');
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[1] === 'list') {
  const rows = Object.entries(db.plugins).flatMap(([id, rs]) => rs.map(r => ({ id, scope: r.scope, version: r.version,
    projectPath: r.projectPath ?? null, installPath: r.installPath, enabled: true })));
  process.stdout.write(JSON.stringify(rows));
  process.exit(0);
}
if (args[1] !== 'update') process.exit(0);
const id = args[2], si = args.indexOf('--scope'), scope = si > 0 ? args[si + 1] : 'user';
if ((process.env.STUB_FAIL_SCOPES || '').split(',').includes(scope)) { console.error('stub failure ' + scope); process.exit(1); }
const hits = (db.plugins[id] || []).filter(r => r.scope === scope && (scope === 'user' || r.projectPath === cwd));
if (hits.length === 0) { console.error('not installed at scope ' + scope + ' in ' + cwd); process.exit(1); }
const name = id.split('@')[0], dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins/cache/claude-brewcode', name, process.env.STUB_VERSION);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'plugin.json'), '{}');
for (const r of hits) { r.version = process.env.STUB_VERSION; r.installPath = dir; }
fs.writeFileSync(file, JSON.stringify(db));
console.log('updated ' + id + ' for scope ' + scope);
`;

function sandbox({ profileName = '.claude-t', projectExists = true, userVersion = OLD } = {}) {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'g3-scope-')));
    const profile = join(home, profileName);
    const cache = join(profile, 'plugins/cache/claude-brewcode/brewcode');
    const project = join(home, 'proj');
    const other = join(home, 'elsewhere');
    const bin = join(home, 'bin');
    for (const d of [join(cache, OLD), join(cache, VER), other, bin]) mkdirSync(d, { recursive: true });
    for (const v of [OLD, VER]) writeFileSync(join(cache, v, 'plugin.json'), '{}');
    for (const d of projectExists ? [project] : []) mkdirSync(d);
    writeFileSync(join(profile, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { [ID]: [
        { scope: 'user', installPath: join(cache, userVersion), version: userVersion },
        { scope: 'project', projectPath: project, installPath: join(cache, OLD), version: OLD },
    ] } }));
    writeFileSync(join(bin, 'claude'), STUB);
    chmodSync(join(bin, 'claude'), 0o755);
    return { home, profile, cache, project, other, bin, log: join(home, 'stub.log'), updateLog: join(home, 'update.log') };
}

function run(sb, script, args, extraEnv = {}) {
    const r = spawnSync('/bin/bash', [join(SCRIPTS, script), ...args], {
        cwd: sb.other, encoding: 'utf8', timeout: 60000,
        env: { PATH: `${sb.bin}:${process.env.PATH}`, HOME: sb.home, CLAUDE_CONFIG_DIR: sb.profile,
            STUB_LOG: sb.log, STUB_VERSION: VER, BREWCODE_UPDATE_LOG: sb.updateLog, ...extraEnv },
    });
    const calls = existsSync(sb.log) ? readFileSync(sb.log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    const lines = r.stdout.split('\n');
    return { rc: r.status, calls, lines, cache: readdirSync(sb.cache).sort() };
}

const call = (cwd, ...args) => ({ cwd, args });

// GIVEN a user row on the target version and a project row pinning 0.0.1 at projectPath P
// WHEN update-plugin.sh brewcode runs from another dir THEN the project update runs from P with --scope project and 0.0.1 is pruned.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['brewcode']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, cache: r.cache, project: r.lines.filter(l => l.includes('(project ')) }, {
        rc: 0,
        calls: [
            call(sb.other, 'plugin', 'marketplace', 'update', 'claude-brewcode'),
            call(sb.other, 'plugin', 'update', ID),
            call(sb.other, 'plugin', 'list', '--json'),
            call(sb.project, 'plugin', 'update', ID, '--scope', 'project'),
        ],
        cache: [VER],
        project: [`   ${ID} (project ${sb.project}): updating...`],
    }, 'THEN the project row updates from its projectPath, before the prune, and the old version is deleted');
}

// GIVEN the same profile WHEN update-plugin.sh --dry-run runs THEN only the read-only list is called and the planned project command is printed.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['brewcode', '--dry-run']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, cache: r.cache, planned: r.lines.filter(l => l.includes('--scope project')) }, {
        rc: 0,
        calls: [call(sb.other, 'plugin', 'list', '--json')],
        cache: [OLD, VER],
        planned: [
            `  (cd ${sb.project} && claude plugin update ${ID} --scope project)`,
            `Keep (installed, project ${sb.project}): ${OLD} -> cd ${sb.project} && CLAUDE_CONFIG_DIR=${sb.profile} claude plugin update ${ID} --scope project`,
        ],
    }, 'THEN dry-run changes nothing and names the project command and the pin');
}

// GIVEN a project row whose projectPath is gone WHEN update-plugin.sh runs THEN no update is attempted for it and an orphan warning names the uninstall command.
{
    const sb = sandbox({ projectExists: false });
    const r = run(sb, 'update-plugin.sh', ['brewcode']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, cache: r.cache, orphan: r.lines.filter(l => l.includes('orphan')) }, {
        rc: 0,
        calls: [
            call(sb.other, 'plugin', 'marketplace', 'update', 'claude-brewcode'),
            call(sb.other, 'plugin', 'update', ID),
            call(sb.other, 'plugin', 'list', '--json'),
        ],
        cache: [OLD, VER],
        orphan: [
            `   WARN: orphan project install: ${ID} at ${sb.project} (dir gone); remove: mkdir -p ${sb.project} && cd ${sb.project} && claude plugin uninstall ${ID} --scope project`,
            `Keep (installed, project ${sb.project}): ${OLD} -> orphan (project dir missing) -> mkdir -p ${sb.project} && cd ${sb.project} && CLAUDE_CONFIG_DIR=${sb.profile} claude plugin uninstall ${ID} --scope project`,
        ],
    }, 'THEN the orphan is reported, kept, and the run stays green');
}

// GIVEN the project-scope update fails WHEN update-plugin.sh runs THEN rc 1, 0.0.1 stays, and the pin line names scope, projectPath and the command.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['brewcode'], { STUB_FAIL_SCOPES: 'project' });
    assert.deepEqual({ rc: r.rc, calls: r.calls.length, cache: r.cache, keep: r.lines.filter(l => l.startsWith('Keep (')) }, {
        rc: 1,
        calls: 4,
        cache: [OLD, VER],
        keep: [
            `Keep (installed, project ${sb.project}): ${OLD} -> cd ${sb.project} && CLAUDE_CONFIG_DIR=${sb.profile} claude plugin update ${ID} --scope project`,
            `Keep (installed): ${VER}`,
        ],
    }, 'THEN the failure is not reported green and the pin carries its exact fix');
}

// GIVEN the ~/.claude profile with stale user and project pins WHEN clean-plugin-cache.sh --dry-run runs THEN each pin line unsets CLAUDE_CONFIG_DIR.
{
    const sb = sandbox({ profileName: '.claude' });
    const r = run(sb, 'clean-plugin-cache.sh', ['--dry-run']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, keep: r.lines.filter(l => l.startsWith('Keep (')) }, {
        rc: 0,
        calls: [],
        keep: [
            `Keep (installed, user): ${OLD} -> env -u CLAUDE_CONFIG_DIR claude plugin update ${ID} --scope user`,
            `Keep (installed, project ${sb.project}): ${OLD} -> cd ${sb.project} && env -u CLAUDE_CONFIG_DIR claude plugin update ${ID} --scope project`,
            `Keep (latest): ${VER}`,
        ],
    }, 'THEN both pins are named with their scope, projectPath and exact command');
}
console.log('suite-project-scope: PASS');
