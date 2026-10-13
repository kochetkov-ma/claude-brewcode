#!/usr/bin/env node
// SessionStart hooks: plan link, plans dir, root, compact re-anchor, fail-open stdin, log level; no network.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync,
  readlinkSync, readdirSync, symlinkSync, utimesSync, realpathSync, accessSync, constants, rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');   // tests/
const HOOKS = join(HERE, '..');                            // brewcode/hooks/
const HOOK = join(HOOKS, 'session-start.mjs');
const HOOK_COMPACT = join(HOOKS, 'compact-recall.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'bc-hooks-')));
const REAL_HOME = homedir();

// Importing the hook must not consume stdin; the module guards main() on argv[1].
const { linkLatestPlan } = await import(HOOK);
const { projectRoot, resolvePlansDir } = await import(join(HOOKS, 'lib', 'utils.mjs'));

let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

// ── fixture ────────────────────────────────────────────────────────────────
/** <BASE>/<name>/{home,proj,cfg}; HOME -> sandbox, CLAUDE_CONFIG_DIR unset until a case sets `cfg`. */
function fixture(name) {
  const dir = join(BASE, name);
  const home = join(dir, 'home');
  const root = join(dir, 'proj');
  mkdirSync(join(home, '.claude', 'plans'), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });
  process.env.HOME = home;
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_CONFIG_DIR;
  return {
    dir,
    home,
    root,
    cfg: join(dir, 'cfg'),
    stateFile: join(root, '.claude', 'tasks', 'cfg', 'brewcode.state.json'),
    plansDir: join(home, '.claude', 'plans'),
    latestLink: join(root, '.claude', 'plans', 'LATEST.md'),
    logFile: join(root, '.claude', 'logs', 'brewcode.log'),
  };
}

/** Plan file with an explicit age in seconds (the hook's freshness gate is 60 s). */
function plan(dir, name, body, ageSec) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, body);
  const t = new Date(Date.now() - ageSec * 1000);
  utimesSync(p, t, t);
  return p;
}

function write(p, body) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
}

/** Every probe returns a VALUE: a throw becomes `<tag> (<code>)`, never a crash mid-suite. */
function safe(fn, tag) {
  try {
    return fn();
  } catch (e) {
    return `${tag} (${e.code || e.message})`;
  }
}

const pathType = p => safe(() => {
  const st = lstatSync(p);
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isDirectory()) return 'directory';
  if (st.isFile()) return 'file';
  return 'other';
}, 'absent');

const readLink = p => safe(() => readlinkSync(p), 'NO-SYMLINK');
const readText = p => safe(() => readFileSync(p, 'utf8'), 'UNREADABLE');
const listDir = p => safe(() => readdirSync(p), 'NOT-A-DIRECTORY');
const linkPlan = (root, sessionId) => safe(() => linkLatestPlan(root, sessionId), 'THREW');

function countLines(file, needle) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  return text.split('\n').filter(l => l.includes(needle)).length;
}

/** JSONL transcript fixture; `<BASE>/<name>/<tag>.jsonl`. */
function transcript(f, tag, lines) {
  return write(join(f.dir, `${tag}.jsonl`), lines.join('\n') + '\n');
}

/** The project-local plan link exactly as session-start.mjs creates it. */
function linkLatest(f, target) {
  mkdirSync(dirname(f.latestLink), { recursive: true });
  symlinkSync(target, f.latestLink);
  return f.latestLink;
}

/** compact-recall as a process: status, stdout line count and the injected context. */
function runCompact(f, transcriptPath, sessionId, env = {}) {
  const res = spawnSync(process.execPath, [HOOK_COMPACT], {
    input: JSON.stringify({ session_id: sessionId, cwd: f.root, source: 'compact', transcript_path: transcriptPath }),
    encoding: 'utf8',
    env: { ...process.env, HOME: f.home, CLAUDE_PROJECT_DIR: f.root, ...env },
  });
  return {
    status: res.status,
    lines: res.stdout.trim().split('\n').length,
    ctx: safe(() => JSON.parse(res.stdout).hookSpecificOutput.additionalContext, 'NO-CONTEXT'),
  };
}

/** session-start as a process: exit status plus the parsed stdout object. */
function runStart(f, input, env = {}) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: f.home, CLAUDE_PROJECT_DIR: f.root, CLAUDE_PLUGIN_ROOT: '', ...env },
  });
  return { status: res.status, lines: res.stdout.trim().split('\n').length, out: safe(() => JSON.parse(res.stdout), 'NO-JSON') };
}

const RELEASES = 'https://github.com/kochetkov-ma/claude-brewcode/releases/latest';
const INTENT = [
  '[INTENT] Re-read the user ORIGINAL task and intent from the compact summary and keep executing THAT.',
  'Do not continue from the most recently remembered fragment, and do not re-scope the work.',
].join('\n');
const FOLLOW_LATEST = 'It is the last plan linked in this project: if it covers the task in the compact summary, follow it, do not re-derive it; if it does not, ignore it.';
const TASKS = [
  '[TASKS] Then call TaskList: a task graph created before the compact ALREADY EXISTS in this session.',
  'Re-read it, do NOT create a new graph. The built-in reminder lags several turns and may show empty, so TaskList is the authority. Then resume the work.',
].join('\n');

// ═══ A. BC-H02 — nothing at LATEST.md is destroyed unless this hook made it ═══
{
  // The exact D3 repro: a hand-written regular file at the convention path.
  const f = fixture('a1-regular-file');
  plan(f.plansDir, 'planA.md', 'PLAN A CONTENT\n', 0);
  write(f.latestLink, 'MY PRECIOUS HAND WRITTEN NOTES\n');

  const linked = linkPlan(f.root, 'deadbeef-1111');

  check('A1.returnsNull', linked, null, 'a regular file at LATEST.md blocks linking, hook reports nothing linked');
  check('A1.contentIntact', readText(f.latestLink), 'MY PRECIOUS HAND WRITTEN NOTES\n',
    'the user-authored file keeps its exact bytes');
  check('A1.stillRegularFile', pathType(f.latestLink), 'file', 'the path is still a regular file, not a symlink');
  check('A1.warnLoggedOnce', countLines(f.logFile, 'Preserved'), 1,
    'exactly one WARN line reports the preserved conflict instead of logging success');
  check('A1.noSuccessLogged', countLines(f.logFile, 'Linked:'), 0, 'no success line is written for a blocked link');
}
{
  // Foreign symlink: right path, wrong owner (points outside the plans dir).
  const f = fixture('a2-foreign-symlink');
  plan(f.plansDir, 'planA.md', 'PLAN A CONTENT\n', 0);
  const foreign = write(join(f.dir, 'elsewhere', 'notes.md'), 'FOREIGN TARGET\n');
  mkdirSync(dirname(f.latestLink), { recursive: true });
  symlinkSync(foreign, f.latestLink);

  const linked = linkPlan(f.root, 'deadbeef-2222');

  check('A2.returnsNull', linked, null, 'a symlink pointing outside the plans dir is not claimed');
  check('A2.targetUnchanged', readLink(f.latestLink), foreign, 'the foreign symlink still points at its original target');
  check('A2.warnLoggedOnce', countLines(f.logFile, 'foreign symlink target'), 1, 'the foreign-target conflict is logged once');
}
{
  // Directory at the path: previously an unhandled EEXIST, now an explicit conflict.
  const f = fixture('a3-directory');
  plan(f.plansDir, 'planA.md', 'PLAN A CONTENT\n', 0);
  write(join(f.latestLink, 'keep.md'), 'KEEP ME\n');

  const linked = linkPlan(f.root, 'deadbeef-3333');

  check('A3.returnsNull', linked, null, 'a directory at LATEST.md is a conflict, not a link target');
  check('A3.stillDirectory', pathType(f.latestLink), 'directory', 'the directory survives');
  check('A3.contentsIntact', listDir(f.latestLink), ['keep.md'], 'the directory keeps exactly its one file');
}
{
  // The owned case must still work: a symlink into the plans dir is replaced.
  const f = fixture('a4-owned-symlink');
  const oldPlan = plan(f.plansDir, 'planOld.md', 'OLD\n', 3600);
  const newPlan = plan(f.plansDir, 'planNew.md', 'NEW\n', 0);
  mkdirSync(dirname(f.latestLink), { recursive: true });
  symlinkSync(oldPlan, f.latestLink);

  const linked = linkPlan(f.root, 'deadbeef-4444');

  check('A4.returnsNewPlan', linked, 'planNew.md', 'the freshest plan name is returned');
  check('A4.repointed', readLink(f.latestLink), newPlan, 'the brewcode-owned symlink is repointed at the fresh plan');
  check('A4.noWarn', countLines(f.logFile, 'Preserved'), 0, 'replacing an owned symlink logs no conflict');
}
{
  const f = fixture('a5-free-path');
  const newPlan = plan(f.plansDir, 'planNew.md', 'NEW\n', 0);

  const linked = linkPlan(f.root, 'deadbeef-5555');

  check('A5.returnsNewPlan', linked, 'planNew.md', 'an empty path is linked to the fresh plan');
  check('A5.isSymlink', pathType(f.latestLink), 'symlink', 'the created path is a symlink');
  check('A5.target', readLink(f.latestLink), newPlan, 'the symlink points at the fresh plan file');
}
{
  const f = fixture('a6-stale-plan');
  plan(f.plansDir, 'planOld.md', 'OLD\n', 3600);
  write(f.latestLink, 'SURVIVE ME\n');

  const linked = linkPlan(f.root, 'deadbeef-6666');

  check('A6.returnsNull', linked, null, 'a plan older than 60 s does not trigger linking');
  check('A6.contentIntact', readText(f.latestLink), 'SURVIVE ME\n', 'the 60 s gate keeps the existing file untouched');
}
{
  const f = fixture('a7-no-plans-dir');
  const linked = linkPlan(join(f.dir, 'nonexistent-root'), 'deadbeef-7777');
  check('A7.returnsNull', linked, null, 'a missing plans directory yields null instead of throwing');
}
{
  const f = fixture('a8-only-latest-in-plans-dir');
  // plansDirectory pointing at the project link dir must not treat LATEST.md as a plan.
  write(join(f.root, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: './.claude/plans' }));
  write(f.latestLink, 'USER FILE\n');

  const linked = linkPlan(f.root, 'deadbeef-8888');

  check('A8.returnsNull', linked, null, 'LATEST.md is never a link candidate for itself');
  check('A8.contentIntact', readText(f.latestLink), 'USER FILE\n', 'the user file at LATEST.md is untouched');
}
{
  const f = fixture('a9-link-recorded-under-another-config-dir');
  const oldPlan = plan(join(f.dir, 'cfg-other', 'plans'), 'planOld.md', 'OLD\n', 3600);
  linkLatest(f, oldPlan);
  write(f.stateFile, JSON.stringify({ _planLink: oldPlan }));
  process.env.CLAUDE_CONFIG_DIR = f.cfg;
  const newPlan = plan(join(f.cfg, 'plans'), 'planNew.md', 'NEW\n', 0);

  const linked = linkPlan(f.root, 'deadbeef-9999');

  check('A9.relinkedAcrossConfigDirs', [linked, readLink(f.latestLink), JSON.parse(readText(f.stateFile))],
    ['planNew.md', newPlan, { _planLink: newPlan }],
    'GIVEN a link this hook recorded under another config dir WHEN a fresh plan appears under CLAUDE_CONFIG_DIR THEN the link is repointed and the new target recorded');
}

// ═══ B. plans dir: CLAUDE_CONFIG_DIR + plansDirectory ═══
{
  const f = fixture('b1-default');
  check('B1.default', resolvePlansDir(f.root), join(f.home, '.claude', 'plans'),
    'GIVEN CLAUDE_CONFIG_DIR unset and no setting WHEN the plans dir is resolved THEN it is ~/.claude/plans');
}
{
  const f = fixture('b1c-config-dir');
  process.env.CLAUDE_CONFIG_DIR = f.cfg;
  check('B1c.configDir', resolvePlansDir(f.root), join(f.cfg, 'plans'),
    'GIVEN CLAUDE_CONFIG_DIR set and no setting WHEN the plans dir is resolved THEN it is <config dir>/plans');
}
{
  const f = fixture('b2-project-setting');
  write(join(f.root, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: './plans' }));
  check('B2.projectRelative', resolvePlansDir(f.root), join(f.root, 'plans'),
    'a relative plansDirectory resolves against the project root');
}
{
  const f = fixture('b3-local-overrides-project');
  write(join(f.root, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: './plans-project' }));
  write(join(f.root, '.claude', 'settings.local.json'), JSON.stringify({ plansDirectory: './plans-local' }));
  check('B3.localWins', resolvePlansDir(f.root), join(f.root, 'plans-local'),
    'settings.local.json takes precedence over settings.json');
}
{
  const f = fixture('b4-user-settings-under-config-dir');
  write(join(f.home, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: './plans-home' }));
  write(join(f.cfg, 'settings.json'), JSON.stringify({ plansDirectory: './plans-cfg' }));
  const unset = resolvePlansDir(f.root);
  process.env.CLAUDE_CONFIG_DIR = f.cfg;
  check('B4.userSettingsFollowConfigDir', [unset, resolvePlansDir(f.root)], [join(f.root, 'plans-home'), join(f.root, 'plans-cfg')],
    'GIVEN user settings in ~/.claude and in the config dir WHEN CLAUDE_CONFIG_DIR is unset then set THEN each run reads its own settings.json');
}
{
  const f = fixture('b7-outside-project-root');
  write(join(f.root, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: '../plans' }));
  process.env.CLAUDE_CONFIG_DIR = f.cfg;
  check('B7.outsideRootIgnored', resolvePlansDir(f.root), join(f.cfg, 'plans'),
    'GIVEN a plansDirectory resolving outside the project root WHEN the plans dir is resolved THEN it is the default, as Claude Code does');
}
{
  const f = fixture('b5-malformed-settings');
  write(join(f.root, '.claude', 'settings.json'), '{ not json');
  check('B5.fallsBackToDefault', resolvePlansDir(f.root, 'deadbeef-b555'), join(f.home, '.claude', 'plans'),
    'unparsable settings degrade to the default plans dir');
  check('B5.warnLoggedOnce', countLines(f.logFile, 'Ignoring unreadable settings'), 1,
    'the unparsable settings file is reported exactly once instead of being swallowed');
}
{
  const f = fixture('b6-end-to-end');
  write(join(f.root, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: './plans' }));
  const newPlan = plan(join(f.root, 'plans'), 'planCustom.md', 'CUSTOM\n', 0);

  const linked = linkPlan(f.root, 'deadbeef-b666');

  check('B6.linksFromCustomDir', linked, 'planCustom.md', 'a custom plansDirectory is scanned instead of ~/.claude/plans');
  check('B6.target', readLink(f.latestLink), newPlan, 'the link points into the custom plans directory');
}

// ═══ C. BC-H01 — canonical project-root resolution ═══
{
  const f = fixture('c1-env-var');
  const nested = join(f.root, 'src', 'deep');
  mkdirSync(nested, { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = f.root;
  check('C1.envWins', projectRoot(nested), f.root, 'CLAUDE_PROJECT_DIR wins over a nested hook cwd');
  delete process.env.CLAUDE_PROJECT_DIR;
}
{
  const f = fixture('c2-git-marker');
  const nested = join(f.root, 'src', 'deep');
  mkdirSync(nested, { recursive: true });
  mkdirSync(join(f.root, '.git'), { recursive: true });
  check('C2.walksToGit', projectRoot(nested), f.root, 'the upward walk stops at the .git marker');
}
{
  const f = fixture('c3-claude-marker');
  const nested = join(f.root, 'src', 'deep');
  mkdirSync(nested, { recursive: true });
  check('C3.walksToClaude', projectRoot(nested), f.root, 'the upward walk stops at the .claude marker');
}
{
  fixture('c4-no-marker');
  // Temporary roots can carry markers left by other applications; own only this fixture.
  const markerFree = dir => {
    const up = dirname(dir);
    return [join(dir, '.git'), join(dir, '.claude')].some(existsSync)
      ? false : up === dir || markerFree(up);
  };
  const usableRoot = candidate => {
    try {
      accessSync(candidate, constants.W_OK);
      return markerFree(realpathSync(candidate));
    } catch { return false; }
  };
  const parent = [tmpdir(), '/tmp', '/var/tmp'].find(usableRoot);
  assert.equal(typeof parent, 'string', 'GIVEN an accessible temporary root with no ancestor project markers');
  const isolated = realpathSync(mkdtempSync(join(parent, 'bc-root-fallback-')));
  try {
    const orphan = join(isolated, 'orphan', 'a', 'b');
    mkdirSync(orphan, { recursive: true });
    assert.equal(markerFree(orphan), true, 'GIVEN fallback fixture has no .git or .claude in its ancestor chain');
    check('C4.fallsBackToCwd', projectRoot(orphan), orphan, 'with no marker anywhere the hook cwd is the last resort');
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
}
{
  const f = fixture('c5-stale-env');
  process.env.CLAUDE_PROJECT_DIR = join(f.dir, 'gone');
  check('C5.ignoresMissingEnvDir', projectRoot(f.root), f.root,
    'a CLAUDE_PROJECT_DIR pointing at a missing dir is ignored in favour of the marker walk');
  delete process.env.CLAUDE_PROJECT_DIR;
}
// GIVEN outer/.git > h/.claude > h/notes/misc | WHEN h is HOME, the config-dir parent, or plain | THEN only plain h is a root
{
  const f = fixture('c6-profile-parent');
  const h = join(f.dir, 'outer', 'h');
  const cwd = join(h, 'notes', 'misc');
  mkdirSync(join(f.dir, 'outer', '.git'), { recursive: true });
  mkdirSync(join(h, '.claude'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const rootAs = (env) => {
    process.env.HOME = env.HOME;
    if (env.CLAUDE_CONFIG_DIR) process.env.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR;
    else delete process.env.CLAUDE_CONFIG_DIR;
    return projectRoot(cwd);
  };
  const got = [
    rootAs({ HOME: h }),
    rootAs({ HOME: f.home, CLAUDE_CONFIG_DIR: join(h, '.claude') }),
    rootAs({ HOME: f.home }),
  ];
  delete process.env.CLAUDE_CONFIG_DIR;
  process.env.HOME = f.home;
  check('C6.skipsProfileParent', got, [join(f.dir, 'outer'), join(f.dir, 'outer'), h],
    'a HOME or config-dir-parent .claude is a profile, never a root; the walk continues to the outer .git');
}

// ═══ D. end-to-end: the hook process on source=clear after a `cd` ═══
{
  const f = fixture('d1-hook-process');
  const nested = join(f.root, 'src');
  mkdirSync(nested, { recursive: true });
  plan(f.plansDir, 'planA.md', 'PLAN A CONTENT\n', 0);
  write(f.latestLink, 'MY PRECIOUS HAND WRITTEN NOTES\n');

  // Empty CLAUDE_PLUGIN_ROOT -> no version check, no network call.
  const res = runStart(f, { session_id: 'deadbeef-d111', cwd: nested, source: 'clear' });

  check('D1.exitZero', res.status, 0, 'the hook exits 0');
  check('D1.contentIntact', readText(f.latestLink), 'MY PRECIOUS HAND WRITTEN NOTES\n',
    'end to end on /clear the hand-written LATEST.md survives byte-identical');
  check('D1.stillRegularFile', pathType(f.latestLink), 'file', 'end to end the path is still a regular file');
  check('D1.logsAtRoot', countLines(f.logFile, '[session-start] Started'), 1,
    'the session log lands under the project root, not under the nested cwd');
  check('D1.noNestedLog', existsSync(join(nested, '.claude', 'logs', 'brewcode.log')), false,
    'no log file is created under the nested hook cwd');
  check('D1.stdout', [res.lines, res.out], [1, { systemMessage: 'brewcode:  | session: deadbeef' }],
    'exactly one JSON line on stdout, carrying only the user-facing systemMessage');
}
{
  // Warm 24h cache -> no network. The local version is read off CLAUDE_PLUGIN_ROOT, wherever the cache lives.
  const f = fixture('d2-version-from-relocated-cache');
  const pluginRoot = join(f.dir, 'relocated', 'cache', 'claude-brewcode', 'brewcode', '1.2.3');
  write(f.stateFile, JSON.stringify({ _versionCache: { brewcode: { remote: '9.9.9', fetchedAtMs: Date.now() } } }));

  const res = runStart(f, { session_id: 'deadbeef-d222', cwd: f.root, source: 'startup', permission_mode: 'plan' },
    { CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_CONFIG_DIR: f.cfg, CLAUDE_CODE_PLUGIN_CACHE_DIR: join(f.dir, 'relocated') });

  check('D2.updateLine', [res.status, res.lines, res.out],
    [0, 1, { systemMessage: `brewcode: ${pluginRoot} | session: deadbeef | perm: plan\nUPDATE brewcode 1.2.3 → 9.9.9: ${RELEASES}` }],
    'GIVEN a plugin cache outside ~/.claude and a newer cached release WHEN the session starts THEN the update line compares the version in CLAUDE_PLUGIN_ROOT');
}
{
  // --plugin-dir shape: no version in the path -> plugin.json. A leftover Claude Code cache entry is inert.
  const f = fixture('d3-version-from-plugin-json');
  const pluginRoot = join(f.dir, 'checkout', 'brewcode');
  write(join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'brewcode', version: '1.2.3' }));
  write(f.stateFile, JSON.stringify({
    _versionCache: { brewcode: { remote: '1.2.3', fetchedAtMs: Date.now() }, claudeCode: { remote: '99.99.99', fetchedAtMs: Date.now() } },
  }));

  const res = runStart(f, { session_id: 'deadbeef-d333', cwd: f.root, source: 'startup' }, { CLAUDE_PLUGIN_ROOT: pluginRoot });

  check('D3.upToDate', [res.status, res.lines, res.out], [0, 1, { systemMessage: `brewcode: ${pluginRoot} | session: deadbeef` }],
    'GIVEN plugin.json at the cached release version and a stale Claude Code cache entry WHEN the session starts THEN no update line of either kind is printed');
}

// ═══ E. BC-H03 — a plan that PREDATES the transcript (post-/clear: no planFilePath) still re-anchors ═══
{
  const f = fixture('e1-plan-predates-transcript');
  const p = plan(f.plansDir, 'planA.md', 'PLAN A\n', 0);
  linkLatest(f, p);
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e111');

  check('E1.branchPlanLatest', countLines(f.logFile, 'branch=plan-latest'), 1,
    'a transcript with no planFilePath falls back to the project LATEST.md rung exactly once');
  check('E1.pointsAtLatest', r.ctx, `[PLAN] Read ${f.latestLink} with the Read tool before doing any work.\n${FOLLOW_LATEST}`,
    'the injected fragment names the project-scoped LATEST.md path and makes the model check it against the summary');
  check('E1.exitZero', r.status, 0, 'the hook exits 0');
  check('E1.singleJsonLine', r.lines, 1, 'exactly one JSON line on stdout');
}
{
  const f = fixture('e2-no-plan-anywhere');
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e222');

  check('E2.branchIntent', countLines(f.logFile, 'branch=intent'), 1,
    'with no transcript plan and no LATEST.md the ladder still ends at INTENT, never at silence');
  check('E2.intentText', r.ctx, INTENT, 'the INTENT fragment is injected verbatim');
}
{
  // Rung position: a real LATEST.md beats a planFilePath whose file is gone.
  const f = fixture('e3-dead-plan-path');
  const p = plan(f.plansDir, 'planA.md', 'PLAN A\n', 0);
  linkLatest(f, p);
  const t = transcript(f, 'dead-plan-key',
    [`{"type":"attachment","planFilePath":"${join(f.dir, 'deleted', 'gone.md')}"}`]);

  const r = runCompact(f, t, 'deadbeef-e333');

  check('E3.branchPlanLatest', countLines(f.logFile, 'branch=plan-latest'), 1,
    'plan-latest sits above plan-missing: an existing link beats a dead planFilePath');
  check('E3.noPlanMissing', countLines(f.logFile, 'branch=plan-missing'), 0,
    'the plan-missing rung is not reached while LATEST.md exists');
  check('E3.pointsAtLatest', r.ctx.split('\n')[0], `[PLAN] Read ${f.latestLink} with the Read tool before doing any work.`,
    'the fragment names LATEST.md, not the dead path');
}
{
  // Precedence unchanged: a live planFilePath in the transcript still wins.
  const f = fixture('e4-live-plan-path-wins');
  const p = plan(f.plansDir, 'planA.md', 'PLAN A\n', 0);
  const own = plan(f.plansDir, 'planOwn.md', 'PLAN OWN\n', 0);
  linkLatest(f, p);
  const t = transcript(f, 'live-plan-key', [`{"type":"attachment","planFilePath":"${own}"}`]);

  const r = runCompact(f, t, 'deadbeef-e444');

  check('E4.branchPlanFile', countLines(f.logFile, 'branch=plan-file'), 1,
    'a planFilePath found in the transcript still outranks the LATEST.md fallback');
  check('E4.pointsAtTranscriptPlan', r.ctx,
    `[PLAN] Read ${own} with the Read tool before doing any work.\nIt is the plan for this session: follow it, do not re-derive it.`,
    'the fragment names the transcript plan, not LATEST.md, and carries no role-model sentence');
}
{
  const f = fixture('e5-user-file-at-latest');
  write(f.latestLink, 'MY PRECIOUS HAND WRITTEN NOTES\n');
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e555');

  check('E5.userFileNotAPlan', r.ctx, INTENT,
    'GIVEN a hand-written regular file at LATEST.md WHEN a compact fires THEN it is not offered as a plan');
}
{
  const f = fixture('e6-foreign-symlink-at-latest');
  linkLatest(f, write(join(f.dir, 'elsewhere', 'notes.md'), 'FOREIGN TARGET\n'));
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e666');

  check('E6.foreignLinkNotAPlan', r.ctx, INTENT,
    'GIVEN a symlink at LATEST.md pointing outside the plans dir WHEN a compact fires THEN it is not offered as a plan');
}
{
  const f = fixture('e7-link-into-config-dir-plans');
  linkLatest(f, plan(join(f.cfg, 'plans'), 'planA.md', 'PLAN A\n', 0));
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const unset = runCompact(f, t, 'deadbeef-e777');
  const set = runCompact(f, t, 'deadbeef-e778', { CLAUDE_CONFIG_DIR: f.cfg });

  check('E7.plansDirFollowsConfigDir', [unset.ctx, set.ctx],
    [INTENT, `[PLAN] Read ${f.latestLink} with the Read tool before doing any work.\n${FOLLOW_LATEST}`],
    'GIVEN an unrecorded link into <config dir>/plans WHEN CLAUDE_CONFIG_DIR is unset then set THEN only the run whose plans dir contains the target accepts it');
}
{
  const f = fixture('e8-recorded-link-any-config-dir');
  const p = plan(join(f.dir, 'cfg-other', 'plans'), 'planA.md', 'PLAN A\n', 0);
  linkLatest(f, p);
  write(f.stateFile, JSON.stringify({ _planLink: p }));
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e888');

  check('E8.recordedLinkAccepted', r.ctx, `[PLAN] Read ${f.latestLink} with the Read tool before doing any work.\n${FOLLOW_LATEST}`,
    'GIVEN a link whose target session-start recorded under another config dir WHEN a compact fires THEN it is still offered');
}
{
  const f = fixture('e9-plan-mode-and-tasks');
  const t = transcript(f, 'plan-mode-tasks',
    ['{"type":"attachment","attachment":{"type":"plan_mode"}}', '{"type":"assistant","content":[{"type":"tool_use","name":"TaskCreate"}]}']);

  const r = runCompact(f, t, 'deadbeef-e999');

  check('E9.planInSummaryThenTasks', r.ctx, [
    '[PLAN] This session ran in plan mode; no plan file is available.',
    'A plan in the compact summary -> follow it, do not re-derive it.',
    'No plan there -> re-read the user ORIGINAL task and intent from the summary and keep executing THAT.',
    TASKS,
  ].join('\n'),
    'GIVEN plan-mode traces and a TaskCreate call but no plan file WHEN a compact fires THEN the summary-plan fragment is followed by the TaskList fragment');
}

// ═══ F. containment — a SYMLINKED .claude/plans must not host LATEST.md ═══
{
  const f = fixture('f1-symlinked-plans-dir');
  const outside = join(f.dir, 'outside');
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, join(f.root, '.claude', 'plans'));
  plan(f.plansDir, 'planA.md', 'FRESH\n', 0);

  const linked = linkPlan(f.root, 'deadbeef-f111');

  check('F1.returnsNull', linked, null, 'a symlinked .claude/plans blocks linking instead of writing through it');
  check('F1.nothingWrittenOutside', listDir(outside), [],
    'the directory the symlink points at stays empty - LATEST.md never lands outside the project root');
  check('F1.warnLoggedOnce', countLines(f.logFile, 'plans dir is a symlink'), 1,
    'the containment refusal is logged exactly once');
}

// ═══ G. fail-open — malformed stdin never breaks a session ═══
{
  const f = fixture('g1-malformed-stdin');
  const hooks = ['session-start.mjs', 'compact-recall.mjs'];
  const inputs = [['empty', ''], ['non-json', 'not json at all'], ['truncated-json', '{"session_id": ']];

  for (const hook of hooks) {
    for (const [label, body] of inputs) {
      const res = spawnSync(process.execPath, [join(HOOKS, hook)], {
        input: body,
        encoding: 'utf8',
        env: { ...process.env, HOME: f.home, CLAUDE_PROJECT_DIR: f.root, CLAUDE_PLUGIN_ROOT: '' },
      });
      const shape = [res.status, res.stdout.trim().split('\n').length, safe(() => typeof JSON.parse(res.stdout), 'NO-JSON')];
      check(`G.${hook}.${label}`, shape, [0, 1, 'object'],
        `${hook} on ${label} stdin exits 0 with exactly one well-formed JSON line`);
    }
  }
}

// ═══ H. log level — BREWCODE_LOG_LEVEL only; removed task-system config is ignored ═══
{
  const UTILS_URL = pathToFileURL(join(HOOKS, 'lib', 'utils.mjs')).href;
  const logOnce = (name, level, envLevel) => {
    const dir = join(BASE, name);
    mkdirSync(join(dir, '.claude', 'tasks', 'cfg'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'tasks', 'cfg', 'brewcode.config.json'), '{"logging":{"level":"trace"}}');
    const env = { ...process.env };
    delete env.BREWCODE_LOG_LEVEL;
    if (envLevel) env.BREWCODE_LOG_LEVEL = envLevel;
    const code = `const u = await import(${JSON.stringify(UTILS_URL)}); u.log(${JSON.stringify(level)}, '[t]', 'msg', ${JSON.stringify(dir)});`;
    spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 8000, env });
    const file = join(dir, '.claude', 'logs', 'brewcode.log');
    return existsSync(file) ? readFileSync(file, 'utf8').replace(/^\S+ /gm, '<ts> ') : null;
  };
  check('H1.levelFromEnvOnly',
    {
      configIgnored: logOnce('h1-cfg', 'debug'),
      envDebug: logOnce('h1-env', 'debug', 'DEBUG'),
      defaultWarn: logOnce('h1-warn', 'warn'),
      envError: logOnce('h1-err', 'warn', 'error'),
    },
    { configIgnored: null, envDebug: '<ts> DEBUG [t] msg\n', defaultWarn: '<ts> WARN  [t] msg\n', envError: null },
    'GIVEN trace in brewcode.config.json WHEN logging THEN only BREWCODE_LOG_LEVEL (case-insensitive) or default info decides');
}

process.env.HOME = REAL_HOME;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nsuite-session-start (core hooks: BC-H01, BC-H02)');
console.log(`  base: ${BASE}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
