#!/usr/bin/env node
/**
 * E2E suite for the three docsync hooks (track / watch / gate).
 * Each case drives a hook as a REAL child process (JSON on stdin -> JSON on
 * stdout) and asserts the exit code, stdout and the on-disk state it produced.
 *
 * Isolation: every workspace lives under os.tmpdir() with its own .claude tree.
 * CLAUDE_PROJECT_DIR is scrubbed from the inherited env unless a case sets it,
 * so an operator's shell cannot change a result.
 *
 * Covers BD04 (nested cwd must not relocate config/state) and BD05 (one state
 * file per session, pid-unique temp).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync, statSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ASSETS = join(fileURLToPath(import.meta.url), '..', '..', 'assets');
const HOOK = { track: join(ASSETS, 'docsync-track.mjs'), watch: join(ASSETS, 'docsync-watch.mjs'), gate: join(ASSETS, 'docsync-gate.mjs') };
const BASE = mkdtempSync(join(tmpdir(), 'docsync-test-'));

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
}

/** Builds a project with .claude/docsync/config.json plus the given docs. */
function makeProject(name, config, docs) {
  const root = join(BASE, name);
  mkdirSync(join(root, '.claude', 'docsync'), { recursive: true });
  writeFileSync(join(root, '.claude', 'docsync', 'config.json'), JSON.stringify(config));
  for (const [rel, body] of Object.entries(docs)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function run(hook, payload, { cwd, projectDir } = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  const r = spawnSync(process.execPath, [HOOK[hook]], {
    input: JSON.stringify(payload), encoding: 'utf8', cwd: cwd || BASE, env
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

const stateFiles = root => readdirSync(join(root, '.claude', 'docsync')).filter(f => f.startsWith('state')).sort();
// A state file a hook failed to write is a FAILing assertion, never a suite crash that
// swallows the remaining cases and the summary line.
const readState = (root, f) => {
  try { return JSON.parse(readFileSync(join(root, '.claude', 'docsync', f), 'utf8')); } catch { return {}; }
};

const DATED = '---\nlast_updated: "2000-01-01"\n---\n\n# old\n';
const UNDATED = '# no frontmatter\n';

// ── BD04: a nested cwd must not relocate config or state ─────────────────────
console.log('BD04 — project root vs hook cwd');
{
  const root = makeProject('bd04-disabled', { enabled: false, threshold_days: 7, exclude: [] }, { 'docs/a.md': UNDATED });
  mkdirSync(join(root, 'pkg', 'nested'), { recursive: true });
  const nested = join(root, 'pkg', 'nested');
  const payload = { session_id: 's1', cwd: nested, tool_input: { file_path: join(root, 'docs/a.md') } };

  const viaEnv = run('track', payload, { cwd: nested, projectDir: root });
  check('disabled install stays inert from a nested cwd (env)', [viaEnv.code, viaEnv.out], [0, '{}']);

  const viaWalk = run('track', payload, { cwd: nested });
  check('disabled install stays inert from a nested cwd (upward walk)', [viaWalk.code, viaWalk.out], [0, '{}']);

  check('no stray state dir below the root', readdirSync(root).sort(), ['.claude', 'docs', 'pkg']);
}
{
  const root = makeProject('bd04-rel', { enabled: true, threshold_days: 7, exclude: [] }, { 'docs/a.md': DATED });
  mkdirSync(join(root, 'pkg'), { recursive: true });
  const r = run('track', { session_id: 's1', cwd: join(root, 'pkg'), tool_input: { file_path: '../docs/a.md' } }, { cwd: join(root, 'pkg'), projectDir: root });
  check('relative tool_input resolves against cwd', [r.code, r.out], [0, '{}']);
  check('recorded key is root-relative', readState(root, 'state-s1.json').touched, ['docs/a.md']);
}
{
  // Pins that the RESOLVED root — not input.cwd — reaches loadConfig and statePath.
  // A decoy .claude/docsync/config.json sits in the nested cwd; reading it would
  // disable the hook and put the state file in the wrong place.
  const root = makeProject('bd04-decoy', { enabled: true, threshold_days: 7, exclude: [] }, { 'docs/a.md': UNDATED });
  const nested = join(root, 'pkg');
  mkdirSync(join(nested, '.claude', 'docsync'), { recursive: true });
  writeFileSync(join(nested, '.claude', 'docsync', 'config.json'), JSON.stringify({ enabled: false }));

  const r = run('track', { session_id: 's1', cwd: nested, tool_input: { file_path: join(root, 'docs/a.md') } }, { cwd: nested, projectDir: root });
  const parsed = JSON.parse(r.out);
  check('track reads config from the resolved root, not the cwd decoy',
    [r.code, /no `last_updated` frontmatter/.test(parsed.hookSpecificOutput?.additionalContext || '')], [0, true]);
  check('track writes state under the resolved root', stateFiles(root), ['state-s1.json']);
  check('track wrote nothing under the nested cwd', readdirSync(join(nested, '.claude', 'docsync')).sort(), ['config.json']);
}
{
  const root = makeProject('bd04-excl', { enabled: true, threshold_days: 7, exclude: ['vendor/**'] }, { 'vendor/v.md': UNDATED });
  const nested = join(root, 'vendor');
  const r = run('track', { session_id: 's1', cwd: nested, tool_input: { file_path: join(root, 'vendor/v.md') } }, { cwd: nested, projectDir: root });
  check('exclude globs still apply from a nested cwd', [r.code, r.out], [0, '{}']);
  check('excluded file produced no state', stateFiles(root), []);
}

// ── BD05: one state file per session ─────────────────────────────────────────
console.log('BD05 — per-session state');
{
  const root = makeProject('bd05-sessions', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED, 'b.md': DATED });
  run('track', { session_id: 'aaa', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  run('watch', { session_id: 'bbb', cwd: root, tool_input: { file_path: join(root, 'b.md') } }, { cwd: root, projectDir: root });
  check('two sessions own two files', stateFiles(root), ['state-aaa.json', 'state-bbb.json']);
  check('session aaa kept its entry', readState(root, 'state-aaa.json').touched, ['a.md']);
  check('session bbb kept its entry', readState(root, 'state-bbb.json').touched, ['b.md']);
  check('no temp file survived', readdirSync(join(root, '.claude', 'docsync')).filter(f => f.endsWith('.tmp')), []);
}
{
  const root = makeProject('bd05-sanitize', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  run('track', { session_id: '../../evil id', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('session id is sanitized into a flat filename', stateFiles(root), ['state-.._.._evil_id.json']);
}
{
  const root = makeProject('bd05-nosession', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  run('track', { cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('absent session id falls back to state.json', stateFiles(root), ['state.json']);
}

// ── gate: blocks once, prunes stale session files ────────────────────────────
console.log('gate — decision + prune');
{
  const root = makeProject('gate-block', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  run('track', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });

  const nested = join(root, 'pkg');
  mkdirSync(nested, { recursive: true });
  const first = run('gate', { session_id: 's1', cwd: nested }, { cwd: nested, projectDir: root });
  const parsed = JSON.parse(first.out);
  check('gate blocks via decision, exit 0, from a nested cwd', [first.code, parsed.decision], [0, 'block']);
  check('gate names the stale doc', /a\.md \(\d+d\)/.test(parsed.reason), true);

  const second = run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('gate blocks at most once per session', [second.code, second.out], [0, '{}']);
}
{
  const root = makeProject('gate-prune', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const dir = join(root, '.claude', 'docsync');
  const old = new Date(Date.now() - 30 * 86400000);
  for (const f of ['state-ancient.json', 'state.json', 'state-x.json.1234.tmp']) {
    writeFileSync(join(dir, f), '{}');
    utimesSync(join(dir, f), old, old);
  }
  writeFileSync(join(dir, 'state-fresh.json'), JSON.stringify({ session_id: 'fresh', touched: [], asked: false }));
  run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('gate prunes state files older than 14 days', stateFiles(root), ['state-fresh.json', 'state-s1.json']);
}
{
  const root = makeProject('gate-off', { enabled: false, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const r = run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('disabled gate never blocks', [r.code, r.out], [0, '{}']);
}
{
  // Crash-safety only, NOT polarity: with no config there is also no tracked doc to gate on.
  const root = makeProject('gate-missing-cfg', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  rmSync(join(root, '.claude', 'docsync', 'config.json'));
  const r = run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('a missing config file never crashes the gate', [r.code, r.out, r.err], [0, '{}', '']);
}

// ── polarity: an ABSENT `enabled` key means ENABLED ──────────────────────────
// Unlike its sibling setups, docsync reads `c.enabled !== false`, so a config written
// before the toggle existed keeps working. Every other fixture passes `enabled`
// explicitly and therefore survives an inverted `=== true`; these three do not, and an
// inversion would silently disable every existing user's tracker.
console.log('polarity — absent `enabled` key');
{
  const root = makeProject('polarity-track', { threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const r = run('track', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('track runs with no `enabled` key and writes session state', [r.code, stateFiles(root)], [0, ['state-s1.json']]);
  check('track recorded the doc with no `enabled` key', readState(root, 'state-s1.json').touched, ['a.md']);
}
{
  const root = makeProject('polarity-watch', { threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const r = run('watch', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('watch records the doc with no `enabled` key', [r.code, readState(root, 'state-s1.json').touched], [0, ['a.md']]);
}
{
  const root = makeProject('polarity-gate', { threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  run('track', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  const r = run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('gate blocks with no `enabled` key in the config', [r.code, JSON.parse(r.out).decision], [0, 'block']);
}

// Exercise the actual install emission, including its upgrade mode and rollback.
console.log('installer — prevalidation and transactional rollback');
const SKILL = join(ASSETS, '..');
const skillText = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
const installBlock = skillText.slice(skillText.indexOf('### Step 2: Copy hooks')).match(/```bash\n([\s\S]*?)\n```/)[1];
function install(root, { mode = 'install', threshold = '7', skill = SKILL, fault = '', concurrent = '' } = {}) {
  const script = installBlock.replaceAll('${CLAUDE_SKILL_DIR}', skill).replace('MODE=install', `MODE=${mode}`)
    .replace('THRESHOLD_VALUE', threshold).replace('EXCLUDE_JSON', '["vendor/**"]');
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
  delete env.NODE_OPTIONS;
  if (fault) {
    const shim = join(BASE, 'installer-fault.cjs');
    writeFileSync(shim, `const fs = require('node:fs'); const rename = fs.renameSync; let fired = false;
      fs.renameSync = function(from, to) {
        if (!fired && to === ${JSON.stringify(fault)}) {
          fired = true;
          ${concurrent ? `fs.writeFileSync(${JSON.stringify(concurrent)}, 'concurrent editor');` : ''}
          throw new Error('injected write failure');
        }
        return rename.apply(this, arguments);
      };`);
    env.NODE_OPTIONS = `--require=${shim}`;
  }
  return spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8', env });
}
function tree(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    const file = join(root, entry.name);
    return entry.isDirectory() ? [entry.name, tree(file)] : [entry.name, readFileSync(file).toString('base64'), statSync(file).mode & 0o777];
  });
}
function partialInstall(name, settings = '{"env":{"KEEP":"yes"},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"foreign-stop"}]}]}}\n') {
  const root = makeProject(name, { enabled: false, threshold_days: 30, exclude: ['legacy/**'], custom: { keep: true } }, {});
  mkdirSync(join(root, '.claude/hooks'));
  writeFileSync(join(root, '.claude/hooks/docsync-track.mjs'), 'old track bytes\n');
  chmodSync(join(root, '.claude/hooks/docsync-track.mjs'), 0o640);
  writeFileSync(join(root, '.claude/settings.json'), settings);
  writeFileSync(join(root, '.claude/settings.json.bak'), 'existing user backup\n');
  writeFileSync(join(root, '.claude/docsync/state-personal.json'), 'session state untouched\n');
  return root;
}
{
  // GIVEN a fresh project with no installed settings, config or hooks.
  const root = join(BASE, 'install-fresh-success');
  mkdirSync(root);
  check('fresh install fixture has no owned destinations', tree(root), []);
  // WHEN the emitted installer completes and the installed track hook executes.
  const result = install(root);
  writeFileSync(join(root, 'a.md'), DATED);
  const tracked = spawnSync(process.execPath, [join(root, '.claude/hooks/docsync-track.mjs')], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
    input: JSON.stringify({ session_id: 'installed-proof', cwd: root, tool_input: { file_path: join(root, 'a.md') } })
  });
  // THEN real installed hooks consume the installed config and write session state.
  check('fresh installation succeeds', result.status, 0);
  const { version, content_version, generated_by, last_updated, ...config } = JSON.parse(readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'));
  check('fresh config contains the chosen tracking defaults', config, { enabled: true, threshold_days: 7, exclude: ['vendor/**'] });
  check('installed hook executes successfully', tracked.status, 0);
  check('installed hook tracks the project document', readState(root, 'state-installed-proof.json').touched, ['a.md']);
  check('fresh settings backup records the absent settings baseline', readFileSync(join(root, '.claude/settings.json.bak'), 'utf8'), '{}\n');
}
{
  // GIVEN malformed prior configuration and a partial prior installation.
  const root = partialInstall('install-invalid-config');
  writeFileSync(join(root, '.claude/docsync/config.json'), '{broken');
  const before = tree(root);
  // WHEN upgrade validates the config before replacing any hook.
  const result = install(root, { mode: 'upgrade' });
  // THEN the complete previous installation remains intact.
  check('invalid configuration rejects upgrade', result.status, 1);
  check('invalid configuration preserves every destination', tree(root), before);
}
{
  // GIVEN malformed foreign settings and a partial prior installation.
  const root = partialInstall('install-invalid-settings', '{broken');
  const before = tree(root);
  // WHEN the emitted installer validates its inputs.
  const result = install(root);
  // THEN it fails before any destination changes.
  check('invalid settings reject installation', result.status, 1);
  check('invalid settings preserve every prior byte, mode and directory', tree(root), before);
}
{
  // GIVEN invalid threshold input and an existing partial installation.
  const root = partialInstall('install-invalid-threshold');
  const before = tree(root);
  // WHEN the emitted installer validates configuration.
  const result = install(root, { threshold: '0' });
  // THEN neither hooks nor config nor settings are overwritten.
  check('invalid threshold rejects installation', result.status, 1);
  check('invalid threshold leaves the full installation intact', tree(root), before);
}
{
  // GIVEN a partial install with byte-sensitive hooks, backup and session state.
  const root = partialInstall('install-rollback');
  const before = tree(root);
  // WHEN settings replacement fails after the other owned files commit.
  const result = install(root, { fault: join(root, '.claude/settings.json') });
  // THEN all changed files and newly created hooks are restored individually.
  check('settings write failure rejects installation', result.status, 1);
  check('rollback restores partial install bytes and modes exactly', tree(root), before);
}
{
  // GIVEN a new project and no docsync or settings destinations.
  const root = join(BASE, 'install-fresh-rollback');
  mkdirSync(root);
  // WHEN settings replacement fails after creating hooks and config.
  const result = install(root, { fault: join(root, '.claude/settings.json') });
  // THEN the rollback removes only files and directories created by this run.
  check('fresh install write failure rejects installation', result.status, 1);
  check('fresh rollback returns to the empty project', tree(root), []);
}
{
  // GIVEN an existing partial install and an independent editor of its track hook.
  const root = partialInstall('install-concurrent-rollback');
  const hook = join(root, '.claude/hooks/docsync-track.mjs');
  const config = readFileSync(join(root, '.claude/docsync/config.json'), 'utf8');
  // WHEN the editor changes an already committed file before another write fails.
  const result = install(root, { fault: join(root, '.claude/settings.json'), concurrent: hook });
  // THEN rollback retains the editor's bytes and reports the unresolved conflict.
  check('concurrent rollback still reports installer failure', result.status, 1);
  check('concurrent hook edit survives rollback', readFileSync(hook, 'utf8'), 'concurrent editor');
  check('independent config rollback succeeds', readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'), config);
  check('rollback reports concurrent edit explicitly', /concurrent edit preserved/.test(result.stderr), true);
  check('new hook is removed during concurrent rollback', existsSync(join(root, '.claude/hooks/docsync-watch.mjs')), false);
}
{
  // GIVEN a disabled prior install, foreign settings, user backup and session state.
  const root = partialInstall('install-upgrade');
  const expected = JSON.parse(readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'));
  // WHEN the same emission runs twice in upgrade mode.
  check('upgrade transaction succeeds', install(root, { mode: 'upgrade' }).status, 0);
  const once = tree(root);
  check('second upgrade succeeds', install(root, { mode: 'upgrade' }).status, 0);
  // THEN private config, foreign settings, backups and state are preserved.
  const { version, content_version, generated_by, last_updated, ...actual } = JSON.parse(readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'));
  check('upgrade preserves all private fields and disabled polarity', actual, expected);
  check('upgrade settings merge is idempotent', tree(root), once);
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  check('foreign settings survive upgrade', settings.env, { KEEP: 'yes' });
  check('foreign stop hook survives upgrade', settings.hooks.Stop[0].hooks[0], { type: 'command', command: 'foreign-stop' });
  check('portable stop hook path is emitted', settings.hooks.Stop[0].hooks[1], { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-gate.mjs'] });
  check('existing settings backup is byte-identical', readFileSync(join(root, '.claude/settings.json.bak'), 'utf8'), 'existing user backup\n');
  check('session state is byte-identical', readFileSync(join(root, '.claude/docsync/state-personal.json'), 'utf8'), 'session state untouched\n');
}

rmSync(BASE, { recursive: true, force: true });
console.log(`\n| checks | ${passed + failed} |\n| passed | ${passed} |\n| failed | ${failed} |`);
process.exit(failed === 0 ? 0 : 1);
