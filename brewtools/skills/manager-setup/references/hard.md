# Manager — HARD wall policy + status text

Contents: Delivery · Tool buckets · Levels (`mcpAllow`, balanced Bash) · `agent_id` linchpin · Off-switch safety · Status explainer.

Read on demand by `SKILL.md` (`status`, `level`), not injected by a hook. `SKILL.md` holds the
exempt-command box, the guard table, recovery and every lifecycle block; this file adds the install
model, the per-tool and per-level policy and the status one-liners. Authority: `hooks/hardmode-guard.mjs`.

The HARD wall is the second, opt-in layer of Manager mode. While `state.hard === true` for the
current project, a `PreToolUse` guard denies mutating tools in the main session, so the only thing
the main agent can do is delegate, read, and track. Subagents are untouched and run with full
tools. The wall is project scope only, defaults OFF, and persists until
`/brewtools:manager-setup disable`. The wall flags (`hard`/`level`) are resolved project-only in
code: the global `state.json` does not enable the wall (only the informational `mode` field may
still resolve from global).

## Delivery: installed INTO the project, NOT a plugin hook

The guard is not registered in the plugin's `hooks.json`: the plugin ships the self-contained guard
at `$BT_ROOT/hooks/hardmode-guard.mjs`, and `/brewtools:manager-setup install` installs it per
project. Install once, gate by state: the registration is persistent, inert plumbing, and
`state.json {hard}` is the runtime kill-switch the guard re-reads on every call.

| Action | Does | Notes |
|--------|------|-------|
| `install` | Copies `$BT_ROOT/hooks/hardmode-guard.mjs` → `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` and the off-switch CLI `manager-state.mjs` beside it (a missing `state.json` is first written disarmed), overwritten on every `install`, so plugin updates propagate to the project copies. Idempotently registers a `PreToolUse` matcher `"*"` entry in `<cwd>/.claude/settings.local.json`: command `node "<ABS copied-guard path>" # brewtools-manager-guard`, `timeout` 5, `onFailure: "block"`. Then `writeState('project', {hard:arm})` LAST: arms only on the P1 confirmation (`SKILL.md`) and after every step above succeeded | The `# brewtools-manager-guard` tag (and the `hardmode-guard.mjs` path) lets `uninstall`/`purge` find the entry; a second `install` matches the existing entry and adds no duplicate. A new entry applies live (settings are watched); an existing one → the state flip alone arms it |
| `upgrade` | Re-copies the shipped guard and `manager-state.mjs` over the project copies, re-adds a missing registration, sets `onFailure: "block"` on an existing one, and restamps `state.json` (`version`/`generated_by`/`last_updated`) through an empty-partial `writeState` | `hard`/`level` survive untouched. Aborts on a project with no wall installed rather than arming one. Backfills a project that lacks the off-switch CLI |
| `enable` | `writeState {hard:true}` on an already registered wall, behind the same P1 confirmation | The mirror of `disable` |
| `disable` | Flips `state.hard=false` with the one self-exempt Bash shape (see Off-switch safety); does not touch `settings.local.json` | An armed guard denies `Edit`/`Bash` on arbitrary files, so a `disable` that edited settings would be blocked; this one succeeds even at `level strict`. The guard stays registered and no-ops because it reads `state.hard` |
| `uninstall` | Two Bash calls: the bare exempt disarm command first, then the deregistration block (allowed only because the first call disarmed the wall), which removes the manager guard entry from `<cwd>/.claude/settings.local.json` and then deletes the copied guard + helper | Keeps `state.json`, the prompt overrides and the task-tools env key. Applies live (settings are watched) |
| `purge` | `uninstall` plus deleting `<cwd>/.claude/brewtools/manager/` (state + prompts), an emptied `.claude/brewtools/`, a leftover `settings.local.json.bak`, an emptied `settings.local.json`/`.claude/` and, at global prompt scope, the six mode files in `<config dir>/manager/prompts/` (`CLAUDE_CONFIG_DIR`, default `~/.claude`; others kept) | Removes `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` only when `state.json` carries `todoToolsAdded: true`, i.e. this skill's install added the key |

`onFailure: "block"` makes the wall fail closed outside the guard process too: a guard that cannot
start blocks the call. Honoured on Claude Code >= 2.1.295; older CLIs ignore the field and fail open.
The cost: a registered entry whose script is missing blocks every tool call, main session and
subagents, armed or not (recovery: `SKILL.md` "Recovery" item 4). Hence the order: script before
registration on `install`/`upgrade`, registration before script on `uninstall`/`purge`.

State lives at `<cwd>/.claude/brewtools/manager/state.json`, registration at
`<cwd>/.claude/settings.local.json` (personal, gitignored); both are project-scoped. `<cwd>` is the
session's project dir (`CLAUDE_PROJECT_DIR`; fallback: skill git toplevel, hooks upward walk for
`.git`/`.claude` → hook cwd), never the raw working directory, so the wall holds from any subdirectory.

## Tool buckets

The ALWAYS-ALLOW set below is the literal `ALWAYS_ALLOW` constant in
`hooks/hardmode-guard.mjs`. Keep the two in lockstep: these inspect/orchestrate;
delegation and session schedules re-enter the wall for later main-session work.

| Bucket | Tools | Main session while wall ON |
|--------|-------|----------------------------|
| ALWAYS-ALLOW · read | `Read`, `Grep`, `Glob`, `LSP` | Allowed — inspect only |
| ALWAYS-ALLOW · delegate | `Task`, `Agent`, `Skill`, `Workflow`, `ListAgents`, `SendMessage`, `SubagentHandback` | Allowed — they only hand work to a subagent; any main-session tool call they cause comes back through this guard |
| ALWAYS-ALLOW · worktrees | `EnterWorktree`, `ExitWorktree` | Allowed — where delegated work is isolated; entering one writes no project file |
| ALWAYS-ALLOW · plan mode | `EnterPlanMode`, `ExitPlanMode` | Allowed — without them an armed wall traps a plan-mode session forever |
| ALWAYS-ALLOW · discovery | `ToolSearch`, `WaitForMcpServers` | Allowed — with `ENABLE_TOOL_SEARCH=true` the `Task*` tools are deferred, so denying `ToolSearch` would make the tracking bucket unreachable |
| ALWAYS-ALLOW · track | `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TodoWrite`, `ReportFindings` | Allowed — tracking/reporting, no filesystem side effects |
| ALWAYS-ALLOW · session schedules | `CronCreate`, `CronList`, `CronDelete`, `ScheduleWakeup` | Allowed — session timer lifecycle; work delivered later still passes through the wall. Task-board owns matching/cleanup; no external/OS scheduler exemption |
| ALWAYS-ALLOW · background tasks | `TaskStop` | Allowed — stops a shell, monitor or agent; its output is read with `Read` |
| ALWAYS-ALLOW · MCP meta | `ListMcpResourcesTool`, `ReadMcpResourceTool` | Allowed — read-only by protocol |
| ALWAYS-ALLOW · human | `AskUserQuestion` | Allowed |
| ALWAYS-BLOCK | `Write`, `Edit`, `NotebookEdit`, `WebFetch` | Denied — hands-on mutation / fetch |
| Default-deny | `Artifact` and every unlisted tool, plus MCP-write verbs | Denied — `Artifact` publishes a page, so it stays out |
| LEVEL-gated | `Bash`, `Monitor` (it runs a shell command), `WebSearch`, MCP-read tools | Decided by `level` (below) |

## Levels: strict vs balanced

`level` only matters while the wall is ON. Default is `balanced`.

| Aspect | strict | balanced (default) |
|--------|--------|--------------------|
| `Bash`, `Monitor` | Fully OFF — every command denied, even `git status` goes to a subagent; only the exempt state CLI runs. Use it for a zero-leak wall | Read-only allowlist (below); a `Monitor` call without a `command` is denied |
| `WebSearch` | OFF | ON |
| MCP-read | Only the read-only `mcp__semble_code__*` search tools; `mcpAllow` is ignored here | Read-only by name (token classifier), plus anything in `mcpAllow` |
| MCP-write | Denied | Denied |

### `mcpAllow` — the escape hatch for a false MCP denial

| Fact | Detail |
|------|--------|
| Where | Optional `mcpAllow: string[]` in project `state.json`; consulted before the classifier, at `balanced` ONLY |
| Entry forms | Exact scoped name `mcp__server__tool`, or whole-server prefix `mcp__server__*`. Nothing else — a bare `mcp__*` is NOT a form, and is dropped by both the helper CLI and the guard |
| When you need it | The classifier is default-deny per token, so an unrecognised write verb denies (intended) and so does an unrecognised domain noun (`mcp__x__get_widgets`) — the latter is the false-denial case this key exists for. Ambiguous verbs (`query`/`resolve`): `SKILL.md` guard table, row MCP; allowlist one only if that server's `query` really cannot write |
| Set, clear | `SKILL.md` "Recovery" item 2. Self-exempt at every level; one invalid entry → exit 2, nothing written; a malformed stored value allows nothing and does not count as broken state |

### balanced — Bash read-only classifier

A `Bash` or `Monitor` command passes only when every segment (split on `&&`, `||`, `;`, `|`, `&`,
newline) is an allowlisted read-only command: default-deny, an allowlist of base commands, not a
shell evaluator and not a list of mutation words. Binaries and denied flags: `SKILL.md` guard table,
row "`balanced` Bash, `Monitor`" (code: `READONLY`, `GIT_EXEC_FLAG`, `RG_EXEC_FLAG`,
`FIND_EXEC_ACTION`). What that row leaves out:

| Rule | Detail |
|------|--------|
| Bare names only | `/bin/ls`, `VAR=x ls` and `env ls` never match |
| `git` | `git status`, `git log`, `git diff`, `git show`, `git rev-parse`, `git describe`; `git remote -v`; `git tag -l`; `git stash list`; `git branch` bare or with listing flags only (`--list`/`-l`, `--show-current`, `-a`/`--all`, `-r`/`--remotes`, `-v`/`-vv`, `--contains`, `--merged`, `--no-merged`, `--format=`) |
| `gh` | a positional read verb: `gh ... list`, `gh ... view`, `gh ... status` |
| `node` | `node --check <file>` only; `node -e` / `--eval` and every other invocation is execution |
| Denied anywhere, quoted or not | command substitution `$(...)` / backticks, any `>` or `<` redirection |
| Exception | the state-write self-exemption, see "Off-switch safety" below |

## The `agent_id` linchpin

The wall blocks the main session and leaves subagents free, otherwise delegation itself would be
impossible. The discriminator in the `PreToolUse` payload is the `agent_id` field, and only that field:

- a non-empty string `agent_id` → a subagent-internal tool call → the guard allows it;
- missing, `null` or empty `agent_id` → main session → the guard applies the wall. That covers the
  spawning `Agent` call itself and a session started with `claude --agent <name>`: its main thread
  is walled like any other.

`agent_type` is not a discriminator: CC 2.1.228 and later set it on the main thread of a `--agent`
session too (without `agent_id`), so accepting it as proof of a subagent disarms the wall for those
sessions. `session_id`/`transcript_path` are identical for main and subagent. Last verified on
recorded CC 2.1.296 payloads; re-verify on a Claude Code upgrade, because a changed field name or
presence makes the wall either block subagents or fail open.

## Off-switch safety (never trap the user)

Exactly one Bash shape survives an armed wall at any level:

```
node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

`install`/`upgrade` copy `manager-state.mjs` into the project for this reason:
the command must be a fixed path with no resolution step, because resolving
`$BT_ROOT` needs shell operators that the wall denies.

`isStateWriteCommand()` in `hooks/hardmode-guard.mjs` decides the exemption; its conditions are
the exempt-command box at the top of `SKILL.md`. The box abbreviates one list - the complete
evaluator-flag set is `-e`, `--eval`, `-p`, `--print`, `--input-type`, `--require`/`-r`, `--import`,
`--loader`, `--experimental-loader`. The shape stays this narrow because anything looser (an eval
flag, a shell operator, a filename match instead of the installed path) runs arbitrary code through
the off-switch, even at `level strict`: when a runbook line is denied, fix the line, never the
exemption.

Consequences for anything that wants to disarm:

1. `/brewtools:manager-setup disable` can always start: `Skill` is in ALWAYS-ALLOW. The skill then
   issues the bare command above as a single Bash call with nothing appended — no `BT_ROOT=`
   prelude, no `&& echo "✅"`, no `|| echo "❌"`.
2. A subagent is the universal fallback. `Agent` is always allowed and subagents pass the wall
   (`agent_id` linchpin), so any block the main session cannot run — `uninstall`'s deregistration,
   `upgrade`, a `status` dump — can be delegated verbatim.
3. Every deny reason carries the exit: a specific reason starting `Hard wall`, then `EXIT_HINT`
   (`hooks/hardmode-guard.mjs`), which tells the model to pass the step to a subagent with the
   `Agent` tool and names `/brewtools:manager-setup disable` with its bare command.

## Status explainer

The template the `status` action fills is the `Shape` block in `SKILL.md` (`### status`): one copy,
next to the block that produces its fields. This file supplies its `Allowlist summary` line:

- `balanced`: read-only Bash and Monitor commands (git status/log/diff, ls, cat, pwd, which, gh list/view), WebSearch ON, MCP-read by name + `mcpAllow`, all mutation denied.
- `strict`: no Bash or Monitor at all, WebSearch OFF, MCP only the read-only `mcp__semble_code__*` search tools (`mcpAllow` ignored), all mutation denied.
