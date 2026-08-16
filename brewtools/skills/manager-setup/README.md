# Manager

Manager mode has **two independent layers**. Keep them straight:

| Layer | What | Scope | Persistent |
|-------|------|-------|-----------|
| **SOFT codewords** (`++m` / `++rr` / `++r` / `++a`) | A `UserPromptSubmit` hook auto-injects a delegate-everything Manager prompt for ONE turn when it sees a codeword (`++m` is plan-aware — adds the plan supplement when `permission_mode === 'plan'`). **Always fires — this skill does NOT enable/disable it.** The skill only customizes the TEXT (`edit`/`purge`) and explains it (`status`). | Global or project (prompt text) | Yes (hook is always on) |
| **HARD wall** | An opt-in `PreToolUse` guard physically DENIES mutating tools (Write/Edit/Bash/…) in the **main session**, leaving only delegate/read/track. Subagents stay fully free. **Project-only, defaults OFF, installed into the project by this skill.** No codeword for the wall. | Project only | Yes, until `disable`/`uninstall` |

The two layers are orthogonal: codewords shape the Manager mindset; the wall enforces delegation by removing the tools that let the agent act as an executor. Either can be used alone.

## Codewords (SOFT — always active)

Detection — `++m` (plan-aware), the review group `++rr` → `++r` (longest-prefix first), and `++a` (Architecture — standalone independent group, no prefix collision).

| Type anywhere in your prompt | Means | Injects | When |
|------------------------------|-------|---------|------|
| `++m` | Manager — delegate-everything for the current task; PLAN-AWARE (auto-adds the plan supplement in plan mode) | Manager (full) block, or full + plan addon when `permission_mode === 'plan'` | Always — hook-driven, independent of this skill |
| `++rr` | Regression Review — after each significant phase: no regression + project standard + correctness; two-phase review→double-check→fix; final cross-review at task end | Regression Review discipline (`review-regression`) block | Always — tested before `++r`; codeword-only |
| `++r` | Review — two-phase multi-agent review→double-check→fix after each significant change | Review discipline (`review-double`) block | Always — codeword-only (no ambient/wall injection) |
| `++a` | Architecture — architecture-first directive before implementation: fits existing project architecture/patterns/rules, robust + scalable + SIMPLE (no over-engineering), find the closest well-built counterpart in the repo and take its principles (additive to conventions/rules/docs, not a replacement), clean seams | `[DIRECTIVE: ARCHITECTURE-FIRST]` block | Independent group; combines with `++m`/`++rr`/`++r`; mode-agnostic — same block in normal and plan mode (written into the plan in plan mode) |

The block applies to that one turn only. When the HARD wall is armed, the Manager (full) block is also ambient-injected every turn — no codeword needed. Codewords and wall injection are independent. Review codewords (`++rr`/`++r`) are never ambient-injected.

## Commands

| Command | What it does |
|---------|-------------|
| `/brewtools:manager-setup` | No argument = `status`. |
| `/brewtools:manager-setup status` | Print wall state (armed/disarmed, level, registered?), prompt sources, and both injected blocks |
| `/brewtools:manager-setup install` | Install the HARD wall guard into this project. Asks to confirm before arming (`AskUserQuestion`) unless your prompt already said so explicitly (e.g. "enable the hard wall") — plain `install` or autonomy phrasing never counts; declining still installs and leaves `state.hard=false`. `/reload` only on FIRST install. |
| `/brewtools:manager-setup upgrade` | Re-copy the guard from the current plugin version and re-register if missing. `hard`/`level` preserved; aborts if not installed. |
| `/brewtools:manager-setup enable` | Arm an already-installed wall (state flip only) — same confirm gate as `install`; declining aborts with nothing changed. Not installed → routes you to `install`. |
| `/brewtools:manager-setup disable` | Disarm the HARD wall (state flip only; registration stays in `settings.local.json`). Guard no-ops until re-armed. |
| `/brewtools:manager-setup uninstall` | Deregister the wall from `settings.local.json` + delete the copied guard. Auto-disarms first. State and prompt overrides KEPT. Run `/reload` after. |
| `/brewtools:manager-setup purge [--scope global\|project]` | `uninstall` + delete `state.json` and the prompt override(s). The only destructive action. |
| `/brewtools:manager-setup level <strict\|balanced>` | Set wall strictness (project only). `balanced` = read-only Bash allowed; `strict` = all Bash denied. |
| `/brewtools:manager-setup edit [full] [--scope ...]` | Copy default block to an override and show the path for editing |
| `/brewtools:manager-setup <any task>` | Inline Manager run — prepends the full block and delegates the task |

The wall verbs are project-only — `--scope` applies to `edit`/`purge` (the prompt-text override files) and is ignored elsewhere. `on`, `off`, `reset`, `setup` and `remove` are no longer commands. Only `on` / `off` / `reset` survive, as free-text synonyms routed to `enable` / `disable` / `purge`; `setup` and `remove` route nowhere.

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

Ambiguous or conflicting input triggers `AskUserQuestion`.

## Scopes & resolution

| Scope | State file | Prompt overrides |
|-------|-----------|------------------|
| Project (default) | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/prompts/<mode>.md` |
| Global | `~/.claude/manager/state.json` | `~/.claude/manager/prompts/<mode>.md` |

Resolution order (first hit wins):
- **State** `{enabled, mode}`: project → global → default `{enabled:true, mode:"full"}`
- **Wall flags** `{hard, level}`: **project only** — global state never enables the wall
- **Prompt** `<mode>`: project → global → plugin default (`skills/manager-setup/references/<mode>.md`)

Global paths (`~/.claude/manager/*`) are protected for the Write/Edit tools, so the skill writes them through bundled Node helpers via Bash. Project paths are plain writes.

## Hard wall

The HARD wall is an **installed-into-the-project** `PreToolUse` guard, NOT a plugin hook.

**Install-once + state-gate** is the design crux:

| Thing | Where | Note |
|-------|-------|------|
| Guard source | `$BT_ROOT/hooks/hardmode-guard.mjs` | Shipped with plugin; project copy updated on every `install`/`upgrade` |
| Copied guard | `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` | The actual file that runs |
| Copied off-switch CLI | `<cwd>/.claude/brewtools/manager/manager-state.mjs` | Fixed path so the disarm command needs no `$BT_ROOT` resolution (resolution needs shell operators the wall denies) |
| Registration | `<cwd>/.claude/settings.local.json` — `PreToolUse "*"` entry | Personal, gitignored. Persistent plumbing; harmless inert when wall is off. |
| Runtime kill-switch | `<cwd>/.claude/brewtools/manager/state.json` `{hard}` | `enable`/`disable` flip this only — never touch `settings.local.json` |

`install` = copy guard + off-switch CLI + register (idempotent), then arm ONLY on explicit confirmation (`AskUserQuestion` "Yes, arm it now", or explicit wording already in the prompt) — declining still installs but leaves `hard=false`. `/reload` only on first install.
`upgrade` = re-copy both files + re-register if missing + restamp `state.json`'s `version`/`generated_by`/`last_updated` (empty-partial `writeState`, so `hard`/`level` survive verbatim — that is what clears the `stale` verdict `setup-status` reads off the same key). Aborts when not installed. Also backfills the off-switch CLI into projects installed before it existed.
`enable` / `disable` = flip `state.hard` only. `enable` is gated by the same confirm step as `install` — declining aborts, nothing changes. Guard stays registered; while disabled it no-ops.
`uninstall` = TWO Bash calls: the bare exempt disarm, then deregister + delete copies. Then `/reload`.
`purge` = `uninstall` + delete `.claude/brewtools/manager/` (state + prompt overrides).

### Tool buckets (while wall is ON)

| Bucket | Tools | Main session |
|--------|-------|-------------|
| ALWAYS-ALLOW | read: `Read`, `Grep`, `Glob`, `NotebookRead` · delegate: `Task`, `Agent`, `Skill`, `SlashCommand`, `ListAgents`, `SendMessage`, `Monitor` · plan: `EnterPlanMode`, `ExitPlanMode` · discovery: `ToolSearch` · track: `TaskCreate/Update/List/Get`, `TodoWrite`, `ReportFindings` · shells: `BashOutput`, `KillShell`, `KillBash` · MCP meta: `ListMcpResourcesTool`, `ReadMcpResourceTool` · `AskUserQuestion` | Allowed — none of them can mutate the workspace |
| ALWAYS-BLOCK | `Write`, `Edit`, `NotebookEdit`, `WebFetch`, `Artifact` (default-deny — it publishes), MCP-write tools | Denied |
| LEVEL-gated | `Bash`, `WebSearch`, MCP-read tools | Decided by `level` |

The `agent_id` linchpin: subagent tool calls carry `agent_id` → guard allows. Main session calls have no `agent_id` → guard applies the wall. Subagents are always fully free.

### strict vs balanced

| Aspect | `strict` | `balanced` (default) |
|--------|----------|----------------------|
| `Bash` | All Bash denied — even `git status` must go to a subagent | Read-only inspection allowed (`git status/log/diff`, `ls`, `cat`, `gh ... list/view`, etc.) |
| `WebSearch` | OFF | ON |
| MCP-read | Explicit-allow list only | Heuristic allow (read-shaped tool names) |
| MCP-write | Denied | Denied |

### Off-switch safety

Exactly ONE Bash shape survives an armed wall, at every level:

```
node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
```

`/brewtools:manager-setup disable` runs precisely that (`Skill` is in ALWAYS-ALLOW, so the skill can always start). The exemption is narrow on purpose: the command must start with `node `, carry no shell operator outside quotes, no `$` expansion, no evaluator flag (`-e`/`--eval`/`-p`/`--print`/`--input-type`/`--require`/`--import`/`--loader`), and **the script node actually executes must be the helper itself** — a `manager-state.mjs` substring elsewhere on the line counts for nothing. Appending `&& echo "✅"` or a `BT_ROOT=...` prelude makes the guard deny it.

> Before v5.0.0 the exemption matched that substring anywhere, so `node -e "<payload>" manager-state.mjs` executed arbitrary code at `level strict`. Do not relax it back to tolerate `&&`.

Universal fallback: delegate to a subagent — `Task`/`Agent` are always allowed and subagents bypass the wall. Every deny message from the guard includes the exit command verbatim.

> **If you installed the wall before v5.0.0, run `/brewtools:manager-setup upgrade` once.** The disarm command above runs a project-local `manager-state.mjs`, and only `install`/`upgrade` copy it there. An older project has no such file, so the command fails with `Cannot find module` and the wall has no documented off-switch. `upgrade` backfills it and leaves `hard`/`level` untouched.
>
> If the wall is already armed when you discover this, do not try to resolve `$BT_ROOT` in the main session — that needs shell operators the wall denies. Delegate one subagent (`Task` is always allowed, subagents bypass the wall) to run `upgrade`, then re-issue the bare disarm command.

## Modes (prompt text)

| Mode | Selected by | Block |
|------|-------------|-------|
| `full` | `++m` (not in plan mode) | Manager role + protocol: decompose → TaskGraph → delegate → observe → integrate. Hands off everything. |
| `planmode` | `++m` when `permission_mode === 'plan'` (auto — no separate codeword) | Full block + Plan Mode addon: the plan itself must encode the whole TaskGraph in English, pre-decomposed with owners, dependencies, and parallel markers. |

## Customizing the prompt

```
/brewtools:manager-setup edit full     # copy default into project override, then edit it
/brewtools:manager-setup purge         # drop the override AND the wall, back to plugin default
```

`edit` creates the override (seeded with the current effective text) if absent, then shows the path. The injected text is everything inside the fenced ``` or ~~~ blocks if present, else the whole file.

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

## Docs

Full docs: [https://doc-claude.brewcode.app/brewtools/skills/manager-setup/](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/)
