# AG Scope, Tools, Precedence

## Available TLs

A non-fork SA inherits built-ins + MCP TLs, then **two filters** narrow it. Verified against live docs + changelog through CC 2.1.309; generate `tools:` against the actual execution pool, !=a static list.

| Filter | Applies to | Effect |
|--------|-----------|--------|
| 1 -- universal | every SA (conversation forks exempt) | Removes `Agent` (at the depth limit only), `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ExitPlanMode` (unless `permissionMode: plan`), `ScheduleWakeup`, `WaitForMcpServers`, `Workflow` -- **even when listed in `tools:`** |
| 2 -- background only | background SAs (the DEF) | Keeps every MCP TL + only the built-ins in the table below; removes every other built-in, inherited or declared |
| forks (`/subtask`; `/fork` when agent view is off) | -- | Skip BOTH filters; get the main conversation's exact pool, history, SP, model + shared prompt cache. A fork can't fork further; `permissions.deny` `Agent(fork)` stops forks only; 2.1.307+ forks launched together each know their own launch |

| Pool | Built-in TLs available |
|------|------------------------|
| Foreground SA | Everything the main conversation has, minus filter 1 (incl. `ListAgents` where cross-session messaging is on) |
| Background SA (DEF) | `Read`, `Grep`, `Glob`, `LSP` (2.1.280+), `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, `Artifact` + all MCP TLs; `Agent` below the depth limit, `ExitPlanMode` when `permissionMode: plan`, `SubagentHandback` for eligible local non-fork auto-mode SAs (2.1.271+). **No `ListAgents`, no Task TLs** |
| AG-teams teammate | Background pool + `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `CronCreate`, `CronDelete`, `CronList` |
| MCP | `mcp__server__tool` -- survives both filters in every pool |

> `Glob`/`Grep` on macOS/Linux/WSL (Windows keeps them in the DEF set): absent from main and every SA, except a SA whose `tools:` names them AND omits `Bash` -- it gets exactly the ones named (for the whole session when that AG runs as MAIN via `--agent`/`agent` setting). `Glob, Grep, Bash` == `Bash`: the two are dropped (probe: no warning, the listing still prints the declared list). `disallowedTools: Bash` alone or a settings allow rule restores nothing; `--allowedTools`/`--tools` naming them, or a session without `Bash`, restores them session-wide. A searching AG lists EITHER `Bash` OR `Glob, Grep` without `Bash` (read-only role).
> Removal is **silent**: a filtered entry is inert clutter, not breakage. A launch is refused only when NOTHING in a non-empty `tools:` resolves (`would be spawned with zero tools — refusing`, entries grouped as unrecognized / not available to subagents / matched no tools in this session) -- so a list made entirely of filtered TLs, or `Agent` alone at the depth limit, refuses to launch. An EMPTY `tools:` list, or `disallowedTools` removing every entry, launches with NO tools and no refusal; omitting `tools:` never refuses.
> Unconditionally filtered TLs never belong in generated `tools:`; retain `Agent`/`ExitPlanMode` only when their conditions apply. `AskUserQuestion`: **a non-fork SA cannot ask the user anything** -- return a decision request to its caller. A conversation fork is exempt; a skill's `context: fork` is a regular SA and is NOT exempt.
> Task TLs are CONDITIONAL, !=assumed: absent from a background SA, present for a foreground SA and for AG-teams teammates, and absent from every SA in a session that has no Task TLs at all. An AG whose body coordinates a task graph needs an explicit fallback -- when `TaskCreate` is unavailable, track the plan in its report file and return the ordering to the caller.

## AG Scope & Precedence

| Priority | Location | Scope | How to Create |
|----------|----------|-------|---------------|
| 1 (highest) | `.claude/agents/` inside the managed-settings dir | Organization-wide | Deployed via managed settings |
| 2 | `--agents` CLI flag | Current session | JSON at launch |
| 3 | `.claude/agents/` | Project | Manual, checked into VCS |
| 4 | `~/.claude/agents/` | User (all projects) | Manual |
| 5 (lowest) | `plugin/agents/` | Where PLG enabled | Installed with PLG |

> Managed definitions use the same FM format and win over a project or user AG of the same name -- never claim a project or CLI AG is authoritative without checking for a managed one. PLG AGs keep their scoped `plugin:subdirs:name` identity and never collide with an unscoped name.
> Managed `strictPluginOnlyCustomization: ["agents"]` stops loading user, project and `--add-dir` AGs (built-in, managed and PLG AGs stay). A PLG's `settings.json` / manifest `settings` may set `agent` = the default MAIN agent (only `agent` + `subagentStatusLine` take effect there).
> Write targets: project `.claude/` and `~/.claude/` are protected paths -- a `Write`/`Edit` there is never auto-approved: `default`/`acceptEdits` -> prompt, auto -> classifier, `dontAsk` -> denied, `bypassPermissions` -> allowed, `plan` -> per its own row in the docs; `permissions.allow` rules never pre-approve it. The docs' exceptions ("such as"): `.claude/worktrees/`, the session's own plan files, a background session's `~/.claude/jobs/<id>/tmp/`, and (without `--restricted`) Markdown in auto-memory and `.claude/agent-memory/` dirs -- `agents`/`skills`/`commands` are not named. Writing an AG file unattended -> expect a prompt or a denial.

### Discovery: walk-up scan (headline fix -- read this before placing a file)

Project scope (priority 3) is not "repo-root only": CC scans **every `.claude/agents/` folder from cwd walking UP to the repo root**, plus `~/.claude/agents/` and any `--add-dir` target's own `.claude/agents/`. Inside each such folder, subfolders are scanned recursively -- the path is cosmetic, `name:` in the file is the real identity (PLG agents get `plugin:subdir:name`).

| Case | Rule |
|------|------|
| Name collision, different dirs on the walk-up path | Definition closest to cwd wins (v2.1.178+) |
| Name collision, same dir | Undefined filesystem read order -- `/doctor` flags it |
| New or edited file | Hot-reloaded within seconds from `~/.claude/agents/` + `.claude/agents/`; restart for the first file in an `agents` dir created after session start, for `--add-dir` AGs (unwatched), and under `--disable-slash-commands` |

> **Author trap:** an AG at `<repo>/<module>/.claude/agents/x.md` is invisible to a session launched with cwd at `<repo>` root -- that dir is not on the walk-up path (a cwd/launch-location mismatch, not a broken file). Fix: put the AG in the repo-root `.claude/agents/`, or launch/`cd`/`--add-dir` into `<module>`. When creating an AG, infer the intended launch cwd (unknown -> return the question to the caller) and place the file accordingly -- then say where you put it and why.

### CLI JSON Format (session-only)

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert reviewer. Use after code changes.",
    "prompt": "You are a senior code reviewer...",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  }
}'
```

> Key = AG name (!=leading `-`); a value takes every other FM field but `color`/`experimental` (ignored, not rejected) + `prompt` (may be empty, 2.1.281+). Invalid value -> `claude` exits 1 (2.1.242+; `--resume`/`--continue` skip the check for inline JSON); `--safe-mode`/`CLAUDE_CODE_SAFE_MODE` ignores `--agents` entirely.

## Agent Tool Call Options

| Option | Since | Notes |
|--------|-------|-------|
| `subagent_type` | 2.1.235 | omission errors when `general-purpose` is unavailable; otherwise fallback can resolve -- BC always passes it explicitly |
| `model` | -- | per-invocation override (`sonnet`/`opus`/`haiku`/`fable`); wins over the definition's `model:`, loses only to `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` (see Model Precedence below) |
| `effort` | 2.1.292 | `low`..`max` for a non-fork SA; overrides the definition's `effort:`, survives a resume, loses to `CLAUDE_CODE_EFFORT_LEVEL` |
| `isolation` | -- | `worktree`; schema also carries `"remote"` (invocation-level only, gated, always backgrounded) -- never valid in FM. A fork may take `"worktree"` too |
| `name` | -- | makes the SA addressable by `SendMessage`. Interactive + AG teams on: a main-conversation spawn with `name` becomes a teammate unless it is a fork or passes `isolation` on the CALL (FM `isolation` doesn't prevent it; the teammate then runs in main's cwd). `-p`/SDK never spawn teammates. Absent from the `-p` schema (probe 2.1.309: `description, effort, isolation, model, prompt, run_in_background, subagent_type`) but accepted when passed (2.1.296 probe) |
| `run_in_background` | -- | requests background explicitly. Interactive terminal / VS Code / desktop with fork mode ON: Claude can't wait. `-p`/SDK still offer it (probe 2.1.309): `false` = Claude waits. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` disables it. An in-process teammate's `true` request errors or silently runs in the foreground |

> Permission rules can gate a call parameter (deny/ask only, literal pre-normalization value, `*` wildcard; an omitted parameter never matches): `Agent(model:opus)` (not a full model ID), `Agent(isolation:worktree)`, `Agent(isolation:*)`. Block a SA by name: `permissions.deny` `Agent(<name>)` or `--disallowedTools "Agent(Explore)"`. A user/project AG named `Explore` overrides the built-in (keeps its own `model`); `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` (2.1.198+) removes `Explore`/`Plan`.

## Model Precedence

| Priority | Source | Behavior |
|----------|--------|----------|
| 1 (highest) | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (2.1.257) | forces every SA, teammates and workflow AGs included, onto `CLAUDE_CODE_SUBAGENT_MODEL` (FORCE alone -> main's model; Explore keeps its listed model), overriding both the definition's `model:` and any per-spawn `model`; forks and `model: inherit` skill forks stay on main's model |
| 2 | Per-spawn `Agent(model:...)` | wins over the definition's `model:`; an installed mod's `agent.spawn` model replaces it |
| 3 | Definition `model:` (this AG's FM) | wins over the `CLAUDE_CODE_SUBAGENT_MODEL` default |
| 4 | `CLAUDE_CODE_SUBAGENT_MODEL` (2.1.251+) | a default only, applied when neither 2 nor 3 is set; `inherit` here means unset |
| 5 (lowest) | Main conversation's model | used when no higher source selects a model |

> A generated AG that pins a model for cost/quality should note ops can still force it via `_FORCE`.
> Definition `model: inherit` selects the main model and outranks the env default; Explore/Plan also ignore that default unless `_FORCE` is set. A per-spawn/FM family alias matching main's family keeps main's exact model/version and `[1m]`; the env alias always resolves normally. Organization `availableModels` restrictions can substitute an allowed model. `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` (2.1.296) sets one model for workflow AGs only.

## Spawn From Main Conversation Only (BC workflow)

**CC capability:** SAs can spawn their own SAs. Depth is capped by `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (DEF 3 layers below main, `1` turns nesting off). Verify the live cap, !=hardcode any number.
**BC workflow stance:** spawn ONLY from main conversation regardless of the cap -- nested spawns bypass session binding + hook context injection, each level multiplies token cost + loses ctx fidelity, and nested-spawn mode differs per surface (Execution Modes case 5 in `agent-context-and-execution.md`: foreground by DEF in `-p`/SDK/desktop/VS Code since 2.1.302; only with fork mode OFF does a `-p`/SDK nested BG SA that outlives its launcher report to MAIN). Give `Agent` TL to an AG only when it genuinely orchestrates.

| Case | BC workflow |
|------|-------------|
| SK with `context: fork` from SA | Same `AgentTool` path -- avoid in BC, spawn from main |
| `claude -p` via Bash | Technically runs but not recommended: OOM crashes, ctx loss, unmanageable |

**Recommended patterns:**

| Pattern | How |
|---------|-----|
| Preloaded SKs | `skills:` in FM -- full content injected at startup. Known-upfront, model-invocable SKs only (<=32) |
| Runtime SKs | `Skill` TL in `tools:` (in both pools) -- the AG invokes an unlisted SK mid-run, ctx paid only on use |
| SK with `disable-model-invocation: true` | Neither channel reaches it -- the AG `Read`s the SK's files by path |
| File-based comms | AGs write results to files, next AG reads |

**AG Teams** -- experimental, off unless `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; without it a spawn `name` is only a `SendMessage` address. `TeamCreate`/`TeamDelete` TLs removed v2.1.178: teammates spawn via `Agent(name:...)` (BC: keep one level deep from main), coordinate on the Task + Cron TLs they keep on top of the background pool, and are stopped with `TaskStop`. A teammate takes from its definition: `tools` (in-process: + `SendMessage`, + Task TLs where the session has them) + `model` always; `disallowedTools`, `effort` + `autoCompactWindow` (2.1.296) in-process only; the body appended to (in-process) or replacing (split-pane) the default SP; `mcpServers` split-pane only; `skills` never. A brought-back teammate re-applies a project/`--add-dir` definition only once that exact folder is trusted. Teammates start in the lead's permission mode except `dontAsk`; split-pane ones inherit the lead's `--disallowedTools`/`--tools` (2.1.309), never `--allowedTools`. No nested teams; an in-process teammate's own SAs run in the foreground; `-p`/SDK spawn no teammates. Hook events: `TeammateIdle`, `TaskCompleted`, `TaskCreated`.

> Sources: [SA docs](https://code.claude.com/docs/en/sub-agents)
