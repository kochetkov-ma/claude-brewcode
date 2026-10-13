#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const STATUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = resolve(STATUS_DIR, '../../../brewtools');
const source = ['SKILL.md', 'references/phase1-probes.md', 'references/phase2-stamps.md', 'references/task-tools-offer.md']
  .map(f => readFileSync(join(STATUS_DIR, f), 'utf8')).join('\n');
const stamps = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(m => m[1]).find(b => b.includes("<<'STAMPS'"));
const stampLines = source.match(/<<'STAMPS'\n([\s\S]*?)\nSTAMPS\n/)[1].split('\n').map(line => line.split('|'));
const CONFIGS = ['.claude/agent-deadline.json', 'GLOBAL/agent-deadline.json', '.claude/brewtools/agent-router.json',
  '.claude/agent-return.json', 'GLOBAL/agent-return.json'];
const read = rel => readFileSync(join(TOOLS, rel), 'utf8');
const hookCv = rel => read(rel).split('\n')[1].match(/content_version=(\S+)/)[1];

test('GIVEN the STAMPS heredoc WHEN reading each hook config source THEN it is the hook its own setup status compares against', () => {
  const owners = {
    deadline: `skills/agent-deadline-setup/assets/${read('skills/agent-deadline-setup/SKILL.md').match(/const contractCV=cvOf\(path\.join\(assets,"([^"]+)"\)\)/)[1]}`,
    router: read('skills/agent-router-setup/SKILL.md').match(/^KCV=\$TCV\b/m) && `skills/agent-router-setup/assets/${read('skills/agent-router-setup/SKILL.md').match(/^TCV=\$\(cv_of "\$A\/([^"]+)"\)/m)[1]}`,
    ret: `skills/agent-return-setup/assets/${read('skills/agent-return-setup/SKILL.md').match(/const contractCV=cvOf\(path\.join\(assets,"([^"]+)"\)\)/)[1]}`,
  };
  const actual = Object.fromEntries(CONFIGS.map(path => [path, stampLines.find(([, p]) => p === path)?.[3]]));
  assert.deepEqual(actual, {
    '.claude/agent-deadline.json': owners.deadline, 'GLOBAL/agent-deadline.json': owners.deadline,
    '.claude/brewtools/agent-router.json': owners.router,
    '.claude/agent-return.json': owners.ret, 'GLOBAL/agent-return.json': owners.ret,
  }, 'setup-status must measure each config against the hook that parses it, as agent-{deadline,router,return}-setup status does');
});

test('GIVEN hook configs stamped with their parsing hook content_version WHEN running Phase 2a for brewtools THEN every config reads CURRENT cv-src', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'setup-status-hookcv-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project'), cfg = join(root, 'cfg');
  const cvs = {
    deadline: hookCv('skills/agent-deadline-setup/assets/agent-deadline-guard.mjs'),
    router: hookCv('skills/agent-router-setup/assets/agent-router.mjs'),
    ret: hookCv('skills/agent-return-setup/assets/agent-return-budget.mjs'),
  };
  const files = {
    [join(project, '.claude/agent-deadline.json')]: ['deadline', 'agent-deadline-setup'], [join(cfg, 'agent-deadline.json')]: ['deadline', 'agent-deadline-setup'],
    [join(project, '.claude/brewtools/agent-router.json')]: ['router', 'agent-router-setup'],
    [join(project, '.claude/agent-return.json')]: ['ret', 'agent-return-setup'], [join(cfg, 'agent-return.json')]: ['ret', 'agent-return-setup'],
  };
  for (const [file, [key, skill]] of Object.entries(files)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ enabled: true, version: '9.9.9', content_version: cvs[key], generated_by: `brewtools:${skill}` }));
  }
  const command = stamps.replace('PLUGIN_ROOT=/abs/root/printed/by/phase0', `PLUGIN_ROOT="${TOOLS}"`)
    .replace('PLUGIN=brewcode ', 'PLUGIN=brewtools ').replaceAll('${CLAUDE_SKILL_DIR}', STATUS_DIR);
  const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
    cwd: project, encoding: 'utf8', env: { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: cfg, CLAUDE_PROJECT_DIR: project, TASK_SPEC_MODE: 'off' }, timeout: 10000,
  });
  const lines = r.stdout.split('\n').filter(line => /agent-(deadline|router|return)\.json/.test(line));
  assert.deepEqual({ status: r.status, lines }, {
    status: 0,
    lines: [
      `CURRENT   .claude/agent-deadline.json (${cvs.deadline}, cv-src)`, `CURRENT   ${cfg}/agent-deadline.json (${cvs.deadline}, cv-src)`,
      `CURRENT   .claude/brewtools/agent-router.json (${cvs.router}, cv-src)`,
      `CURRENT   .claude/agent-return.json (${cvs.ret}, cv-src)`, `CURRENT   ${cfg}/agent-return.json (${cvs.ret}, cv-src)`,
    ],
  }, `a fresh install (config cv = parsing hook cv) must read CURRENT, never BEHIND a runbook bump (stderr: ${r.stderr})`);
});
