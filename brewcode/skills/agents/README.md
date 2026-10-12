# Agents

Manages Claude Code subagents across all scopes: create new agents, improve existing ones, review quality, sync agent knowledge with the codebase, or inspect what is installed. Input is one free-form prompt in English or Russian; an explicit mode word in it wins, otherwise the mode is inferred from keywords.

## Quick Start

```
/brewcode:agents
```

With no arguments the skill reports the status of agents in every scope. Ask for the menu explicitly to get the interactive choice instead.

Pass a prompt to go straight to a mode:

```
/brewcode:agents create a backend validator agent for Java Spring projects
```

## How It Works

1. **Input gate**: an empty prompt runs `status`; an explicit request for the menu opens it; anything else goes to mode selection.
2. **Mode selection**: an explicit mode token wins, otherwise English and Russian keywords are scored. Before acting, the skill prints a `PLAN — brewcode:agents` block with the input, mode, scope, planned actions and expected result.
3. **Menu** (on request only): one question listing the modes, plus Status (all: agents + rules + skills) and Cancel.
4. **Dispatch**: each mode runs as described under Modes (create, improve and sync use `brewcode:agent-creator`); a created or improved agent file then gets a scoped sync check.
5. **Real status**: inventory per scope (counts, names, load path); state (setup config or `<name>.disabled` parking, legacy `_<name>.md` markers, model); same-name shadowing and duplicate triggers; health flags (missing README or frontmatter, a `tools:` list naming none of `Bash`, `Glob`, `Grep`, weak triggers, rules duplicated in CLAUDE.md).
6. **Final output**: a structured report with detection, result, status and next steps, for every mode except `list`.

## Modes

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Empty prompt, "status", "show me", "статус" / "что есть" / "состояние" | Real status, see step 5 |
| `list` | "list" / "список" / "перечисли" | Plain listing of `*.md` files over all agent scopes |
| `create` | "создай" / "create" / "new" / "добавь" / "scaffold" | agent-creator builds frontmatter + system prompt from description |
| `improve` | "улучши" / "improve" / "refactor" / "fix" / "почини", or a bare existing name/path | agent-creator enhances an existing agent file per chosen focus |
| `review` | "ревью" / "review" / "validate" / "проверь корректность" | the project reviewer agent from `.claude/agents/` (else `general-purpose`) audits agent files, two-phase (review -> double-check findings -> report) |
| `sync` | "sync", "синк", "memory sync", "актуализируй", "обнови знания", "приведи в соответствие с кодом" | one agent-creator per agent re-verifies its claims against the codebase and corrects stale knowledge |

Batch flag (not a mode): a plural form, "все" / "all", or several names or paths fan out to one specialist spawn per item.

## Sync mode

Re-verifies every claim in agent files against the current codebase and corrects drift. Shared implementation with `/brewcode:skills sync`: [`../skills/references/mode-sync.md`](../skills/references/mode-sync.md).

| Scope | Trigger | Evidence |
|-------|---------|----------|
| `repo` (default) | no scope given | whole working tree |
| `session` | "this session", "по текущей сессии" | decisions, user corrections, bugs hit in the current conversation |
| `commit` | "last commit", "по коммиту", a SHA, range or tag | `git show`/`git diff <ref>`, default `HEAD` |

Announces `Sync scope: <scope> — <evidence> | targets: <N>` before editing. Non-growth: every edited file ends at or below its original line count, total delta <= 0. Order: DELETE stale/dead/duplicate/obvious content first, then FIX, then ADD (non-obvious, source-verified only).

Verdicts: `STALE`, `DEAD`, `DUPLICATE`, `OBVIOUS`, `DRIFT`, `MISSING`.

Report table: `File | Lines before -> after | Fixed | Deleted | Added | Key change`, plus corrected facts, additions with source, skipped files, and total delta.

Targets: `.claude/agents/*.md`, `*/agents/*.md` (repo-local only). Disabled files (`_name.md`) are skipped and reported. `/brewdoc:memory-sync-setup` emits a project-local `/memory-sync` skill that applies the same non-growth sync to CLAUDE.md, rules, conventions, agents and skills together — use this skill when you want a roster on its own.

## Parameters for Create / Improve

| Parameter | Options | Notes |
|-----------|---------|-------|
| Scope | Project (`.claude/agents/`), Global (`~/.claude/agents/`), Plugin (`brewcode/agents/`) | Plugin is offered only inside the brewcode plugin workspace; all open questions come in one batch |
| Model | `sonnet` (recommended), `opus` / `fable`, `haiku`, `inherit` | `inherit` writes `model: inherit`, so the agent runs on the session model |
| CLAUDE.md update | Yes / No | Adds or updates the agents table row in CLAUDE.md |
| Improve focus | `triggers`, `system-prompt`, `both`, `full review` | Improve mode only |
| Description | at most 150 tokens, lead sentence at most 160 characters, 3-7 triggers | Description Budget in `references/agent-template.md`; 100 characters is an optional brevity target |

## Examples

```bash
# Status of agents in every scope (default)
/brewcode:agents

# Open the interactive menu
/brewcode:agents show the menu

# Create a new agent with a plain-English description
/brewcode:agents create a SQL migration reviewer for PostgreSQL

# Improve an existing agent by describing what to fix
/brewcode:agents improve the reviewer agent's trigger keywords

# Audit all agents for quality issues
/brewcode:agents review all project agents

# Sync agent knowledge with the codebase (default scope: repo)
/brewcode:agents sync

# Sync only what changed in the last commit
/brewcode:agents sync commit

# Plain listing of agent files across all scopes
/brewcode:agents list
```

## Output — Agent Scopes

| Scope | Directory | Writable |
|-------|-----------|----------|
| Project | `.claude/agents/` | yes |
| Global | `~/.claude/agents/` | yes |
| Plugin source | `brewcode/agents/` | only inside the brewcode plugin workspace |
| Installed plugin | the plugin's own `agents/` | no, reported only |

Status and list cover every scope. Create and improve write only to the scope chosen.

## Tips

- After creation, check the triggers in the agent's `description`: they decide automatic agent selection.
- Run `improve` with focus `triggers` on high-use agents to pick up new project vocabulary.
- `list` is the fastest way to count agents and spot scope imbalance before a review.

## Documentation

Full docs: [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/)
