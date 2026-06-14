# Manager

Manager mode has **two independent layers**. Keep them straight:

| Layer | What | Scope | Persistent |
|-------|------|-------|-----------|
| **SOFT codewords** (`++m` / `++mp`) | A `UserPromptSubmit` hook auto-injects a delegate-everything Manager prompt for ONE turn when it sees a codeword. **Always fires — this skill does NOT enable/disable it.** The skill only customizes the TEXT (`mode`/`edit`/`reset`) and explains it (`status`). | Global or project (prompt text) | Yes (hook is always on) |
| **HARD wall** | An opt-in `PreToolUse` guard physically DENIES mutating tools (Write/Edit/Bash/…) in the **main session**, leaving only delegate/read/track. Subagents stay fully free. **Project-only, defaults OFF, installed into the project by this skill.** No codeword for the wall. | Project only | Yes, until `off`/`uninstall` |

The two layers are orthogonal: codewords shape the Manager mindset; the wall enforces delegation by removing the tools that let the agent act as an executor. Either can be used alone.

## Codewords (SOFT — always active)

Detection order — longest-prefix first: `++mp` → `++m` → `++rr` → `++r`.

| Type anywhere in your prompt | Means | Injects | When |
|------------------------------|-------|---------|------|
| `++m` | Manager — delegate-everything for the current task | Manager (full) block | Always — hook-driven, independent of this skill |
| `++mp` | Manager for Plan — manager role for plan + delegation; writes the task graph, uses the tasks tool | Manager + Plan Mode block | Always — tested first (prefix collision with `++m`) |
| `++rr` | Regression Review — after each significant phase: no regression + project standard + correctness; two-phase review→double-check→fix; final cross-review at task end | Regression Review discipline (`review-regression`) block | Always — tested after `++m`, before `++r`; codeword-only |
| `++r` | Review — two-phase multi-agent review→double-check→fix after each significant change | Review discipline (`review-double`) block | Always — codeword-only (no ambient/wall injection) |

The block applies to that one turn only. When the HARD wall is armed, the Manager (full) block is also ambient-injected every turn — no codeword needed. Codewords and wall injection are independent. Review codewords (`++rr`/`++r`) are never ambient-injected.

## Commands

| Command | What it does |
|---------|-------------|
| `/brewtools:manager on [--scope global\|project]` | Install HARD wall guard into this project + arm it. Scope flag ignored — wall is always project-only. `/reload` only on FIRST install. |
| `/brewtools:manager off [--scope global\|project]` | Disarm the HARD wall (state flip only; registration stays in `settings.local.json`). Guard no-ops until re-armed. |
| `/brewtools:manager uninstall` | Deregister the wall from `settings.local.json` + delete the copied guard. Auto-disarms first. Run `/reload` after. |
| `/brewtools:manager level <strict\|balanced>` | Set wall strictness (project only). `balanced` = read-only Bash allowed; `strict` = all Bash denied. |
| `/brewtools:manager mode <full\|planmode> [--scope ...]` | Set default prompt-text mode (informational — codeword still selects the block: `++m`=full, `++mp`=planmode) |
| `/brewtools:manager status` | Print wall state (armed/disarmed, level, registered?), prompt sources, and both injected blocks |
| `/brewtools:manager edit [full\|planmode] [--scope ...]` | Copy default block to an override and show the path for editing |
| `/brewtools:manager reset [full\|planmode] [--scope ...]` | Delete the override, revert to plugin default |
| `/brewtools:manager <any task>` | Inline Manager run — prepends the full block and delegates the task |

## NL prompts (RU+EN)

| Phrase | Resolves to |
|--------|-------------|
| `включи менеджера`, `enable manager`, `manager on`, `вкл стену`, `arm wall` | `on` |
| `выключи менеджера`, `turn off manager`, `manager off`, `выкл стену`, `стену выключи`, `disarm wall` | `off` |
| `снеси стену`, `удали хук`, `деинсталлируй`, `remove hook`, `uninstall` | `uninstall` |
| `уровень строгий`, `level strict`, `режим строгий`, `strict mode` | `level strict` |
| `уровень сбалансированный`, `level balanced`, `режим сбалансированный` | `level balanced` |
| `включи глобально`, `enable globally` | `on --scope global` |
| `режим planmode`, `plan mode`, `режим планирования` | `mode planmode` |
| `полный режим`, `full mode` | `mode full` |
| `статус`, `что сейчас`, `manager status` | `status` |
| `поправь промт`, `edit prompt`, `customize` | `edit` |
| `сброс`, `верни дефолт`, `reset` | `reset` |

Ambiguous or conflicting input triggers `AskUserQuestion`.

## Scopes & resolution

| Scope | State file | Prompt overrides |
|-------|-----------|------------------|
| Project (default) | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/prompts/<mode>.md` |
| Global | `~/.claude/manager/state.json` | `~/.claude/manager/prompts/<mode>.md` |

Resolution order (first hit wins):
- **State** `{enabled, mode}`: project → global → default `{enabled:true, mode:"full"}`
- **Wall flags** `{hard, level}`: **project only** — global state never enables the wall
- **Prompt** `<mode>`: project → global → plugin default (`skills/manager/references/<mode>.md`)

Global paths (`~/.claude/manager/*`) are protected for the Write/Edit tools, so the skill writes them through bundled Node helpers via Bash. Project paths are plain writes.

## Hard wall

The HARD wall is an **installed-into-the-project** `PreToolUse` guard, NOT a plugin hook.

**Install-once + state-gate** is the design crux:

| Thing | Where | Note |
|-------|-------|------|
| Guard source | `$BT_ROOT/hooks/hardmode-guard.mjs` | Shipped with plugin; project copy updated on every `on` |
| Copied guard | `<cwd>/.claude/brewtools/manager/hardmode-guard.mjs` | The actual file that runs |
| Registration | `<cwd>/.claude/settings.local.json` — `PreToolUse "*"` entry | Personal, gitignored. Persistent plumbing; harmless inert when wall is off. |
| Runtime kill-switch | `<cwd>/.claude/brewtools/manager/state.json` `{hard}` | `off` flips this only — never touches `settings.local.json` |

`on` = copy guard + register (idempotent) + arm. `/reload` only on first install.
`off` = flip `state.hard=false` only. Guard stays registered but no-ops.
`uninstall` = disarm first (self-exempt), then deregister + delete copy. Then `/reload`.

### Tool buckets (while wall is ON)

| Bucket | Tools | Main session |
|--------|-------|-------------|
| ALWAYS-ALLOW | `Read`, `Grep`, `Glob`, `Task`, `Agent`, `Skill`, `TaskCreate/Update/List/Get`, `TodoWrite`, `AskUserQuestion` | Allowed — delegate / read / track |
| ALWAYS-BLOCK | `Write`, `Edit`, `NotebookEdit`, `WebFetch`, MCP-write tools | Denied |
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

`/brewtools:manager off` is **never blocked**: `Skill` is in ALWAYS-ALLOW, and the `writeState` node command is self-exempt by path anchor — works even under `level strict`. Every deny message from the guard includes the exit command verbatim.

## Modes (prompt text)

| Mode | Codeword | Block |
|------|----------|-------|
| `full` | `++m` | Manager role + protocol: decompose → TaskGraph → delegate → observe → integrate. Hands off everything. |
| `planmode` | `++mp` | Full block + Plan Mode addon: the plan itself must encode the whole TaskGraph in English, pre-decomposed with owners, dependencies, and parallel markers. |

## Customizing the prompt

```
/brewtools:manager edit full          # copy default into project override, then edit it
/brewtools:manager edit planmode --scope global
/brewtools:manager reset full         # drop override, back to plugin default
```

`edit` creates the override (seeded with the current effective text) if absent, then shows the path. The injected text is everything inside the fenced ``` or ~~~ blocks if present, else the whole file.

## Examples

```
# Codewords (always work, no setup needed)
++m implement the new caching layer
++mp design the migration from v1 to v2 schema

# Hard wall — install and arm for this project
/brewtools:manager on
# → copies guard, registers in settings.local.json, arms state.hard=true
# → if first install: "run /reload to activate"

# Tighten to strict (no Bash at all in main session)
/brewtools:manager level strict

# Check current state
/brewtools:manager status

# Disarm wall (leave registration in place)
/brewtools:manager off

# Remove wall entirely from this project
/brewtools:manager uninstall
# → deregisters from settings.local.json, run /reload after

# Prompt-text customization (independent of the wall)
/brewtools:manager mode planmode
/brewtools:manager edit full
/brewtools:manager reset full

# NL equivalents
включи менеджера глобально
стену выключи
уровень строгий
удали хук

# Inline Manager run (no wall change)
/brewtools:manager refactor the auth module
```

## Docs

Full docs: [https://doc-claude.brewcode.app/brewtools/skills/manager/](https://doc-claude.brewcode.app/brewtools/skills/manager/)
