# AG Scope, Tools, Precedence

## Available TLs

A non-fork SA inherits built-ins + MCP TLs, then **two filters** narrow it. `Glob`/`Grep` can also be supplied on macOS/Linux/WSL when absent from main. Verified against live docs + changelog through CC 2.1.285 (2026-09-30); generate `tools:` against the actual execution pool, !=a static list.

| Filter | Applies to | Effect |
|--------|-----------|--------|
| 1 -- universal | every SA (conversation forks exempt) | Removes `Agent` (at the depth limit only), `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ExitPlanMode` (unless `permissionMode: plan`), `ScheduleWakeup`, `WaitForMcpServers`, `Workflow` -- **even when listed in `tools:`** |
| 2 -- background only | background SAs (the DEF) | Keeps every MCP TL + only the built-ins in the table below; removes every other built-in, inherited or declared |
| forks (`/subtask`) | -- | Skip BOTH filters; get the main conversation's exact pool |

| Pool | Built-in TLs available |
|------|------------------------|
| Foreground SA | Everything the main conversation has, minus filter 1 (incl. `ListAgents` where cross-session messaging is on) |
| Background SA (DEF) | `Read`, `Grep`, `Glob`, `LSP` (2.1.280+), `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, `Artifact` + all MCP TLs; `Agent` below the depth limit, `ExitPlanMode` when `permissionMode: plan`, `SubagentHandback` for eligible local non-fork auto-mode SAs (2.1.271+). **No `ListAgents`. No `TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate`** |
| AG-teams teammate | Background pool + `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `CronCreate`, `CronDelete`, `CronList` (`docs/sub-agents.md:351`) |
| MCP | `mcp__server__tool` -- survives both filters in every pool |

> Removal is **silent** (`docs/sub-agents.md:349`): a filtered entry raises no warning, so a stale `tools:` name is inert clutter, not breakage. A launch fails only when NOTHING in `tools:` resolves (`docs/sub-agents.md:287`) -- so a `tools:` list made entirely of filtered TLs refuses to launch.
> Unconditionally filtered TLs never belong in generated `tools:`; retain `Agent`/`ExitPlanMode` only when their conditions apply. `AskUserQuestion`: **a non-fork SA cannot ask the user anything** -- return a decision request to its caller. A conversation fork is exempt; a skill's `context: fork` is a regular SA and is NOT exempt. `TaskOutput` is deprecated: use `Read` on the task output path; background SAs do not retain it.
> Task TLs are CONDITIONAL, !=assumed: absent from a background SA, present for a foreground SA and for AG-teams teammates, and absent from every SA in a session that has no Task TLs at all (`docs/sub-agents.md:353`). An AG whose body coordinates a task graph needs an explicit fallback -- when `TaskCreate` is unavailable, track the plan in its report file and return the ordering to the caller.

## AG Scope & Precedence

| Priority | Location | Scope | How to Create |
|----------|----------|-------|---------------|
| 1 (highest) | `.claude/agents/` inside the managed-settings dir | Organization-wide | Deployed via managed settings |
| 2 | `--agents` CLI flag | Current session | JSON at launch |
| 3 | `.claude/agents/` | Project | Manual, checked into VCS |
| 4 | `~/.claude/agents/` | User (all projects) | Manual |
| 5 (lowest) | `plugin/agents/` | Where PLG enabled | Installed with PLG |

> Managed definitions use the same FM format and win over a project or user AG of the same name (`docs/sub-agents.md:157-165,221-225`) -- never claim a project or CLI AG is authoritative without checking for a managed one. PLG AGs keep their scoped `plugin:subdirs:name` identity and never collide with an unscoped name.
> Write targets: a `Write`/`Edit` TOOL call under `~/.claude/**` is classified sensitive and routed to a permission ASK, !=a hard block. Carve-outs under `.claude/`: `skills`, `agents`, `commands`, `worktrees`, `scheduled_tasks.json`. Mode behaviour: `default`/`acceptEdits`/`plan` -> prompt; `bypassPermissions` -> auto-approved; headless `-p` without bypass -> FAILS (no prompt channel). For unattended state prefer `${CLAUDE_PROJECT_DIR}/.claude/<subdir>/`.
> `/agents` (v2.1.198+) no longer opens a wizard -- prints a reminder to edit `.claude/agents/` files directly.

### Discovery: walk-up scan (headline fix -- read this before placing a file)

Project scope (priority 3) is not "repo-root only": CC scans **every `.claude/agents/` folder from cwd walking UP to the repo root**, plus `~/.claude/agents/` and any `--add-dir` target's own `.claude/agents/`. Inside each such folder, subfolders are scanned recursively -- the path is cosmetic, `name:` in the file is the real identity (PLG agents get `plugin:subdir:name`).

| Case | Rule |
|------|------|
| Name collision, different dirs on the walk-up path | Definition closest to cwd wins (v2.1.178+) |
| Name collision, same dir | Undefined filesystem read order -- `/doctor` flags it |

> **Author trap (the incident this section fixes):** an AG at `<repo>/<module>/.claude/agents/x.md` is invisible to a session launched with cwd at `<repo>` root -- that dir is not on the walk-up path. It is not a broken file, it is a cwd/launch-location mismatch. Fix: put the AG in the repo-root `.claude/agents/`, or launch/`cd`/`--add-dir` into `<module>` so its own `.claude/agents/` is on the walk-up path. When creating an AG, ask (or infer) the intended launch cwd and place the file accordingly -- then say where you put it and why.

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

## Agent Tool Call Options

| Option | Since | Notes |
|--------|-------|-------|
| `subagent_type` | fallback error clarified 2.1.235 | omission errors when `general-purpose` is unavailable; otherwise fallback can resolve -- BC always passes it explicitly |
| `model` | restored 2.1.72 | per-invocation override; wins over the definition's `model:`, loses only to `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` (see Model Precedence below) |
| `isolation` | `worktree` since 2.1.50 | schema also carries `"remote"` (invocation-level only, gated, always backgrounded) -- never valid in FM |
| `name` | stabilized 2.1.206 | required to spawn a teammate (`Agent(name:...)`) instead of an anonymous SA; `TeamCreate`/`TeamDelete` removed v2.1.178 |
| `run_in_background` | -- | requests background explicitly; an in-process teammate's `true` request errors when fork mode and background-disable are both off; definition `background: true` also errors for teammate spawns |

## Model Precedence

| Priority | Source | Behavior |
|----------|--------|----------|
| 1 (highest) | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (2.1.257) | forces every SA, teammates included, onto `CLAUDE_CODE_SUBAGENT_MODEL`, overriding both the definition's `model:` and any per-spawn `model` |
| 2 | Per-spawn `Agent(model:...)` | wins over the definition's `model:` |
| 3 | Definition `model:` (this AG's FM) | wins over the `CLAUDE_CODE_SUBAGENT_MODEL` default |
| 4 | `CLAUDE_CODE_SUBAGENT_MODEL` (2.1.251+) | a default only, applied when neither 2 nor 3 is set; `inherit` here means unset |
| 5 (lowest) | Main conversation's model | used when no higher source selects a model |

> Before 2.1.251, `CLAUDE_CODE_SUBAGENT_MODEL` won over both `model:` and per-spawn `model` -- inverted since. A generated AG that pins a model for cost/quality should note ops can still force it via `_FORCE`.
> Definition `model: inherit` selects the main model and outranks the env default; Explore/Plan also ignore that default unless `_FORCE` is set. A per-spawn/FM family alias matching main's family keeps main's exact model/version and `[1m]`; the env alias always resolves normally. Organization `availableModels` restrictions can substitute an allowed model.

## Spawn From Main Conversation Only (BC workflow)

**CC capability:** since v2.1.172, SAs can spawn their own SAs. Depth is capped by `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (env var, both scopes) -- history 5 (v2.1.172-216) -> 1 (v2.1.217-218) -> **3** (v2.1.219+, current DEF). Verify the live cap, !=hardcode any number.
**BC workflow stance:** spawn ONLY from main conversation regardless of the cap -- nested spawns bypass session binding + hook context injection, and each level multiplies token cost + loses ctx fidelity. Give `Agent` TL to an AG only when it genuinely orchestrates.

| Case | BC workflow |
|------|-------------|
| `Agent(subagent_type=...)` from SA | CC allows, depth-capped -- BC: spawn from main only |
| `Skill` TL from SA | Available -- in both pools (`docs/sub-agents.md:292,349`). Runtime invocation of an unlisted SK is legal; use it when preload would waste ctx |
| SK with `context: fork` from SA | Same `AgentTool` path -- avoid in BC, spawn from main |
| `claude -p` via Bash | Technically runs but not recommended: OOM crashes, ctx loss, unmanageable |
| Deep nesting for speed | Each level multiplies tokens + loses ctx -- prefer flat fan-out |

**Recommended patterns:**

| Pattern | How |
|---------|-----|
| Chaining | Main AG spawns AGs sequentially, passing results |
| Preloaded SKs | `skills:` in FM -- full content injected at startup. Known-upfront SKs only |
| Runtime SKs | `Skill` TL in `tools:` -- the AG invokes an unlisted SK mid-run, ctx paid only on use |
| File-based comms | AGs write results to files, next AG reads |
| AG Teams | Lead coordinates via Task-graph TLs, teammates spawn via `Agent(name:...)` (BC: keep one level deep from main) |

**AG Teams** -- `TeamCreate`/`TeamDelete` TLs removed v2.1.178 (teammates now spawn via `Agent(name:...)`); coordination runs on `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` plus `CronCreate`/`CronDelete`/`CronList`, which teammates keep on top of the background pool. `TaskStop` is in that pool; read partial output with `Read`, not deprecated `TaskOutput`. Hook events: `TeammateIdle`, `TaskCompleted`, `TaskCreated` (v2.1.84).

> Sources: [SA docs](https://code.claude.com/docs/en/sub-agents)
