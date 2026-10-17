#!/usr/bin/env node
// bump-version.sh content_version: moves only when a non-license body changed; one harness runs its own functions on git fixtures.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUMP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'bump-version.sh'), 'utf8');
const COPYRIGHT_MD = '<!-- Copyright (c) 2025-2026 Maksim Kochetkov, https://github.com/kochetkov-ma/claude-brewcode. SPDX-License-Identifier: MIT -->';
const DIRS = [];
process.on('exit', () => DIRS.forEach(d => rmSync(d, { recursive: true, force: true })));

// Brace-counting cut: the test runs the release script's own functions, not a re-typed copy.
function extractShFn(name) {
    const start = BUMP.indexOf(`${name}() {`);
    assert.notEqual(start, -1, `${name}() must exist in bump-version.sh`);
    let depth = 0;
    for (let i = BUMP.indexOf('{', start); i < BUMP.length; i++) {
        depth += BUMP[i] === '{' ? 1 : BUMP[i] === '}' ? -1 : 0;
        if (depth === 0) return BUMP.slice(start, i + 1);
    }
    throw new Error(`${name}: unbalanced braces`);
}

const ROOT = realpathSync(mkdtempSync(join(tmpdir(), 's5-bump-cv-')));
DIRS.push(ROOT);
// Fixtures never see the real HOME or global/system git config (a gpgSign or hooksPath there breaks or hangs them).
const SANDBOX_ENV = { PATH: process.env.PATH, HOME: ROOT, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const HARNESS = join(ROOT, 'harness.sh');
writeFileSync(HARNESS, `set -eu\nNEW="$CV_TEST_NEW"\n${extractShFn('strip_meta_for_diff')}\n${extractShFn('content_version_for')}\ncontent_version_for "$1" "$2"\n`);

function git(cwd, ...args) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: SANDBOX_ENV });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
}

// files: { path: [kind, bodyAtV1, bodyNow] } -> { path: content_version } per shell, NEW = 2.0.0.
function contentVersions(name, files) {
    const repo = join(ROOT, name);
    mkdirSync(repo);
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'test');
    for (const [p, [, v1]] of Object.entries(files)) writeFileSync(join(repo, p), v1);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'v1');
    git(repo, 'tag', 'v1.0.0');
    for (const [p, [, , now]] of Object.entries(files)) writeFileSync(join(repo, p), now);
    const out = {};
    for (const shell of ['sh', 'bash']) {
        out[shell] = Object.fromEntries(Object.entries(files).map(([p, [kind]]) => {
            const r = spawnSync(shell, [HARNESS, p, kind], { cwd: repo, encoding: 'utf8', env: { ...SANDBOX_ENV, CV_TEST_NEW: '2.0.0' } });
            assert.equal(r.status, 0, `${shell} content_version_for ${p} failed: ${r.stderr}`);
            return [p, r.stdout.trim()];
        }));
    }
    return out;
}

const fmd = (ver, body) => `---\nname: a\nversion: "${ver}"\ncontent_version: "1.0.0"\ngenerated_by: "brewcode"\nlast_updated: "2026-01-0${ver.slice(-1)}"\n---\n\n${body}\n`;
const FM_RULE = '---\ndoc_type: llm\nversion: "1.0.0"\ncontent_version: "1.0.0"\ngenerated_by: "t:t"\n---\n# Body\nunchanged text\n';
const meta = ver => `// brewcode-meta: version=${ver} content_version=1.0.0 generated_by=t:t`;
const skill = (ver, fmExtra, body) => `---\nname: s\nuser-invocable: true\n${fmExtra}---\n<!-- brewcode-meta: version=${ver} content_version=1.0.0 generated_by=b:s -->\n\n${body}\n`;

// GIVEN files whose body equals v1.0.0 (byte-identical, or only a stamp bump plus a license marker in each shipped shape)
// WHEN content_version_for runs under sh and bash THEN every file keeps content_version 1.0.0
{
    const keep = contentVersions('keeps', {
        'unchanged.mjs': ['mjs', `// header\n${meta('1.0.0')}\nconsole.log("x");\n`, `// header\n${meta('1.0.0')}\nconsole.log("x");\n`],
        'unchanged-fm.md': ['fm', FM_RULE, FM_RULE],
        'agent.md': ['fmd', fmd('1.0.0', 'Body line.'), fmd('1.0.1', `Body line.\n\n${COPYRIGHT_MD}`)],
        'guard.mjs': ['mjs', `#!/usr/bin/env node\n${meta('1.0.0')}\n\n// guard\ncode();\n`,
            `#!/usr/bin/env node\n${meta('1.0.1')}\n\n// SPDX-License-Identifier: MIT\n\n// guard\ncode();\n`],
        'lib.mjs': ['mjs', `${meta('1.0.0')}\ncode();\n`,
            `${meta('1.0.1')}\n// Copyright (c) 2025-2026 Maksim Kochetkov\n// SPDX-License-Identifier: MIT\ncode();\n`],
        'SKILL.md': ['marker', skill('1.0.0', 'model: opus\n', '# S'), skill('1.0.1', 'model: opus\nlicense: MIT\n', '# S')],
    });
    const same = { 'unchanged.mjs': '1.0.0', 'unchanged-fm.md': '1.0.0', 'agent.md': '1.0.0', 'guard.mjs': '1.0.0', 'lib.mjs': '1.0.0', 'SKILL.md': '1.0.0' };
    assert.deepEqual(keep, { sh: same, bash: same }, 'an unchanged or license-marker-only body must keep the old content_version');
}

// GIVEN near-miss license shapes, real body edits, an edited prose line naming brewcode-meta:, and no usable prior content_version
// WHEN content_version_for runs under sh and bash THEN every file moves to the new release 2.0.0
{
    const bump = contentVersions('bumps', {
        'code-edit.mjs': ['mjs', `// header\n${meta('1.0.0')}\nconsole.log("x");\n`, `// header\n${meta('1.0.0')}\nconsole.log("x");\nconsole.log("new behavior");\n`],
        'fm-edit.md': ['fm', FM_RULE, FM_RULE.replace('unchanged text', 'different text')],
        'no-prior-cv.mjs': ['mjs', `// header\n// brewcode-meta: version=1.0.0 generated_by=t:t\nconsole.log("x");\n`, `// header\n// brewcode-meta: version=1.0.0 generated_by=t:t\nconsole.log("x");\n`],
        'untagged-cv.mjs': ['mjs', `// header\n// brewcode-meta: version=1.0.0 content_version=5.5.5 generated_by=t:t\nconsole.log("x");\n`, `// header\n// brewcode-meta: version=1.0.0 content_version=5.5.5 generated_by=t:t\nconsole.log("x");\n`],
        'agent.md': ['fmd', fmd('1.0.0', 'Body line.'), fmd('1.0.1', `Body line, edited.\n\n${COPYRIGHT_MD}`)],
        'apache.mjs': ['mjs', `${meta('1.0.0')}\ncode();\n`, `${meta('1.0.1')}\n// SPDX-License-Identifier: Apache-2.0\ncode();\n`],
        'loose.mjs': ['mjs', `${meta('1.0.0')}\ncode();\n`, `${meta('1.0.1')}\n// license: MIT\ncode();\n`],
        'body.md': ['marker', skill('1.0.0', '', '# S'), skill('1.0.1', '', '# S\nlicense: MIT')],
        'prose.md': ['marker', skill('1.0.0', '', 'Read the `brewcode-meta:` marker.'),
            skill('1.0.1', '', 'Read the `brewcode-meta:` marker, never PLUGIN_VERSION.')],
    });
    const moved = Object.fromEntries(['code-edit.mjs', 'fm-edit.md', 'no-prior-cv.mjs', 'untagged-cv.mjs', 'agent.md', 'apache.mjs', 'loose.mjs', 'body.md', 'prose.md'].map(p => [p, '2.0.0']));
    assert.deepEqual(bump, { sh: moved, bash: moved }, 'any body change, near-miss marker, absent content_version or untagged one must move to the new release');
}

console.log('suite-bump-content-version: all assertions passed');
