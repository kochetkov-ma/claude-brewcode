# claude-brewcode

Workspace for Claude Code plugins. Main deliverable: **focus-task** plugin for infinite task execution.

## Focus-Task Plugin

Enables Claude Code to execute complex tasks that exceed single session context limits through automatic state handoff between context compactions.

### Features

- **Infinite Context** — Seamless handoff when context reaches 90%, same session continues
- **Parallel Research** — 5-10 agents analyze codebase before task creation
- **Quorum Reviews** — Multi-agent code review with consensus filtering
- **Knowledge Persistence** — KNOWLEDGE.jsonl survives compacts, injects into agent prompts
- **Semantic Search** — Optional grepai integration for AI-powered code exploration

### Quick Start

```bash
# Install plugin
claude plugin add claude-brewcode/focus-task

# Or run from source
claude --plugin-dir ./plugins/focus-task

# Install prerequisites
/focus-task:install

# Initialize for your project
/focus-task:setup

# Create a task
/focus-task:create "Implement user authentication with JWT"

# Execute with infinite context
/focus-task:start
```

### Skills

| Skill | Purpose |
|-------|---------|
| `/focus-task:install` | Install prerequisites (brew, jq, grepai) |
| `/focus-task:setup` | Analyze project, create adapted templates |
| `/focus-task:create` | Create task with parallel codebase research |
| `/focus-task:start` | Execute task with infinite context handoff |
| `/focus-task:review` | Multi-agent code review with quorum |
| `/focus-task:rules` | Extract rules from KNOWLEDGE to .claude/rules/ |
| `/focus-task:doc` | Generate/update project documentation |
| `/focus-task:grepai` | Setup semantic code search |
| `/focus-task:teardown` | Remove plugin files (keeps tasks) |

### Architecture

```
Session Start
     │
     ▼
┌─────────────────────────────────────┐
│  Execution Loop                      │
│  PreToolUse → Agent → PostToolUse   │
│       ↓                              │
│  ft-coordinator (update state)       │
└─────────────────────────────────────┘
     │
     ▼ (context ~90%)
┌─────────────────────────────────────┐
│  PreCompact Hook                     │
│  - Compact KNOWLEDGE                 │
│  - Write handoff entry               │
│  - Update status → handoff           │
│  ─────── AUTO-COMPACT ───────        │
│  Same session continues              │
└─────────────────────────────────────┘
     │
     ▼
  Task Completion
```

## Documentation

- [Plugin README (Russian)](plugins/focus-task/README.md) — Comprehensive documentation
- [Installation Guide](plugins/focus-task/INSTALL.md) — Setup instructions
- [Release Notes](plugins/focus-task/RELEASE-NOTES.md) — Version history

## Development

```bash
# Run with debug output
CLAUDE_DEBUG=1 claude --plugin-dir ./plugins/focus-task

# Update plugin in marketplace
bash .claude/scripts/update-plugin.sh
```

### Version Sync

When bumping version, update BOTH:
- `plugins/focus-task/.claude-plugin/plugin.json` (source of truth)
- `plugins/.claude-plugin/marketplace.json` (must match)

## License

MIT
