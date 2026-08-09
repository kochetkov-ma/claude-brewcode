#!/usr/bin/env node
/**
 * suite-hooks.mjs — unit D: rule template, .sembleignore, CLAUDE.md marker
 * block, the five hooks (session, prefetch, stats, reminder, subagent) and the
 * settings.json merge performed by semble-guidance.sh — including the migration
 * that reverses v5.1.0: the reminder hook comes back under its own name, the
 * SubagentStart row moves off `Explore` onto every agent type, and
 * `semble-explore.mjs` stays retired for good.
 *
 * Self-contained: inlines its own check()/run() helpers, runs standalone
 * (`node tests/suite-hooks.mjs`), and never touches the real ~/.claude, the
 * real cache, or the repo working tree — everything happens under a temp base
 * with SEMBLE_TEST_HOME / SEMBLE_PROJECT_ROOT injected.
 *
 * Assertion policy: unconditional exact-equality / exact-size checks with a
 * description. No branching decides which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync,
  readdirSync, realpathSync, statSync, chmodSync, appendFileSync, symlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');          // tests/
const SKILL = join(HERE, '..');                                   // skills/semble-setup/
const ASSETS = join(SKILL, 'assets');
const SCRIPTS = join(SKILL, 'scripts');
const TEMPLATE_SRC = join(ASSETS, 'semble-first.md.template');
const SESSION_SRC = join(ASSETS, 'semble-session.mjs');
const PREFETCH_SRC = join(ASSETS, 'semble-prefetch.mjs');
const STATS_SRC = join(ASSETS, 'semble-stats.mjs');
const REMINDER_SRC = join(ASSETS, 'semble-reminder.mjs');
const SUBAGENT_SRC = join(ASSETS, 'semble-subagent.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-d-')));
const HOME = join(BASE, 'home');
mkdirSync(join(HOME, '.claude'), { recursive: true });

// The registered cache root every fixture state points at, and the four files
// semble writes into `<root>/<repoHash>/index`. The prefetch hook refuses to
// spawn a search when they are not all there — a cold index cannot be built
// inside its 3 s cap, so trying is pure loss — which makes a warm index part of
// the baseline fixture and `{ cold: true }` the explicit way to remove it.
const CACHE = join(BASE, 'cache');
const REPO_HASH = 'abcdef0123456789'.repeat(4);
const INDEX_FILE_NAMES = ['chunks.json', 'metadata.json', 'bm25_index', 'semantic_index'];
function warmIndex(root, hash, only) {
  const dir = join(root, hash, 'index');
  mkdirSync(dir, { recursive: true });
  for (const n of (only || INDEX_FILE_NAMES)) writeFileSync(join(dir, n), '{}');
  return dir;
}

let passed = 0;
let failed = 0;
const results = [];

// ── deep-equal primitive (utility, not test-body branching) ─────────────────
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function check(name, actual, expected, message) {
  const ok = deepEqual(actual, expected);
  if (ok) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

// Unparseable stdin makes a hook fall back to process.cwd(); running from the
// repo root let the developer machine's own .claude/semble/state.json decide the
// answer. cwd is pinned to a state-less temp dir so the fixture is the only input.
function runNode(script, stdinStr, cwd = BASE) {
  const r = spawnSync(process.execPath, [script], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env },
    cwd,
    timeout: 15000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

// ── skill copy under the temp base (never runs from the repo tree) ──────────
// The copy reproduces the REAL plugin layout — <plugin>/skills/semble-setup/... —
// because scripts/lib/semble-common.sh resolves the artifact version by walking
// four levels up from its own location to <plugin>/.claude-plugin/plugin.json.
// A flat copy sends that walk outside the temp tree and every installed artifact
// gets stamped version "unknown".
const PLUGIN_COPY = join(BASE, 'plugin');
const SKILL_COPY = join(PLUGIN_COPY, 'skills', 'semble-setup');
mkdirSync(join(PLUGIN_COPY, '.claude-plugin'), { recursive: true });
copyFileSync(join(SKILL, '..', '..', '.claude-plugin', 'plugin.json'),
  join(PLUGIN_COPY, '.claude-plugin', 'plugin.json'));
const PLUGIN_VERSION = JSON.parse(
  readFileSync(join(PLUGIN_COPY, '.claude-plugin', 'plugin.json'), 'utf8')).version;
mkdirSync(join(SKILL_COPY, 'scripts', 'lib'), { recursive: true });
mkdirSync(join(SKILL_COPY, 'assets'), { recursive: true });
copyFileSync(join(SCRIPTS, 'semble-guidance.sh'), join(SKILL_COPY, 'scripts', 'semble-guidance.sh'));
// The candidate scanner is a sibling of the guidance script: without it the
// measured block is silently skipped, so J3 would prove nothing.
copyFileSync(join(SCRIPTS, 'semble-project.sh'), join(SKILL_COPY, 'scripts', 'semble-project.sh'));
chmodSync(join(SKILL_COPY, 'scripts', 'semble-project.sh'), 0o755);
for (const f of ['semble-first.md.template', 'sembleignore.template',
  'semble-session.mjs', 'semble-prefetch.mjs', 'semble-stats.mjs',
  'semble-reminder.mjs', 'semble-subagent.mjs']) {
  copyFileSync(join(ASSETS, f), join(SKILL_COPY, 'assets', f));
}

const REAL_LIB = join(SCRIPTS, 'lib', 'semble-common.sh');
const LIB_COPY = join(SKILL_COPY, 'scripts', 'lib', 'semble-common.sh');
const LIB_STUB = `#!/usr/bin/env bash
# Minimal stand-in for scripts/lib/semble-common.sh (unit B) used only when the
# real library has not landed yet. Same API subset, same stdout formats.
SEMBLE_TOOL_SEARCH="mcp__semble_code__search"
SEMBLE_TOOL_RELATED="mcp__semble_code__find_related"
sc_ok()   { printf '\\xe2\\x9c\\x85 %s\\n' "$*"; }
sc_warn() { printf 'WARN %s\\n' "$*"; }
sc_err()  { printf 'ERR %s\\n' "$*"; }
sc_skip() { printf 'SKIP %s\\n' "$*"; }
sc_die()  { printf 'ERR %s\\n' "$*" >&2; exit 1; }
sc_dry()  { printf 'DRY %s\\n' "$*"; return 0; }
sc_have() { command -v "$1" >/dev/null 2>&1; }
sc_home() { printf '%s\\n' "\${SEMBLE_TEST_HOME:-$HOME}"; }
sc_project_root() { local p="\${SEMBLE_PROJECT_ROOT:-$PWD}"; ( cd "$p" 2>/dev/null && pwd -P ) || { printf '%s\\n' "$p"; return 1; }; }
sc_project_settings() { printf '%s\\n' "$(sc_project_root)/.claude/settings.json"; }
sc_state_file()       { printf '%s\\n' "$(sc_project_root)/.claude/semble/state.json"; }
sc_rule_file()        { printf '%s\\n' "$(sc_project_root)/.claude/rules/semble-first.md"; }
sc_hooks_dir()        { printf '%s\\n' "$(sc_project_root)/.claude/hooks"; }
sc_require_node() { sc_have node || sc_die "node is required"; }
sc_backup() { [ -f "$1" ] || return 0; local b="$1.bak.$(date +%s)"; cp "$1" "$b" && printf '%s\\n' "$b"; }
SEMBLE_GENERATED_BY="brewcode:semble-setup"
sc_plugin_version() { printf '%s' "${PLUGIN_VERSION}"; }
sc_today() { date +%F; }
`;
const usedRealLib = existsSync(REAL_LIB);
if (usedRealLib) copyFileSync(REAL_LIB, LIB_COPY);
else writeFileSync(LIB_COPY, LIB_STUB);
const GUIDANCE = join(SKILL_COPY, 'scripts', 'semble-guidance.sh');
const TPL_TEXT = readFileSync(TEMPLATE_SRC, 'utf8');

// The rule is a mechanism-(a) byte copy: its stamp is baked into the plugin template by
// bump-version.sh at release and copied verbatim, so the installed file must equal the
// template byte for byte. `last_updated` is deliberately absent -- a date written at install
// time would make setup-status's `cmp` read DIFFERS forever.
const META_KEYS = ['doc_type', 'version', 'generated_by', 'last_updated'];
const metaOf = (t) => Object.fromEntries(META_KEYS
  .map((k) => [k, (new RegExp(`^${k}: (.*)$`, 'm').exec(t.split('\n---\n')[0] || '') || [])[1] ?? null]));

let projSeq = 0;
/** fixture project -> the cache root its state.json points at. */
const projCache = new Map();
const cacheOf = (p) => projCache.get(p) || '';
function freshProject(seed) {
  projSeq++;
  const dir = join(BASE, `proj${projSeq}`);
  mkdirSync(join(dir, '.claude'), { recursive: true });
  if (seed && seed.settings !== undefined) {
    writeFileSync(join(dir, '.claude', 'settings.json'), seed.settings);
  }
  if (seed && seed.state !== undefined) {
    mkdirSync(join(dir, '.claude', 'semble'), { recursive: true });
    // Each fixture gets its OWN cache root. The repo hash is shared, so without
    // this a project seeded `cold: true` would find the warm index another
    // fixture had already built and the cold case would silently never run.
    const st = safeParse(seed.state);
    const own = st && st.cacheRoot === CACHE;
    const text = own ? JSON.stringify({ ...st, cacheRoot: join(CACHE, `proj${projSeq}`) }) : seed.state;
    writeFileSync(join(dir, '.claude', 'semble', 'state.json'), text);
    const eff = safeParse(text);
    if (eff && typeof eff.cacheRoot === 'string') projCache.set(dir, eff.cacheRoot);
    // Warm under the hash the hook computes from the project path itself, NOT
    // the one state.json carries - that field is deliberately ignored now, so
    // seeding by it would warm a directory nothing ever looks in.
    if (eff && seed.cold !== true && eff.cacheRoot) {
      warmIndex(eff.cacheRoot, createHash('sha256').update(realpathSync(dir)).digest('hex'),
        seed.indexOnly);
    }
  }
  if (seed && seed.stateDir === true) {
    mkdirSync(join(dir, '.claude', 'semble', 'state.json'), { recursive: true });
  }
  if (seed && seed.claudeMd !== undefined) {
    writeFileSync(join(dir, 'CLAUDE.md'), seed.claudeMd);
  }
  return dir;
}

// SEMBLE_NO_CANDIDATES=1 by default: the measured-candidates block is a
// property of the repo being installed into, and letting it fire in every
// fixture would make unrelated expectations depend on the fixture's file mix.
// Section J3 turns it back on and tests it on purpose.
function guidance(proj, args, extraEnv = {}) {
  const r = spawnSync('bash', [GUIDANCE, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SEMBLE_PROJECT_ROOT: proj,
      SEMBLE_TEST_HOME: HOME,
      SEMBLE_NO_NETWORK: '1',
      SEMBLE_NO_CANDIDATES: '1',
      ...extraEnv,
    },
    timeout: 30000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// semble-remove.sh + its agent sibling, copied next to the guidance script so the
// removal flavour resolves both from the frozen temp tree, never from the repo.
const REMOVE_COPY = join(SKILL_COPY, 'scripts', 'semble-remove.sh');
for (const f of ['semble-remove.sh', 'semble-agents.sh']) {
  copyFileSync(join(SCRIPTS, f), join(SKILL_COPY, 'scripts', f));
  chmodSync(join(SKILL_COPY, 'scripts', f), 0o755);
}
chmodSync(GUIDANCE, 0o755);

function removeIntegration(proj) {
  const r = spawnSync('bash', [REMOVE_COPY, 'integration', '--yes', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SEMBLE_PROJECT_ROOT: proj, SEMBLE_TEST_HOME: HOME, SEMBLE_NO_NETWORK: '1' },
    timeout: 30000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

const settingsPath = (p) => join(p, '.claude', 'settings.json');
const hooksDirOf = (p) => join(p, '.claude', 'hooks');
const readSettings = (p) => JSON.parse(readFileSync(settingsPath(p), 'utf8'));
const readRaw = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

const argsOf = (e) => ((e && e.hooks) || []).flatMap((h) => (h && h.args) || []).filter((a) => typeof a === 'string');
const matcherOf = (e) => (e && typeof e.matcher === 'string' ? e.matcher : null);

function countEntry(s, ev, matcher, full) {
  const arr = (s.hooks && s.hooks[ev]) || [];
  return arr.filter((e) => matcherOf(e) === matcher && argsOf(e).includes(full)).length;
}

// The want table: SessionStart, UserPromptSubmit, the stats pair, the reminder
// row on `Bash|Grep`, and the subagent row with NO matcher (a SubagentStart
// matcher is keyed on agent_type, so absent == every agent type). The v1 shape -
// PreToolUse/Bash + PreToolUse/Grep + SubagentStart/Explore - is REPLACED, not
// kept beside these; group M proves it on a real v1-shaped file.
const WANT_N = 6;
const STATS_MATCHER = 'mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read';
/** One count per want row, in want-table order. */
function wantCounts(proj, s) {
  const { session, prefetch: pre, stats, reminder, subagent } = semblePaths(proj);
  return [
    countEntry(s, 'SessionStart', null, session),
    countEntry(s, 'UserPromptSubmit', null, pre),
    countEntry(s, 'PostToolUse', STATS_MATCHER, stats),
    countEntry(s, 'PostToolUseFailure', STATS_MATCHER, stats),
    countEntry(s, 'PreToolUse', 'Bash|Grep', reminder),
    countEntry(s, 'SubagentStart', null, subagent),
  ];
}

function semblePaths(proj) {
  const d = hooksDirOf(proj);
  return {
    session: join(d, 'semble-session.mjs'),
    prefetch: join(d, 'semble-prefetch.mjs'),
    stats: join(d, 'semble-stats.mjs'),
    reminder: join(d, 'semble-reminder.mjs'),
    subagent: join(d, 'semble-subagent.mjs'),
    // retired for good, superseded by semble-subagent.mjs — still addressable,
    // because the migration is asserted on the file it must DELETE.
    explore: join(d, 'semble-explore.mjs'),
  };
}

const READY_STATE = (extra) =>
  JSON.stringify({
    schema: 1,
    profile: 'code',
    projectRoot: '/x',
    approvedVersion: '0.5.4',
    phase: 'ready',
    enabled: true,
    scope: 'user',
    cacheRoot: CACHE,
    repoHash: REPO_HASH,
    completed: ['mcp'],
    ...(extra || {}),
  });

// The prefetch gate is "semble is usable here", not "phase === ready": semble
// builds its index lazily INSIDE a tool call, so a phase gate would deadlock.
// `completed` holding "mcp" is the registration proxy, so it belongs in the
// baseline fixture; the cases that drop it are explicit (P6).

// ═══════════════════════════════════════════════════════════════════════════
// A. settings.json merge
// ═══════════════════════════════════════════════════════════════════════════

// A1 — fresh merge
{
  const p = freshProject({});
  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('A1.exit', r.status, 0, 'install --part all exits 0 on a fresh project');
  // Every script's --json ends its single object with exactly one newline.
  check('A1.trailingNewline', [r.stdout.endsWith('\n'), r.stdout.endsWith('\n\n')], [true, false],
    'the report ends with exactly one trailing newline');
  check('A1.statusTrailingNewline', guidance(p, ['status', '--json']).stdout.endsWith('\n'), true,
    'status --json carries the same trailing newline');
  const s = readSettings(p);
  const { session, prefetch: pre, stats, reminder: rem, subagent: sub, explore: exp } = semblePaths(p);
  check('A1.sessionEntry', s.hooks.SessionStart, [
    { hooks: [{ type: 'command', command: 'node', args: [session], timeout: 5 }] },
  ], 'SessionStart entry has the exact contract shape with an explicit 5 s timeout');
  check('A1.userPromptSubmit', s.hooks.UserPromptSubmit, [
    { hooks: [{ type: 'command', command: 'node', args: [pre], timeout: 5 }] },
  ], 'the prefetch hook is registered once on UserPromptSubmit with NO matcher - every prompt reaches it');
  check('A1.reminderEntry', s.hooks.PreToolUse, [
    { matcher: 'Bash|Grep', hooks: [{ type: 'command', command: 'node', args: [rem], timeout: 5 }] },
  ], 'the reminder hook is registered once on PreToolUse with the `|`-only exact tool list');
  check('A1.subagentEntry', s.hooks.SubagentStart, [
    { hooks: [{ type: 'command', command: 'node', args: [sub], timeout: 5 }] },
  ], 'the subagent hook carries NO matcher, which is the only form that covers every agent type');
  check('A1.perm', s.permissions.allow, ['mcp__semble_code__search', 'mcp__semble_code__find_related'],
    'both MCP tool names land in permissions.allow');
  check('A1.files', [existsSync(session), existsSync(pre), existsSync(stats),
    existsSync(rem), existsSync(sub)], [true, true, true, true, true],
  'all five live .mjs assets were copied into .claude/hooks');
  check('A1.noRetiredFiles', existsSync(exp), false,
    'and the one retired asset is never written');
  const ruleText = readRaw(join(p, '.claude', 'rules', 'semble-first.md'));
  check('A1.rule', ruleText, TPL_TEXT,
    'the installed rule is byte-identical to the plugin template, so setup-status cmp reads SAME');
  check('A1.ruleStamp', metaOf(ruleText), {
    doc_type: 'llm',
    version: `"${PLUGIN_VERSION}"`,
    generated_by: '"brewcode:semble-setup"',
    last_updated: null,
  }, 'the rule carries the release-baked stamp and no install-time last_updated');
  check('A1.ruleNoDupes', META_KEYS.map((k) => ruleText.split('\n').filter((l) => l.startsWith(`${k}:`)).length),
    [1, 1, 1, 0], 'each baked key appears exactly once; last_updated is absent');
}

// A2 — repeat merge is a no-op (3 runs)
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const after1 = readRaw(settingsPath(p));
  const r2 = guidance(p, ['install', '--part', 'all', '--json']);
  const after2 = readRaw(settingsPath(p));
  const r3 = guidance(p, ['install', '--part', 'all', '--json']);
  const after3 = readRaw(settingsPath(p));
  check('A2.exit2', r2.status, 0, 'second install exits 0');
  check('A2.exit3', r3.status, 0, 'third install exits 0');
  check('A2.bytes2', after2, after1, 'settings.json is byte-identical after run 2');
  check('A2.bytes3', after3, after1, 'settings.json is byte-identical after run 3');
  const s = readSettings(p);
  check('A2.counts', wantCounts(p, s), [1, 1, 1, 1, 1, 1], 'exactly one entry per want row after three merges');
  check('A2.permCounts', [
    s.permissions.allow.filter((x) => x === 'mcp__semble_code__search').length,
    s.permissions.allow.filter((x) => x === 'mcp__semble_code__find_related').length,
  ], [1, 1], 'each tool name appears exactly once in permissions.allow after three merges');
}

// A3 — foreign entries preserved
const FOREIGN = {
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['/opt/foreign/guard.mjs'], timeout: 3000 }] },
    ],
    SubagentStop: [
      { hooks: [{ type: 'command', command: 'bash', args: ['/opt/foreign/cleanup.sh'], timeout: 1000 }] },
    ],
  },
  permissions: { allow: ['Bash(git *)'], deny: ['Read(./.env)'] },
  model: 'opus',
};
{
  const p = freshProject({ settings: JSON.stringify(FOREIGN, null, 2) + '\n' });
  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('A3.exit', r.status, 0, 'merge into a settings file with foreign hooks exits 0');
  const s = readSettings(p);
  check('A3.foreignPreToolUse', s.hooks.PreToolUse[0], FOREIGN.hooks.PreToolUse[0],
    'the foreign PreToolUse entry is deep-equal to its original value');
  check('A3.foreignSubagentStop', s.hooks.SubagentStop, FOREIGN.hooks.SubagentStop,
    'the foreign SubagentStop array is untouched');
  check('A3.foreignDeny', s.permissions.deny, ['Read(./.env)'], 'permissions.deny is untouched');
  check('A3.foreignModel', s.model, 'opus', 'unrelated top-level keys survive the merge');
  check('A3.allow', s.permissions.allow,
    ['Bash(git *)', 'mcp__semble_code__search', 'mcp__semble_code__find_related'],
    'the two tool names are appended after the existing allow entries');
  check('A3.counts', wantCounts(p, s), [1, 1, 1, 1, 1, 1],
    'exactly one semble entry per want row alongside the foreign ones');
}

// A4 — unparseable settings ABORTs and writes nothing
{
  const broken = '{ "hooks": { "PreToolUse": [ }\n';
  const p = freshProject({ settings: broken });
  const before = readRaw(settingsPath(p));
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('A4.exit', r.status, 1, 'merge into unparseable settings exits 1');
  check('A4.abort', (r.stdout + r.stderr).includes('ABORT'), true, 'the failure names ABORT');
  check('A4.bytes', readRaw(settingsPath(p)), before, 'the unparseable settings file is byte-identical afterwards');
}

// A5 — stale-path entries dropped, foreign kept
{
  const staleDir = '/old/elsewhere/.claude/hooks';
  const seed = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'node', args: [staleDir + '/semble-session.mjs'], timeout: 5 }] },
      ],
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: [staleDir + '/semble-reminder.mjs'], timeout: 5 }] },
        { matcher: 'Write', hooks: [{ type: 'command', command: 'node', args: ['/opt/foreign/other.mjs'], timeout: 2000 }] },
      ],
    },
  };
  const p = freshProject({ settings: JSON.stringify(seed, null, 2) + '\n' });
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('A5.exit', r.status, 0, 'merge over stale-path entries exits 0');
  const s = readSettings(p);
  const flat = Object.values(s.hooks).flat();
  check('A5.staleGone', flat.filter((e) => argsOf(e).some((a) => a.startsWith(staleDir))).length, 0,
    'zero entries still point at the old hooks dir');
  check('A5.counts', wantCounts(p, s), [1, 1, 1, 1, 1, 1], 'the new-dir entries were added exactly once each');
  check('A5.foreign', s.hooks.PreToolUse.filter((e) => argsOf(e).includes('/opt/foreign/other.mjs')).length, 1,
    'the foreign Write entry survived the stale-path purge');
  check('A5.reminderMigrated', s.hooks.PreToolUse.map((e) => e.matcher).sort(), ['Bash|Grep', 'Write'],
    'the v1 PreToolUse/Bash reminder row is REPLACED by the Bash|Grep row, not left beside it');
}

// A6 — uninstall leaves zero markers and prunes empty containers
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { session, prefetch: pre, stats, reminder: rem, subagent: sub } = semblePaths(p);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('A6.exit', r.status, 0, 'remove --part all exits 0');
  const s = readSettings(p);
  check('A6.hooksKey', Object.prototype.hasOwnProperty.call(s, 'hooks'), false,
    'the hooks object is deleted once every event array empties');
  check('A6.permissionsKey', Object.prototype.hasOwnProperty.call(s, 'permissions'), false,
    'the permissions object is deleted once allow empties');
  check('A6.files', [existsSync(session), existsSync(pre), existsSync(stats),
    existsSync(rem), existsSync(sub)], [false, false, false, false, false],
  'all five .mjs files are deleted');
  check('A6.rule', existsSync(join(p, '.claude', 'rules', 'semble-first.md')), false, 'the managed rule file is deleted');
}

// A7 — uninstall keeps foreign entries
{
  const p = freshProject({ settings: JSON.stringify(FOREIGN, null, 2) + '\n' });
  guidance(p, ['install', '--part', 'all', '--json']);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('A7.exit', r.status, 0, 'remove over foreign entries exits 0');
  const s = readSettings(p);
  check('A7.foreignHooks', s.hooks, FOREIGN.hooks, 'the foreign hooks object is restored exactly');
  check('A7.foreignAllow', s.permissions.allow, ['Bash(git *)'], 'only the two semble permission strings were removed');
  check('A7.foreignDeny', s.permissions.deny, ['Read(./.env)'], 'permissions.deny is still intact');
}

// A8 — status --json reflects the wiring
{
  const p = freshProject({});
  const before = guidance(p, ['status', '--json']);
  const b = safeParse(before.stdout);
  check('A8.beforeRule', b.rule.state, 'absent', 'status reports an absent rule before install');
  check('A8.beforeWired',
    [b.hooks.session.wired, b.hooks.prefetch.wired, b.hooks.stats.wired,
      b.hooks.reminder.wired, b.hooks.subagent.wired, b.permissions.wired],
    [false, false, false, false, false, false], 'nothing is reported as wired before install');
  guidance(p, ['install', '--part', 'all', '--json']);
  const after = guidance(p, ['status', '--json']);
  const a = safeParse(after.stdout);
  check('A8.afterRule', a.rule.state, 'managed', 'status reports the rule as managed after install');
  check('A8.afterClaudeMd', a.claudeMd.state, 'present', 'status reports the CLAUDE.md block as present');
  check('A8.afterWired',
    [a.hooks.session.wired, a.hooks.prefetch.wired, a.hooks.stats.wired,
      a.hooks.reminder.wired, a.hooks.subagent.wired, a.permissions.wired],
    [true, true, true, true, true, true],
    'session, prefetch, stats (both post-tool events), reminder, subagent and permissions all report wired');
  check('A8.afterFiles', [a.hooks.session.file, a.hooks.prefetch.file, a.hooks.stats.file,
    a.hooks.reminder.file, a.hooks.subagent.file],
  ['present', 'present', 'present', 'present', 'present'], 'status sees all five hook files on disk');
  check('A8.retired', a.hooks.retired, [], 'and no retired file is left behind');
  check('A8.stale', a.hooks.staleEntries, 0, 'no stale entries after a clean install');
  check('A8.wiredCount', [a.hooks.wiredCount, a.hooks.wantCount], [WANT_N, WANT_N],
    'all 6 settings entries are counted as wired');
  check('A8.exitReadOnly', before.status, 0, 'status exits 0');
}

// A9 — a half-wired install is reported honestly, never rounded up
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { prefetch: pre } = semblePaths(p);
  const s = readSettings(p);
  delete s.hooks.UserPromptSubmit;                    // the other rows stay wired
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('A9.wiredCount', [a.hooks.wiredCount, a.hooks.wantCount], [WANT_N - 1, WANT_N],
    'dropping the UserPromptSubmit entry reports 5 of 6, not "wired"');
  check('A9.prefetchWired', [a.hooks.session.wired, a.hooks.stats.wired, a.hooks.prefetch.wired],
    [true, true, false], 'only the prefetch entry is reported as unwired');
  check('A9.prefetchFileStillThere', [a.hooks.prefetch.file, existsSync(pre)], ['present', true],
    'the file is still on disk — file presence and wiring are reported separately');
  const human = guidance(p, ['status']).stdout;
  check('A9.human', human.includes('hooks 5/6 wired'), true,
    'the human line spells the partial count out as 5/6');
}

// A10 — remove takes the prefetch registration with the file
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'hooks', '--json']);
  const { prefetch: pre } = semblePaths(p);
  const r = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('A10.exit', r.status, 0, 'remove --part hooks exits 0');
  const s = readSettings(p);
  check('A10.registrationGone', Object.prototype.hasOwnProperty.call(s.hooks || {}, 'UserPromptSubmit'), false,
    'the UserPromptSubmit array emptied and its key was pruned');
  check('A10.fileGone', existsSync(pre), false, 'the prefetch .mjs is deleted too');
  check('A10.noDanglingPath',
    JSON.stringify(s).includes('semble-prefetch.mjs'), false,
    'no settings entry is left pointing at the deleted file');
}

// ═══════════════════════════════════════════════════════════════════════════
// B. rule file policy
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'rule', '--json']);
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  check('B1.created', readRaw(rulePath), TPL_TEXT,
    'a fresh rule file is the plugin template, byte for byte');
  check('B1.stamped', metaOf(readRaw(rulePath)),
    {
      doc_type: 'llm', version: `"${PLUGIN_VERSION}"`,
      generated_by: '"brewcode:semble-setup"', last_updated: null,
    },
    'the stamp is the one baked at release; the installer writes nothing of its own');

  const edited = TPL_TEXT + '\n<!-- my own note -->\n';
  writeFileSync(rulePath, edited);
  const r = guidance(p, ['install', '--part', 'rule', '--json']);
  check('B2.noClobber', readRaw(rulePath), edited, 'a user-modified rule is never blind-overwritten');
  check('B2.exit', r.status, 0, 'the no-clobber path still exits 0');
  check('B2.reported', safeParse(r.stdout).skipped.length, 1, 'the user_modified rule is reported as skipped');
  const st = safeParse(guidance(p, ['status', '--json']).stdout);
  check('B2.status', st.rule.state, 'user_modified', 'status reports user_modified');

  const rf = guidance(p, ['install', '--part', 'rule', '--force', '--json']);
  check('B3.forced', readRaw(rulePath), TPL_TEXT, '--force restores the template byte for byte');
  check('B3.stampKept', metaOf(readRaw(rulePath)).last_updated, null,
    '--force writes no install-time last_updated; the copy stays byte-identical');
  check('B3.exit', rf.status, 0, 'the forced overwrite exits 0');
  const backups = readdirSync(join(p, '.claude', 'rules')).filter((f) => f.startsWith('semble-first.md.bak.'));
  check('B3.backup', backups.length, 1, 'the overwritten user version was backed up first');
  check('B3.noTempLeft', readdirSync(join(p, '.claude', 'rules')).some((f) => f.includes('.rendered.')), false,
    'the render temp file never survives an install');
}

// B5. --force restores the template byte for byte. The rule is a byte copy, so a locally
// chosen doc_type and any extra frontmatter key go with the prose -- they survive only in the
// backup. Preserving them would break the byte identity setup-status's `cmp` depends on.
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'rule', '--json']);
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  const tailored = readRaw(rulePath)
    .replace(/^doc_type: llm$/m, 'doc_type: user')
    .replace(/^description: /m, 'owner: docs-team\ndescription: ') + '\n<!-- my own note -->\n';
  writeFileSync(rulePath, tailored);
  const st = safeParse(guidance(p, ['status', '--json']).stdout);
  check('B5.userModified', st.rule.state, 'user_modified', 'the tailored rule is user_modified on prose, not on its stamp');
  guidance(p, ['install', '--part', 'rule', '--force', '--json']);
  const after = readRaw(rulePath);
  check('B5.byteIdentical', after, TPL_TEXT, '--force restores the template byte for byte');
  check('B5.docTypeReset', metaOf(after).doc_type, 'llm', 'a locally chosen doc_type is replaced, not carried across');
  check('B5.unknownKeyDropped', /^owner: docs-team$/m.test(after), false,
    'frontmatter keys the template does not define go with the rest of the file');
  const bak = readdirSync(join(p, '.claude', 'rules')).filter((f) => f.startsWith('semble-first.md.bak.'));
  check('B5.backup', bak.length, 1, 'the replaced file was backed up first');
  check('B5.backupIsTheUserFile', readRaw(join(p, '.claude', 'rules', bak[0])), tailored,
    'the backup holds the user version verbatim, local frontmatter included');
}

// B6. A rule installed by an older version of this skill carries an installer-written
// `last_updated` and, after a release, an older `version`. The four metadata keys are stripped
// from both sides before the managed verdict, and the file is re-synced to the plugin bytes
// without --force and without a backup.
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'rule', '--json']);
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  writeFileSync(rulePath, readRaw(rulePath)
    .replace(/^version: .*$/m, 'version: "4.0.0"')
    .replace(/^(generated_by: .*)$/m, '$1\nlast_updated: "2020-01-01"'));
  const st = safeParse(guidance(p, ['status', '--json']).stdout);
  check('B6.stillManaged', st.rule.state, 'managed', 'a legacy stamp on unchanged prose is still a managed rule');
  const r = guidance(p, ['install', '--part', 'rule', '--json']);
  check('B6.reSynced', readRaw(rulePath), TPL_TEXT, 'the legacy stamp is re-synced to the plugin bytes without --force');
  check('B6.reportedChanged', safeParse(r.stdout).changed.length, 1, 'the re-sync is reported as a change, not as unchanged');
  check('B6.noBackup', readdirSync(join(p, '.claude', 'rules')).filter((f) => f.startsWith('semble-first.md.bak.')).length, 0,
    'a metadata-only re-sync takes no backup: nothing of the user\'s was overwritten');
}

// Template content — the three facts that make every generated call work
{
  check('B4.repoRequired', TPL_TEXT.includes('`repo` is REQUIRED on both tools'), true,
    'the rule teaches that repo is required on both tools');
  check('B4.absolute', TPL_TEXT.includes('**absolute path of the project root**'), true,
    'the rule teaches that repo is an absolute project-root path');
  check('B4.startEnd', TPL_TEXT.includes('There is no `line` field —'), true,
    'the rule states there is no line field on a result');
  check('B4.fields', TPL_TEXT.includes('`file_path`, `start_line`, `end_line`, `score`'), true,
    'the rule lists the exact result fields');
  check('B4.rgKept', TPL_TEXT.includes('## Keep using rg / Grep for'), true,
    'the rule preserves exact rg/Grep usage');
  check('B4.noWatcher', TPL_TEXT.includes('Semble has no background watcher.'), true,
    'the rule denies the non-existent watcher');
}

// ═══════════════════════════════════════════════════════════════════════════
// J. .sembleignore — same managed-file policy as the rule, no frontmatter
//
// semble 0.5.4 (index/file_walker.py:_load_ignore_for_dir) reads exactly two
// files per directory, ./.gitignore and ./.sembleignore, and nothing else — no
// core.excludesFile, no ~/.gitignore_global, no call to git. A repo-root
// .sembleignore is therefore the ONLY way to keep a globally-ignored tree such
// as .claude/ out of the index. Measured on this repo: 871 -> 590 indexed files.
// ═══════════════════════════════════════════════════════════════════════════
const IGNORE_TPL_TEXT = readFileSync(join(ASSETS, 'sembleignore.template'), 'utf8');
{
  const p = freshProject({});
  const ignorePath = join(p, '.sembleignore');
  const r = guidance(p, ['install', '--part', 'ignore', '--json']);
  check('J1.exit', r.status, 0, 'install --part ignore exits 0');
  check('J1.created', readRaw(ignorePath), IGNORE_TPL_TEXT,
    'the ignore file is byte-identical to the template — it carries no frontmatter to stamp');
  check('J1.reported', safeParse(r.stdout).changed.length, 1, 'the creation is reported as exactly one change');
  check('J1.status', safeParse(guidance(p, ['status', '--json']).stdout).ignore,
    { state: 'managed', path: ignorePath }, 'status reports it managed, at the repo root');

  const rr = guidance(p, ['install', '--part', 'ignore', '--json']);
  check('J1.idempotent', [rr.status, safeParse(rr.stdout).changed.length, safeParse(rr.stdout).unchanged.length],
    [0, 0, 1], 'a second install is an honest no-op, reported as unchanged');
}
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'ignore', '--json']);
  const ignorePath = join(p, '.sembleignore');
  const edited = IGNORE_TPL_TEXT + '\n# my own exclusion\nfixtures/\n';
  writeFileSync(ignorePath, edited);
  const r = guidance(p, ['install', '--part', 'ignore', '--json']);
  check('J2.noClobber', readRaw(ignorePath), edited,
    'a user-edited .sembleignore is never blind-overwritten — the user may have excluded something deliberately');
  check('J2.exit', r.status, 0, 'the no-clobber path still exits 0');
  check('J2.reported', safeParse(r.stdout).skipped.length, 1, 'and it is reported as skipped, not as unchanged');
  check('J2.status', safeParse(guidance(p, ['status', '--json']).stdout).ignore.state, 'user_modified',
    'status reports user_modified');

  const rf = guidance(p, ['install', '--part', 'ignore', '--force', '--json']);
  check('J3.forced', readRaw(ignorePath), IGNORE_TPL_TEXT, '--force regenerates the template');
  check('J3.exit', rf.status, 0, 'the forced overwrite exits 0');
  check('J3.backup', readdirSync(p).filter((f) => f.startsWith('.sembleignore.bak.')).length, 1,
    'the overwritten user version was backed up first');
}
// ═══════════════════════════════════════════════════════════════════════════
// J3. measured per-repo candidates
//
// The template's per-repo section ships EMPTY and no static pattern can fill
// it: duplicate trees and corpus hogs are layout-specific. install measures the
// repo and writes what it found - commented out. Excluding something the user
// wanted indexed is the worse error, because it fails silently.
// ═══════════════════════════════════════════════════════════════════════════
{
  const BEGIN = '# --- brewcode:semble measured candidates ---';
  const END = '# --- end brewcode:semble measured candidates ---';
  const ON = { SEMBLE_NO_CANDIDATES: '' };

  // A repo with one honest source tree and one byte-identical mirror of it.
  const p = freshProject({});
  const ignorePath = join(p, '.sembleignore');
  for (const d of ['src', '.mirror']) mkdirSync(join(p, d), { recursive: true });
  for (let i = 0; i < 8; i++) {
    const body = `export function f${i}() { return ${i}; }\n`.repeat(40);
    writeFileSync(join(p, 'src', `m${i}.mjs`), body);
    writeFileSync(join(p, '.mirror', `m${i}.mjs`), body);   // byte-identical copy
  }
  // And one prose file big enough to be a corpus hog on its own.
  writeFileSync(join(p, 'CHANGELOG.md'), '- a release note line\n'.repeat(4000));

  const r = guidance(p, ['install', '--part', 'ignore', '--json'], ON);
  const text = readRaw(ignorePath);
  const lines = text.split('\n');
  const bi = lines.indexOf(BEGIN);
  const ei = lines.indexOf(END);
  const body = lines.slice(bi + 1, ei);
  check('J3.exit', r.status, 0, 'the annotated install exits 0');
  check('J3.blockPresent',
    [lines.filter((l) => l === BEGIN || l === END), body.filter((l) => l.startsWith('# /')).length],
    [[BEGIN, END], 2],
    'exactly one BEGIN then one END delimit the block, with both measured proposals between them');
  check('J3.mirror', body.some((l) => l.startsWith('# /.mirror/') && l.includes('duplicate-tree')), true,
    'the byte-identical mirror tree is proposed, and named as a duplicate tree');
  check('J3.notSrc', body.some((l) => l.startsWith('# /src/')), false,
    'the ORIGINAL tree is never proposed - excluding it would delete the repo from the corpus');
  check('J3.heavyFile', body.some((l) => l.startsWith('# /CHANGELOG.md') && l.includes('heavy-file')), true,
    'the one prose file carrying a large share of the corpus is proposed too');
  check('J3.allCommented', body.filter((l) => l.trim() && !l.startsWith('#')), [],
    'EVERY proposal is commented out - the scan proposes, it never excludes');
  check('J3.reported', safeParse(r.stdout).changed.some((l) => l.startsWith('candidates: 2 measured proposal')), true,
    'the report says how many proposals were written, and that they are inert');
  check('J3.evidence', body.filter((l) => l.startsWith('# /')).every((l) => /\d/.test(l)), true,
    'every proposal carries its measurement, so the user can judge it instead of trusting it');

  // The block must not make the file look user-modified, or no template update
  // could ever reach an annotated install again.
  check('J3.stillManaged', safeParse(guidance(p, ['status', '--json'], ON).stdout).ignore.state, 'managed',
    'an annotated .sembleignore is still managed - the block is stripped before the comparison');

  const r2 = guidance(p, ['install', '--part', 'ignore', '--json'], ON);
  check('J3.idempotent', readRaw(ignorePath), text,
    'a second install re-proposes nothing and rewrites nothing');
  check('J3.idempotentReport', safeParse(r2.stdout).changed.filter((l) => l.startsWith('candidates:')), [],
    'and it does not claim to have written proposals it did not write');

  // A decision the user made inside the block survives, uncommented, forever.
  const decided = readRaw(ignorePath).replace('# /.mirror/', '/.mirror/');
  writeFileSync(ignorePath, decided);
  const r3 = guidance(p, ['install', '--part', 'ignore', '--json'], ON);
  check('J3.decisionKept', readRaw(ignorePath).includes('\n/.mirror/'), true,
    'an uncommented decision inside the block is never re-commented or dropped');
  check('J3.noDuplicate', (readRaw(ignorePath).match(/\/\.mirror\//g) || []).length, 1,
    'and the path is never proposed a second time next to the decision the user already made');
  check('J3.decidedManaged', safeParse(guidance(p, ['status', '--json'], ON).stdout).ignore.state, 'managed',
    'a user decision inside the block still leaves the file managed');
  check('J3.exit3', r3.status, 0, 'the run over a decided block exits 0');

  // A user edit OUTSIDE the block is a real user_modified file: install skips it,
  // and the annotator must not sneak a write in behind that skip.
  const p2 = freshProject({});
  guidance(p2, ['install', '--part', 'ignore', '--json'], ON);
  const edited = `${readRaw(join(p2, '.sembleignore'))}\n# mine\nfixtures/\n`;
  writeFileSync(join(p2, '.sembleignore'), edited);
  const r4 = guidance(p2, ['install', '--part', 'ignore', '--json'], ON);
  check('J3.noClobber', readRaw(join(p2, '.sembleignore')), edited,
    'a user-modified .sembleignore is not annotated either - the skip means skip');
  check('J3.noClobberExit', r4.status, 0, 'and that run still exits 0');

  // A repo with nothing worth proposing gets no block at all.
  const p3 = freshProject({});
  writeFileSync(join(p3, 'only.mjs'), 'export const x = 1;\n');
  guidance(p3, ['install', '--part', 'ignore', '--json'], ON);
  check('J3.emptyNoBlock', readRaw(join(p3, '.sembleignore')).includes(BEGIN), false,
    'a repo with no duplicate tree and no hog gets no block - an empty section is noise');
  check('J3.emptyByteIdentical', readRaw(join(p3, '.sembleignore')), IGNORE_TPL_TEXT,
    'and that file stays byte-identical to the template');
}

{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const ignorePath = join(p, '.sembleignore');
  check('J4.installedByAll', existsSync(ignorePath), true, '--part all installs the ignore file too');
  const r = guidance(p, ['remove', '--part', 'ignore', '--json']);
  check('J4.removeExit', r.status, 0, 'remove --part ignore exits 0');
  check('J4.gone', existsSync(ignorePath), false, 'and the file is really gone');
  check('J4.status', safeParse(guidance(p, ['status', '--json']).stdout).ignore.state, 'absent',
    'status agrees it is absent again');
}
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const ignorePath = join(p, '.sembleignore');
  writeFileSync(ignorePath, IGNORE_TPL_TEXT + '\n# mine\n');
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  // Same contract as the rule file: uninstall leaves nothing behind, but it
  // never destroys an edit — the user's version is copied aside first.
  check('J5.gone', existsSync(ignorePath), false, 'uninstall removes the ignore file even when it was edited');
  check('J5.backup', readdirSync(p).filter((f) => f.startsWith('.sembleignore.bak.')).length, 1,
    'the edited version was backed up before removal');
  check('J5.reported', safeParse(r.stdout).changed.some((s) => s.startsWith('ignore: removed user-modified')), true,
    'and the report says the removed file was user-modified, naming the backup');
}
// J6 — the template content is the fix, so assert what it actually excludes.
{
  const has = (line) => new RegExp('^' + line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm').test(IGNORE_TPL_TEXT);
  check('J6.tmp', has('.claude/tmp/'), true,
    '.claude/tmp/ is excluded — 214 of this repo\'s 871 indexed files were vendored upstream copies living there');
  check('J6.reports', has('.claude/reports/'), true, '.claude/reports/ is excluded — generated agent output, not source');
  check('J6.projectAuthoredKept',
    ['.claude/skills/', '.claude/agents/', '.claude/rules/', '.claude/commands/', '.claude/hooks/'].map(has),
    [false, false, false, false, false],
    'nothing project-authored under .claude/ is excluded: hiding something the user wanted found is the worse error');
  check('J6.noDefaults', ['node_modules/', '.venv/', 'dist/', '__pycache__/'].map(has), [false, false, false, false],
    'semble\'s own _DEFAULT_IGNORED_DIRS are not repeated — only what it misses');
  check('J6.mechanism', IGNORE_TPL_TEXT.includes('_load_ignore_for_dir'), true,
    'the file names the exact upstream function that reads it, so the claim can be re-verified');
}

// J7 — the negation-bypass blocks.
//
// file_walker.py:_is_ignored sets `found = not ignored and Path(pat).suffix`,
// and _walk yields on `found or suffix in extensions`. So a `!` un-ignore whose
// text ends in an extension SKIPS the extension filter, and a suffix that
// belongs to no content type gets indexed anyway. Verified against semble 0.5.4:
// with `.gitignore` = `package-lock.json / !sub/package-lock.json / *.png /
// !keep.png`, walk_files(root, get_extensions([CODE])) returned
// ['a.py', 'keep.png', 'sub/package-lock.json'] — .png and .json are in NO
// bucket. Measured cost on this repo: 552 chunks of lockfile (5.9% of the whole
// index, and the only .json in it) plus 143 chunks of decoded PNG.
//
// The cure is a re-ignore here, and it works because _load_ignore_for_dir
// concatenates .gitignore lines FIRST and .sembleignore lines SECOND into one
// GitIgnoreSpec while _is_ignored keeps the LAST match. Re-verified: adding
// `*.png` + `package-lock.json` to .sembleignore reduced the same walk to
// ['a.py', 'w.yml'].
{
  const lines = IGNORE_TPL_TEXT.split('\n').map((l) => l.trim());
  const active = lines.filter((l) => l !== '' && !l.startsWith('#'));
  const has = (pat) => active.includes(pat);

  check('J7.binaries', ['*.png', '*.jpg', '*.pdf', '*.woff2', '*.zip', '*.so', '*.sqlite'].map(has),
    [true, true, true, true, true, true, true],
    'binary suffixes are re-ignored: against a plain .gitignore this is a no-op, against a negation it is the only lever');
  check('J7.lockfiles', ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'go.sum'].map(has),
    [true, true, true, true, true],
    'lockfiles are re-ignored — one of them was 5.9% of this workspace index');
  check('J7.pnpmReason', has('pnpm-lock.yaml'), true,
    'pnpm-lock.yaml especially: it is a .yaml, so unlike the others it reaches the config bucket with no bypass at all');

  // A `!` line in OUR OWN template would re-open the exact hole the two blocks
  // above close, and it would win, being last.
  check('J7.noNegation', active.filter((l) => l.startsWith('!')), [],
    'the template contains no `!` un-ignore: one would re-open the bypass and, being last, would beat every rule above it');

  check('J7.explains', ['_is_ignored', 'found'].map((s) => IGNORE_TPL_TEXT.includes(s)), [true, true],
    'the bypass is named in the file, not just worked around silently');
}

// J8 — the per-repo section ships EMPTY.
//
// Duplicate mirror trees (2202 chunks / 15 of 80 result slots here) and long
// changelogs (503 chunks / 9 of 80) were the two biggest wins in the round-2
// measurement, and neither is generic: the generic form of "this tree is a copy
// of that tree" is content-hash dedup, not a filename, and a changelog is the
// right answer to "when did X land". Shipping either pre-filled would exclude
// something a user wanted indexed — the failure mode this template exists to
// avoid, and a silent one. They are documented instead, as commented guidance.
{
  const active = IGNORE_TPL_TEXT.split('\n').map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  check('J8.noRepoSpecific',
    ['.codex/', '/skills/', 'RELEASE-NOTES.md', 'CHANGELOG.md', 'docs/'].filter((p) => active.includes(p)),
    [],
    'nothing layout-specific to any one repo is shipped active — .codex/ is another agent runtime\'s directory, exactly as authored as .claude/skills/');
  check('J8.documented',
    ['DUPLICATE TREES', 'LONG CHANGELOGS'].map((s) => IGNORE_TPL_TEXT.includes(s)),
    [true, true],
    'both are explained in the per-repo section instead, with the measured cost, so the user can opt in knowingly');
  check('J8.recipe', IGNORE_TPL_TEXT.includes('semble-project.sh candidates'), true,
    'and the section names the command that measures the user\'s own offenders, instead of a snippet they have to run by hand');
  check('J8.proposalsOnly', IGNORE_TPL_TEXT.includes('COMMENTED OUT'), true,
    'the section states outright that measured proposals exclude nothing until the user uncomments one');
  check('J8.anchoring', IGNORE_TPL_TEXT.includes('/skills/` hits only'), true,
    'root-anchoring is spelled out: `skills/` would match every */skills/ in the repo, which is the dangerous default');
}

// ═══════════════════════════════════════════════════════════════════════════
// C. CLAUDE.md marker block
// ═══════════════════════════════════════════════════════════════════════════
const BEGIN = '<!-- BEGIN brewcode:semble -->';
const END = '<!-- END brewcode:semble -->';
{
  const pre = '# CLAUDE.md\n\n## Overview\n\nproject text\n';
  const p = freshProject({ claudeMd: pre });
  const md = join(p, 'CLAUDE.md');
  guidance(p, ['install', '--part', 'claudemd', '--json']);
  const once = readRaw(md);
  check('C1.begin', once.split(BEGIN).length - 1, 1, 'exactly one BEGIN marker after insert');
  check('C1.end', once.split(END).length - 1, 1, 'exactly one END marker after insert');
  check('C1.kept', once.startsWith(pre.replace(/\s*$/, '')), true, 'the pre-existing content is kept verbatim at the top');
  // `.html`/`.htm` ARE indexed — semble's files.py maps them to the docs bucket.
  // The old line claimed otherwise and sent users to rg for a corpus semble
  // already had. The rule template and assets/INSTALL.md carry the same fix.
  check('C1.body', once.includes('> Not indexed: `.json`/`.csv`, `.mdx`/`.txt`. Details: `.claude/rules/semble-first.md`.'), true,
    'the block carries the verbatim last line of the design body, with .html absent from the not-indexed list');
  check('C1.htmlNotClaimedMissing', /Not indexed:[^\n]*\.html/.test(once), false,
    'no variant of the line may still call .html unindexed');

  const r2 = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const twice = readRaw(md);
  check('C2.idempotent', twice, once, 're-insert replaces the marked range in place, byte-identical');
  check('C2.begin', twice.split(BEGIN).length - 1, 1, 'still exactly one BEGIN after re-insert');
  check('C2.unchanged', safeParse(r2.stdout).unchanged.length, 1, 're-insert reports unchanged');

  guidance(p, ['remove', '--part', 'claudemd', '--json']);
  check('C3.restored', readRaw(md), pre, 'remove restores the pre-insert bytes exactly');
}

// C4 — malformed marker block changes nothing
{
  const bad = '# CLAUDE.md\n\n<!-- BEGIN brewcode:semble -->\n## Code Search\n';
  const p = freshProject({ claudeMd: bad });
  const r = guidance(p, ['install', '--part', 'claudemd', '--json']);
  check('C4.bytes', readRaw(join(p, 'CLAUDE.md')), bad, 'a half-marked CLAUDE.md is left byte-identical');
  check('C4.exit', r.status, 0, 'the malformed-marker path is non-fatal');
  check('C4.skipped', safeParse(r.stdout).skipped.length, 1, 'the malformed marker block is reported as skipped');
}

// ═══════════════════════════════════════════════════════════════════════════
// D. SessionStart hook — all 7 rows of the decision table
// ═══════════════════════════════════════════════════════════════════════════
function session(proj, extra) {
  return runNode(SESSION_SRC, JSON.stringify({
    session_id: 'S1', cwd: proj, hook_event_name: 'SessionStart', source: 'startup', ...(extra || {}),
  }));
}
{
  const p = freshProject({});
  const r = session(p);
  check('D1.missing', safeParse(r.stdout), {}, 'no state file -> total silence');
  check('D1.exit', r.status, 0, 'exit 0 with no state file');
}
{
  const p = freshProject({ state: '{,}' });
  const r = session(p);
  check('D2.corrupt', safeParse(r.stdout),
    { systemMessage: 'semble: state file is corrupt — run /brewcode:semble-setup status' },
    'unparseable state -> corrupt systemMessage');
  check('D2.exit', r.status, 0, 'exit 0 on corrupt state');
}
{
  const p = freshProject({ state: READY_STATE({ enabled: false }) });
  check('D3.enabledFalse', safeParse(session(p).stdout), { systemMessage: 'semble: disabled for this project' },
    'enabled:false -> disabled message');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'disabled' }) });
  check('D4.phaseDisabled', safeParse(session(p).stdout), { systemMessage: 'semble: disabled for this project' },
    'phase disabled -> disabled message');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'awaiting_reload' }) });
  check('D5.awaitingReload', safeParse(session(p).stdout), {
    systemMessage: 'semble: awaiting reload — run /brewcode:semble-setup resume',
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        'semble_code MCP is registered but not verified yet. It is usable now — mcp__semble_code__search (repo=' +
        p + ', top_k=5, max_snippet_lines=10); the first call rebuilds the index and may take minutes. ' +
        'Run /brewcode:semble-setup resume to close the state out.',
    },
  }, 'awaiting_reload -> the tool is advertised as usable now, plus the resume close-out');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'error' }) });
  check('D6.error', safeParse(session(p).stdout), { systemMessage: 'semble: error — run /brewcode:semble-setup status' },
    'phase error -> error message');
}
{
  const p = freshProject({ state: READY_STATE() });
  check('D7.ready', safeParse(session(p).stdout), {
    systemMessage: 'semble: ready | cache abcdef01',
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        'semble: use ONE mcp__semble_code__search first (repo=' + p +
        ', top_k=5, max_snippet_lines=10), then open the hit at start_line. rg stays for exact/exhaustive matching.',
    },
  }, 'ready -> cache hash prefix 8 plus the usage directive with the absolute repo path');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'verifying' }) });
  check('D8.other', safeParse(session(p).stdout), { systemMessage: 'semble: verifying' },
    'any other phase -> plain phase message');
}
{
  const p = freshProject({ stateDir: true });
  const r = session(p);
  check('D9.stateIsDir', r.status, 0, 'exit 0 when state.json is a directory');
  check('D9.stateDirOut', safeParse(r.stdout),
    { systemMessage: 'semble: state file is corrupt — run /brewcode:semble-setup status' },
    'a directory in place of state.json reports corrupt');
}
{
  const bad = runNode(SESSION_SRC, 'not json at all');
  const empty = runNode(SESSION_SRC, '');
  check('D10.badStdin', [bad.status, safeParse(bad.stdout)], [0, {}], 'session hook: malformed stdin -> {} exit 0');
  check('D10.emptyStdin', [empty.status, safeParse(empty.stdout)], [0, {}], 'session hook: empty stdin -> {} exit 0');
}

// ═══════════════════════════════════════════════════════════════════════════
// P. UserPromptSubmit prefetch — the hook that replaced the two advisory ones
//
// The predecessors emitted `additionalContext` telling the model to prefer
// semble. They converted at ZERO — 0/18 on the main channel, 0/11 on the
// Explore/subagent channel — with delivery proven three independent ways. This
// hook runs the search itself and hands over the RESULT instead: 5/6 sessions
// opened an injected path, at fewer tool calls than control in 5/6 questions.
//
// FAIL-OPEN is the property under test above all others: this runs on every
// prompt the user types, so it is tested by breaking things, not by asserting
// the happy path. Every row below must end in `{}` on stdout and exit 0.
// ═══════════════════════════════════════════════════════════════════════════

// ── telemetry readers (shared with the session hook further down) ───────────
const telemetryFile = (p) => join(p, '.claude', 'semble', 'telemetry.jsonl');
const telemetry = (p) =>
  (existsSync(telemetryFile(p)) ? readFileSync(telemetryFile(p), 'utf8') : '')
    .split('\n').filter((l) => l).map((l) => JSON.parse(l));
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const dropTs = (r) => { const { ts, ...rest } = r; return rest; };
/** Same, minus the wall-clock `ms` — a duration cannot be asserted exactly. */
const dropMs = (r) => { const { ms, ...rest } = dropTs(r); return rest; };
/**
 * Telemetry record #i without its ts — or, when the fixture stopped producing
 * that record, a readable diagnostic INSTEAD of a TypeError. A throw here kills
 * the whole runner before it prints a single result, so a stale fixture used to
 * take every later assertion in the file down with it.
 */
const trec = (p, i) => {
  const recs = telemetry(p);
  if (i < recs.length) return dropTs(recs[i]);
  return 'MISSING telemetry record #' + i + ' — the fixture produced '
    + recs.length + ' record(s): ' + JSON.stringify(recs.map((r) => r.ev + (r.why ? ':' + r.why : '')));
};
/** Field `k` of telemetry record #i, or the same diagnostic string. */
const tfield = (p, i, k) => { const r = trec(p, i); return typeof r === 'string' ? r : r[k]; };

// ── a stub `uvx` — the only way to exercise the search without a real index ──
// It records its argv (so the frozen flag set is observable), optionally
// sleeps past the hook's 3 s child cap, then prints SEMBLE_STUB_OUT and exits
// SEMBLE_STUB_RC.
const STUB_BIN = join(BASE, 'stub-bin');
mkdirSync(STUB_BIN, { recursive: true });
const STUB_UVX = join(STUB_BIN, 'uvx');
writeFileSync(STUB_UVX, [
  '#!/usr/bin/env bash',
  'printf "%s\\n" "$*" >> "$SEMBLE_STUB_LOG"',
  // The env the child is handed, recorded separately from argv: the cache root
  // is passed by environment, not by flag, and it is the one thing that has to
  // agree with the MCP registration.
  'printf "%s\\n" "${SEMBLE_CACHE_LOCATION-<unset>}" >> "$SEMBLE_STUB_ENVLOG"',
  'if [ -n "${SEMBLE_STUB_SLEEP:-}" ]; then sleep "$SEMBLE_STUB_SLEEP"; fi',
  'printf "%s" "${SEMBLE_STUB_OUT:-}"',
  'exit "${SEMBLE_STUB_RC:-0}"',
  '',
].join('\n'));
chmodSync(STUB_UVX, 0o755);

// `content` is in the fixture on purpose: the hook asks for
// --max-snippet-lines 0, but if a future semble ever returns a snippet anyway
// it must still never reach the model.
const HIT = (file_path, start_line) =>
  ({ file_path, start_line, end_line: start_line + 8, score: 0.81, content: 'SNIPPET-MUST-NOT-SHIP' });
const STUB_HITS = JSON.stringify({
  query: 'q',
  results: [HIT('src/store/session.ts', 41), HIT('src/hooks/prefetch.mjs', 12), HIT('docs/design.md', 3)],
});

// The measured framing, written out here in full ON PURPOSE: provenance, bare
// paths, directive. Any edit to the hook's wording has to be made twice, and
// the second time is this line — which is where the 5/6-conversion evidence is
// recorded.
const RENDERED = [
  'Retrieval note (automatic, from a semantic index of THIS repository, built by semble over the working tree).',
  'These candidate locations were ranked for the question above before you started:',
  '  1. src/store/session.ts:41',
  '  2. src/hooks/prefetch.mjs:12',
  '  3. docs/design.md:3',
  '',
  'Open the candidates that look right BEFORE running any search of your own; they are already ranked.',
  'If none of them answers the question, say so and search normally.',
  'Name the file you actually used in your answer.',
].join('\n');
const PREFETCH_OK = {
  hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: RENDERED },
};

/** A prompt that passes gate v3: INTENT (`how`) + DOMAIN (`hook`), no suppressor. */
const Q = 'how does the session hook decide what to emit';
/** and the distiller's deterministic output for it. */
const Q_DISTILLED = 'session hook decide emit';

const allPrefetchOutputs = [];
let stubSeq = 0;
/**
 * @param opts {out, rc, sleep, path, stdin, extra} — every field is a way to
 * break the hook. Returns the stub's recorded argv lines as `argv`, so
 * "the search was never spawned" is a direct assertion, not an inference.
 */
function prefetch(proj, prompt, opts) {
  const o = opts || {};
  stubSeq++;
  const log = join(BASE, `uvx-${stubSeq}.log`);
  const envLog = join(BASE, `uvx-${stubSeq}.env`);
  const payload = {
    session_id: 'S1', cwd: proj, hook_event_name: 'UserPromptSubmit', prompt, ...(o.extra || {}),
  };
  const r = spawnSync(process.execPath, [PREFETCH_SRC], {
    input: Object.prototype.hasOwnProperty.call(o, 'stdin') ? o.stdin : JSON.stringify(payload),
    encoding: 'utf8',
    cwd: BASE,
    timeout: 20000,
    env: {
      ...process.env,
      PATH: Object.prototype.hasOwnProperty.call(o, 'path') ? o.path : `${STUB_BIN}:${process.env.PATH}`,
      SEMBLE_STUB_LOG: log,
      SEMBLE_STUB_ENVLOG: envLog,
      SEMBLE_STUB_OUT: Object.prototype.hasOwnProperty.call(o, 'out') ? o.out : STUB_HITS,
      SEMBLE_STUB_RC: String(o.rc === undefined ? 0 : o.rc),
      SEMBLE_STUB_SLEEP: o.sleep === undefined ? '' : String(o.sleep),
    },
  });
  const out = {
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    status: r.status,
    argv: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l) : [],
    cacheEnv: existsSync(envLog) ? readFileSync(envLog, 'utf8').split('\n').filter((l) => l) : [],
  };
  allPrefetchOutputs.push(out.stdout);
  return out;
}

const markerOf = (p) => {
  const f = join(p, '.claude', 'semble', '.prefetch-ts');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};

const {
  gateV3, distill, PIN_SPEC, CONTENT_ARGS, THROTTLE_MS, COOLDOWN_MS, TIMEOUT_COOLDOWN_MS,
  INDEX_FILES, cacheRootOf, defaultCacheRoot, indexReady, repoHashOf,
} = await import(pathToFileURL(PREFETCH_SRC).href);

// P1 — the whole point of the release: a ranked list of paths, and nothing else.
{
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, Q);
  check('P1.fires', safeParse(r.stdout), PREFETCH_OK,
    'a gate-passing prompt on a ready project gets the exact provenance+paths+directive block');
  check('P1.exit', r.status, 0, 'the emitting path exits 0');
  check('P1.noSnippet', r.stdout.includes('SNIPPET-MUST-NOT-SHIP'), false,
    'a snippet in the search result never reaches the model — 2/6 sessions answered off snippets with ZERO tool calls');
  check('P1.marker', typeof (markerOf(p) || {}).t, 'number', 'a successful firing stamps the throttle marker');
  check('P1.noCool', Object.prototype.hasOwnProperty.call(markerOf(p) || {}, 'cool'), false,
    'and never the failure cooldown');
  check('P1.telemetryKeys', telemetry(p).map((x) => Object.keys(x)),
    [['ts', 'ev', 'src', 'sid', 'fired', 'why', 'q', 'n', 'ms', 'paths']],
    'exactly one record, with exactly the contracted keys in order');
  check('P1.record', dropMs(telemetry(p)[0]), {
    ev: 'prefetch', src: 'prefetch', sid: 'S1', fired: true, why: 'behaviour-or-vocab',
    q: Q_DISTILLED, n: 3, paths: ['src/store/session.ts', 'src/hooks/prefetch.mjs', 'docs/design.md'],
  }, 'the record carries the injected PATHS — that array is the conversion denominator');
  check('P1.ms', typeof telemetry(p)[0].ms, 'number', 'and a numeric duration');
  check('P1.iso', ISO_RE.test(telemetry(p)[0].ts), true, 'the ts is an ISO-8601 instant');
}

// P2 — the frozen search invocation. semble keys its cache by project path
// ALONE but rejects an index whose content-type set differs, so a mismatch here
// makes the hook and the MCP server evict each other's index on every alternation.
{
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, Q);
  check('P2.argv', r.argv, [
    `--from semble[mcp]==0.5.4 semble search --content code docs config -k 3 --max-snippet-lines 0 -- ${Q_DISTILLED} ${p}`,
  ], 'the child is spawned exactly once, with the pinned spec, the frozen flags, then `--` and the'
    + ' distilled query — options before the separator, because argparse stops reading flags at it');
  const lib = readFileSync(REAL_LIB, 'utf8');
  check('P2.pinParity', PIN_SPEC, 'semble[mcp]==' + (/^SEMBLE_PIN_VERSION="\$\{SEMBLE_PIN_VERSION:-([^}"]+)\}"/m.exec(lib) || [])[1],
    'PIN_SPEC equals the pin the MCP registration uses');
  check('P2.contentParity', CONTENT_ARGS.join(' '), (/^SEMBLE_CONTENT_ARGS="([^"]+)"/m.exec(lib) || [])[1],
    'CONTENT_ARGS equals SEMBLE_CONTENT_ARGS byte for byte');
  check('P2.snippetsOff', r.argv[0].includes('--max-snippet-lines 0'), true,
    'snippets are switched off at the source, not filtered afterwards');
  check('P2.cacheEnv', r.cacheEnv, [cacheOf(p)],
    'and the child is handed SEMBLE_CACHE_LOCATION — semble keys its cache dir by project path '
    + 'ALONE, so it cannot notice that the hook and the server disagree about the ROOT: each just '
    + 'builds its own 20 MB copy, and the hook\'s copy is always cold');
}

// P2c — a distilled query that STARTS WITH A DASH. The backtick rule puts backticked
// text at the front of the query, so ``what does `-k` do…`` distils to exactly `-k`;
// semble's argparse reads a lone leading-dash argv as an option, the child exits
// non-zero, and a well-formed question buys a ten-minute cooldown. Verified against the
// pinned 0.5.4 CLI: `-- <query> <path>` parses, `--` before the flags does not.
{
  const DASH_PROMPT = 'what does `-k` do to all of it and why so then';
  check('P2c.distill', distill(DASH_PROMPT), '-k',
    'the distiller really does produce a bare leading-dash token for this prompt');
  check('P2c.gate', gateV3(DASH_PROMPT).fire, true,
    'and the gate fires on it, so that token really reaches argv');
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, DASH_PROMPT);
  check('P2c.argv', r.argv, [
    `--from semble[mcp]==0.5.4 semble search --content code docs config -k 3 --max-snippet-lines 0 -- -k ${p}`,
  ], 'the `-k` query sits AFTER the `--` separator, the one position argparse can only read as a positional');
  check('P2c.fires', safeParse(r.stdout), PREFETCH_OK, 'the search runs and its hits are injected as normal');
  check('P2c.noCooldown', Object.prototype.hasOwnProperty.call(markerOf(p) || {}, 'cool'), false,
    'and NO cooldown is armed - ten minutes of silence was the entire cost of the defect');
}

// P2b — the cache root: which one, where it comes from, and what happens when
// the index it names is not there. This is the pair of defects that produced
// 0/8 firings in the first live round — a duplicate index under semble's
// default root, built inside a 3 s cap it could never finish, whose timeout
// then armed the ten-minute cooldown on the very first prompt of every session.
{
  check('P2b.rootFromState', cacheRootOf({ cacheRoot: '/somewhere/semble-code' }), '/somewhere/semble-code',
    'the root comes from state.json, written by semble-mcp.sh from the same helper that registers the server');
  check('P2b.rootFallback', [cacheRootOf({}), cacheRootOf(null), cacheRootOf({ cacheRoot: '' })],
    [defaultCacheRoot(), defaultCacheRoot(), defaultCacheRoot()],
    'a state with no usable cacheRoot falls back to sc_cache_root_code\'s answer for this platform');
  check('P2b.rootIsCodeRoot', defaultCacheRoot().split('/').pop(), 'semble-code',
    'which is `semble-code`, NOT semble\'s own default `semble` — that one character was 40 MB of duplicate index');
  check('P2b.rootMatchesLib',
    defaultCacheRoot() === spawnSync('bash', ['-c',
      `. ${JSON.stringify(REAL_LIB)}; sc_cache_root_code`],
    { encoding: 'utf8' }).stdout.trim(), true,
    'and it is byte-equal to what the shell helper the MCP registration uses computes');
  check('P2b.hashComputed', repoHashOf({}, '/x'),
    createHash('sha256').update('/x').digest('hex'),
    'the repo hash is sha256(project path) — byte-matching semble cache.py and sc_repo_hash');
  check('P2b.hashIgnoresState', repoHashOf({ repoHash: REPO_HASH }, '/x'),
    createHash('sha256').update('/x').digest('hex'),
    'and is NEVER taken from state.json: a hash carried over from another checkout (copied .claude/, '
    + 'moved repo, worktree, subdirectory) would vouch for a FOREIGN index and let the child spawn '
    + 'against a genuinely cold path — the 3 s timeout the readiness check exists to prevent');
  {
    const real = mkdtempSync(join(tmpdir(), 'semble-hash-'));
    const link = join(mkdtempSync(join(tmpdir(), 'semble-link-')), 'alias');
    symlinkSync(real, link);
    check('P2b.hashResolvesSymlink', repoHashOf({}, link), repoHashOf({}, realpathSync(real)),
      'the path is resolved first, so a symlinked checkout keys the same index semble itself builds');
  }
  check('P2b.indexFiles', INDEX_FILES, ['chunks.json', 'metadata.json', 'bm25_index', 'semantic_index'],
    'all four artefacts semble writes have to be there for the index to count as built');
}
{
  const p = freshProject({ state: READY_STATE(), cold: true });
  const r = prefetch(p, Q);
  check('P2b.coldSilent', [r.status, safeParse(r.stdout)], [0, {}], 'no index -> silence, exit 0');
  check('P2b.coldNoSpawn', r.argv, [],
    'and NO child: a cold build takes minutes, so a 3 s child can only ever kill it half-done, '
    + 'forever, at the price of the cap on every prompt');
  check('P2b.coldWhy', tfield(p, 0, 'why'), 'cold-index',
    'recorded as cold-index — its own token, so a fresh install is never mistaken for a broken one');
  check('P2b.coldNoCooldown', markerOf(p), null,
    'and it arms NOTHING: the prompt right after the MCP server builds the index must fire');
}
for (const missing of INDEX_FILES) {
  const only = INDEX_FILES.filter((n) => n !== missing);
  const p = freshProject({ state: READY_STATE(), indexOnly: only });
  const r = prefetch(p, Q);
  check(`P2b.partial.${missing}`, [safeParse(r.stdout), r.argv, tfield(p, 0, 'why')], [{}, [], 'cold-index'],
    `an index missing ${missing} is a build that never finished, not an index`);
}
{
  const p = freshProject({ state: READY_STATE(), cold: true });
  prefetch(p, Q);
  warmIndex(cacheOf(p), createHash('sha256').update(realpathSync(p)).digest('hex'));
  const r = prefetch(p, Q);
  check('P2b.warmsUp', safeParse(r.stdout), PREFETCH_OK,
    'and the very next prompt after the index appears fires — the cold case parks nothing');
  check('P2b.unitReady',
    [indexReady(cacheOf(p), createHash('sha256').update(realpathSync(p)).digest('hex')),
      indexReady(cacheOf(p), 'deadbeef'), indexReady('', REPO_HASH)],
    [true, false, false], 'indexReady is total: an unknown hash or an empty root is "not ready", never a throw');
}

// P3 — throttle: an anti-storm guard, not a rate limiter.
{
  const p = freshProject({ state: READY_STATE() });
  prefetch(p, Q);
  const again = prefetch(p, 'where in this codebase does the installer merge settings');
  check('P3.throttled', safeParse(again.stdout), {}, `a second firing inside the ${THROTTLE_MS} ms window is suppressed`);
  check('P3.noSpawn', again.argv, [], 'and the search is never spawned — the throttle is checked before the gate');
  check('P3.recorded', dropTs(telemetry(p)[1]), { ev: 'prefetch', src: 'prefetch', sid: 'S1', fired: false, why: 'throttled' },
    'the suppression is attributable in the log');
}

// P4 — gate v3, unit-tested on the shapes the 61-prompt corpus is made of.
// INTENT and (DOMAIN or REPOREF), minus four suppressors. Measured: fires 36%,
// precision 55%, recall 71%, F1 0.62. 55% is the honest ceiling of lexical
// rules — do not "improve" this without re-running the corpus.
const GATE_ROWS = [
  ['P4.empty', '', false, 'empty', 'nothing to search for'],
  ['P4.slash', '/brewcode:semble-setup status and then show me the hooks', false, 'slash-command',
    'a slash command is an instruction to the CLI, not a question about code'],
  ['P4.codeword', '++m', false, 'codeword-only', 'a bare codeword carries no question'],
  ['P4.meta', 'ok', false, 'meta-reply', 'a meta-reply continues a turn, it does not open one'],
  ['P4.metaRu', 'да', false, 'meta-reply', 'the Russian half of the same list'],
  ['P4.short', 'how does auth work', false, 'too-short', 'under 30 characters there is not enough to distill'],
  ['P4.long', 'x'.repeat(2001), false, 'too-long', 'over 2000 characters is a pasted document, not a question'],
  ['P4.url', 'https://example.com/some/quite/long/path/page', false, 'bare-url', 'a bare URL is a reference, not a query'],
  ['P4.path', './scripts/lib/semble-common.sh', false, 'bare-path', 'a bare path is already the answer'],
  ['P4.noIntent', 'the installer rewrites the managed rule file in place, byte for byte', false, 'no-intent',
    'a statement is not a question'],
  ['P4.noDomain', 'why did everything become so slow yesterday afternoon', false, 'no-domain-no-reporef',
    'an intent with no code noun and no repo anchor is not about this repo'],
  ['P4.self', 'что ты сделал с конфигом хука в прошлый раз', false, 'self-reference',
    'the answer is in the transcript, not on disk'],
  ['P4.taskref', 'в проекте где мы решили задачу #12 про хуки', false, 'task-reference',
    'a tracker number is not a code identifier'],
  ['P4.literal', 'where is scripts/semble-guidance.sh referenced from in this repo', false, 'exact-literal',
    'an exact path is rg territory — rg won 2/2 there, 20x faster'],
  ['P4.enum', 'list all the places where the hook writes telemetry in this repo', false, 'enumeration',
    'exhaustive enumeration: rg won 5/5, semble 2/5'],
  ['P4.behaviour', Q, true, 'behaviour-or-vocab', 'INTENT plus a code noun is the core firing case'],
  ['P4.reporef', 'у нас всё стало медленно работать после последнего изменения — почему', true, 'behaviour-or-vocab',
    'REPOREF alone readmits the vocabulary-mismatch class — this clause IS v3, and it is what lifted recall'],
  ['P4.opinionExempt', 'как ты думаешь, где в этом плагине живёт логика кэша', true, 'behaviour-or-vocab',
    '`как ты думаешь` solicits an opinion and is explicitly exempted from the self-reference suppressor'],
];
for (const [name, prompt, fire, why, msg] of GATE_ROWS) {
  check(name, gateV3(prompt), { fire, why }, msg);
}

// P4b — the two load-bearing details, measured that way and easy to break.
{
  check('P4b.codewordBody', gateV3('++mmm how does the hook decide'), { fire: false, why: 'too-short' },
    'INTENT/DOMAIN/REPOREF read the codeword-STRIPPED body: 30 raw characters minus `++mmm ` is too short');
  check('P4b.codewordFires', gateV3('++m ' + Q), { fire: true, why: 'behaviour-or-vocab' },
    'and a codeword prefix never suppresses a prompt that would otherwise fire');
  check('P4b.suppressorWholePrompt', gateV3('++m что ты сделал с конфигом хука в прошлый раз'),
    { fire: false, why: 'self-reference' },
    'the four suppressors read the WHOLE prompt, codewords included — that is how the corpus was scored');
}

// P5 — the distiller. Measured against handing semble the raw prompt: hit@3
// 11/16 vs 9/16, MRR 0.674 vs 0.398, paired 8 wins / 3 losses / 5 ties.
{
  check('P5.plain', distill(Q), Q_DISTILLED, 'stop-words are dropped and the code nouns survive in order');
  check('P5.codeFirst', distill('why is `merge_settings` slow in semble-guidance.sh and prefetch'),
    'merge_settings semble-guidance.sh semble-guidance merge settings slow semble guidance prefetch',
    'code-shaped tokens rank ahead of content words: backticked span, then .ext filename, then kebab/snake');
  check('P5.codeword', distill('++m ' + Q), Q_DISTILLED, 'a codeword prefix is stripped before distilling');
  check('P5.fence', distill('what does ```const x = 1``` do in the parser'), 'parser',
    'a fenced code block is removed outright — pasted code is not a query');
  check('P5.cap', distill('where do we validate the incoming webhook payload signature'
    + ' before the router dispatches it onto the queue worker').split(' ').length, 9,
    'at most 9 keywords reach semble');
  check('P5.empty', distill(''), '', 'an empty prompt distills to the empty string, which the caller treats as a skip');
}

// ═══════════════════════════════════════════════════════════════════════════
// P6. FAIL-OPEN. Every row breaks something; every row must print exactly {}
// and exit 0. This is the highest-priority property in the skill: the hook
// runs on every prompt the user types.
// ═══════════════════════════════════════════════════════════════════════════

// State-shaped refusals, each recorded with its own reason token.
const STATE_ROWS = [
  ['P6.noState', undefined, 'no-state', '', false, 'an install whose state file was deleted'],
  ['P6.corrupt', '{,}', 'corrupt', '', false, 'an unparseable state file'],
  ['P6.empty', '', 'no-state', '', false, 'an empty state file'],
  ['P6.disabledFlag', READY_STATE({ enabled: false }), 'disabled', 'ready', false, 'semble switched off for the project'],
  ['P6.phaseDisabled', READY_STATE({ phase: 'disabled' }), 'disabled', 'disabled', true, 'phase disabled'],
  ['P6.phaseError', READY_STATE({ phase: 'error' }), 'error', 'error', true, 'phase error'],
  ['P6.prereqReady', READY_STATE({ phase: 'prereq_ready' }), 'not-registered', 'prereq_ready', true,
    'the add-failed rollback state, which still carries completed[mcp]'],
  ['P6.noMcp', READY_STATE({ completed: ['prereq'] }), 'no-mcp', 'ready', true, 'the MCP server was never registered'],
  ['P6.completedMissing', JSON.stringify({ phase: 'ready', enabled: true }), 'no-mcp', 'ready', true,
    'a state file with no completed array at all'],
];
for (const [name, state, why, phase, enabled, msg] of STATE_ROWS) {
  const p = freshProject(state === undefined ? {} : { state });
  // The state dir is the installer's, never the hook's. Seeding it for the
  // no-state row is what makes the refusal RECORDABLE; the never-installed
  // variant, where there is nowhere to write at all, is P6.noLitter below.
  mkdirSync(join(p, '.claude', 'semble'), { recursive: true });
  const r = prefetch(p, Q);
  check(name, [r.status, safeParse(r.stdout), r.argv.length], [0, {}, 0], `silent, exit 0, no search spawned: ${msg}`);
  check(`${name}.why`, telemetry(p).map(dropTs),
    [{ ev: 'prefetch', src: 'prefetch', sid: 'S1', fired: false, why, phase, enabled }],
    `and the refusal is recorded as why=${why}`);
}
{
  const p = freshProject({ stateDir: true });
  const r = prefetch(p, Q);
  check('P6.stateDir', [r.status, safeParse(r.stdout)], [0, {}], 'state.json as a DIRECTORY -> {} exit 0');
}
{
  const p = freshProject({});
  prefetch(p, Q);
  check('P6.noLitter', [existsSync(join(p, '.claude', 'semble')), existsSync(telemetryFile(p))], [false, false],
    'a repo without semble gets no .claude/semble directory and no telemetry file from the hook');
}

// Broken stdin — the hook cannot even find out which project it is in.
const STDIN_ROWS = [
  ['P6.badStdin', '{ not json', 'malformed JSON'],
  ['P6.emptyStdin', '', 'empty stdin'],
  ['P6.arrayStdin', '[]', 'a JSON array where an object was contracted'],
  ['P6.stringStdin', '"just a string"', 'a bare JSON string'],
  ['P6.nullStdin', 'null', 'JSON null'],
];
for (const [name, stdin, msg] of STDIN_ROWS) {
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, Q, { stdin });
  check(name, [r.status, safeParse(r.stdout)], [0, {}], `${msg} -> {} exit 0`);
}
{
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, undefined, { extra: { prompt: 42 } });
  check('P6.nonStringPrompt', [r.status, safeParse(r.stdout), tfield(p, 0, 'why')], [0, {}, 'empty'],
    'a non-string prompt is read as empty, never coerced');
}

// Search-side failures. A FAILURE is a standing condition — nothing about the
// next prompt fixes a missing uvx — so it parks the mechanism for the full ten
// minutes instead of paying the 3 s child cap on every following prompt.
const SEARCH_FAIL = [
  ['P6.noUvx', { path: '' }, 'uvx is not on PATH at all'],
  ['P6.nonZero', { rc: 1 }, 'the search exits non-zero'],
  ['P6.garbageOut', { out: 'not json' }, 'the search prints unparseable output'],
  ['P6.wrongShape', { out: '{"results":"nope"}' }, 'results is not an array'],
  ['P6.emptyOut', { out: '' }, 'the search prints nothing at all'],
];
for (const [name, opts, msg] of SEARCH_FAIL) {
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, Q, opts);
  check(name, [r.status, safeParse(r.stdout)], [0, {}], `${msg} -> {} exit 0`);
  check(`${name}.cooldown`, typeof (markerOf(p) || {}).cool, 'number',
    `and the ${COOLDOWN_MS} ms cooldown is armed so the next prompt costs nothing`);
  check(`${name}.coolMs`, (markerOf(p) || {}).coolMs, COOLDOWN_MS,
    'for the FULL window — a failure is a standing condition, not a slow moment');
  check(`${name}.why`, tfield(p, 0, 'why'), 'search-failed', 'recorded as search-failed');
}

// The timeout path, exercised for real: the child sleeps past the 3 s cap.
// A timeout is NOT a failure: against a warm index a search is ~0.6 s, so the
// cap means transient load and the penalty is a tenth of the failure penalty.
{
  const p = freshProject({ state: READY_STATE() });
  const t0 = Date.now();
  const r = prefetch(p, Q, { sleep: 10 });
  const elapsed = Date.now() - t0;
  check('P6.timeout', [r.status, safeParse(r.stdout)], [0, {}], 'a hanging search is SIGKILLed and the hook stays silent');
  // The 3 s SEARCH_TIMEOUT_MS cap is the only thing that ends this call, so the
  // window is centred on it: floor 1000 ms proves the cap was actually waited on
  // rather than the search being skipped outright, ceiling 5000 ms is the
  // registered hook timeout. The child sleeps 10 s, so a broken cap overshoots
  // by 5 s and cannot squeeze inside the window.
  check('P6.timeoutBudget', Math.abs(elapsed - 3000) <= 2000, true,
    'it returns in 1000-5000 ms: the 3 s cap fired inside the registered 5 s hook timeout, not after the child would have finished');
  check('P6.timeoutCooldown', typeof (markerOf(p) || {}).cool, 'number', 'the hang arms a cooldown too');
  check('P6.timeoutWhy', tfield(p, 0, 'why'), 'search-timeout',
    'recorded as search-timeout — a distinct event from search-failed, and attributable in telemetry');
  check('P6.timeoutCoolMs', (markerOf(p) || {}).coolMs, TIMEOUT_COOLDOWN_MS,
    `parked for ${TIMEOUT_COOLDOWN_MS} ms, not ${COOLDOWN_MS} ms`);
}

// The window written by whoever armed the cooldown is the window that is
// honoured — and it is clamped, so no marker can park the hook past the max.
{
  const p = freshProject({ state: READY_STATE() });
  writeFileSync(join(p, '.claude', 'semble', '.prefetch-ts'),
    JSON.stringify({ cool: Date.now() - 90_000, coolMs: TIMEOUT_COOLDOWN_MS }));
  check('P6.shortWindowExpires', safeParse(prefetch(p, Q).stdout), PREFETCH_OK,
    'a 60 s park is over 90 s later and the hook fires again');
}
{
  const p = freshProject({ state: READY_STATE() });
  writeFileSync(join(p, '.claude', 'semble', '.prefetch-ts'),
    JSON.stringify({ cool: Date.now() - 90_000, coolMs: COOLDOWN_MS }));
  const r = prefetch(p, Q);
  check('P6.longWindowHolds', [safeParse(r.stdout), r.argv], [{}, []],
    'while a 600 s park at the same age is still in force and spawns nothing');
}
{
  const p = freshProject({ state: READY_STATE() });
  writeFileSync(join(p, '.claude', 'semble', '.prefetch-ts'),
    JSON.stringify({ cool: Date.now() - COOLDOWN_MS - 1000, coolMs: 9e15 }));
  check('P6.windowClamped', safeParse(prefetch(p, Q).stdout), PREFETCH_OK,
    'a nonsense window is clamped to the maximum, so a corrupt marker can never park the hook forever');
}

// A search that RAN and found nothing is not a failure: it arms the ORDINARY throttle.
// It used to arm nothing at all — the `no-hits` return sat above writeMarker — so every
// following prompt paid another uvx child for the same empty answer.
{
  const p = freshProject({ state: READY_STATE() });
  const r = prefetch(p, Q, { out: '{"results":[]}' });
  check('P6.noHits', [r.status, safeParse(r.stdout), tfield(p, 0, 'why')], [0, {}, 'no-hits'],
    'an empty result set is silence, recorded as no-hits');
  check('P6.noHitsNoCooldown', Object.prototype.hasOwnProperty.call(markerOf(p) || {}, 'cool'), false,
    'and it arms NO cooldown — `[]` means the index answered, only `null` means it could not be trusted');
  check('P6.noHitsThrottle', typeof (markerOf(p) || {}).t, 'number',
    'but it DOES stamp the 30 s throttle: the search ran, and repeating it on the very next prompt buys nothing');
  const second = prefetch(p, Q, { out: '{"results":[]}' });
  check('P6.noHitsThrottleHolds', [safeParse(second.stdout), second.argv, tfield(p, 1, 'why')],
    [{}, [], 'throttled'],
    'so the next prompt spawns NO child and is recorded as throttled, not as a second no-hits');
}

// The cooldown really suppresses the next prompt, without spawning anything.
{
  const p = freshProject({ state: READY_STATE() });
  prefetch(p, Q, { rc: 1 });
  const second = prefetch(p, Q);
  check('P6.cooldownHolds', [safeParse(second.stdout), second.argv], [{}, []],
    'the prompt after a failure is silent and spawns no child');
  check('P6.cooldownWhy', tfield(p, 1, 'why'), 'cooldown', 'recorded as cooldown, distinct from throttled');
}

// A corrupt or unwritable marker must fail OPEN — the throttle is a guard, not a gate.
{
  const p = freshProject({ state: READY_STATE() });
  writeFileSync(join(p, '.claude', 'semble', '.prefetch-ts'), '{,}');
  check('P6.markerCorrupt', safeParse(prefetch(p, Q).stdout), PREFETCH_OK,
    'a corrupt marker reads as no marker and the hook still fires');
}
{
  const good = freshProject({ state: READY_STATE() });
  const bad = freshProject({ state: READY_STATE() });
  const expected = prefetch(good, Q);
  chmodSync(join(bad, '.claude', 'semble'), 0o500);          // readable, not writable
  const r = prefetch(bad, Q);
  chmodSync(join(bad, '.claude', 'semble'), 0o700);
  check('P6.unwritable', r.stdout, expected.stdout,
    'an unwritable .claude/semble leaves the returned JSON byte-identical — marker and telemetry are both best-effort');
  check('P6.unwritableExit', r.status, 0, 'and the hook still exits 0');
  check('P6.unwritableNoFile', existsSync(telemetryFile(bad)), false, 'nothing was written');
  check('P6.unwritableWarned', r.stderr.includes('[semble-prefetch] marker write failed'), true,
    'the failure is reported on stderr, where it cannot corrupt the hook protocol on stdout');
}

// P7 — the hook can never block, in any recorded output.
{
  const joined = allPrefetchOutputs.join('\n');
  check('P7.noDecision', joined.includes('permissionDecision'), false, 'no recorded output ever carries permissionDecision');
  check('P7.noDeny', joined.includes('"deny"'), false, 'no recorded output ever carries a deny');
  check('P7.noUpdatedInput', joined.includes('updatedInput'), false, 'no recorded output ever carries updatedInput');
  check('P7.oneObject', allPrefetchOutputs.every((o) => o.trim().split('\n').length === 1), true,
    'every invocation printed exactly one line of JSON');
  const src = readFileSync(PREFETCH_SRC, 'utf8');
  check('P7.sourceNeverDecides', src.includes('permissionDecision'), false,
    'the source contains no permissionDecision field at all');
  check('P7.mainGuarded', src.includes('import.meta.url === pathToFileURL(process.argv[1]).href'), true,
    'main() runs only as the entry point — importing the file for the corpus replays must not consume stdin');
  check('P7.noSnippetField', src.includes("'content'"), false,
    'the renderer never touches a `content` field: paths convert 5/6, snippets 2/6');
}

// ═══════════════════════════════════════════════════════════════════════════
// Y. telemetry contract shared by the session hook and the log itself
// ═══════════════════════════════════════════════════════════════════════════

// Y1 — session hook: a nudge record only when additionalContext was really returned.
{
  const p = freshProject({ state: READY_STATE() });
  session(p);
  check('Y1.ready', telemetry(p).map(dropTs),
    [{ ev: 'nudge', src: 'session', sid: 'S1', matcher: 'SessionStart', agent: 'main', q: '' }],
    'the ready session emits exactly one nudge record and no gate record');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'error' }) });
  session(p);
  check('Y2.noContext', existsSync(telemetryFile(p)), false,
    'a systemMessage without additionalContext is not a nudge and writes nothing');
}

// Y3 — sid attribution comes straight off the hook input, never invented.
{
  const p = freshProject({ state: READY_STATE() });
  prefetch(p, Q, { extra: { session_id: 'S9' } });
  check('Y3.sid', tfield(p, 0, 'sid'), 'S9', 'sid is the hook input session_id');
}
{
  const p = freshProject({ state: READY_STATE() });
  prefetch(p, Q, { stdin: JSON.stringify({ cwd: p, hook_event_name: 'UserPromptSubmit', prompt: Q }) });
  check('Y3.emptySid', tfield(p, 0, 'sid'), '', 'a missing session_id becomes the empty string, never undefined');
}

// Y4 — the 2 MB size guard trims instead of growing without bound.
{
  const p = freshProject({ state: READY_STATE() });
  // The fixture's size is fixed by its own construction, so it is asserted
  // exactly: a 285-byte filler plus a newline, 11000 times = 3146000 bytes.
  const filler = JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', ev: 'prefetch', src: 'prefetch', sid: 'X', pad: 'y'.repeat(200) });
  const KEPT = (filler + '\n').repeat(1000);
  writeFileSync(telemetryFile(p), (filler + '\n').repeat(11000));
  const before = statSync(telemetryFile(p)).size;
  prefetch(p, Q);
  const lines = telemetry(p);
  check('Y4.oversize', before, 3_146_000, 'the fixture is exactly 3146000 bytes, over the 2 MB guard');
  check('Y4.trimmed', lines.length, 1001, 'the last 1000 lines are kept, then the new record is appended');
  check('Y4.tail', lines[lines.length - 1].fired, true, 'the new record is at the end');
  check('Y4.smaller', readFileSync(telemetryFile(p), 'utf8').slice(0, KEPT.length), KEPT,
    'the file shrank to byte-exactly the last 1000 filler lines, then the new record');
}

// ═══════════════════════════════════════════════════════════════════════════
// R. PreToolUse reminder — every-Nth cadence and the widened gate
//
// Restored after the v5.0.0 removal with two changes that ARE the fix: the
// 10-minute throttle became a counter over eligible searches, and the gate lost
// its "any doubt returns true" bias. Replayed over the real historical stream
// (2543 recorded search calls) the old gate let 229 through and fired 32; this
// one lets 1023 through and fires 204.
// ═══════════════════════════════════════════════════════════════════════════
const counterFile = (p) => join(p, '.claude', 'semble', 'reminder.json');
const counterOf = (p) => safeParse(existsSync(counterFile(p)) ? readFileSync(counterFile(p), 'utf8') : 'null');

/** One PreToolUse call. `tool_input` is passed through verbatim so Grep cases work too. */
function reminder(proj, toolInput, extra) {
  return runNode(REMINDER_SRC, JSON.stringify({
    session_id: 'R1',
    cwd: proj,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_R1',
    tool_input: toolInput,
    ...(extra || {}),
  }));
}
const remindOut = (p, command, extra) => safeParse(reminder(p, { command }, extra).stdout);
const ctxOf = (out) => ((out || {}).hookSpecificOutput || {}).additionalContext || '';
/** Fired-or-not per command, in order. A helper, not branching inside a test body. */
const burst = (p, commands) => commands.map((c) => ctxOf(remindOut(p, c)) !== '');
/** N distinct eligible searches: an intent question, no flag, no path, no filename. */
const eligibleRun = (n) => Array.from({ length: n }, (_, i) => `rg "retry backoff policy ${i + 1}"`);
const REMIND_TEXT = (p) =>
  'semble: call mcp__semble_code__search FIRST for this — repo="' + p +
  '", top_k=5, max_snippet_lines=10 — then open the hit at start_line. ' +
  'Keep grep for exact identifiers, literal strings and exhaustive -l/-c enumeration.';
const REMIND_OK = (p) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: REMIND_TEXT(p) },
});

// R1 — the cadence itself: 15 eligible calls, N=5, exactly three injections.
{
  const p = freshProject({ state: READY_STATE() });
  const seen = burst(p, eligibleRun(15));
  check('R1.pattern', seen,
    [false, false, false, false, true, false, false, false, false, true, false, false, false, false, true],
    'across 15 eligible searches the nudge lands on exactly the 5th, 10th and 15th');
  check('R1.count', seen.filter(Boolean).length, 3, 'three injections for fifteen eligible calls - one per five');
  check('R1.counter', counterOf(p), { count: 15 }, 'the counter file holds every eligible call, not just the firing ones');
}

// R2 — a corrupt counter resets to 0 instead of throwing or freezing the cadence.
{
  const p = freshProject({ state: READY_STATE() });
  burst(p, eligibleRun(3));
  writeFileSync(counterFile(p), '{not json,,,');
  const seen = burst(p, eligibleRun(5));
  check('R2.recovered', seen, [false, false, false, false, true],
    'a corrupt counter restarts the cadence from zero - the 5th call after it still fires');
  check('R2.counter', counterOf(p), { count: 5 }, 'and the file is rewritten with a clean integer');
}
{
  const p = freshProject({ state: READY_STATE() });
  writeFileSync(counterFile(p), JSON.stringify({ count: -7 }));
  check('R3.negative', burst(p, eligibleRun(5)), [false, false, false, false, true],
    'a negative count is rejected the same way a corrupt file is');
  check('R3.counterAfter', counterOf(p), { count: 5 }, 'and the counter is exactly the number of eligible calls since');
}

// R4 — ineligible calls must not advance the counter, or N would mean nothing.
{
  const p = freshProject({ state: READY_STATE() });
  burst(p, eligibleRun(4));
  const skipped = burst(p, ['rg -l "retry backoff policy X"', 'rg -c "handler"', 'grep -o "token" ']);
  check('R4.skipped', skipped, [false, false, false], 'the three suppressed calls inject nothing');
  check('R4.counterUnmoved', counterOf(p), { count: 4 }, 'and leave the counter exactly where the 4 eligible calls left it');
  check('R4.fifth', burst(p, ['rg "retry backoff policy 5"']), [true],
    'so the next ELIGIBLE call is number five and fires');
}

// R5 — N is configuration, read off state.json.
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  check('R5.every1', burst(p, eligibleRun(3)), [true, true, true], 'reminderEvery:1 nudges on every eligible search');
}
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 3 }) });
  check('R5.every3', burst(p, eligibleRun(6)), [false, false, true, false, false, true], 'reminderEvery:3 nudges on the 3rd and the 6th');
}
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 0 }) });
  check('R5.zeroIgnored', burst(p, eligibleRun(5)), [false, false, false, false, true],
    'reminderEvery:0 is not a valid cadence and falls back to the default 5');
}
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 'many' }) });
  check('R5.stringIgnored', burst(p, eligibleRun(5)), [false, false, false, false, true],
    'a non-integer reminderEvery falls back to the default 5 as well');
}

// R6 — the suppressors that survived. reminderEvery:1 removes the cadence from
// the picture, so a `false` here is the GATE and nothing else.
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  const suppressed = [
    'rg -l "session store"',
    'rg --files-with-matches "session store"',
    'grep -c "session store" ',
    'rg --count "session store"',
    'grep -o "session store" ',
    'rg "src/store/session.ts"',
    'rg "session.ts"',
    'find . -name "session"',
    'bfs . -iname "session"',
    'rg "how does semble decide"',
  ];
  check('R6.suppressed', burst(p, suppressed), suppressed.map(() => false),
    'enumeration flags, a path pattern, a filename-shaped pattern, a find-by-name and any mention of semble stay silent');
  check('R6.counterUntouched', existsSync(counterFile(p)), false,
    'and none of them ever created the counter file - suppression happens before the count');
}

// R7 — the shapes the old "any doubt returns true" gate suppressed and this one
// allows. These ten are the 4.5x eligibility gain, one case per reason.
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  const allowed = [
    'rg "handle.*event"',              // regex metacharacter
    'rg "^export function"',           // anchor
    'rg "(retry|backoff)"',            // alternation
    'rg "queue\\[0\\]"',               // bracket
    'rg -F "session expiry" ',         // literal flag, no longer a suppressor
    'rg -w "dispatch" ',               // word flag, no longer a suppressor
    'rg "id"',                         // two characters, no longer too short
    'rg "session store" | sort',       // piped, no longer a suppressor
    'cd /tmp && rg "session expiry"',  // search at a command boundary
    'ugrep "how sessions persist"',    // a non-rg binary
  ];
  check('R7.allowed', burst(p, allowed), allowed.map(() => true),
    'regexes, literal/word flags, short patterns and piped searches all reach the model now');
}

// R8 — state gating. Every row silent, and none of them counts.
{
  const rows = [
    ['missing', undefined],
    ['corrupt', '{,}'],
    ['disabledFlag', READY_STATE({ enabled: false })],
    ['disabledPhase', READY_STATE({ phase: 'disabled' })],
    ['error', READY_STATE({ phase: 'error' })],
    ['prereq', READY_STATE({ phase: 'prereq_ready' })],
    ['noMcp', READY_STATE({ completed: [] })],
  ];
  const seen = rows.map(([, state]) => {
    const p = freshProject(state === undefined ? {} : { state });
    return [ctxOf(remindOut(p, 'rg "session expiry"')), existsSync(counterFile(p))];
  });
  check('R8.silent', seen, rows.map(() => ['', false]),
    'no state, corrupt state, either disabled form, error, prereq_ready and a missing mcp checkpoint all inject nothing and count nothing');
}
{
  // phase !== 'ready' still fires on purpose: semble builds its index lazily
  // inside a tool call, so a ready-gate would deadlock. The wording says so.
  const p = freshProject({ state: READY_STATE({ phase: 'awaiting_reload', reminderEvery: 1 }) });
  check('R8.cold', safeParse(reminder(p, { command: 'rg "session expiry"' }).stdout), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: REMIND_TEXT(p) + ' Index not verified yet (phase=awaiting_reload); the first call builds it.',
    },
  }, 'a registered-but-unverified project still gets the nudge, with the cold-index clause appended');
}

// R9 — hostile input.
{
  const bad = runNode(REMINDER_SRC, 'not json at all');
  const empty = runNode(REMINDER_SRC, '');
  check('R9.badStdin', [bad.status, safeParse(bad.stdout)], [0, {}], 'reminder: malformed stdin -> {} exit 0');
  check('R9.emptyStdin', [empty.status, safeParse(empty.stdout)], [0, {}], 'reminder: empty stdin -> {} exit 0');
}
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  const other = safeParse(reminder(p, { command: 'rg "session expiry"' }, { tool_name: 'Write' }).stdout);
  const noInput = safeParse(reminder(p, undefined).stdout);
  const noCommand = safeParse(reminder(p, { description: 'no command key' }).stdout);
  check('R9.wrongTool', [other, noInput, noCommand], [{}, {}, {}],
    'a non-search tool, an absent tool_input and an absent command all produce the empty object');
  check('R9.exit', reminder(p, { command: 'rg "session expiry"' }).status, 0, 'and the firing path exits 0 too');
}

// R10 — the native Grep tool path.
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  const g = safeParse(reminder(p, { pattern: 'how sessions persist' }, { tool_name: 'Grep' }).stdout);
  check('R10.grepFires', g, REMIND_OK(p), 'the Grep tool gets the identical line');
  check('R10.grepMatcher', trec(p, 1).matcher, 'Grep', 'and the nudge records Grep as the matcher');
}
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  const modes = ['files_with_matches', 'count'].map((output_mode) =>
    safeParse(reminder(p, { pattern: 'how sessions persist', output_mode }, { tool_name: 'Grep' }).stdout));
  check('R10.grepEnumeration', modes, [{}, {}], 'Grep in files_with_matches or count mode is enumeration and stays silent');
}

// R11 — telemetry: the join key that makes delivery auditable, plus the cadence
// fields. The old hook recorded neither, which is why 0/18 measured nothing.
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 2 }) });
  reminder(p, { command: 'rg "session expiry"' }, { tool_use_id: 'toolu_AAA' });
  reminder(p, { command: 'rg "queue drain"' }, { tool_use_id: 'toolu_BBB' });
  check('R11.records', telemetry(p).map(dropTs), [
    { ev: 'gate', src: 'reminder', sid: 'R1', fired: false, why: 'cadence', phase: 'ready', enabled: true, tool_use_id: 'toolu_AAA', n: 1, every: 2 },
    { ev: 'gate', src: 'reminder', sid: 'R1', fired: true, why: 'ok', phase: 'ready', enabled: true, tool_use_id: 'toolu_BBB', n: 2, every: 2 },
    { ev: 'nudge', src: 'reminder', sid: 'R1', matcher: 'Bash', agent: 'main', tool_use_id: 'toolu_BBB', n: 2, every: 2, q: 'rg "queue drain"' },
  ], 'every record carries the PreToolUse tool_use_id, and the nudge names the exact call it was attached to');
}
{
  const p = freshProject({ state: READY_STATE({ reminderEvery: 1 }) });
  reminder(p, { command: 'rg "session expiry"' }, { agent_id: 'a1c5a07', agent_type: 'general-purpose' });
  check('R11.subAttribution', trec(p, 1).agent, 'sub', 'a PreToolUse arriving from inside a subagent is attributed to sub, not main');
}
{
  const p = freshProject({ state: READY_STATE() });
  reminder(p, { command: 'rg "session expiry"' }, { tool_use_id: 12345 });
  check('R11.nonStringTuid', trec(p, 0).tool_use_id, '', 'a non-string tool_use_id becomes the empty string, never undefined');
}

// R12 — static guarantees specific to the two restored files.
{
  const remSrc = readFileSync(REMINDER_SRC, 'utf8');
  const subSrc = readFileSync(join(ASSETS, 'semble-subagent.mjs'), 'utf8');
  const both = [remSrc, subSrc];
  check('R12.shebang', both.map((s) => s.startsWith('#!/usr/bin/env node')), [true, true], 'both restored hooks carry a node shebang');
  check('R12.nodeCheck',
    [REMINDER_SRC, join(ASSETS, 'semble-subagent.mjs')].map((f) => spawnSync(process.execPath, ['--check', f]).status),
    [0, 0], 'node --check passes on both');
  check('R12.advisory', both.map((s) => s.includes('permissionDecision') || s.includes('updatedInput')), [false, false],
    'neither can decide or rewrite anything - the word does not appear in either file');
  check('R12.noProcess', both.map((s) => s.includes('child_process') || s.includes('spawn(')), [false, false],
    'and neither spawns a process');
  check('R12.retiredMarker', both.map((s) => s.includes('.reminder-ts')), [false, false],
    'the retired throttle marker path is gone from both files');
  check('R12.retiredName', remSrc.includes('semble-explore.mjs'), false,
    'and the reminder never names the retired hook file');
  check('R12.explorePastTense', subSrc.includes('semble-explore.mjs, was pinned'), true,
    'the subagent hook names semble-explore.mjs exactly once, as a retired predecessor');
}

// ═══════════════════════════════════════════════════════════════════════════
// S. SubagentStart — one line into EVERY spawned subagent
//
// The deleted semble-explore.mjs matched agent_type "Explore" alone. This one
// registers with no matcher at all, which on CC 2.1.226 means every agent type
// (verified live: a matcher-less SubagentStart entry fired for "Explore").
// No throttle and no counter: a fresh subagent remembers no earlier injection.
// ═══════════════════════════════════════════════════════════════════════════
function subagent(proj, agentType, extra) {
  return runNode(SUBAGENT_SRC, JSON.stringify({
    session_id: 'S1',
    cwd: proj,
    hook_event_name: 'SubagentStart',
    prompt_id: 'p1',
    agent_id: 'a1c5a0755e38bab4a',
    agent_type: agentType,
    ...(extra || {}),
  }));
}
const SUB_TEXT = (p) =>
  'semble: mcp__semble_code__search is already available to you — no ToolSearch needed. ' +
  'Start any "where/how/why does X work" question with ONE call: repo="' + p +
  '", top_k=5, max_snippet_lines=10, then open the hit at start_line. ' +
  'Use rg only for exact identifiers, literal strings and exhaustive enumeration.';
const SUB_OK = (p) => ({
  hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: SUB_TEXT(p) },
});

// S1 — every agent type, not just Explore.
{
  const p = freshProject({ state: READY_STATE() });
  const types = ['Explore', 'Plan', 'general-purpose', 'docs-writer', 'statusline-setup', 'brewcode:skill-creator'];
  check('S1.allTypes', types.map((t) => safeParse(subagent(p, t).stdout)), types.map(() => SUB_OK(p)),
    'six different agent types each receive the identical directive - the Explore-only matcher is gone');
  check('S1.exact', safeParse(subagent(p, 'Explore').stdout), SUB_OK(p), 'and the injected string is exactly this');
}

// S2 — no throttle: repeated spawns each get their own line.
{
  const p = freshProject({ state: READY_STATE() });
  const runs = [1, 2, 3].map(() => ctxOf(safeParse(subagent(p, 'general-purpose').stdout)));
  check('S2.noThrottle', runs, [SUB_TEXT(p), SUB_TEXT(p), SUB_TEXT(p)],
    'three consecutive spawns all fire - there is nothing for a fresh subagent to remember');
  check('S2.noCounter', existsSync(counterFile(p)), false, 'and the subagent hook keeps no counter of its own');
}

// S3 — telemetry carries agent_type and agent_id, which makes per-agent-type
// conversion computable and per-injection delivery auditable.
{
  const p = freshProject({ state: READY_STATE() });
  subagent(p, 'docs-writer', { agent_id: 'a99' });
  check('S3.records', telemetry(p).map(dropTs), [
    { ev: 'gate', src: 'subagent', sid: 'S1', fired: true, why: 'ok', phase: 'ready', enabled: true, agent_type: 'docs-writer', agent_id: 'a99' },
    { ev: 'nudge', src: 'subagent', sid: 'S1', matcher: 'SubagentStart', agent: 'sub', agent_type: 'docs-writer', agent_id: 'a99', q: '' },
  ], 'one gate record and one nudge record, both naming the agent type and the agent id');
}

// S4 — state gating, same seven rows as the reminder.
{
  const rows = [
    ['missing', undefined],
    ['corrupt', '{,}'],
    ['disabledFlag', READY_STATE({ enabled: false })],
    ['disabledPhase', READY_STATE({ phase: 'disabled' })],
    ['error', READY_STATE({ phase: 'error' })],
    ['prereq', READY_STATE({ phase: 'prereq_ready' })],
    ['noMcp', READY_STATE({ completed: [] })],
  ];
  const seen = rows.map(([, state]) => {
    const p = freshProject(state === undefined ? {} : { state });
    const r = subagent(p, 'Explore');
    return [r.status, safeParse(r.stdout)];
  });
  check('S4.silent', seen, rows.map(() => [0, {}]),
    'no state, corrupt state, either disabled form, error, prereq_ready and a missing mcp checkpoint all inject nothing');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'verifying' }) });
  check('S4.notReadyStillFires', safeParse(subagent(p, 'Explore').stdout), SUB_OK(p),
    'a registered-but-unverified project still gets the line - the index is built inside the first call');
}

// S5 — hostile input. Without an agent_type there is nothing to talk to, and
// cwd is a guess, so the hook writes nothing at all.
{
  const bad = runNode(SUBAGENT_SRC, 'not json at all');
  const empty = runNode(SUBAGENT_SRC, '');
  check('S5.badStdin', [bad.status, safeParse(bad.stdout)], [0, {}], 'subagent: malformed stdin -> {} exit 0');
  check('S5.emptyStdin', [empty.status, safeParse(empty.stdout)], [0, {}], 'subagent: empty stdin -> {} exit 0');
}
{
  const p = freshProject({ state: READY_STATE() });
  const r = runNode(SUBAGENT_SRC, JSON.stringify({ session_id: 'S1', cwd: p, hook_event_name: 'SubagentStart' }));
  check('S5.noAgentType', [r.status, safeParse(r.stdout), existsSync(telemetryFile(p))], [0, {}, false],
    'a payload with no agent_type injects nothing and writes no telemetry');
}

// ═══════════════════════════════════════════════════════════════════════════
// F. static guarantees of the five shipped hook files
// ═══════════════════════════════════════════════════════════════════════════
{
  const sessionSrc = readFileSync(SESSION_SRC, 'utf8');
  const prefetchSrc = readFileSync(PREFETCH_SRC, 'utf8');
  const statsSrc = readFileSync(STATS_SRC, 'utf8');
  const reminderSrc = readFileSync(REMINDER_SRC, 'utf8');
  const subagentSrc = readFileSync(SUBAGENT_SRC, 'utf8');
  const src = [sessionSrc, prefetchSrc, statsSrc, reminderSrc, subagentSrc];
  // The passive hooks must stay pure readers. Prefetch is the ONE hook allowed a
  // child, and only because handing over a result is the thing that converts.
  // The two advisory hooks are back on that same rule: they emit text, they never
  // spawn - a PreToolUse hook that forks sits in front of every Bash call.
  const passive = [sessionSrc, statsSrc, reminderSrc, subagentSrc].join('\n');
  check('F1.passiveNoChildProcess', passive.includes('child_process'), false,
    'no passive hook - session, stats, reminder, subagent - imports child_process');
  check('F2.passiveNoSpawn', passive.includes('spawn('), false, 'and none of them spawns a process');
  check('F3.noPgrep', src.join('\n').includes('pgrep'), false, 'no hook probes for a daemon with pgrep');
  check('F4.prefetchExecFile', prefetchSrc.includes('execFileSync('), true,
    'the prefetch hook spawns with execFileSync - argv, so the distilled query can never be word-split');
  check('F5.noShell', [prefetchSrc.includes('execSync('), prefetchSrc.includes('shell:')], [false, false],
    'and never through a shell');
  check('F6.hardCap',
    [prefetchSrc.includes('timeout: SEARCH_TIMEOUT_MS'), prefetchSrc.includes("killSignal: 'SIGKILL'")],
    [true, true], 'the child carries a hard cap and a kill signal, both inside the registered 5 s hook timeout');
  check('F7.shebang', src.every((s) => s.startsWith('#!/usr/bin/env node')), true, 'every hook carries a node shebang');
  const checks = [SESSION_SRC, PREFETCH_SRC, STATS_SRC, REMINDER_SRC, SUBAGENT_SRC]
    .map((f) => spawnSync(process.execPath, ['--check', f]).status);
  check('F8.nodeCheck', checks, [0, 0, 0, 0, 0], 'node --check passes on all five hook files');
  check('F9.neverDecides', src.map((x) => x.includes('permissionDecision:')),
    [false, false, false, false, false],
    'no shipped hook emits a permissionDecision field - none of them can block a call');
  check('F10.shipped', [existsSync(REMINDER_SRC), existsSync(SUBAGENT_SRC)], [true, true],
    'both advisory hooks ship again - the channel they use was verified to deliver');
  check('F10.retiredGone', existsSync(join(ASSETS, 'semble-explore.mjs')), false,
    'and semble-explore.mjs is gone from assets/ for good - superseded, only ever cleaned up');
}

// ═══════════════════════════════════════════════════════════════════════════
// G. the runbook's canonical merge block must not drift from the script
// ═══════════════════════════════════════════════════════════════════════════
{
  const runbook = readFileSync(join(ASSETS, 'INSTALL.md'), 'utf8');
  const blocks = [...runbook.matchAll(/\n```\n(SETTINGS=[\s\S]*?)\n```\n/g)].map((m) => m[1]);
  check('G1.blockFound', blocks.length, 1, 'INSTALL.md carries exactly one canonical merge block');
  const blockPath = join(BASE, 'runbook-merge.sh');
  writeFileSync(blockPath, blocks[0] || 'exit 9');

  const seed = JSON.stringify(FOREIGN, null, 2) + '\n';
  const viaScript = freshProject({ settings: seed });
  guidance(viaScript, ['install', '--part', 'hooks', '--json']);
  guidance(viaScript, ['install', '--part', 'permissions', '--json']);

  const viaRunbook = freshProject({ settings: seed });
  mkdirSync(hooksDirOf(viaRunbook), { recursive: true });
  const rb = spawnSync('bash', [blockPath], { cwd: viaRunbook, encoding: 'utf8', timeout: 30000 });
  check('G2.runbookExit', rb.status, 0, 'the runbook merge block runs clean on a foreign settings file');
  check('G3.sameResult',
    readRaw(settingsPath(viaRunbook)).split(viaRunbook).join('<P>'),
    readRaw(settingsPath(viaScript)).split(viaScript).join('<P>'),
    'the runbook block and semble-guidance.sh produce byte-identical settings.json');
  const rb2 = spawnSync('bash', [blockPath], { cwd: viaRunbook, encoding: 'utf8', timeout: 30000 });
  check('G4.runbookIdempotent', rb2.status, 0, 'the runbook merge block is re-runnable');
}

// ═══════════════════════════════════════════════════════════════════════════
// H. preflight, honest change reporting, hook-level filtering
// ═══════════════════════════════════════════════════════════════════════════
const BROKEN_SETTINGS = '{ "hooks": { "PreToolUse": [ }\n';
const PRE_MD = '# CLAUDE.md\n\n## Overview\n\nproject text\n';

// H1 — install aborts on an unparseable settings.json BEFORE touching anything
{
  const p = freshProject({ settings: BROKEN_SETTINGS, claudeMd: PRE_MD });
  const { session, prefetch: pre, stats } = semblePaths(p);
  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('H1.exit', r.status, 1, 'install --part all over unparseable settings exits 1');
  check('H1.abort', (r.stdout + r.stderr).includes('ABORT'), true, 'the failure names ABORT');
  check('H1.settings', readRaw(settingsPath(p)), BROKEN_SETTINGS, 'the unparseable settings file is byte-identical');
  check('H1.rule', existsSync(join(p, '.claude', 'rules', 'semble-first.md')), false, 'no rule file was written');
  check('H1.claudeMd', readRaw(join(p, 'CLAUDE.md')), PRE_MD, 'CLAUDE.md is byte-identical, no marker block');
  check('H1.hookFiles', [existsSync(session), existsSync(pre), existsSync(stats)], [false, false, false],
    'no .mjs hook file was written');
  check('H1.hooksDir', existsSync(hooksDirOf(p)), false, 'the .claude/hooks directory was never created');
}

// H2 — remove aborts on an unparseable settings.json BEFORE deleting anything
{
  const p = freshProject({ claudeMd: PRE_MD });
  guidance(p, ['install', '--part', 'all', '--json']);
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  const mdPath = join(p, 'CLAUDE.md');
  const { session, prefetch: pre, stats } = semblePaths(p);
  const before = {
    rule: readRaw(rulePath), md: readRaw(mdPath), session: readRaw(session), prefetch: readRaw(pre),
    stats: readRaw(stats),
  };
  writeFileSync(settingsPath(p), BROKEN_SETTINGS);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('H2.exit', r.status, 1, 'remove --part all over unparseable settings exits 1');
  check('H2.abort', (r.stdout + r.stderr).includes('ABORT'), true, 'the failure names ABORT');
  check('H2.settings', readRaw(settingsPath(p)), BROKEN_SETTINGS, 'the unparseable settings file is byte-identical');
  check('H2.rule', readRaw(rulePath), before.rule, 'the rule file is still there, byte-identical');
  check('H2.claudeMd', readRaw(mdPath), before.md, 'the CLAUDE.md marker block is still there, byte-identical');
  check('H2.hookFiles', [readRaw(session), readRaw(pre), readRaw(stats)],
    [before.session, before.prefetch, before.stats],
    'all three .mjs hook files are still there, byte-identical — settings.json may still reference them');
}

// H3 — a second install reports nothing as changed
{
  const p = freshProject({});
  const j1 = safeParse(guidance(p, ['install', '--part', 'all', '--json']).stdout);
  const after1 = readRaw(settingsPath(p));
  const r2 = guidance(p, ['install', '--part', 'all', '--json']);
  const j2 = safeParse(r2.stdout);
  check('H3.firstSettings', j1.changed.filter((l) => l.startsWith('settings:')),
    [`settings: hooks+permissions merged in ${settingsPath(p)}`],
    'the first install reports the settings merge as changed, once');
  check('H3.exit2', r2.status, 0, 'the second install exits 0');
  check('H3.secondChanged', j2.changed, [], 'the second install reports an empty changed list');
  check('H3.secondSettings', j2.unchanged.filter((l) => l.startsWith('settings:')),
    [`settings: hooks+permissions already merged in ${settingsPath(p)}`],
    'the byte-identical merge is reported as unchanged, once');
  check('H3.bytes', readRaw(settingsPath(p)), after1, 'settings.json is byte-identical after the second install');
}

// H4 — a second remove on an already-clean project reports nothing as changed
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const j1 = safeParse(guidance(p, ['remove', '--part', 'all', '--json']).stdout);
  const after1 = readRaw(settingsPath(p));
  const r2 = guidance(p, ['remove', '--part', 'all', '--json']);
  const j2 = safeParse(r2.stdout);
  check('H4.firstSettings', j1.changed.filter((l) => l.startsWith('settings:')),
    [`settings: hooks+permissions unmerged in ${settingsPath(p)}`],
    'the first remove reports the settings unmerge as changed, once');
  check('H4.exit2', r2.status, 0, 'the second remove exits 0');
  check('H4.secondChanged', j2.changed, [], 'the second remove reports an empty changed list');
  check('H4.secondSettings', j2.unchanged.filter((l) => l.startsWith('settings:')),
    [`settings: hooks+permissions already unmerged in ${settingsPath(p)}`],
    'the byte-identical unmerge is reported as unchanged, once');
  check('H4.bytes', readRaw(settingsPath(p)), after1, 'settings.json is byte-identical after the second remove');
}

// H5 — merge: a mixed entry loses only its stale semble hook
const FOREIGN_HOOK = { type: 'command', command: 'node', args: ['/opt/foreign/guard.mjs'], timeout: 3000 };
{
  const staleDir = '/old/elsewhere/.claude/hooks';
  const staleHook = { type: 'command', command: 'node', args: [staleDir + '/semble-reminder.mjs'], timeout: 5 };
  const seed = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [FOREIGN_HOOK, staleHook] }] } };
  const p = freshProject({ settings: JSON.stringify(seed, null, 2) + '\n' });
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('H5.exit', r.status, 0, 'merge over a mixed foreign+stale entry exits 0');
  const s = readSettings(p);
  const pre = (s.hooks || {}).PreToolUse || [];
  check('H5.mixedEntry', pre[0] || null, { matcher: 'Bash', hooks: [FOREIGN_HOOK] },
    'the mixed entry keeps the foreign hook and loses only the stale semble hook');
  check('H5.currentRow', pre[1] || null,
    { matcher: 'Bash|Grep', hooks: [{ type: 'command', command: 'node', args: [semblePaths(p).reminder], timeout: 5 }] },
    'and the current reminder row is appended beside it, on its own matcher');
  check('H5.staleGone', Object.values(s.hooks || {}).flat().filter((e) => argsOf(e).some((a) => a.startsWith(staleDir))).length, 0,
    'zero hooks still point at the old hooks dir');
  check('H5.counts', wantCounts(p, s), [1, 1, 1, 1, 1, 1], 'exactly one current entry per want row');
  check('H5.preToolUseSize', pre.length, 2,
    'PreToolUse holds exactly the repaired foreign entry and the one current reminder row');
}

// H6 — unmerge: a hand-merged foreign hook in a semble entry survives
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const s = readSettings(p);
  s.hooks.UserPromptSubmit[0].hooks.unshift(FOREIGN_HOOK);
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('H6.exit', r.status, 0, 'unmerge over a hand-merged mixed entry exits 0');
  const t = readSettings(p);
  const left = t.hooks || {};
  check('H6.foreignKept', left.UserPromptSubmit || null, [{ hooks: [FOREIGN_HOOK] }],
    'the hand-merged foreign hook survives; only the semble hook is stripped');
  check('H6.sessionGone', Object.prototype.hasOwnProperty.call(left, 'SessionStart'), false,
    'the SessionStart array emptied and its key was pruned');
  check('H6.noSemble', Object.values(left).flat().filter((e) => argsOf(e).some((a) => a.includes('semble-'))).length, 0,
    'no semble hook argument is left anywhere in settings.json');
}

// H7 — semble-remove.sh integration is an honest no-op the second time
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const first = removeIntegration(p);
  const second = removeIntegration(p);
  const j1 = safeParse(first.stdout);
  const j2 = safeParse(second.stdout);
  check('H7.exit1', first.status, 0, 'the first integration removal exits 0');
  check('H7.changed1', j1.changed, [
    'guidance: rule, CLAUDE.md block, hooks and settings entries removed',
  ], 'the first removal reports the guidance removal, once');
  check('H7.exit2', second.status, 0, 'the second integration removal exits 0');
  check('H7.changed2', j2.changed, [], 'the second removal reports an empty changed list');
  check('H7.unchanged2', j2.unchanged, [
    'guidance: rule, CLAUDE.md block, hooks and settings entries already absent',
    'agents: no semble tool entries to revert',
    `state: ${join(p, '.claude', 'semble')} absent`,
    'mcp registration, cache and uv tool retained',
  ], 'every step of the second removal is reported as unchanged');
}

// ═══════════════════════════════════════════════════════════════════════════
// I. field-level reconciliation, drift-aware status, verified .gitignore
// ═══════════════════════════════════════════════════════════════════════════

// Rewrite every hook timeout in the file and return the drifted bytes.
function driftTimeouts(p, value) {
  const s = readSettings(p);
  for (const ev of Object.keys(s.hooks)) {
    for (const e of s.hooks[ev]) for (const h of e.hooks) h.timeout = value;
  }
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
}

// I1 — a pre-4.7.0 `timeout: 5000` install is repaired in place, not skipped
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const clean = readRaw(settingsPath(p));
  driftTimeouts(p, 5000);
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I1.exit', r.status, 0, 'a re-run over a drifted install exits 0');
  const t = readSettings(p);
  check('I1.timeouts', Object.values(t.hooks).flat().flatMap((e) => e.hooks.map((h) => h.timeout)),
    [5, 5, 5, 5, 5, 5], 'every drifted timeout:5000 is rewritten to the contract value 5 seconds');
  check('I1.bytes', readRaw(settingsPath(p)), clean,
    'the repaired file is byte-identical to a clean install - repair, not append');
  const j = safeParse(r.stdout);
  check('I1.reported', j.changed.filter((l) => l.startsWith('settings:')),
    [`settings: hooks merged in ${settingsPath(p)}`],
    'the repair is reported as changed, never as an already-merged no-op');
  const j2 = safeParse(guidance(p, ['install', '--part', 'hooks', '--json']).stdout);
  check('I1.idempotent', j2.changed, [], 'the run after the repair changes nothing');
}

// I2 — the real broken shape: drifted rows plus one missing outright
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const clean = readRaw(settingsPath(p));
  const s = readSettings(p);
  delete s.hooks.UserPromptSubmit;                         // installed before 5.0.0 shipped the row
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  driftTimeouts(p, 5000);
  const before = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I2.statusBefore',
    [before.hooks.wiredCount, before.hooks.wantCount, before.hooks.driftedCount, before.hooks.missingCount],
    [0, WANT_N, WANT_N - 1, 1], 'status calls the real broken shape 0/6 wired, 5 drifted, 1 missing');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I2.exit', r.status, 0, 'the repair run exits 0');
  // Key ORDER differs by construction here and only here: UserPromptSubmit was
  // deleted outright, so the merge re-appends it after the later want rows. Every value must
  // still be identical to a clean install - repair, not append.
  const canon = (raw) => {
    const o = JSON.parse(raw);
    if (o.hooks) o.hooks = Object.fromEntries(Object.entries(o.hooks).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    return JSON.stringify(o, null, 2) + '\n';
  };
  check('I2.bytes', canon(readRaw(settingsPath(p))), canon(clean),
    'one re-run restores the file to the clean-install content, event key order aside');
  check('I2.keySet', Object.keys(readSettings(p).hooks).sort(), Object.keys(JSON.parse(clean).hooks).sort(),
    'and to exactly the clean-install set of hook events');
  const after = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I2.statusAfter',
    [after.hooks.wiredCount, after.hooks.driftedCount, after.hooks.missingCount, after.hooks.drift.length],
    [WANT_N, 0, 0, 0], 'after the repair status reports 6/6 wired with an empty drift list');
}

// I3 — a foreign hook sharing a drifted entry survives merge AND unmerge
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { prefetch: pre } = semblePaths(p);
  const s = readSettings(p);
  s.hooks.UserPromptSubmit[0].hooks.unshift(FOREIGN_HOOK);
  s.hooks.UserPromptSubmit[0].hooks[1].timeout = 5000;     // the semble hook next to it drifted
  s.hooks.UserPromptSubmit[0].note = 'hand-edited';        // a foreign entry-level key
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I3.exit', r.status, 0, 'merge over a mixed drifted entry exits 0');
  check('I3.repaired', readSettings(p).hooks.UserPromptSubmit[0], {
    hooks: [FOREIGN_HOOK, { type: 'command', command: 'node', args: [pre], timeout: 5 }],
    note: 'hand-edited',
  }, 'only the semble hook is rewritten - the foreign hook and the foreign entry key are untouched');
  const r2 = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('I3.unmergeExit', r2.status, 0, 'unmerge over the same entry exits 0');
  check('I3.unmergeKept', readSettings(p).hooks.UserPromptSubmit,
    [{ hooks: [FOREIGN_HOOK], note: 'hand-edited' }],
    'unmerge strips only the semble hook and keeps the entry alive for the foreign one');
}

// I4 — hand-added duplicates are repaired, never left as a written-then-aborted file
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { prefetch: pre, stats } = semblePaths(p);
  const s = readSettings(p);
  const dupe = JSON.parse(JSON.stringify(s.hooks.UserPromptSubmit[0]));
  dupe.hooks[0].timeout = 5000;
  s.hooks.UserPromptSubmit.push(dupe);                     // plain duplicate
  s.hooks.PostToolUse.push({                               // duplicate carrying a foreign hook
    matcher: STATS_MATCHER,
    hooks: [FOREIGN_HOOK, { type: 'command', command: 'node', args: [stats], timeout: 9 }],
  });
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I4.exit', r.status, 0, 'a duplicated entry is repaired, not a fatal ABORT');
  check('I4.noAbort', (r.stdout + r.stderr).includes('ABORT'), false, 'nothing reports ABORT');
  const t = readSettings(p);
  check('I4.counts', wantCounts(p, t), [1, 1, 1, 1, 1, 1], 'exactly one entry per want row survives the de-duplication');
  check('I4.foreignSurvived', t.hooks.PostToolUse.filter((e) => argsOf(e).includes('/opt/foreign/guard.mjs')),
    [{ matcher: STATS_MATCHER, hooks: [FOREIGN_HOOK] }],
    'the foreign hook riding on the duplicate outlives the duplicate');
  check('I4.unusedPrefetchPath', pre.endsWith('semble-prefetch.mjs'), true,
    'the duplicated row is the prefetch one');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I4.statusClean', [a.hooks.wiredCount, a.hooks.duplicateCount], [WANT_N, 0],
    'status confirms the file is healthy afterwards');
}

// I5 — status reports drift instead of hiding it behind presence
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const clean = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I5.clean',
    [clean.hooks.wiredCount, clean.hooks.driftedCount, clean.hooks.missingCount,
      clean.hooks.duplicateCount, clean.hooks.drift.length],
    [WANT_N, 0, 0, 0, 0], 'a correct install reports 6 wired and no drift');
  check('I5.cleanEntries', clean.hooks.entries.map((e) => e.state),
    ['wired', 'wired', 'wired', 'wired', 'wired', 'wired'],
    'every want row is reported wired individually');
  const s = readSettings(p);
  s.hooks.UserPromptSubmit[0].hooks[0].timeout = 5000;
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I5.driftCounts', [a.hooks.wiredCount, a.hooks.driftedCount, a.hooks.missingCount], [WANT_N - 1, 1, 0],
    'a timeout:5000 entry is counted as drifted, never rounded up to wired');
  check('I5.driftDetail', a.hooks.drift, [{
    event: 'UserPromptSubmit', matcher: null, script: 'semble-prefetch.mjs',
    field: 'timeout', expected: 5, actual: 5000,
  }], 'the drift array names event, matcher, script and the exact field that differs');
  check('I5.prefetchWired', a.hooks.prefetch.wired, false,
    'wired means present AND conforming - the drifted prefetch row is not wired');
  check('I5.otherRows', a.hooks.entries.map((e) => e.state),
    ['wired', 'drifted', 'wired', 'wired', 'wired', 'wired'], 'only the drifted row changes state');
  check('I5.human', guidance(p, ['status']).stdout.includes('hooks 5/6 wired (1 drifted - re-run install to repair)'),
    true, 'the human line spells the drift out instead of printing 6/6');
}

// I6 — field-level, not stringify-level: key order is not drift, a missing field is
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const clean = readRaw(settingsPath(p));
  const { session } = semblePaths(p);
  const s = readSettings(p);
  s.hooks.SessionStart[0].hooks[0] = { command: 'node', args: [session], type: 'command' };  // timeout dropped
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I6.exit', r.status, 0, 'a hook missing its timeout is repaired, exit 0');
  check('I6.restored', readSettings(p).hooks.SessionStart[0].hooks[0],
    { type: 'command', command: 'node', args: [session], timeout: 5 },
    'the dropped timeout is restored to 5 and the canonical field order is written back');
  check('I6.bytes', readRaw(settingsPath(p)), clean, 'the repair reproduces the clean-install bytes');

  const t = readSettings(p);
  t.hooks.SessionStart[0].hooks[0] = { timeout: 5, args: [session], command: 'node', type: 'command' };
  const reordered = JSON.stringify(t, null, 2) + '\n';
  writeFileSync(settingsPath(p), reordered);
  const r2 = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I6.orderExit', r2.status, 0, 'a key-order-only difference exits 0');
  check('I6.orderNoRewrite', readRaw(settingsPath(p)), reordered,
    'key order alone is not drift - the entry is left byte-identical');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I6.orderStatus', [a.hooks.wiredCount, a.hooks.driftedCount], [WANT_N, 0],
    'status agrees that a reordered but equal hook is wired');
}

// I7 — the .gitignore outcome is verified, and the absent case is decided out loud
{
  // The DIRECTORY, not the throttle marker. `.claude/semble/` also holds state.json and
  // telemetry.jsonl — 1.25 MB / 5778 lines on this workspace, carrying verbatim shell
  // commands and distilled prompt text. A per-marker line left all of that untracked and
  // `git add .`-able in any repo that does not already ignore `.claude/`.
  const GI = '.claude/semble/';
  const p1 = freshProject({});                             // .gitignore exists, no line
  writeFileSync(join(p1, '.gitignore'), 'node_modules/\n');
  const j1 = safeParse(guidance(p1, ['install', '--part', 'hooks', '--json']).stdout);
  check('I7.append', j1.changed.filter((l) => l.startsWith('gitignore:')),
    [`gitignore: appended ${GI} in ${join(p1, '.gitignore')}`],
    'the append is confirmed by re-reading the file, and names it');
  check('I7.appendFile', readRaw(join(p1, '.gitignore')),
    `node_modules/\n\n# brewcode:semble\n${GI}\n`, 'the two lines land after the existing content');
  const j1b = safeParse(guidance(p1, ['install', '--part', 'hooks', '--json']).stdout);
  check('I7.appendIdempotent', j1b.unchanged.filter((l) => l.startsWith('gitignore:')),
    [`gitignore: already lists ${GI}`], 'a second install reports the line as already present');

  const p2 = freshProject({});                             // no .gitignore, but a git repo
  mkdirSync(join(p2, '.git'), { recursive: true });
  const j2 = safeParse(guidance(p2, ['install', '--part', 'hooks', '--json']).stdout);
  check('I7.create', j2.changed.filter((l) => l.startsWith('gitignore:')),
    [`gitignore: created ${GI} in ${join(p2, '.gitignore')}`],
    'inside a git repo the missing .gitignore is created, and the result is verified');
  check('I7.createFile', readRaw(join(p2, '.gitignore')), `# brewcode:semble\n${GI}\n`,
    'the created file holds exactly the marker comment and the line');

  const p3 = freshProject({});                             // no .gitignore, not a git repo
  const j3 = safeParse(guidance(p3, ['install', '--part', 'hooks', '--json']).stdout);
  check('I7.skip', j3.skipped.filter((l) => l.startsWith('gitignore:')),
    [`gitignore: no ${join(p3, '.gitignore')} and ${p3} is not a git repo - ${GI} not registered`],
    'outside a git repo the step is reported as skipped, with the reason');
  check('I7.skipNotUnchanged', j3.unchanged.filter((l) => l.startsWith('gitignore:')), [],
    'the skip is never dressed up as an unchanged success');
  check('I7.skipNoFile', existsSync(join(p3, '.gitignore')), false, 'no .gitignore is littered into a non-repo');

  const j4 = safeParse(guidance(p1, ['remove', '--part', 'hooks', '--json']).stdout);
  check('I7.remove', j4.changed.filter((l) => l.startsWith('gitignore:')),
    [`gitignore: dropped ${GI} from ${join(p1, '.gitignore')}`],
    'removal re-reads the file to confirm the line is gone');
  check('I7.removeFile', readRaw(join(p1, '.gitignore')).includes(GI), false,
    'the marker line is really gone from the file');
  check('I7.removeKept', readRaw(join(p1, '.gitignore')).startsWith('node_modules/\n'), true,
    'the pre-existing .gitignore content is preserved');

  // install -> remove -> install must be byte-idempotent. It was not: the drop
  // left a trailing blank line and the append prepended another, so every cycle
  // grew the file by one blank - a diff in the user's repo for doing nothing.
  check('I7.removeRestores', readRaw(join(p1, '.gitignore')), 'node_modules/\n',
    'removal restores the file byte for byte, with no blank line left behind');
  const cycle = [];
  for (let i = 0; i < 3; i++) {
    guidance(p1, ['install', '--part', 'hooks', '--json']);
    cycle.push(readRaw(join(p1, '.gitignore')));
    guidance(p1, ['remove', '--part', 'hooks', '--json']);
    cycle.push(readRaw(join(p1, '.gitignore')));
  }
  check('I7.cycleStable', cycle,
    [`node_modules/\n\n# brewcode:semble\n${GI}\n`, 'node_modules/\n',
      `node_modules/\n\n# brewcode:semble\n${GI}\n`, 'node_modules/\n',
      `node_modules/\n\n# brewcode:semble\n${GI}\n`, 'node_modules/\n'],
    'three install/remove cycles produce exactly two byte-identical states, never a growing blank run');

  // The same must hold when the migration drops the retired v1 line first.
  const p4 = freshProject({});
  writeFileSync(join(p4, '.gitignore'),
    `node_modules/\n\n# brewcode:semble\n.claude/semble/.reminder-ts\n`);
  guidance(p4, ['install', '--part', 'hooks', '--json']);
  check('I7.migrateFile', readRaw(join(p4, '.gitignore')),
    `node_modules/\n\n# brewcode:semble\n${GI}\n`,
    'migrating off the retired marker leaves one blank line, not two');
  guidance(p4, ['install', '--part', 'hooks', '--json']);
  check('I7.migrateStable', readRaw(join(p4, '.gitignore')),
    `node_modules/\n\n# brewcode:semble\n${GI}\n`,
    'and a second install over the migrated file changes nothing');

  // I7b — the 5.1.0 line is superseded, not kept beside the new one. An install that
  // wrote `.claude/semble/.prefetch-ts` must converge on the directory line ALONE;
  // leaving both would park a narrower duplicate in the user's repo forever.
  const p5 = freshProject({});
  writeFileSync(join(p5, '.gitignore'),
    'node_modules/\n\n# brewcode:semble\n.claude/semble/.prefetch-ts\n');
  guidance(p5, ['install', '--part', 'hooks', '--json']);
  check('I7b.supersede', readRaw(join(p5, '.gitignore')),
    `node_modules/\n\n# brewcode:semble\n${GI}\n`,
    'the superseded .prefetch-ts line is dropped and the directory line takes its place - never both');
  guidance(p5, ['remove', '--part', 'hooks', '--json']);
  check('I7b.remove', readRaw(join(p5, '.gitignore')), 'node_modules/\n',
    'remove strips exactly what install now writes, and nothing the user put there');
  const cycle5 = [];
  for (let i = 0; i < 2; i++) {
    guidance(p5, ['install', '--part', 'hooks', '--json']);
    cycle5.push(readRaw(join(p5, '.gitignore')));
    guidance(p5, ['remove', '--part', 'hooks', '--json']);
    cycle5.push(readRaw(join(p5, '.gitignore')));
  }
  check('I7b.cycleStable', cycle5,
    [`node_modules/\n\n# brewcode:semble\n${GI}\n`, 'node_modules/\n',
      `node_modules/\n\n# brewcode:semble\n${GI}\n`, 'node_modules/\n'],
    'and two install/remove cycles over the migrated file produce exactly two byte-identical states');
}

// I8 — a corrupt hook asset never lands installed, and never lands wired.
// `node --check` used to run AFTER the copy, so a broken asset was reported failed and
// then left on disk AND registered in settings.json: every prompt of the user's next
// session ran a hook Claude Code cannot parse. The check now runs on a staged copy.
{
  const STATS_ASSET = join(SKILL_COPY, 'assets', 'semble-stats.mjs');
  const GOOD = readFileSync(STATS_ASSET, 'utf8');
  const BROKEN = 'export function (\n';                      // a syntax error in ESM and CJS alike

  const p = freshProject({});
  writeFileSync(STATS_ASSET, BROKEN);
  const j = safeParse(guidance(p, ['install', '--part', 'hooks', '--json']).stdout);
  const { session, prefetch: pre, stats } = semblePaths(p);
  check('I8.failed', j.failed.filter((l) => l.startsWith('hooks:')),
    [`hooks: cannot install ${stats}`], 'the broken asset is reported failed exactly once, by full path');
  check('I8.absent', existsSync(stats), false,
    'and it is NOT on disk: the check runs on the staged copy, before the move into place');
  check('I8.noStageLeft', readdirSync(hooksDirOf(p)).filter((f) => f.includes('semble-staging')), [],
    'the rejected staging file is deleted, not left as litter beside the real hooks');
  check('I8.siblings', [existsSync(session), existsSync(pre)], [true, true],
    'the two valid hooks still install — one bad asset is not a whole-install failure');
  check('I8.unwired', JSON.stringify(readSettings(p)).includes('semble-stats.mjs'), false,
    'and NOTHING in settings.json points at the file that is not there');
  check('I8.siblingsWired', Object.keys(readSettings(p).hooks).sort(),
    ['PreToolUse', 'SessionStart', 'SubagentStart', 'UserPromptSubmit'],
    'only the events whose hook file actually exists are wired - the two stats events are'
    + ' the only ones missing, because semble-stats.mjs is the broken asset');

  // A broken asset arriving OVER a good install: the working copy is kept byte for
  // byte and stays wired. Rolling a user back to no hook is worse than no upgrade.
  const q = freshProject({});
  writeFileSync(STATS_ASSET, GOOD);
  guidance(q, ['install', '--part', 'hooks', '--json']);
  const beforeFile = readRaw(semblePaths(q).stats);
  const beforeSettings = readRaw(settingsPath(q));
  writeFileSync(STATS_ASSET, BROKEN);
  const j2 = safeParse(guidance(q, ['install', '--part', 'hooks', '--json']).stdout);
  check('I8.upgradeFailed', j2.failed.filter((l) => l.startsWith('hooks:')),
    [`hooks: cannot install ${semblePaths(q).stats}`], 'the failed upgrade is reported the same way');
  check('I8.upgradeKeepsFile', readRaw(semblePaths(q).stats), beforeFile,
    'the previous, valid copy is left byte-identical');
  check('I8.upgradeKeepsWiring', readRaw(settingsPath(q)), beforeSettings,
    'and stays wired — a hook that is on disk and parses is not unwired by a bad release');
  writeFileSync(STATS_ASSET, GOOD);
}

// ═══════════════════════════════════════════════════════════════════════════
// M. migration off the v1 hook layer
//
// The single most breakable part of the installer. A user upgrading from 4.x has
// a settings.json full of rows in shapes the want table no longer uses, and an
// orphan .mjs on disk. `wanted` is built from the want table as (event, matcher,
// path) TRIPLES while ownership is decided by SG_MARKS, so a retired basename or
// a retired REGISTRATION is still recognised as ours (and purged) without ever
// being re-added. Building `wanted` from the marks list was the pre-5.0.0 bug
// that made retired rows immortal.
//
// The v1 rows do not merely disappear here: PreToolUse/Bash + PreToolUse/Grep
// collapse into one PreToolUse/`Bash|Grep` row, and SubagentStart/`Explore`
// becomes a matcher-less SubagentStart row on semble-subagent.mjs. Replaced,
// never left standing beside the new one, never silently kept.
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = freshProject({});
  const d = hooksDirOf(p);
  mkdirSync(d, { recursive: true });
  const { session, stats, reminder: rem, subagent: sub, explore: exp } = semblePaths(p);
  const H = (f, t) => ({ type: 'command', command: 'node', args: [f], timeout: t === undefined ? 5 : t });
  // Exactly the shape 4.x left behind, down to the stats matcher predating `|Read`.
  const OLD_STATS = 'mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob';
  writeFileSync(settingsPath(p), JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [H(session)] }],
      PreToolUse: [
        { matcher: 'Write', hooks: [FOREIGN_HOOK] },
        { matcher: 'Bash', hooks: [H(rem)] },
        { matcher: 'Grep', hooks: [H(rem)] },
      ],
      SubagentStart: [{ matcher: 'Explore', hooks: [H(exp)] }],
      PostToolUse: [{ matcher: OLD_STATS, hooks: [H(stats)] }],
      PostToolUseFailure: [{ matcher: OLD_STATS, hooks: [H(stats)] }],
    },
    permissions: { allow: ['mcp__semble_code__search', 'mcp__semble_code__find_related'] },
  }, null, 2) + '\n');
  for (const f of [session, stats, rem, exp]) writeFileSync(f, '// v1 leftover\n');
  writeFileSync(join(p, '.gitignore'), 'node_modules/\n.claude/semble/.reminder-ts\n');
  mkdirSync(join(p, '.claude', 'semble'), { recursive: true });
  writeFileSync(join(p, '.claude', 'semble', '.reminder-ts'), '{"t":1}');

  const before = safeParse(guidance(p, ['status', '--json']).stdout);
  check('M1.retiredSeen', before.hooks.retired, ['semble-explore.mjs'],
    'status names the ONE retired file it can see on disk; semble-reminder.mjs is live again'
    + ' and is reported as a live hook, not as a leftover');
  check('M1.wiredBefore', [before.hooks.wiredCount, before.hooks.wantCount], [1, WANT_N],
    'only SessionStart carries over: prefetch did not exist, both stats rows sit on the'
    + ' pre-5.0.0 matcher, and the two v1 reminder rows and the Explore row are all on'
    + ' matchers the want table does not use');
  check('M1.staleBefore', before.hooks.staleEntries, 5,
    'five owned entries are wired somewhere the want table does not want them - the two'
    + ' v1 reminder rows, the Explore row, and BOTH stats rows on the retired matcher');

  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('M2.exit', r.status, 0, 'install over a v1-shaped settings file exits 0');
  const s = readSettings(p);
  check('M2.counts', wantCounts(p, s), [1, 1, 1, 1, 1, 1], 'every current want row is wired exactly once');
  check('M2.noRetiredPath', JSON.stringify(s).includes('semble-explore.mjs'), false,
    'the retired basename survives nowhere in settings.json - the whole point of the migration');
  check('M2.subagentStartRow', s.hooks.SubagentStart,
    [{ hooks: [{ type: 'command', command: 'node', args: [sub], timeout: 5 }] }],
    'the SubagentStart/Explore row is REPLACED by the matcher-less subagent row - one row,'
    + ' not the old one plus the new one, and not an empty [] husk');
  check('M2.preToolUseRows', s.hooks.PreToolUse,
    [{ matcher: 'Write', hooks: [FOREIGN_HOOK] },
      { matcher: 'Bash|Grep', hooks: [{ type: 'command', command: 'node', args: [rem], timeout: 5 }] }],
    'the two v1 reminder rows collapse into ONE Bash|Grep row and the foreign Write entry is'
    + ' untouched - the purge is ours-only, per entry');
  check('M2.filesGone', existsSync(exp), false,
    'the orphan semble-explore.mjs is deleted from .claude/hooks');
  check('M2.filesKept', [existsSync(session), existsSync(semblePaths(p).prefetch), existsSync(stats),
    existsSync(rem), existsSync(sub)], [true, true, true, true, true],
  'and all five live hooks are on disk - the v1 reminder stub was overwritten by the shipped asset');
  check('M2.statsMatchers', s.hooks.PostToolUse.map((e) => e.matcher), [STATS_MATCHER],
    'ONE PostToolUse row, on the current matcher: a surviving pre-5.0.0 row would fire the'
    + ' observer a second time on every Bash and silently double the denominator');
  check('M2.statsFailureMatchers', s.hooks.PostToolUseFailure.map((e) => e.matcher), [STATS_MATCHER],
    'and the same on the failure event');
  const changed = (safeParse(r.stdout) || {}).changed || [];
  check('M2.reported', [changed.includes('hooks: removed retired ' + exp),
    changed.includes('hooks: installed ' + rem)], [true, true],
  'install reports the deletion AND the reinstatement by full path, never silently');

  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('M3.after', [a.hooks.wiredCount, a.hooks.wantCount, a.hooks.driftedCount,
    a.hooks.missingCount, a.hooks.duplicateCount, a.hooks.staleEntries],
  [WANT_N, WANT_N, 0, 0, 0, 0], 'the migrated project is indistinguishable from a fresh install');
  check('M3.retiredEmpty', a.hooks.retired, [], 'nothing retired is left to report');
  check('M3.retiredMarkerGone', existsSync(join(p, '.claude', 'semble', '.reminder-ts')), false,
    'the v1 throttle marker goes even though the reminder hook is back: the restored hook counts in '
    + '.claude/semble/reminder.json, and .reminder-ts has no writer left, so a file kept here would '
    + 'be an untracked diff for nothing');
  check('M3.gitignore', readFileSync(join(p, '.gitignore'), 'utf8'),
    'node_modules/\n\n# brewcode:semble\n.claude/semble/\n',
    'the retired .reminder-ts line is DROPPED and the directory line added - never both,'
    + ' and never an orphan ignore line for a file nothing writes any more');

  const snap = readRaw(settingsPath(p));
  guidance(p, ['install', '--part', 'hooks', '--json']);
  check('M4.idempotent', readRaw(settingsPath(p)), snap,
    'a second install over the migrated file is byte-identical - migration converges in one pass');
}

// M5 — a v1 install whose retired ROWS are gone but whose FILES linger
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { explore: exp } = semblePaths(p);
  writeFileSync(exp, '// orphan\n');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('M5.seen', [a.hooks.retired, a.hooks.wiredCount], [['semble-explore.mjs'], WANT_N],
    'an orphan file is reported even when settings.json is already perfect');
  guidance(p, ['install', '--part', 'hooks', '--json']);
  check('M5.swept', [existsSync(exp),
    safeParse(guidance(p, ['status', '--json']).stdout).hooks.retired], [false, []],
  'and install sweeps it - file cleanup does not depend on a matching settings row');
}

// M6 — remove/uninstall knows the retired names too
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { session, prefetch: pre, stats, reminder: rem, subagent: sub, explore: exp } = semblePaths(p);
  const s = readSettings(p);
  s.hooks.SubagentStart = [{ matcher: 'Explore', hooks: [{ type: 'command', command: 'node', args: [exp], timeout: 5 }] }];
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  writeFileSync(exp, '// orphan\n');
  mkdirSync(join(p, '.claude', 'semble'), { recursive: true });
  for (const m of ['.prefetch-ts', '.reminder-ts']) {
    writeFileSync(join(p, '.claude', 'semble', m), '{"t":1}');
  }
  guidance(p, ['remove', '--part', 'all', '--json']);
  const t = readSettings(p);
  check('M6.settings', JSON.stringify(t.hooks || {}), '{}',
    'unmerge reads the FULL ownership list, so a hand-restored retired row is removed too');
  check('M6.files', [session, pre, stats, rem, sub, exp].map((f) => existsSync(f)),
    [false, false, false, false, false, false], 'and every owned .mjs goes, live or retired');
  check('M6.markers', ['.prefetch-ts', '.reminder-ts']
    .map((f) => existsSync(join(p, '.claude', 'semble', f))), [false, false],
  'and so do both throttle markers - remove drops their .gitignore line, so anything left '
    + 'behind resurfaces as an untracked file');
}

// ═══════════════════════════════════════════════════════════════════════════
// N. a release must not look like a user edit  (defect b)
//
// bump-version.sh stamps `# brewcode-meta: version=X.Y.Z` into line 1 of
// sembleignore.template. `install_ignore` used to compare with `cmp -s`, so
// EVERY version bump flipped every installed .sembleignore to `user_modified`
// and it silently stopped being updated. The compare now runs in `metaline`
// mode: the meta comment is stripped from BOTH sides first.
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'ignore', '--json']);
  const f = join(p, '.sembleignore');
  check('N1.managed', safeParse(guidance(p, ['status', '--json']).stdout).ignore.state, 'managed',
    'a fresh install is managed');

  // Simulate a release: rewrite ONLY the stamp line of the shipped template.
  const tpl = join(SKILL_COPY, 'assets', 'sembleignore.template');
  const orig = readFileSync(tpl, 'utf8');
  const bumped = orig.replace(/^# brewcode-meta: version=[^\s]+/m, '# brewcode-meta: version=99.9.9');
  check('N2.stampMoved', bumped !== orig, true, 'the fixture really did change line 1');
  writeFileSync(tpl, bumped);
  check('N2.stillManaged', safeParse(guidance(p, ['status', '--json']).stdout).ignore.state, 'managed',
    'a version bump ALONE must never make an untouched .sembleignore look user-modified');

  // A real edit still registers, bumped stamp or not.
  appendFileSync(f, '\n# my own rule\nvendor/\n');
  check('N3.userModified', safeParse(guidance(p, ['status', '--json']).stdout).ignore.state, 'user_modified',
    'appending a real line is still detected as a user edit');

  // And because it was never mistaken for one, the bumped template lands.
  writeFileSync(f, readFileSync(f, 'utf8').replace('\n# my own rule\nvendor/\n', ''));
  guidance(p, ['install', '--part', 'ignore', '--json']);
  check('N4.updated', readFileSync(f, 'utf8'), bumped,
    'install over the unmodified file writes the new template through, stamp included');
  writeFileSync(tpl, orig);
}

// ═══════════════════════════════════════════════════════════════════════════
// O. upgrade must be able to CLEAR staleness, and uninstall must not lie
//
// Four review waves checked that INSTALL stamps correctly and none checked that
// a stamp can ever CHANGE. `setup-status` row 2 reads this install's version out
// of the frontmatter of .claude/rules/semble-first.md, and semble-guidance.sh is
// its only writer - so an `upgrade` that never calls the script reported success,
// left the stamp where it was, and the next `status` printed `stale` forever.
// Same omission kept the two v5.0.0-retired hooks on disk indefinitely.
// ═══════════════════════════════════════════════════════════════════════════

// O1 — the release loop: bumped template + retired hooks -> ONE guidance install
//      restamps the rule and deletes both retired files.
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const rule = join(p, '.claude', 'rules', 'semble-first.md');
  const { explore: exp } = semblePaths(p);
  const verOf = (f) => (readFileSync(f, 'utf8').match(/^version: "([^"]+)"/m) || [])[1];
  const installed = verOf(rule);
  check('O1.installed', typeof installed === 'string' && /^\d+\.\d+\.\d+$/.test(installed), true,
    'the fresh install carries the template\'s baked X.Y.Z stamp');

  // pre-5.0.0 install: the one retired advisory hook still on disk
  writeFileSync(exp, '// legacy advisory hook, superseded by semble-subagent.mjs\n');

  // simulate the release: bump ONLY the baked stamp of the shipped template
  const tpl = join(SKILL_COPY, 'assets', 'semble-first.md.template');
  const orig = readFileSync(tpl, 'utf8');
  writeFileSync(tpl, orig.replace(/^version: "[^"]+"/m, 'version: "99.9.9"'));
  check('O1.stale', verOf(rule), installed, 'before the upgrade the installed rule still reads the OLD version');

  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('O1.exit', r.status, 0, 'the upgrade run exits 0');
  check('O1.restamped', verOf(rule), '99.9.9',
    'the rule frontmatter now reads the NEW version - this is what clears `stale`');
  check('O1.resync', safeParse(r.stdout).changed.filter((l) => l.startsWith('rule:')),
    [`rule: re-synced ${rule} (metadata only)`],
    'and it took the metadata-only re-sync branch, not a forced overwrite');
  check('O1.retiredGone', existsSync(exp), false,
    'the same run deletes the retired hook');
  check('O1.byteIdentical', readFileSync(rule, 'utf8'), readFileSync(tpl, 'utf8'),
    'the restamped rule is byte-identical to the template, so setup-status cmp still reads SAME');

  const second = guidance(p, ['install', '--part', 'all', '--json']);
  check('O1.idempotent', safeParse(second.stdout).changed, [],
    'a second upgrade at the same version changes nothing');
  writeFileSync(tpl, orig);
}

// O2 — a hand-edited rule is NEVER restamped behind the user's back
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const rule = join(p, '.claude', 'rules', 'semble-first.md');
  appendFileSync(rule, '\n## my own section\n');
  const mine = readFileSync(rule, 'utf8');
  const tpl = join(SKILL_COPY, 'assets', 'semble-first.md.template');
  const orig = readFileSync(tpl, 'utf8');
  writeFileSync(tpl, orig.replace(/^version: "[^"]+"/m, 'version: "99.9.9"'));
  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('O2.untouched', readFileSync(rule, 'utf8'), mine,
    'the hand-edited rule survives the upgrade byte for byte');
  check('O2.reported', safeParse(r.stdout).skipped.some((l) => l.startsWith('rule: user_modified')), true,
    'and the run says so, instead of silently leaving a stale stamp');
  writeFileSync(tpl, orig);
}

// O3 — the sibling-less fallback removal path leaves no registered hook behind.
//      It deleted session + prefetch but not stats, so an uninstall left a wired
//      semble-stats.mjs on disk.
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { session, prefetch: pre, stats, reminder: rem, explore: exp } = semblePaths(p);
  writeFileSync(rem, '// orphan\n');
  writeFileSync(exp, '// orphan\n');

  // A scripts dir holding semble-remove.sh and its lib but NO semble-guidance.sh.
  const lone = join(BASE, 'lone-remove');
  mkdirSync(join(lone, 'lib'), { recursive: true });
  copyFileSync(REMOVE_COPY, join(lone, 'semble-remove.sh'));
  copyFileSync(join(SKILL_COPY, 'scripts', 'lib', 'semble-common.sh'), join(lone, 'lib', 'semble-common.sh'));
  const r = spawnSync('bash', [join(lone, 'semble-remove.sh'), 'integration', '--yes', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SEMBLE_PROJECT_ROOT: p, SEMBLE_TEST_HOME: HOME, SEMBLE_NO_NETWORK: '1' },
    timeout: 30000,
  });
  check('O3.exit', r.status, 0, 'the fallback removal exits 0');
  check('O3.files', [session, pre, stats, rem, exp].map((f) => existsSync(f)), [false, false, false, false, false],
    'every owned hook file goes - semble-stats.mjs included, or uninstall orphans a REGISTERED hook');
  check('O3.ignore', existsSync(join(p, '.sembleignore')), false,
    'and the repo-root .sembleignore goes with them');
}

// O4 — the confirmation plan must not under-report what the run deletes
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const planOf = (flavour) => {
    const r = spawnSync('bash', [REMOVE_COPY, flavour, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, SEMBLE_PROJECT_ROOT: p, SEMBLE_TEST_HOME: HOME, SEMBLE_NO_NETWORK: '1' },
      timeout: 30000,
    });
    return { status: r.status, would: safeParse(r.stdout || '{}').wouldDelete || [] };
  };
  for (const flavour of ['integration', 'purge']) {
    const { status, would } = planOf(flavour);
    check(`O4.${flavour}.exit`, status, 4, `${flavour} without confirmation exits 4 and deletes nothing`);
    const named = (needle) => would.some((l) => l.includes(needle));
    check(`O4.${flavour}.plan`,
      ['.sembleignore', 'semble-session.mjs', 'semble-prefetch.mjs', 'semble-stats.mjs',
        'semble-reminder.mjs', 'semble-subagent.mjs', 'semble-explore.mjs'].map(named),
      [true, true, true, true, true, true, true],
      'the plan names every file the run really removes - a user confirms this list');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nsuite-hooks (unit D)');
console.log(`  base: ${BASE}`);
console.log(`  semble-common.sh: ${usedRealLib ? 'real (unit B)' : 'local stub (unit B has not landed)'}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
