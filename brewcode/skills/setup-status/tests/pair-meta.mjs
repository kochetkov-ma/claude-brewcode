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
  const command = pairs.replace('BC=/abs/brewcode/root; BT=/abs/brewtools/root; BD=/abs/brewdoc/root',
    `BC="${ROOT}/brewcode"; BT="${ROOT}/brewtools"; BD="${ROOT}/brewdoc"`);
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    cwd: project, encoding: 'utf8', env: { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'cfg'), CLAUDE_PROJECT_DIR: project }, timeout: 10000,
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
