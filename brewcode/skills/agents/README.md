# Agents

Manages Claude Code subagents across all scopes — create new agents, improve existing ones, audit quality, sync agent knowledge with the codebase, or inspect what is installed. Input is ONE free-form natural-language prompt; there are no keyword subcommands.

## Quick Start

```
/brewcode:agents
```

No arguments: presents the interactive menu with Status (agents) pre-selected as the recommended action.

Pass a free-form prompt to skip the menu entirely:

```
/brewcode:agents create a backend validator agent for Java Spring projects
```

## How It Works — Unified 6-Step Flow

Every invocation goes through the same flow:

1. **Input gate** — reads `$ARGUMENTS`; if empty, goes to the interactive menu.
2. **Auto-mode select** — infers mode from the prompt and announces:
   `Mode: <mode> (agents) — chosen because <evidence>`
3. **No-prompt menu** — when no arguments given, shows a single `AskUserQuestion`:
   - Status (agents) [recommended]
   - Status (all: agents + rules + skills)
   - Create
   - Improve
   - Review
   - Sync agents (memory sync)
   - List (plain)
   - Cancel
4. **Dispatch** — routes create / improve / sync to `brewcode:agent-creator`, review to the project reviewer agent from `.claude/agents/` (else `general-purpose`, two-phase), or runs Glob `*.md` over agent scopes directly (list mode).
5. **Real status** — inventory by scope (counts, names, load path); state (enabled/disabled via `_name.md`, model); overlaps/conflicts (same-name shadowing, duplicate triggers/descriptions); health flags (missing README/frontmatter, agents missing `Bash` in `tools:`, weak triggers, rules duplicated in CLAUDE.md) — not a flat file listing.
6. **Mandatory final output** — structured summary of what was created, modified, or reviewed. Omitted only for `list` mode.

## Modes

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Default for any "show me" intent — "статус" / "что есть" / "состояние" | Inventory per scope, state and model, overlaps, health flags |
| `list` | Explicit only — "list" / "список" / "перечисли" | Globs `*.md` over all agent scopes, plain file listing |
| `create` | "создай" / "create" / "new" / "добавь" / "scaffold" | agent-creator builds frontmatter + system prompt from description |
| `improve` | "улучши" / "improve" / "refactor" / "fix" / "почини", or a bare existing name/path | agent-creator enhances an existing agent file per chosen focus |
| `review` | "ревью" / "review" / "validate" / "проверь корректность" | the project reviewer agent from `.claude/agents/` (else `general-purpose`) audits agent files, two-phase (review -> double-check findings -> report) |
| `sync` | "sync", "синк", "memory sync", "актуализируй", "обнови знания", "приведи в соответствие с кодом" | agent-creator re-verifies agent claims against the codebase and corrects stale knowledge |

Batch flag (not a mode): plural form, "все" / "all", or multiple names/paths — fan-out, one specialist spawn per item.

## Sync mode

Re-verifies every claim in agent files against the current codebase and corrects drift. Shared implementation with `/brewcode:skills sync`: `references/mode-sync.md` (path `${CLAUDE_SKILL_DIR}/../skills/references/mode-sync.md`).

| Scope | Trigger | Evidence |
|-------|---------|----------|
| `repo` (default) | no scope given | whole working tree |
| `session` | "session", "this conversation" | decisions, user corrections, bugs hit in the current conversation |
| `commit` | "commit", "last commit" | `git show`/`git diff <ref>`, default `HEAD` |

Announces `Sync scope: <scope> — <evidence> | targets: <N>` before editing. Non-growth: every edited file ends at or below its original line count, total delta <= 0. Order: DELETE stale/dead/duplicate/obvious content first, then FIX, then ADD (non-obvious, source-verified only).

Verdicts: `STALE`, `DEAD`, `DUPLICATE`, `OBVIOUS`, `DRIFT`, `MISSING`.

Report table: `File | Lines before -> after | Fixed | Deleted | Added | Key change`, plus corrected facts, additions with source, skipped files, and total delta.

Targets: `.claude/agents/*.md`, `*/agents/*.md` (repo-local only). Disabled files (`_name.md`) are skipped and reported. `/brewdoc:memory-sync-setup` emits a project-local `/memory-sync` skill that applies the same non-growth sync to CLAUDE.md, rules, conventions, agents and skills together — use this skill when you want a roster on its own.

## Parameters for Create / Improve

| Parameter | Options | Notes |
|-----------|---------|-------|
| Scope | Project (`.claude/agents/`), Global (`~/.claude/agents/`), Plugin (`brewcode/agents/`) | Asked via single AskUserQuestion |
| Model | `sonnet` (recommended), `opus` / `fable`, `haiku`, `inherit` | `inherit` omits the `model:` field entirely |
| CLAUDE.md update | Yes / No | Adds or updates the agents table row in CLAUDE.md |
| Improve focus | `triggers`, `system-prompt`, `both`, `full review` | Improve mode only |
| Description budget | <=100 characters | Create mode — used as the agent's frontmatter `description` seed |

## Examples

```bash
# Open the interactive menu
/brewcode:agents

# Check the current state of all installed agents
/brewcode:agents what agents do we have

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

Agent files are located in or written to the directory matching the chosen scope:

| Scope | Directory |
|-------|-----------|
| Project | `.claude/agents/` |
| Global | `~/.claude/agents/` |
| Plugin | `brewcode/agents/` |

Status and list modes report agents from all three scopes simultaneously. Create and improve modes write to whichever scope the user selects during the guided prompt.

## Tips

- Run `/brewcode:agents` with no arguments to get the menu — the guided flow is faster than remembering free-form phrases.
- The **"inherit" model** option omits the `model:` field entirely, so the agent uses whatever model the calling session runs on.
- After creation, verify the generated triggers in the agent's `description` frontmatter — trigger quality is the primary driver of automatic agent selection.
- Use `improve` with focus `triggers` periodically on high-use agents to incorporate new project vocabulary and updated invocation patterns.
- `list` is the fastest way to count agents and spot scope imbalance before a review session.

## Documentation

Full docs: [agents](https://doc-claude.brewcode.app/brewcode/skills/agents/)
