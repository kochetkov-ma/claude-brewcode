#!/usr/bin/env node
// E2E: HARD wall guard (hooks/hardmode-guard.mjs), codeword hook (hooks/manager-prompt.mjs), armed-wall notice (hooks/session-start.mjs).
// State lives in an isolated temp project passed as `cwd` on stdin; this repo's .claude/ never touched, no real wall armed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCliArgs } from '../../../hooks/lib/manager-state.mjs';
import { resolvePrompt, VALID_MODES } from '../../../hooks/lib/manager-prompts.mjs';

const HERE = join(fileURLToPath(import.meta.url), '..');
const GUARD_MJS = join(HERE, '..', '..', '..', 'hooks', 'hardmode-guard.mjs');

const BASE = mkdtempSync(join(tmpdir(), 'hardmode-test-'));
let passed = 0;
let failed = 0;
const results = [];

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
  passed += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  results.push(ok
    ? `  PASS  ${name}  (${message})`
    : `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return { __PARSE_ERROR__: String(e), raw: str };
  }
}

// CLAUDE_PROJECT_DIR scrubbed unless a test sets it: ambient value would move project root off the temp fixture.
function runGuardRaw(stdinStr, nodeArgs = [], projectDir) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  const r = spawnSync(process.execPath, [...nodeArgs, GUARD_MJS], {
    input: stdinStr,
    encoding: 'utf8',
    timeout: 8000,
    env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function runGuard(stdinStr, projectDir) {
  return safeParse(runGuardRaw(stdinStr, [], projectDir).stdout || '');
}

/** Isolated project whose state.json arms/disarms the wall for one scenario. */
function makeProject(name, state) {
  const proj = join(BASE, name);
  mkdirSync(join(proj, '.claude', 'brewtools', 'manager'), { recursive: true });
  writeFileSync(join(proj, '.claude', 'brewtools', 'manager', 'state.json'), JSON.stringify(state));
  return proj;
}

const PASS_THROUGH = {};
const EXIT_HINT = 'Manager mode keeps the main context for orchestration, so pass this step to a subagent with the Agent tool: subagents are not restricted, and reading, search and task tracking still work here. The wall comes off only when the user asks: `/brewtools:manager-setup disable`, whose bare `node <project>/.claude/brewtools/manager/manager-state.mjs set hard=false` is the one Bash command allowed at every level.';
const READONLY_HINT = 'ls, cat, head, tail, rg, grep, find, jq, git status|log|diff|show, gh <group> view|list; no redirection, no $(...)';

function denial(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason} ${EXIT_HINT}`,
    },
  };
}

const WRITE_DENIAL = denial('Hard wall: Write is blocked in the main session.');
const BASH_DENIAL = denial(`Hard wall (balanced): the main session runs only read-only Bash commands (${READONLY_HINT}), and this one is not provably read-only.`);
const STRICT_BASH_DENIAL = denial('Hard wall (strict): Bash is blocked in the main session.');
const PARSE_DENIAL = denial('Hard wall: the guard could not parse its PreToolUse payload and denies by default.');
// Guard response -> BEHAVIOUR 'allow' | 'deny': MCP checks assert this, not deny TEXT (rewording != regression);
// check 67 alone asserts the deny message.
function verdict(res) {
  if (deepEqual(res, PASS_THROUGH)) return 'allow';
  const d = res && res.hookSpecificOutput && res.hookSpecificOutput.permissionDecision;
  return d === 'deny' ? 'deny' : `unexpected:${JSON.stringify(res)}`;
}

function denyReason(res) {
  return (res && res.hookSpecificOutput && res.hookSpecificOutput.permissionDecisionReason) || '';
}

const ARMED = makeProject('armed', { hard: true, level: 'balanced' });
const DISARMED = makeProject('disarmed', { hard: false, level: 'balanced' });
const STRICT = makeProject('strict', { hard: true, level: 'strict' });

/** The real installed state CLI next to the state file — the only self-exempt script. */
function installHelper(proj) {
  const p = join(proj, '.claude', 'brewtools', 'manager', 'manager-state.mjs');
  writeFileSync(p, '// genuine manager-state CLI stub\n');
  return p;
}
const ARMED_HELPER = installHelper(ARMED);
const STRICT_HELPER = installHelper(STRICT);

/** A planted look-alike at the path shape the old tail-regex anchor accepted. */
const EVIL_HELPER = join(BASE, 'evil', 'hooks', 'lib', 'manager-state.mjs');
mkdirSync(dirname(EVIL_HELPER), { recursive: true });
writeFileSync(EVIL_HELPER, 'console.error("PWNED");\n');

/** Armed project whose state.json was removed while the manager dir stayed in place. */
const BROKEN = makeProject('broken', { hard: true, level: 'balanced' });
const BROKEN_STATE = join(BROKEN, '.claude', 'brewtools', 'manager', 'state.json');
rmSync(BROKEN_STATE);

/** Deep working directory inside the armed project — BT-F01 vector A. */
const ARMED_NESTED = join(ARMED, 'nested', 'deep');
mkdirSync(ARMED_NESTED, { recursive: true });

function stdin(cwd, extra) {
  return JSON.stringify({
    session_id: 'S1',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: join(cwd, 'x.txt'), content: 'x' },
    ...extra,
  });
}

// GIVEN an armed wall, WHEN a real subagent (agent_id present) writes, THEN it passes through.
check(
  '01-subagent-with-agent-id-passes',
  runGuard(stdin(ARMED, { agent_id: 'sub-1', agent_type: 'general-purpose' })),
  PASS_THROUGH,
  'agent_id present means a genuine subagent tool call and must never be walled',
);

// GIVEN an armed wall, WHEN agent_type is present without agent_id, THEN the call is DENIED.
// REGRESSION: CC 2.1.228 sets agent_type on MAIN thread of `claude --agent <name>`; agent_id is the SOLE discriminator.
check(
  '02-regression-agent-type-only-main-session-is-walled',
  runGuard(stdin(ARMED, { agent_type: 'reviewer' })),
  WRITE_DENIAL,
  'a `claude --agent` MAIN session carries agent_type without agent_id and must stay walled',
);

// GIVEN an armed wall, WHEN neither agent key is present, THEN the call is DENIED (fail-safe).
check(
  '03-plain-main-session-is-walled',
  runGuard(stdin(ARMED, {})),
  WRITE_DENIAL,
  'a plain main session carries no agent keys and must be walled',
);

// GIVEN an armed wall and an agent_type-only main session, WHEN Bash is used,
// THEN the balanced Bash classifier still applies — the discriminator does not bypass it.
check(
  '04-agent-type-only-main-session-bash-is-classified',
  runGuard(stdin(ARMED, { agent_type: 'reviewer', tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/nope' } })),
  BASH_DENIAL,
  'mutating Bash from a --agent main session must be denied by the balanced classifier',
);

// GIVEN an armed wall and an agent_type-only main session, WHEN an always-allowed tool is used,
// THEN it passes — the wall discriminates by tool, not by punishing the session.
check(
  '05-agent-type-only-main-session-keeps-read-tools',
  runGuard(stdin(ARMED, { agent_type: 'reviewer', tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } })),
  PASS_THROUGH,
  'Read stays allowed in a walled main session',
);

// GIVEN a disarmed wall, WHEN a main session writes, THEN the guard short-circuits before
// any agent-key inspection.
check(
  '06-disarmed-wall-short-circuits',
  runGuard(stdin(DISARMED, {})),
  PASS_THROUGH,
  'hard=false must no-op regardless of agent keys',
);

// GIVEN no manager directory, WHEN a main session writes, THEN wall not installed and guard no-ops.
// The ONE pass-through for an unreadable wall state; fail-closed case: 38/39.
check(
  '07-manager-never-installed-is-unarmed',
  runGuard(stdin(join(BASE, 'no-such-project'), {})),
  PASS_THROUGH,
  'no .claude/brewtools/manager directory means the wall was never installed',
);

// GIVEN malformed stdin, WHEN the guard runs, THEN it fails CLOSED.
// REGRESSION (BT-F01): unparseable payload -> agent_id unknown; allowing would open the wall on it.
check(
  '08-malformed-stdin-fails-closed',
  runGuard('{not json'),
  PARSE_DENIAL,
  'an unparseable PreToolUse payload must deny, not pass through',
);

// ---- BT-F01 vector A — state resolved from the project root, never raw cwd -------------

// REGRESSION: with `join(cwd, '.claude/…')` the state file was invisible from any nested
// directory, so EVERY tool passed at EVERY level. Pre-fix this returned {} (bypass).
check(
  '09-vectorA-nested-cwd-is-walled',
  runGuard(stdin(ARMED_NESTED, {})),
  WRITE_DENIAL,
  'a nested cwd must resolve the same armed state as the project root',
);

check(
  '10-vectorA-nested-cwd-strict-bash-is-walled',
  runGuard(stdin(join(STRICT, 'nested'), { tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })),
  STRICT_BASH_DENIAL,
  'vector A was level-independent: rm -rf / passed at strict from a nested cwd',
);

check(
  '11-vectorA-claude-project-dir-wins-over-cwd',
  runGuard(stdin('/', {}), ARMED),
  WRITE_DENIAL,
  'CLAUDE_PROJECT_DIR is the first step of the canonical root recipe',
);

// ---- BT-F01 vector B — self-exempt anchored on the ABSOLUTE installed helper ----------

// REGRESSION: the anchor was a tail regex, so any planted */hooks/lib/manager-state.mjs was
// exempt — and the check ran before the level branch, so it disarmed the wall at strict too.
check(
  '12-vectorB-planted-helper-is-not-exempt',
  runGuard(stdin(STRICT, { tool_name: 'Bash', tool_input: { command: `node ${EVIL_HELPER} set hard=false` } })),
  STRICT_BASH_DENIAL,
  'only the helper shipped with this project may run the state CLI',
);

check(
  '13-vectorB-installed-helper-stays-exempt',
  runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: `node ${ARMED_HELPER} set hard=false` } })),
  PASS_THROUGH,
  'the documented exit path must keep working at balanced',
);

check(
  '14-vectorB-installed-helper-exempt-at-strict',
  runGuard(stdin(STRICT, { tool_name: 'Bash', tool_input: { command: `node ${STRICT_HELPER} set hard=false` } })),
  PASS_THROUGH,
  'the documented exit path must keep working at strict',
);

// ---- BT-F01 vector C — strict binary allowlist + per-binary flag vetting ---------------

// REGRESSION: `env` was both whitelisted and a universal exec wrapper, so `env <anything>`
// ran; `rg --pre <script>` executed a script through an allowlisted binary. Both returned {}.
check(
  '15-vectorC-env-wrapper-is-denied',
  runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: 'env node /tmp/evil.js' } })),
  BASH_DENIAL,
  'no allowlisted binary may wrap another executable',
);

check(
  '16-vectorC-rg-pre-flag-is-denied',
  runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: 'rg --pre /tmp/evil.sh pattern .' } })),
  BASH_DENIAL,
  'rg --pre executes an arbitrary preprocessor binary',
);

check(
  '17-vectorC-git-c-flag-is-denied',
  runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: 'git -c core.pager=/tmp/evil.sh log' } })),
  BASH_DENIAL,
  'git -c can point a config hook at an arbitrary binary',
);

check(
  '18-vectorC-readonly-chain-still-allowed',
  runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: 'git status && rg -n pattern .' } })),
  PASS_THROUGH,
  'the allowlist must not break genuinely read-only inspection at balanced',
);

// ---- vet-body coverage — the git/gh/find vetters, DENY side ---------------------------
// REGRESSION: vector-C tested WRAPPER cases only; each line below was ALLOWED through the real hook pre-fix.

function bash(cmd) {
  return runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: cmd } }));
}

check(
  '19-git-output-equals-flag-is-denied',
  bash('git diff --output=/tmp/pwned HEAD~1'),
  BASH_DENIAL,
  'git --output= writes an arbitrary file through a read subcommand',
);

check(
  '20-git-output-space-form-is-denied',
  bash('git log --output /tmp/pwned'),
  BASH_DENIAL,
  'the space form of --output is a separate token and must be vetted the same',
);

check(
  '21-git-textconv-is-denied',
  bash('git show --textconv HEAD'),
  BASH_DENIAL,
  'git --textconv runs a configured filter binary',
);

check(
  '22-git-branch-delete-is-denied',
  bash('git branch -D main'),
  BASH_DENIAL,
  'git branch is not a read subcommand — -D destroys a branch',
);

check(
  '23-git-branch-create-is-denied',
  bash('git branch newbranch'),
  BASH_DENIAL,
  'a bare positional argument to git branch creates a branch',
);

check(
  '24-git-branch-edit-description-is-denied',
  bash('git branch --edit-description'),
  BASH_DENIAL,
  'git branch --edit-description spawns GIT_EDITOR, i.e. arbitrary exec',
);

check(
  '25-gh-write-verb-laundered-by-value-is-denied',
  bash('gh issue comment 1 --body list'),
  BASH_DENIAL,
  'a read verb appearing as an argument VALUE must not authorise `gh issue comment`',
);

check(
  '26-gh-pr-close-laundered-by-value-is-denied',
  bash('gh pr close 1 --comment list'),
  BASH_DENIAL,
  'the gh vet is positional: args[0]/args[1] only',
);

check(
  '27-gh-api-delete-laundered-by-trailing-value-is-denied',
  bash('gh api --method DELETE /repos/o/r list'),
  BASH_DENIAL,
  'a trailing `list` must not launder an HTTP DELETE through gh api',
);

check(
  '28-find-fprint0-is-denied',
  bash('find . -fprint0 /tmp/pwned'),
  BASH_DENIAL,
  'GNU find -fprint0 writes a file — absent on macOS, live in CI and containers',
);

// ---- vet-body coverage — the ALLOW side, equally load-bearing --------------------------
// Legitimate reads that must survive the tightened vetters.

check(
  '29-git-branch-list-still-allowed',
  bash('git branch --list'),
  PASS_THROUGH,
  'git branch --list is a pure listing and allowed before the fix',
);

check(
  '30-git-branch-show-current-still-allowed',
  bash('git branch --show-current'),
  PASS_THROUGH,
  'git branch --show-current reads the checked-out branch name',
);

check(
  '31-git-status-still-allowed',
  bash('git status'),
  PASS_THROUGH,
  'the most common read subcommand must not regress',
);

check(
  '32-gh-run-list-still-allowed',
  bash('gh run list -L 5'),
  PASS_THROUGH,
  'gh <group> <read-verb> with flags is the normal CI inspection shape',
);

check(
  '33-gh-pr-view-still-allowed',
  bash('gh pr view 12'),
  PASS_THROUGH,
  'a positional id after a read verb must stay allowed',
);

check(
  '34-gh-workflow-view-json-still-allowed',
  bash('gh workflow view x --json state'),
  PASS_THROUGH,
  'flag values after a read verb must not affect the positional decision',
);

check(
  '35-gh-auth-status-still-allowed',
  bash('gh auth status'),
  PASS_THROUGH,
  'gh auth status is a read verb in args[1]',
);

// ---- BT-F01 vector D — MCP classified on the tool segment after the second `__` --------

// REGRESSION: the verb regexes scanned the whole tool name, so a server literally named
// `search` or `getops` laundered any operation into the read-only bucket.
check(
  '36-vectorD-server-name-cannot-launder-verb',
  verdict(runGuard(stdin(ARMED, { tool_name: 'mcp__search__destroy_all', tool_input: {} }))),
  'deny',
  'the server segment must never decide the classification',
);

check(
  '37-vectorD-readonly-mcp-still-allowed',
  runGuard(stdin(ARMED, { tool_name: 'mcp__github__get_file', tool_input: {} })),
  PASS_THROUGH,
  'a read-only verb in the tool segment stays allowed at balanced',
);

// ---- fail-closed state handling --------------------------------------------------------

check(
  '38-broken-state-denies-bash',
  runGuard(stdin(BROKEN, { tool_name: 'Bash', tool_input: { command: 'ls' } })),
  denial(`Hard wall: manager state at ${BROKEN_STATE} is missing or unreadable, so the guard denies by default.`),
  'an installed manager with unreadable state must deny, not open the wall',
);

check(
  '39-broken-state-denies-write',
  runGuard(stdin(BROKEN, {})),
  WRITE_DENIAL,
  'a deleted state.json must not disarm the wall',
);

check(
  '40-broken-state-keeps-subagents-free',
  runGuard(stdin(BROKEN, { agent_id: 'sub-9' })),
  PASS_THROUGH,
  'fail-closed applies to the main session only; subagents stay free by design',
);

// ---- BT-F16 — uninstall ordering, run against the block SHIPPED in SKILL.md -------------
// Step-2 node program extracted verbatim from the skill: a documented-block regression fails here.

const SKILL_MD = join(HERE, '..', 'SKILL.md');
const NODE_E = 'node --input-type=module -e "';

function uninstallScript() {
  const md = readFileSync(SKILL_MD, 'utf8');
  const from = md.indexOf(NODE_E, md.indexOf('**EXECUTE step 2**'));
  const to = md.indexOf('\n"', from);
  return md.slice(from + NODE_E.length, to);
}

/** A project that looks exactly like `install` left it: entry registered, both files copied. */
function makeInstalledProject(name) {
  const proj = join(BASE, name);
  const mdir = join(proj, '.claude', 'brewtools', 'manager');
  mkdirSync(mdir, { recursive: true });
  writeFileSync(join(mdir, 'state.json'), JSON.stringify({ hard: false, level: 'balanced' }));
  writeFileSync(join(mdir, 'hardmode-guard.mjs'), '// copied guard\n');
  writeFileSync(join(mdir, 'manager-state.mjs'), '// copied helper\n');
  writeFileSync(join(proj, '.claude', 'settings.local.json'), JSON.stringify({
    permissions: { allow: ['Read(**)'] },
    hooks: {
      PreToolUse: [{
        matcher: '*',
        hooks: [{ type: 'command', command: `node "${join(mdir, 'hardmode-guard.mjs')}" # brewtools-manager-guard`, timeout: 5, onFailure: 'block' }],
      }],
    },
  }, null, 2));
  return proj;
}

function runUninstall(proj, tag) {
  const file = join(BASE, `uninstall-${tag}.mjs`);
  writeFileSync(file, uninstallScript().split("'${ROOT}'").join(JSON.stringify(proj)));
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 8000 });
  const settings = join(proj, '.claude', 'settings.local.json');
  const raw = existsSync(settings) ? readFileSync(settings, 'utf8') : '';
  return {
    code: r.status,
    out: safeParse(r.stdout || ''),
    stderr: r.stderr || '',
    tagLeft: raw.includes('brewtools-manager-guard'),
    permissionsKept: raw.includes('Read(**)'),
    guardOnDisk: existsSync(join(proj, '.claude', 'brewtools', 'manager', 'hardmode-guard.mjs')),
    helperOnDisk: existsSync(join(proj, '.claude', 'brewtools', 'manager', 'manager-state.mjs')),
  };
}

const U1 = makeInstalledProject('uninstall-happy');
const r1 = runUninstall(U1, 'happy');
check(
  '41-uninstall-deregisters-then-deletes',
  { code: r1.code, deregistered: r1.out.deregistered, guardDeleted: r1.out.guardDeleted, helperDeleted: r1.out.helperDeleted, tagLeft: r1.tagLeft, permissionsKept: r1.permissionsKept },
  { code: 0, deregistered: true, guardDeleted: true, helperDeleted: true, tagLeft: false, permissionsKept: true },
  'a clean uninstall removes the entry, then both files, and preserves unrelated settings',
);

const r2 = runUninstall(U1, 'idempotent');
check(
  '42-uninstall-is-idempotent',
  { code: r2.code, deregistered: r2.out.deregistered, guardOnDisk: r2.guardOnDisk, helperOnDisk: r2.helperOnDisk },
  { code: 0, deregistered: false, guardOnDisk: false, helperOnDisk: false },
  'a second uninstall is a successful no-op, not an error and not a re-delete',
);

const U3 = makeInstalledProject('uninstall-corrupt');
writeFileSync(join(U3, '.claude', 'settings.local.json'), '{ this is not json');
const r3 = runUninstall(U3, 'corrupt');
check(
  '43-uninstall-aborts-on-corrupt-settings-before-any-delete',
  { code: r3.code, guardOnDisk: r3.guardOnDisk, helperOnDisk: r3.helperOnDisk, named: r3.stderr.includes('settings.local.json') },
  { code: 1, guardOnDisk: true, helperOnDisk: true, named: true },
  'a malformed settings file must abort by path+reason with both files untouched',
);

// The brick case: files deleted while the entry survives. Deletion is made to fail by
// stripping write permission from the manager directory.
const U4 = makeInstalledProject('uninstall-delete-fails');
chmodSync(join(U4, '.claude', 'brewtools', 'manager'), 0o500);
const r4 = runUninstall(U4, 'delete-fails');
chmodSync(join(U4, '.claude', 'brewtools', 'manager'), 0o700);
check(
  '44-uninstall-restores-registration-when-a-delete-fails',
  { code: r4.code, tagLeft: r4.tagLeft, guardOnDisk: r4.guardOnDisk, helperOnDisk: r4.helperOnDisk },
  { code: 1, tagLeft: true, guardOnDisk: true, helperOnDisk: true },
  'a failed delete must roll the settings entry back — never leave a half-guarded project',
);

// REGRESSION: global purge deleted only full.md; the other modes' overrides kept changing the codewords.
function runPurge(proj, scope, cfg) {
  const md = readFileSync(SKILL_MD, 'utf8');
  const from = md.indexOf(NODE_E, md.indexOf('### purge'));
  const body = md.slice(from + NODE_E.length, md.indexOf('\n"', from))
    .split('${BT_ROOT}').join(join(HERE, '..', '..', '..'))
    .split("'${ROOT}'").join(JSON.stringify(proj)).split("'SCOPE'").join(JSON.stringify(scope));
  const file = join(BASE, `purge-${scope}.mjs`);
  writeFileSync(file, body);
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 8000, env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
  return { code: r.status, out: safeParse(r.stdout || '') };
}
const P_CFG = join(BASE, 'purge-cfg');
const P_PDIR = join(P_CFG, 'manager', 'prompts');
mkdirSync(P_PDIR, { recursive: true });
for (const m of [...VALID_MODES, 'notes']) writeFileSync(join(P_PDIR, `${m}.md`), `OVERRIDE ${m}`);
const pProject = runPurge(makeProject('purge-project', {}), 'project', P_CFG);
const pGlobal = runPurge(makeProject('purge-global', {}), 'global', P_CFG);
check(
  '44a-purge-global-removes-every-mode-override-and-keeps-foreign-files',
  { projectCode: pProject.code, projectGlobal: pProject.out.globalPrompts, code: pGlobal.code,
    removed: pGlobal.out.globalPrompts, kept: pGlobal.out.globalKept, left: readdirSync(P_PDIR) },
  { projectCode: 0, projectGlobal: [], code: 0,
    removed: [...VALID_MODES].map(m => join(P_PDIR, `${m}.md`)), kept: ['notes.md'], left: ['notes.md'] },
  'global purge deletes the override of each VALID_MODES mode, never an unknown file; project scope leaves global alone',
);

// REGRESSION: uninstall + purge left `.claude/settings.local.json` = {} and `.claude/` in a project that had neither.
function onlyGuardSettings(proj, extra) {
  const file = join(proj, '.claude', 'settings.local.json');
  const { hooks } = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ hooks, ...extra }));
  return file;
}
const E1 = makeInstalledProject('empty-after-uninstall');
onlyGuardSettings(E1, {});
const e1 = runUninstall(E1, 'empty');
const E2 = makeInstalledProject('empty-after-purge');
writeFileSync(join(E2, '.claude', 'brewtools', 'manager', 'state.json'), JSON.stringify({ hard: false, level: 'balanced', todoToolsAdded: true }));
const e2settings = onlyGuardSettings(E2, { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } });
const e2u = runUninstall(E2, 'purge-prep');
const e2prepLeft = existsSync(e2settings);
const e2 = runPurge(E2, 'project', P_CFG);
check(
  '44b-uninstall-and-purge-delete-what-they-emptied',
  { uninstallCode: e1.code, uninstallSettingsLeft: existsSync(join(E1, '.claude', 'settings.local.json')),
    prepCode: e2u.code, prepSettingsLeft: e2prepLeft,
    purgeCode: e2.code, settingsRemoved: e2.out.settingsRemoved, todoKeyRemoved: e2.out.todoKeyRemoved, claudeDirLeft: existsSync(join(E2, '.claude')) },
  { uninstallCode: 0, uninstallSettingsLeft: false,
    prepCode: 0, prepSettingsLeft: true,
    purgeCode: 0, settingsRemoved: true, todoKeyRemoved: true, claudeDirLeft: false },
  'a settings file left {} is deleted, not rewritten; purge then removes the empty .claude/',
);

// REGRESSION: the root recipe tried unbraced $CLAUDE_PROJECT_DIR (unset in the Bash tool) -> git
// toplevel, so a session started in a subdirectory got its wall written where settings never load.
const md45 = readFileSync(SKILL_MD, 'utf8');
const RECIPE = 'ROOT="${CLAUDE_PROJECT_DIR}"\n[ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null)\n';
const R_REPO = join(BASE, 'root-repo');
mkdirSync(join(R_REPO, 'sub'), { recursive: true });
spawnSync('git', ['init', '-q', R_REPO]);
function runRecipe(text, cwd) {
  const file = join(BASE, `recipe-${passed + failed}.sh`);
  writeFileSync(file, `${text}printf %s "$ROOT"\n`);
  const env = { ...process.env }; delete env.CLAUDE_PROJECT_DIR;
  return spawnSync('bash', [file], { cwd, env, encoding: 'utf8' }).stdout;
}
check(
  '44c-root-recipe-is-the-session-project-dir',
  { recipes: md45.split(RECIPE).length - 1, rootLines: (md45.match(/^ROOT=/gm) || []).length, unbraced: md45.includes('$CLAUDE_PROJECT_DIR'),
    substituted: runRecipe(RECIPE.split('${CLAUDE_PROJECT_DIR}').join(join(R_REPO, 'sub')), R_REPO),
    literal: runRecipe(RECIPE, join(R_REPO, 'sub')) },
  { recipes: 7, rootLines: 7, unbraced: false,
    substituted: join(R_REPO, 'sub'),
    literal: realpathSync(R_REPO) },
  'every block resolves ROOT from the load-time session dir, git toplevel only when the token stays literal',
);

// REGRESSION: install/upgrade overwrote an explicit local "0" with "1"; status read "0" as on and
// skipped a layer set to "". Rule = setup-status Phase 1c: highest layer carrying the key decides, by value.
const BT_DIR = join(HERE, '..', '..', '..');
function runShipped(heading, proj, { local, project, user, env, arm } = {}) {
  const cfg = mkdtempSync(join(BASE, 'todo-cfg-'));
  const put = (file, body) => { if (body !== undefined) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(body)); } };
  put(join(proj, '.claude', 'settings.local.json'), local);
  put(join(proj, '.claude', 'settings.json'), project);
  put(join(cfg, 'settings.json'), user);
  const md = readFileSync(SKILL_MD, 'utf8');
  const from = md.indexOf(NODE_E, md.indexOf(heading));
  const body = md.slice(from + NODE_E.length, md.indexOf('\n"', from))
    .split('${BT_ROOT}').join(BT_DIR).split("'${ROOT}'").join(JSON.stringify(proj))
    .split("'${CCVER}'").join("'2.1.296'").split("'${ARM}'").join(arm ? "'true'" : "'false'")
    .replace(/\\([$`"\\])/g, '$1');
  const file = join(BASE, `todo-${passed + failed}-${proj.split('/').pop()}.mjs`);
  writeFileSync(file, body);
  const runEnv = { ...process.env, CLAUDE_CONFIG_DIR: cfg };
  delete runEnv.CLAUDE_CODE_ENABLE_TODO_TOOLS;
  if (env !== undefined) runEnv.CLAUDE_CODE_ENABLE_TODO_TOOLS = env;
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 8000, env: runEnv });
  const after = safeParse(existsSync(join(proj, '.claude', 'settings.local.json')) ? readFileSync(join(proj, '.claude', 'settings.local.json'), 'utf8') : '{}');
  const stateFile = join(proj, '.claude', 'brewtools', 'manager', 'state.json');
  const state = existsSync(stateFile) ? safeParse(readFileSync(stateFile, 'utf8')) : {};
  return { code: r.status, out: safeParse(r.stdout || ''), localKey: after.env ? after.env.CLAUDE_CODE_ENABLE_TODO_TOOLS : undefined, added: state.todoToolsAdded,
    stderr: r.stderr || '', lockLeft: existsSync(join(proj, '.claude', 'settings.local.json.lock')) };
}
const todoInstall = (name, layers) => {
  const r = runShipped('### install', join(BASE, `todo-install-${name}`), layers);
  return { code: r.code, todoTools: r.out.todoTools, localKey: r.localKey ?? 'absent', added: r.added ?? 'absent' };
};
check(
  '44d-install-respects-an-explicit-off-and-adds-only-when-absent-everywhere',
  { localZero: todoInstall('local-zero', { local: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '0' } }, user: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } } }),
    projectEmpty: todoInstall('project-empty', { project: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '' } } }),
    userTrue: todoInstall('user-true', { user: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: 'true' } } }),
    nowhere: todoInstall('nowhere', { env: '0' }) },
  { localZero: { code: 0, todoTools: 'kept off — .claude/settings.local.json sets CLAUDE_CODE_ENABLE_TODO_TOOLS="0", left as is', localKey: '0', added: 'absent' },
    projectEmpty: { code: 0, todoTools: 'kept off — .claude/settings.json sets CLAUDE_CODE_ENABLE_TODO_TOOLS="", left as is', localKey: 'absent', added: 'absent' },
    userTrue: { code: 0, todoTools: 'already on — user settings.json sets CLAUDE_CODE_ENABLE_TODO_TOOLS="true", left as is', localKey: 'absent', added: 'absent' },
    nowhere: { code: 0, todoTools: 'enabled (CC 2.1.296)', localKey: '1', added: true } },
  'a set key is never overwritten ("0" and "" are opt-outs); "1" + provenance only when no settings layer sets it (a shell export loses to settings)',
);

const todoUpgrade = (name, env) => {
  const proj = makeInstalledProject(`todo-upgrade-${name}`);
  const file = join(proj, '.claude', 'settings.local.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...(env ? { env } : {}) }));
  const r = runShipped('### upgrade', proj);
  return { code: r.code, todoTools: r.out.todoTools, localKey: r.localKey ?? 'absent', added: r.added ?? 'absent' };
};
check(
  '44e-upgrade-keeps-a-local-off-and-backfills-a-missing-key',
  { localZero: todoUpgrade('local-zero', { CLAUDE_CODE_ENABLE_TODO_TOOLS: '0' }), missing: todoUpgrade('missing') },
  { localZero: { code: 0, todoTools: 'kept off — .claude/settings.local.json sets CLAUDE_CODE_ENABLE_TODO_TOOLS="0", left as is', localKey: '0', added: 'absent' },
    missing: { code: 0, todoTools: 'enabled (CC 2.1.296)', localKey: '1', added: true } },
  'upgrade follows the install rule: explicit "0" stays, absent key gets "1" with todoToolsAdded',
);

const todoStatus = (name, layers) => {
  const r = runShipped('### status', join(BASE, `todo-status-${name}`), layers);
  return { code: r.code, layer: r.out.todoToolsLayer, value: r.out.todoToolsValue, on: r.out.todoToolsOn };
};
check(
  '44f-status-highest-layer-decides-by-value',
  { localEmpty: todoStatus('local-empty', { local: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '' } }, project: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } } }),
    localZero: todoStatus('local-zero', { local: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '0' } }, user: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' } } }),
    projectTrue: todoStatus('project-true', { project: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: 'TRUE' } } }),
    userZeroOverEnv: todoStatus('user-zero', { user: { env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '0' } }, env: '1' }),
    envOnly: todoStatus('env-only', { env: 'yes' }),
    nowhere: todoStatus('nowhere', {}) },
  { localEmpty: { code: 0, layer: '.claude/settings.local.json', value: '', on: false },
    localZero: { code: 0, layer: '.claude/settings.local.json', value: '0', on: false },
    projectTrue: { code: 0, layer: '.claude/settings.json', value: 'TRUE', on: true },
    userZeroOverEnv: { code: 0, layer: 'user settings.json', value: '0', on: false },
    envOnly: { code: 0, layer: null, value: 'yes', on: true },
    nowhere: { code: 0, layer: null, value: null, on: false } },
  'an "" layer stops the lookup, "0" is off, true/yes are on case-insensitively, settings beat the shell export',
);

// REGRESSION (M1): process.exit inside the locked try skips finally; the lock leaked and the next
// manager command within 30 s aborted with a false "held by another setup skill".
const LK_NONE = join(BASE, 'lock-upgrade-uninstalled');
mkdirSync(LK_NONE, { recursive: true });
const lkNone = runShipped('### upgrade', LK_NONE);
const lkNext = runShipped('### install', LK_NONE);
const LK_BAD = makeInstalledProject('lock-upgrade-invalid-json');
const BAD_JSON = '{ not json';
writeFileSync(join(LK_BAD, '.claude', 'settings.local.json'), BAD_JSON);
let badJsonMsg = '';
try { JSON.parse(BAD_JSON); } catch (e) { badJsonMsg = e.message; }
const lkBad = runShipped('### upgrade', LK_BAD);
const LK_THROW = makeInstalledProject('lock-upgrade-throws');
chmodSync(join(LK_THROW, '.claude', 'brewtools', 'manager', 'hardmode-guard.mjs'), 0o400);
const lkThrow = runShipped('### upgrade', LK_THROW);
chmodSync(join(LK_THROW, '.claude', 'brewtools', 'manager', 'hardmode-guard.mjs'), 0o600);
const lkThrowNext = runShipped('### upgrade', LK_THROW);
check(
  '44g-an-aborted-or-throwing-upgrade-releases-the-settings-lock',
  { none: { code: lkNone.code, stderr: lkNone.stderr, lockLeft: lkNone.lockLeft },
    next: { code: lkNext.code, stderr: lkNext.stderr, lockLeft: lkNext.lockLeft, armed: lkNext.out.armed },
    bad: { code: lkBad.code, stderr: lkBad.stderr, lockLeft: lkBad.lockLeft },
    thrown: { code: lkThrow.code, lockLeft: lkThrow.lockLeft },
    thrownNext: { code: lkThrowNext.code, stderr: lkThrowNext.stderr, lockLeft: lkThrowNext.lockLeft } },
  { none: { code: 1, stderr: 'ABORT: the wall is not installed in this project — run install instead\n', lockLeft: false },
    next: { code: 0, stderr: '', lockLeft: false, armed: false },
    bad: { code: 1, stderr: `ABORT: ${join(LK_BAD, '.claude', 'settings.local.json')} unreadable or invalid JSON (${badJsonMsg}) — fix it by hand; nothing was written\n`, lockLeft: false },
    thrown: { code: 1, lockLeft: false },
    thrownNext: { code: 0, stderr: '', lockLeft: false } },
  'every exit path frees settings.local.json.lock, so the next command never reports "held by another setup skill"',
);

// REGRESSION (m1): install armed state.json and copied the guard BEFORE the steps that could abort.
const fileSet = proj => ['state.json', 'hardmode-guard.mjs', 'manager-state.mjs']
  .filter(f => existsSync(join(proj, '.claude', 'brewtools', 'manager', f)));
const AR_BAD = join(BASE, 'arm-last-invalid-json');
mkdirSync(join(AR_BAD, '.claude'), { recursive: true });
writeFileSync(join(AR_BAD, '.claude', 'settings.local.json'), BAD_JSON);
const arBad = runShipped('### install', AR_BAD, { arm: true });
const AR_W = join(BASE, 'arm-last-write-fails');
const arTmp = join(AR_W, '.claude', 'settings.local.json.tmp');
mkdirSync(arTmp, { recursive: true });
const arW = runShipped('### install', AR_W, { arm: true });
const arWFiles = fileSet(AR_W);
const arWDir = existsSync(join(AR_W, '.claude', 'brewtools'));
rmSync(arTmp, { recursive: true });
const arOk = runShipped('### install', AR_W, { arm: true });
const arOkFile = join(AR_W, '.claude', 'brewtools', 'manager', 'state.json');
const arOkState = existsSync(arOkFile) ? safeParse(readFileSync(arOkFile, 'utf8')) : {};
check(
  '44h-install-arms-last-and-leaves-nothing-behind-on-failure',
  { bad: { code: arBad.code, stderr: arBad.stderr, lockLeft: arBad.lockLeft, files: fileSet(AR_BAD), managerDir: existsSync(join(AR_BAD, '.claude', 'brewtools')) },
    write: { code: arW.code, stderr: arW.stderr, lockLeft: arW.lockLeft, files: arWFiles, managerDir: arWDir },
    ok: { code: arOk.code, armed: arOk.out.armed, newlyRegistered: arOk.out.newlyRegistered, hard: arOkState.hard, files: fileSet(AR_W) } },
  { bad: { code: 1, stderr: `ABORT: ${join(AR_BAD, '.claude', 'settings.local.json')} unreadable or invalid JSON (${badJsonMsg}) — fix it by hand; nothing was written\n`, lockLeft: false, files: [], managerDir: false },
    write: { code: 1, stderr: `ABORT: install failed (EISDIR: illegal operation on a directory, open '${arTmp}') — removed the files this run created; the wall is not armed\n`, lockLeft: false, files: [], managerDir: false },
    ok: { code: 0, armed: true, newlyRegistered: true, hard: true, files: ['state.json', 'hardmode-guard.mjs', 'manager-state.mjs'] } },
  'a failed install writes no hard:true and no guard copies; the same install succeeds and arms once the fault is gone',
);

// ---- BT-V2-H01 — MCP token classification is default-deny ------------------------------
// REGRESSION: unanchored read-regex minus write-denylist ALLOWED `search_and_replace` at balanced; now per-token, unknown denies.

function mcp(tool, proj = ARMED) {
  return verdict(runGuard(stdin(proj, { tool_name: tool, tool_input: {} })));
}

for (const [n, tool, why] of [
  ['45', 'mcp__codeseeker__search_and_replace', 'a read verb must not launder the write half of a compound name'],
  ['46', 'mcp__x__search_replace', 'the same compound without a connector token'],
  ['47', 'mcp__x__list_and_rename', '`rename` is unknown to the safe set and therefore denied'],
  ['48', 'mcp__x__get_and_apply_patch', '`apply`/`patch` are unknown and deny without being enumerated'],
]) {
  check(`${n}-compound-write-verb-is-denied`, mcp(tool), 'deny', why);
}

for (const [n, tool, why] of [
  ['49', 'mcp__semble_code__search', 'the plain read verb must survive the tightened classifier'],
  ['50', 'mcp__semble_code__find_related', 'a read verb plus a neutral noun stays allowed'],
  ['51', 'mcp__plugin_context7_context7__query-docs', 'hyphen-split tokens of a plugin-scoped server'],
  ['52', 'mcp__notion__notion-search', 'the server name repeated inside the tool segment is dropped, not judged'],
  ['53', 'mcp__notion__notion-fetch', 'same, for the second real notion read tool'],
]) {
  check(`${n}-readonly-mcp-allowed`, mcp(tool), 'allow', why);
}

check(
  '54-strict-denies-readonly-mcp',
  mcp('mcp__github__get_file', STRICT),
  'deny',
  'strict denies MCP however read-only the name looks (sole exception: check 73)',
);

check(
  '55-malformed-mcp-name-is-denied',
  mcp('mcp__server'),
  'deny',
  'a name with no tool segment has nothing to classify and must deny',
);

// ---- the mcpAllow escape hatch ---------------------------------------------------------

// THIRD entry `mcp__*` is malformed (rejected by manager-state.mjs); old bare `startsWith('mcp__')`
// filter (BT-V2-M03) honoured it as a global wildcard.
const MCP_ALLOW = makeProject('mcp-allow', {
  hard: true,
  level: 'balanced',
  mcpAllow: ['mcp__codeseeker__search_and_replace', 'mcp__trusted__*', 'mcp__*'],
});
const MCP_ALLOW_STRICT = makeProject('mcp-allow-strict', {
  hard: true,
  level: 'strict',
  mcpAllow: ['mcp__trusted__*'],
});

// REGRESSION (was PASS pre-fix as an allow-only assertion, i.e. no guard at all): the exact
// name must be honoured AND the bogus `mcp__*` sibling entry must launder nothing.
check(
  '56-mcpAllow-honours-exact-name-without-honouring-a-bogus-entry',
  { exact: mcp('mcp__codeseeker__search_and_replace', MCP_ALLOW), viaBogusWildcard: mcp('mcp__anything__destroy_all', MCP_ALLOW) },
  { exact: 'allow', viaBogusWildcard: 'deny' },
  'an exact scoped name overrides the heuristic; a malformed `mcp__*` entry is dropped, not treated as allow-all',
);

check(
  '57-mcpAllow-server-wildcard-is-allowed',
  mcp('mcp__trusted__delete_everything', MCP_ALLOW),
  'allow',
  'a `mcp__server__*` prefix allows that whole server at balanced',
);

check(
  '58-mcpAllow-does-not-apply-at-strict',
  mcp('mcp__trusted__get_file', MCP_ALLOW_STRICT),
  'deny',
  'the escape hatch is balanced-only by design',
);

check(
  '59-mcpAllow-unlisted-name-still-denied',
  mcp('mcp__other__search_and_replace', MCP_ALLOW),
  'deny',
  'the list is exact — it must not widen to neighbouring servers',
);

// The key is optional and unknown to the older shape: reading it must not look like a
// corrupt state, which would deny EVERY tool with the broken-state reason.
check(
  '60-mcpAllow-key-does-not-trip-broken-state',
  runGuard(stdin(MCP_ALLOW, { tool_name: 'Bash', tool_input: { command: 'git status' } })),
  PASS_THROUGH,
  'a state carrying mcpAllow is a valid state — read-only Bash still passes at balanced',
);

check(
  '61-malformed-mcpAllow-degrades-to-deny-not-broken',
  mcp('mcp__x__write_file', makeProject('mcp-allow-bad', { hard: true, level: 'balanced', mcpAllow: 'mcp__x__*' })),
  'deny',
  'a non-array mcpAllow allows nothing, and still is not a broken state',
);

// ---- BT-V2-M01/M02 — ordinary read tools vs ambiguous verbs ----------------------------
// REGRESSION (M01): default-deny denied read tools whose OBJECT noun was not in the safe set; all seven must stay allowed.
for (const [n, tool, why] of [
  ['62a', 'mcp__github__list_issues', 'issue-tracker listing — read verb plus a domain noun'],
  ['62b', 'mcp__github__get_pull_request', 'multi-noun read name'],
  ['62c', 'mcp__k8s__get_pods', 'cluster read'],
  ['62d', 'mcp__aws__describe_instances', '`describe` is the cloud-API read verb'],
  ['62e', 'mcp__ide__getDiagnostics', 'camelCase hump split, no separators at all'],
  ['62f', 'mcp__memory__read_graph', 'server token `memory` dropped, `read graph` left'],
  ['62g', 'mcp__time__get_current_time', 'the server name repeats inside the tool segment'],
]) {
  check(`${n}-ordinary-read-tool-is-allowed`, mcp(tool), 'allow', why);
}

// REGRESSION (M02): `query`/`resolve` were unconditional read verbs, so `mcp__sqlite__query`
// — arbitrary SQL — was ALLOWED. They now read only when another safe token qualifies them.
for (const [n, tool, why] of [
  ['63a', 'mcp__sqlite__query', 'bare `query` on a DB server executes arbitrary SQL'],
  ['63b', 'mcp__mysql__query', 'same, second DB server'],
  ['63c', 'mcp__postgres__query', 'same, third DB server'],
  ['63d', 'mcp__linear__resolve', '`resolve` closes an issue on a tracker'],
]) {
  check(`${n}-ambiguous-verb-alone-is-denied`, mcp(tool), 'deny', why);
}

// REGRESSION (NEW-1): "qualified by ANY other safe token" fell to one ordinary noun (all four ALLOWED pre-fix);
// only a docs/reference qualifier promotes an ambiguous verb now.
for (const [n, tool, why] of [
  ['63e', 'mcp__sqlite__query_table', '`table` is a neutral object noun, not a docs qualifier — this is arbitrary SQL'],
  ['63f', 'mcp__postgres__query_rows', 'same bypass through `rows`'],
  ['63g', 'mcp__linear__resolve_issue', '`resolve issue` closes the issue — the exact tracker write M02 targeted'],
  ['63h', 'mcp__linear__resolve_all', '`all` must never qualify an ambiguous verb'],
]) {
  check(`${n}-ambiguous-verb-with-a-neutral-noun-is-denied`, mcp(tool), 'deny', why);
}

// REGRESSION (NEW-3): docs-qualifier was a FALLBACK, so any read verb won first (all eight ALLOWED pre-fix);
// now unconditional: one `query`/`resolve` token forces the docs-only remainder.
for (const [n, tool, why] of [
  ['63i', 'mcp__linear__list_and_resolve', '`list` must not re-qualify `resolve` — this closes issues'],
  ['63j', 'mcp__linear__get_and_resolve_all', 'same bypass through `get`'],
  ['63k', 'mcp__linear__search_resolve_all', 'same through `search`, no connector token'],
  ['63l', 'mcp__linear__list_and_query_rows', 'read verb plus ambiguous verb plus a neutral noun'],
  ['63m', 'mcp__x__get_query_docs', 'a real docs qualifier still does not license the extra read verb'],
  ['63n', 'mcp__x__resolve_library_id_get', 'trailing read verb, otherwise the exact context7 name'],
  ['63o', 'mcp__x__read_docs_query_table', 'read verb + qualifier + ambiguous verb + neutral noun'],
  ['63p', 'mcp__x__query_list', 'two verbs, one ambiguous, no qualifier at all'],
]) {
  check(`${n}-read-verb-does-not-requalify-an-ambiguous-verb`, mcp(tool), 'deny', why);
}

// REGRESSION (NEW-4): server-name subtraction ran BEFORE classification, so an action-named server erased
// its own write verb and the residue read as clean (all eight ALLOWED pre-fix).
for (const [n, tool, why] of [
  ['63q', 'mcp__email-send__send_and_get_status', '`send` survives being half of the server name'],
  ['63r', 'mcp__delete__list_and_delete', 'the server may not delete `delete` from its own tool name'],
  ['63s', 'mcp__exec__get_and_exec', 'same for arbitrary execution'],
  ['63t', 'mcp__deploy__deploy_status', 'the server name repeated as a prefix is still a write verb'],
  ['63u', 'mcp__create__get_and_create_issue', 'creation on an issue tracker'],
  ['63v', 'mcp__write__read_and_write_file', '`read` must not launder the `write` half'],
  ['63w', 'mcp__run-shell__get_and_run_shell', 'both write tokens sit in the server name'],
  ['63x', 'mcp__SEND__get_and_SEND', 'tokens are lowercased before the write gate, so case buys nothing'],
]) {
  check(`${n}-server-name-cannot-erase-its-own-write-verb`, mcp(tool), 'deny', why);
}

// Adversarial probes on the NEW-4 rule itself: more action-named servers, write verbs reachable
// only through a camelCase hump or a hyphen, and degenerate segments.
check(
  '63y-write-verb-anywhere-in-the-tool-segment-denies',
  {
    push: mcp('mcp__push__get_and_push'),
    sync: mcp('mcp__sync__list_and_sync'),
    patch: mcp('mcp__patch__get_patch_status'),
    drop: mcp('mcp__drop__list_and_drop_table'),
    restart: mcp('mcp__restart__get_and_restart_service'),
    camel: mcp('mcp__ide__getAndDeleteFile'),
    hyphen: mcp('mcp__notion__notion-delete'),
    dotted: mcp('mcp__set__get.set.config'),
    docsQualified: mcp('mcp__delete__resolve-library-id-delete'),
    wholeNameIsServer: mcp('mcp__deploy__deploy'),
  },
  {
    push: 'deny', sync: 'deny', patch: 'deny', drop: 'deny', restart: 'deny',
    camel: 'deny', hyphen: 'deny', dotted: 'deny', docsQualified: 'deny', wholeNameIsServer: 'deny',
  },
  'a named write verb denies regardless of where it appears or what the server is called',
);

check(
  '63z-degenerate-mcp-segments-deny',
  {
    emptyTool: mcp('mcp__srv__'),
    emptyServer: mcp('mcp____get'),
    separatorsOnly: mcp('mcp__srv__--'),
    serverOnlyResidue: mcp('mcp__search__search'),
  },
  { emptyTool: 'deny', emptyServer: 'deny', separatorsOnly: 'deny', serverOnlyResidue: 'deny' },
  'an empty or fully-subtracted tool segment has nothing left to classify',
);

check(
  '64-ambiguous-verb-qualified-still-reads',
  {
    docs: mcp('mcp__x__query-docs'),
    scopedDocs: mcp('mcp__plugin_context7_context7__query-docs'),
    lib: mcp('mcp__plugin_context7_context7__resolve-library-id'),
    // The whole residual surface: tokens drawn ONLY from {query,resolve} + the 5 qualifiers.
    residual: mcp('mcp__x__resolve_query_docs'),
  },
  { docs: 'allow', scopedDocs: 'allow', lib: 'allow', residual: 'allow' },
  'a docs/reference qualifier is the documentation read case the ambiguous verbs exist for',
);

// A docs qualifier must not launder a name that ALSO carries an ordinary noun, and a server
// called `docs` must not qualify its own tool (server tokens are dropped before classifying).
check(
  '64b-docs-qualifier-does-not-launder-a-mixed-name',
  {
    mixed: mcp('mcp__sqlite__query_docs_table'),
    viaServerName: mcp('mcp__docs__query'),
    trailingWrite: mcp('mcp__x__resolve-library-id-delete'),
  },
  { mixed: 'deny', viaServerName: 'deny', trailingWrite: 'deny' },
  'the qualifier set only reads when it is the whole remainder of the name',
);

// REGRESSION (M03): guard mcpAllow filter and helper CLI speak ONE grammar; pre-fix guard accepted
// `mcpAllow=mcp__*` (self-exempt Bash) and a `mcp__*` state entry that manager-state.mjs rejected.
const helperAccepts = (pair) => { try { parseCliArgs(['set', pair]); return true; } catch { return false; } };
const guardAccepts = (pair) => verdict(
  runGuard(stdin(ARMED, { tool_name: 'Bash', tool_input: { command: `node ${ARMED_HELPER} set ${pair}` } }))
) === 'allow';

for (const [n, pair, expected, why] of [
  ['65a', 'mcpAllow=mcp__srv__tool', true, 'a well-formed scoped name is settable through the self-exempt CLI'],
  ['65b', 'mcpAllow=mcp__*', false, 'a global wildcard is not a scoped name and must be refused on both sides'],
]) {
  check(
    `${n}-state-cli-grammar-matches-the-helper`,
    { guard: guardAccepts(pair), helper: helperAccepts(pair) },
    { guard: expected, helper: expected },
    why,
  );
}

check(
  '66-global-wildcard-in-state-allows-nothing',
  mcp('mcp__anything__destroy_all', makeProject('mcp-allow-star', { hard: true, level: 'balanced', mcpAllow: ['mcp__*'] })),
  'deny',
  '`{"mcpAllow":["mcp__*"]}` is malformed and must not become an allow-all',
);

// The residual cost of default-deny is an unknown domain NOUN, so the message must name
// that cause and the remedy — otherwise the user reads "write verb" and gives up.
const unknownNounDeny = denyReason(runGuard(stdin(ARMED, { tool_name: 'mcp__x__get_widgets', tool_input: {} })));
check(
  '67-deny-message-points-at-the-noun-and-at-mcpAllow',
  { noun: /noun/.test(unknownNounDeny), hatch: unknownNounDeny.includes('mcpAllow') },
  { noun: true, hatch: true },
  'an unrecognised noun denies by design; the message must say so and name mcpAllow as the fix',
);

// GIVEN an active task-board prompt and either HARD level, WHEN the main session manages
// its session timer, THEN the exact runtime tools pass while unlisted tools still deny.
const taskId = 'T-TOOLS-ANTI-DRIFT';
const cronReference = readFileSync(join(HERE, '..', '..', 'task-board-setup', 'references', '11-methodology-cron.md'), 'utf8');
const promptTemplate = cronReference.match(/^> (Anti-drift tick for .*)$/m)[1];
for (const [level, project] of [['balanced', ARMED], ['strict', STRICT]]) {
  let prompt = promptTemplate;
  const values = {
    TASK_ID: taskId, ABSOLUTE_PROJECT_ROOT: project,
    GOAL: 'Keep the authorized task graph current', STARTED_AT: '2026-09-30T12:00:00Z',
    TASK_PATH: join(project, '.claude', 'features', 'progress', `${taskId}.md`),
    SPEC_PATHS_OR_NONE: 'no spec required',
    ACCEPTANCE_EVIDENCE: 'graph and board agree; guard fixtures pass',
    BASE_WORK_UNITS: 'W1 tracker reconcile; W2 reviewer verify; W3 main close and stop timer',
  };
  for (const [token, value] of Object.entries(values)) prompt = prompt.replaceAll(`<${token}>`, value);
  check(
    `cron-${level}-task-board-prompt-resolved`,
    /<TASK_ID>|<ABSOLUTE_PROJECT_ROOT>|<GOAL>|<STARTED_AT>|<TASK_PATH>|<SPEC_PATHS_OR_NONE>|<ACCEPTANCE_EVIDENCE>|<BASE_WORK_UNITS>/.test(prompt),
    false,
    'producer-shaped cron prompt must resolve the concrete task identity, paths, goal and work',
  );
  for (const [tool_name, tool_input] of [
    ['CronCreate', { cron: '0 * * * *', prompt, recurring: true }],
    ['CronList', {}],
    ['CronDelete', { id: 'a1b2c3d4' }],
  ]) {
    check(
      `cron-${level}-${tool_name}-main-session-allowed`,
      runGuard(stdin(project, { agent_type: 'manager', tool_name, tool_input })),
      PASS_THROUGH,
      'task-board timer lifecycle stays in the main session at either HARD level',
    );
  }
  check(
    `cron-${level}-unlisted-schedule-tool-denied`,
    verdict(runGuard(stdin(project, { tool_name: 'CronPause', tool_input: { id: 'a1b2c3d4' } }))),
    'deny',
    'adding three supported cron tools must not allow an unlisted scheduling tool',
  );
  check(
    `cron-${level}-scheduled-main-write-still-denied`,
    runGuard(stdin(project, { agent_type: 'manager' })),
    WRITE_DENIAL,
    'a later scheduled main-session write has no agent_id and remains behind the wall',
  );
}

// ---- X8 — the allow-list against the Claude Code 2.1.296 tool table -----------------------

// Removed tool names (NotebookRead, SlashCommand, BashOutput, KillShell, KillBash, MultiEdit)
// fall to default-deny; Bash and Monitor carry no command here, so they deny as unclassifiable.
const TOOL_TABLE = {
  Read: 'allow', Grep: 'allow', Glob: 'allow', LSP: 'allow',
  Task: 'allow', Agent: 'allow', Skill: 'allow', Workflow: 'allow',
  ListAgents: 'allow', SendMessage: 'allow', SubagentHandback: 'allow',
  EnterWorktree: 'allow', ExitWorktree: 'allow', EnterPlanMode: 'allow', ExitPlanMode: 'allow',
  ToolSearch: 'allow', WaitForMcpServers: 'allow',
  TaskCreate: 'allow', TaskUpdate: 'allow', TaskList: 'allow', TaskGet: 'allow',
  TodoWrite: 'allow', ReportFindings: 'allow',
  CronCreate: 'allow', CronList: 'allow', CronDelete: 'allow', ScheduleWakeup: 'allow',
  TaskStop: 'allow', ListMcpResourcesTool: 'allow', ReadMcpResourceTool: 'allow',
  AskUserQuestion: 'allow',
  Write: 'deny', Edit: 'deny', NotebookEdit: 'deny', WebFetch: 'deny', Artifact: 'deny',
  PowerShell: 'deny', Bash: 'deny', Monitor: 'deny',
  NotebookRead: 'deny', SlashCommand: 'deny', BashOutput: 'deny', KillShell: 'deny',
  KillBash: 'deny', MultiEdit: 'deny', TaskOutput: 'deny',
};
const toolTableAt = (proj) => Object.fromEntries(
  Object.keys(TOOL_TABLE).map(t => [t, verdict(runGuard(stdin(proj, { tool_name: t, tool_input: {} })))]),
);

// GIVEN an armed wall at either level, WHEN the main session calls each built-in tool,
// THEN the verdicts are exactly the table: current orchestration tools pass, removed names do not.
check('68-tool-table-at-balanced', toolTableAt(ARMED), TOOL_TABLE, 'the balanced allow-list is exactly the 2.1.296 orchestration/read set');
check('69-tool-table-at-strict', toolTableAt(STRICT), TOOL_TABLE, 'strict keeps the same always-allowed set; only Bash/WebSearch/MCP rules tighten');

check(
  '70-websearch-is-level-gated',
  { balanced: verdict(runGuard(stdin(ARMED, { tool_name: 'WebSearch', tool_input: { query: 'x' } }))), strict: verdict(runGuard(stdin(STRICT, { tool_name: 'WebSearch', tool_input: { query: 'x' } }))) },
  { balanced: 'allow', strict: 'deny' },
  'WebSearch is the one built-in whose verdict differs by level',
);

// REGRESSION: Monitor sat in the always-allow set although its `command` is a shell command,
// so `Monitor({command: "sh -c ..."})` ran anything in a walled main session.
const monitor = (proj, tool_input) => verdict(runGuard(stdin(proj, { tool_name: 'Monitor', tool_input })));
check(
  '71-monitor-command-gets-the-bash-rule',
  {
    tail: monitor(ARMED, { command: 'tail -f /tmp/app.log' }),
    redirect: monitor(ARMED, { command: 'sh -c "echo x > /tmp/pwned"' }),
    loop: monitor(ARMED, { command: 'while true; do rm -rf /tmp/x; done' }),
    websocket: monitor(ARMED, { ws: { url: 'wss://example.com/feed' } }),
    strictTail: monitor(STRICT, { command: 'tail -f /tmp/app.log' }),
  },
  { tail: 'allow', redirect: 'deny', loop: 'deny', websocket: 'deny', strictTail: 'deny' },
  'a Monitor watch is allowed only where the same Bash command would be',
);

check(
  '72-monitor-deny-names-the-read-only-rule',
  runGuard(stdin(ARMED, { tool_name: 'Monitor', tool_input: { command: 'make watch' } })),
  denial(`Hard wall (balanced): the main session runs only read-only Monitor commands (${READONLY_HINT}), and this one is not provably read-only.`),
  'the Monitor denial carries the same reason and remedy as the Bash one',
);

// GIVEN strict, WHEN the main session searches code through semble, THEN it reads; every
// other MCP tool — a semble write, a look-alike server, an mcpAllow entry — stays denied.
check(
  '73-strict-keeps-read-only-semble-and-nothing-else',
  {
    search: mcp('mcp__semble_code__search', STRICT),
    findRelated: mcp('mcp__semble_code__find_related', STRICT),
    sembleWriteVerb: mcp('mcp__semble_code__delete_index', STRICT),
    sembleUnknownToken: mcp('mcp__semble_code__reindex', STRICT),
    lookAlikeServer: mcp('mcp__semble_code_x__search', STRICT),
    otherServerRead: mcp('mcp__github__get_file', STRICT),
    allowListed: mcp('mcp__trusted__get_file', MCP_ALLOW_STRICT),
  },
  {
    search: 'allow', findRelated: 'allow', sembleWriteVerb: 'deny', sembleUnknownToken: 'deny',
    lookAlikeServer: 'deny', otherServerRead: 'deny', allowListed: 'deny',
  },
  'code search is reading, so strict keeps it; the exception is one server, read-only tools only',
);

check(
  '74-strict-mcp-deny-names-the-exception',
  runGuard(stdin(STRICT, { tool_name: 'mcp__github__get_file', tool_input: {} })),
  denial('Hard wall (strict): MCP tool mcp__github__get_file is blocked in the main session; strict keeps only the read-only mcp__semble_code__* search tools.'),
  'at strict the reason must not advertise mcpAllow, which strict never consults',
);

// GIVEN an armed wall, WHEN agent_id is present but not a non-empty string, THEN the call is
// still a main-session call. A hook-agent verifier id (recorded on 2.1.296) is a subagent.
check(
  '75-agent-id-must-be-a-non-empty-string',
  {
    hookAgentVerifier: verdict(runGuard(stdin(ARMED, { agent_id: 'hook-agent-5148e0ac-4381-4904-831c-94da713e34fc', tool_name: 'StructuredOutput', tool_input: { ok: true } }))),
    nullId: verdict(runGuard(stdin(ARMED, { agent_id: null }))),
    emptyId: verdict(runGuard(stdin(ARMED, { agent_id: '' }))),
    numericId: verdict(runGuard(stdin(ARMED, { agent_id: 7 }))),
  },
  { hookAgentVerifier: 'allow', nullId: 'deny', emptyId: 'deny', numericId: 'deny' },
  'only a real agent id opens the wall; a null or empty key must not disarm it',
);

// ---- onFailure:"block" — the guard may end only with exit 0 (decision JSON) or 2 ---------

const exitOf = (stdinStr) => runGuardRaw(stdinStr).status;
check(
  '76-every-handled-path-exits-0',
  {
    malformedJson: exitOf('{not json'),
    emptyStdin: exitOf(''),
    jsonNull: exitOf('null'),
    brokenState: exitOf(stdin(BROKEN, {})),
    mainDenied: exitOf(stdin(ARMED, {})),
    mainAllowed: exitOf(stdin(ARMED, { tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } })),
    subagent: exitOf(stdin(ARMED, { agent_id: 'sub-1' })),
    disarmed: exitOf(stdin(DISARMED, {})),
    notInstalled: exitOf(stdin(join(BASE, 'no-such-project'), {})),
  },
  {
    malformedJson: 0, emptyStdin: 0, jsonNull: 0, brokenState: 0, mainDenied: 0,
    mainAllowed: 0, subagent: 0, disarmed: 0, notInstalled: 0,
  },
  'with onFailure:"block" any other exit code would block every tool call, main and subagent',
);

check(
  '77-unusable-payloads-deny',
  { emptyStdin: verdict(runGuard('')), jsonNull: verdict(runGuard('null')) },
  { emptyStdin: 'deny', jsonNull: 'deny' },
  'a payload that carries no object cannot prove it is a subagent call',
);

// GIVEN stdout that throws on write, WHEN the guard tries to answer, THEN the fault escapes its
// handler and the last-resort hook turns it into a blocking exit 2 with the reason on stderr.
check(
  '78-fault-outside-the-handler-exits-2',
  runGuardRaw(stdin(ARMED, {}), ['--import', 'data:text/javascript,process.stdout.write=()=>{throw new Error("stdout gone")}']),
  { status: 2, stdout: '', stderr: 'Hard wall: the guard failed outside its handler (stdout gone) and blocks by default.\n' },
  'a crash must be a blocking error on every CLI version, not exit 1',
);

// ---- the off-switch CLI resolves its project from where it is installed, not from cwd -----

// REGRESSION: `node <root>/.claude/brewtools/manager/manager-state.mjs set hard=false` wrote under raw cwd:
// from a subdir/worktree it printed success, made a stray <cwd>/.claude and left the wall armed.
const STATE_MJS = join(HERE, '..', '..', '..', 'hooks', 'lib', 'manager-state.mjs');
const CLI_PROJ = makeProject('cli-root', { hard: true, level: 'strict' });
const CLI_HELPER = join(CLI_PROJ, '.claude', 'brewtools', 'manager', 'manager-state.mjs');
const CLI_NESTED = join(CLI_PROJ, 'nested', 'deep');
mkdirSync(CLI_NESTED, { recursive: true });
writeFileSync(CLI_HELPER, readFileSync(STATE_MJS, 'utf8'));

function runStateCli(script, args, cwd, projectDir, envOver = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  for (const [k, v] of Object.entries(envOver)) v === undefined ? delete env[k] : (env[k] = v);
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 8000, env });
  return { status: r.status, out: safeParse(r.stdout || '') };
}

const cliSet = runStateCli(CLI_HELPER, ['set', 'hard=false'], CLI_NESTED);
const cliState = safeParse(readFileSync(join(CLI_PROJ, '.claude', 'brewtools', 'manager', 'state.json'), 'utf8'));
check(
  '78a-installed-cli-disarms-its-own-project-from-a-nested-cwd',
  { status: cliSet.status, hard: cliState.hard, level: cliState.level, strayTree: existsSync(join(CLI_NESTED, '.claude')) },
  { status: 0, hard: false, level: 'strict', strayTree: false },
  'the documented exit must disarm the wall it sits next to, whatever the shell cwd is',
);

const cliGet = runStateCli(STATE_MJS, ['get'], tmpdir(), STRICT);
check(
  '78b-plugin-cli-falls-back-to-claude-project-dir',
  { status: cliGet.status, hard: cliGet.out.hard, level: cliGet.out.level, source: cliGet.out.source },
  { status: 0, hard: true, level: 'strict', source: 'project' },
  'a copy that is not installed in a project resolves CLAUDE_PROJECT_DIR before cwd',
);

// REGRESSION: global state.json was hardcoded to ~/.claude/manager, so a CLAUDE_CONFIG_DIR
// profile wrote and read the default profile's file.
const GS_HOME = join(BASE, 'gs-home');
const GS_CFG = join(BASE, 'gs-cfg');
const GS_EMPTY = join(BASE, 'gs-empty');
const GS_PROJ = join(BASE, 'gs-proj');
for (const d of [join(GS_HOME, '.claude', 'manager'), GS_EMPTY, join(GS_PROJ, '.git')]) mkdirSync(d, { recursive: true });
writeFileSync(join(GS_HOME, '.claude', 'manager', 'state.json'), JSON.stringify({ mode: 'full' }));
const gsWrite = spawnSync(process.execPath, ['--input-type=module', '-e',
  `import {writeState} from ${JSON.stringify(STATE_MJS)}; await writeState('global', {mode:'full'});`],
  { encoding: 'utf8', timeout: 8000, env: { ...process.env, HOME: GS_HOME, CLAUDE_CONFIG_DIR: GS_CFG } });
const gsGet = (cfg) => runStateCli(CLI_HELPER, ['get', '--cwd', GS_PROJ], tmpdir(), undefined, { HOME: GS_HOME, CLAUDE_CONFIG_DIR: cfg }).out.source;
check(
  '78c-global-state-follows-claude-config-dir',
  { write: gsWrite.status, inConfigDir: existsSync(join(GS_CFG, 'manager', 'state.json')),
    configDir: gsGet(GS_CFG), emptyConfigDir: gsGet(GS_EMPTY), unset: gsGet(undefined) },
  { write: 0, inConfigDir: true, configDir: 'global', emptyConfigDir: 'default', unset: 'global' },
  'global state is <CLAUDE_CONFIG_DIR>/manager/state.json for writer and installed CLI, ~/.claude only when unset',
);

// ---- manager-prompt.mjs (UserPromptSubmit) and session-start.mjs (SessionStart) ----------

const PLUGIN_ROOT = join(HERE, '..', '..', '..');
const PROMPT_MJS = join(PLUGIN_ROOT, 'hooks', 'manager-prompt.mjs');
const SESSION_MJS = join(PLUGIN_ROOT, 'hooks', 'session-start.mjs');
/** Empty HOME: a real ~/.claude/manager/prompts override must not leak into expectations. */
const EMPTY_HOME = join(BASE, 'home');
mkdirSync(EMPTY_HOME, { recursive: true });
process.env.HOME = EMPTY_HOME;

/** `envOver`: extra env for the hook; an `undefined` value removes that key. */
function runHook(script, payload, projectDir, envOver = {}) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  for (const [k, v] of Object.entries(envOver)) v === undefined ? delete env[k] : (env[k] = v);
  const r = spawnSync(process.execPath, [script], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 8000,
    env,
  });
  return safeParse(r.stdout || '');
}

const ups = (cwd, prompt, extra) => ({
  session_id: 'S1', cwd, hook_event_name: 'UserPromptSubmit', permission_mode: 'default', prompt, ...extra,
});
const injected = (text) => ({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } });
/** The shipped default block for a mode, read the way the hook reads it. */
const shipped = (mode) => resolvePrompt(mode, join(BASE, 'no-such-project'), PLUGIN_ROOT).text;

const HEAD_M = 'User typed `++m` — Manager mode is active for this turn:';
const HEAD_A = 'User typed `++a` — Architecture-first discipline is active for this turn:';
const HEAD_RR = 'User typed `++rr` — Anti-regression review discipline is active for this turn:';
const HEAD_R = 'User typed `++r` — Two-phase review discipline is active for this turn:';

check(
  '79-codeword-m-injects-the-manager-block',
  runHook(PROMPT_MJS, ups(DISARMED, '++m ship the feature')),
  injected(`${HEAD_M}\n\n${shipped('full')}`),
  'a typed ++m gets the header plus the shipped full block, wall state irrelevant',
);

check(
  '80-codeword-groups-combine-in-order',
  runHook(PROMPT_MJS, ups(DISARMED, 'do it ++rr ++a ++m')),
  injected([`${HEAD_M}\n\n${shipped('full')}`, `${HEAD_A}\n\n${shipped('architect')}`, `${HEAD_RR}\n\n${shipped('review-regression')}`].join('\n\n---\n\n')),
  'manager, architect and review blocks are all injected, in that fixed order',
);

// REGRESSION: an armed wall injected the whole `full` block (1830 B) on EVERY prompt, on top
// of the guard that already enforces the rule and explains itself in its deny reason.
check(
  '81-armed-wall-injects-nothing-without-a-codeword',
  { balanced: runHook(PROMPT_MJS, ups(ARMED, 'refactor the parser')), strict: runHook(PROMPT_MJS, ups(STRICT, 'refactor the parser')) },
  { balanced: {}, strict: {} },
  'no ambient per-prompt block while the wall is armed',
);

// REGRESSION: UserPromptSubmit fires for subagent deliveries; a quoted codeword activated "User typed `++m`".
// Fixtures recorded on 2.1.296 (home paths scrubbed; hand-back line replaced by one carrying codewords).
const NOTIFICATION = JSON.parse(readFileSync(join(HERE, 'fixtures', 'ups-task-notification.json'), 'utf8'));
const HANDBACK = JSON.parse(readFileSync(join(HERE, 'fixtures', 'ups-agent-message.json'), 'utf8'));
check(
  '82-synthetic-fixtures-carry-codewords',
  { notification: /<result>\+\+m PROBE_REPORT_TOKEN \+\+rr<\/result>/.test(NOTIFICATION.prompt), handback: / {2}\+\+m \+\+a \+\+rr PROBE_REPORT_TOKEN\n/.test(HANDBACK.prompt) },
  { notification: true, handback: true },
  'precondition: both recorded deliveries contain codewords the scan would match',
);
check(
  '83-synthetic-subagent-deliveries-inject-nothing',
  {
    taskNotification: runHook(PROMPT_MJS, NOTIFICATION),
    agentMessage: runHook(PROMPT_MJS, HANDBACK),
    leadingWhitespace: runHook(PROMPT_MJS, { ...NOTIFICATION, prompt: `\n  ${NOTIFICATION.prompt}` }),
  },
  { taskNotification: {}, agentMessage: {}, leadingWhitespace: {} },
  'a prompt that starts with <task-notification> or <agent-message is not the user typing',
);

check(
  '84-typed-prompt-quoting-the-tag-still-fires',
  runHook(PROMPT_MJS, ups(DISARMED, 'explain what <task-notification> means ++r')),
  injected(`${HEAD_R}\n\n${shipped('review-double')}`),
  'only a LEADING delivery tag marks a synthetic prompt',
);

// REGRESSION: manager-prompt skipped a bare typed `<agent-message>`; a delivery is only
// `<task-notification>` or `<agent-message from=`.
check(
  '84a-only-agent-message-from-marks-a-delivery',
  {
    bareTag: runHook(PROMPT_MJS, ups(DISARMED, '<agent-message> ++r')),
    fromAttr: runHook(PROMPT_MJS, ups(DISARMED, '<agent-message from="a1"> ++r')),
  },
  { bareTag: injected(`${HEAD_R}\n\n${shipped('review-double')}`), fromAttr: {} },
  'a typed <agent-message> fires the codeword; <agent-message from= is a subagent delivery',
);

// REGRESSION: project prompt overrides were looked up under the raw hook cwd, so they
// vanished as soon as the session changed directory.
const ROOTED = makeProject('rooted', { hard: false, level: 'balanced' });
mkdirSync(join(ROOTED, '.claude', 'brewtools', 'manager', 'prompts'), { recursive: true });
mkdirSync(join(ROOTED, 'nested', 'deep'), { recursive: true });
writeFileSync(join(ROOTED, '.claude', 'brewtools', 'manager', 'prompts', 'review-double.md'), 'OVERRIDE-AT-ROOT');
writeFileSync(join(ROOTED, '.claude', 'brewtools', 'manager', 'prompts', 'architect.md'), 'x'.repeat(10000));
check(
  '85-project-override-resolves-from-the-project-root',
  {
    nestedCwd: runHook(PROMPT_MJS, ups(join(ROOTED, 'nested', 'deep'), '++r check it')),
    projectDirEnv: runHook(PROMPT_MJS, ups('/', '++r check it'), ROOTED),
  },
  { nestedCwd: injected(`${HEAD_R}\n\nOVERRIDE-AT-ROOT`), projectDirEnv: injected(`${HEAD_R}\n\nOVERRIDE-AT-ROOT`) },
  'the override is found from a nested cwd and through CLAUDE_PROJECT_DIR',
);

check(
  '86-injection-is-capped-at-9000-chars',
  runHook(PROMPT_MJS, ups(ROOTED, '++a design it')),
  injected(`${`${HEAD_A}\n\n${'x'.repeat(10000)}`.slice(0, 9000)}\n...[truncated]`),
  'an oversized override is cut to 9000 chars plus the truncation marker',
);

check(
  '87-prompt-hook-malformed-stdin-fails-open',
  runHook(PROMPT_MJS, '{not json'),
  {},
  'an advisory hook must never break the prompt',
);

// REGRESSION: the global override was hardcoded to ~/.claude/manager/prompts, so a session on
// another profile (CLAUDE_CONFIG_DIR) read the default profile's override or none.
const PROFILE_HOME = join(BASE, 'profile-home');
const PROFILE_CFG = join(BASE, 'profile-cfg');
const PROFILE_EMPTY = join(BASE, 'profile-empty');
for (const [dir, text] of [[join(PROFILE_HOME, '.claude'), 'OVERRIDE-IN-HOME'], [PROFILE_CFG, 'OVERRIDE-IN-CONFIG-DIR']]) {
  mkdirSync(join(dir, 'manager', 'prompts'), { recursive: true });
  writeFileSync(join(dir, 'manager', 'prompts', 'review-double.md'), text);
}
mkdirSync(PROFILE_EMPTY, { recursive: true });
const asProfile = (cfg) => runHook(PROMPT_MJS, ups(DISARMED, '++r check it'), undefined, { HOME: PROFILE_HOME, CLAUDE_CONFIG_DIR: cfg });
check(
  '87a-global-override-follows-claude-config-dir',
  { configDir: asProfile(PROFILE_CFG), unset: asProfile(undefined), emptyConfigDir: asProfile(PROFILE_EMPTY) },
  {
    configDir: injected(`${HEAD_R}\n\nOVERRIDE-IN-CONFIG-DIR`),
    unset: injected(`${HEAD_R}\n\nOVERRIDE-IN-HOME`),
    emptyConfigDir: injected(`${HEAD_R}\n\n${shipped('review-double')}`),
  },
  'the global scope is <CLAUDE_CONFIG_DIR>/manager/prompts, ~/.claude only when unset, never a fallback',
);

const sessionNotice = (level, bash) => ({
  systemMessage: `⛔ MANAGER HARD wall ON (project, level=${level})`,
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: `Manager HARD wall active (project, level=${level}): a PreToolUse guard denies Write/Edit and ${bash} in the main session; subagents are not restricted, so implementation goes through the Agent tool. /brewtools:manager-setup disable to exit.`,
  },
});
const sessionStart = (cwd) => ({ session_id: 'S1', cwd, hook_event_name: 'SessionStart', source: 'startup' });

// REGRESSION: the armed-wall notice was keyed on raw cwd, so a session started (or resumed)
// in a subdirectory of an armed project got no notice at all.
check(
  '88-session-notice-from-a-nested-cwd',
  runHook(SESSION_MJS, sessionStart(ARMED_NESTED)),
  sessionNotice('balanced', 'Bash that is not read-only'),
  'the notice states the mechanism and the exit, and resolves the state from the project root',
);

check(
  '89-session-notice-at-strict-via-project-dir',
  runHook(SESSION_MJS, sessionStart('/'), STRICT),
  sessionNotice('strict', 'all Bash'),
  'CLAUDE_PROJECT_DIR wins over cwd; strict names its own Bash rule',
);

check(
  '90-session-start-is-silent-when-disarmed',
  { disarmed: runHook(SESSION_MJS, sessionStart(DISARMED)), notInstalled: runHook(SESSION_MJS, sessionStart(join(BASE, 'no-such-project'))) },
  { disarmed: {}, notInstalled: {} },
  'no wall, no notice',
);

// REGRESSION: the log level was read from `.claude/tasks/cfg/brewcode.config.json`, a file of the
// task system removed in v3.19.0 that nothing creates; only BREWCODE_LOG_LEVEL is honoured now.
const UTILS_URL = pathToFileURL(join(PLUGIN_ROOT, 'hooks', 'lib', 'utils.mjs')).href;
function logOnce(name, level, envLevel) {
  const dir = join(BASE, name);
  mkdirSync(join(dir, '.claude', 'tasks', 'cfg'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'tasks', 'cfg', 'brewcode.config.json'), '{"logging":{"level":"trace"}}');
  const env = { ...process.env };
  delete env.BREWCODE_LOG_LEVEL;
  if (envLevel) env.BREWCODE_LOG_LEVEL = envLevel;
  const code = `const u = await import(${JSON.stringify(UTILS_URL)}); u.log(${JSON.stringify(level)}, '[t]', 'msg', ${JSON.stringify(dir)});`;
  spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 8000, env });
  const file = join(dir, '.claude', 'logs', 'brewtools.log');
  return existsSync(file) ? readFileSync(file, 'utf8').replace(/^\S+ /gm, '<ts> ') : null;
}
check(
  '91-log-level-comes-from-env-not-the-removed-task-config',
  {
    configIgnored: logOnce('log-cfg', 'debug'),
    envDebug: logOnce('log-env', 'debug', 'DEBUG'),
    defaultWarn: logOnce('log-warn', 'warn'),
    envError: logOnce('log-err', 'warn', 'error'),
  },
  { configIgnored: null, envDebug: '<ts> DEBUG [t] msg\n', defaultWarn: '<ts> WARN  [t] msg\n', envError: null },
  'a trace level in brewcode.config.json is ignored; BREWCODE_LOG_LEVEL (case-insensitive) or default info decides',
);

// GIVEN outer/.git > armed h/.claude > h/notes/misc | WHEN h is HOME, the config-dir parent, or plain
// THEN guard, state CLI and utils.projectRoot skip h as a profile and resolve outer; plain h stays the armed root
{
  const outer = realpathSync(mkdtempSync(join(tmpdir(), 'hardmode-profile-')));
  const h = join(outer, 'h');
  const cwd = join(h, 'notes', 'misc');
  mkdirSync(join(outer, '.git'), { recursive: true });
  mkdirSync(join(h, '.claude', 'brewtools', 'manager'), { recursive: true });
  writeFileSync(join(h, '.claude', 'brewtools', 'manager', 'state.json'), JSON.stringify({ hard: true, level: 'strict' }));
  mkdirSync(cwd, { recursive: true });
  const elsewhere = join(outer, 'elsewhere');
  const observe = (envOver) => {
    const env = { ...process.env, HOME: elsewhere };
    delete env.CLAUDE_PROJECT_DIR;
    delete env.CLAUDE_CONFIG_DIR;
    Object.assign(env, envOver);
    const guard = spawnSync(process.execPath, [GUARD_MJS], { input: stdin(cwd), encoding: 'utf8', timeout: 8000, env });
    const cli = spawnSync(process.execPath, [STATE_MJS, 'get'], { cwd, encoding: 'utf8', timeout: 8000, env });
    const code = `const u = await import(${JSON.stringify(UTILS_URL)}); process.stdout.write(u.projectRoot(${JSON.stringify(cwd)}));`;
    const root = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 8000, env });
    return { guard: verdict(safeParse(guard.stdout || '')), hard: safeParse(cli.stdout || '').hard, root: root.stdout };
  };
  check(
    '92-root-walk-skips-home-and-profile-parent',
    [observe({ HOME: h }), observe({ CLAUDE_CONFIG_DIR: join(h, '.claude') }), observe({})],
    [
      { guard: 'allow', hard: false, root: outer },
      { guard: 'allow', hard: false, root: outer },
      { guard: 'deny', hard: true, root: h },
    ],
    'a HOME or config-dir-parent .claude is the profile: its manager state must never arm a non-project cwd',
  );
  rmSync(outer, { recursive: true, force: true });
}

try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('\n=== manager-setup E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
