---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: README for brewcode plugin — user documentation
---

<auto-sync-override>
sources: brewcode/skills/*/SKILL.md, brewcode/.claude-plugin/plugin.json
focus: Commands (table must contain ALL skills from skills/), version (from plugin.json)
preserve: ## Installation, ## Quick Start
checks:
  - Compare command list with `ls skills/` — all must be in the table
  - Version in ## Version must match plugin.json
  - Links to docs/*.md must exist
</auto-sync-override>

# Focus Task

A plugin for Claude Code that executes tasks of any size through automatic state handoff between context compactions. Creates a specification, a phased plan, launches execution with multi-agent verification, and accumulates knowledge throughout the entire task.

## Installation

### From plugin directory

```bash
claude --plugin-dir ./brewcode
```

### Installing dependencies

```bash
/brewcode:install
```

Installs required components (brew, jq, coreutils) and optionally -- semantic search (ollama, grepai).

## Quick Start

```bash
/brewcode:setup                              # 1. Adapt templates for the project
/brewcode:spec "Implement JWT authorization"  # 2. Research + specification
/brewcode:plan                                # 3. Generate phased plan
/brewcode:start                               # 4. Execute with infinite context
```

After `/brewcode:setup`, templates are adapted once. Then for each task -- the cycle `spec` - `plan` - `start`.

## Commands

| Command | Description |
|---------|-------------|
| `/brewcode:setup` | Project analysis, generation of adapted templates and configuration |
| `/brewcode:spec <description>` | Codebase research, user dialogue, SPEC.md creation |
| `/brewcode:plan [path]` | Execution plan generation from SPEC or Plan Mode with quorum review |
| `/brewcode:start [path]` | Task launch with infinite context through automatic handoffs |
| `/brewcode:rules [path]` | Rule extraction from accumulated knowledge to `.claude/rules/` |
| `/brewcode:auto-sync [mode]` | Documentation synchronization (status, init, global, project, path) |
| `/brewcode:grepai [mode]` | Semantic code search (setup, status, start, stop, reindex) |
| `/brewcode:text-optimize [path]` | Text optimization for LLM (-l light, -d deep) |
| `/brewcode:text-human [path]` | Humanize: remove AI artifacts, simplify documentation |
| `/brewcode:mcp-config` | MCP server management (status, enable, disable) |
| `/brewcode:secrets-scan` | Secrets scanning (10 parallel agents) |
| `/brewcode:teardown` | Plugin configuration cleanup (tasks are preserved) |
| `/brewcode:install` | Check and install required components |

> **Note:** `/brewcode:review` — local skill, created in the project during `/brewcode:setup`.

Detailed description of each command: `docs/commands.md`

## Configuration

Configuration file is created during `/brewcode:setup`:

```
.claude/tasks/cfg/brewcode.config.json
```

Main sections:

| Section | Purpose |
|---------|---------|
| `knowledge` | Entry limits, validation, retention (global/task) |
| `constraints` | Role constraints for agents (DEV, TEST, REVIEW) |
| `autoSync` | Synchronization interval, parallelism |

## Task Structure

After task creation, the following appears in the project:

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification
  PLAN.md             # Execution plan with phases
  KNOWLEDGE.jsonl     # Accumulated knowledge
  artifacts/          # Execution reports by phases
  backup/             # Backups
```

## Documentation

| Document | Description |
|----------|-------------|
| `docs/commands.md` | Detailed description of all commands with examples |
| `docs/hooks.md` | Hooks and their behavior |
| `docs/flow.md` | Execution flow diagrams (spec, plan, start) |
| `docs/file-tree.md` | Complete file structure of plugin and project |
| [INSTALL.md](INSTALL.md) | Installation guide |
| [RELEASE-NOTES.md](RELEASE-NOTES.md) | Change history |

## Version

**2.15.1** -- agent documentation enrichment, auto-sync improvements, hooks optimization.

Author: Maksim Kochetkov | License: MIT
