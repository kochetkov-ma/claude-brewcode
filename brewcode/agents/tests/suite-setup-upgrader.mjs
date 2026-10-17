#!/usr/bin/env node
// Pins brewcode:setup-upgrader: frontmatter, tokens, git bans, fmd stamps; grammar and brief vs setup-status refs.
// Run: node <this file>; rc 1 on any failed check.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const AGENTS = join(HERE, '..');
const PLUGIN_ROOT = join(AGENTS, '..');
const REPO = join(PLUGIN_ROOT, '..');

const UPGRADER = readFileSync(join(AGENTS, 'setup-upgrader.md'), 'utf8');
const HOOK_CREATOR = readFileSync(join(AGENTS, 'hook-creator.md'), 'utf8');
const BUMP = readFileSync(join(REPO, '.claude', 'scripts', 'bump-version.sh'), 'utf8');
const PLUGIN_VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const REFS = join(PLUGIN_ROOT, 'skills', 'setup-status', 'references');
const FLOW = readFileSync(join(REFS, 'update-flow.md'), 'utf8');
const RUNNER = readFileSync(join(REFS, 'upgrade-runner.md'), 'utf8');

// Canonical template: update-flow.md §6 item 5; its §4 regex is applied to the agent's lines by unattended-lockstep.mjs.
const GRAMMAR = (FLOW.split('## 6. Unattended block', 2)[1] ?? '').match(/Last line, exactly once: `([^`]+)`/)?.[1] ?? 'NO CANONICAL GRAMMAR';
const SPAWN_FENCE = (RUNNER.split('### 2b. Spawn', 2)[1] ?? '').match(/```text\n([\s\S]*?)\n```/)?.[1] ?? 'NO SPAWN FENCE';

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  passed += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  results.push(ok
    ? `  PASS  ${name}  (${message})`
    : `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

function frontmatter(text) {
  const block = text.split(/^---$/m)[1] || '';
  return block.split('\n').filter((l) => /^[A-Za-z_]+:/.test(l))
    .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]);
}

function body(text) {
  return text.split(/^---$/m).slice(2).join('---');
}

/** Lines from the `## <heading>` line up to the next `## ` heading. */
function section(text, heading) {
  const lines = text.split('\n');
  const from = lines.indexOf(`## ${heading}`);
  const to = lines.findIndex((l, i) => i > from && l.startsWith('## '));
  return from < 0 ? [] : lines.slice(from, to < 0 ? lines.length : to);
}

const fm = Object.fromEntries(frontmatter(UPGRADER));
const lines = UPGRADER.split('\n');

check('GIVEN setup-upgrader WHEN frontmatter read THEN hook-creator key order and the spec values',
  {
    keys: frontmatter(UPGRADER).map(([k]) => k),
    name: fm.name,
    model: fm.model,
    maxTurns: fm.maxTurns,
    tools: fm.tools,
    triggers: /Triggers:/.test(fm.description || ''),
  },
  {
    keys: frontmatter(HOOK_CREATOR).map(([k]) => k),
    name: 'setup-upgrader',
    model: 'inherit',
    maxTurns: '80',
    tools: 'Read, Write, Edit, Bash, Agent',
    triggers: false,
  },
  'keys in hook-creator.md:1-13 order (no hooks/permissionMode/disallowedTools), tools without Glob/Grep, no Triggers:');

check('GIVEN setup-upgrader WHEN stamp fields read THEN fmd fields match the brewcode plugin',
  { doc_type: fm.doc_type, version: fm.version, generated_by: fm.generated_by, dated: /^"\d{4}-\d{2}-\d{2}"$/.test(fm.last_updated || '') },
  { doc_type: 'llm', version: `"${PLUGIN_VERSION}"`, generated_by: '"brewcode"', dated: true },
  'bump-version.sh fmd kind rewrites version, content_version, generated_by and last_updated in place');

check('GIVEN setup-upgrader WHEN scanned for load-time tokens THEN no literal dollar-brace or dollar-ARGUMENTS',
  lines.map((l, i) => (l.includes('${') || l.includes('$ARGUMENTS') ? i + 1 : 0)).filter(Boolean),
  [],
  'a plugin agent body gets dollar-brace tokens substituted with brewcode root; spell names bare instead');

const never = section(UPGRADER, 'Never').join('\n');
check('GIVEN the Never section WHEN git and scratch bans listed THEN every ban is present',
  ['`git add`', '`git commit`', '`git push`', '`git stash`', '`git reset`', '`git checkout`', '`git restore`',
    '`git revert`', '`git clean`', '`git tag`', '`git merge`', '`git rebase`', '`git worktree`', '`--force`',
    '`mktemp -d`'].filter((t) => !never.includes(t)),
  [],
  'setup-status STOPs on a moved HEAD/stash; scratch outside mktemp -d trips the scope check');

const delegation = section(UPGRADER, 'Delegation').join(' ');
check('GIVEN the Delegation section WHEN a spawn brief is forwarded THEN it sends the bans and the OWNED value, never the bare word',
  {
    sends: delegation.includes('"no git commit, push, stash or reset; no questions; scratch only in a private mktemp -d; write only under: <OWNED value from your brief>"'),
    bareWord: delegation.includes('write only under OWNED"'),
  },
  { sends: true, bareWord: false },
  'step 3 substitution skips this quoted line: the child must get the literal OWNED prefixes');

const fenced = body(UPGRADER).split('\n').filter((l) => l.startsWith('RESULT '));
check('GIVEN the Return Contract WHEN the grammar line read THEN it equals update-flow.md §6 item 5',
  fenced.filter((l) => l === GRAMMAR).length,
  1,
  'exactly one verbatim copy of the canonical grammar line');

const samples = fenced.filter((l) => l !== GRAMMAR);
const statuses = (GRAMMAR.match(/^RESULT <([a-z|]+)>/)?.[1] ?? 'NO STATUSES').split('|').sort();
check('GIVEN the RESULT samples WHEN statuses collected THEN one sample per update-flow.md status',
  { count: samples.length, statuses: [...new Set(samples.map((l) => l.split(' ')[1]))].sort() },
  { count: statuses.length, statuses },
  'each status of the canonical grammar has exactly one sample');

const briefLabels = SPAWN_FENCE.split('\n').map((l) => l.match(/^\s+([A-Z_]+): /)?.[1]).filter(Boolean).sort();
check('GIVEN the Brief table WHEN its value names read THEN they equal the labels upgrade-runner.md 2b sends',
  section(UPGRADER, 'Brief').filter((l) => /^\| `[A-Z_]+` \|/.test(l)).map((l) => l.split('`')[1]).sort(),
  briefLabels.length ? briefLabels : ['NO RUNNER LABELS'],
  'a label the runner adds, drops or renames leaves the agent reading an unfilled value');

check('GIVEN the Return Contract WHEN its line cap read THEN it equals the cap in the upgrade-runner.md 2b DONE line',
  UPGRADER.match(/^At most (\d+) lines/m)?.[1] ?? 'NO AGENT CAP',
  SPAWN_FENCE.match(/^DONE: .*at most (\d+) lines/m)?.[1] ?? 'NO RUNNER CAP',
  'the brief and the agent must state one line budget');

const stamped = (BUMP.match(/^STAMPED_FILES='[\s\S]*?'$/m) || [''])[0]
  .split('\n').map((l) => l.replace(/^STAMPED_FILES='/, '').replace(/'$/, ''))
  .filter((l) => l.startsWith('brewcode/agents/') && l.endsWith('|fmd|brewcode'))
  .map((l) => l.split('|')[0]).sort();
check('GIVEN brewcode/agents/*.md WHEN bump-version.sh STAMPED_FILES read THEN each agent has one fmd line',
  stamped,
  readdirSync(AGENTS).filter((f) => f.endsWith('.md')).map((f) => `brewcode/agents/${f}`).sort(),
  'an agent without a |fmd|brewcode line keeps a stale version stamp after a release');

console.log('\nsuite-setup-upgrader (brewcode:setup-upgrader contract)');
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
