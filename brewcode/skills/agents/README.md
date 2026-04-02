---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Agents

Interactive agent creation and improvement orchestrator. Create new Claude Code agents or improve existing ones through a guided, multi-step workflow powered by the `agent-creator` subagent.

## Quick Start

```
/brewcode:agents create backend validator
/brewcode:agents up reviewer
```

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| help | `/brewcode:agents` (no args) | Print usage summary and stop |
| create | `/brewcode:agents create <description>` | Interactive wizard: scope, model, CLAUDE.md update, then spawns agent-creator |
| up | `/brewcode:agents up <name\|path>` | Resolve agent file, ask improvement focus, spawn agent-creator to enhance it |
| shorthand | `/brewcode:agents <name\|path>` | Same as `up` -- any non-keyword argument triggers improve mode |

## Examples

### Good Usage

```
# Create a new agent with a plain-English description
/brewcode:agents create database migration checker

# Improve an existing agent by name (searches known locations)
/brewcode:agents up reviewer

# Improve by explicit path (shorthand -- no "up" keyword needed)
/brewcode:agents .claude/agents/reviewer.md

# Improve a global agent
/brewcode:agents up ~/.claude/agents/my-helper.md
```

### Common Mistakes

```
# Missing description after "create" -- nothing to create
/brewcode:agents create

# Trying to improve an agent that does not exist -- will fail with NOT_FOUND
/brewcode:agents up nonexistent-agent

# Passing multiple keywords -- only the first keyword is recognized
/brewcode:agents create up reviewer
```

## Workflow

### Create Mode

1. **Questions (single prompt)** -- scope (project / global / plugin), model (sonnet / opus / haiku / inherit), CLAUDE.md update preference.
2. **agent-creator** -- subagent analyzes codebase in parallel, asks clarifying questions about role and tools, writes frontmatter + system prompt, validates against checklist.
3. **brewtools:text-optimize** -- automatic token optimization pass on the generated agent file (requires brewtools plugin).
4. **CLAUDE.md update** -- if approved, adds or creates an agents table row.

### Improve (up) Mode

1. **Resolve** -- locates the agent file by name or path across `.claude/agents/`, `~/.claude/agents/`, and `brewcode/agents/`.
2. **Questions (single prompt)** -- improvement focus (triggers, system prompt, both, or full review) and CLAUDE.md update preference.
3. **agent-creator** -- subagent analyzes current strengths and weaknesses, enhances the file per the chosen focus.
4. **brewtools:text-optimize** -- automatic token optimization pass (requires brewtools plugin).
5. **CLAUDE.md update** -- if approved, updates the existing row or adds a new one.

## Output

The skill produces a structured report:

```
# agents [create|up]

## Detection
| Field | Value |
| Arguments | ... |
| Mode | create / up / help |
| Target | description or resolved path |

## Result
| Field | Value |
| Agent | /path/to/agent.md |
| Model | sonnet / opus / haiku / inherit |
| Scope | project / global / plugin |
| CLAUDE.md | updated / skipped |

## Next Steps
- [recommendations]
```

Agent files are written to the directory matching the chosen scope:

| Scope | Directory |
|-------|-----------|
| Project | `.claude/agents/` |
| Global | `~/.claude/agents/` |
| Plugin | `brewcode/agents/` |

## Tips

- Use **shorthand** (`/brewcode:agents reviewer`) for the fastest path to improving an existing agent -- no `up` keyword needed.
- The **"inherit" model** option omits the `model:` field entirely, so the agent uses whatever model the calling session runs on.
- After creation, review the generated triggers in the agent's `description` frontmatter -- good triggers are the main driver of automatic agent selection.
- Run `/brewcode:agents up` periodically on high-use agents to incorporate new project context and best practices.
