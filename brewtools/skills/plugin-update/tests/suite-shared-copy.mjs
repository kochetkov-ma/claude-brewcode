#!/usr/bin/env node
// update-flow.md/.mjs are byte copies of the setup-status canonical pair; the copy runs standalone from this skill.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANON = join(ROOT, '..', '..', '..', 'brewcode', 'skills', 'setup-status');
const PAIR = ['references/update-flow.md', 'scripts/update-flow.mjs'];
const base = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-update-shared-')));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
const dir = join(base, 'run');
mkdirSync(dir);
mkdirSync(join(base, 'profile'));
const ID = name => `${name}@claude-brewcode`;
const NAMES = ['brewmod-placeholders', 'brewmod-plan-effort', 'brewcode', 'brewdoc', 'brewtools', 'brewui'];
writeFileSync(join(dir, 'before.json'), JSON.stringify([
    { id: ID('brewtools'), version: '6.7.1', scope: 'user', enabled: true },
    { id: ID('brewmod-placeholders'), version: '6.9.6', scope: 'user', enabled: true },
]));
writeFileSync(join(dir, 'latest.json'), JSON.stringify(Object.fromEntries(NAMES.map(n => [n, '6.9.6']))));
writeFileSync(join(dir, 'cc.txt'), '2.1.301 (Claude Code)\n');

// GIVEN the canonical pair in brewcode setup-status WHEN compared byte by byte THEN both plugin-update copies are equal.
assert.deepEqual(PAIR.map(f => ({ file: f, equal: readFileSync(join(ROOT, f)).equals(readFileSync(join(CANON, f))) })),
    PAIR.map(f => ({ file: f, equal: true })),
    'THEN edit brewcode/skills/setup-status first, then cp both files into brewtools/skills/plugin-update');

// GIVEN a saved run dir and no marketplace WHEN the copy's `plan` runs THEN it exits 0 with the update set, the offers and missing notes.
const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'update-flow.mjs'), 'plan', dir, '--mode', 'update'], {
    cwd: base, encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, HOME: base, CLAUDE_CONFIG_DIR: join(base, 'profile') },
});
assert.deepEqual({ rc: r.status, stderr: r.stderr, plan: JSON.parse(r.stdout) }, {
    rc: 0, stderr: '',
    plan: {
        mode: 'update', range: { from: '6.7.1', to: '6.9.6' },
        update: [{ id: ID('brewtools'), scope: 'user', projectPath: null, before: '6.7.1', latest: '6.9.6', orphan: false }],
        scopes: [{ scope: 'user', projectPath: null }],
        offers: {
            ccOk: true, cc: '2.1.301', ccMin: '2.1.301',
            mods: [{ name: 'brewmod-plan-effort', value: 'effort `xhigh` in plan mode', migration: null }],
            plugins: [
                { name: 'brewcode', value: 'skill, agent and rule authoring, code search, conventions, review and team setups' },
                { name: 'brewdoc', value: 'doc-staleness tracking, installation guides, Markdown to PDF, publishing' },
                { name: 'brewui', value: 'placeholder for future UI tools, no skills yet' },
            ],
        },
        notes: { source: null, requirement: null, migration: [], versions: [], hidden: 0, missing: true,
            link: 'https://github.com/kochetkov-ma/claude-brewcode/blob/main/RELEASE-NOTES.md' },
        autoUpdate: null,
    },
}, 'THEN the copy parses its own references/update-flow.md §3 and plans from this skill dir');
console.log('suite-shared-copy: PASS');
