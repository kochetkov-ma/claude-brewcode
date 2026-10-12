#!/usr/bin/env node
// Usage: node .claude/scripts/check-install-blocks.mjs -> every inline copy of a shared INSTALL.md block == its canonical copy.
// code = body after the anchor up to column-0 `}`; prose = anchor..stopAt, whitespace-collapsed. Exit 0 match, 1 drift/missing (path:line).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = join(REPO, 'brewtools', 'skills');
const runbook = (name) => join(SKILLS, `${name}-setup`, 'assets', 'INSTALL.md');

const ALL = ['agent-return', 'agent-deadline', 'agent-router'];

/** `canonical` is the file that owns the wording; `files` are all carriers. */
const BLOCKS = [
  {
    id: 'settings-lock',
    anchor: 'function lock(f){',
    canonical: 'agent-return',
    files: ALL,
    why: 'O_EXCL settings.json lock. A divergent retry count or stale-break window lets two '
       + 'concurrent installers both read the old document, and the second silently erases the first.',
  },
  {
    id: 'plugin-version',
    anchor: 'function pluginVersion(){',
    canonical: 'agent-return',
    files: ['agent-return', 'agent-deadline', 'agent-router'],
    why: 'Version resolution for the stamped JSON metadata: env first, plugin.json fallback, '
       + 'never a baked literal. Drift here writes a wrong `version` into a user config.',
  },
  {
    id: 'project-root',
    anchor: 'claude_project_root() {',
    canonical: 'agent-return',
    // agent-router excluded on purpose: its ladder probes .claude/brewtools/agent-router.json
    // before git toplevel so installer and hook resolve the same root.
    files: ['agent-return', 'agent-deadline'],
    why: 'CLAUDE_PROJECT_DIR -> git toplevel -> upward walk -> PWD. A divergent ladder installs '
       + 'into a nested .claude/ that the running Claude Code never reads.',
  },
  {
    id: 'sensitive-path',
    prose: true,
    anchor: 'CRITICAL: `~/.claude/*` is a SENSITIVE path.',
    // Stops at the end of the permission claim. The sentence AFTER this names each
    // runbook's own write tools (printf vs cat heredoc) and is intentionally local.
    stopAt: 'without bypass.',
    canonical: 'agent-return',
    files: ['agent-return', 'agent-deadline'],
    why: 'Permission semantics of ~/.claude: ASK in default/acceptEdits, auto-approved only under '
       + 'bypassPermissions, hard failure headless. Wrong here and a global install hangs unattended.',
  },
];

/** Every occurrence of `block`'s anchor in `text`, as {line, body}. */
function extract(text, block) {
  const lines = text.split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(block.anchor)) continue;
    if (block.prose) {
      const span = [];
      for (let j = i; j < lines.length; j++) {
        span.push(lines[j]);
        if (lines[j].includes(block.stopAt)) break;
      }
      const flat = span.join(' ').replace(/\s+/g, ' ').trim();
      const cut = flat.indexOf(block.stopAt);
      found.push({ line: i + 1, body: flat.slice(0, cut + block.stopAt.length) });
      continue;
    }
    found.push({ line: i + 1, body: lines.slice(i + 1, lines.indexOf('}', i + 1)).join('\n') });
  }
  return found;
}

const problems = [];
for (const block of BLOCKS) {
  const canonPath = runbook(block.canonical);
  const canonHits = extract(readFileSync(canonPath, "utf8"), block);
  if (canonHits.length === 0) {
    problems.push(`${block.id}: anchor missing in the CANONICAL file ${canonPath} — update the anchor in this checker`);
    continue;
  }
  const want = canonHits[0].body;
  for (const name of block.files) {
    const path = runbook(name);
    if (!existsSync(path)) {
      problems.push(`${block.id}: ${path} does not exist`);
      continue;
    }
    const hits = extract(readFileSync(path, "utf8"), block);
    if (hits.length === 0) {
      problems.push(`${block.id}: anchor absent in ${path} — block removed or reworded`);
      continue;
    }
    for (const hit of hits) {
      if (hit.body === want) continue;
      problems.push(
        `${block.id}: ${path}:${hit.line} differs from ${canonPath}:${canonHits[0].line}\n`
        + `    why it matters: ${block.why}`,
      );
    }
  }
}

const copies = BLOCKS.reduce((n, b) => n + b.files.length, 0);
if (problems.length > 0) {
  console.error(`FAIL: ${problems.length} shared-block drift(s) across the guard runbooks\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nFix the canonical copy, then propagate it verbatim to the others.');
  process.exit(1);
}
console.log(`OK: ${BLOCKS.length} shared blocks in sync across ${copies} declared carriers`);
