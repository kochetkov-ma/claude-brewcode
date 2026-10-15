#!/usr/bin/env node
// update-plugin.sh + clean-plugin-cache.sh: project/local installs update from their projectPath before the prune.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SCRIPTS, '..', '..');
const VER = JSON.parse(readFileSync(join(REPO, 'brewcode/.claude-plugin/plugin.json'), 'utf8')).version;
const OLD = '0.0.1';
const ID = 'brewcode@claude-brewcode';
const OTHERS = ['brewdoc', 'brewtools', 'brewui', 'brewmod-plan-effort', 'brewmod-placeholders'];

// Stub `claude`: logs {cwd,args}; `update` moves rows of that scope to $STUB_VERSION; $STUB_LIST_FAIL fails `list`, $STUB_FAIL_RC sets the failure rc.
const STUB = `#!/usr/bin/env node
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), cwd = fs.realpathSync(process.cwd());
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd, args }) + '\\n');
const file = path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins', 'installed_plugins.json');
const db = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[1] === 'list' && process.env.STUB_LIST_FAIL) { console.error('stub list failure'); process.exit(1); }
if (args[1] === 'list') {
  const rows = Object.entries(db.plugins).flatMap(([id, rs]) => rs.map(r => ({ id, scope: r.scope, version: r.version,
    projectPath: r.projectPath ?? null, installPath: r.installPath, enabled: true })));
  process.stdout.write(JSON.stringify(rows));
  process.exit(0);
}
if (args[1] !== 'update') process.exit(0);
const id = args[2], si = args.indexOf('--scope'), scope = si > 0 ? args[si + 1] : 'user';
if ((process.env.STUB_FAIL_SCOPES || '').split(',').includes(scope)) { console.error('stub failure ' + scope); process.exit(Number(process.env.STUB_FAIL_RC || 1)); }
const hits = (db.plugins[id] || []).filter(r => r.scope === scope && (scope === 'user' || r.projectPath === cwd));
if (hits.length === 0) { console.error('not installed at scope ' + scope + ' in ' + cwd); process.exit(1); }
const name = id.split('@')[0], dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'plugins/cache/claude-brewcode', name, process.env.STUB_VERSION);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'plugin.json'), '{}');
for (const r of hits) { r.version = process.env.STUB_VERSION; r.installPath = dir; }
fs.writeFileSync(file, JSON.stringify(db));
console.log('updated ' + id + ' for scope ' + scope);
`;

// Sandboxes (g3-scope-, g3-repo-) removed on exit.
const DIRS = [];
process.on('exit', () => DIRS.forEach(d => rmSync(d, { recursive: true, force: true })));

function sandbox({ profileName = '.claude-t', projectExists = true, userVersion = OLD } = {}) {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'g3-scope-')));
    DIRS.push(home);
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
            call(sb.other, 'plugin', 'list', '--json'),
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
        calls: [call(sb.other, 'plugin', 'list', '--json'), call(sb.other, 'plugin', 'list', '--json')],
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
            call(sb.other, 'plugin', 'list', '--json'),
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
        calls: 5,
        cache: [OLD, VER],
        keep: [
            `Keep (installed, project ${sb.project}): ${OLD} -> cd ${sb.project} && CLAUDE_CONFIG_DIR=${sb.profile} claude plugin update ${ID} --scope project`,
            `Keep (installed): ${VER}`,
        ],
    }, 'THEN the failure is not reported green and the pin carries its exact fix');
}

// GIVEN the project-scope update exits 3 WHEN update-plugin.sh runs THEN the FAILED line carries the real exit code 3 (not the arithmetic's 0).
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['brewcode'], { STUB_FAIL_SCOPES: 'project', STUB_FAIL_RC: '3' });
    assert.deepEqual({ rc: r.rc, failed: r.lines.filter(l => l.includes('FAILED')) },
        { rc: 1, failed: ['   FAILED (exit 3): stub failure project'] },
        'THEN the logged exit matches the failing command');
}

// GIVEN plugin list fails WHEN update-plugin.sh brewcode runs (dry and real) THEN the WARN goes to stderr: no bogus orphan row, real run prints "none".
for (const dry of [true, false]) {
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', dry ? ['brewcode', '--dry-run'] : ['brewcode'], { STUB_LIST_FAIL: '1' });
    assert.deepEqual({ rc: r.rc, orphan: r.lines.filter(l => l.includes('orphan')), warn: r.lines.filter(l => l.includes('WARN')), none: r.lines.filter(l => l === '   none') },
        { rc: 0, orphan: [], warn: [], none: dry ? [] : ['   none'] },
        `THEN the list-failure WARN is not parsed as a project row (dry=${dry})`);
    const logged = readFileSync(sb.updateLog, 'utf8').split('\n').filter(l => l.includes('WARN'));
    assert.deepEqual(logged, ['   WARN: claude plugin list --json failed; project-scope installs not checked: stub list failure'],
        `THEN the WARN still reaches the log file (dry=${dry})`);
}

// GIVEN plugin list and every update fail WHEN update-plugin.sh all runs THEN rc 1 before any update/uninstall/install: brewui and brewmod-* are never installed.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['all'], { STUB_LIST_FAIL: '1', STUB_FAIL_SCOPES: 'user' });
    assert.deepEqual({ rc: r.rc, calls: r.calls, errors: r.lines.filter(l => l.startsWith('ERROR')), cache: r.cache }, {
        rc: 1,
        calls: [call(sb.other, 'plugin', 'marketplace', 'update', 'claude-brewcode'), call(sb.other, 'plugin', 'list', '--json')],
        errors: ['ERROR: all: installed state unknown (plugin list failed); no plugin changed - rerun with plugin names, e.g. update-plugin.sh brewcode'],
        cache: [OLD, VER],
    }, 'THEN unknown installed state aborts all and installs nothing');
}

// GIVEN plugin list fails WHEN update-plugin.sh all --dry-run runs THEN rc 0, only the list is called, and the plan says a real run aborts.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['all', '--dry-run'], { STUB_LIST_FAIL: '1' });
    assert.deepEqual({ rc: r.rc, calls: r.calls, plan: r.lines.filter(l => l.startsWith('  all:')) }, {
        rc: 0,
        calls: [call(sb.other, 'plugin', 'list', '--json')],
        plan: ['  all: installed state unknown -> a real run aborts before touching any plugin (name the plugins instead)'],
    }, 'THEN dry-run reports the abort and changes nothing');
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
// GIVEN only brewcode installed at user scope WHEN update-plugin.sh all runs THEN the other five are skipped with one note each and project rows still update.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['all']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, cache: r.cache, notes: r.lines.filter(l => l.includes('not installed')) }, {
        rc: 0,
        calls: [
            call(sb.other, 'plugin', 'marketplace', 'update', 'claude-brewcode'),
            call(sb.other, 'plugin', 'list', '--json'),
            call(sb.other, 'plugin', 'update', ID),
            call(sb.other, 'plugin', 'list', '--json'),
            call(sb.project, 'plugin', 'update', ID, '--scope', 'project'),
        ],
        cache: [VER],
        notes: [
            ...OTHERS.map((n, i) => `${i + 3}. ${n}: not installed in this profile -> skipped`),
            ...OTHERS.map(n => `| ${n} | ${VER} | skipped (not installed) |`),
        ],
    }, 'THEN absent plugins are skipped, never errors, and the later steps run');
}

// GIVEN the same profile WHEN update-plugin.sh all --dry-run runs THEN the absent plugins are planned as skipped.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['all', '--dry-run']);
    assert.deepEqual({ rc: r.rc, calls: r.calls, notes: r.lines.filter(l => l.includes('not installed')) }, {
        rc: 0,
        calls: [call(sb.other, 'plugin', 'list', '--json'), call(sb.other, 'plugin', 'list', '--json')],
        notes: [
            ...OTHERS.map(n => `  ${n}: not installed in this profile -> skipped`),
        ],
    }, 'THEN dry-run names the skips and changes nothing');
}

// GIVEN an installed plugin whose user-scope update fails WHEN update-plugin.sh all runs THEN rc 1 and no later step runs.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['all'], { STUB_FAIL_SCOPES: 'user' });
    assert.deepEqual({ rc: r.rc, calls: r.calls, errors: r.lines.filter(l => l.startsWith('ERROR')) }, {
        rc: 1,
        calls: [
            call(sb.other, 'plugin', 'marketplace', 'update', 'claude-brewcode'),
            call(sb.other, 'plugin', 'list', '--json'),
            call(sb.other, 'plugin', 'update', ID),
        ],
        errors: ['ERROR: brewcode update failed (exit 1): stub failure user'],
    }, 'THEN a real update failure still fails the run');
}

// Scratch repo: update-plugin.sh + clean-plugin-cache.sh copies, plugin.json per name, marketplace.json from `plugins`.
function scratchRepo(plugins, names = ['brewcode', ...OTHERS]) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'g3-repo-')));
    DIRS.push(root);
    mkdirSync(join(root, '.claude/scripts'), { recursive: true });
    mkdirSync(join(root, '.claude-plugin'));
    for (const f of ['update-plugin.sh', 'clean-plugin-cache.sh']) writeFileSync(join(root, '.claude/scripts', f), readFileSync(join(SCRIPTS, f)));
    for (const n of names) {
        mkdirSync(join(root, n, '.claude-plugin'), { recursive: true });
        writeFileSync(join(root, n, '.claude-plugin/plugin.json'), JSON.stringify({ name: n, version: VER }));
    }
    writeFileSync(join(root, '.claude-plugin/marketplace.json'), JSON.stringify({ plugins: plugins.map(name => ({ name, version: VER })) }));
    return root;
}
function runIn(root, sb, args) {
    const r = spawnSync('/bin/bash', [join(root, '.claude/scripts/update-plugin.sh'), ...args], {
        cwd: sb.other, encoding: 'utf8', timeout: 60000,
        env: { PATH: `${sb.bin}:${process.env.PATH}`, HOME: sb.home, CLAUDE_CONFIG_DIR: sb.profile, STUB_LOG: sb.log, STUB_VERSION: VER, BREWCODE_UPDATE_LOG: sb.updateLog },
    });
    return { rc: r.status, lines: r.stdout.split('\n') };
}

// GIVEN a marketplace.json listing the plugins in reverse order WHEN update-plugin.sh all --dry-run runs THEN versions are read by name and all six rows match.
{
    const sb = sandbox();
    const root = scratchRepo(['brewmod-placeholders', 'brewmod-plan-effort', 'brewui', 'brewtools', 'brewdoc', 'brewcode']);
    const r = runIn(root, sb, ['all', '--dry-run']);
    assert.deepEqual({ rc: r.rc, table: r.lines.filter(l => l.startsWith('| brew')) },
        { rc: 0, table: ['brewcode', ...OTHERS].map(n => `| ${n} | ${VER} | ${VER} | OK |`) },
        'THEN a reordered marketplace.json does not shift any version read');
}

// GIVEN a marketplace.json without brewmod-placeholders WHEN update-plugin.sh runs for it or for all THEN rc 1 and the error names that entry.
for (const args of [['brewmod-placeholders'], ['all']]) {
    const sb = sandbox();
    const root = scratchRepo(['brewcode', 'brewdoc', 'brewtools', 'brewui', 'brewmod-plan-effort']);
    const r = runIn(root, sb, args);
    assert.deepEqual({ rc: r.rc, errors: r.lines.filter(l => l.startsWith('ERROR')) },
        { rc: 1, errors: [`ERROR: marketplace.json has no plugin entry named 'brewmod-placeholders' (or it has no version): ${join(root, '.claude-plugin/marketplace.json')}`] },
        `THEN a missing entry fails loudly by name (${args[0]})`);
}

// GIVEN an unknown plugin name WHEN update-plugin.sh runs THEN rc 1 and the usage lists the six names.
{
    const sb = sandbox();
    const r = run(sb, 'update-plugin.sh', ['brewmod-nope']);
    assert.deepEqual({ rc: r.rc, errors: r.lines.filter(l => l.startsWith('ERROR')) },
        { rc: 1, errors: ["ERROR: Unknown argument 'brewmod-nope'. Use: brewcode | brewdoc | brewtools | brewui | brewmod-plan-effort | brewmod-placeholders | all | --dry-run | --help"] },
        'THEN the unknown name is rejected with the full list');
}
console.log('suite-project-scope: PASS');
