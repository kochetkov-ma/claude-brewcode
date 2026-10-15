# Manager

Manager mode is the opt-in **HARD wall**: a `PreToolUse` guard denies mutating tools (Write/Edit/Bash/...) in the **main session**, leaving only delegate/read/track. Subagents stay fully free. **Project-only, defaults OFF, installed into the project by this skill.** There is no codeword for the wall.

## Codewords

`++m`, `++a`, `++rr`, `++r` and bare `+++` (Plan mode) are **not** part of this plugin any more: the [`brewmod-placeholders`](https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-placeholders) mod provides them (Claude Code 2.1.292+).

```
claude plugin install brewmod-placeholders@claude-brewcode
```

`status` prints `codewords: provided by brewmod-placeholders (Claude Code 2.1.292+)` plus that install line. Existing text overrides need no migration: files under `<project>/.claude/brewtools/manager/prompts/` and `<config dir>/manager/prompts/` stay in use through the mod's legacy layer, and `status` lists them. This skill never reads, writes or deletes them. To change codeword text use the mod's `/placeholders edit`.

## Commands

| Command | What it does |
|---------|-------------|
| `/brewtools:manager-setup` | No argument = `status`. |
| `/brewtools:manager-setup status` | Print wall state, task-tools state, the codewords pointer (mod) and any legacy override files. Reports whether a wall is installed (registration or copied guard present): a `state.json` left by `uninstall` is not a wall, so a stale version there recommends `install`, never `upgrade` |
| `/brewtools:manager-setup install` | Install the HARD wall guard into this project. Asks to confirm before arming (`AskUserQuestion`) unless your prompt already said so explicitly (e.g. "enable the hard wall") — plain `install` or autonomy phrasing never counts; declining still installs and leaves `state.hard=false`. Applies live (settings are watched). On Claude Code >= 2.1.233 it also sets the task-tools key `env.CLAUDE_CODE_ENABLE_TODO_TOOLS="1"` in `.claude/settings.local.json`, but only when no settings layer (local, project, user) already sets it; an explicit `0`/`false`/empty value is kept and reported `kept off`. |
| `/brewtools:manager-setup upgrade` | Re-copy the guard and the off-switch CLI from the current plugin version, re-register if missing, add what an older install lacks (`onFailure: "block"`, the task-tools key under the same no-override rule), and restamp `state.json`'s `version`/`generated_by`/`last_updated`, which clears a `stale` verdict in `/brewcode:setup-status`. `hard`/`level` preserved; aborts if not installed (no registration and no copied guard; a leftover `state.json` alone does not count). |
| `/brewtools:manager-setup enable` | Arm an already-installed wall (state flip only) — same confirm gate as `install`; declining aborts with nothing changed. Not installed → routes you to `install`. |
| `/brewtools:manager-setup disable` | Disarm the HARD wall (state flip only; registration stays in `settings.local.json`). Guard no-ops until re-armed. |
| `/brewtools:manager-setup uninstall` | Deregister the wall from `settings.local.json` + delete the copied guard. Auto-disarms first. State, codeword overrides and the task-tools key are KEPT. Applies live; a settings file left `{}` is deleted. |
| `/brewtools:manager-setup purge` | `uninstall` + delete `state.json`, the copied guard and helper (codeword `prompts/` overrides are kept), plus an emptied `.claude/brewtools/`, a leftover `settings.local.json.bak`, an emptied `settings.local.json`/`.claude/`. The task-tools key is removed only when this skill's install added it. The only destructive action. |
| `/brewtools:manager-setup level <strict\|balanced>` | Set wall strictness (project only). `balanced` = read-only Bash allowed; `strict` = all Bash denied. |
| `/brewtools:manager-setup <any task>` | Inline Manager run — delegates the task, wall untouched |

Every verb is project-only; `--scope global` is ignored. `on`, `off` and `reset` are not commands, only free-text synonyms routed to `enable` / `disable` / `purge`; `setup` and `remove` route nowhere.

## Examples

```
# Hard wall: install (arming asks for confirmation unless your prompt said so)
/brewtools:manager-setup install
/brewtools:manager-setup level strict        # no Bash at all in the main session
/brewtools:manager-setup disable             # disarm, registration stays
/brewtools:manager-setup uninstall           # state + codeword overrides kept
/brewtools:manager-setup purge               # remove everything this skill wrote

# Inline Manager run (no wall change)
/brewtools:manager-setup refactor the auth module
```

## NL prompts

Free-text phrases resolve to a command; Russian prompts are accepted too.

| Phrase | Resolves to |
|--------|-------------|
| `install manager`, `install the wall` | `install` |
| `update the guard` | `upgrade` |
| `enable manager`, `manager on`, `arm wall` | `enable` |
| `turn off manager`, `manager off`, `disarm wall` | `disable` |
| `remove hook`, `uninstall` | `uninstall` |
| `reset`, `restore defaults`, `remove everything` | `purge` |
| `level strict`, `strict mode` | `level strict` |
| `level balanced`, `balanced mode` | `level balanced` |
| `manager status`, no argument | `status` |
| `<task> in hard mode` | `hard-one-shot`: confirm, arm, run the task, disarm |
| `<task> as manager` | `manager-run`: run the task as manager, wall untouched |

Ambiguous or conflicting input triggers `AskUserQuestion`.

## State & resolution

| Scope | State file |
|-------|-----------|
| Project (default) | `.claude/brewtools/manager/state.json` |
| Global | `<config dir>/manager/state.json` (informational `mode` only) |

- **Wall flags** `{hard, level}`: **project only** — global state never enables the wall
- **State** `mode` (informational): project → global → default `full`

`<config dir>` = `CLAUDE_CONFIG_DIR`, default `~/.claude`. The project `.claude/` is a protected path: a Write/Edit there is prompted in `default`/`acceptEdits`, allowed in `bypassPermissions`, denied in headless/`dontAsk` runs, and allow rules never pre-approve it. The skill writes through bundled Node helpers via Bash instead.

## Hard wall

The HARD wall is an **installed-into-the-project** `PreToolUse` guard, not a plugin hook. It is registered once and switched by state at run time:

| Thing | Where | Note |
|-------|-------|------|
| Guard source | `hooks/hardmode-guard.mjs` in the plugin | Project copy refreshed on every `install`/`upgrade` |
| Copied guard | `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` | The actual file that runs |
| Copied off-switch CLI | `<cwd>/.claude/brewtools/manager/manager-state.mjs` | Fixed path: locating the plugin would need shell operators the wall denies |
| Registration | `<cwd>/.claude/settings.local.json` — `PreToolUse "*"` entry with `onFailure: "block"` | Personal, gitignored. Persistent plumbing; inert while the wall is off. |
| Runtime kill-switch | `<cwd>/.claude/brewtools/manager/state.json` `{hard}` | `enable`/`disable` flip this only — never touch `settings.local.json` |

`<cwd>` is the session's project dir (`CLAUDE_PROJECT_DIR`, else git toplevel), so the wall also holds in a subdirectory. `uninstall` runs as two Bash calls: the bare exempt disarm, then deregister and delete the copies.

**The registration fails closed.** With `onFailure: "block"`, a guard that cannot start blocks the tool call instead of letting it through (Claude Code >= 2.1.295; older versions ignore the field and fail open). The price: when the registered script is missing — the `.claude/brewtools/` tree deleted by hand, the project moved or renamed — every tool call fails with `blocking because onFailure is "block"`, for the main session and subagents, `Read` included, even with the wall disabled. The only fix is outside the session: delete the `brewtools-manager-guard` entry from `.claude/settings.local.json` in an editor (or with the one-liner under "Recovery" in [SKILL.md](SKILL.md)); watched settings reload live (`/hooks` to confirm). So remove the wall with `disable` or `uninstall`, never by deleting files; the error right after `uninstall`/`purge` means the reload is pending: retry once.

### Tool buckets (while wall is ON)

| Bucket | Tools | Main session |
|--------|-------|-------------|
| ALWAYS-ALLOW | read: `Read`, `Grep`, `Glob`, `LSP` · delegate: `Agent`, `Task`, `Skill`, `Workflow`, `ListAgents`, `SendMessage`, `SubagentHandback` · worktrees: `EnterWorktree`, `ExitWorktree` · plan: `EnterPlanMode`, `ExitPlanMode` · discovery: `ToolSearch`, `WaitForMcpServers` · track: `TaskCreate/Update/List/Get`, `TodoWrite`, `ReportFindings` · timers: `CronCreate`, `CronList`, `CronDelete`, `ScheduleWakeup` · background tasks: `TaskStop` · MCP meta: `ListMcpResourcesTool`, `ReadMcpResourceTool` · `AskUserQuestion` | Allowed by this wall; each tool's permissions and active mode still apply |
| ALWAYS-BLOCK | `Write`, `Edit`, `NotebookEdit`, `WebFetch`, `Artifact` (default-deny — it publishes), every tool not listed here, MCP-write tools | Denied |
| LEVEL-gated | `Bash`, `Monitor` (it runs a shell command), `WebSearch`, MCP-read tools | Decided by `level` |

The `agent_id` linchpin: a tool call whose hook payload carries a non-empty `agent_id` comes from a subagent, and the guard allows it. Every other call is the main session, and the guard applies the wall; that includes a session started with `claude --agent <name>`.

### strict vs balanced

| Aspect | `strict` | `balanced` (default) |
|--------|----------|----------------------|
| `Bash`, `Monitor` | All denied — even `git status` must go to a subagent | Read-only inspection allowed (`git status/log/diff`, `ls`, `cat`, `rg`, `gh ... list/view`, etc.); any redirection or `$(...)` denies the whole command |
| `WebSearch` | OFF | ON |
| MCP-read | Only the read-only `mcp__semble_code__*` code-search tools | Tools whose names read as read-only, plus the entries you list in the `mcpAllow` state key |
| MCP-write | Denied | Denied |

### Off-switch safety

Exactly ONE Bash shape survives an armed wall, at every level:

```
node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

`/brewtools:manager-setup disable` runs precisely that (`Skill` is in ALWAYS-ALLOW, so the skill can always start). The exemption is narrow on purpose: the command must start with `node `, carry no shell operator outside quotes, no `$` expansion, no evaluator flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`), and **the script node actually executes must be the helper installed in this project** — a file merely named `manager-state.mjs` somewhere else counts for nothing. Appending `&& echo "✅"` or a `BT_ROOT=...` prelude makes the guard deny it. Without `--cwd` the helper targets the project it is installed in, so the command works from any subdirectory or worktree.

Universal fallback: delegate to a subagent — the `Agent` tool is always allowed and subagents are not walled. Every deny message from the guard says what to do instead and names the exit command.

> A wall installed before v5.0.0 has no project copy of `manager-state.mjs`, so the disarm command fails with `Cannot find module`. Run `/brewtools:manager-setup upgrade` once; if the wall is armed, delegate the `upgrade` to a subagent, then re-issue the disarm command.

## Related

- [Brewtools overview](../../README.md)
- [Skill source](SKILL.md) and [wall reference](references/hard.md)
- [brewmod-placeholders](https://github.com/kochetkov-ma/claude-brewcode/tree/main/brewmod-placeholders) (codewords)
- [Task Board Setup](../task-board-setup/README.md)
- [Full documentation](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/)
