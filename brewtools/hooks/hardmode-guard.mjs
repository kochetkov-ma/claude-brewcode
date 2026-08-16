#!/usr/bin/env node
// brewcode-meta: version=6.0.0 content_version=6.0.0 generated_by=brewtools:manager-setup
// brewtools:manager-setup — HARD wall guard (PreToolUse, matcher "*").
//
// SELF-CONTAINED — copied into <project>/.claude/brewtools/manager/ by
// `/brewtools:manager-setup install` and registered in .claude/settings.local.json
// (PreToolUse "*"). No external imports. Project-only state.
//
// When state.hard === true, physically DENIES tool calls in the MAIN session,
// leaving only delegation (Task/Agent/Skill), reading, and task tracking.
// Subagents stay fully free.
//
// LINCHPIN: this PreToolUse hook fires inside subagents too, and subagent
// tool-call stdin carries `agent_id`; the MAIN session stdin does NOT.
// session_id is identical for both. => Discriminator is `agent_id` ALONE: DENY
// whenever it is ABSENT (main session), pass through when present.
// `agent_type` is NOT a discriminator — CC 2.1.228 sets it on the MAIN thread of
// a `claude --agent <name>` session too (without `agent_id`), so treating it as
// one disarms the wall for every such session. A `--agent` main session IS walled.
//
// Strictness levels:
//   strict   — deny all non-read tools (no bash, no web).
//   balanced — additionally allow read-only Bash (strict binary allowlist + per-binary
//              flag vetting), WebSearch, and read-only MCP tools.
//
// FAIL-CLOSED (changed in v6 — BT-F01). This is a security guard: an unparseable
// payload, an unreadable/corrupt state.json next to an installed manager dir, or any
// unexpected internal error DENIES instead of passing through. The only pass-through
// left is "the manager was never installed in this project" (no manager directory at
// any candidate root) and the subagent discriminator. Recovery from a broken state is
// always available because the self-exempt state CLI survives every level.
//
// PreToolUse stdin fields used: tool_name, tool_input.command, cwd, agent_id.
//
// Provenance: NOT-IN-DOC (HOOKS-REFERENCE.md lists only subagent_type/subagent_id),
// but the CC 2.1.228 binary's own schema text states it outright — agent_id is
// "Present only when the hook fires from within a subagent... Absent for the main
// thread, even in --agent sessions. Use this field (not agent_type) to distinguish
// subagent calls from main-thread calls." Established 2026-08-11 by reading the
// 2.1.228 binary, NOT by a live probe; earlier live checks (2.1.177, 2.1.195)
// covered agent_id only. Re-verify live if PreToolUse stdin shape ever looks off.
// The undocumented `effort` payload key (used by other brewtools hooks) is
// irrelevant here and intentionally NOT read by this guard.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- inlined stdin/stdout helpers (no plugin lib) ---------------------------

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// ---- project root (canonical recipe, D1 Q5) ---------------------------------
// CLAUDE_PROJECT_DIR -> upward walk for a root marker -> hook cwd. Never throws.
// `input.cwd` keeps exactly one job downstream: resolving relative tool_input paths.
// BT-F01 vector A was precisely a raw-`cwd` state lookup: from <proj>/nested/deep the
// state file was never found and the guard emitted {} for every tool, at every level.
function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, '.claude'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd());
}

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const MANAGER_REL = join('.claude', 'brewtools', 'manager');

// Directories where an installed manager may live, most trustworthy first:
// 1. the guard's own directory when it sits at the installed location — immune to cwd;
// 2. <projectRoot>/.claude/brewtools/manager.
function managerDirs(hookCwd) {
  const dirs = [];
  if (SELF_DIR.endsWith(MANAGER_REL)) dirs.push(SELF_DIR);
  const fromRoot = join(projectRoot(hookCwd), MANAGER_REL);
  if (!dirs.includes(fromRoot)) dirs.push(fromRoot);
  return dirs;
}

// ---- state read (fail-closed) -----------------------------------------------
// No manager directory anywhere      -> not installed -> { hard:false } (pure no-op).
// Directory present, state unreadable/corrupt -> { hard:true, level:'strict', broken }.
// Global ~/.claude state is NEVER consulted: the wall is strictly project-scoped.
function readProjectState(hookCwd) {
  for (const dir of managerDirs(hookCwd)) {
    if (!existsSync(dir)) continue;
    const p = join(dir, 'state.json');
    const broken = { hard: true, level: 'strict', dir, broken: p };
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      return broken;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return broken;
    return {
      hard: parsed.hard === true,
      level: parsed.level === 'strict' ? 'strict' : 'balanced',
      dir,
      broken: null,
    };
  }
  return { hard: false, level: 'balanced', dir: null, broken: null };
}

// ---- guard tables -----------------------------------------------------------

// Tools always permitted in the main session under the hard wall.
// Audited bucket-by-bucket: nothing here can mutate the workspace on its own. Tools that
// merely SPAWN work (Task/Agent/Skill/SlashCommand/SendMessage) are safe because every tool
// call they cause in the main session comes back through this same guard.
const ALWAYS_ALLOW = new Set([
  // read — inspect files, never write
  'Read', 'Grep', 'Glob', 'NotebookRead',
  // delegate / orchestrate — hands the work to a subagent, which is where mutation belongs
  'Task', 'Agent', 'Skill', 'SlashCommand', 'ListAgents', 'SendMessage', 'Monitor',
  // plan mode — without these an armed wall traps a plan-mode session forever
  'EnterPlanMode', 'ExitPlanMode',
  // tool discovery — with ENABLE_TOOL_SEARCH the Task* tools below are DEFERRED, so
  // denying ToolSearch would make the tracking bucket unreachable
  'ToolSearch',
  // track / report — task graph + findings, no filesystem side effects
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite', 'ReportFindings',
  // background shells — read output of / stop a shell started before arming; neither writes
  'BashOutput', 'KillShell', 'KillBash',
  // MCP resource introspection — read-only by protocol definition
  'ListMcpResourcesTool', 'ReadMcpResourceTool',
  // ask the human
  'AskUserQuestion'
]);
// Deliberately NOT allowed: Artifact (publishes a page), WebFetch, Write/Edit/NotebookEdit.

// Tools never permitted in the main session under the hard wall (any level).
const ALWAYS_BLOCK = new Set(['Write', 'Edit', 'NotebookEdit', 'WebFetch']);

// MCP verb classification applies to the TOOL segment only (everything after the second
// `__` in mcp__<server>__<tool>). Matching the whole name let a server called `search`
// or `getops` launder any operation: `mcp__search__destroy_all` read as "read-only".
const MCP_WRITE_VERB = /(write|create|update|delete|destroy|drop|wipe|remove|put|post|send|comment|merge|move|upload|publish|export|resize|duplicate|exec|run)/i;
const MCP_READ_VERB = /(search|get|list|read|fetch|query|trace|status|describe)/i;

const EXIT_HINT = 'Manager HARD wall is ON — delegate via Task/Agent. To exit run `/brewtools:manager-setup disable`; the only Bash it needs — `node <project>/.claude/brewtools/manager/manager-state.mjs set hard=false` — is self-exempt at every level.';

function deny(reason) {
  output({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `${reason} ${EXIT_HINT}`
    }
  });
}

// ---- command tokenizer ------------------------------------------------------

// Metacharacters rejected anywhere in a command, quoted or not. Command substitution and
// any redirection are unclassifiable, so they are refused before tokenizing.
const FORBIDDEN_META = /\$\(|`|>|</;

// Split a command into segments of argv tokens, honouring quotes and chaining operators
// (&&, ||, ;, |, &, newline). null when quoting is unbalanced or a forbidden metachar
// appears — both mean "cannot classify" and therefore "deny".
function splitCommand(cmd) {
  if (typeof cmd !== 'string' || !cmd.trim()) return null;
  if (FORBIDDEN_META.test(cmd)) return null;
  const segments = [];
  let argv = [], cur = '', started = false, inDQ = false, inSQ = false;
  const endToken = () => { if (started) { argv.push(cur); cur = ''; started = false; } };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === '\\' && !inSQ && i + 1 < cmd.length) { cur += cmd[++i]; started = true; continue; }
    if (c === '"' && !inSQ) { inDQ = !inDQ; started = true; continue; }
    if (c === "'" && !inDQ) { inSQ = !inSQ; started = true; continue; }
    if (inDQ || inSQ) { cur += c; started = true; continue; }
    if (c === '&' || c === '|' || c === ';' || c === '\n') {
      endToken();
      segments.push(argv);
      argv = [];
      if ((c === '&' && cmd[i + 1] === '&') || (c === '|' && cmd[i + 1] === '|')) i++;
      continue;
    }
    if (/\s/.test(c)) { endToken(); continue; }
    cur += c; started = true;
  }
  if (inDQ || inSQ) return null;
  endToken();
  segments.push(argv);
  return segments;
}

// ---- self-exempt: the genuine manager-state CLI -----------------------------
// ONLY `node <ABSOLUTE installed helper> get|set ...`, so that `/brewtools:manager-setup
// disable` / `level` can still run under the wall.
//
// BT-F01 vector B: the anchor used to be a tail REGEX (`(hooks/lib|…)/manager-state.mjs$`),
// so a planted /tmp/evil/hooks/lib/manager-state.mjs was exempt — and because the check ran
// before the level branch it also ran at `strict`, i.e. arbitrary code could set hard=false
// and disarm the wall permanently. The anchor is now the RESOLVED ABSOLUTE PATH of the
// helper actually shipped next to this guard; an unresolvable path is not exempt.
// The check now lives INSIDE the Bash branch, after tool classification.
function installedHelpers(hookCwd) {
  const paths = [join(SELF_DIR, 'manager-state.mjs'), join(SELF_DIR, 'lib', 'manager-state.mjs')];
  for (const dir of managerDirs(hookCwd)) paths.push(join(dir, 'manager-state.mjs'));
  const out = new Set();
  for (const p of paths) {
    try { out.add(realpathSync(p)); } catch { /* not shipped here */ }
  }
  return out;
}

// Any flag that turns `node` into an evaluator. Rejected outright.
const NODE_EVAL_FLAG = /^(-e|--eval|-p|--print|--input-type|--experimental-loader|--import|--require|-r|--loader)(=|$)/;

// The helper's own CLI grammar: get|set [key=value ...] [--cwd DIR]. Mirrors parseCliArgs
// in lib/manager-state.mjs — the guard must never allow a shape the helper would not.
function isStateCliArgs(args) {
  if (args[0] !== 'get' && args[0] !== 'set') return false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--cwd') { if (!args[++i]) return false; continue; }
    if (a.startsWith('-')) return false;
    if (args[0] !== 'set') return false;
    if (!/^(hard=(true|false)|level=(strict|balanced))$/.test(a)) return false;
  }
  return true;
}

function isStateWriteCommand(cmd, hookCwd) {
  const segments = splitCommand(cmd);
  if (!segments || segments.length !== 1) return false;        // single command, no chaining
  const argv = segments[0];
  if (argv.length < 3 || argv[0] !== 'node') return false;     // bare `node`, nothing wrapping it
  if (typeof cmd === 'string' && cmd.includes('$')) return false; // no variable expansion
  if (NODE_EVAL_FLAG.test(argv[1])) return false;              // node must not act as an evaluator
  const script = isAbsolute(argv[1]) ? argv[1] : resolve(hookCwd || process.cwd(), argv[1]);
  let real;
  try { real = realpathSync(script); } catch { return false; }
  if (!installedHelpers(hookCwd).has(real)) return false;      // must BE the shipped helper
  return isStateCliArgs(argv.slice(2));
}

// ---- balanced Bash classifier: strict allowlist + per-binary flag vetting ----
// BT-F01 vector C. A wrapper DENYLIST is explicitly rejected: `timeout`/`xargs`/`nice`
// were denied only incidentally (absent from the old READONLY_BASE), so any future
// "read-only" addition re-opened the hole. Default-deny is the invariant; a binary is
// listed only if it cannot exec, and if it can be made to exec by a flag, that flag is
// vetted here. `env` is gone: it is a whitelisted binary AND a universal wrapper.

// `--output`/`--textconv` write files or run an arbitrary filter, so they are exec-class
// even though `git diff`/`git show` are otherwise reads.
const GIT_READ_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'describe']);
const GIT_EXEC_FLAG = /^(-c|--config-env|--exec-path|--upload-pack|--receive-pack|--ext-diff|-C|--output|--textconv)(=|$)/;
// `git branch` mutates (create/-D/-m) and `--edit-description` spawns GIT_EDITOR, so it is
// vetted like `tag`: bare, or every argument a listing flag.
const GIT_BRANCH_READ_FLAG = /^(--list|-l|--show-current|-a|-r|--all|--remotes|-v|-vv|--contains|--merged|--no-merged)$|^--format=/;
const RG_EXEC_FLAG = /^(--pre|--pre-glob|--hostname-bin|--search-zip|-z)(=|$)/;
const FIND_EXEC_ACTION = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls']);
const GH_READ = new Set(['list', 'view', 'status']);

function vetGit(args) {
  if (args.some(a => GIT_EXEC_FLAG.test(a))) return false;
  const sub = args[0];
  if (sub === 'remote') return args[1] === '-v';
  if (sub === 'tag') return args[1] === '-l';
  if (sub === 'stash') return args[1] === 'list';
  if (sub === 'branch') return args.length === 1 || args.slice(1).every(a => GIT_BRANCH_READ_FLAG.test(a));
  return GIT_READ_SUBCOMMANDS.has(sub);
}

// gh read-only verbs are POSITIONAL: only `gh <group> <verb>` or `gh <verb>`. Scanning the whole
// argv let any VALUE launder a write verb — `gh issue comment 1 --body list` used to pass.
function vetGh(args) {
  return args.length > 0 && !args[0].startsWith('-') && (GH_READ.has(args[1]) || GH_READ.has(args[0]));
}

// THE allowlist: one row per binary, name -> flag vetter (null = no exec-capable flag known,
// args unrestricted). Deliberately a single table — a split allowlist/vetter pair made
// "added to one, forgotten in the other" possible. Bare names only, so `/bin/ls`, `VAR=x ls`
// and `env ls` never match. A vetter returns true when the argument vector is exec-free.
const READONLY = {
  ls: null, cat: null, pwd: null, which: null, head: null, tail: null, wc: null,
  date: null, whoami: null, basename: null, dirname: null, realpath: null,
  test: null, '[': null, jq: null, echo: null,
  grep: (args) => args.every(a => !RG_EXEC_FLAG.test(a)),
  rg: (args) => args.every(a => !RG_EXEC_FLAG.test(a)),
  find: (args) => args.every(a => !FIND_EXEC_ACTION.has(a)),
  // `node --check <file>` parses only; every other node invocation is execution.
  node: (args) => args.length === 2 && args[0] === '--check',
  git: vetGit,
  gh: vetGh,
};

function isReadonlySegment(argv) {
  if (argv.length === 0) return true;                        // empty segment from a trailing operator
  const base = argv[0];
  if (!Object.hasOwn(READONLY, base)) return false;          // default-deny; own keys only, no prototype
  return READONLY[base]?.(argv.slice(1)) ?? true;
}

function isReadonlyCommand(cmd) {
  const segments = splitCommand(cmd);
  if (!segments) return false;
  return segments.every(isReadonlySegment);
}

(async () => {
  let input = null;
  try {
    try {
      input = await readStdin();
    } catch {
      // Fail-closed: an unparseable payload means the discriminator cannot be trusted.
      deny('Hard wall: the guard could not parse its PreToolUse payload and denies by default.');
      return;
    }
    const cwd = input.cwd || process.cwd();

    // (a) Hot path: manager not installed, or wall off -> near-zero-overhead no-op.
    const state = readProjectState(cwd);
    if (state.broken === null && state.hard !== true) { output({}); return; }

    // (b) LINCHPIN: only agent_id marks a subagent -> pass through. agent_type is NOT a
    // discriminator: CC 2.1.228 sets it on the MAIN thread of a `claude --agent <name>`
    // session too (without agent_id), so an OR here disarms the wall for those sessions.
    if (Object.prototype.hasOwnProperty.call(input, 'agent_id')) {
      output({});
      return;
    }

    const level = state.level === 'strict' ? 'strict' : 'balanced';
    const tool = input.tool_name || '';
    const toolInput = input.tool_input || {};

    // (c) Always-allow set (delegation, reading, tracking).
    if (ALWAYS_ALLOW.has(tool)) { output({}); return; }

    // (d) Always-block tools.
    if (ALWAYS_BLOCK.has(tool)) {
      deny(`Hard wall: ${tool} is blocked in the main session — delegate to a subagent.`);
      return;
    }

    // (e) The self-exempt state CLI is checked HERE — after tool classification — and survives
    // `strict` AND a broken state on purpose: it is the documented exit.
    if (tool === 'Bash' && isStateWriteCommand(toolInput.command, cwd)) { output({}); return; }

    // (f) Broken state: single site, so no later branch can forget it. Everything that is not
    // always-allowed, always-blocked or the exit path is denied with the state's own reason.
    if (state.broken !== null) {
      deny(`Hard wall: manager state at ${state.broken} is missing or unreadable, so the guard denies by default.`);
      return;
    }

    // (g) Bash.
    if (tool === 'Bash') {
      if (level === 'strict') {
        deny('Hard wall (strict): Bash is blocked in the main session — delegate execution to a subagent.');
        return;
      }
      if (isReadonlyCommand(toolInput.command)) { output({}); return; }
      deny('Hard wall (balanced): only read-only Bash is allowed in the main session — delegate execution to a subagent.');
      return;
    }

    // (h) WebSearch.
    if (tool === 'WebSearch') {
      if (level === 'balanced') { output({}); return; }
      deny('Hard wall (strict): WebSearch is blocked in the main session — delegate to a subagent.');
      return;
    }

    // (i) MCP: classify on the tool segment after the second `__`; unrecognised verb or
    // malformed name is denied.
    if (tool.startsWith('mcp__')) {
      const parts = tool.split('__');
      const verb = parts.length >= 3 ? parts.slice(2).join('__') : '';
      const readOnly = verb !== '' && MCP_READ_VERB.test(verb) && !MCP_WRITE_VERB.test(verb);
      if (level === 'balanced' && readOnly) { output({}); return; }
      deny(`Hard wall: MCP tool ${tool} is blocked in the main session — delegate to a subagent.`);
      return;
    }

    // (j) Default-deny everything else.
    deny(`Hard wall: ${tool || 'this tool'} is blocked in the main session — delegate to a subagent.`);
  } catch {
    // Fail-closed: a guard bug must not silently open the wall. Subagents stay free —
    // their pass-through is decided before any classification can throw.
    if (input && Object.prototype.hasOwnProperty.call(input, 'agent_id')) { output({}); return; }
    deny('Hard wall: the guard hit an internal error and denies by default.');
  }
})();
