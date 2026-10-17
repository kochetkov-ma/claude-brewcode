#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(STATUS_DIR, '../../..');
const source = ['SKILL.md', 'references/phase1-probes.md', 'references/phase2-stamps.md', 'references/task-tools-offer.md']
  .map(f => readFileSync(join(STATUS_DIR, f), 'utf8')).join('\n');
const pairs = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes("<<'PAIRS'"));
const asset = rel => readFileSync(join(ROOT, rel), 'utf8');

test('GIVEN byte copies differing only in stamp vs in content WHEN running the Phase 2b pairs THEN a stamp-only delta reads META and a content change DIFFERS', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-meta-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const guard = asset('brewtools/skills/agent-deadline-setup/assets/agent-deadline-guard.mjs');
  const cleanup = asset('brewtools/skills/agent-deadline-setup/assets/agent-deadline-cleanup.mjs');
  const rule = asset('brewcode/skills/semble-setup/assets/semble-first.md.template');
  const ref = asset('brewdoc/skills/memory-sync-setup/references/memory-guide.md');
  const files = {
    '.claude/hooks/agent-deadline-guard.mjs': guard.replace(/brewcode-meta: version=\S+/, 'brewcode-meta: version=0.0.1'),
    '.claude/hooks/agent-deadline-cleanup.mjs': cleanup.replace(/brewcode-meta: version=\S+/, 'brewcode-meta: version=0.0.1') + '\n// local hand edit\n',
    '.claude/rules/semble-first.md': rule.replace(/^version:.*$/m, 'version: "0.0.1"'),
    '.claude/skills/memory-sync/references/memory-guide.md': ref.replace(/brewcode-meta: version=\S+/, 'brewcode-meta: version=0.0.1'),
    '.claude/hooks/docsync-track.mjs': asset('brewdoc/skills/docsync-setup/assets/docsync-track.mjs'),
  };
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(project, rel)), { recursive: true });
    writeFileSync(join(project, rel), body);
  }
  // Repo root reaches bash via env, never spliced into the command text.
  const command = pairs.replace('BC=/abs/brewcode/root; BT=/abs/brewtools/root; BD=/abs/brewdoc/root',
    'BC="${SUBST_REPO_ROOT}/brewcode"; BT="${SUBST_REPO_ROOT}/brewtools"; BD="${SUBST_REPO_ROOT}/brewdoc"');
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    cwd: project, encoding: 'utf8', env: { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'cfg'), CLAUDE_PROJECT_DIR: project, SUBST_REPO_ROOT: ROOT }, timeout: 10000,
  });
  const verdicts = r.stdout.split('\n').filter(line => !line.startsWith('ABSENT') && line !== '');
  assert.deepEqual({ status: r.status, verdicts }, {
    status: 0,
    verdicts: [
      'META    .claude/rules/semble-first.md',
      'META    .claude/hooks/agent-deadline-guard.mjs',
      'DIFFERS .claude/hooks/agent-deadline-cleanup.mjs',
      'META    .claude/skills/memory-sync/references/memory-guide.md',
      'SAME    .claude/hooks/docsync-track.mjs',
      'OK',
    ],
  }, `release restamp alone must never read as a hand edit (r2 P1); content edits still DIFFERS (stderr: ${r.stderr})`);
});

// Pre-marker bytes: worktree minus the SPDX + Copyright pair and the blank above it (== `git show v6.9.6:<path>`; CI clones carry no tags).
const MARKERS = '\n// SPDX-License-Identifier: MIT\n// Copyright (c) 2025-2026 Maksim Kochetkov\n';
const LICENSED = {
  '.claude/hooks/agent-router.mjs': 'brewtools/skills/agent-router-setup/assets/agent-router.mjs',
  '.claude/brewtools/manager/hardmode-guard.mjs': 'brewtools/hooks/hardmode-guard.mjs',
  '.claude/brewtools/manager/manager-state.mjs': 'brewtools/hooks/lib/manager-state.mjs',
};

test('GIVEN copies installed before the license markers WHEN running the Phase 2b pairs against the marked plugin assets THEN each reads META, never DIFFERS', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-license-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  assert.deepEqual(Object.values(LICENSED).map(rel => asset(rel).split(MARKERS).length - 1), [1, 1, 1],
    'precondition: each plugin asset carries the marker pair once, one blank line above it');
  for (const [rel, src] of Object.entries(LICENSED)) {
    mkdirSync(dirname(join(project, rel)), { recursive: true });
    writeFileSync(join(project, rel), asset(src).replace(MARKERS, ''));
  }
  const command = pairs.replace('BC=/abs/brewcode/root; BT=/abs/brewtools/root; BD=/abs/brewdoc/root',
    'BC="${SUBST_REPO_ROOT}/brewcode"; BT="${SUBST_REPO_ROOT}/brewtools"; BD="${SUBST_REPO_ROOT}/brewdoc"');
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    cwd: project, encoding: 'utf8', env: { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'cfg'), CLAUDE_PROJECT_DIR: project, SUBST_REPO_ROOT: ROOT }, timeout: 10000,
  });
  assert.deepEqual({ status: r.status, verdicts: r.stdout.split('\n').filter(line => !line.startsWith('ABSENT') && line !== '') }, {
    status: 0,
    verdicts: [
      'META    .claude/hooks/agent-router.mjs',
      'META    .claude/brewtools/manager/hardmode-guard.mjs',
      'META    .claude/brewtools/manager/manager-state.mjs',
      'OK',
    ],
  }, `a license-only plugin change keeps content_version (bump-version.sh): the armed wall must not read modified (R12#1; stderr: ${r.stderr})`);
});

// bump-version.sh's own functions, cut by brace count (as .claude/scripts/tests/suite-bump-content-version.mjs does).
const BUMP = asset('.claude/scripts/bump-version.sh');
function bumpFn(name) {
  const start = BUMP.indexOf(`${name}() {`);
  let depth = 0;
  for (let i = BUMP.indexOf('{', start); start !== -1 && i < BUMP.length; i++) {
    depth += BUMP[i] === '{' ? 1 : BUMP[i] === '}' ? -1 : 0;
    if (depth === 0) return BUMP.slice(start, i + 1);
  }
  return `${name}() { echo "NO ${name} in bump-version.sh"; exit 1; }`;
}
const pairFns = pairs.slice(pairs.indexOf('meta_strip() {'), pairs.indexOf("\nwhile IFS='|'"));
const META = ver => `// brewcode-meta: version=${ver} content_version=1.0.0 generated_by=t:t`;
const SPDX = '// SPDX-License-Identifier: MIT';
const COPY = '// Copyright (c) 2025-2026 Maksim Kochetkov';
const AGENT_COPY = '<!-- Copyright (c) 2025-2026 Maksim Kochetkov, https://github.com/kochetkov-ma/claude-brewcode. SPDX-License-Identifier: MIT -->';
const fmd = (ver, body) => `---\nname: a\nversion: "${ver}"\ncontent_version: "1.0.0"\ngenerated_by: "b:a"\nlast_updated: "2026-01-0${ver.slice(-1)}"\n---\n\n${body}\n`;
const skill = (ver, extra, body) => `---\nname: s\n${extra}---\n<!-- brewcode-meta: version=${ver} content_version=1.0.0 generated_by=b:s -->\n\n${body}\n`;
// name: [bump kind, bytes at tag v1.0.0 (the installed copy), bytes now (the plugin asset)]
const LAYOUTS = {
  'hook-spdx-copyright.mjs': ['mjs', `#!/usr/bin/env node\n${META('1.0.0')}\n\n// hook\ncode();\n`, `#!/usr/bin/env node\n${META('1.0.1')}\n\n${SPDX}\n${COPY}\n\n// hook\ncode();\n`],
  'hook-spdx.mjs': ['mjs', `#!/usr/bin/env node\n${META('1.0.0')}\n\n// hook\ncode();\n`, `#!/usr/bin/env node\n${META('1.0.1')}\n\n${SPDX}\n\n// hook\ncode();\n`],
  'lib-blank-above.mjs': ['mjs', `${META('1.0.0')}\n// lib\ncode();\n`, `${META('1.0.1')}\n\n${SPDX}\n${COPY}\n// lib\ncode();\n`],
  'lib-no-blank.mjs': ['mjs', `${META('1.0.0')}\ncode();\n`, `${META('1.0.1')}\n${COPY}\n${SPDX}\ncode();\n`],
  'agent.md': ['fmd', fmd('1.0.0', 'Body line.'), fmd('1.0.1', `Body line.\n\n${AGENT_COPY}`)],
  'SKILL.md': ['marker', skill('1.0.0', 'model: opus\n', '# S'), skill('1.0.1', 'model: opus\nlicense: MIT\n', '# S')],
  'trailing-newline.mjs': ['mjs', `${META('1.0.0')}\ncode();\n`, `${META('1.0.1')}\ncode();\n\n`],
  'blank-below-only.mjs': ['mjs', `${META('1.0.0')}\ncode();\n`, `${META('1.0.1')}\n${SPDX}\n\ncode();\n`],
  'apache.mjs': ['mjs', `${META('1.0.0')}\ncode();\n`, `${META('1.0.1')}\n// SPDX-License-Identifier: Apache-2.0\ncode();\n`],
  'loose.mjs': ['mjs', `${META('1.0.0')}\ncode();\n`, `${META('1.0.1')}\n// license: MIT\ncode();\n`],
  'body-license.md': ['marker', skill('1.0.0', '', '# S'), skill('1.0.1', '', '# S\nlicense: MIT')],
  'edit-beside-marker.mjs': ['mjs', `#!/usr/bin/env node\n${META('1.0.0')}\n\ncode();\n`, `#!/usr/bin/env node\n${META('1.0.1')}\n\n${SPDX}\n\ncode(1);\n`],
};

test('GIVEN each license-marker layout and near miss WHEN bump-version.sh decides content_version and Phase 2b pairs the same bytes THEN bump KEEP <=> pair META', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-parity-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'old'), { recursive: true });
  const git = (...args) => spawnSync('git', ['-C', repo, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { encoding: 'utf8' });
  for (const [name, [, before]] of Object.entries(LAYOUTS)) { writeFileSync(join(repo, name), before); writeFileSync(join(repo, 'old', name), before); }
  const setup = [git('init', '-q'), git('add', '-A'), git('commit', '-q', '-m', 'v1'), git('tag', 'v1.0.0')].map(r => r.status);
  for (const [name, [, , now]] of Object.entries(LAYOUTS)) writeFileSync(join(repo, name), now);
  writeFileSync(join(root, 'bump.sh'), `set -eu\nNEW=2.0.0\n${bumpFn('strip_meta_for_diff')}\n${bumpFn('content_version_for')}\ncontent_version_for "$1" "$2"\n`);
  writeFileSync(join(root, 'pair.sh'), `${pairFns}\npair "$1" "$2"\n`);
  const run = (script, ...args) => spawnSync('bash', ['-e', '-o', 'pipefail', join(root, script), ...args], { cwd: repo, encoding: 'utf8', timeout: 10000 });
  const actual = Object.fromEntries(Object.entries(LAYOUTS).map(([name, [kind]]) => {
    const cv = run('bump.sh', name, kind), pair = run('pair.sh', join('old', name), name);
    return [name, [cv.stdout.trim(), pair.stdout.split(' ')[0], cv.stderr + pair.stderr]];
  }));
  const keep = ['1.0.0', 'META', ''], bump = ['2.0.0', 'DIFFERS', ''];
  assert.deepEqual({ setup, actual }, { setup: [0, 0, 0, 0], actual: {
    'hook-spdx-copyright.mjs': keep, 'hook-spdx.mjs': keep, 'lib-blank-above.mjs': keep, 'lib-no-blank.mjs': keep,
    'agent.md': keep, 'SKILL.md': keep, 'trailing-newline.mjs': keep,
    'blank-below-only.mjs': bump, 'apache.mjs': bump, 'loose.mjs': bump, 'body-license.md': bump, 'edit-beside-marker.mjs': bump,
  } }, 'Phase 2b meta_strip mirrors bump-version.sh strip_meta_for_diff: a kept content_version (1.0.0) must read META, a bumped one (2.0.0) DIFFERS');
});
