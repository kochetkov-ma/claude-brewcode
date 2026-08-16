#!/usr/bin/env node
/**
 * suite-skill.mjs — the shell contract the publish blocks depend on:
 * `scripts/brewpage-lib.sh` (BD03: where the token file lives, how it is
 * protected, parameter validation) and the SKILL.md blocks themselves
 * (BD02: nothing prompt-derived is pasted into shell source).
 *
 * Self-contained: every project fixture is generated inside one mkdtemp base,
 * which is removed at the end. No network, no upload, no real `.claude` touched.
 *
 * Assertion policy: unconditional exact-equality checks with a description.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, statSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..', 'scripts', 'brewpage-lib.sh');
const SKILL = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
const LINES = SKILL.split('\n');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-publish-s-')));

let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
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

/** Run `code` with the lib sourced, in `cwd`, with a clean env. */
function sh(code, { cwd, env = {} } = {}) {
  const e = { ...process.env, ...env };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete e[k];
  const r = spawnSync('bash', ['-c', `. "${LIB}"\n${code}`], {
    cwd, encoding: 'utf8', env: e, timeout: 20000,
  });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

const countLines = (re) => LINES.filter((l) => re.test(l)).length;

// ── BD03: project root resolution ──────────────────────────────────────────
{
  const explicit = join(BASE, 'explicit');
  mkdirSync(explicit, { recursive: true });
  check('root.env', sh('printf %s "$HISTORY_FILE"', { cwd: BASE, env: { CLAUDE_PROJECT_DIR: explicit } }).out,
    join(explicit, '.claude', 'brewpage-history.md'),
    'CLAUDE_PROJECT_DIR wins and the history file hangs off it');
}
{
  const repo = join(BASE, 'repo');
  const nested = join(repo, 'packages', 'web');
  mkdirSync(nested, { recursive: true });
  spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
  check('root.git', sh('printf %s "$HISTORY_FILE"', { cwd: nested, env: { CLAUDE_PROJECT_DIR: undefined } }).out,
    join(repo, '.claude', 'brewpage-history.md'),
    'from a nested package the git toplevel is used, not cwd — the BD03 second-file case');
}
{
  const marked = join(BASE, 'marked');
  const deep = join(marked, 'a', 'b');
  mkdirSync(join(marked, '.claude'), { recursive: true });
  mkdirSync(deep, { recursive: true });
  check('root.walk', sh('printf %s "$HISTORY_FILE"', {
    cwd: deep, env: { CLAUDE_PROJECT_DIR: undefined, GIT_CEILING_DIRECTORIES: BASE },
  }).out, join(marked, '.claude', 'brewpage-history.md'),
  'with no git the upward .claude walk finds the project root');
}

// ── BD03: the history file is created private and kept out of git ──────────
{
  const proj = join(BASE, 'proj');
  mkdirSync(proj, { recursive: true });
  // A real repo, not a bare `.git` directory: the ignore guard asks git itself
  // (`rev-parse --git-dir`), so that it also works in worktrees and submodules.
  spawnSync('git', ['init', '-q', proj], { encoding: 'utf8' });
  const hist = join(proj, '.claude', 'brewpage-history.md');
  const gi = join(proj, '.gitignore');

  const r = sh('bp_history_init && printf %s "$HISTORY_FILE"', { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  check('history.init.exit', r.status, 0, 'init succeeds on a fresh project');
  check('history.init.path', r.out, hist, 'the file is created at the project-root path');
  check('history.init.exists', existsSync(hist), true, 'the history file exists after init');
  check('history.init.mode', existsSync(hist) ? statSync(hist).mode & 0o777 : -1, 0o600,
    'the token-bearing file is owner-only — the skill used to only ask the user to keep it private');
  const readLines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l !== '') : ['<missing>']);
  check('history.init.gitignore', readLines(gi),
    ['.claude/brewpage-history.md', '.claude/tmp/'],
    'both the token file and the temp dir are ignored, not merely documented');

  sh('bp_history_init', { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  check('history.init.idempotent', readLines(gi),
    ['.claude/brewpage-history.md', '.claude/tmp/'], 're-running adds no duplicate ignore lines');

  check('history.header.token', readLines(hist).join('\n').includes('X-Owner-Token: TOKEN'), true,
    'the header carries the delete recipe');

  sh('bp_history_init && bp_history_append "https://brewpage.app/public/abc" "tok-123" 15 html',
    { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  const rows = readLines(hist).filter((l) => l.includes('brewpage.app/public/abc'));
  check('history.append.rows', rows.length, 1, 'exactly one row is appended per publish');
  check('history.append.shape',
    (rows[0] || '<missing>').replace(/^\| [0-9-]{10} [0-9:]{5} \|/, '| DATE |'),
    '| DATE | [https://brewpage.app/public/abc](https://brewpage.app/public/abc) | `tok-123` | 15d | html |',
    'the row shape is unchanged from the format the header documents');
}
{
  const bare = join(BASE, 'bare');
  mkdirSync(bare, { recursive: true });
  sh('bp_history_init', { cwd: bare, env: { CLAUDE_PROJECT_DIR: bare } });
  check('history.nogit.gitignore', existsSync(join(bare, '.gitignore')), false,
    'no .gitignore is invented in a directory that is not a git repo');
  check('history.nogit.file', existsSync(join(bare, '.claude', 'brewpage-history.md')), true,
    'the history file is still created there');
}

// ── BD02: ns / ttl / entry are validated as data ───────────────────────────
for (const [ns, days, entry, want, why] of [
  ['mysite', '15', '', 0, 'a plain namespace, ttl and empty entry pass'],
  ['my-site-2026', '1', 'index.html', 0, 'hyphens, digits and a bare entry pass'],
  ['abc', '365', 'sub/page.html', 0, 'a nested relative entry passes'],
  ['ab', '15', '', 1, 'a 2-char namespace is rejected'],
  ['', '15', '', 1, 'an empty namespace is rejected'],
  ['a'.repeat(33), '15', '', 1, 'a 33-char namespace is rejected'],
  ['my site', '15', '', 1, 'a namespace with a space is rejected'],
  ['my$(id -un)', '15', '', 1, 'a namespace carrying a command substitution is rejected'],
  ['my;rm -rf /', '15', '', 1, 'a namespace carrying a command separator is rejected'],
  ['mysite', '15x', '', 1, 'a non-integer ttl is rejected'],
  ['mysite', '0', '', 1, 'a zero ttl is rejected'],
  ['mysite', '', '', 1, 'an empty ttl is rejected'],
  ['mysite', '-3', '', 1, 'a negative ttl is rejected'],
  ['mysite', '15', '../../etc/passwd', 1, 'a traversal entry is rejected'],
  ['mysite', '15', 'a b.html', 1, 'an entry with a space is rejected'],
  ['mysite', '15', '$(id -un).html', 1, 'an entry carrying a command substitution is rejected'],
]) {
  const r = sh(`bp_validate '${ns.replace(/'/g, "'\\''")}' '${days}' '${entry}'`, { cwd: BASE });
  check(`validate.${JSON.stringify([ns, days, entry])}`, r.status, want, why);
}
{
  // Single-quoted substitution is what keeps the value inert: proof that the
  // BD02 vector does not fire even before bp_validate sees it.
  const r = sh(`NS='p$(id -un)x'; printf %s "$NS"`, { cwd: BASE });
  check('validate.inert', r.out, 'p$(id -un)x',
    'a single-quoted substitution reaches bp_validate as literal text, unexpanded');
}

// ── BD02/BD03: the SKILL.md blocks themselves ──────────────────────────────
check('skill.tools', LINES.filter((l) => l.startsWith('allowed-tools:'))[0],
  'allowed-tools: [Read, Write, Bash, AskUserQuestion, Glob]',
  'Write is declared — the inputs travel as files now');
check('skill.lib.sourced', countLines(/^\. "\$\{CLAUDE_SKILL_DIR\}\/scripts\/brewpage-lib\.sh" \|\| \{ echo "FAILED: publish helper library not found"; exit 1; \}$/), 5,
  'all five publish blocks source the lib');
check('skill.validate.called', countLines(/^bp_begin '\{ns\}' '\{days\}' '(\{entry\})?' \|\| exit 1$/), 5,
  'all five blocks run the shared prelude, which validates before doing anything');
check('skill.history.init', [
  sh("bp_begin 'mysite' '15' '' >/dev/null", { cwd: BASE, env: { CLAUDE_PROJECT_DIR: BASE } }).status,
  sh("bp_begin 'my site' '15' '' >/dev/null", { cwd: BASE, env: { CLAUDE_PROJECT_DIR: BASE } }).status,
], [0, 1], 'bp_begin validates and prepares the history file, and fails the block on a bad namespace');
check('skill.ns.quoted', [countLines(/^bp_begin /), countLines(/^bp_begin '\{ns\}' '\{days\}' '(\{entry\})?' \|\| exit 1$/)],
  [5, 5], 'every substituted parameter sits inside single quotes');
check('skill.history.relative', countLines(/HISTORY_FILE="\.claude/), 0,
  'no block hardcodes a cwd-relative history path any more');
check('skill.heredoc', SKILL.split('BREWPAGE_EOF').length - 1, 0,
  'the content heredoc is gone — a BREWPAGE_EOF line in the content can no longer close it');
check('skill.placeholders', [
  SKILL.split('{content}').length - 1,
  SKILL.split('{original_json}').length - 1,
  SKILL.split('{password_header}').length - 1,
], [0, 0, 0], 'no prompt-derived text, JSON or password placeholder is left in shell source');
check('skill.password.file', countLines(/^RESPONSE=\$\(bp_post "https:\/\/brewpage\.app\/api\//), 5,
  'all five blocks POST through bp_post, which adds the X-Password header from a file');
check('skill.payload.file', countLines(/-d @"\$PAYLOAD_FILE"/), 1,
  'the JSON body is posted from a file, never inlined');

// ── BD01 + BD-N03: the upload is gated on the verifier ─────────────────────
{
  const packLine = LINES.findIndex((l) => l.includes('publish.mjs") pack') || l.includes('publish.mjs" pack'));
  const inspectLine = LINES.findIndex((l) => l.includes('publish.mjs" inspect'));
  const curlLines = LINES.map((l, i) => [l, i]).filter(([l]) => l.includes('archive=@')).map(([, i]) => i);
  check('gate.calls', [packLine >= 0, inspectLine >= 0], [true, true],
    'the directory branch packs and the supplied-ZIP branch inspects');
  check('gate.curl.count', curlLines.length, 2, 'exactly two blocks upload an archive');
  check('gate.order', [packLine < curlLines[0], inspectLine < curlLines[1]], [true, true],
    'the manifest is produced before the upload line in both branches');
  check('gate.abort', countLines(/^bp_archive_gate "\$RC" "\$MANIFEST" "(\$TMPZIP)?" \|\| exit \$\?$/), 2,
    'both branches abort through the shared gate on a non-zero verifier exit before reaching curl');
  const confirm = sh('bp_archive_gate 2 "ENTRY: index.html" ""', { cwd: BASE, env: { BREWPAGE_CONFIRMED: undefined } });
  const ok = sh('bp_archive_gate 0 "ENTRY: index.html" "" && printf %s "$ENTRY"', { cwd: BASE });
  check('gate.confirm', [confirm.status, confirm.out.startsWith('CONFIRM:'), ok.status, ok.out], [2, true, 0, 'index.html'],
    'the gate stops for confirmation on flagged entries and otherwise hands back the manifest ENTRY');
  check('gate.tmpzip', countLines(/^TMPZIP="\$BP_TMPDIR\/brewpage-site-\$\$\.zip"$/), 1,
    'the archive path is derived per-process, not from mktemp');
  check('gate.mktemp', countLines(/\$\(mktemp/), 0,
    'no block calls mktemp any more — its 0-byte file is what made zip exit 3 (BD-N03)');
}

console.log('suite-skill.mjs (brewpage-lib.sh + SKILL.md publish blocks)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
