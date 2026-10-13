#!/usr/bin/env node
// suite-hooks.mjs — rule, .sembleignore, CLAUDE.md block, live hooks (session, stats, subagent), settings merge.
// Retired explore/reminder/prefetch: migration only. Hermetic temp base; unconditional exact checks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync,
  readdirSync, realpathSync, statSync, chmodSync, appendFileSync, symlinkSync, rmSync,
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
const STATS_SRC = join(ASSETS, 'semble-stats.mjs');
const SUBAGENT_SRC = join(ASSETS, 'semble-subagent.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-d-')));
process.on('exit', () => {
  try { rmSync(BASE, { recursive: true, force: true }); } catch { /* best effort */ }
});
const HOME = join(BASE, 'home');
mkdirSync(join(HOME, '.claude'), { recursive: true });

// Hooks read the ACTIVE profile's MCP registration; every spawn inherits this fixture
// profile (server registered, user scope), never the developer's own ~/.claude.json.
const CFG = join(BASE, 'cfg');
const MCP_ENTRY = { type: 'stdio', command: 'uvx', args: ['--from', 'semble[mcp]==0.6.2', 'semble'], alwaysLoad: true };
mkdirSync(CFG, { recursive: true });
writeFileSync(join(CFG, '.claude.json'), JSON.stringify({ mcpServers: { semble_code: MCP_ENTRY } }));
process.env.CLAUDE_CONFIG_DIR = CFG;
// A profile without the server, and the one routing line (X9) every steering hook must carry verbatim.
const CFG_NONE = join(BASE, 'cfg-none');
mkdirSync(CFG_NONE, { recursive: true });
writeFileSync(join(CFG_NONE, '.claude.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
const ROUTE_TEXT = 'Search routing: intent/behaviour -> semble; symbol definitions/references -> LSP; '
  + 'literals/paths/regex/counts -> rg.';

// Fixture cache root + the four index files semble writes under `<root>/<repoHash>/<variant>`.
const CACHE = join(BASE, 'cache');
const REPO_HASH = 'abcdef0123456789'.repeat(4);
const INDEX_FILE_NAMES = ['chunks.json', 'metadata.json', 'bm25_index', 'semantic_index'];
function warmIndex(root, hash, only, leaf = 'index-code-config-docs') {
  const dir = join(root, hash, leaf);
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

// Unparseable stdin -> hook falls back to process.cwd(): a state-less temp dir, so the repo's .claude/semble/state.json never answers.
// CLAUDE_PROJECT_DIR outranks the walk -> dropped unless passed; SS01 sets it to test its precedence.
function runNode(script, stdinStr, cwd = BASE, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (!Object.prototype.hasOwnProperty.call(extraEnv, 'CLAUDE_PROJECT_DIR')) delete env.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [script], {
    input: stdinStr,
    encoding: 'utf8',
    env,
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

// ── skill copy under the temp base (never the repo tree), REAL <plugin>/skills/semble-setup/ layout:
// scripts/lib/semble-common.sh walks four levels up to <plugin>/.claude-plugin/plugin.json (flat -> "unknown").
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
  'semble-session.mjs', 'semble-stats.mjs', 'semble-subagent.mjs']) {
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

// Rule = mechanism-(a) byte copy: bump-version.sh bakes the stamp into the template -> installed == template.
// No `last_updated`: an install-time date would make setup-status's `cmp` read DIFFERS forever.
const META_KEYS = ['doc_type', 'version', 'generated_by', 'last_updated'];
const metaOf = (t) => Object.fromEntries(META_KEYS
  .map((k) => [k, (new RegExp(`^${k}: (.*)$`, 'm').exec(t.split('\n---\n')[0] || '') || [])[1] ?? null]));

let projSeq = 0;
// fixture project -> the cache root its state.json points at.
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
    // OWN cache root per fixture: the shared repo hash would let a `cold: true` seed hit another's warm index.
    const st = safeParse(seed.state);
    const own = st && st.cacheRoot === CACHE;
    const text = own ? JSON.stringify({ ...st, cacheRoot: join(CACHE, `proj${projSeq}`) }) : seed.state;
    writeFileSync(join(dir, '.claude', 'semble', 'state.json'), text);
    const eff = safeParse(text);
    if (eff && typeof eff.cacheRoot === 'string') projCache.set(dir, eff.cacheRoot);
    // Warm under the hash the hook computes from the project path, NOT state.json's (that field is ignored now).
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

// SEMBLE_NO_CANDIDATES=1 by default: measured candidates would tie unrelated checks to each fixture's file mix.
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

// Want table: SessionStart, the stats pair, SubagentStart with NO matcher (= every agent type).
const WANT_N = 4;
const STATS_MATCHER = 'mcp__semble_code__search|mcp__semble_code__find_related|Bash|Grep|Glob|Read';
// Portable exec-form arg the merge writes (CC substitutes it per arg); file paths stay absolute on disk.
const WIRE = '${CLAUDE_PROJECT_DIR}/.claude/hooks';
const wirePaths = () => ({
  session: WIRE + '/semble-session.mjs', stats: WIRE + '/semble-stats.mjs', subagent: WIRE + '/semble-subagent.mjs',
});
// One count per want row, in want-table order.
function wantCounts(proj, s) {
  const { session, stats, subagent } = wirePaths();
  return [
    countEntry(s, 'SessionStart', null, session),
    countEntry(s, 'PostToolUse', STATS_MATCHER, stats),
    countEntry(s, 'PostToolUseFailure', STATS_MATCHER, stats),
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
    // retired: addressable because migration tests assert their deletion
    explore: join(d, 'semble-explore.mjs'),
  };
}

const READY_STATE = (extra) =>
  JSON.stringify({
    schema: 1,
    profile: 'code',
    projectRoot: '/x',
    approvedVersion: '0.6.2',
    phase: 'ready',
    enabled: true,
    scope: 'user',
    cacheRoot: CACHE,
    repoHash: REPO_HASH,
    completed: ['mcp'],
    ...(extra || {}),
  });


// ═══ A. settings.json merge ═══

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
  const wire = wirePaths();
  check('A1.sessionEntry', s.hooks.SessionStart, [
    { hooks: [{ type: 'command', command: 'node', args: [wire.session], timeout: 5 }] },
  ], 'SessionStart entry has the exact contract shape, a portable ${CLAUDE_PROJECT_DIR} arg and a 5 s timeout');
  check('A1.events', Object.keys(s.hooks).sort(),
    ['PostToolUse', 'PostToolUseFailure', 'SessionStart', 'SubagentStart'],
    'no UserPromptSubmit/PreToolUse registration: reminder and prefetch are retired');
  check('A1.subagentEntry', s.hooks.SubagentStart, [
    { hooks: [{ type: 'command', command: 'node', args: [wire.subagent], timeout: 5 }] },
  ], 'the subagent hook carries NO matcher, which is the only form that covers every agent type');
  check('A1.perm', s.permissions.allow, ['mcp__semble_code__search', 'mcp__semble_code__find_related'],
    'both MCP tool names land in permissions.allow');
  check('A1.files', [existsSync(session), existsSync(stats), existsSync(sub)], [true, true, true],
    'all three live .mjs assets were copied into .claude/hooks');
  check('A1.noRetiredFiles', [existsSync(exp), existsSync(pre), existsSync(rem)], [false, false, false],
    'and no retired asset is ever written');
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
  check('A2.counts', wantCounts(p, s), [1, 1, 1, 1], 'exactly one entry per want row after three merges');
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
  check('A3.counts', wantCounts(p, s), [1, 1, 1, 1],
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
  check('A5.counts', wantCounts(p, s), [1, 1, 1, 1], 'the new-dir entries were added exactly once each');
  check('A5.foreign', s.hooks.PreToolUse.filter((e) => argsOf(e).includes('/opt/foreign/other.mjs')).length, 1,
    'the foreign Write entry survived the stale-path purge');
  check('A5.reminderMigrated', s.hooks.PreToolUse.map((e) => e.matcher), ['Write'],
    'the retired reminder row is dropped; only the foreign Write entry stays on PreToolUse');
}

// A6 — uninstall leaves zero markers and prunes empty containers
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { session, prefetch: pre, stats, reminder: rem, subagent: sub } = semblePaths(p);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('A6.exit', r.status, 0, 'remove --part all exits 0');
  check('A6.settingsGone', [existsSync(settingsPath(p)), existsSync(settingsPath(p) + '.lock')], [false, false],
    'install created settings.json with semble entries only, so the unwire deletes it (no {} left) and releases the lock');
  check('A6.files', [existsSync(session), existsSync(pre), existsSync(stats),
    existsSync(rem), existsSync(sub)], [false, false, false, false, false],
  'every owned .mjs (live and retired) is absent');
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
    [b.hooks.session.wired, b.hooks.stats.wired, b.hooks.subagent.wired, b.permissions.wired],
    [false, false, false, false], 'nothing is reported as wired before install');
  guidance(p, ['install', '--part', 'all', '--json']);
  const after = guidance(p, ['status', '--json']);
  const a = safeParse(after.stdout);
  check('A8.afterRule', a.rule.state, 'managed', 'status reports the rule as managed after install');
  check('A8.afterClaudeMd', a.claudeMd.state, 'present', 'status reports the CLAUDE.md block as present');
  check('A8.afterWired',
    [a.hooks.session.wired, a.hooks.stats.wired, a.hooks.subagent.wired, a.permissions.wired],
    [true, true, true, true],
    'session, stats (both post-tool events), subagent and permissions all report wired');
  check('A8.afterFiles', [a.hooks.session.file, a.hooks.stats.file, a.hooks.subagent.file,
    a.hooks.prefetch, a.hooks.reminder],
  ['present', 'present', 'present', undefined, undefined],
  'status sees the three live files and has no row for the dropped hooks');
  check('A8.retired', [a.hooks.retired, a.hooks.retiredWired], [[], []], 'and no retired file or registration is left');
  check('A8.stale', a.hooks.staleEntries, 0, 'no stale entries after a clean install');
  check('A8.wiredCount', [a.hooks.wiredCount, a.hooks.wantCount], [WANT_N, WANT_N],
    'all 4 settings entries are counted as wired');
  check('A8.exitReadOnly', before.status, 0, 'status exits 0');
}

// A9 — a half-wired install is reported honestly, never rounded up
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { subagent: sub } = semblePaths(p);
  const s = readSettings(p);
  delete s.hooks.SubagentStart;                       // the other rows stay wired
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('A9.wiredCount', [a.hooks.wiredCount, a.hooks.wantCount], [WANT_N - 1, WANT_N],
    'dropping the SubagentStart entry reports 3 of 4, not "wired"');
  check('A9.subagentWired', [a.hooks.session.wired, a.hooks.stats.wired, a.hooks.subagent.wired],
    [true, true, false], 'only the subagent entry is reported as unwired');
  check('A9.subagentFileStillThere', [a.hooks.subagent.file, existsSync(sub)], ['present', true],
    'the file is still on disk — file presence and wiring are reported separately');
  const human = guidance(p, ['status']).stdout;
  check('A9.human', human.includes('hooks 3/4 wired'), true,
    'the human line spells the partial count out as 3/4');
}

// A10 — remove takes the subagent registration with the file
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'hooks', '--json']);
  const { subagent: sub } = semblePaths(p);
  const r = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('A10.exit', r.status, 0, 'remove --part hooks exits 0');
  check('A10.registrationGone', existsSync(settingsPath(p)), false,
    'every registration was semble-only, so the emptied settings.json is deleted');
  check('A10.fileGone', existsSync(sub), false, 'the subagent .mjs is deleted too');
}

// ═══ B. rule file policy ═══
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

// B5. --force restores the template byte for byte; local frontmatter survives only in the backup (`cmp` identity).
// GIVEN rule with local doc_type, extra key, note | WHEN install --force | THEN file == template, one backup == user file
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

// B6. legacy stamp (installer-written `last_updated`, older `version`): 4 metadata keys stripped before the verdict.
// GIVEN rule stamped 4.0.0 + last_updated | WHEN status, install | THEN managed, re-synced to template, 1 change, no backup
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

// Template content — FACTS every generated call needs, not sentences: the J9 size budget rewrites wording each pass.
// GIVEN shipped rule template | WHEN scanned | THEN repo required + absolute, no `line` field, exact fields, rg kept, no watcher
{
  const has = (...alts) => alts.some((s) => TPL_TEXT.includes(s));
  check('B4.repoRequired', has('`repo` REQUIRED on both', '`repo` is REQUIRED on both'), true,
    'the rule teaches that repo is required on both tools');
  check('B4.absolute', has('absolute project root', 'absolute path of the project root'), true,
    'the rule teaches that repo is an absolute project-root path');
  check('B4.neverInferred', TPL_TEXT.includes('never inferred'), true,
    'and that it is never inferred from the session cwd');
  check('B4.startEnd', has('no `line` field') && TPL_TEXT.includes('`start_line`'), true,
    'the rule states there is no line field on a result and names what to open instead');
  check('B4.fields', has('file_path,start_line,end_line,score,content',
    '`file_path`, `start_line`, `end_line`, `score`'), true,
  'the rule lists the exact result fields');
  check('B4.rgKept', has('`rg -l`/`-c`') && TPL_TEXT.includes('regex'), true,
    'the rule preserves exact rg/Grep usage');
  check('B4.noWatcher', TPL_TEXT.includes('no watcher'), true,
    'the rule denies the non-existent watcher');
}

// ═══ J. .sembleignore — same managed-file policy as the rule, no frontmatter ═══
// semble 0.5.5 index/file_walker.py reads only ./.gitignore + ./.sembleignore (no ~/.gitignore_global) -> sole lever; 871 -> 590 files.
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
// ═══ J3. measured per-repo candidates ═══
// Per-repo section ships EMPTY; install measures the repo, writes finds commented out (silent over-exclusion is worse).
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

// J7 — negation bypass: `!` un-ignore ending in an extension skips the extension filter (552 lockfile + 143 PNG chunks here).
// GIVEN shipped .sembleignore | WHEN active lines read | THEN binaries + lockfiles re-ignored (last match wins; references/language-coverage.md)
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

// J8 — the per-repo section ships EMPTY: mirror trees and changelogs are not generic (measured in assets/INSTALL.md).
// GIVEN shipped .sembleignore | WHEN active lines read | THEN no repo-specific pattern active, only commented guidance
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

// J9 — rule size budget (SKILL.md 3.3b): `paths: ["**/*"]` = per-prompt tax; ratchet (111 lines / 4634 bytes pre-5.5.1).
// GIVEN shipped rule template | WHEN measured | THEN <= 45 lines, <= 2000 bytes, core facts kept (references/engine-landscape.md)
{
  const lines = TPL_TEXT.split('\n').length;
  check('J9.lines', lines <= 45, true,
    `the shipped rule is ${lines} lines, within the 45-line budget`);
  check('J9.bytes', Buffer.byteLength(TPL_TEXT, 'utf8') <= 2000, true,
    `the shipped rule is ${Buffer.byteLength(TPL_TEXT, 'utf8')} bytes, within the 2000-byte budget`);
  check('J9.facts', ['mcp__semble_code__search', 'mcp__semble_code__find_related', 'repo',
    'start_line', 'max_snippet_lines', '.json', '.mdx', '.sembleignore', '--content'].filter((s) => !TPL_TEXT.includes(s)),
    [], 'and compression dropped no load-bearing fact: both tool names, the mandatory repo, the start_line/max_snippet_lines contract, the unindexed suffixes, .sembleignore and the --content cache trap all survive');
}

// ═══ C. CLAUDE.md marker block ═══
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
  // `.html`/`.htm` ARE indexed (semble files.py -> docs bucket); rule template + assets/INSTALL.md carry the same fix.
  check('C1.body', once.includes('> Not indexed: `.json`/`.csv`, `.mdx`/`.txt`. Details: `.claude/rules/semble-first.md`.'), true,
    'the block carries the verbatim last line of the design body, with .html absent from the not-indexed list');
  check('C1.htmlNotClaimedMissing', /Not indexed:[^\n]*\.html/.test(once), false,
    'no variant of the line may still call .html unindexed');

  const r2 = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const twice = readRaw(md);
  check('C2.idempotent', twice, once, 're-insert replaces the marked range in place, byte-identical');
  check('C2.begin', twice.split(BEGIN).length - 1, 1, 'still exactly one BEGIN after re-insert');
  check('C2.unchanged', safeParse(r2.stdout).unchanged.length, 2,
    're-insert reports two unchanged lines: the marker block, and the competing-doctrine scan that found nothing');

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

// C4b — two marker blocks: install and remove change nothing (was: rewrite one, then ABORT)
{
  const blk = '<!-- BEGIN brewcode:semble -->\nold\n<!-- END brewcode:semble -->\n';
  const two = `# CLAUDE.md\n\n${blk}\nmid\n\n${blk}`;
  const p = freshProject({ claudeMd: two });
  const ri = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const rr = guidance(p, ['remove', '--part', 'claudemd', '--json']);
  const st = safeParse(guidance(p, ['status', '--json']).stdout);
  check('C4b.result', [ri.status, safeParse(ri.stdout).failed, safeParse(ri.stdout).skipped.length,
    rr.status, safeParse(rr.stdout).failed, readRaw(join(p, 'CLAUDE.md')), st.claudeMd.malformed],
  [0, [], 1, 0, [], two, true], 'duplicate blocks -> skipped as malformed both ways, file byte-identical, status says malformed');
}

// ═══ C5-C10. Competing search doctrine in CLAUDE.md: it outranks `.claude/rules/` (2 of 7 converted) ═══
// `install --part claudemd` reconciles it; each case compares the WHOLE file to `withBlock(<expected pre>)`.
const BLOCK_TEXT = (() => {
  const p = freshProject({ claudeMd: '# CLAUDE.md\n' });
  guidance(p, ['install', '--part', 'claudemd', '--json']);
  const t = readRaw(join(p, 'CLAUDE.md'));
  return t.slice(t.indexOf(BEGIN), t.indexOf(END) + END.length);
})();
const withBlock = (pre) => `${pre.replace(/\s*$/, '')}\n\n${BLOCK_TEXT}\n`;

// The confirmed instance, verbatim, em-dash and all.
const CONFLICT_LINE = '> Search via the **Bash** tool — shadow functions reroute `grep`->ugrep, `find`->bfs, `rg`->rg. Native `Grep`/`Glob` are no-ops on this macOS build.';
// The complementary sentence. rg IS the right tool for these and the skill's own
// rule says so, so this one must survive every pass untouched.
const KEEP_LINE = 'Use `rg` for exact identifiers, literal strings and exhaustive enumeration.';

const HEAD_PRE = '# CLAUDE.md\n\n## Overview\n\nproject text\n';
const TAIL_PRE = `## Conventions\n\n${KEEP_LINE}\n`;

// C5 — the contradiction goes, the orphaned heading goes with it, and the
// complementary sentence two sections down does not move a byte.
{
  const dirty = `${HEAD_PRE}\n## Code Search\n\n${CONFLICT_LINE}\n\n${TAIL_PRE}`;
  const clean = `${HEAD_PRE}\n${TAIL_PRE}`;
  const p = freshProject({ claudeMd: dirty });
  const r = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const j = safeParse(r.stdout);
  check('C5.file', readRaw(join(p, 'CLAUDE.md')), withBlock(clean),
    'the whole file equals the same file written without the competing section - the directive and its emptied heading are gone, everything else is byte-identical');
  check('C5.keptLine', readRaw(join(p, 'CLAUDE.md')).includes(KEEP_LINE), true,
    'the complementary rg-for-enumeration sentence survives verbatim');
  check('C5.exit', r.status, 0, 'stripping a contradiction is a success, not a failure');
  check('C5.changed', j.changed.length, 4,
    'four report lines: the marker block, the strip summary, the emptied heading, the directive itself');
  check('C5.heading', j.changed[2], 'CLAUDE.md: removed L7: ## Code Search (heading left empty by the removal)',
    'the heading is reported separately and is NOT counted as a second contradiction');
  check('C5.directive', j.changed[3], `CLAUDE.md: removed L9: ${CONFLICT_LINE}`,
    'the removed directive is echoed verbatim with its original line number');
  check('C5.count', j.changed[1].startsWith('CLAUDE.md: removed 1 competing search directive(s) from '), true,
    'the summary counts one directive, not two');
  check('C5.skipped', j.skipped.length, 0, 'an unambiguous contradiction is handled, never merely reported');
}

// C6 — recovery: the TRUE half of the cut line (grep->ugrep / find->bfs shadowing) stays recoverable.
// GIVEN CLAUDE.md with the conflict line | WHEN install --part claudemd | THEN one CLAUDE.md.bak.* == whole pre-strip file
{
  const dirty = `${HEAD_PRE}\n## Code Search\n\n${CONFLICT_LINE}\n\n${TAIL_PRE}`;
  const p = freshProject({ claudeMd: dirty });
  guidance(p, ['install', '--part', 'claudemd', '--json']);
  const baks = readdirSync(p).filter((n) => n.startsWith('CLAUDE.md.bak.'));
  check('C6.count', baks.length, 1, 'exactly one backup is taken, by sc_backup, the same recovery install_managed --force uses');
  check('C6.bytes', readRaw(join(p, baks[0] || 'CLAUDE.md.bak.absent')), withBlock(dirty),
    'the backup is the entire pre-strip file, so the true shadow-function fact removed with the line is recoverable verbatim');
}

// C7 — complementary sentence alone under a matching search heading: nothing touched, heading kept.
// GIVEN `## Code Search` + KEEP_LINE | WHEN install --part claudemd | THEN file == withBlock(pre), 1 change, 0 skipped
{
  const pre = `# CLAUDE.md\n\n## Code Search\n\n${KEEP_LINE}\n`;
  const p = freshProject({ claudeMd: pre });
  const r = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const j = safeParse(r.stdout);
  check('C7.file', readRaw(join(p, 'CLAUDE.md')), withBlock(pre),
    'a scoped rg sentence is complementary, not competing: file, heading and sentence are all byte-identical');
  check('C7.changed', j.changed.length, 1, 'only the marker block is reported as changed');
  check('C7.unchanged', j.unchanged.includes('CLAUDE.md: no competing search directive'), true,
    'and the detector says so explicitly rather than staying silent');
  check('C7.skipped', j.skipped.length, 0, 'it is not even reported for review - it is correct guidance');
}

// C8 — a CLAUDE.md with no search guidance at all.
{
  const pre = '# CLAUDE.md\n\n## Build\n\nrun make\n';
  const p = freshProject({ claudeMd: pre });
  const r = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const j = safeParse(r.stdout);
  check('C8.file', readRaw(join(p, 'CLAUDE.md')), withBlock(pre), 'nothing to reconcile leaves the file byte-identical');
  check('C8.baks', readdirSync(p).filter((n) => n.startsWith('CLAUDE.md.bak.')).length, 0,
    'and takes no backup - a backup with nothing to recover is litter');
  check('C8.changed', j.changed.length, 1, 'only the marker block is reported as changed');
}

// C9 — idempotence, compared as whole files.
{
  const dirty = `${HEAD_PRE}\n## Code Search\n\n${CONFLICT_LINE}\n\n${TAIL_PRE}`;
  const p = freshProject({ claudeMd: dirty });
  guidance(p, ['install', '--part', 'claudemd', '--json']);
  const first = readRaw(join(p, 'CLAUDE.md'));
  const r2 = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const j2 = safeParse(r2.stdout);
  check('C9.same', readRaw(join(p, 'CLAUDE.md')), first, 'run 2 leaves the file byte-identical to run 1');
  check('C9.changed', j2.changed.length, 0, 'run 2 changes nothing: the match is on the text, so there is nothing left to match');
  check('C9.baks', readdirSync(p).filter((n) => n.startsWith('CLAUDE.md.bak.')).length, 1,
    'and takes no second backup');
  check('C9.unchanged', j2.unchanged.length, 2, 'run 2 reports the marker block and the doctrine as already correct');
}

// C10 — report-only tier: a mere search-tool mention is left alone (a false positive deletes user instructions).
// GIVEN `## Notes` line naming **Bash** | WHEN install --part claudemd | THEN file == withBlock(pre), skipped names L5 verbatim
{
  const pre = '# CLAUDE.md\n\n## Notes\n\nMost search still flows through **Bash** on this build.\n';
  const p = freshProject({ claudeMd: pre });
  const r = guidance(p, ['install', '--part', 'claudemd', '--json']);
  const j = safeParse(r.stdout);
  check('C10.file', readRaw(join(p, 'CLAUDE.md')), withBlock(pre), 'an ambiguous line is left byte-identical');
  check('C10.skipped', j.skipped, ['CLAUDE.md: L5 mentions a search tool but is not an unambiguous contradiction - left untouched, review by hand: Most search still flows through **Bash** on this build.'],
    'it is reported verbatim with its line number so the user can decide');
  check('C10.changed', j.changed.length, 1, 'and nothing beyond the marker block is written');
  check('C10.baks', readdirSync(p).filter((n) => n.startsWith('CLAUDE.md.bak.')).length, 0,
    'report-only never takes a backup because it never writes');
}

// ═══ D. SessionStart hook — all 7 rows of the decision table ═══
function session(proj, extra, env) {
  return runNode(SESSION_SRC, JSON.stringify({
    session_id: 'S1', cwd: proj, hook_event_name: 'SessionStart', source: 'startup', ...(extra || {}),
  }), BASE, env || {});
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
        'Run /brewcode:semble-setup resume to close the state out. ' + ROUTE_TEXT,
    },
  }, 'awaiting_reload -> the tool is advertised as usable now, plus the resume close-out and the routing line');
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
        ', top_k=5, max_snippet_lines=10), then open the hit at start_line. ' + ROUTE_TEXT,
    },
  }, 'ready -> cache hash prefix 8 plus the usage directive with the absolute repo path and the routing line');
}
// D10 — MCP presence per ACTIVE profile: user, local and project scope, the two disable lists,
// and the CLAUDE_CONFIG_DIR-unset default (<home>/.claude.json).
{
  const ctxD = (o) => ((o || {}).hookSpecificOutput || {}).additionalContext || '';
  const NO_MCP = { systemMessage: 'semble: semble_code MCP is not registered for this profile — run /brewcode:semble-setup status' };
  const brief = (p) => ctxD(safeParse(session(p).stdout)).startsWith('semble: use ONE mcp__semble_code__search first');
  const cfgWith = (name, json) => {
    const d = join(BASE, name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, '.claude.json'), JSON.stringify(json));
    return { CLAUDE_CONFIG_DIR: d };
  };
  const pReady = freshProject({ state: READY_STATE() });
  const pReload = freshProject({ state: READY_STATE({ phase: 'awaiting_reload' }) });
  check('D10.none', [safeParse(session(pReady, undefined, { CLAUDE_CONFIG_DIR: CFG_NONE }).stdout),
    safeParse(session(pReload, undefined, { CLAUDE_CONFIG_DIR: CFG_NONE }).stdout)], [NO_MCP, NO_MCP],
  'ready and awaiting_reload in a profile without the server: a user-facing notice, no usability claim to the model');
  const pLocal = freshProject({ state: READY_STATE() });
  const local = cfgWith('cfg-local', { projects: { [pLocal]: { mcpServers: { semble_code: MCP_ENTRY } } } });
  const offUser = cfgWith('cfg-off', { mcpServers: { semble_code: MCP_ENTRY },
    projects: { [pLocal]: { disabledMcpServers: ['semble_code'] } } });
  check('D10.scopes', [ctxD(safeParse(session(pLocal, undefined, local).stdout)) !== '',
    safeParse(session(pLocal, undefined, offUser).stdout)], [true, NO_MCP],
  'a local-scope entry counts; a server the user disabled for this project does not');
  const pProj = freshProject({ state: READY_STATE() });
  writeFileSync(join(pProj, '.mcp.json'), JSON.stringify({ mcpServers: { semble_code: MCP_ENTRY } }));
  const offJson = cfgWith('cfg-offjson', { projects: { [pProj]: { disabledMcpjsonServers: ['semble_code'] } } });
  check('D10.projectScope', [ctxD(safeParse(session(pProj, undefined, { CLAUDE_CONFIG_DIR: CFG_NONE }).stdout)) !== '',
    safeParse(session(pProj, undefined, offJson).stdout)], [true, NO_MCP],
  'a project .mcp.json entry counts unless the project rejected it (disabledMcpjsonServers)');
  const home = join(BASE, 'home-default');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { semble_code: MCP_ENTRY } }));
  const envUnset = { ...process.env, HOME: home };
  delete envUnset.CLAUDE_CONFIG_DIR;
  delete envUnset.CLAUDE_PROJECT_DIR;
  const r = spawnSync(process.execPath, [SESSION_SRC], { input: JSON.stringify({ session_id: 'S1', cwd: pReady,
    hook_event_name: 'SessionStart', source: 'startup' }), encoding: 'utf8', env: envUnset, cwd: BASE });
  check('D10.defaultProfile', [brief(pReady), ctxD(safeParse(r.stdout)) !== ''], [true, true],
    'with CLAUDE_CONFIG_DIR unset the hook reads <home>/.claude.json, as Claude Code does');
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

// ── telemetry readers (session/subagent hooks) ──
const telemetryFile = (p) => join(p, '.claude', 'semble', 'telemetry.jsonl');
const telemetry = (p) =>
  (existsSync(telemetryFile(p)) ? readFileSync(telemetryFile(p), 'utf8') : '')
    .split('\n').filter((l) => l).map((l) => JSON.parse(l));
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const dropTs = (r) => { const { ts, ...rest } = r; return rest; };

// ═══ Y. telemetry contract shared by the session hook and the log itself ═══

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

const ctxOf = (out) => ((out || {}).hookSpecificOutput || {}).additionalContext || '';

// ═══ S. SubagentStart — one line into EVERY spawned subagent (retired semble-explore.mjs: "Explore" only) ═══
// No matcher -> every agent type on CC 2.1.226 (verified live); no throttle/counter: a fresh subagent remembers nothing.
function subagent(proj, agentType, extra, env) {
  return runNode(SUBAGENT_SRC, JSON.stringify({
    session_id: 'S1',
    cwd: proj,
    hook_event_name: 'SubagentStart',
    prompt_id: 'p1',
    agent_id: 'a1c5a0755e38bab4a',
    agent_type: agentType,
    ...(extra || {}),
  }), BASE, env || {});
}
const SUB_TEXT = (p) =>
  'semble: mcp__semble_code__search is already available to you — no ToolSearch needed. ' +
  'Start any "where/how/why does X work" question with ONE call: repo="' + p +
  '", top_k=5, max_snippet_lines=10, then open the hit at start_line. ' + ROUTE_TEXT;
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
  check('S2.noCounter', existsSync(join(p, '.claude', 'semble', 'reminder.json')), false, 'and the subagent hook keeps no counter of its own');
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
    ['noMcp', READY_STATE(), { CLAUDE_CONFIG_DIR: CFG_NONE }],
  ];
  const seen = rows.map(([, state, env]) => {
    const p = freshProject(state === undefined ? {} : { state });
    const r = subagent(p, 'Explore', undefined, env);
    return [r.status, safeParse(r.stdout)];
  });
  check('S4.silent', seen, rows.map(() => [0, {}]),
    'no state, corrupt state, either disabled form, error, prereq_ready and a profile without the server all inject nothing');
}

// S6 — no "available to you" claim to an agent whose definition withholds the tool.
{
  const p = freshProject({ state: READY_STATE() });
  mkdirSync(join(p, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(p, '.claude', 'agents', 'narrow.md'), '---\nname: narrow\ntools: Read, Bash\n---\nbody\n');
  writeFileSync(join(p, '.claude', 'agents', 'yaml-list.md'), '---\nname: yaml-list\ntools:\n  - Read\n  - Bash\n---\n');
  writeFileSync(join(p, '.claude', 'agents', 'denied.md'),
    '---\nname: denied\ndisallowedTools: mcp__semble_code__search\n---\n');
  writeFileSync(join(p, '.claude', 'agents', 'granted.md'),
    '---\nname: granted\ntools: Read, Bash, mcp__semble_code__search, mcp__semble_code__find_related\n---\n');
  writeFileSync(join(p, '.claude', 'agents', 'inherits.md'), '---\nname: inherits\nmodel: sonnet\n---\n');
  const outs = ['narrow', 'yaml-list', 'denied', 'granted', 'inherits'].map((t) => safeParse(subagent(p, t).stdout));
  check('S6.agentTools', outs, [{}, {}, {}, SUB_OK(p), SUB_OK(p)],
    'a tools: list without semble (comma or YAML form) or a disallowedTools entry is silent; a grant or no tools: key fires');
  check('S6.why', telemetry(p).filter((r) => r.ev === 'gate').map((r) => r.why),
    ['agent-no-tool', 'agent-no-tool', 'agent-no-tool', 'ok', 'ok'], 'each withheld agent is recorded as why=agent-no-tool');
}
{
  // A plugin agent resolves through the active profile's installed_plugins.json.
  const p = freshProject({ state: READY_STATE() });
  const cfg = join(BASE, 'cfg-plugin');
  const install = join(BASE, 'plugin-install', 'brewcode', '9.9.9');
  mkdirSync(join(install, 'agents'), { recursive: true });
  mkdirSync(join(cfg, 'plugins'), { recursive: true });
  writeFileSync(join(cfg, '.claude.json'), JSON.stringify({ mcpServers: { semble_code: MCP_ENTRY } }));
  writeFileSync(join(cfg, 'plugins', 'installed_plugins.json'), JSON.stringify({
    version: 2, plugins: { 'brewcode@claude-brewcode': [{ scope: 'user', installPath: install, version: '9.9.9' }] },
  }));
  writeFileSync(join(install, 'agents', 'hook-creator.md'), '---\nname: hook-creator\ntools: Read, Write, Edit, Bash\n---\n');
  const env = { CLAUDE_CONFIG_DIR: cfg };
  check('S6.pluginAgent', [safeParse(subagent(p, 'brewcode:hook-creator', undefined, env).stdout),
    safeParse(subagent(p, 'brewcode:unknown-agent', undefined, env).stdout)], [{}, SUB_OK(p)],
    'a plugin agent whose tools: list lacks semble is silent; an undiscoverable plugin agent keeps the line');
}
{
  // `alwaysLoad` is what makes "no ToolSearch needed" true; without it the line says how to load the tool.
  const p = freshProject({ state: READY_STATE() });
  const cfg = join(BASE, 'cfg-deferred');
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, '.claude.json'), JSON.stringify({ mcpServers: { semble_code: { command: 'uvx' } } }));
  check('S6.deferred', ctxOf(safeParse(subagent(p, 'Explore', undefined, { CLAUDE_CONFIG_DIR: cfg }).stdout)),
    'semble: mcp__semble_code__search is available to you (load it via ToolSearch if deferred). ' +
    'Start any "where/how/why does X work" question with ONE call: repo="' + p +
    '", top_k=5, max_snippet_lines=10, then open the hit at start_line. ' + ROUTE_TEXT,
    'a registration without alwaysLoad:true never claims "no ToolSearch needed"');
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

// ═══ F. static guarantees of the three shipped hook files ═══
{
  const src = [SESSION_SRC, STATS_SRC, SUBAGENT_SRC].map((f) => readFileSync(f, 'utf8'));
  check('F1.noChildProcess', src.join('\n').includes('child_process'), false,
    'no shipped hook - session, stats, subagent - imports child_process');
  check('F2.noSpawn', src.join('\n').includes('spawn('), false, 'and none of them spawns a process');
  check('F3.noPgrep', src.join('\n').includes('pgrep'), false, 'no hook probes for a daemon with pgrep');
  check('F7.shebang', src.every((s) => s.startsWith('#!/usr/bin/env node')), true, 'every hook carries a node shebang');
  const checks = [SESSION_SRC, STATS_SRC, SUBAGENT_SRC]
    .map((f) => spawnSync(process.execPath, ['--check', f]).status);
  check('F8.nodeCheck', checks, [0, 0, 0], 'node --check passes on all three hook files');
  check('F9.neverDecides', src.map((x) => x.includes('permissionDecision:')), [false, false, false],
    'no shipped hook emits a permissionDecision field - none of them can block a call');
  check('F10.retiredGone', ['semble-explore.mjs', 'semble-reminder.mjs', 'semble-prefetch.mjs']
    .map((n) => existsSync(join(ASSETS, n))), [false, false, false],
  'retired hooks are gone from assets/ for good - only ever cleaned up');
}

// ═══ G. the runbook's canonical merge block must not drift from the script ═══
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

// ═══ H. preflight, honest change reporting, hook-level filtering ═══
const BROKEN_SETTINGS = '{ "hooks": { "PreToolUse": [ }\n';
const PRE_MD = '# CLAUDE.md\n\n## Overview\n\nproject text\n';

// H1 — install aborts on an unparseable settings.json BEFORE touching anything
{
  const p = freshProject({ settings: BROKEN_SETTINGS, claudeMd: PRE_MD });
  const { session, subagent: pre, stats } = semblePaths(p);
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
  const { session, subagent: pre, stats } = semblePaths(p);
  const before = {
    rule: readRaw(rulePath), md: readRaw(mdPath), session: readRaw(session), subagent: readRaw(pre),
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
    [before.session, before.subagent, before.stats],
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
  check('H5.staleGone', Object.values(s.hooks || {}).flat().filter((e) => argsOf(e).some((a) => a.startsWith(staleDir))).length, 0,
    'zero hooks still point at the old hooks dir');
  check('H5.counts', wantCounts(p, s), [1, 1, 1, 1], 'exactly one current entry per want row');
  check('H5.preToolUseSize', pre.length, 1,
    'PreToolUse holds exactly the repaired foreign entry: the retired reminder row is not re-added');
}

// H6 — unmerge: a hand-merged foreign hook in a semble entry survives
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const s = readSettings(p);
  s.hooks.SubagentStart[0].hooks.unshift(FOREIGN_HOOK);
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('H6.exit', r.status, 0, 'unmerge over a hand-merged mixed entry exits 0');
  const t = readSettings(p);
  const left = t.hooks || {};
  check('H6.foreignKept', left.SubagentStart || null, [{ hooks: [FOREIGN_HOOK] }],
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
    `state: removed empty ${join(p, '.claude')}`,
  ], 'the first removal reports the guidance removal once, then drops the .claude dir it left empty');
  check('H7.exit2', second.status, 0, 'the second integration removal exits 0');
  check('H7.changed2', j2.changed, [], 'the second removal reports an empty changed list');
  check('H7.unchanged2', j2.unchanged, [
    'guidance: rule, CLAUDE.md block, hooks and settings entries already absent',
    'agents: no semble tool entries to revert',
    `state: ${join(p, '.claude', 'semble')} absent`,
    'mcp registration, cache and uv tool retained',
  ], 'every step of the second removal is reported as unchanged');
}

// ═══ I. field-level reconciliation, drift-aware status, verified .gitignore ═══

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
    [5, 5, 5, 5], 'every drifted timeout:5000 is rewritten to the contract value 5 seconds');
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
  delete s.hooks.SubagentStart;                         // row absent: an older partial install
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  driftTimeouts(p, 5000);
  const before = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I2.statusBefore',
    [before.hooks.wiredCount, before.hooks.wantCount, before.hooks.driftedCount, before.hooks.missingCount],
    [0, WANT_N, WANT_N - 1, 1], 'status calls the real broken shape 0/4 wired, 3 drifted, 1 missing');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I2.exit', r.status, 0, 'the repair run exits 0');
  // Key ORDER differs only here (deleted SubagentStart is re-appended after later want rows);
  // every value must still equal a clean install - repair, not append.
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
    [WANT_N, 0, 0, 0], 'after the repair status reports 4/4 wired with an empty drift list');
}

// I3 — a foreign hook sharing a drifted entry survives merge AND unmerge
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { subagent: pre } = wirePaths();
  const s = readSettings(p);
  s.hooks.SubagentStart[0].hooks.unshift(FOREIGN_HOOK);
  s.hooks.SubagentStart[0].hooks[1].timeout = 5000;     // the semble hook next to it drifted
  s.hooks.SubagentStart[0].note = 'hand-edited';        // a foreign entry-level key
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I3.exit', r.status, 0, 'merge over a mixed drifted entry exits 0');
  check('I3.repaired', readSettings(p).hooks.SubagentStart[0], {
    hooks: [FOREIGN_HOOK, { type: 'command', command: 'node', args: [pre], timeout: 5 }],
    note: 'hand-edited',
  }, 'only the semble hook is rewritten - the foreign hook and the foreign entry key are untouched');
  const r2 = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('I3.unmergeExit', r2.status, 0, 'unmerge over the same entry exits 0');
  check('I3.unmergeKept', readSettings(p).hooks.SubagentStart,
    [{ hooks: [FOREIGN_HOOK], note: 'hand-edited' }],
    'unmerge strips only the semble hook and keeps the entry alive for the foreign one');
}

// I4 — hand-added duplicates are repaired, never left as a written-then-aborted file
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { subagent: pre, stats } = wirePaths();
  const s = readSettings(p);
  const dupe = JSON.parse(JSON.stringify(s.hooks.SubagentStart[0]));
  dupe.hooks[0].timeout = 5000;
  s.hooks.SubagentStart.push(dupe);                     // plain duplicate
  s.hooks.PostToolUse.push({                               // duplicate carrying a foreign hook
    matcher: STATS_MATCHER,
    hooks: [FOREIGN_HOOK, { type: 'command', command: 'node', args: [stats], timeout: 9 }],
  });
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('I4.exit', r.status, 0, 'a duplicated entry is repaired, not a fatal ABORT');
  check('I4.noAbort', (r.stdout + r.stderr).includes('ABORT'), false, 'nothing reports ABORT');
  const t = readSettings(p);
  check('I4.counts', wantCounts(p, t), [1, 1, 1, 1], 'exactly one entry per want row survives the de-duplication');
  check('I4.foreignSurvived', t.hooks.PostToolUse.filter((e) => argsOf(e).includes('/opt/foreign/guard.mjs')),
    [{ matcher: STATS_MATCHER, hooks: [FOREIGN_HOOK] }],
    'the foreign hook riding on the duplicate outlives the duplicate');
  check('I4.duplicatedPath', pre.endsWith('semble-subagent.mjs'), true,
    'the duplicated row is the subagent one');
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
    [WANT_N, 0, 0, 0, 0], 'a correct install reports 4 wired and no drift');
  check('I5.cleanEntries', clean.hooks.entries.map((e) => e.state),
    ['wired', 'wired', 'wired', 'wired'],
    'every want row is reported wired individually');
  const s = readSettings(p);
  s.hooks.SubagentStart[0].hooks[0].timeout = 5000;
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('I5.driftCounts', [a.hooks.wiredCount, a.hooks.driftedCount, a.hooks.missingCount], [WANT_N - 1, 1, 0],
    'a timeout:5000 entry is counted as drifted, never rounded up to wired');
  check('I5.driftDetail', a.hooks.drift, [{
    event: 'SubagentStart', matcher: null, script: 'semble-subagent.mjs',
    field: 'timeout', expected: 5, actual: 5000,
  }], 'the drift array names event, matcher, script and the exact field that differs');
  check('I5.subagentWired', a.hooks.subagent.wired, false,
    'wired means present AND conforming - the drifted subagent row is not wired');
  check('I5.otherRows', a.hooks.entries.map((e) => e.state),
    ['wired', 'wired', 'wired', 'drifted'], 'only the drifted row changes state');
  check('I5.human', guidance(p, ['status']).stdout.includes('hooks 3/4 wired (1 drifted - re-run install to repair)'),
    true, 'the human line spells the drift out instead of printing 4/4');
}

// I6 — field-level, not stringify-level: key order is not drift, a missing field is
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const clean = readRaw(settingsPath(p));
  const { session } = wirePaths();
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
  // The DIRECTORY, not the marker: `.claude/semble/` holds state.json + telemetry.jsonl (1.25 MB / 5778 lines of
  // shell commands + prompt text here); a per-marker line left them `git add .`-able where `.claude/` is not ignored.
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

  // install -> remove -> install must be byte-idempotent (drop + append used to grow one blank line per cycle).
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

  // I7b — the 5.1.0 `.claude/semble/.prefetch-ts` line is superseded: install converges on the directory line ALONE.
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

// I8 — a corrupt hook asset never lands installed or wired: `node --check` runs on a staged copy (was AFTER the copy).
// GIVEN broken semble-stats.mjs asset | WHEN install --part hooks | THEN failed once, absent, no staging file, siblings wired
{
  const STATS_ASSET = join(SKILL_COPY, 'assets', 'semble-stats.mjs');
  const GOOD = readFileSync(STATS_ASSET, 'utf8');
  const BROKEN = 'export function (\n';                      // a syntax error in ESM and CJS alike

  const p = freshProject({});
  writeFileSync(STATS_ASSET, BROKEN);
  const j = safeParse(guidance(p, ['install', '--part', 'hooks', '--json']).stdout);
  const { session, subagent: pre, stats } = semblePaths(p);
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
    ['SessionStart', 'SubagentStart'],
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

// ═══ M. migration: wanted = LIVE (event, matcher, path) triples, ownership = SG_MARKS ═══
// Retired files/registrations (explore, reminder, prefetch) are purged and never re-added.
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
  check('M1.retiredSeen', [before.hooks.retired, before.hooks.retiredWired],
    [['semble-reminder.mjs', 'semble-explore.mjs'], ['semble-reminder.mjs', 'semble-explore.mjs']],
    'status names both retired files on disk and both retired registrations in settings.json');
  check('M1.wiredBefore', [before.hooks.wiredCount, before.hooks.wantCount, before.hooks.absoluteCount], [0, WANT_N, 1],
    'nothing carries over: SessionStart is absolute-path, both stats rows sit on the pre-5.0.0 matcher and the'
    + ' subagent row on the retired Explore matcher');
  check('M1.staleBefore', before.hooks.staleEntries, 6,
    'six owned entries are wired somewhere the want table does not want them - the two v1 reminder'
    + ' rows, the Explore row, BOTH stats rows on the retired matcher and the absolute SessionStart row');

  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('M2.exit', r.status, 0, 'install over a v1-shaped settings file exits 0');
  const s = readSettings(p);
  check('M2.counts', wantCounts(p, s), [1, 1, 1, 1], 'every current want row is wired exactly once');
  check('M2.noRetiredPath', JSON.stringify(s).includes('semble-explore.mjs'), false,
    'the retired basename survives nowhere in settings.json - the whole point of the migration');
  check('M2.subagentStartRow', s.hooks.SubagentStart,
    [{ hooks: [{ type: 'command', command: 'node', args: [wirePaths().subagent], timeout: 5 }] }],
    'the SubagentStart/Explore row is REPLACED by the matcher-less subagent row - one row,'
    + ' not the old one plus the new one, and not an empty [] husk');
  check('M2.preToolUseRows', s.hooks.PreToolUse, [{ matcher: 'Write', hooks: [FOREIGN_HOOK] }],
    'both v1 reminder rows are dropped and the foreign Write entry is untouched - the purge is ours-only');
  check('M2.filesGone', existsSync(exp), false,
    'the orphan semble-explore.mjs is deleted from .claude/hooks');
  check('M2.filesKept', [existsSync(session), existsSync(stats), existsSync(sub), existsSync(rem)],
    [true, true, true, false], 'the three live hooks are on disk and the v1 reminder stub is deleted');
  check('M2.statsMatchers', s.hooks.PostToolUse.map((e) => e.matcher), [STATS_MATCHER],
    'ONE PostToolUse row, on the current matcher: a surviving pre-5.0.0 row would fire the'
    + ' observer a second time on every Bash and silently double the denominator');
  check('M2.statsFailureMatchers', s.hooks.PostToolUseFailure.map((e) => e.matcher), [STATS_MATCHER],
    'and the same on the failure event');
  const changed = (safeParse(r.stdout) || {}).changed || [];
  check('M2.reported', [changed.includes('hooks: removed retired ' + exp),
    changed.includes('hooks: removed retired ' + rem)], [true, true],
  'install reports both deletions by full path, never silently');

  const a = safeParse(guidance(p, ['status', '--json']).stdout);
  check('M3.after', [a.hooks.wiredCount, a.hooks.wantCount, a.hooks.driftedCount,
    a.hooks.missingCount, a.hooks.duplicateCount, a.hooks.staleEntries],
  [WANT_N, WANT_N, 0, 0, 0, 0], 'the migrated project is indistinguishable from a fresh install');
  check('M3.retiredEmpty', a.hooks.retired, [], 'nothing retired is left to report');
  check('M3.retiredMarkerGone', existsSync(join(p, '.claude', 'semble', '.reminder-ts')), false,
    'the v1 throttle marker has no writer left, so it goes');
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
  check('M6.settings', existsSync(settingsPath(p)), false,
    'unmerge reads the FULL ownership list, so a hand-restored retired row is removed too and the semble-only file goes');
  check('M6.files', [session, pre, stats, rem, sub, exp].map((f) => existsSync(f)),
    [false, false, false, false, false, false], 'and every owned .mjs goes, live or retired');
  check('M6.markers', ['.prefetch-ts', '.reminder-ts']
    .map((f) => existsSync(join(p, '.claude', 'semble', f))), [false, false],
  'and so do both throttle markers - remove drops their .gitignore line, so anything left '
    + 'behind resurfaces as an untracked file');
}

// M7 — a 6.4.0-shaped install: `upgrade` (= install) and uninstall drop reminder + prefetch
// A 6.4.0 install wired absolute paths; `wire` = the same rows in the portable 6.5.1 form.
const v640Settings = (p, fh, wire = false) => {
  const { session, stats, subagent: sub } = wire ? wirePaths() : semblePaths(p);
  const { reminder: rem, prefetch: pre } = semblePaths(p);
  const H = (x) => ({ type: 'command', command: 'node', args: [x], timeout: 5 });
  return {
    hooks: {
      SessionStart: [{ hooks: [H(session)] }],
      UserPromptSubmit: [{ hooks: [H(pre)] }, { hooks: [fh.ups] }],
      PostToolUse: [{ matcher: STATS_MATCHER, hooks: [H(stats)] }],
      PostToolUseFailure: [{ matcher: STATS_MATCHER, hooks: [H(stats)] }],
      PreToolUse: [
        { matcher: 'Bash|Grep', hooks: [fh.pre, H(rem)] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/semble-reminder.mjs' }] },
      ],
      SubagentStart: [{ hooks: [H(sub)] }],
      Stop: [{ hooks: [fh.stop] }],
    },
    permissions: { allow: ['Bash(git *)', 'mcp__semble_code__search', 'mcp__semble_code__find_related'] },
  };
};
const FH = {
  ups: { type: 'command', command: 'node', args: ['/opt/foreign/prompt.mjs'], timeout: 7 },
  pre: { type: 'command', command: 'node', args: ['/opt/foreign/guard.mjs'], timeout: 3000 },
  stop: { type: 'command', command: 'bash', args: ['/opt/foreign/stop.sh'] },
};
const seed640 = (p) => {
  const { reminder: rem, prefetch: pre } = semblePaths(p);
  writeFileSync(settingsPath(p), JSON.stringify(v640Settings(p, FH), null, 2) + '\n');
  for (const x of [rem, pre]) writeFileSync(x, '// 6.4.0 copy\n');
  for (const m of ['.prefetch-ts', 'reminder.json']) writeFileSync(join(p, '.claude', 'semble', m), '{"n":1}');
};
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  mkdirSync(join(p, '.claude', 'semble'), { recursive: true });
  seed640(p);
  const { reminder: rem, prefetch: pre } = semblePaths(p);
  const b = safeParse(guidance(p, ['status', '--json']).stdout).hooks;
  check('M7.statusBefore', [b.retired, b.retiredWired, b.staleEntries, b.wiredCount, b.prefetch, b.reminder],
    [['semble-prefetch.mjs', 'semble-reminder.mjs'], ['semble-prefetch.mjs', 'semble-reminder.mjs'], 7, 0,
      undefined, undefined],
    'status flags both leftovers (files + 3 registrations incl. the shell-form one) and the 4 absolute live rows');
  check('M7.humanBefore', guidance(p, ['status']).stdout.includes(
    'retired:   semble-prefetch.mjs, semble-reminder.mjs - stale (remove via upgrade)'), true,
  'the human status names the leftovers and the mode that removes them');
  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('M7.exit', r.status, 0, 'upgrade over a 6.4.0 install exits 0');
  const s = readSettings(p);
  const want = v640Settings(p, FH, true);
  want.hooks.UserPromptSubmit = [{ hooks: [FH.ups] }];
  want.hooks.PreToolUse = [{ matcher: 'Bash|Grep', hooks: [FH.pre] }];
  check('M7.settings', s, want,
    'both registrations (exec and quoted $CLAUDE_PROJECT_DIR form) are gone; every foreign hook is deep-equal');
  check('M7.files', [rem, pre, join(p, '.claude', 'semble', '.prefetch-ts'), join(p, '.claude', 'semble', 'reminder.json')]
    .map((x) => existsSync(x)), [false, false, false, false], 'both copied files and their markers are deleted');
  const a = safeParse(guidance(p, ['status', '--json']).stdout).hooks;
  check('M7.statusAfter', [a.retired, a.retiredWired, a.staleEntries, a.wiredCount], [[], [], 0, WANT_N],
    'after upgrade nothing is stale');
  const snap = readRaw(settingsPath(p));
  check('M7.idempotent', [safeParse(guidance(p, ['install', '--part', 'all', '--json']).stdout).changed,
    readRaw(settingsPath(p))], [[], snap], 'a second upgrade changes nothing');
}
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  mkdirSync(join(p, '.claude', 'semble'), { recursive: true });
  seed640(p);
  const { reminder: rem, prefetch: pre } = semblePaths(p);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('M7.uninstallExit', r.status, 0, 'uninstall over a 6.4.0 install exits 0');
  check('M7.uninstallSettings', readSettings(p), {
    hooks: { UserPromptSubmit: [{ hooks: [FH.ups] }], PreToolUse: [{ matcher: 'Bash|Grep', hooks: [FH.pre] }],
      Stop: [{ hooks: [FH.stop] }] },
    permissions: { allow: ['Bash(git *)'] },
  }, 'uninstall strips every semble registration incl. reminder/prefetch and keeps foreign hooks deep-equal');
  check('M7.uninstallFiles', [existsSync(rem), existsSync(pre)], [false, false], 'and deletes both copied files');
}

// ═══ P. portable hook paths (6.5.1): absolute args broke every other clone of a tracked settings.json ═══
const PH = (x) => ({ type: 'command', command: 'node', args: [x], timeout: 5 });
const PERMS = ['mcp__semble_code__search', 'mcp__semble_code__find_related'];
// 6.5.0 shape: absolute args into this project's hooks dir, plus foreign hooks and a foreign entry key.
const v650Settings = (paths) => ({
  model: 'opus',
  hooks: {
    SessionStart: [{ hooks: [PH(paths.session)] }],
    PostToolUse: [
      { matcher: 'Write', hooks: [FOREIGN_HOOK] },
      { matcher: STATS_MATCHER, hooks: [FOREIGN_HOOK, PH(paths.stats)], note: 'hand-merged' },
    ],
    PostToolUseFailure: [{ matcher: STATS_MATCHER, hooks: [PH(paths.stats)] }],
    SubagentStart: [{ hooks: [PH(paths.subagent)] }],
  },
  permissions: { allow: PERMS },
});

// P1 — GIVEN a fresh project WHEN install THEN all four rows carry the portable literal, no absolute path anywhere
{
  const p = freshProject({});
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  const w = wirePaths();
  check('P1.exit', r.status, 0, 'install --part hooks exits 0');
  check('P1.hooks', readSettings(p).hooks, {
    SessionStart: [{ hooks: [PH(w.session)] }],
    PostToolUse: [{ matcher: STATS_MATCHER, hooks: [PH(w.stats)] }],
    PostToolUseFailure: [{ matcher: STATS_MATCHER, hooks: [PH(w.stats)] }],
    SubagentStart: [{ hooks: [PH(w.subagent)] }],
  }, 'every args element is ${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>, the form CC substitutes per exec-form arg');
  check('P1.noAbsolute', readRaw(settingsPath(p)).includes(p), false,
    'the project path never lands in settings.json, so the tracked file works in every clone');
}

// P2 — GIVEN a 6.5.0 absolute-path install WHEN status, upgrade, status, upgrade THEN stale -> migrated in place -> idempotent
{
  const p = freshProject({});
  const abs = semblePaths(p);
  const w = wirePaths();
  writeFileSync(settingsPath(p), JSON.stringify(v650Settings(abs), null, 2) + '\n');
  const b = safeParse(guidance(p, ['status', '--json']).stdout).hooks;
  check('P2.statusBefore', [b.wiredCount, b.staleEntries, b.absoluteCount, b.driftedCount, b.missingCount],
    [0, 4, 4, 4, 0], 'absolute rows are stale and drifted, never counted as wired');
  check('P2.driftBefore', b.drift, [
    ['SessionStart', null, 'semble-session.mjs', w.session, abs.session],
    ['PostToolUse', STATS_MATCHER, 'semble-stats.mjs', w.stats, abs.stats],
    ['PostToolUseFailure', STATS_MATCHER, 'semble-stats.mjs', w.stats, abs.stats],
    ['SubagentStart', null, 'semble-subagent.mjs', w.subagent, abs.subagent],
  ].map(([event, matcher, script, want, got]) => ({
    event, matcher, script, field: 'args', expected: [want], actual: [got],
  })), 'each row names the args field: expected the portable path, actual the absolute one');
  check('P2.human', guidance(p, ['status']).stdout.split('\n').filter((l) => l.startsWith('portable:')),
    ['portable:  4 absolute-path hook entries (break every other clone) - run /brewcode:semble-setup upgrade'],
    'the human status names the defect and the mode that fixes it');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('P2.exit', r.status, 0, 'upgrade over a 6.5.0 install exits 0');
  check('P2.migrated', readSettings(p), v650Settings(w),
    'each absolute row is rewritten IN PLACE to the portable form; foreign hooks, entry key and order kept');
  check('P2.noAbsolute', readRaw(settingsPath(p)).includes(hooksDirOf(p)), false, 'zero absolute args remain');
  const a = safeParse(guidance(p, ['status', '--json']).stdout).hooks;
  check('P2.statusAfter', [a.wiredCount, a.staleEntries, a.absoluteCount, a.driftedCount, a.duplicateCount],
    [WANT_N, 0, 0, 0, 0], 'after upgrade the four portable rows are wired and nothing is stale');
  const snap = readRaw(settingsPath(p));
  const r2 = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('P2.idempotent', [safeParse(r2.stdout).changed.filter((l) => l.startsWith('settings:')),
    readRaw(settingsPath(p))], [[], snap], 'a second upgrade is a byte-level no-op');
}

// P3 — GIVEN absolute (another clone's path too) + portable copies of one row WHEN upgrade THEN one portable row each
{
  const p = freshProject({});
  const w = wirePaths();
  const other = '/Users/someone/clone/.claude/hooks';
  writeFileSync(settingsPath(p), JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [PH(other + '/semble-session.mjs')] }, { hooks: [PH(w.session)] }],
      SubagentStart: [{ hooks: [PH(semblePaths(p).subagent), PH(w.subagent), FOREIGN_HOOK] }],
    },
  }, null, 2) + '\n');
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('P3.exit', r.status, 0, 'two forms of one hook are repaired, not an ABORT');
  const s = readSettings(p);
  check('P3.rows', [s.hooks.SessionStart, s.hooks.SubagentStart, wantCounts(p, s)], [
    [{ hooks: [PH(w.session)] }],
    [{ hooks: [PH(w.subagent), FOREIGN_HOOK] }],
    [1, 1, 1, 1],
  ], 'absolute and portable forms share one merge key: the first is kept and rewritten, the copy dropped');
}

// P4 — GIVEN the 6.5.0 fixture WHEN the INSTALL.md merge block runs THEN its bytes equal the script's migration
{
  const runbook = readFileSync(join(ASSETS, 'INSTALL.md'), 'utf8');
  const block = ([...runbook.matchAll(/\n```\n(SETTINGS=[\s\S]*?)\n```\n/g)].map((m) => m[1]))[0] || 'exit 9';
  const blockPath = join(BASE, 'runbook-merge-p4.sh');
  writeFileSync(blockPath, block);
  const viaScript = freshProject({});
  writeFileSync(settingsPath(viaScript), JSON.stringify(v650Settings(semblePaths(viaScript)), null, 2) + '\n');
  guidance(viaScript, ['install', '--part', 'hooks', '--json']);
  const viaRunbook = freshProject({});
  writeFileSync(settingsPath(viaRunbook), JSON.stringify(v650Settings(semblePaths(viaRunbook)), null, 2) + '\n');
  const rb = spawnSync('bash', [blockPath], { cwd: viaRunbook, encoding: 'utf8', timeout: 30000 });
  check('P4.runbook', [rb.status, readRaw(settingsPath(viaRunbook))], [0, readRaw(settingsPath(viaScript))],
    'the runbook block migrates absolute rows to the same bytes as semble-guidance.sh');
}

// M8 — R4: a pristine prior-release rule/.sembleignore is upgraded; a hand-edited one is preserved
const PRIOR = join(HERE, 'fixtures', 'prior');
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const rule = join(p, '.claude', 'rules', 'semble-first.md');
  const ign = join(p, '.sembleignore');
  copyFileSync(join(PRIOR, 'semble-first.v6.4.0.md'), rule);
  copyFileSync(join(PRIOR, 'sembleignore.v6.4.0'), ign);
  const st = safeParse(guidance(p, ['status', '--json']).stdout);
  check('M8.statusStale', [st.rule.state, st.ignore.state], ['stale', 'stale'],
    'a byte-pristine 6.4.0 copy is `stale`, not user_modified');
  const j = safeParse(guidance(p, ['install', '--part', 'rule', '--json']).stdout);
  check('M8.upgraded', [j.changed, j.skipped, readRaw(rule)],
    [[`rule: upgraded ${rule} (pristine prior-release copy)`], [], TPL_TEXT],
    'upgrade replaces it with the current template, no --force');
  const k = safeParse(guidance(p, ['install', '--part', 'ignore', '--json']).stdout);
  check('M8.ignoreUpgraded', [k.skipped, readRaw(ign).startsWith(IGNORE_TPL_TEXT.replace(/\n+$/, ''))], [[], true],
    'the prior .sembleignore is upgraded too (measured candidates may follow the template)');
  check('M8.noBackup', readdirSync(join(p, '.claude', 'rules')).filter((n) => n.includes('.bak.')), [],
    'a pristine copy is not user content: no backup');
}
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const rule = join(p, '.claude', 'rules', 'semble-first.md');
  const edited = readFileSync(join(PRIOR, 'semble-first.v6.4.0.md'), 'utf8') + '\nProject note: prefer rg in vendor/.\n';
  writeFileSync(rule, edited);
  check('M8.editedStatus', safeParse(guidance(p, ['status', '--json']).stdout).rule.state, 'user_modified',
    'a real edit on top of a prior release stays user_modified');
  const j = safeParse(guidance(p, ['install', '--part', 'rule', '--json']).stdout);
  check('M8.editedKept', [j.changed, j.skipped.length, readRaw(rule)], [[], 1, edited],
    'install skips it and leaves the bytes untouched');
}

// M9 — every tagged release's normalized template hash is current or listed in SG_PRIOR_* (no tags = nothing to check)
{
  const REPO = join(SKILL, '..', '..', '..');
  const src = readFileSync(join(SCRIPTS, 'semble-guidance.sh'), 'utf8');
  const listOf = (k) => (src.match(new RegExp('^' + k + "='([0-9a-f ]*)'", 'm')) || [, ''])[1].split(' ');
  const OWNED = ['doc_type', 'version', 'content_version', 'generated_by', 'last_updated'];
  const meta = (x) => { const e = x.startsWith('---\n') ? x.indexOf('\n---\n', 3) : -1;
    return e < 0 ? x : '---\n' + x.slice(4, e + 1).split('\n').filter((l) => !OWNED.some((k) => l.startsWith(k + ':'))).join('\n') + '---\n' + x.slice(e + 5); };
  const line = (x) => { const L = x.split('\n').filter((l) => !/^#\s*brewcode-meta:/.test(l));
    while (L.length && L[L.length - 1].trim() === '') L.pop(); return L.join('\n') + '\n'; };
  const sha = (x) => createHash('sha256').update(x).digest('hex');
  const git = (args) => spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8' });
  const tags = (git(['tag', '-l', 'v*']).stdout || '').split('\n').filter(Boolean);
  const show = (tag, name) => ['semble-setup', 'semble'].map((d) => git(['show', `${tag}:brewcode/skills/${d}/assets/${name}`]))
    .filter((r) => r.status === 0).map((r) => r.stdout);
  const ok = {
    rule: new Set([...listOf('SG_PRIOR_RULE'), sha(meta(TPL_TEXT))]),
    ignore: new Set([...listOf('SG_PRIOR_IGNORE'), sha(line(IGNORE_TPL_TEXT))]),
  };
  const missing = tags.flatMap((tag) => [
    ...show(tag, 'semble-first.md.template').map((x) => ['rule', tag, sha(meta(x))]),
    ...show(tag, 'sembleignore.template').map((x) => ['ignore', tag, sha(line(x))]),
  ]).filter(([k, , h]) => !ok[k].has(h));
  check('M9.priorHashes', missing, [],
    'a release that changed a template must add the outgoing hash to SG_PRIOR_RULE/SG_PRIOR_IGNORE');
}

// ═══ N. a release must not look like a user edit  (defect b) ═══
// bump-version.sh stamps line 1 of sembleignore.template; `metaline` compare strips it from BOTH sides (`cmp -s` -> user_modified).
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

// ═══ O. upgrade must be able to CLEAR staleness, and uninstall must not lie ═══
// `setup-status` reads the version from .claude/rules/semble-first.md; semble-guidance.sh is its only writer.

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

// O3 — the sibling-less fallback removal path leaves no registered hook behind (it used to skip semble-stats.mjs).
// GIVEN install all + orphan reminder/explore, no semble-guidance.sh | WHEN semble-remove.sh integration --yes | THEN exit 0, all gone
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

// ═══ Q. content_version — moves only when a BODY (meta stripped) changed, so setup-status skips version-only churn ═══
// content_version_for + strip_meta_for_diff run verbatim from bump-version.sh on disposable git fixtures, never the real repo.
const BUMP_SCRIPT = join(SKILL, '..', '..', '..', '.claude', 'scripts', 'bump-version.sh');
const BUMP_SRC = readFileSync(BUMP_SCRIPT, 'utf8');

// Pulls one `name() { ... }` POSIX function out of the script by brace counting,
// so the test runs the SAME code as the release script instead of a re-typed copy.
function extractShFn(src, name) {
  const marker = `${name}() {`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`${name} not found in bump-version.sh`);
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error(`${name}: unbalanced braces`);
  return src.slice(start, end + 1);
}
const STRIP_META_FN = extractShFn(BUMP_SRC, 'strip_meta_for_diff');
const CONTENT_VERSION_FN = extractShFn(BUMP_SRC, 'content_version_for');

const CV_HARNESS = join(BASE, 'content-version-harness.sh');
writeFileSync(CV_HARNESS,
  `#!/usr/bin/env sh\nset -eu\nNEW="$CV_TEST_NEW"\n${STRIP_META_FN}\n${CONTENT_VERSION_FN}\ncontent_version_for "$1" "$2"\n`);

function gitRun(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd} failed: ${r.stderr}`);
  return r.stdout;
}
function gitFixture(name) {
  const dir = join(BASE, `cv-${name}`);
  mkdirSync(dir, { recursive: true });
  gitRun(dir, ['init', '-q']);
  gitRun(dir, ['config', 'user.email', 'test@example.com']);
  gitRun(dir, ['config', 'user.name', 'test']);
  return dir;
}
function commitTag(dir, tag) {
  gitRun(dir, ['add', '-A']);
  gitRun(dir, ['commit', '-q', '-m', tag]);
  gitRun(dir, ['tag', tag]);
}
// Runs the real content_version_for(file, kind) with $NEW = newVersion, cwd = fixture repo root,
// so bump-version.sh's repo-root-relative `git show v$old:$path` resolves as in a real release.
function contentVersionFor(dir, file, kind, newVersion) {
  const r = spawnSync('sh', [CV_HARNESS, file, kind], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, CV_TEST_NEW: newVersion },
  });
  if (r.status !== 0) throw new Error(`content_version_for(${file}) failed: ${r.stderr}`);
  return r.stdout.trim();
}

// Q1 — unchanged body keeps the OLD content_version across a version bump.
{
  const dir = gitFixture('q1-unchanged');
  const body = '// header\n// brewcode-meta: version=1.0.0 content_version=1.0.0 generated_by=test:test\nconsole.log("x");\n';
  writeFileSync(join(dir, 'asset.mjs'), body);
  commitTag(dir, 'v1.0.0');
  check('Q1.unchangedKeepsOldCv', contentVersionFor(dir, 'asset.mjs', 'mjs', '2.0.0'), '1.0.0',
    'a body byte-identical to its v1.0.0 tag keeps content_version 1.0.0 while version bumps to 2.0.0');
}

// Q2 — a real body change bumps content_version to match the new release.
{
  const dir = gitFixture('q2-changed');
  const body = '// header\n// brewcode-meta: version=1.0.0 content_version=1.0.0 generated_by=test:test\nconsole.log("x");\n';
  writeFileSync(join(dir, 'asset.mjs'), body);
  commitTag(dir, 'v1.0.0');
  writeFileSync(join(dir, 'asset.mjs'), body + 'console.log("new behavior");\n');
  check('Q2.changedBumpsToNew', contentVersionFor(dir, 'asset.mjs', 'mjs', '2.0.0'), '2.0.0',
    'a body that differs from its v1.0.0 tag gets content_version bumped to the new release 2.0.0');
}

// Q3 — no usable prior content_version: absent field, or a tag that never existed.
{
  const dir = gitFixture('q3a-no-prior-cv');
  const body = '// header\n// brewcode-meta: version=1.0.0 generated_by=test:test\nconsole.log("x");\n';
  writeFileSync(join(dir, 'asset.mjs'), body);
  commitTag(dir, 'v1.0.0');
  check('Q3a.noPriorCvGetsNew', contentVersionFor(dir, 'asset.mjs', 'mjs', '2.0.0'), '2.0.0',
    'a file with no prior content_version field is stamped with the new release 2.0.0');
}
{
  const dir = gitFixture('q3b-missing-tag');
  const body = '// header\n// brewcode-meta: version=1.0.0 content_version=5.5.5 generated_by=test:test\nconsole.log("x");\n';
  writeFileSync(join(dir, 'asset.mjs'), body);
  commitTag(dir, 'v1.0.0');   // v5.5.5 was never tagged
  check('Q3b.missingTagGetsNew', contentVersionFor(dir, 'asset.mjs', 'mjs', '2.0.0'), '2.0.0',
    'a content_version whose git tag does not exist falls back to the new release 2.0.0');
}

// Q4/Q5 — the fm branch (YAML frontmatter, e.g. semble-first.md.template) runs a
// different sed program than the comment-line branch above; same contract either way.
{
  const dir = gitFixture('q4-fm-unchanged');
  const body = '---\ndoc_type: llm\nversion: "1.0.0"\ncontent_version: "1.0.0"\ngenerated_by: "test:test"\n---\n# Body\nunchanged text\n';
  writeFileSync(join(dir, 'rule.md'), body);
  commitTag(dir, 'v1.0.0');
  check('Q4.fmUnchangedKeepsOldCv', contentVersionFor(dir, 'rule.md', 'fm', '2.0.0'), '1.0.0',
    'the fm branch also preserves content_version 1.0.0 when the frontmatter-stripped body is unchanged');
}
{
  const dir = gitFixture('q5-fm-changed');
  const body = '---\ndoc_type: llm\nversion: "1.0.0"\ncontent_version: "1.0.0"\ngenerated_by: "test:test"\n---\n# Body\nunchanged text\n';
  writeFileSync(join(dir, 'rule.md'), body);
  commitTag(dir, 'v1.0.0');
  writeFileSync(join(dir, 'rule.md'), body.replace('unchanged text', 'different text'));
  check('Q5.fmChangedBumpsToNew', contentVersionFor(dir, 'rule.md', 'fm', '2.0.0'), '2.0.0',
    'the fm branch bumps content_version to the new release 2.0.0 when the frontmatter-stripped body changed');
}

// ═══ SS01 — canonical project root (D1 ruling Q5): drifting `input.cwd` (docs/hooks.md:717, CwdChanged) missed .claude/semble ═══
// Order under test: CLAUDE_PROJECT_DIR -> hook file's installed location -> upward walk for a root marker -> hook cwd.
const deepDir = (p, ...parts) => { const d = join(p, ...parts); mkdirSync(d, { recursive: true }); return d; };
const SESSION_OK = (p) => ({
  systemMessage: 'semble: ready | cache abcdef01',
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext:
      'semble: use ONE mcp__semble_code__search first (repo=' + p +
      ', top_k=5, max_snippet_lines=10), then open the hit at start_line. ' + ROUTE_TEXT,
  },
});

// SS01.1 — the walk: two steering hooks, one nested cwd, unchanged answers.
{
  const p = freshProject({ state: READY_STATE() });
  const deep = deepDir(p, 'packages', 'app', 'src');
  check('SS01.1session', safeParse(session(p, { cwd: deep }).stdout), SESSION_OK(p),
    'SessionStart from a nested package walks up to the root and emits the root brief, not silence');
  check('SS01.1subagent', safeParse(subagent(p, 'Explore', { cwd: deep }).stdout), SUB_OK(p),
    'SubagentStart reads completed:["mcp"] from the root state even when the spawn cwd is a nested package');
}

// SS01.2 — the walk stops at the FIRST marker: from source, a nested package with its own .claude is its root.
// GIVEN ready root + packages/web with own state | WHEN session hook from source, cwd=pkg | THEN SESSION_OK(pkg)
{
  const p = freshProject({ state: READY_STATE() });
  const pkg = deepDir(p, 'packages', 'web');
  mkdirSync(join(pkg, '.claude', 'semble'), { recursive: true });
  writeFileSync(join(pkg, '.claude', 'semble', 'state.json'), READY_STATE());
  check('SS01.2firstMarker', safeParse(session(p, { cwd: pkg }).stdout), SESSION_OK(pkg),
    'the upward walk returns the nearest .claude - a nested package holding one is treated as its own root');
}

// SS01.3 — self-location beats the walk: installed <root>/.claude/hooks/<name>.mjs -> its own location IS the root.
// GIVEN ready root + packages/web with own .claude | WHEN installed semble-session.mjs runs, cwd=pkg | THEN SESSION_OK(root)
{
  const p = freshProject({ state: READY_STATE() });
  const pkg = deepDir(p, 'packages', 'web');
  mkdirSync(join(pkg, '.claude', 'semble'), { recursive: true });
  writeFileSync(join(pkg, '.claude', 'semble', 'state.json'), READY_STATE());
  const installed = join(p, '.claude', 'hooks', 'semble-session.mjs');
  mkdirSync(dirname(installed), { recursive: true });
  copyFileSync(SESSION_SRC, installed);
  const out = safeParse(runNode(installed, JSON.stringify({
    session_id: 'S1', cwd: pkg, hook_event_name: 'SessionStart', source: 'startup',
  })).stdout);
  check('SS01.3selfRoot', out, SESSION_OK(p),
    'the copy installed at <root>/.claude/hooks answers for the root even though the invoking package has its own .claude');
}

// SS01.4 — CLAUDE_PROJECT_DIR outranks everything: it is the value Claude Code
// exports to every hook child process (docs/hooks.md:487) and it does not drift.
{
  const p = freshProject({ state: READY_STATE() });
  const other = freshProject({ state: READY_STATE() });
  check('SS01.4envWins', safeParse(session(other).stdout), SESSION_OK(other),
    'without the env var the hook answers for the cwd project');
  check('SS01.4envSet', safeParse(runNode(SESSION_SRC, JSON.stringify({
    session_id: 'S1', cwd: other, hook_event_name: 'SessionStart', source: 'startup',
  }), BASE, { CLAUDE_PROJECT_DIR: p }).stdout), SESSION_OK(p),
    'with CLAUDE_PROJECT_DIR set it answers for that root and ignores a foreign cwd entirely');
  check('SS01.4envMissingDir', safeParse(runNode(SESSION_SRC, JSON.stringify({
    session_id: 'S1', cwd: other, hook_event_name: 'SessionStart', source: 'startup',
  }), BASE, { CLAUDE_PROJECT_DIR: join(BASE, 'no-such-root') }).stdout), SESSION_OK(other),
    'a CLAUDE_PROJECT_DIR pointing at a missing directory is ignored, not obeyed - the walk still answers');
}

// SS01.5 — the shell half: sc_project_root() was ${SEMBLE_PROJECT_ROOT:-$PWD},
// so every script run from a subdirectory installed into that subdirectory.
{
  const p = freshProject({ state: READY_STATE() });
  const deep = deepDir(p, 'packages', 'app', 'src');
  const shRoot = (cwd, extra, fn) => {
    const env = { ...process.env, ...(extra || {}) };
    for (const k of ['SEMBLE_PROJECT_ROOT', 'CLAUDE_PROJECT_DIR']) {
      if (!Object.prototype.hasOwnProperty.call(extra || {}, k)) delete env[k];
    }
    const r = spawnSync('bash', ['-c', `. "${LIB_COPY}"; ${fn || 'sc_project_root'}`], {
      cwd, env, encoding: 'utf8', timeout: 15000,
    });
    return [(r.stdout || '').trim(), r.status];
  };
  check('SS01.5walk', shRoot(deep), [p, 0],
    'sc_project_root from a nested subdirectory walks up to the marker instead of returning $PWD');
  check('SS01.5override', shRoot(deep, { SEMBLE_PROJECT_ROOT: p }), [p, 0],
    'SEMBLE_PROJECT_ROOT stays the top of the order - every existing suite pins the fixture with it');
  check('SS01.5env', shRoot(deep, { CLAUDE_PROJECT_DIR: p }), [p, 0],
    'CLAUDE_PROJECT_DIR is honoured when SEMBLE_PROJECT_ROOT is unset');
  check('SS01.5badOverride', shRoot(deep, { SEMBLE_PROJECT_ROOT: join(BASE, 'no-such-root') }), [p, 0],
    'an override naming a missing directory falls through to the walk rather than installing into nothing');
  check('SS01.5candidateRc', shRoot(BASE, {}, 'sc_root_candidate'), [BASE, 1],
    'sc_root_candidate signals "no marker found" with rc 1 while still printing $PWD, so a caller can refuse');
  check('SS01.5rootTotal', shRoot(BASE), [BASE, 0],
    'sc_project_root itself stays total: an errexit caller in "$(sc_project_root)" must never abort');
}

// SS01.6 — hook parity with sc_is_profile_parent: a profile `.claude` (HOME, test HOME, config-dir parent) is no root.
// GIVEN ready dir h + marker-less h/notes/misc | WHEN h is a home or profile parent | THEN walk skips h, no brief, no write
{
  const h = freshProject({ state: READY_STATE() });
  const cwd = deepDir(h, 'notes', 'misc');
  const cfgH = join(h, '.claude');
  writeFileSync(join(cfgH, '.claude.json'), JSON.stringify({ mcpServers: { semble_code: MCP_ENTRY } }));
  const sess = (env) => safeParse(session(cwd, {}, env).stdout);
  const sub = (env) => safeParse(subagent(cwd, 'Explore', {}, env).stdout);
  check('SS01.6control', [sess({}), sub({})], [SESSION_OK(h), SUB_OK(h)],
    'control: with h a plain dir the walk from h/notes/misc reaches its .claude and both hooks answer for h');
  const asProfile = [
    { HOME: h },
    { SEMBLE_TEST_HOME: h, SEMBLE_TEST_CONFIG_DIR: CFG },
    { CLAUDE_CONFIG_DIR: cfgH },
  ];
  check('SS01.6session', asProfile.map(sess), [{}, {}, {}],
    'SessionStart skips h as HOME, as test HOME and as the parent of CLAUDE_CONFIG_DIR - no state at the cwd, silence');
  check('SS01.6subagent', asProfile.map(sub), [{}, {}, {}],
    'SubagentStart skips the same three profile parents - the profile state never steers a non-project spawn');
  check('SS01.6envWins', [sess({ HOME: h, CLAUDE_PROJECT_DIR: h }), sub({ HOME: h, CLAUDE_PROJECT_DIR: h })],
    [SESSION_OK(h), SUB_OK(h)], 'CLAUDE_PROJECT_DIR still wins first, even when it names the home dir');
}
// GIVEN h/.claude/semble present | WHEN stats hook fires from h/notes/misc | THEN telemetry only when h is not a profile parent
{
  const tel = (env) => {
    const h = freshProject({ state: READY_STATE() });
    const cwd = deepDir(h, 'notes', 'misc');
    const r = runNode(STATS_SRC, JSON.stringify({
      session_id: 'S1', cwd, hook_event_name: 'PostToolUse', tool_name: 'mcp__semble_code__search',
      tool_input: { query: 'q' }, tool_response: {}, tool_use_id: 'toolu_x',
    }), BASE, typeof env === 'function' ? env(h) : env);
    return [r.status, safeParse(r.stdout), existsSync(telemetryFile(h)), existsSync(telemetryFile(cwd))];
  };
  check('SS01.6statsControl', tel({}), [0, {}, true, false],
    'control: with h a plain dir the stats hook logs the call to h/.claude/semble/telemetry.jsonl');
  check('SS01.6stats', [tel((h) => ({ HOME: h })), tel((h) => ({ CLAUDE_CONFIG_DIR: join(h, '.claude') }))],
    [[0, {}, false, false], [0, {}, false, false]],
    'with h as HOME or as the config-dir parent the stats hook never appends to the profile telemetry log');
}
// GIVEN hook copy at h/.claude/hooks + ready project q | WHEN HOME=h, cwd=q | THEN self-location skipped, answers for q
{
  const h = freshProject({ state: READY_STATE() });
  const q = freshProject({ state: READY_STATE() });
  const installed = join(h, '.claude', 'hooks', 'semble-session.mjs');
  mkdirSync(dirname(installed), { recursive: true });
  copyFileSync(SESSION_SRC, installed);
  const run = (env) => safeParse(runNode(installed, JSON.stringify({
    session_id: 'S1', cwd: q, hook_event_name: 'SessionStart', source: 'startup',
  }), BASE, env).stdout);
  check('SS01.6selfRoot', [run({}), run({ HOME: h })], [SESSION_OK(h), SESSION_OK(q)],
    'a copy under a project .claude/hooks answers for its project; under HOME/.claude/hooks it walks from the cwd');
}

// ═══ H. Cross-hook invariants: one presence check, one routing line, a stamp on every asset ═══
{
  const steering = [SESSION_SRC, SUBAGENT_SRC].map((f) => readFileSync(f, 'utf8'));
  const blockOf = (src) => {
    const a = src.indexOf('// --- MCP presence + search routing');
    const b = src.indexOf('\n// ----', a + 1);
    return a < 0 || b < 0 ? '' : src.slice(a, b);
  };
  const blocks = steering.map(blockOf);
  check('H1.blockIdentical', [blocks[0].length > 0, blocks.every((x) => x === blocks[0])], [true, true],
    'session and subagent carry the byte-identical MCP-presence + routing block');
  check('H1.route', steering.map((src) => src.includes("const ROUTE = '" + ROUTE_TEXT + "';")), [true, true],
    'and that block defines exactly the X9 routing line the hooks inject');
  check('H1.noProxy', steering.map((src) => src.includes("completed.indexOf('mcp')")), [false, false],
    'no hook gates on the state.completed proxy any more');
  const stamps = [SESSION_SRC, STATS_SRC, SUBAGENT_SRC]
    .map((f) => /^\/\/ brewcode-meta: version=\d+\.\d+\.\d+ content_version=\d+\.\d+\.\d+ generated_by=brewcode:semble-setup$/
      .test(readFileSync(f, 'utf8').split('\n')[1]));
  check('H2.stamps', stamps, [true, true, true],
    'all three hook assets carry the brewcode-meta stamp on line 2, so installed-copy drift is detectable');
}
{
  // K1: current tool names only; `Task`, `MultiEdit` and friends never appear as compared names.
  const dead = /'(Task|MultiEdit|TaskOutput|BashOutput|KillShell|KillBash|SlashCommand|NotebookRead)'/;
  check('H3.toolNames', [SESSION_SRC, STATS_SRC, SUBAGENT_SRC]
    .map((f) => dead.test(readFileSync(f, 'utf8'))), [false, false, false],
  'no hook compares against a retired tool name');
}

// ═══ P. 6.5.2: report-only edited rule (P1) and layered permissions (P3) ═══
const SEARCH_T = 'mcp__semble_code__search';
const RELATED_T = 'mcp__semble_code__find_related';
const localPath = (p) => join(p, '.claude', 'settings.local.json');
const NO_LAYERS = { project: [], local: [], user: [] };

// GIVEN a hand-edited rule WHEN install --part rule runs THEN the bytes stay, the report forbids a hand merge
{
  const p = freshProject({});
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  mkdirSync(dirname(rulePath), { recursive: true });
  const edited = TPL_TEXT + '\n<!-- project note -->\n';
  writeFileSync(rulePath, edited);
  const tpl = join(SKILL_COPY, 'assets', 'semble-first.md.template');
  const r = guidance(p, ['install', '--part', 'rule', '--json']);
  const j = safeParse(r.stdout);
  check('P1.reportOnly', [r.status, readRaw(rulePath), j.changed, j.skipped, r.stderr.split('\n')[0]],
    [0, edited, [],
      [`rule: user_modified, left as is - never hand-edit or merge it; user review: diff -u ${rulePath} ${tpl}; `
        + `replace only on the user's explicit --force (backup taken) ${rulePath}`],
      `# REVIEW ONLY - do not apply: user-edited ${rulePath} vs template (the skill never edits it)`],
    'an edited rule is reported with the review command and the --force route, never rewritten or merge-invited');
}

// GIVEN SKILL.md and semble-status.sh WHEN scanned THEN no wording invites a hand merge and the prohibition is stated
{
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const statusSh = readFileSync(join(SCRIPTS, 'semble-status.sh'), 'utf8');
  const both = skill + statusSh;
  check('P1.noMergeInvite', {
    targetedCorrection: both.split('targeted correction').length - 1,
    mergeByHand: both.split('merge by hand').length - 1,
    thenHandMerge: both.split('then a hand merge').length - 1,
    staleSection: both.split('name any confirmed stale section').length - 1,
    prohibition: skill.includes('**Never Write, Edit, `sed`, `cp` or hand-merge `.claude/rules/semble-first.md`, '
      + 'and never set its `content_version` yourself**'),
  }, { targetedCorrection: 0, mergeByHand: 0, thenHandMerge: 0, staleSection: 0, prohibition: true },
  'P1: the skill only reports an edited rule; the model never edits or merges it');
}

// GIVEN both tools granted only by settings.local.json WHEN status runs THEN permissions are wired from `local`
{
  const p = freshProject({ settings: '{"hooks":{}}\n' });
  writeFileSync(localPath(p), JSON.stringify({ permissions: { allow: [SEARCH_T, RELATED_T] } }));
  check('P3.localWired', safeParse(guidance(p, ['status', '--json']).stdout).permissions,
    { allow: [], wired: true, source: ['local'], missing: [],
      layers: { ...NO_LAYERS, local: [SEARCH_T, RELATED_T] } },
    'Claude Code honours settings.local.json, so the status counts it');
}

// GIVEN a server-wide `mcp__semble_code` rule in the tracked file WHEN status runs THEN both tools are granted
{
  const p = freshProject({ settings: '{"permissions":{"allow":["mcp__semble_code"]}}\n' });
  check('P3.serverWide', safeParse(guidance(p, ['status', '--json']).stdout).permissions,
    { allow: [], wired: true, source: ['project'], missing: [],
      layers: { ...NO_LAYERS, project: ['mcp__semble_code'] } },
    'a server-wide rule grants every semble_code tool');
}

// GIVEN `mcp__semble_code__*` only in the profile settings WHEN status runs THEN permissions are wired from `user`
{
  const p = freshProject({});
  const userSettings = join(HOME, '.claude', 'settings.json');
  writeFileSync(userSettings, '{"permissions":{"allow":["mcp__semble_code__*"]}}\n');
  const st = safeParse(guidance(p, ['status', '--json']).stdout).permissions;
  rmSync(userSettings, { force: true });
  check('P3.userWildcard', st,
    { allow: [], wired: true, source: ['user'], missing: [],
      layers: { ...NO_LAYERS, user: ['mcp__semble_code__*'] } },
    'a user-scope wildcard grant is read from the active profile settings.json');
}

// GIVEN a local grant WHEN install --part permissions runs THEN tracked settings.json is byte-unchanged
{
  const seed = '{"hooks":{}}\n';
  const p = freshProject({ settings: seed });
  writeFileSync(localPath(p), JSON.stringify({ permissions: { allow: [SEARCH_T, RELATED_T] } }));
  const r = guidance(p, ['install', '--part', 'permissions', '--json']);
  const j = safeParse(r.stdout);
  check('P3.noTrackedCopy', [r.status, readRaw(settingsPath(p)), j.changed, j.unchanged],
    [0, seed, [], [`settings: permissions granted by ${localPath(p)} are not copied into ${settingsPath(p)}`]],
    'a tool any layer grants is never duplicated into the tracked settings.json');
}

// GIVEN a local grant WHEN install --part all then remove --part all THEN tracked holds no permissions, local untouched
{
  const p = freshProject({});
  const local = JSON.stringify({ permissions: { allow: [SEARCH_T, RELATED_T, 'Bash(ls:*)'] } });
  writeFileSync(localPath(p), local);
  const inst = guidance(p, ['install', '--part', 'all', '--json']);
  const afterInstall = readSettings(p);
  const rem = guidance(p, ['remove', '--part', 'all', '--json']);
  check('P3.allThenRemove',
    [inst.status, afterInstall.permissions, wantCounts(p, afterInstall), rem.status, readRaw(localPath(p))],
    [0, undefined, [1, 1, 1, 1], 0, local],
    'hooks land in tracked settings, permissions stay where the user granted them, remove never touches local');
}

// GIVEN only the search tool granted locally WHEN install --part permissions THEN only find_related is written
{
  const p = freshProject({});
  writeFileSync(localPath(p), JSON.stringify({ permissions: { allow: [SEARCH_T] } }));
  const r = guidance(p, ['install', '--part', 'permissions', '--json']);
  check('P3.partialGrant', [r.status, readSettings(p)], [0, { permissions: { allow: [RELATED_T] } }],
    'the tracked file receives exactly the tool no layer grants yet');
}

// GIVEN the project-dusk shape: all four rows run through the project's own launcher, command-only
// WHEN status reads it, then install --part hooks runs THEN rows read custom (wired), settings stay byte-equal
{
  const p = freshProject({});
  const W = (script) => ({ type: 'command', timeout: 5,
    command: `"$CLAUDE_PROJECT_DIR/.claude/scripts/toolchain_preflight.py" exec node -- "$CLAUDE_PROJECT_DIR/.claude/hooks/${script}"` });
  const wrapped = { hooks: {
    SessionStart: [{ hooks: [W('semble-session.mjs')] }],
    PostToolUse: [{ matcher: STATS_MATCHER, hooks: [W('semble-stats.mjs')] }],
    PostToolUseFailure: [{ matcher: STATS_MATCHER, hooks: [W('semble-stats.mjs')] }],
    SubagentStart: [{ hooks: [W('semble-subagent.mjs')] }],
  } };
  writeFileSync(settingsPath(p), JSON.stringify(wrapped, null, 2) + '\n');
  const b = safeParse(guidance(p, ['status', '--json']).stdout).hooks;
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('W1.wrapped', [b.wiredCount, b.customCount, b.missingCount, b.staleEntries, b.entries.map((e) => e.state), r.status, readSettings(p)],
    [4, 4, 0, 0, ['custom', 'custom', 'custom', 'custom'], 0, wrapped],
    'a wrapped registration is detected as wired (custom), never stale, and the merge adds no unwrapped copy');
}

// GIVEN only the session row wrapped, the rest absent
// WHEN status reads it, then install --part hooks runs THEN the three absent rows read missing and only they are added
{
  const p = freshProject({});
  const W = { type: 'command', timeout: 5,
    command: '"$CLAUDE_PROJECT_DIR/.claude/scripts/toolchain_preflight.py" exec node -- "$CLAUDE_PROJECT_DIR/.claude/hooks/semble-session.mjs"' };
  writeFileSync(settingsPath(p), JSON.stringify({ hooks: { SessionStart: [{ hooks: [W] }] } }, null, 2) + '\n');
  const b = safeParse(guidance(p, ['status', '--json']).stdout).hooks;
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  const s = readSettings(p);
  check('W2.halfWrapped', [b.wiredCount, b.customCount, b.missingCount, r.status, s.hooks.SessionStart, wantCounts(p, s)],
    [1, 1, 3, 0, [{ hooks: [W] }], [0, 1, 1, 1]],
    'a missing row still reads missing beside a wrapped one; the wrapped session row gets no second copy');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nsuite-hooks (unit D)');
console.log(`  base: ${BASE}`);
console.log(`  semble-common.sh: ${usedRealLib ? 'real (unit B)' : 'local stub (unit B has not landed)'}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
