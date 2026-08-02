#!/usr/bin/env node
/**
 * suite-hooks.mjs — unit D: rule template, CLAUDE.md marker block, the two
 * hooks, and the settings.json merge performed by semble-guidance.sh.
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
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync,
  readdirSync, realpathSync, statSync, chmodSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');          // tests/
const SKILL = join(HERE, '..');                                   // skills/semble/
const ASSETS = join(SKILL, 'assets');
const SCRIPTS = join(SKILL, 'scripts');
const TEMPLATE_SRC = join(ASSETS, 'semble-first.md.template');
const SESSION_SRC = join(ASSETS, 'semble-session.mjs');
const REMINDER_SRC = join(ASSETS, 'semble-reminder.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-d-')));
const HOME = join(BASE, 'home');
mkdirSync(join(HOME, '.claude'), { recursive: true });

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
const SKILL_COPY = join(BASE, 'skill');
mkdirSync(join(SKILL_COPY, 'scripts', 'lib'), { recursive: true });
mkdirSync(join(SKILL_COPY, 'assets'), { recursive: true });
copyFileSync(join(SCRIPTS, 'semble-guidance.sh'), join(SKILL_COPY, 'scripts', 'semble-guidance.sh'));
for (const f of ['semble-first.md.template', 'semble-session.mjs', 'semble-reminder.mjs']) {
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
`;
const usedRealLib = existsSync(REAL_LIB);
if (usedRealLib) copyFileSync(REAL_LIB, LIB_COPY);
else writeFileSync(LIB_COPY, LIB_STUB);
const GUIDANCE = join(SKILL_COPY, 'scripts', 'semble-guidance.sh');
const TPL_TEXT = readFileSync(TEMPLATE_SRC, 'utf8');

let projSeq = 0;
function freshProject(seed) {
  projSeq++;
  const dir = join(BASE, `proj${projSeq}`);
  mkdirSync(join(dir, '.claude'), { recursive: true });
  if (seed && seed.settings !== undefined) {
    writeFileSync(join(dir, '.claude', 'settings.json'), seed.settings);
  }
  if (seed && seed.state !== undefined) {
    mkdirSync(join(dir, '.claude', 'semble'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'semble', 'state.json'), seed.state);
  }
  if (seed && seed.stateDir === true) {
    mkdirSync(join(dir, '.claude', 'semble', 'state.json'), { recursive: true });
  }
  if (seed && seed.claudeMd !== undefined) {
    writeFileSync(join(dir, 'CLAUDE.md'), seed.claudeMd);
  }
  return dir;
}

function guidance(proj, args) {
  const r = spawnSync('bash', [GUIDANCE, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SEMBLE_PROJECT_ROOT: proj,
      SEMBLE_TEST_HOME: HOME,
      SEMBLE_NO_NETWORK: '1',
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

function semblePaths(proj) {
  const d = hooksDirOf(proj);
  return { session: join(d, 'semble-session.mjs'), reminder: join(d, 'semble-reminder.mjs') };
}

const READY_STATE = (extra) =>
  JSON.stringify({
    schema: 1,
    profile: 'code',
    projectRoot: '/x',
    approvedVersion: '0.5.2',
    phase: 'ready',
    enabled: true,
    scope: 'user',
    cacheRoot: '/c',
    repoHash: 'abcdef0123456789'.repeat(4),
    completed: [],
    ...(extra || {}),
  });

function reminderPayload(proj, toolName, toolInput) {
  return JSON.stringify({
    session_id: 'S1',
    cwd: proj,
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
  });
}

const allReminderOutputs = [];
function reminder(proj, toolName, toolInput) {
  const r = runNode(REMINDER_SRC, reminderPayload(proj, toolName, toolInput));
  allReminderOutputs.push(r.stdout);
  return r;
}

const EXPECTED_MSG = (cwd) =>
  'semble: for intent/behavior questions try ONE mcp__semble_code__search first — repo="' +
  cwd +
  '", top_k=5, max_snippet_lines=10 — then open the hit at start_line. ' +
  'This grep is fine for exact/exhaustive matching; this is a reminder, not a block.';

const REMIND_OK = (cwd) => ({
  hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: EXPECTED_MSG(cwd) },
});

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
  const { session, reminder: rem } = semblePaths(p);
  check('A1.sessionEntry', s.hooks.SessionStart, [
    { hooks: [{ type: 'command', command: 'node', args: [session], timeout: 5000 }] },
  ], 'SessionStart entry has the exact contract shape with an explicit 5000 ms timeout');
  check('A1.preToolUse', s.hooks.PreToolUse, [
    { hooks: [{ type: 'command', command: 'node', args: [rem], timeout: 5000 }], matcher: 'Bash' },
    { hooks: [{ type: 'command', command: 'node', args: [rem], timeout: 5000 }], matcher: 'Grep' },
  ], 'the reminder is registered once under Bash and once under Grep');
  check('A1.perm', s.permissions.allow, ['mcp__semble_code__search', 'mcp__semble_code__find_related'],
    'both MCP tool names land in permissions.allow');
  check('A1.files', [existsSync(session), existsSync(rem)], [true, true], 'both .mjs assets were copied into .claude/hooks');
  check('A1.rule', readRaw(join(p, '.claude', 'rules', 'semble-first.md')), TPL_TEXT,
    'the rule file is byte-identical to the template');
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
  const { session, reminder: rem } = semblePaths(p);
  check('A2.counts', [
    countEntry(s, 'SessionStart', null, session),
    countEntry(s, 'PreToolUse', 'Bash', rem),
    countEntry(s, 'PreToolUse', 'Grep', rem),
  ], [1, 1, 1], 'exactly one entry per event+matcher after three merges');
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
  const { session, reminder: rem } = semblePaths(p);
  check('A3.counts', [
    countEntry(s, 'SessionStart', null, session),
    countEntry(s, 'PreToolUse', 'Bash', rem),
    countEntry(s, 'PreToolUse', 'Grep', rem),
  ], [1, 1, 1], 'exactly one semble entry per event+matcher alongside the foreign ones');
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
        { hooks: [{ type: 'command', command: 'node', args: [staleDir + '/semble-session.mjs'], timeout: 5000 }] },
      ],
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: [staleDir + '/semble-reminder.mjs'], timeout: 5000 }] },
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
  const { session, reminder: rem } = semblePaths(p);
  check('A5.counts', [
    countEntry(s, 'SessionStart', null, session),
    countEntry(s, 'PreToolUse', 'Bash', rem),
    countEntry(s, 'PreToolUse', 'Grep', rem),
  ], [1, 1, 1], 'the new-dir entries were added exactly once each');
  check('A5.foreign', s.hooks.PreToolUse.filter((e) => argsOf(e).includes('/opt/foreign/other.mjs')).length, 1,
    'the foreign Write entry survived the stale-path purge');
}

// A6 — uninstall leaves zero markers and prunes empty containers
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const { session, reminder: rem } = semblePaths(p);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('A6.exit', r.status, 0, 'remove --part all exits 0');
  const s = readSettings(p);
  check('A6.hooksKey', Object.prototype.hasOwnProperty.call(s, 'hooks'), false,
    'the hooks object is deleted once every event array empties');
  check('A6.permissionsKey', Object.prototype.hasOwnProperty.call(s, 'permissions'), false,
    'the permissions object is deleted once allow empties');
  check('A6.files', [existsSync(session), existsSync(rem)], [false, false], 'both .mjs files are deleted');
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
  check('A8.beforeWired', [b.hooks.session.wired, b.hooks.reminder.wired, b.permissions.wired],
    [false, false, false], 'nothing is reported as wired before install');
  guidance(p, ['install', '--part', 'all', '--json']);
  const after = guidance(p, ['status', '--json']);
  const a = safeParse(after.stdout);
  check('A8.afterRule', a.rule.state, 'managed', 'status reports the rule as managed after install');
  check('A8.afterClaudeMd', a.claudeMd.state, 'present', 'status reports the CLAUDE.md block as present');
  check('A8.afterWired', [a.hooks.session.wired, a.hooks.reminder.wired, a.permissions.wired],
    [true, true, true], 'session hook, reminder (both matchers) and permissions all report wired');
  check('A8.stale', a.hooks.staleEntries, 0, 'no stale entries after a clean install');
  check('A8.wiredCount', a.hooks.wiredCount, 3, 'all 3 settings entries are counted as wired');
  check('A8.exitReadOnly', before.status, 0, 'status exits 0');
}

// ═══════════════════════════════════════════════════════════════════════════
// B. rule file policy
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'rule', '--json']);
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  check('B1.created', readRaw(rulePath), TPL_TEXT, 'a fresh rule file is byte-identical to the template');

  const edited = TPL_TEXT + '\n<!-- my own note -->\n';
  writeFileSync(rulePath, edited);
  const r = guidance(p, ['install', '--part', 'rule', '--json']);
  check('B2.noClobber', readRaw(rulePath), edited, 'a user-modified rule is never blind-overwritten');
  check('B2.exit', r.status, 0, 'the no-clobber path still exits 0');
  check('B2.reported', safeParse(r.stdout).skipped.length, 1, 'the user_modified rule is reported as skipped');
  const st = safeParse(guidance(p, ['status', '--json']).stdout);
  check('B2.status', st.rule.state, 'user_modified', 'status reports user_modified');

  const rf = guidance(p, ['install', '--part', 'rule', '--force', '--json']);
  check('B3.forced', readRaw(rulePath), TPL_TEXT, '--force restores the template');
  check('B3.exit', rf.status, 0, 'the forced overwrite exits 0');
  const backups = readdirSync(join(p, '.claude', 'rules')).filter((f) => f.startsWith('semble-first.md.bak.'));
  check('B3.backup', backups.length, 1, 'the overwritten user version was backed up first');
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
  check('C1.body', once.includes('> Not indexed: `.html`, `.json`/`.csv`. Details: `.claude/rules/semble-first.md`.'), true,
    'the block carries the verbatim last line of the design body');

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
    { systemMessage: 'semble: state file is corrupt — run /brewcode:semble status' },
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
    systemMessage: 'semble: awaiting reload — run /brewcode:semble resume',
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        'semble_code MCP was just registered; verification is pending. Run /brewcode:semble resume before relying on semantic search.',
    },
  }, 'awaiting_reload -> resume nudge with additionalContext');
}
{
  const p = freshProject({ state: READY_STATE({ phase: 'error' }) });
  check('D6.error', safeParse(session(p).stdout), { systemMessage: 'semble: error — run /brewcode:semble status' },
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
    { systemMessage: 'semble: state file is corrupt — run /brewcode:semble status' },
    'a directory in place of state.json reports corrupt');
}
{
  const bad = runNode(SESSION_SRC, 'not json at all');
  const empty = runNode(SESSION_SRC, '');
  check('D10.badStdin', [bad.status, safeParse(bad.stdout)], [0, {}], 'session hook: malformed stdin -> {} exit 0');
  check('D10.emptyStdin', [empty.status, safeParse(empty.stdout)], [0, {}], 'session hook: empty stdin -> {} exit 0');
}

// ═══════════════════════════════════════════════════════════════════════════
// E. PreToolUse reminder — advisory only
// ═══════════════════════════════════════════════════════════════════════════
{
  const p = freshProject({});
  const r = reminder(p, 'Bash', { command: 'rg "how does auth work"' });
  check('E1.noState', safeParse(r.stdout), {}, 'no state file -> silence');
  check('E1.exit', r.status, 0, 'exit 0 with no state file');
}
{
  const p = freshProject({ state: READY_STATE() });
  const r = reminder(p, 'Bash', { command: 'rg "how does auth work"' });
  check('E2.emit', safeParse(r.stdout), REMIND_OK(p), 'a plain intent query gets the exact advisory string');
  check('E2.exit', r.status, 0, 'the emitting path exits 0');
  check('E2.marker', existsSync(join(p, '.claude', 'semble', '.reminder-ts')), true, 'the throttle marker is written on emit');
  const again = reminder(p, 'Bash', { command: 'rg "where do we persist sessions"' });
  check('E3.throttled', safeParse(again.stdout), {}, 'a second reminder inside the 600 s window is suppressed');
}

const SILENT_BASH = [
  ['E4.filesWithMatches', 'rg -l foo', 'the -l enumeration flag'],
  ['E5.regex', "rg 'foo.*bar'", 'a real regex pattern'],
  ['E6.fixedStrings', 'grep -F literal .', 'the -F literal flag'],
  ['E7.findName', "find . -name '*.ts'", 'a find -name filename search'],
  ['E8.pipedWc', 'rg intent | wc -l', 'a pipeline into wc'],
  ['E9.count', 'rg -c handler', 'the -c count flag'],
  ['E10.wordRegexp', 'rg -w handler', 'the -w word-regexp flag'],
  ['E11.onlyMatching', 'rg -o handler', 'the -o only-matching flag'],
  ['E12.shortPattern', 'rg ab', 'a pattern shorter than 3 characters'],
  ['E13.pathPattern', 'rg src/store/session', 'a path-like pattern'],
  ['E14.fileName', 'rg session.ts', 'a filename-like pattern'],
  ['E15.mentionsSemble', 'rg "semble cache layout"', 'a command that already mentions semble'],
  ['E16.notASearch', 'npm run build', 'a command that is not a search at all'],
  ['E17.midWord', 'echo ripgrep is nice', 'grep appearing mid-word, not at a command boundary'],
  ['E18.sortPipe', 'rg handler | sort', 'a pipeline into sort'],
];
for (const [name, command, why] of SILENT_BASH) {
  const p = freshProject({ state: READY_STATE() });
  const r = reminder(p, 'Bash', { command });
  check(name, safeParse(r.stdout), {}, `silent on \`${command}\` because of ${why}`);
}

{
  const p = freshProject({ state: READY_STATE({ phase: 'awaiting_reload' }) });
  check('E19.mcpUnavailable', safeParse(reminder(p, 'Bash', { command: 'rg "how does auth work"' }).stdout), {},
    'silent while the MCP is not verified yet (phase != ready)');
}
{
  const p = freshProject({ state: READY_STATE({ enabled: false }) });
  check('E20.disabled', safeParse(reminder(p, 'Bash', { command: 'rg "how does auth work"' }).stdout), {},
    'silent when the project has semble disabled');
}
{
  const p = freshProject({ state: READY_STATE() });
  check('E21.otherTool', safeParse(reminder(p, 'Read', { file_path: '/x' }).stdout), {},
    'silent for tools other than Bash and Grep');
}
{
  const p = freshProject({ state: READY_STATE() });
  const r = reminder(p, 'Grep', { pattern: 'how does auth work' });
  check('E22.grepTool', safeParse(r.stdout), REMIND_OK(p), 'the native Grep tool gets the same advisory');
}
{
  const p = freshProject({ state: READY_STATE() });
  check('E23.grepEnum', safeParse(reminder(p, 'Grep', { pattern: 'how does auth work', output_mode: 'files_with_matches' }).stdout),
    {}, 'the native Grep tool in files_with_matches mode is enumeration -> silent');
}
{
  const p = freshProject({ state: READY_STATE() });
  check('E24.emptyCommand', safeParse(reminder(p, 'Bash', {}).stdout), {}, 'silent when tool_input carries no command');
}
{
  const p = freshProject({ stateDir: true });
  const r = reminder(p, 'Bash', { command: 'rg "how does auth work"' });
  check('E25.stateDir', [r.status, safeParse(r.stdout)], [0, {}], 'reminder: state.json as a directory -> {} exit 0');
}
{
  const bad = runNode(REMINDER_SRC, '{ not json');
  const empty = runNode(REMINDER_SRC, '');
  allReminderOutputs.push(bad.stdout, empty.stdout);
  check('E26.badStdin', [bad.status, safeParse(bad.stdout)], [0, {}], 'reminder: malformed stdin -> {} exit 0');
  check('E27.emptyStdin', [empty.status, safeParse(empty.stdout)], [0, {}], 'reminder: empty stdin -> {} exit 0');
}

// E28 — the reminder can never block, in any recorded output
{
  const joined = allReminderOutputs.join('\n');
  check('E28.noDecision', joined.includes('permissionDecision'), false, 'no recorded output ever carries permissionDecision');
  check('E28.noDeny', joined.includes('"deny"'), false, 'no recorded output ever carries a deny');
  check('E28.noUpdatedInput', joined.includes('updatedInput'), false, 'no recorded output ever carries updatedInput');
  check('E28.oneObject', allReminderOutputs.every((o) => o.trim().split('\n').length === 1), true,
    'every reminder invocation printed exactly one line of JSON');
}

// ═══════════════════════════════════════════════════════════════════════════
// F. static guarantees of both hook files
// ═══════════════════════════════════════════════════════════════════════════
{
  const src = [readFileSync(SESSION_SRC, 'utf8'), readFileSync(REMINDER_SRC, 'utf8')];
  const both = src.join('\n');
  check('F1.noChildProcess', both.includes('child_process'), false, 'neither hook imports child_process');
  check('F2.noSpawn', both.includes('spawn('), false, 'neither hook spawns a process');
  check('F3.noPgrep', both.includes('pgrep'), false, 'neither hook probes for a daemon with pgrep');
  check('F4.noExecSync', both.includes('execSync'), false, 'neither hook shells out');
  check('F5.reminderNeverDecides', readFileSync(REMINDER_SRC, 'utf8').includes('permissionDecision:'), false,
    'the reminder source contains no permissionDecision field');
  check('F6.notABlock', readFileSync(REMINDER_SRC, 'utf8').includes('this is a reminder, not a block.'), true,
    'the advisory text contains the words "reminder, not a block"');
  check('F7.shebang', src.every((s) => s.startsWith('#!/usr/bin/env node')), true, 'both hooks carry a node shebang');
  const checks = [SESSION_SRC, REMINDER_SRC].map((f) => spawnSync(process.execPath, ['--check', f]).status);
  check('F8.nodeCheck', checks, [0, 0], 'node --check passes on both hook files');
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
  const { session, reminder: rem } = semblePaths(p);
  const r = guidance(p, ['install', '--part', 'all', '--json']);
  check('H1.exit', r.status, 1, 'install --part all over unparseable settings exits 1');
  check('H1.abort', (r.stdout + r.stderr).includes('ABORT'), true, 'the failure names ABORT');
  check('H1.settings', readRaw(settingsPath(p)), BROKEN_SETTINGS, 'the unparseable settings file is byte-identical');
  check('H1.rule', existsSync(join(p, '.claude', 'rules', 'semble-first.md')), false, 'no rule file was written');
  check('H1.claudeMd', readRaw(join(p, 'CLAUDE.md')), PRE_MD, 'CLAUDE.md is byte-identical, no marker block');
  check('H1.hookFiles', [existsSync(session), existsSync(rem)], [false, false], 'neither .mjs hook file was written');
  check('H1.hooksDir', existsSync(hooksDirOf(p)), false, 'the .claude/hooks directory was never created');
}

// H2 — remove aborts on an unparseable settings.json BEFORE deleting anything
{
  const p = freshProject({ claudeMd: PRE_MD });
  guidance(p, ['install', '--part', 'all', '--json']);
  const rulePath = join(p, '.claude', 'rules', 'semble-first.md');
  const mdPath = join(p, 'CLAUDE.md');
  const { session, reminder: rem } = semblePaths(p);
  const before = {
    rule: readRaw(rulePath), md: readRaw(mdPath), session: readRaw(session), reminder: readRaw(rem),
  };
  writeFileSync(settingsPath(p), BROKEN_SETTINGS);
  const r = guidance(p, ['remove', '--part', 'all', '--json']);
  check('H2.exit', r.status, 1, 'remove --part all over unparseable settings exits 1');
  check('H2.abort', (r.stdout + r.stderr).includes('ABORT'), true, 'the failure names ABORT');
  check('H2.settings', readRaw(settingsPath(p)), BROKEN_SETTINGS, 'the unparseable settings file is byte-identical');
  check('H2.rule', readRaw(rulePath), before.rule, 'the rule file is still there, byte-identical');
  check('H2.claudeMd', readRaw(mdPath), before.md, 'the CLAUDE.md marker block is still there, byte-identical');
  check('H2.hookFiles', [readRaw(session), readRaw(rem)], [before.session, before.reminder],
    'both .mjs hook files are still there, byte-identical — settings.json may still reference them');
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
  const staleHook = { type: 'command', command: 'node', args: [staleDir + '/semble-reminder.mjs'], timeout: 5000 };
  const seed = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [FOREIGN_HOOK, staleHook] }] } };
  const p = freshProject({ settings: JSON.stringify(seed, null, 2) + '\n' });
  const r = guidance(p, ['install', '--part', 'hooks', '--json']);
  check('H5.exit', r.status, 0, 'merge over a mixed foreign+stale entry exits 0');
  const s = readSettings(p);
  const pre = (s.hooks || {}).PreToolUse || [];
  const { session, reminder: rem } = semblePaths(p);
  check('H5.mixedEntry', pre[0] || null, { matcher: 'Bash', hooks: [FOREIGN_HOOK] },
    'the mixed entry keeps the foreign hook and loses only the stale semble hook');
  check('H5.staleGone', Object.values(s.hooks || {}).flat().filter((e) => argsOf(e).some((a) => a.startsWith(staleDir))).length, 0,
    'zero hooks still point at the old hooks dir');
  check('H5.counts', [
    countEntry(s, 'SessionStart', null, session),
    countEntry(s, 'PreToolUse', 'Bash', rem),
    countEntry(s, 'PreToolUse', 'Grep', rem),
  ], [1, 1, 1], 'exactly one current entry per event+matcher');
  check('H5.preToolUseSize', pre.length, 3,
    'the repaired foreign entry plus the two appended semble entries');
}

// H6 — unmerge: a hand-merged foreign hook in a semble entry survives
{
  const p = freshProject({});
  guidance(p, ['install', '--part', 'all', '--json']);
  const s = readSettings(p);
  const idx = s.hooks.PreToolUse.findIndex((e) => matcherOf(e) === 'Bash');
  s.hooks.PreToolUse[idx].hooks.unshift(FOREIGN_HOOK);
  writeFileSync(settingsPath(p), JSON.stringify(s, null, 2) + '\n');
  const r = guidance(p, ['remove', '--part', 'hooks', '--json']);
  check('H6.exit', r.status, 0, 'unmerge over a hand-merged mixed entry exits 0');
  const t = readSettings(p);
  const left = t.hooks || {};
  check('H6.foreignKept', left.PreToolUse || null, [{ matcher: 'Bash', hooks: [FOREIGN_HOOK] }],
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
console.log('\nsuite-hooks (unit D)');
console.log(`  base: ${BASE}`);
console.log(`  semble-common.sh: ${usedRealLib ? 'real (unit B)' : 'local stub (unit B has not landed)'}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
