#!/usr/bin/env node
/**
 * E2E suite for the manager HARD wall guard (brewtools/hooks/hardmode-guard.mjs).
 * Focus: main-session vs subagent discrimination.
 * State is driven through an isolated temp project passed as `cwd` on stdin —
 * this repo's .codex/ is never read or written and no real wall is ever armed.
 * Assertion policy: every check is an unconditional exact deep-equality
 * comparison with a description; no branching gates which asserts run.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

/**
 * Runs the guard with CODEX_PROJECT_DIR scrubbed unless a test sets it explicitly —
 * otherwise the ambient value of whoever runs the suite would resolve the project root
 * away from the temp fixture.
 */
function runGuard(stdinStr, projectDir) {
  const env = { ...process.env };
  delete env.CODEX_PROJECT_DIR;
  if (projectDir) env.CODEX_PROJECT_DIR = projectDir;
  const r = spawnSync(process.execPath, [GUARD_MJS], {
    input: stdinStr,
    encoding: 'utf8',
    timeout: 8000,
    env,
  });
  return safeParse(r.stdout || '');
}

/** Isolated project whose state.json arms/disarms the wall for one scenario. */
function makeProject(name, state) {
  const proj = join(BASE, name);
  mkdirSync(join(proj, '.codex', 'brewtools', 'manager'), { recursive: true });
  writeFileSync(join(proj, '.codex', 'brewtools', 'manager', 'state.json'), JSON.stringify(state));
  return proj;
}

const PASS_THROUGH = {};
const EXIT_HINT = 'Manager HARD wall is ON — delegate via sub-agent task/Agent. To exit run `$brewtools:manager-setup disable`; the only Bash it needs — `node <project>/.codex/brewtools/manager/manager-state.mjs set hard=false` — is self-exempt at every level.';

function denial(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason} ${EXIT_HINT}`,
    },
  };
}

const WRITE_DENIAL = denial('Hard wall: Write is blocked in the main session — delegate to a subagent.');
const BASH_DENIAL = denial('Hard wall (balanced): only read-only Bash is allowed in the main session — delegate execution to a subagent.');
const STRICT_BASH_DENIAL = denial('Hard wall (strict): Bash is blocked in the main session — delegate execution to a subagent.');
const PARSE_DENIAL = denial('Hard wall: the guard could not parse its PreToolUse payload and denies by default.');
const mcpDenial = (tool) => denial(`Hard wall: MCP tool ${tool} is blocked in the main session — delegate to a subagent.`);

const ARMED = makeProject('armed', { hard: true, level: 'balanced' });
const DISARMED = makeProject('disarmed', { hard: false, level: 'balanced' });
const STRICT = makeProject('strict', { hard: true, level: 'strict' });

/** The real installed state CLI next to the state file — the only self-exempt script. */
function installHelper(proj) {
  const p = join(proj, '.codex', 'brewtools', 'manager', 'manager-state.mjs');
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
const BROKEN_STATE = join(BROKEN, '.codex', 'brewtools', 'manager', 'state.json');
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
// REGRESSION: CC 2.1.228 sets agent_type on the MAIN thread of a `claude --agent <name>`
// session (no agent_id). Treating agent_type as a subagent discriminator silently
// disarmed the wall for every such session — agent_id is the SOLE discriminator.
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

// GIVEN no manager directory at all, WHEN a main session writes, THEN the wall is not
// installed in that project and the guard no-ops. This is the ONE remaining pass-through
// for an unreadable wall state — see 38/39 for the fail-closed case.
check(
  '07-manager-never-installed-is-unarmed',
  runGuard(stdin(join(BASE, 'no-such-project'), {})),
  PASS_THROUGH,
  'no .codex/brewtools/manager directory means the wall was never installed',
);

// GIVEN malformed stdin, WHEN the guard runs, THEN it fails CLOSED.
// REGRESSION (BT-F01): an unparseable payload leaves the agent_id discriminator unknown,
// so allowing would open the wall on exactly the input the guard cannot reason about.
check(
  '08-malformed-stdin-fails-closed',
  runGuard('{not json'),
  PARSE_DENIAL,
  'an unparseable PreToolUse payload must deny, not pass through',
);

// ---- BT-F01 vector A — state resolved from the project root, never raw cwd -------------

// REGRESSION: with `join(cwd, '.codex/…')` the state file was invisible from any nested
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
  'CODEX_PROJECT_DIR is the first step of the canonical root recipe',
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
// REGRESSION: the vector-C cluster above tested the WRAPPER cases only and never entered a
// vetter body, which is exactly how these three bypasses shipped. Each command line below was
// reproduced as ALLOWED through the real hook before the fix.

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
// A guard that denies everything is not a guard. These are the legitimate reads that must
// survive the tightened vetters.

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
  runGuard(stdin(ARMED, { tool_name: 'mcp__search__destroy_all', tool_input: {} })),
  mcpDenial('mcp__search__destroy_all'),
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
// The step-2 node program is extracted verbatim from the skill, so a regression in the
// documented block fails here instead of on a user's machine.

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
  const mdir = join(proj, '.codex', 'brewtools', 'manager');
  mkdirSync(mdir, { recursive: true });
  writeFileSync(join(mdir, 'state.json'), JSON.stringify({ hard: false, level: 'balanced' }));
  writeFileSync(join(mdir, 'hardmode-guard.mjs'), '// copied guard\n');
  writeFileSync(join(mdir, 'manager-state.mjs'), '// copied helper\n');
  writeFileSync(join(proj, '.codex', 'hooks.json'), JSON.stringify({
    permissions: { allow: ['Read(**)'] },
    hooks: {
      PreToolUse: [{
        matcher: '*',
        hooks: [{ type: 'command', command: `node "${join(mdir, 'hardmode-guard.mjs')}" # brewtools-manager-guard`, timeout: 5 }],
      }],
    },
  }, null, 2));
  return proj;
}

function runUninstall(proj, tag) {
  const file = join(BASE, `uninstall-${tag}.mjs`);
  writeFileSync(file, uninstallScript().split("'${ROOT}'").join(JSON.stringify(proj)));
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 8000 });
  const settings = join(proj, '.codex', 'hooks.json');
  const raw = existsSync(settings) ? readFileSync(settings, 'utf8') : '';
  return {
    code: r.status,
    out: safeParse(r.stdout || ''),
    stderr: r.stderr || '',
    tagLeft: raw.includes('brewtools-manager-guard'),
    permissionsKept: raw.includes('Read(**)'),
    guardOnDisk: existsSync(join(proj, '.codex', 'brewtools', 'manager', 'hardmode-guard.mjs')),
    helperOnDisk: existsSync(join(proj, '.codex', 'brewtools', 'manager', 'manager-state.mjs')),
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
writeFileSync(join(U3, '.codex', 'hooks.json'), '{ this is not json');
const r3 = runUninstall(U3, 'corrupt');
check(
  '43-uninstall-aborts-on-corrupt-settings-before-any-delete',
  { code: r3.code, guardOnDisk: r3.guardOnDisk, helperOnDisk: r3.helperOnDisk, named: r3.stderr.includes('hooks.json') },
  { code: 1, guardOnDisk: true, helperOnDisk: true, named: true },
  'a malformed settings file must abort by path+reason with both files untouched',
);

// The brick case: files deleted while the entry survives. Deletion is made to fail by
// stripping write permission from the manager directory.
const U4 = makeInstalledProject('uninstall-delete-fails');
chmodSync(join(U4, '.codex', 'brewtools', 'manager'), 0o500);
const r4 = runUninstall(U4, 'delete-fails');
chmodSync(join(U4, '.codex', 'brewtools', 'manager'), 0o700);
check(
  '44-uninstall-restores-registration-when-a-delete-fails',
  { code: r4.code, tagLeft: r4.tagLeft, guardOnDisk: r4.guardOnDisk, helperOnDisk: r4.helperOnDisk },
  { code: 1, tagLeft: true, guardOnDisk: true, helperOnDisk: true },
  'a failed delete must roll the settings entry back — never leave a half-guarded project',
);

try { rmSync(BASE, { recursive: true, force: true }); } catch { /* ignore */ }

console.log('\n=== hardmode-guard E2E TEST REPORT ===');
for (const line of results) console.log(line);
console.log(`\nTOTAL: ${passed + failed} | PASS: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
