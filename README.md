# claude-brewcode

Workspace for Claude Code plugins. Main deliverable: **brewcode** plugin for infinite task execution.

## Brewcode Plugin

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
claude plugin add claude-brewcode/brewcode

# Or run from source
claude --plugin-dir ./brewcode

# Install prerequisites
/brewcode:install

# Initialize for your project
/brewcode:setup

# Create spec (research + user dialog)
/brewcode:spec "Implement user authentication with JWT"

# Generate execution plan from spec
/brewcode:plan

# Execute with infinite context
/brewcode:start
```

### Skills

| Skill | Purpose |
|-------|---------|
| `/brewcode:install` | Install prerequisites (brew, jq, grepai) |
| `/brewcode:setup` | Analyze project, create adapted templates |
| `/brewcode:spec` | Create SPEC through research + user interaction |
| `/brewcode:plan` | Create PLAN from SPEC or Plan Mode file |
| `/brewcode:start` | Execute task with infinite context handoff |
| `/brewcode:review` | Multi-agent code review with quorum |
| `/brewcode:rules` | Extract rules from KNOWLEDGE to .claude/rules/ |
| `/brewcode:auto-sync` | Universal document sync |
| `/brewcode:grepai` | Setup semantic code search |
| `/brewcode:teardown` | Remove plugin files (keeps tasks) |

### Architecture

```
Session Start
     │
     ▼
┌─────────────────────────────────────┐
│  Execution Loop                      │
│  PreToolUse → Agent → PostToolUse   │
│       ↓                              │
│  bc-coordinator (update state)       │
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

- [Plugin README (Russian)](brewcode/README.md) — Comprehensive documentation
- [Installation Guide](brewcode/INSTALL.md) — Setup instructions
- [Release Notes](brewcode/RELEASE-NOTES.md) — Version history

## Development

```bash
# Run with debug output
CLAUDE_DEBUG=1 claude --plugin-dir ./brewcode

# Update plugin in marketplace
bash .claude/scripts/update-plugin.sh
```

### Version Sync

When bumping version, update BOTH:
- `brewcode/.claude-plugin/plugin.json` (source of truth)
- `.claude-plugin/marketplace.json` (must match)

## License

MIT
