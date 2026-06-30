---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Agents

Manages Claude Code subagents across all scopes — create new agents, improve existing ones, audit quality, or inspect what is installed. Input is ONE free-form natural-language prompt; there are no keyword subcommands.

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
   - List (plain)
   - Cancel
4. **Dispatch** — routes to `brewcode:agent-creator` subagent (create / improve / review / batch) or runs Glob `*.md` over agent scopes directly (list mode).
5. **Real status** — rich inventory by scope showing agent names, models, trigger coverage, and last-modified — not a flat file listing.
6. **Mandatory final output** — structured summary of what was created, modified, or reviewed. Omitted only for `list` mode.

## Modes

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Default when no other mode is detected | Shows agents per scope, model breakdown, trigger coverage |
| `list` | Explicit only — "list", "show agents", "what agents" | Globs `*.md` over all agent scopes, plain file listing |
| `create` | "create", "add", "new agent" in prompt | agent-creator builds frontmatter + system prompt from description |
| `improve` | "improve", "update", "refine", or agent name/path in prompt | agent-creator enhances an existing agent file per chosen focus |
| `review` | "review", "check", "audit" in prompt | agent-creator audits agent files for quality and coverage gaps |
| `batch` | "all", "multiple", "both" or plural scope detected | agent-creator fans out across all matching agents in one pass |

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
