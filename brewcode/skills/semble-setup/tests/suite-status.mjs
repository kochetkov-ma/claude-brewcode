#!/usr/bin/env node
/**
 * suite-status.mjs - unit A: semble-status.sh (read-only) + semble-install.sh.
 *
 * Everything runs inside one mkdtemp base with an injected HOME, project root,
 * cache roots, a stubbed `claude` and a deliberately narrow PATH (so uv, uvx
 * and brew are provably absent). The real ~/.claude, the real cache and the
 * repo working tree are never touched.
 *
 * The read-only guarantee is proved mechanically: every semble-status.sh run is
 * wrapped in a before/after snapshot (path + kind + size + mtime of every entry
 * under home/, project/, cache/ and the staged scripts/) and the two snapshots
 * must be deep-equal.
 *
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  readdirSync, lstatSync, copyFileSync, symlinkSync, chmodSync, realpathSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');
const SKILL = join(HERE, '..');
const SRC_SCRIPTS = join(SKILL, 'scripts');
const FIX = join(HERE, 'fixtures');

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

// ── assertion primitives ────────────────────────────────────────────────────
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
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
    return;
  }
  failed++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push(`  FAIL  ${name}  (${message} | actual=${trunc(a)} expected=${trunc(e)})`);
}

function trunc(s) {
  const str = String(s);
  return str.length > 600 ? `${str.slice(0, 600)}...` : str;
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e && e.message), raw: String(str).slice(0, 400) };
  }
}

// ── temp world ──────────────────────────────────────────────────────────────
// realpath: sc_project_root resolves symlinks with `pwd -P`, and on macOS
// /var is a symlink to /private/var - the fixtures must use the resolved form.
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'semble-a-')));
const BIN = join(BASE, 'bin');
const BIN2 = join(BASE, 'bin2');
const HOME_DIR = join(BASE, 'home');
const PROJECT = join(BASE, 'project');
const CACHE_CODE = join(BASE, 'cache', 'semble-code');
const CACHE_DOCS = join(BASE, 'cache', 'semble-docs');
const STAGE = join(BASE, 'scripts');
const BIN3 = join(BASE, 'bin3');
const CLAUDE_LOG = join(BIN, 'claude-calls.log');
const BREW_LOG = join(BIN2, 'brew-calls.log');
const BREW_FAIL_LOG = join(BIN3, 'brew-fail-calls.log');
const TIMEOUT_STUB = join(BIN3, 'timeout');
const DETECT_FILE = join(BIN, 'detect.json');

for (const d of [BIN, BIN2, BIN3, HOME_DIR, join(HOME_DIR, '.claude'), PROJECT,
  join(PROJECT, '.claude'), CACHE_CODE, CACHE_DOCS, STAGE, join(STAGE, 'lib')]) {
  mkdirSync(d, { recursive: true });
}

// node must stay reachable under the narrowed PATH; uv/uvx/brew must not.
symlinkSync(process.execPath, join(BIN, 'node'));

writeFileSync(join(BIN, 'claude'), `#!/usr/bin/env bash
printf 'claude %s\\n' "$*" >> "${CLAUDE_LOG}"
case "\${1:-}" in
  --version) echo "2.1.223 (Claude Code)" ;;
  *) echo "stub claude: unsupported invocation: $*" >&2; exit 1 ;;
esac
`);
chmodSync(join(BIN, 'claude'), 0o755);

writeFileSync(join(BIN2, 'brew'), `#!/usr/bin/env bash
printf 'brew %s\\n' "$*" >> "${BREW_LOG}"
exit 0
`);
chmodSync(join(BIN2, 'brew'), 0o755);

// A brew that fails: `brew install coreutils` blowing up is a warning, never a
// failure, so the failing path needs its own stub to be provable.
writeFileSync(join(BIN3, 'brew'), `#!/usr/bin/env bash
printf 'brew %s\\n' "$*" >> "${BREW_FAIL_LOG}"
echo "stub brew: boom" >&2
exit 1
`);
chmodSync(join(BIN3, 'brew'), 0o755);
writeFileSync(TIMEOUT_STUB, `#!/usr/bin/env bash
secs="$1"; shift
exec "$@"
`);
chmodSync(TIMEOUT_STUB, 0o755);
writeFileSync(CLAUDE_LOG, '');
writeFileSync(BREW_LOG, '');
writeFileSync(BREW_FAIL_LOG, '');

// ── stage the two scripts under test + the shared library ───────────────────
copyFileSync(join(SRC_SCRIPTS, 'lib', 'semble-common.sh'), join(STAGE, 'lib', 'semble-common.sh'));
copyFileSync(join(SRC_SCRIPTS, 'semble-status.sh'), join(STAGE, 'semble-status.sh'));
copyFileSync(join(SRC_SCRIPTS, 'semble-install.sh'), join(STAGE, 'semble-install.sh'));

const STATUS_SH = join(STAGE, 'semble-status.sh');
const INSTALL_SH = join(STAGE, 'semble-install.sh');
const MCP_STUB = join(STAGE, 'semble-mcp.sh');

const ENV = {
  PATH: `${BIN}:/usr/bin:/bin`,
  HOME: HOME_DIR,
  TMPDIR: BASE,
  LANG: 'C',
  SEMBLE_TEST_HOME: HOME_DIR,
  SEMBLE_PROJECT_ROOT: PROJECT,
  SEMBLE_CACHE_ROOT_CODE: CACHE_CODE,
  SEMBLE_CACHE_ROOT_DOCS: CACHE_DOCS,
  SEMBLE_CLAUDE_BIN: join(BIN, 'claude'),
  SEMBLE_NO_NETWORK: '1',
};

const SNAP_DIRS = [HOME_DIR, PROJECT, join(BASE, 'cache'), STAGE];

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    const st = lstatSync(p);
    const kind = e.isDirectory() ? 'd' : (e.isSymbolicLink() ? 'l' : 'f');
    acc.push(`${p}|${kind}|${kind === 'd' ? 0 : st.size}|${Math.round(st.mtimeMs)}`);
    if (e.isDirectory()) walk(p, acc);
  }
}

function snapshot() {
  const acc = [];
  for (const d of SNAP_DIRS) {
    acc.push(`${d}|root|0|${Math.round(lstatSync(d).mtimeMs)}`);
    walk(d, acc);
  }
  acc.sort();
  return acc;
}

let roCounter = 0;
function runStatus(args, extraEnv = {}) {
  const before = snapshot();
  const r = spawnSync('bash', [STATUS_SH, ...args], {
    encoding: 'utf8', env: { ...ENV, ...extraEnv }, timeout: 60000,
  });
  const after = snapshot();
  roCounter += 1;
  check(`readonly-${roCounter}`, after, before,
    `semble-status.sh ${args.join(' ')} must not create, modify or delete a single byte`);
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

function runInstall(args, extraEnv = {}) {
  const r = spawnSync('bash', [INSTALL_SH, ...args], {
    encoding: 'utf8', env: { ...ENV, ...extraEnv }, timeout: 60000,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// ── fixture helpers ─────────────────────────────────────────────────────────
function fixtureText(rel) {
  return readFileSync(join(FIX, rel), 'utf8')
    .split('__PROJECT_ROOT__').join(PROJECT)
    .split('__CACHE_ROOT_CODE__').join(CACHE_CODE);
}

function installClaudeJson(name) {
  writeFileSync(join(HOME_DIR, '.claude.json'), fixtureText(join('claude-json', name)));
}

/** Mirror of sc_mcp_dump (DESIGN 6.3) - test-side data prep for the detect stub. */
function dumpFromClaudeJson(name) {
  const cj = join(HOME_DIR, '.claude.json');
  const out = {
    user: null, local: null, project: null,
    upstreamUser: null, upstreamLocal: null,
    malformed: [], projectEnabled: null,
  };
  let j;
  try {
    j = JSON.parse(fixtureText(join('claude-json', name)));
  } catch {
    out.malformed.push(cj);
    return out;
  }
  const ms = j.mcpServers || {};
  if (ms.semble_code) out.user = ms.semble_code;
  if (ms.semble) out.upstreamUser = ms.semble;
  const pj = (j.projects && j.projects[PROJECT]) || null;
  if (pj && pj.mcpServers) {
    if (pj.mcpServers.semble_code) out.local = pj.mcpServers.semble_code;
    if (pj.mcpServers.semble) out.upstreamLocal = pj.mcpServers.semble;
  }
  return out;
}

function installDetectStub() {
  writeFileSync(MCP_STUB, `#!/usr/bin/env bash
set -euo pipefail
cat "\${SEMBLE_STUB_DETECT:?}"
`);
  chmodSync(MCP_STUB, 0o755);
}

function setDetect(obj) {
  writeFileSync(DETECT_FILE, JSON.stringify(obj));
}

function removeDetectStub() {
  rmSync(MCP_STUB, { force: true });
}

function writeState(obj) {
  mkdirSync(join(PROJECT, '.claude', 'semble'), { recursive: true });
  writeFileSync(join(PROJECT, '.claude', 'semble', 'state.json'),
    typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

function clearState() {
  rmSync(join(PROJECT, '.claude', 'semble'), { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Usage and exit codes
// ═══════════════════════════════════════════════════════════════════════════
{
  const help = runStatus(['--help']);
  check('01-help-exit', help.status, 0, 'semble-status.sh --help must exit 0');
  check('01-help-body', help.stdout.includes('--section'), true, 'help must document --section');

  const badFlag = runStatus(['--nope']);
  check('02-bad-flag-exit', badFlag.status, 2, 'an unknown flag must exit exactly 2 (bad usage)');

  const badSection = runStatus(['--section', 'bogus']);
  check('03-bad-section-exit', badSection.status, 2, 'an unknown --section must exit exactly 2');

  const emptySection = runStatus(['--section']);
  check('04-empty-section-exit', emptySection.status, 2, '--section without a value must exit exactly 2');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Every sibling missing -> per-section {"error":...}, still exit 0
// ═══════════════════════════════════════════════════════════════════════════
{
  installClaudeJson('absent.json');
  clearState();
  const r = runStatus(['--json']);
  check('10-exit', r.status, 0, 'a fully missing sibling set must still exit 0');
  const j = safeParse(r.stdout);
  check('10-schema', j.schema, 1, 'schema must be exactly 1');
  check('10-platform', j.platform, process.platform === 'darwin' ? 'darwin' : 'linux',
    'platform must be the resolved uname family');
  check('10-projectRoot', j.projectRoot, PROJECT, 'projectRoot must be the injected SEMBLE_PROJECT_ROOT');
  check('10-pin', j.pin, { approved: '0.5.4', spec: 'semble[mcp]==0.5.4' }, 'pin must be the approved 0.5.4 spec');

  for (const sec of ['mcp', 'cache', 'guidance', 'agents', 'coverage']) {
    check(`11-${sec}-error-type`, typeof (j[sec] || {}).error, 'string',
      `${sec} must degrade to {"error":"..."} when its sibling script is missing`);
    check(`11-${sec}-error-keys`, Object.keys(j[sec] || {}), ['error'],
      `${sec} must contain nothing but the error field`);
  }

  check('12-state', j.state,
    { present: false, phase: 'absent', enabled: null, completed: [], last_updated: null },
    'a missing state file must read as phase=absent, present=false');
  check('13-verdict', j.verdict, 'partial',
    'no sibling can report -> mcp state unknown -> partial, never a false not_installed');
  check('13-nextStep', j.nextStep, 'Run /brewcode:semble-setup install', 'partial must point at install');

  // prereq under the narrowed PATH: uv/uvx/brew provably absent
  check('14-uv-present', j.prereq.uv.present, false, 'uv must be absent under the narrowed test PATH');
  check('14-uvx-present', j.prereq.uvx.present, false, 'uvx must be absent under the narrowed test PATH');
  check('14-brew-present', j.prereq.brew.present, false, 'brew must be absent under the narrowed test PATH');
  check('14-node-present', j.prereq.node.present, true, 'node must be present (symlinked into the stub bin)');
  check('14-claude-present', j.prereq.claude.present, true, 'the claude stub must be detected');
  check('14-claude-version', j.prereq.claude.version, '2.1.223', 'claude version must come from `claude --version`');
  check('15-semble-source', j.prereq.semble.source, 'uvx-ephemeral',
    'an empty `uv tool list` must report source=uvx-ephemeral');
  check('15-semble', j.prereq.semble,
    { present: false, version: '', source: 'uvx-ephemeral', resolvable: false },
    'no uv tool install and SEMBLE_NO_NETWORK=1 -> not present, not resolvable');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Per-fixture MCP state and verdict (detect stubbed - unit B owns detection)
// ═══════════════════════════════════════════════════════════════════════════
installDetectStub();

const FIXTURE_STATES = [
  ['absent.json', 'absent', 'not_installed', 'Run /brewcode:semble-setup install'],
  ['correct.json', 'correct', 'partial', 'Run /brewcode:semble-setup install'],
  ['stale.json', 'stale_args', 'partial', 'Run /brewcode:semble-setup install'],
  ['wrongscope.json', 'wrong_scope', 'partial', 'Run /brewcode:semble-setup install'],
  ['duplicate.json', 'duplicate', 'partial', 'Run /brewcode:semble-setup install'],
  ['upstream.json', 'upstream_unpinned', 'partial', 'Run /brewcode:semble-setup install'],
];

clearState();
for (const [file, state, verdict, nextStep] of FIXTURE_STATES) {
  installClaudeJson(file);
  const dump = dumpFromClaudeJson(file);
  setDetect({ schema: 1, state, dump, expected: {}, diff: [], connectivity: 'unknown' });
  const r = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  const j = safeParse(r.stdout);
  const tag = file.replace('.json', '');
  check(`20-${tag}-exit`, r.status, 0, `${file} must exit 0`);
  check(`20-${tag}-state`, j.mcp.state, state, `${file} must surface mcp.state=${state}`);
  check(`20-${tag}-verdict`, j.verdict, verdict, `${file} with no state file must be verdict=${verdict}`);
  check(`20-${tag}-nextStep`, j.nextStep, nextStep, `${file} next step`);
  check(`20-${tag}-tools`, j.mcp.tools,
    ['mcp__semble_code__search', 'mcp__semble_code__find_related'],
    'the two exact tool names, never a wildcard');
  check(`20-${tag}-scopes`, j.mcp.scopes,
    { user: dump.user, local: dump.local, project: dump.project },
    `${file} scopes must pass through the detect dump verbatim`);
  check(`20-${tag}-upstream`, j.mcp.upstream,
    { user: dump.upstreamUser, local: dump.upstreamLocal },
    `${file} upstream must pass through the detect dump verbatim`);
  check(`20-${tag}-connectivity`, j.mcp.connectivity, 'unknown',
    'connectivity is only ever what detect reports');
}

// malformed: exit is still 0, verdict is error, the bad file is named
{
  installClaudeJson('malformed.json');
  const cj = join(HOME_DIR, '.claude.json');
  setDetect({
    schema: 1, state: 'malformed',
    dump: { user: null, local: null, project: null, upstreamUser: null, upstreamLocal: null, malformed: [cj], projectEnabled: null },
    expected: {}, diff: [], connectivity: 'unknown',
  });
  const r = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  const j = safeParse(r.stdout);
  check('21-malformed-exit', r.status, 0, 'malformed.json must still exit 0 - a broken section may not hide the rest');
  check('21-malformed-state', j.mcp.state, 'malformed', 'mcp.state must be malformed');
  check('21-malformed-list', j.mcp.malformed, [cj], 'the exact unparseable file must be named');
  check('21-malformed-verdict', j.verdict, 'error', 'a malformed MCP config is verdict=error');
  check('21-malformed-nextStep', j.nextStep,
    `Fix by hand, then re-run /brewcode:semble-setup status: ${cj}`,
    'the next step must name the file to fix by hand');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Verdict x phase matrix
// ═══════════════════════════════════════════════════════════════════════════
{
  installClaudeJson('correct.json');
  const dump = dumpFromClaudeJson('correct.json');
  setDetect({ schema: 1, state: 'correct', dump, expected: {}, diff: [], connectivity: 'connected' });
  const stateFile = join(PROJECT, '.claude', 'semble', 'state.json');

  const cases = [
    ['ready', { phase: 'ready', enabled: true }, 'ready', 'none'],
    ['awaiting_reload', { phase: 'awaiting_reload', enabled: true }, 'reload_required',
      `Reload Claude Code (new session), then run: /brewcode:semble-setup resume\nCheckpoint: ${stateFile}`],
    ['verifying', { phase: 'verifying', enabled: true }, 'verifying', 'Run /brewcode:semble-setup resume'],
    ['disabled', { phase: 'disabled', enabled: false }, 'disabled', 'Run /brewcode:semble-setup enable'],
    ['ready-but-off', { phase: 'ready', enabled: false }, 'disabled', 'Run /brewcode:semble-setup enable'],
    ['error', { phase: 'error', enabled: true }, 'error', 'Run /brewcode:semble-setup install to repair'],
    ['prereq_ready', { phase: 'prereq_ready', enabled: true }, 'partial', 'Run /brewcode:semble-setup install'],
  ];

  for (const [tag, st, verdict, nextStep] of cases) {
    writeState({ schema: 1, profile: 'code', ...st, completed: ['prereq'], last_updated: '2026-08-02' });
    const r = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
    const j = safeParse(r.stdout);
    check(`30-${tag}-exit`, r.status, 0, `phase=${st.phase} must exit 0 without --strict`);
    check(`30-${tag}-verdict`, j.verdict, verdict, `mcp=correct + phase=${st.phase} + enabled=${st.enabled} -> ${verdict}`);
    check(`30-${tag}-nextStep`, j.nextStep, nextStep, `phase=${st.phase} next step`);
    check(`30-${tag}-state`, j.state,
      { present: true, phase: st.phase, enabled: st.enabled, completed: ['prereq'], last_updated: '2026-08-02' },
      `phase=${st.phase} state section`);
  }

  // absent MCP + prereq_ready -> not_installed
  setDetect({
    schema: 1, state: 'absent',
    dump: { user: null, local: null, project: null, upstreamUser: null, upstreamLocal: null, malformed: [], projectEnabled: null },
    expected: {}, diff: [], connectivity: 'unknown',
  });
  writeState({ schema: 1, phase: 'prereq_ready', enabled: true, completed: [], last_updated: '2026-08-02' });
  const notInstalled = safeParse(runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE }).stdout);
  check('31-not-installed', notInstalled.verdict, 'not_installed',
    'mcp=absent + phase=prereq_ready is not_installed, not partial');

  // a malformed state file is an error verdict, and status still never writes
  setDetect({ schema: 1, state: 'correct', dump, expected: {}, diff: [], connectivity: 'connected' });
  writeState('{,}');
  const badState = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  const bj = safeParse(badState.stdout);
  check('32-bad-state-exit', badState.status, 0, 'an unparseable state file must not crash status');
  check('32-bad-state-phase', bj.state.phase, 'error', 'an unparseable state file reads as phase=error');
  check('32-bad-state-verdict', bj.verdict, 'error', 'phase=error is verdict=error');
}

// ═══════════════════════════════════════════════════════════════════════════
// 4b. A v1-shaped project half downgrades ready -> partial
//
// mcp=correct + phase=ready is not enough: the whole migration path is
// unreachable if a repo still carrying the retired hooks, stale settings
// entries or a half-wired hook set reports `ready`/`none`.
// ═══════════════════════════════════════════════════════════════════════════
{
  const GUID_STUB = join(STAGE, 'semble-guidance.sh');
  const GUID_FILE = join(BIN, 'guidance.json');
  writeFileSync(GUID_STUB, `#!/usr/bin/env bash
set -euo pipefail
cat "\${SEMBLE_STUB_GUIDANCE:?}"
`);
  chmodSync(GUID_STUB, 0o755);

  installClaudeJson('correct.json');
  const dump = dumpFromClaudeJson('correct.json');
  setDetect({ schema: 1, state: 'correct', dump, expected: {}, diff: [], connectivity: 'connected' });
  writeState({ schema: 1, phase: 'ready', enabled: true, completed: ['prereq', 'mcp'], last_updated: '2026-08-02' });

  const healthy = {
    rule: { state: 'managed' }, ignore: { state: 'managed' }, claudeMd: { state: 'managed' },
    permissions: { wired: true },
    hooks: {
      settingsFile: join(PROJECT, '.claude', 'settings.json'),
      session: { file: 'present' }, prefetch: { file: 'present' }, stats: { file: 'present' },
      retired: [], wiredCount: 4, wantCount: 4, staleEntries: 0,
    },
  };
  const withHooks = (patch) => {
    const g = JSON.parse(JSON.stringify(healthy));
    Object.assign(g.hooks, patch);
    return g;
  };
  const guidRun = (payload) => {
    writeFileSync(GUID_FILE, JSON.stringify(payload));
    const env = { SEMBLE_STUB_DETECT: DETECT_FILE, SEMBLE_STUB_GUIDANCE: GUID_FILE };
    const j = safeParse(runStatus(['--json'], env).stdout);
    // `reason` lives only in the human report - the JSON envelope is fixed.
    const line = runStatus([], env).stdout.split('\n').find((l) => / (ready|partial|verifying|disabled|error|reload_required|not_installed) - /.test(l)) || '';
    j.__reason = line.slice(line.indexOf(' - ') + 3);
    return j;
  };

  const ok = guidRun(healthy);
  check('33-healthy-verdict', ok.verdict, 'ready',
    'a fully migrated project half must leave the ready verdict alone');
  check('33-healthy-nextStep', ok.nextStep, 'none', 'ready means there is nothing to run');

  // This is the exact platfrom shape that used to report ready/none.
  const v1 = guidRun(withHooks({
    retired: ['semble-reminder.mjs', 'semble-explore.mjs'],
    prefetch: { file: 'missing' }, wiredCount: 1, wantCount: 4, staleEntries: 5,
  }));
  check('34-v1-verdict', v1.verdict, 'partial',
    'a v1-shaped repo (retired hooks + stale entries + 1/4 wired) must never report ready');
  check('34-v1-nextStep', v1.nextStep, 'Run /brewcode:semble-setup install',
    'and it must name the command that performs the migration');
  check('34-v1-reason', v1.__reason,
    'retired hooks on disk: semble-reminder.mjs, semble-explore.mjs; 5 stale settings entries; hooks wired 1/4',
    'the reason must name all three defects, so the user knows what install will repair');

  const retiredOnly = guidRun(withHooks({ retired: ['semble-reminder.mjs'] }));
  check('35-retired-verdict', retiredOnly.verdict, 'partial',
    'a retired hook file still on disk is enough on its own');
  check('35-retired-reason', retiredOnly.__reason, 'retired hooks on disk: semble-reminder.mjs',
    'one retired file, one clause');

  const staleOnly = guidRun(withHooks({ staleEntries: 1 }));
  check('36-stale-verdict', staleOnly.verdict, 'partial',
    'a settings entry pointing at an older plugin version is enough on its own');
  check('36-stale-reason', staleOnly.__reason, '1 stale settings entry',
    'the singular clause is singular');

  const halfWired = guidRun(withHooks({ wiredCount: 3, wantCount: 4 }));
  check('37-wiring-verdict', halfWired.verdict, 'partial',
    'a missing sibling hook registration is enough on its own');
  check('37-wiring-reason', halfWired.__reason, 'hooks wired 3/4', 'the reason carries the counts');

  // An absent count is not a defect: a report that never collected the wiring
  // numbers must not be read as a half-wired repo.
  const noCounts = guidRun(withHooks({ wiredCount: 0, wantCount: 0 }));
  check('38-nocounts-verdict', noCounts.verdict, 'ready',
    'wantCount=0 means the counts were not reported - never downgrade on a missing measurement');

  // The downgrade only ever applies to `ready`; it must not overwrite a
  // stronger verdict that another signal already produced.
  writeState({ schema: 1, phase: 'verifying', enabled: true, completed: [], last_updated: '2026-08-02' });
  const stillVerifying = guidRun(withHooks({ retired: ['semble-reminder.mjs'], staleEntries: 2 }));
  check('39-precedence-verdict', stillVerifying.verdict, 'verifying',
    'a non-ready verdict outranks the guidance downgrade');
  check('39-precedence-nextStep', stillVerifying.nextStep, 'Run /brewcode:semble-setup resume',
    'and keeps its own next step');

  rmSync(GUID_STUB, { force: true });
  writeState({ schema: 1, phase: 'ready', enabled: true, completed: ['prereq', 'mcp'], last_updated: '2026-08-02' });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. --strict
// ═══════════════════════════════════════════════════════════════════════════
{
  installClaudeJson('correct.json');
  const dump = dumpFromClaudeJson('correct.json');
  setDetect({ schema: 1, state: 'correct', dump, expected: {}, diff: [], connectivity: 'connected' });

  writeState({ schema: 1, phase: 'ready', enabled: true, completed: ['prereq', 'mcp'], last_updated: '2026-08-02' });
  const ready = runStatus(['--json', '--strict'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('40-strict-ready-exit', ready.status, 0, '--strict must exit 0 when verdict === ready');
  check('40-strict-ready-verdict', safeParse(ready.stdout).verdict, 'ready', 'the ready verdict itself');

  writeState({ schema: 1, phase: 'verifying', enabled: true, completed: [], last_updated: '2026-08-02' });
  const notReady = runStatus(['--json', '--strict'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('41-strict-notready-exit', notReady.status, 1, '--strict must exit 1 when verdict !== ready');
  check('41-strict-notready-body', safeParse(notReady.stdout).verdict, 'verifying',
    '--strict must still print the full report before failing');
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Sibling that exists but fails / emits garbage
// ═══════════════════════════════════════════════════════════════════════════
{
  clearState();
  installClaudeJson('correct.json');

  writeFileSync(MCP_STUB, '#!/usr/bin/env bash\nexit 7\n');
  chmodSync(MCP_STUB, 0o755);
  const failing = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  const fj = safeParse(failing.stdout);
  check('50-failing-exit', failing.status, 0, 'a sibling exiting non-zero must not fail the whole status run');
  check('50-failing-error', fj.mcp.error, 'semble-mcp.sh detect --json exited 7',
    'the failure must be reported verbatim as that section error');
  check('50-failing-verdict', fj.verdict, 'partial', 'an unreadable mcp section degrades to partial');

  writeFileSync(MCP_STUB, '#!/usr/bin/env bash\necho "not json at all"\n');
  chmodSync(MCP_STUB, 0o755);
  const garbage = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  const gj = safeParse(garbage.stdout);
  check('51-garbage-exit', garbage.status, 0, 'a sibling emitting non-JSON must not fail the run');
  check('51-garbage-error-prefix',
    String(gj.mcp.error).startsWith('semble-mcp.sh detect emitted invalid JSON: '), true,
    'invalid sibling JSON must be labelled as such');

  writeFileSync(MCP_STUB, '#!/usr/bin/env bash\necho "[1,2,3]"\n');
  chmodSync(MCP_STUB, 0o755);
  const arr = runStatus(['--json'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('52-array-error', safeParse(arr.stdout).mcp.error,
    'semble-mcp.sh detect did not emit a JSON object',
    'a JSON array is not an acceptable section payload');

  installDetectStub();
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. --section filtering and permissions read-through
// ═══════════════════════════════════════════════════════════════════════════
{
  clearState();
  installClaudeJson('correct.json');
  const dump = dumpFromClaudeJson('correct.json');
  setDetect({ schema: 1, state: 'correct', dump, expected: {}, diff: [], connectivity: 'connected' });

  const prereqOnly = runStatus(['--json', '--section', 'prereq'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('60-section-keys', Object.keys(safeParse(prereqOnly.stdout)),
    ['schema', 'generatedAt', 'platform', 'projectRoot', 'pin', 'prereq', 'verdict', 'nextStep'],
    '--section prereq must emit exactly the envelope + prereq + verdict + nextStep');

  const eqOnly = runStatus(['--json', '--section=state'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('61-section-eq-keys', Object.keys(safeParse(eqOnly.stdout)),
    ['schema', 'generatedAt', 'platform', 'projectRoot', 'pin', 'state', 'verdict', 'nextStep'],
    '--section=state must be accepted in the = form');

  // project + user permissions are read straight from the settings files
  mkdirSync(join(PROJECT, '.claude'), { recursive: true });
  writeFileSync(join(PROJECT, '.claude', 'settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(git status:*)', 'mcp__semble_code__search', 'mcp__other__x'] },
  }, null, 2));
  writeFileSync(join(HOME_DIR, '.claude', 'settings.json'), JSON.stringify({
    permissions: { allow: ['mcp__semble_code__find_related'] },
  }, null, 2));
  const perms = runStatus(['--json', '--section', 'mcp'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('62-permissions', safeParse(perms.stdout).mcp.permissions,
    { project: ['mcp__semble_code__search'], user: ['mcp__semble_code__find_related'] },
    'only the two semble tool entries are reported, foreign entries are ignored');

  writeFileSync(join(PROJECT, '.claude', 'settings.json'), '{ broken');
  const brokenPerms = runStatus(['--json', '--section', 'mcp'], { SEMBLE_STUB_DETECT: DETECT_FILE });
  check('63-permissions-broken', safeParse(brokenPerms.stdout).mcp.permissions,
    { project: [], user: ['mcp__semble_code__find_related'] },
    'an unparseable project settings.json degrades to an empty allow list, it never throws');
  rmSync(join(PROJECT, '.claude', 'settings.json'), { force: true });
  rmSync(join(HOME_DIR, '.claude', 'settings.json'), { force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Human (non --json) rendering
// ═══════════════════════════════════════════════════════════════════════════
{
  installClaudeJson('correct.json');
  const dump = dumpFromClaudeJson('correct.json');
  setDetect({ schema: 1, state: 'correct', dump, expected: {}, diff: [], connectivity: 'connected' });
  writeState({ schema: 1, phase: 'ready', enabled: true, completed: ['prereq', 'mcp'], last_updated: '2026-08-02' });

  const r = runStatus([], { SEMBLE_STUB_DETECT: DETECT_FILE });
  const lines = r.stdout.split('\n');
  check('70-human-exit', r.status, 0, 'the human form exits 0 like the JSON form');
  check('70-human-title', lines[0], '# Semble status', 'the report starts with the mode heading');
  check('70-human-mcp', lines.some((l) => l === 'mcp:      correct @ user  [connected]'), true,
    'the mcp line follows the DESIGN 13 Before layout');
  check('70-human-state', lines.some((l) => l === 'state:    phase=ready enabled=true completed=[prereq,mcp]'), true,
    'the state line follows the DESIGN 13 Before layout');
  check('70-human-verdict', lines.some((l) => l === '✅ ready - pinned server registered at user scope and verified'), true,
    'the verdict line carries the status symbol and one clause of why');
  check('70-human-next', lines.some((l) => l === 'Next Step: none'), true, 'ready has no next step');
  check('70-human-no-json', r.stdout.trim().startsWith('{'), false, 'the human form must not emit JSON');
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. semble-install.sh
// ═══════════════════════════════════════════════════════════════════════════
writeFileSync(CLAUDE_LOG, '');
writeFileSync(BREW_LOG, '');
{
  const help = runInstall(['--help']);
  check('80-help-exit', help.status, 0, 'semble-install.sh --help must exit 0');

  const noSub = runInstall(['--json']);
  check('81-no-subcommand', noSub.status, 2, 'a missing subcommand is bad usage -> exit 2');

  const bogus = runInstall(['bogus']);
  check('82-bad-subcommand', bogus.status, 2, 'an unknown subcommand is bad usage -> exit 2');

  const chk = runInstall(['check', '--json']);
  const cj = safeParse(chk.stdout);
  check('83-check-exit', chk.status, 3, 'check must exit 3 when uv/uvx are missing');
  check('83-check-status', cj.status, 'precondition', 'the status field must be precondition');
  check('83-check-schema', cj.schema, 1, 'install schema is exactly 1');
  check('83-check-uvx', cj.uvx, { present: false, version: '' }, 'uvx must be reported absent');
  check('83-check-spec', cj.semble.spec, 'semble[mcp]==0.5.4', 'the pinned spec is never floating');
  check('83-check-pin', cj.semble.pin, '0.5.4', 'the approved pin');
  check('83-check-commands', cj.commands, [], 'check runs nothing, so it records no commands');
  check('83-check-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'check must not invoke brew');

  const uvNoYes = runInstall(['uv', '--json']);
  const uj = safeParse(uvNoYes.stdout);
  check('84-uv-noyes-exit', uvNoYes.status, 4, '`uv` without --yes must exit exactly 4');
  check('84-uv-noyes-status', uj.status, 'needs_confirmation', 'status must be needs_confirmation');
  check('84-uv-noyes-commands', uj.commands, ['brew install uv'], 'the exact command it would have run');
  check('84-uv-noyes-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'nothing may be installed without --yes');
  check('84-uv-noyes-claudelog', readFileSync(CLAUDE_LOG, 'utf8'), '', 'install never touches the claude CLI');

  const uvNoBrew = runInstall(['uv', '--yes', '--json']);
  const ubj = safeParse(uvNoBrew.stdout);
  check('85-uv-nobrew-exit', uvNoBrew.status, 3, 'no brew -> exit 3, the manual route is printed not executed');
  check('85-uv-nobrew-status', ubj.status, 'precondition', 'status must be precondition');
  check('85-uv-nobrew-note',
    String(ubj.note).includes('curl -LsSf https://astral.sh/uv/install.sh | sh'), true,
    'the manual installer command must be printed verbatim');
  check('85-uv-nobrew-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'brew was never called');

  const semNoUvx = runInstall(['semble', '--json']);
  const sj = safeParse(semNoUvx.stdout);
  check('86-semble-nouvx-exit', semNoUvx.status, 3, '`semble` without uvx must exit 3');
  check('86-semble-nouvx-commands', sj.commands,
    ["uvx --from 'semble[mcp]==0.5.4' semble --version"],
    'the probe command is single-quoted (zsh globs the brackets) and uses --version (dispatch-set argv on the 0.5.4 pin), never bare semble');
  check('86-semble-resolvable', sj.semble.resolvable, false, 'nothing was resolved');
  check('86-semble-toolInstalled', sj.semble.toolInstalled, false, 'default mode is uvx-ephemeral');

  const semTool = runInstall(['semble', '--tool', '--json']);
  const stj = safeParse(semTool.stdout);
  check('87-tool-commands', stj.commands,
    ["uvx --from 'semble[mcp]==0.5.4' semble --version", "uv tool install 'semble[mcp]==0.5.4'"],
    '--tool adds exactly one extra command, still pinned and quoted');

  const all = runInstall(['all', '--json']);
  const aj = safeParse(all.stdout);
  check('88-all-exit', all.status, 4, '`all` stops at the first confirmation gate -> exit 4');
  check('88-all-mode', aj.mode, 'all', 'the mode is echoed back');
  check('88-all-status', aj.status, 'needs_confirmation', 'needs_confirmation outranks precondition');
  check('88-all-brewlog', readFileSync(BREW_LOG, 'utf8'), '', '`all` installed nothing');

  // With a brew stub on PATH: dry-run must print the command and run nothing.
  const brewEnv = { PATH: `${BIN2}:${BIN}:/usr/bin:/bin` };
  const dry = runInstall(['uv', '--yes', '--json'], { ...brewEnv, SEMBLE_DRY_RUN: '1' });
  const dj = safeParse(dry.stdout);
  check('89-dry-exit', dry.status, 0, 'SEMBLE_DRY_RUN=1 changes nothing and exits 0');
  check('89-dry-status', dj.status, 'ok', 'a dry run reports ok');
  check('89-dry-brew-present', dj.brew.present, true, 'the brew stub is detected');
  check('89-dry-commands', dj.commands, ['brew install uv'], 'the command it would have run');
  check('89-dry-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'a dry run must not execute brew');

  const noNet = runInstall(['uv', '--yes', '--json'], brewEnv);
  const nj = safeParse(noNet.stdout);
  check('90-nonetwork-exit', noNet.status, 3, 'SEMBLE_NO_NETWORK=1 must not run brew -> precondition');
  check('90-nonetwork-status', nj.status, 'precondition', 'status must be precondition');
  check('90-nonetwork-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'no network means brew is never called');

  const human = runInstall(['check']);
  check('91-human-exit', human.status, 3, 'the human form keeps the same exit code');
  check('91-human-head', human.stdout.split('\n')[0], '# Semble install (check)', 'human heading');
  check('91-human-json', human.stdout.trim().startsWith('{'), false, 'the human form must not emit JSON');
}

// ═══════════════════════════════════════════════════════════════════════════
// 9b. the coreutils step and the timeout backend report
// ═══════════════════════════════════════════════════════════════════════════
// PATH decides nothing here: every Linux has `timeout` in /usr/bin and stock
// macOS has neither binary, so the backend is pinned with SEMBLE_TIMEOUT_BIN.
{
  const NOTMO = { SEMBLE_TIMEOUT_BIN: 'none' };
  const HASTMO = { SEMBLE_TIMEOUT_BIN: TIMEOUT_STUB };
  const brewEnv = { PATH: `${BIN2}:${BIN}:/usr/bin:/bin` };
  const brewFailEnv = { PATH: `${BIN3}:${BIN}:/usr/bin:/bin` };
  writeFileSync(BREW_LOG, '');
  writeFileSync(BREW_FAIL_LOG, '');

  const chkNo = safeParse(runInstall(['check', '--json'], NOTMO).stdout);
  check('92-check-timeout-none', chkNo.timeout,
    { backend: 'none', path: '', bounded: true,
      coreutils: { status: 'skipped', reason: 'the coreutils step does not run in mode check', changed: false } },
    'check reports the backend, and bounded stays true because the bash watchdog takes over');

  const chkYes = safeParse(runInstall(['check', '--json'], HASTMO).stdout);
  check('92-check-timeout-binary', chkYes.timeout,
    { backend: 'timeout', path: TIMEOUT_STUB, bounded: true,
      coreutils: { status: 'present', reason: 'timeout already backs sc_timeout', changed: false } },
    'a real binary is named with its absolute path');

  const chkHuman = runInstall(['check'], NOTMO);
  check('92-check-timeout-human',
    chkHuman.stdout.split('\n').filter((l) => l.startsWith('timeout:')),
    ['timeout: none (bash watchdog) | bounded yes | coreutils skipped - '
      + 'the coreutils step does not run in mode check'],
    'the human summary carries exactly one timeout line');

  const cuNoYes = runInstall(['coreutils', '--json'], NOTMO);
  const cuj = safeParse(cuNoYes.stdout);
  check('93-coreutils-noyes-exit', cuNoYes.status, 4, '`coreutils` without --yes must exit exactly 4');
  check('93-coreutils-noyes-status', cuj.status, 'needs_confirmation', 'status must be needs_confirmation');
  check('93-coreutils-noyes-commands', cuj.commands, ['brew install coreutils'],
    'the exact command it would have run');
  check('93-coreutils-noyes-step', cuj.timeout.coreutils,
    { status: 'needs_confirmation', reason: 'brew install coreutils needs --yes', changed: false },
    'the step reports its own outcome');
  check('93-coreutils-noyes-brewlog', readFileSync(BREW_LOG, 'utf8'), '',
    'nothing may be installed without --yes');

  const cuPresent = runInstall(['coreutils', '--yes', '--json'], { ...brewEnv, ...HASTMO });
  const cupj = safeParse(cuPresent.stdout);
  check('94a-coreutils-present-exit', cuPresent.status, 0, 'an existing timeout binary short-circuits the step');
  check('94a-coreutils-present-commands', cupj.commands, [],
    'a skipped step records no command at all');
  check('94a-coreutils-present-brewlog', readFileSync(BREW_LOG, 'utf8'), '',
    'brew is never consulted when timeout is already there');

  const cuDry = runInstall(['coreutils', '--yes', '--json'], { ...brewEnv, ...NOTMO, SEMBLE_DRY_RUN: '1' });
  const cudj = safeParse(cuDry.stdout);
  check('94b-coreutils-dry-exit', cuDry.status, 0, 'SEMBLE_DRY_RUN=1 changes nothing and exits 0');
  check('94b-coreutils-dry-step', cudj.timeout.coreutils,
    { status: 'skipped', reason: 'SEMBLE_DRY_RUN=1', changed: false }, 'the dry run is reported as a skip');
  check('94b-coreutils-dry-commands', cudj.commands, ['brew install coreutils'],
    'the command it would have run is still printed');
  check('94b-coreutils-dry-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'a dry run must not execute brew');

  // SEMBLE_NO_NETWORK=1 comes from ENV: the uv step calls that a precondition,
  // the coreutils step may not - a missing bound is degraded, never fatal.
  const cuNoNet = runInstall(['coreutils', '--yes', '--json'], { ...brewEnv, ...NOTMO });
  const cunj = safeParse(cuNoNet.stdout);
  check('94c-coreutils-nonet-exit', cuNoNet.status, 0, 'no network must not turn coreutils into exit 3');
  check('94c-coreutils-nonet-status', cunj.status, 'ok', 'the overall status stays ok');
  check('94c-coreutils-nonet-step', cunj.timeout.coreutils.status, 'skipped', 'the step itself reports skipped');
  check('94c-coreutils-nonet-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'no network means brew is never called');

  const cuNoBrew = runInstall(['coreutils', '--yes', '--json'], NOTMO);
  const cubj = safeParse(cuNoBrew.stdout);
  check('94d-coreutils-nobrew-exit', cuNoBrew.status, 0, 'a missing brew must not raise precondition here');
  check('94d-coreutils-nobrew-status', cubj.status, 'ok', 'the overall status stays ok');
  check('94d-coreutils-nobrew-step', cubj.timeout.coreutils,
    { status: 'skipped',
      reason: 'brew is not installed - sc_timeout keeps using its bash watchdog',
      changed: false },
    'the reason names the fallback the user is left with');

  const cuFail = runInstall(['coreutils', '--yes', '--json'], { ...brewFailEnv, ...NOTMO, SEMBLE_NO_NETWORK: '' });
  const cufj = safeParse(cuFail.stdout);
  check('94e-coreutils-fail-exit', cuFail.status, 0, 'a failed brew install coreutils still exits 0');
  check('94e-coreutils-fail-status', cufj.status, 'ok', 'it never escalates the overall status');
  check('94e-coreutils-fail-step', cufj.timeout.coreutils,
    { status: 'failed',
      reason: 'brew install coreutils failed - sc_timeout keeps using its bash watchdog',
      changed: false },
    'the failure is reported as a warning-level step outcome');
  check('94e-coreutils-fail-brewlog', readFileSync(BREW_FAIL_LOG, 'utf8'), 'brew install coreutils\n',
    'brew was called exactly once, with exactly that argv');

  writeFileSync(BREW_LOG, '');
  const allDry = runInstall(['all', '--yes', '--json'], { ...brewEnv, ...NOTMO, SEMBLE_DRY_RUN: '1' });
  const adj = safeParse(allDry.stdout);
  // uv/uvx stay absent under this PATH and a dry run installs nothing, so the
  // pin cannot resolve: exit 3 is the uv/uvx precondition, unchanged by the new
  // step - the note must not mention coreutils at all.
  check('94f-all-dry-exit', allDry.status, 3, '`all` keeps the pre-existing uv/uvx precondition');
  check('94f-all-dry-note', adj.note, 'uv/uvx not on PATH; uvx is not on PATH - install uv first',
    'the coreutils step adds nothing to the note when it is only skipped');
  check('94f-all-dry-order', adj.commands,
    ['brew install uv', 'brew install coreutils', "uvx --from 'semble[mcp]==0.5.4' semble --version"],
    'all runs check -> uv -> coreutils -> semble, in that order');
  check('94f-all-dry-step', adj.timeout.coreutils.status, 'skipped', 'the coreutils step is reported in `all`');
  check('94f-all-dry-brewlog', readFileSync(BREW_LOG, 'utf8'), '', 'a dry `all` installs nothing');

  const allSoft = runInstall(['all', '--json'], { ...brewEnv, ...NOTMO });
  const asj = safeParse(allSoft.stdout);
  check('94g-all-soft-status', asj.status, 'needs_confirmation',
    'the uv gate still owns the status; coreutils never adds one of its own');
  check('94g-all-soft-note', String(asj.note).includes('brew install coreutils needs --yes (optional)'), true,
    'inside `all` the coreutils confirmation is a note, not an escalation');
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Fixture tree integrity
// ═══════════════════════════════════════════════════════════════════════════
{
  const repoA = [
    'src/auth_service.py', 'src/session.ts', 'web/LoginPanel.tsx', 'build.sh',
    'src/TokenStore.java', 'src/Router.kt', 'build.gradle.kts', 'settings.gradle',
    'conf/deploy.groovy', 'web/theme.css', 'conf/service.yaml', 'pyproject.toml',
    'conf/application.properties', 'web/index.html', 'package.json',
  ];
  check('95-repo-a-count', repoA.filter((f) => existsSync(join(FIX, 'repo-a', f))).length, 15,
    'repo-a must carry all 15 classification fixtures');
  const tooSmall = repoA.filter((f) => lstatSync(join(FIX, 'repo-a', f)).size < 128);
  check('95-repo-a-size', tooSmall, [], 'every repo-a fixture must clear the 128 byte floor semble applies');

  const repoB = ['lib/queue.py', 'lib/metrics.ts', 'config.yml', 'run.sh', 'notes.md'];
  check('96-repo-b-count', repoB.filter((f) => existsSync(join(FIX, 'repo-b', f))).length, 5,
    'repo-b must carry its 5 files');

  const cjFiles = ['absent', 'correct', 'stale', 'wrongscope', 'duplicate', 'upstream', 'malformed'];
  check('97-claude-json-count', cjFiles.filter((f) => existsSync(join(FIX, 'claude-json', `${f}.json`))).length, 7,
    'all 7 detection-state fixtures must exist');
  const parsable = cjFiles.filter((f) => {
    try { JSON.parse(readFileSync(join(FIX, 'claude-json', `${f}.json`), 'utf8')); return true; } catch { return false; }
  });
  check('97-claude-json-parse', parsable,
    ['absent', 'correct', 'stale', 'wrongscope', 'duplicate', 'upstream'],
    'exactly one fixture (malformed.json) must be unparseable');

  const setFiles = ['empty', 'foreign', 'stale-path', 'malformed'];
  check('98-settings-count', setFiles.filter((f) => existsSync(join(FIX, 'settings', `${f}.json`))).length, 4,
    'all 4 settings fixtures must exist');

  const correctCfg = JSON.parse(fixtureText(join('claude-json', 'correct.json'))).mcpServers.semble_code;
  check('99-correct-args', correctCfg.args,
    ['--from', 'semble[mcp]==0.5.4', 'semble', '--content', 'code', 'docs', 'config'],
    'the correct fixture must carry the exact frozen argv');
  check('99-correct-env', correctCfg.env, { SEMBLE_CACHE_LOCATION: CACHE_CODE },
    'placeholder substitution must yield an absolute cache root');
  check('99-correct-alwaysload', correctCfg.alwaysLoad, true,
    'the correct fixture must carry alwaysLoad:true — without it the tools stay deferred');
}

// ── cleanup ─────────────────────────────────────────────────────────────────
try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('\n=== semble suite-status (unit A) REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed} | SKIP: ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
