#!/usr/bin/env node
// brewcode-meta: version=6.12.2 content_version=6.5.2 generated_by=brewtools:manager-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// brewtools:manager-setup — HARD wall guard (PreToolUse "*"), self-contained copy in <project>/.claude/brewtools/manager/:
// state.hard -> deny main-session tools except delegate/read/track; subagents free. Fail-closed once installed.

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

// Mirrors semble isProfileParent: HOME or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === join(p, '.claude');
}

// ---- project root: CLAUDE_PROJECT_DIR -> upward walk for a root marker (profile parents skipped) -> hook cwd; never throws ----
// Raw `cwd` missed state from a nested dir (BT-F01 A); it only resolves relative tool_input paths.
function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd());
}

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const MANAGER_REL = join('.claude', 'brewtools', 'manager');

// Installed manager dirs, most trustworthy first: own dir at the installed location (immune to cwd),
// then <projectRoot>/.claude/brewtools/manager.
function managerDirs(hookCwd) {
  const dirs = [];
  if (SELF_DIR.endsWith(MANAGER_REL)) dirs.push(SELF_DIR);
  const fromRoot = join(projectRoot(hookCwd), MANAGER_REL);
  if (!dirs.includes(fromRoot)) dirs.push(fromRoot);
  return dirs;
}

// ---- mcpAllow grammar: `mcp__server__tool` | `mcp__server__*`; state filter + CLI grammar derive from it ----
// Deliberate copy of MCP_ALLOW_ENTRY in lib/manager-state.mjs (self-contained; suite asserts parity).
const MCP_ALLOW_ENTRY_SRC = 'mcp__[A-Za-z0-9_.-]+__(?:[A-Za-z0-9_.-]+|\\*)';
const MCP_ALLOW_ENTRY = new RegExp(`^${MCP_ALLOW_ENTRY_SRC}$`);

// ---- state read, project-only: no manager dir -> {hard:false}; unreadable/non-object -> strict + broken ----
// Unknown keys never break a state; a malformed `mcpAllow` degrades to [] (deny).
function readProjectState(hookCwd) {
  for (const dir of managerDirs(hookCwd)) {
    if (!existsSync(dir)) continue;
    const p = join(dir, 'state.json');
    const broken = { hard: true, level: 'strict', mcpAllow: [], dir, broken: p };
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
      mcpAllow: Array.isArray(parsed.mcpAllow)
        ? parsed.mcpAllow.filter(e => typeof e === 'string' && MCP_ALLOW_ENTRY.test(e))
        : [],
      dir,
      broken: null,
    };
  }
  return { hard: false, level: 'balanced', mcpAllow: [], dir: null, broken: null };
}

// ---- guard tables -----------------------------------------------------------

// Tools always permitted in the main session under the hard wall; later work they schedule
// still passes through this guard.
const ALWAYS_ALLOW = new Set([
  // read — inspect files and symbols, never write
  'Read', 'Grep', 'Glob', 'LSP',
  // delegate / orchestrate — hands the work to a subagent, which is where mutation belongs
  'Task', 'Agent', 'Skill', 'Workflow', 'ListAgents', 'SendMessage', 'SubagentHandback',
  // worktrees — where delegated work is isolated; entering one writes no project file
  'EnterWorktree', 'ExitWorktree',
  // plan mode — without these an armed wall traps a plan-mode session forever
  'EnterPlanMode', 'ExitPlanMode',
  // tool discovery — with ENABLE_TOOL_SEARCH the Task* tools below are DEFERRED, so
  // denying ToolSearch would make the tracking bucket unreachable
  'ToolSearch', 'WaitForMcpServers',
  // track / report — task graph + findings, no filesystem side effects
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TodoWrite', 'ReportFindings',
  // session schedules — later main-session work still passes through this guard
  'CronCreate', 'CronList', 'CronDelete', 'ScheduleWakeup',
  // background tasks — stop a shell, monitor or agent; output is read with Read
  'TaskStop',
  // MCP resource introspection — read-only by protocol definition
  'ListMcpResourcesTool', 'ReadMcpResourceTool',
  // ask the human
  'AskUserQuestion'
]);
// Deliberately NOT allowed: Artifact (publishes a page), WebFetch, Write/Edit/NotebookEdit.
// Monitor runs a shell command, so it is classified with Bash below, never listed here.

// Tools never permitted in the main session under the hard wall (any level).
const ALWAYS_BLOCK = new Set(['Write', 'Edit', 'NotebookEdit', 'WebFetch']);

// The one MCP server `strict` still reads through: semantic code search (read-only tools only).
const STRICT_MCP_SERVER = 'semble_code';

// MCP default-deny on the TOOL segment (after the 2nd `__`): every token known-safe, one a read verb.
// A token goes in only when it cannot name a mutation on its own; ambiguous verbs read only in docs names.
const MCP_READ_VERB = new Set([
  'search', 'find', 'get', 'list', 'read', 'fetch',
  'view', 'show', 'describe', 'inspect', 'status',
]);
const MCP_AMBIGUOUS_VERB = new Set(['query', 'resolve']);
// The ONLY tokens that may accompany an ambiguous verb (`query-docs`, `resolve-library-id`); kept tiny,
// unlike MCP_NEUTRAL_TOKEN (`query_table`, `list_and_resolve` deny).
const MCP_DOCS_QUALIFIER = new Set(['docs', 'doc', 'documentation', 'library', 'id']);
// Connectors + object nouns of read tools; a mutation still needs a write verb, unknown here.
// Widen this set (never the verbs) when an ordinary read tool is falsely denied.
const MCP_NEUTRAL_TOKEN = new Set([
  'and', 'related', 'docs', 'doc', 'library', 'id', 'file', 'files', 'info',
  'snapshot', 'console', 'messages', 'message', 'content', 'contents', 'metadata',
  'issue', 'issues', 'pull', 'request', 'requests', 'comment', 'comments',
  'label', 'labels', 'repo', 'repos', 'repository', 'commit', 'commits',
  'branch', 'branches', 'tag', 'tags', 'diff', 'tree', 'history',
  'pod', 'pods', 'node', 'nodes', 'namespace', 'namespaces', 'service', 'services',
  'deployment', 'deployments', 'instance', 'instances', 'cluster', 'clusters',
  'diagnostic', 'diagnostics', 'graph', 'memory', 'entity', 'entities', 'relation', 'relations',
  'current', 'time', 'date', 'zone', 'timezone',
  'user', 'users', 'account', 'accounts', 'project', 'projects', 'page', 'pages',
  'item', 'items', 'entry', 'entries', 'record', 'records', 'result', 'results',
  'schema', 'table', 'tables', 'row', 'rows', 'column', 'columns',
  'log', 'logs', 'event', 'events', 'job', 'jobs', 'task', 'tasks',
  'config', 'settings', 'version', 'versions', 'state', 'stats', 'usage', 'detail', 'details',
  'all', 'by', 'for', 'of', 'my',
]);

/** Tool/server name -> lowercase tokens, split on `_`, `-`, `.` and camelCase humps. */
function mcpTokens(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\-.\s]+/)
    .map(t => t.toLowerCase())
    .filter(Boolean);
}

// Named write verbs, so server-name subtraction cannot erase one (unknown tokens deny anyway).
// Excludes nouns read tools carry (`pull`, `commit`, `tag`, `comment`, `deployment`, `state`).
const MCP_WRITE_VERB = new Set([
  'send', 'delete', 'remove', 'destroy', 'drop', 'purge', 'truncate', 'clear', 'reset',
  'create', 'add', 'insert', 'write', 'put', 'post', 'update', 'upsert', 'modify', 'edit',
  'patch', 'rename', 'move', 'copy', 'replace', 'set', 'apply', 'merge', 'push', 'sync',
  'deploy', 'release', 'publish', 'upload', 'install', 'uninstall', 'exec', 'execute',
  'run', 'shell', 'spawn', 'kill', 'start', 'stop', 'restart', 'reboot', 'trigger',
  'invoke', 'submit', 'approve', 'assign', 'grant', 'revoke', 'cancel', 'enable',
  'disable', 'archive', 'restore', 'import', 'transfer',
]);

// ORDER IS THE CONTRACT: write-verb + safe gates run on the UNFILTERED segment, then server-name
// tokens are subtracted (`mcp__deploy__deploy_status` must not read as `status`).
function isReadOnlyMcpTool(server, toolSegment) {
  const raw = mcpTokens(toolSegment);
  // `mcp____get` — empty server — is a malformed name, not a read.
  if (!server || raw.length === 0) return false;
  if (raw.some(t => MCP_WRITE_VERB.has(t))) return false;
  const fromServer = new Set(mcpTokens(server));
  const safe = t => MCP_READ_VERB.has(t) || MCP_AMBIGUOUS_VERB.has(t)
    || MCP_NEUTRAL_TOKEN.has(t) || MCP_DOCS_QUALIFIER.has(t);
  if (!raw.every(t => safe(t) || fromServer.has(t))) return false;
  const tokens = raw.filter(t => !fromServer.has(t));
  if (tokens.length === 0) return false;
  // Ambiguous verb -> sole gate, before the read-verb branch: read only when every other token is
  // a docs qualifier (at least one); any noun, connector or read verb -> deny.
  if (tokens.some(t => MCP_AMBIGUOUS_VERB.has(t))) {
    return tokens.some(t => MCP_DOCS_QUALIFIER.has(t))
      && tokens.every(t => MCP_AMBIGUOUS_VERB.has(t) || MCP_DOCS_QUALIFIER.has(t));
  }
  return tokens.some(t => MCP_READ_VERB.has(t));
}

// state.mcpAllow escape hatch (exact name or `mcp__server__*` prefix): `balanced` only, before
// the heuristic; `strict` keeps only STRICT_MCP_SERVER read tools.
function isMcpAllowListed(list, tool) {
  return list.some(e => (e.endsWith('*') ? tool.startsWith(e.slice(0, -1)) : e === tool));
}

// The deny reason is the model's only explanation of the wall: what to do instead, why, and the exit.
const EXIT_HINT = 'Manager mode keeps the main context for orchestration, so pass this step to a subagent with the Agent tool: subagents are not restricted, and reading, search and task tracking still work here. The wall comes off only when the user asks: `/brewtools:manager-setup disable`, whose bare `node <project>/.claude/brewtools/manager/manager-state.mjs set hard=false` is the one Bash command allowed at every level.';

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

// Command -> argv segments split on &&, ||, ;, |, &, newline (quote-aware); null = unbalanced
// quotes or forbidden metachar -> cannot classify -> deny.
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

// ---- self-exempt: ONLY `node <helper> get|set ...`, so `disable`/`level` run under the wall ----
// Anchor = realpath of the helper shipped beside this guard (a tail regex let a planted copy disarm it).
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

// Helper grammar `get|set [key=value ...] [--cwd DIR]`, mirrors parseCliArgs in lib/manager-state.mjs:
// never allow a shape the helper rejects (mcpAllow = comma list of MCP_ALLOW_ENTRY_SRC, empty clears).
const STATE_CLI_PAIR = new RegExp(
  `^(?:hard=(?:true|false)|level=(?:strict|balanced)`
  + `|mcpAllow=(?:|${MCP_ALLOW_ENTRY_SRC}(?:,${MCP_ALLOW_ENTRY_SRC})*))$`
);

function isStateCliArgs(args) {
  if (args[0] !== 'get' && args[0] !== 'set') return false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--cwd') { if (!args[++i]) return false; continue; }
    if (a.startsWith('-')) return false;
    if (args[0] !== 'set') return false;
    if (!STATE_CLI_PAIR.test(a)) return false;
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

// ---- balanced Bash classifier: default-deny allowlist + per-binary exec-flag vetting ----
// A binary is listed only if it cannot exec; never a wrapper (`env`, `timeout`, `xargs`).

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

// THE allowlist, one table: bare binary name -> vetter (true = argv exec-free; null = args unrestricted).
// Bare names only, so `/bin/ls`, `VAR=x ls` and `env ls` never match.
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

// Shown in the balanced Bash/Monitor deny so the model can rephrase instead of retrying blind.
const READONLY_HINT = 'ls, cat, head, tail, rg, grep, find, jq, git status|log|diff|show, gh <group> view|list; no redirection, no $(...)';

// A subagent call carries a non-empty string agent_id (hook-agent verifiers: `hook-agent-<uuid>`).
function isSubagent(input) {
  return !!input && typeof input.agent_id === 'string' && input.agent_id !== '';
}

// Registered with onFailure:"block": any exit other than 0/2 blocks main AND subagent calls,
// so a fault outside the try below ends as a plain blocking error (exit 2), never a crash.
function lastResort(err) {
  process.stderr.write(`Hard wall: the guard failed outside its handler (${err && err.message}) and blocks by default.\n`);
  process.exit(2);
}
process.on('uncaughtException', lastResort);
process.on('unhandledRejection', lastResort);

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

    // (b) LINCHPIN: only agent_id marks a subagent. agent_type is NOT one: a `claude --agent`
    // main thread carries it too (no agent_id), so an OR here disarms the wall there.
    if (isSubagent(input)) {
      output({});
      return;
    }

    const level = state.level === 'strict' ? 'strict' : 'balanced';
    const tool = input.tool_name || '';
    const toolInput = input.tool_input || {};

    // (c) Always-allow set (delegation, reading, tracking, session scheduling).
    if (ALWAYS_ALLOW.has(tool)) { output({}); return; }

    // (d) Always-block tools.
    if (ALWAYS_BLOCK.has(tool)) {
      deny(`Hard wall: ${tool} is blocked in the main session.`);
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

    // (g) Bash, and Monitor: its `command` is a shell command, so it gets the Bash rule. A
    // Monitor call without one (the `ws` source) has nothing to classify and is denied.
    if (tool === 'Bash' || tool === 'Monitor') {
      if (level === 'strict') {
        deny(`Hard wall (strict): ${tool} is blocked in the main session.`);
        return;
      }
      if (isReadonlyCommand(toolInput.command)) { output({}); return; }
      deny(`Hard wall (balanced): the main session runs only read-only ${tool} commands (${READONLY_HINT}), and this one is not provably read-only.`);
      return;
    }

    // (h) WebSearch.
    if (tool === 'WebSearch') {
      if (level === 'balanced') { output({}); return; }
      deny('Hard wall (strict): WebSearch is blocked in the main session.');
      return;
    }

    // (i) MCP: allow-listed name, else token classification of the segment after the second
    // `__`. Any unknown token, an empty segment or a malformed name is denied.
    if (tool.startsWith('mcp__')) {
      const parts = tool.split('__');
      const server = parts[1] || '';
      const segment = parts.length >= 3 ? parts.slice(2).join('__') : '';
      const readOnly = isReadOnlyMcpTool(server, segment);
      if (level === 'strict') {
        // Code search is reading: strict keeps the read-only tools of the semble server only.
        if (server === STRICT_MCP_SERVER && readOnly) { output({}); return; }
        deny(`Hard wall (strict): MCP tool ${tool} is blocked in the main session; strict keeps only the read-only mcp__${STRICT_MCP_SERVER}__* search tools.`);
        return;
      }
      if (isMcpAllowListed(state.mcpAllow, tool) || readOnly) { output({}); return; }
      deny(`Hard wall: MCP tool ${tool} is blocked in the main session: its name carries a token the read-only classifier does not recognise (a write verb, or simply a domain noun it has never seen). If it is genuinely read-only, list it in "mcpAllow" in .claude/brewtools/manager/state.json (exact "mcp__server__tool" or "mcp__server__*").`);
      return;
    }

    // (j) Default-deny everything else.
    deny(`Hard wall: ${tool || 'this tool'} is blocked in the main session.`);
  } catch {
    // Fail-closed: a guard bug must not silently open the wall. Subagents stay free —
    // their pass-through is decided before any classification can throw.
    if (isSubagent(input)) { output({}); return; }
    deny('Hard wall: the guard hit an internal error and denies by default.');
  }
})();
