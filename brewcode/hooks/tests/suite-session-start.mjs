#!/usr/bin/env node
/**
 * suite-session-start.mjs — core SessionStart hooks: plan-link safety and
 * containment (BC-H02), the canonical project-root recipe (BC-H01), the
 * `plansDirectory` setting, the post-compact plan re-anchor (BC-H03) and the
 * fail-open stdin contract of all four brewcode hooks.
 *
 * Self-contained: inlines its own check()/deepEqual helpers, runs standalone
 * (`node tests/suite-session-start.mjs`), needs no network and no MCP, and never
 * touches the real ~/.claude or the repo working tree — every fixture lives under
 * a temp base with HOME and CLAUDE_PROJECT_DIR injected.
 *
 * Assertion policy: unconditional exact-equality / exact-count checks with a
 * description. No branching decides which asserts run.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync,
  readlinkSync, readdirSync, symlinkSync, utimesSync, realpathSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = join(fileURLToPath(import.meta.url), '..');   // tests/
const HOOKS = join(HERE, '..');                            // brewcode/hooks/
const HOOK = join(HOOKS, 'session-start.mjs');
const HOOK_COMPACT = join(HOOKS, 'compact-recall.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'bc-hooks-')));
const REAL_HOME = homedir();

// Importing the hook must not consume stdin; the module guards main() on argv[1].
const { linkLatestPlan, resolvePlansDir } = await import(HOOK);
const { projectRoot } = await import(join(HOOKS, 'lib', 'utils.mjs'));

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
/** <BASE>/<name>/{home,proj}; HOME is redirected so os.homedir() reads the sandbox. */
function fixture(name) {
  const dir = join(BASE, name);
  const home = join(dir, 'home');
  const root = join(dir, 'proj');
  mkdirSync(join(home, '.claude', 'plans'), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });
  process.env.HOME = home;
  delete process.env.CLAUDE_PROJECT_DIR;
  return {
    dir,
    home,
    root,
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
function runCompact(f, transcriptPath, sessionId) {
  const res = spawnSync(process.execPath, [HOOK_COMPACT], {
    input: JSON.stringify({ session_id: sessionId, cwd: f.root, source: 'compact', transcript_path: transcriptPath }),
    encoding: 'utf8',
    env: { ...process.env, HOME: f.home, CLAUDE_PROJECT_DIR: f.root },
  });
  return {
    status: res.status,
    lines: res.stdout.trim().split('\n').length,
    ctx: safe(() => JSON.parse(res.stdout).hookSpecificOutput.additionalContext, 'NO-CONTEXT'),
  };
}

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

// ═══ B. plansDirectory (docs/settings.md:308) ═══
{
  const f = fixture('b1-default');
  check('B1.default', resolvePlansDir(f.root), join(f.home, '.claude', 'plans'),
    'with no setting the plans dir is ~/.claude/plans');
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
  const f = fixture('b4-home-relative');
  write(join(f.home, '.claude', 'settings.json'), JSON.stringify({ plansDirectory: '~/custom-plans' }));
  check('B4.tildeExpanded', resolvePlansDir(f.root), join(f.home, 'custom-plans'),
    'a ~/ plansDirectory from user settings expands against HOME');
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
  const f = fixture('c4-no-marker');
  const orphan = join(f.dir, 'orphan', 'a', 'b');
  mkdirSync(orphan, { recursive: true });
  check('C4.fallsBackToCwd', projectRoot(orphan), orphan, 'with no marker anywhere the hook cwd is the last resort');
}
{
  const f = fixture('c5-stale-env');
  process.env.CLAUDE_PROJECT_DIR = join(f.dir, 'gone');
  check('C5.ignoresMissingEnvDir', projectRoot(f.root), f.root,
    'a CLAUDE_PROJECT_DIR pointing at a missing dir is ignored in favour of the marker walk');
  delete process.env.CLAUDE_PROJECT_DIR;
}

// ═══ D. end-to-end: the hook process on source=clear after a `cd` ═══
{
  const f = fixture('d1-hook-process');
  const nested = join(f.root, 'src');
  mkdirSync(nested, { recursive: true });
  plan(f.plansDir, 'planA.md', 'PLAN A CONTENT\n', 0);
  write(f.latestLink, 'MY PRECIOUS HAND WRITTEN NOTES\n');
  // Warm version cache -> the hook makes no network call.
  write(join(f.root, '.claude', 'tasks', 'cfg', 'brewcode.state.json'), JSON.stringify({
    _versionCache: { claudeCode: { remote: '99.99.99', fetchedAtMs: Date.now() } },
  }));

  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: 'deadbeef-d111', cwd: nested, source: 'clear' }),
    encoding: 'utf8',
    env: { ...process.env, HOME: f.home, CLAUDE_PROJECT_DIR: f.root, CLAUDE_PLUGIN_ROOT: '' },
  });

  check('D1.exitZero', res.status, 0, 'the hook exits 0');
  check('D1.contentIntact', readText(f.latestLink), 'MY PRECIOUS HAND WRITTEN NOTES\n',
    'end to end on /clear the hand-written LATEST.md survives byte-identical');
  check('D1.stillRegularFile', pathType(f.latestLink), 'file', 'end to end the path is still a regular file');
  check('D1.logsAtRoot', countLines(f.logFile, '[session-start] Started'), 1,
    'the session log lands under the project root, not under the nested cwd');
  check('D1.noNestedLog', existsSync(join(nested, '.claude', 'logs', 'brewcode.log')), false,
    'no log file is created under the nested hook cwd');
  check('D1.singleJsonLine', res.stdout.trim().split('\n').length, 1, 'exactly one JSON line on stdout');
  check('D1.stdoutParses', typeof JSON.parse(res.stdout).systemMessage, 'string', 'stdout carries a systemMessage string');
}

// ═══ E. BC-H03 — a plan that PREDATES the transcript still re-anchors ═══
// Repro shape: --resume / post-/clear, so the scanned transcript carries NO
// planFilePath at all (the first occurrence is the compaction attachment this
// hook is reacting to). Before the plan-latest rung all of E1/E3 degraded to
// [INTENT] even though the project's own plan link was sitting right there.
{
  const f = fixture('e1-plan-predates-transcript');
  const p = plan(f.plansDir, 'planA.md', 'PLAN A\n', 0);
  linkLatest(f, p);
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e111');

  check('E1.branchPlanLatest', countLines(f.logFile, 'branch=plan-latest'), 1,
    'a transcript with no planFilePath falls back to the project LATEST.md rung exactly once');
  check('E1.pointsAtLatest', r.ctx.split('\n')[0], `[PLAN] Read ${f.latestLink} with the Read tool before doing any work.`,
    'the injected fragment names the project-scoped LATEST.md path');
  check('E1.exitZero', r.status, 0, 'the hook exits 0');
  check('E1.singleJsonLine', r.lines, 1, 'exactly one JSON line on stdout');
}
{
  const f = fixture('e2-no-plan-anywhere');
  const t = transcript(f, 'no-plan-key', ['{"type":"user","message":"do the thing"}']);

  const r = runCompact(f, t, 'deadbeef-e222');

  check('E2.branchIntent', countLines(f.logFile, 'branch=intent'), 1,
    'with no transcript plan and no LATEST.md the ladder still ends at INTENT, never at silence');
  check('E2.intentText', r.ctx.split('\n')[0],
    '[INTENT] Re-read the user ORIGINAL task and intent from the compact summary and keep executing THAT.',
    'the INTENT fragment is injected verbatim');
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
  check('E4.pointsAtTranscriptPlan', r.ctx.split('\n')[0], `[PLAN] Read ${own} with the Read tool before doing any work.`,
    'the fragment names the transcript plan, not LATEST.md');
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
  // Warm version cache -> no network even if a hook gets that far.
  write(join(f.root, '.claude', 'tasks', 'cfg', 'brewcode.state.json'), JSON.stringify({
    _versionCache: { claudeCode: { remote: '99.99.99', fetchedAtMs: Date.now() } },
  }));
  const hooks = ['session-start.mjs', 'compact-recall.mjs', 'forced-eval.mjs', 'role-recall.mjs'];
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

process.env.HOME = REAL_HOME;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\nsuite-session-start (core hooks: BC-H01, BC-H02)');
console.log(`  base: ${BASE}`);
for (const line of results) console.log(line);
console.log(`\n  passed=${passed} failed=${failed} total=${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
