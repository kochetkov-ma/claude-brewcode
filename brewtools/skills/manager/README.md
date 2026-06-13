# Manager

Manager mode turns the agent into a pure orchestrator: it plans, builds a TaskGraph, and delegates every unit of real work to expert subagents — never writes code or runs builds by hand.

A `UserPromptSubmit` hook watches every prompt for a codeword and injects the Manager prompt for that single turn (only while Manager mode is enabled). This skill is the control plane.

## Codewords

| Type anywhere in your prompt | Injects | When |
|------------------------------|---------|------|
| `++m` | Manager (full) block | `enabled !== false` |
| `++mp` | Manager + Plan Mode block | `enabled !== false` |

`++mp` is matched before `++m` (prefix collision). The block applies to that one turn only.

## Commands

| Command | What it does |
|---------|-------------|
| `/brewtools:manager on [--scope global\|project]` | Enable injection (codewords active). Default scope: project |
| `/brewtools:manager off [--scope global\|project]` | Disable injection (codewords ignored) |
| `/brewtools:manager mode <full\|planmode> [--scope ...]` | Set default mode (informational state field — the codeword still selects the block: ++m=full, ++mp=planmode) |
| `/brewtools:manager status` | Print enabled?, source, default mode (informational), prompt sources, codewords, full injected blocks |
| `/brewtools:manager edit [full\|planmode] [--scope ...]` | Copy default block to an override and open it for editing |
| `/brewtools:manager reset [full\|planmode] [--scope ...]` | Delete the override, revert to plugin default |
| `/brewtools:manager <any task>` | Inline Manager run — prepends the full block and delegates the task |

## NL prompts (RU+EN)

| Phrase | Resolves to |
|--------|-------------|
| `включи менеджера`, `enable manager`, `manager on` | `on` |
| `выключи менеджера`, `turn off manager`, `manager off` | `off` |
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
- **Prompt** `<mode>`: project → global → plugin default (`skills/manager/references/<mode>.md`)

Global paths (`~/.claude/manager/*`) are protected for the Write/Edit tools, so the skill writes them through the bundled Node helpers via Bash. Project paths are plain writes.

## Modes

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
/brewtools:manager on
++m implement the new caching layer
/brewtools:manager mode planmode
++mp design the migration from v1 to v2 schema
/brewtools:manager status
включи менеджера глобально
/brewtools:manager refactor the auth module          # inline Manager run
```

## Docs

Full docs: [https://doc-claude.brewcode.app/brewtools/skills/manager/](https://doc-claude.brewcode.app/brewtools/skills/manager/)
