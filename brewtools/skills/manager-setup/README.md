# Manager

Manager mode has **two independent layers**. Keep them straight:

| Layer | What | Scope | Persistent |
|-------|------|-------|-----------|
| **SOFT codewords** (`++m` / `++rr` / `++r` / `++a` / bare `+++`) | A `UserPromptSubmit` hook injects the matching prompt block for ONE turn when it sees a codeword. **It always fires — this skill does NOT enable/disable it.** The skill only customizes the text (`edit`/`purge`) and explains it (`status`). | Global or project (prompt text) | Yes (hook is always on) |
| **HARD wall** | An opt-in `PreToolUse` guard denies mutating tools (Write/Edit/Bash/…) in the **main session**, leaving only delegate/read/track. Subagents stay fully free. **Project-only, defaults OFF, installed into the project by this skill.** No codeword for the wall. | Project only | Yes, until `disable`/`uninstall` |

The two layers are orthogonal: either can be used alone.

## Codewords (SOFT — always active)

Alphabetic codewords are case-insensitive standalone tokens. Manager, architecture, and review are independent groups; `++rr` wins over `++r`. A standalone `+++` adds cron planning only when the hook payload confirms Plan mode (`permission_mode === 'plan'`), independently of `++m`. Context order when combined is cron planning, manager, architecture, then the selected review block. Your original prompt, including codewords, is preserved.

| Type anywhere in your prompt | Means | Injects | When |
|------------------------------|-------|---------|------|
| `++m` | Manager — delegate-everything for the current task: call `TaskList` first, reuse an existing task graph and create one only when none exists, hand each unit to a matching expert agent, else `general-purpose`. Plan-aware: in plan mode the plan itself must encode the manager role and the whole TaskGraph in English, pre-decomposed with owners, dependencies, and parallel markers | `full` block, or `planmode` (full + plan addon) when `permission_mode === 'plan'` — auto, no separate codeword | Always |
| `++rr` | Regression Review — after each significant phase: no regression + project standard + correctness; two-phase review→double-check→fix; final cross-review at task end | `review-regression` block | Always — tested before `++r` |
| `++r` | Review — two-phase multi-agent review→double-check→fix after each significant change | `review-double` block | Always |
| `++a` | Architecture — architecture-first directive before implementation: the design goes to a matching architect or reviewer agent, fits the existing project architecture/patterns/rules, stays as simple as possible while scalable (no over-engineering), reuses the closest well-built counterpart in the repo (additive to conventions/rules/docs, not a replacement), and keeps clean seams | `architect` block (`[DIRECTIVE: ARCHITECTURE-FIRST]`) | Independent group; combines with `++m`/`++rr`/`++r`; mode-agnostic — same block in normal and plan mode (written into the plan in plan mode) |
| `+++` | Plan task-specific session anti-drift scheduling for execution | `cron-plan` block | Only verified Plan mode; requires neither `++m` nor the hard wall |

The Injects column names the prompt modes (`<mode>` in the paths below). The block applies to that one turn only, and nothing else is injected per prompt: an armed HARD wall explains itself in the reason attached to each denied tool call and in one notice at session start. A subagent report that quotes a codeword triggers nothing: the hook ignores prompts starting with `<task-notification>` or `<agent-message`.

## Commands

| Command | What it does |
|---------|-------------|
| `/brewtools:manager-setup` | No argument = `status`. |
| `/brewtools:manager-setup status` | Print wall state, prompt sources, codeword behavior, and resolved prompt blocks |
| `/brewtools:manager-setup install` | Install the HARD wall guard into this project. Asks to confirm before arming (`AskUserQuestion`) unless your prompt already said so explicitly (e.g. "enable the hard wall") — plain `install` or autonomy phrasing never counts; declining still installs and leaves `state.hard=false`. `/reload` only on FIRST install. On Claude Code >= 2.1.233 it also sets the task-tools key `env.CLAUDE_CODE_ENABLE_TODO_TOOLS="1"` in `.claude/settings.local.json`. |
| `/brewtools:manager-setup upgrade` | Re-copy the guard and the off-switch CLI from the current plugin version, re-register if missing, add what an older install lacks (`onFailure: "block"`, the task-tools key), and restamp `state.json`'s `version`/`generated_by`/`last_updated`, which clears a `stale` verdict in `/brewcode:setup-status`. `hard`/`level` preserved; aborts if not installed. |
| `/brewtools:manager-setup enable` | Arm an already-installed wall (state flip only) — same confirm gate as `install`; declining aborts with nothing changed. Not installed → routes you to `install`. |
| `/brewtools:manager-setup disable` | Disarm the HARD wall (state flip only; registration stays in `settings.local.json`). Guard no-ops until re-armed. |
| `/brewtools:manager-setup uninstall` | Deregister the wall from `settings.local.json` + delete the copied guard. Auto-disarms first. State, prompt overrides and the task-tools key are KEPT. Run `/reload` after. |
| `/brewtools:manager-setup purge [--scope global\|project]` | `uninstall` + delete `state.json` and the prompt override(s), plus an emptied `.claude/brewtools/` and a leftover `settings.local.json.bak`. The task-tools key is removed only when this skill's install added it. The only destructive action. |
| `/brewtools:manager-setup level <strict\|balanced>` | Set wall strictness (project only). `balanced` = read-only Bash allowed; `strict` = all Bash denied. |
| `/brewtools:manager-setup edit [full] [--scope ...]` | Copy default block to an override and show the path for editing |
| `/brewtools:manager-setup <any task>` | Inline Manager run — prepends the full block and delegates the task |

The wall verbs are project-only — `--scope` applies to `edit`/`purge` (the prompt-text override files) and is ignored elsewhere. `on`, `off` and `reset` are not commands, only free-text synonyms routed to `enable` / `disable` / `purge`; `setup` and `remove` route nowhere.

## NL prompts (RU+EN)

| Phrase | Resolves to |
|--------|-------------|
| `установи стену`, `install manager`, `поставь стену` | `install` |
| `обнови гард`, `update the guard`, `перекопируй хук` | `upgrade` |
| `включи менеджера`, `enable manager`, `manager on`, `вкл стену`, `arm wall` | `enable` |
| `выключи менеджера`, `turn off manager`, `manager off`, `выкл стену`, `стену выключи`, `disarm wall` | `disable` |
| `снеси стену`, `удали хук`, `деинсталлируй`, `remove hook`, `uninstall` | `uninstall` |
| `вычисти`, `снеси всё`, `сброс`, `верни дефолт`, `reset` | `purge` |
| `уровень строгий`, `level strict`, `режим строгий`, `strict mode` | `level strict` |
| `уровень сбалансированный`, `level balanced`, `режим сбалансированный` | `level balanced` |
| `статус`, `что сейчас`, `manager status`, no argument | `status` |
| `поправь промт`, `edit prompt`, `customize` | `edit` |
| `<задача> в хард режиме`, `<task> in hard mode` | `hard-one-shot`: confirm, arm, run the task, disarm |
| `<задача> от роли менеджера`, `<task> as manager` | `manager-run`: run the task as manager, wall untouched |

Ambiguous or conflicting input triggers `AskUserQuestion`.

## Scopes & resolution

| Scope | State file | Prompt overrides |
|-------|-----------|------------------|
| Project (default) | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/prompts/<mode>.md` |
| Global | `~/.claude/manager/state.json` | `~/.claude/manager/prompts/<mode>.md` |

Resolution order (first hit wins):
- **Wall flags** `{hard, level}`: **project only** — global state never enables the wall
- **State** `mode` (informational): project → global → default `full`
- **Prompt** `<mode>`: project → global → plugin default (`skills/manager-setup/references/<mode>.md`)

Global paths (`~/.claude/manager/*`) are protected for the Write/Edit tools, so the skill writes them through bundled Node helpers via Bash. Project paths are plain writes.

## Hard wall

The HARD wall is an **installed-into-the-project** `PreToolUse` guard, not a plugin hook. It is registered once and switched by state at run time:

| Thing | Where | Note |
|-------|-------|------|
| Guard source | `hooks/hardmode-guard.mjs` in the plugin | Project copy refreshed on every `install`/`upgrade` |
| Copied guard | `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` | The actual file that runs |
| Copied off-switch CLI | `<cwd>/.claude/brewtools/manager/manager-state.mjs` | Fixed path: locating the plugin would need shell operators the wall denies |
| Registration | `<cwd>/.claude/settings.local.json` — `PreToolUse "*"` entry with `onFailure: "block"` | Personal, gitignored. Persistent plumbing; inert while the wall is off. |
| Runtime kill-switch | `<cwd>/.claude/brewtools/manager/state.json` `{hard}` | `enable`/`disable` flip this only — never touch `settings.local.json` |

`<cwd>` is the project root (`CLAUDE_PROJECT_DIR`, else the nearest `.git`/`.claude` above the working directory), so the wall also holds in a subdirectory. `uninstall` runs as two Bash calls: the bare exempt disarm, then deregister and delete the copies.

**The registration fails closed.** With `onFailure: "block"`, a guard that cannot start blocks the tool call instead of letting it through (Claude Code >= 2.1.295; older versions ignore the field and fail open). The price: when the registered script is missing — the `.claude/brewtools/` tree deleted by hand, the project moved or renamed — every tool call fails with `blocking because onFailure is "block"`, for the main session and subagents, `Read` included, even with the wall disabled. The only fix is outside the session: delete the `brewtools-manager-guard` entry from `.claude/settings.local.json` in an editor (or with the one-liner under "Recovery" in [SKILL.md](SKILL.md)), then run `/reload`. So remove the wall with `disable` or `uninstall`, never by deleting files; a session that shows the error right after `uninstall`/`purge` only needs `/reload`.

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

## Plan-only session anti-drift

While already in Plan mode, type:

```text
+++ plan the API migration and task tracking
```

This includes a future execution step through task-board: one unique session timer per active
top-level task, hourly by default or at your requested cadence. Prepare the task's methodology,
base work units, complete unique prompt, timezone, schedule id, delivered tick count, and stop
rule. Child work units share their parent's timer. Planning writes no task files and creates or
deletes no timers.

Each delivered tick rereads the goal and methodology, reconciles the task graph (all unfinished
nodes plus the latest ten completed ones), checks drift against the acceptance criteria and
reports in at most five short lines: local time/timezone, tick number and elapsed time; 🟢 results;
🔵 remaining work and next action; 🔴 present problems/blockers/questions; ⚪ drift verdict.
The exact contract is the [cron planning prompt](references/cron-plan.md).

The main session's task-board flow owns scheduling and verifies stopping on completion or
cancellation. Missing scheduling tools are reported as a gap; stored intent is not a live
timer. Timers are session-scoped, and scheduled time does not guarantee exact receipt or
delivery after session closure.

CronCreate, CronList, CronDelete, and ScheduleWakeup pass the hard wall so task-board can own live timer
lifecycle during execution. This allowlist does not override read-only Plan mode.

These are Claude Code product hooks and scheduling contracts. Codex uses its own native
instructions and available tools; these files do not configure Codex runtime state.

## Customizing the prompt

```
/brewtools:manager-setup edit full     # copy default into project override, then edit it
/brewtools:manager-setup purge         # drop the override AND the wall, back to plugin default
```

`edit` creates the override (seeded with the current effective text) if absent, then shows the path. The injected text is everything inside the fenced ``` or ~~~ blocks if present, else the whole file. All blocks injected for one prompt share a 9000-character cap; longer text is truncated.

## Examples

```
# Codewords (always work, no setup needed)
++m implement the new caching layer
# In plan mode (permission_mode === 'plan'), ++m auto-adds the plan supplement:
++m design the migration from v1 to v2 schema
# Architecture-first, combine with Manager delegation:
++m ++a implement the new caching layer

# Hard wall — install for this project (arming requires confirmation)
/brewtools:manager-setup install
# → copies guard, registers in settings.local.json
# → asks "Arm the HARD wall now?" unless your prompt already said so explicitly; Yes arms state.hard=true, No leaves it disarmed
# → if newly registered: "run /reload to activate"

# Tighten to strict (no Bash at all in main session)
/brewtools:manager-setup level strict

# Check current state (also what a bare invocation does)
/brewtools:manager-setup status

# Disarm wall (leave registration in place)
/brewtools:manager-setup disable

# Re-arm it later
/brewtools:manager-setup enable

# After a plugin update, refresh the project copy of the guard
/brewtools:manager-setup upgrade

# Remove wall from this project (state + prompt overrides kept)
/brewtools:manager-setup uninstall
# → deregisters from settings.local.json, run /reload after

# Remove absolutely everything this skill wrote
/brewtools:manager-setup purge

# Prompt-text customization (independent of the wall)
/brewtools:manager-setup edit full

# NL equivalents
включи менеджера глобально
стену выключи
уровень строгий
удали хук

# Inline Manager run (no wall change)
/brewtools:manager-setup refactor the auth module
```

## Related

- [Brewtools overview](../../README.md)
- [Skill source](SKILL.md) and [cron planning prompt](references/cron-plan.md)
- [Task Board Setup](../task-board-setup/README.md)
- [Full documentation](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/)
