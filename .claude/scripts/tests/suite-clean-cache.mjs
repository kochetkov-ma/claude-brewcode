#!/usr/bin/env node
// clean-plugin-cache.sh orphan grace: mark first, keep in grace or while a live session pins it, delete only after.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'clean-plugin-cache.sh');
const ID = 'brewcode@claude-brewcode';
const DAY = 86400000;
const HALF_HOUR = 1800000;
// Markers 30 min past a whole day: second-truncated "now" in the script cannot shift the printed hours.
const ago = days => String(Date.now() - days * DAY - HALF_HOUR);
const DECISION = /^(Keep|Delete|Would delete|Would unmark|Unmark|Skip) \(/;

const HOMES = [];
process.on('exit', () => HOMES.forEach(h => rmSync(h, { recursive: true, force: true })));

// versions: { <v>: { marker?: string, markerMtime?: ms, pins?: { <entry>: <body> } } }; mtime DEF = a 13-digit marker's own value.
function sandbox(versions, installed = []) {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'g3-clean-')));
    HOMES.push(home);
    const profile = join(home, '.claude-t');
    const cache = join(profile, 'plugins/cache/claude-brewcode/brewcode');
    for (const [v, o] of Object.entries(versions)) {
        mkdirSync(join(cache, v, '.in_use'), { recursive: true });
        writeFileSync(join(cache, v, 'plugin.json'), '{}');
        for (const m of o.marker === undefined ? [] : [o.marker]) {
            const t = (o.markerMtime ?? (/^\d{13}$/.test(m) ? Number(m) : Date.now() - HALF_HOUR)) / 1000;
            writeFileSync(join(cache, v, '.orphaned_at'), m);
            utimesSync(join(cache, v, '.orphaned_at'), t, t);
        }
        for (const [name, body] of Object.entries(o.pins ?? {})) writeFileSync(join(cache, v, '.in_use', name), body);
    }
    writeFileSync(join(profile, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: {
        [ID]: installed.map(v => ({ scope: 'user', installPath: join(cache, v), version: v })) } }));
    return { home, profile, cache };
}

function run(sb, args = [], extraEnv = {}) {
    const t0 = Math.floor(Date.now() / 1000) * 1000;
    const r = spawnSync('/bin/bash', [SCRIPT, ...args], {
        cwd: sb.home, encoding: 'utf8', timeout: 60000,
        env: { PATH: process.env.PATH, HOME: sb.home, CLAUDE_CONFIG_DIR: sb.profile, ...extraEnv },
    });
    const t1 = Date.now();
    const lines = r.stdout.split('\n');
    // A marker this run wrote (13 digits inside [t0, t1]) reads as NOW; fixture markers keep their bytes.
    const marker = v => readFileSync(join(sb.cache, v, '.orphaned_at'), 'utf8');
    const fresh = s => /^\d{13}$/.test(s) && Number(s) >= t0 && Number(s) <= t1;
    const markers = Object.fromEntries(readdirSync(sb.cache).sort().map(v => [v,
        existsSync(join(sb.cache, v, '.orphaned_at')) ? (fresh(marker(v)) ? 'NOW' : marker(v)) : null]));
    return { rc: r.status, stderr: r.stderr, markers, decisions: lines.filter(l => DECISION.test(l)),
        grace: lines.filter(l => l.startsWith('| brewcode ')) };
}

// Every path under dir with type, bytes and mtime: equal snapshots = nothing written, moved or deleted.
function snapshot(dir) {
    return readdirSync(dir, { recursive: true }).sort().map(p => {
        const st = lstatSync(join(dir, p));
        return [p, st.isDirectory() ? 'dir' : readFileSync(join(dir, p), 'utf8'), st.isDirectory() ? 0 : st.mtimeMs];
    });
}

const pinLine = (sb, v) => `Keep (installed, user): ${v} -> CLAUDE_CONFIG_DIR=${sb.profile} claude plugin update ${ID} --scope user`;

// GIVEN 1.0.0 neither installed nor latest and unmarked WHEN clean runs THEN it is marked now, kept, and listed once, in the summary.
{
    const sb = sandbox({ '1.0.0': {}, '2.0.0': {} }, ['2.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        markers: { '1.0.0': 'NOW', '2.0.0': null },
        decisions: ['Keep (installed): 2.0.0'],
        grace: ['| brewcode | 1.0.0 | new orphan, marked now | in 14d 0h |'],
    }, 'THEN a fresh orphan gets .orphaned_at = now and survives this run');
}

// GIVEN an orphan marked 3d 0h ago WHEN clean runs THEN it is kept, its marker bytes unchanged, and the summary shows the time left.
{
    const marker = ago(3);
    const sb = sandbox({ '1.0.0': { marker }, '2.0.0': {} }, ['2.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        markers: { '1.0.0': marker, '2.0.0': null },
        decisions: ['Keep (installed): 2.0.0'],
        grace: ['| brewcode | 1.0.0 | orphaned 3d 0h ago | in 10d 23h |'],
    }, 'THEN a marker younger than the 14-day grace keeps the version');
}

// GIVEN an orphan whose marker content and mtime are both 15d 0h old, no live pin WHEN clean runs THEN it is deleted.
{
    const sb = sandbox({ '1.0.0': { marker: ago(15) }, '2.0.0': {} }, ['2.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        markers: { '2.0.0': null },
        decisions: ['Delete (orphaned 15d 0h ago > 14d grace): 1.0.0', 'Keep (installed): 2.0.0'],
        grace: [],
    }, 'THEN a marker older than the grace lets the version go');
}

// GIVEN orphans whose marker content and mtime disagree: content 0 / mtime 30 min, content 15d / mtime 30 min, content 30 min / mtime 15d
// WHEN clean runs THEN all three are kept with their marker bytes as is: the younger of content and mtime is the age (CC keys on the mtime).
{
    const [old, young] = [ago(15), ago(0)];
    const sb = sandbox({
        '1.0.0': { marker: '0000000000000', markerMtime: Number(young) },
        '1.1.0': { marker: old, markerMtime: Number(young) },
        '1.2.0': { marker: young, markerMtime: Number(old) },
        '2.0.0': {},
    }, ['2.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        markers: { '1.0.0': '0000000000000', '1.1.0': old, '1.2.0': young, '2.0.0': null },
        decisions: ['Keep (installed): 2.0.0'],
        grace: ['1.0.0', '1.1.0', '1.2.0'].map(v => `| brewcode | ${v} | orphaned 0d 0h ago | in 13d 23h |`),
    }, 'THEN a well-formed but old content (even 0) is not re-marked; a fresh mtime alone keeps the version');
}

// GIVEN orphans whose markers hold junk, a non-ms number and a future time WHEN clean runs THEN all are re-marked now and kept.
{
    const sb = sandbox({ '1.0.0': { marker: 'junk' }, '1.1.0': { marker: '1' }, '1.2.0': { marker: String(Date.now() + 2 * DAY) }, '2.0.0': {} }, ['2.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, grace: r.grace }, {
        rc: 0,
        markers: { '1.0.0': 'NOW', '1.1.0': 'NOW', '1.2.0': 'NOW', '2.0.0': null },
        grace: ['1.0.0', '1.1.0', '1.2.0'].map(v => `| brewcode | ${v} | bad .orphaned_at, re-marked now | in 14d 0h |`),
    }, 'THEN a marker that cannot give an age restarts the grace');
}

// GIVEN an installed non-latest version carrying a stale 20-day marker and an uninstalled latest WHEN clean runs
// THEN both are kept, neither is marked, and the stale marker is removed.
{
    const sb = sandbox({ '1.0.0': { marker: ago(20) }, '2.0.0': {} }, ['1.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        markers: { '1.0.0': null, '2.0.0': null },
        decisions: [pinLine(sb, '1.0.0'), 'Unmark (installed, stale .orphaned_at removed): 1.0.0', 'Keep (latest): 2.0.0'],
        grace: [],
    }, 'THEN installed and latest are never marked, and an installed version sheds an old marker');
}

// GIVEN a fresh, a 3-day, a 15-day orphan, an installed version with a stale marker and an uninstalled latest WHEN --dry-run runs
// THEN the tree is byte-, mtime- and file-identical, and each decision is printed with its age.
{
    const sb = sandbox({ '1.0.0': {}, '1.1.0': { marker: ago(3) }, '1.2.0': { marker: ago(15) },
        '2.0.0': { marker: ago(20) }, '3.0.0': {} }, ['2.0.0']);
    const before = snapshot(sb.home);
    const r = run(sb, ['--dry-run']);
    assert.deepEqual({ rc: r.rc, unchanged: snapshot(sb.home), decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        unchanged: before,
        decisions: [
            'Would delete (orphaned 15d 0h ago > 14d grace): 1.2.0',
            pinLine(sb, '2.0.0'),
            'Would unmark (installed, stale .orphaned_at): 2.0.0',
            'Keep (latest): 3.0.0',
        ],
        grace: ['| brewcode | 1.0.0 | new orphan, would mark now | in 14d 0h |', '| brewcode | 1.1.0 | orphaned 3d 0h ago | in 10d 23h |'],
    }, 'THEN dry-run writes nothing and shows every decision');
}

// GIVEN 15-day orphans pinned by a live pid, a dead pid, a non-pid entry and a hidden entry WHEN clean runs
// THEN only the dead-pid version is deleted.
{
    const dead = spawnSync('/usr/bin/true').pid;
    assert.equal(spawnSync('ps', ['-p', String(dead)]).status, 1, `GIVEN pid ${dead} is not running`);
    const live = process.pid;
    const sb = sandbox({
        '1.0.0': { marker: ago(15), pins: { [live]: JSON.stringify({ pid: live, procStart: 'x' }) } },
        '1.1.0': { marker: ago(15), pins: { [dead]: JSON.stringify({ pid: dead, procStart: 'x' }) } },
        '1.2.0': { marker: ago(15), pins: { 'x.tmp.1': '' } },
        '1.3.0': { marker: ago(15), pins: { '.4242.tmp': '' } },
        '2.0.0': {},
    }, ['2.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, versions: Object.keys(r.markers), decisions: r.decisions, grace: r.grace }, {
        rc: 0,
        versions: ['1.0.0', '1.2.0', '1.3.0', '2.0.0'],
        decisions: ['Delete (orphaned 15d 0h ago > 14d grace): 1.1.0', 'Keep (installed): 2.0.0'],
        grace: [
            `| brewcode | 1.0.0 | in use: pid ${live}; orphaned 15d 0h ago | once no live session pins it |`,
            '| brewcode | 1.2.0 | in use: entry x.tmp.1 (no pid); orphaned 15d 0h ago | once no live session pins it |',
            '| brewcode | 1.3.0 | in use: entry .4242.tmp (no pid); orphaned 15d 0h ago | once no live session pins it |',
        ],
    }, 'THEN a live or unprovable pin, dot-named ones included, outlasts the grace; a dead one does not');
}

// GIVEN a 15-day orphan pinned by a pid and a `ps` that fails with rc 2 WHEN clean runs THEN it is kept.
{
    const sb = sandbox({ '1.0.0': { marker: ago(15), pins: { 4242: JSON.stringify({ pid: 4242 }) } }, '2.0.0': {} }, ['2.0.0']);
    const bin = join(sb.home, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'ps'), '#!/bin/sh\nexit 2\n');
    chmodSync(join(bin, 'ps'), 0o755);
    const r = run(sb, [], { PATH: `${bin}:${process.env.PATH}` });
    assert.deepEqual({ rc: r.rc, versions: Object.keys(r.markers), grace: r.grace }, {
        rc: 0,
        versions: ['1.0.0', '2.0.0'],
        grace: ['| brewcode | 1.0.0 | in use: pid 4242 (ps rc 2); orphaned 15d 0h ago | once no live session pins it |'],
    }, 'THEN a liveness check that cannot run never counts as a dead session');
}

// GIVEN a new orphan whose dir is read-only WHEN clean runs THEN it is kept with no deletion deadline claimed.
{
    const sb = sandbox({ '1.0.0': {}, '2.0.0': {} }, ['2.0.0']);
    chmodSync(join(sb.cache, '1.0.0'), 0o555);
    const r = run(sb);
    chmodSync(join(sb.cache, '1.0.0'), 0o755);
    assert.deepEqual({ rc: r.rc, markers: r.markers, grace: r.grace }, {
        rc: 0,
        markers: { '1.0.0': null, '2.0.0': null },
        grace: ['| brewcode | 1.0.0 | new orphan, marker not writable | once a marker can be written |'],
    }, 'THEN an unwritable marker keeps the version with an honest deadline');
}

// GIVEN installed 1.0.0 carrying a 15-day marker and an installed_plugins.json that is not one JSON object with a plugins map,
// in this profile or another ~/.claude* one WHEN clean runs THEN rc 2 names the file and nothing is marked, unmarked or deleted.
const NOT_ONE_OBJECT = { truncated: '{"version":2,"plugins":{"brewcode@claude-', empty: '', whitespace: ' \n\t\n', array: '[]',
    null: 'null', twoObjects: '{"version":2,"plugins":{}}{"version":2,"plugins":{}}', pluginsArray: '{"version":2,"plugins":[]}' };
for (const [kind, body] of Object.entries(NOT_ONE_OBJECT)) {
    for (const rel of ['.claude-t/plugins/installed_plugins.json', '.claude-x/plugins/installed_plugins.json']) {
        const sb = sandbox({ '1.0.0': { marker: ago(15) }, '2.0.0': {} }, ['1.0.0']);
        const bad = join(sb.home, rel);
        mkdirSync(dirname(bad), { recursive: true });
        writeFileSync(bad, body);
        const before = snapshot(sb.home);
        const r = run(sb);
        assert.deepEqual({ rc: r.rc, stderr: r.stderr, unchanged: snapshot(sb.home) }, {
            rc: 2,
            stderr: `Cannot read ${bad} as one JSON object with a plugins map: fix or remove it; nothing was marked or deleted\n`,
            unchanged: before,
        }, `THEN an unusable install list stops the run before any change (${kind}, ${rel})`);
    }
}

// GIVEN installed 1.0.0, uninstalled 1.5.0 and CC's temp dir 2.0.0.linking-424242 WHEN clean runs
// THEN the temp dir is skipped, never latest or marked, and 1.5.0 is kept as latest.
{
    const sb = sandbox({ '1.0.0': {}, '1.5.0': {}, '2.0.0.linking-424242': {} }, ['1.0.0']);
    const r = run(sb);
    assert.deepEqual({ rc: r.rc, markers: r.markers, decisions: r.decisions }, {
        rc: 0,
        markers: { '1.0.0': null, '1.5.0': null, '2.0.0.linking-424242': null },
        decisions: ['Skip (not a version name): 2.0.0.linking-424242', pinLine(sb, '1.0.0'), 'Keep (latest): 1.5.0'],
    }, 'THEN only plain version names take part in keep-latest');
}

// GIVEN the same tree plus a symlinked version and a stray file WHEN --all runs
// THEN 1.5.0 is marked and kept (grace still applies); the temp dir, the symlink target and the file are untouched.
{
    const sb = sandbox({ '1.0.0': {}, '1.5.0': {}, '2.0.0.linking-424242': {} }, ['1.0.0']);
    const outside = join(sb.home, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(sb.cache, '9.9.9'));
    writeFileSync(join(sb.cache, 'README'), 'x');
    const r = run(sb, ['--all']);
    assert.deepEqual({ rc: r.rc, markers: r.markers, grace: r.grace, outside: readdirSync(outside),
        link: lstatSync(join(sb.cache, '9.9.9')).isSymbolicLink() }, {
        rc: 0,
        markers: { '1.0.0': null, '1.5.0': 'NOW', '2.0.0.linking-424242': null, '9.9.9': null, README: null },
        grace: ['| brewcode | 1.5.0 | new orphan, marked now | in 14d 0h |'],
        outside: [],
        link: true,
    }, 'THEN --all drops keep-latest only, and non-version entries are never marked or deleted');
}

// GIVEN a 3-day orphan WHEN BREWCODE_CACHE_GRACE_DAYS=2 THEN it is deleted.
{
    const sb = sandbox({ '1.0.0': { marker: ago(3) }, '2.0.0': {} }, ['2.0.0']);
    const r = run(sb, [], { BREWCODE_CACHE_GRACE_DAYS: '2' });
    assert.deepEqual({ rc: r.rc, versions: Object.keys(r.markers), decisions: r.decisions }, {
        rc: 0,
        versions: ['2.0.0'],
        decisions: ['Delete (orphaned 3d 0h ago > 2d grace): 1.0.0', 'Keep (installed): 2.0.0'],
    }, 'THEN the env override shortens the grace');
}

// GIVEN a 15-day orphan WHEN BREWCODE_CACHE_GRACE_DAYS is not whole days THEN rc 2 before any change.
{
    const sb = sandbox({ '1.0.0': { marker: ago(15) }, '2.0.0': {} }, ['2.0.0']);
    const before = snapshot(sb.home);
    const r = run(sb, [], { BREWCODE_CACHE_GRACE_DAYS: '14d' });
    assert.deepEqual({ rc: r.rc, stderr: r.stderr, unchanged: snapshot(sb.home) }, {
        rc: 2,
        stderr: 'BREWCODE_CACHE_GRACE_DAYS must be whole days 0-9999, got: 14d\n',
        unchanged: before,
    }, 'THEN a bad grace value is refused and nothing is touched');
}

console.log('suite-clean-cache: PASS');
