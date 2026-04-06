---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Setup

Checks prerequisites, then analyzes your project's tech stack, testing framework, database layer, and existing agents to generate tailored templates and a review skill under `.claude/tasks/`. Run this once before using any other brewcode skill (`spec`, `plan`, `start`, `review`). Setup handles all required tooling (brew, coreutils, jq) and optionally sets up grepai for semantic code search.

## Quick Start

```bash
/brewcode:setup
```

## Prerequisites

Phase 0 automatically checks and installs the following before project analysis begins:

| Component | Required | Purpose |
|-----------|----------|---------|
| brew | Yes | Homebrew package manager |
| coreutils+timeout | Yes | GNU timeout for brewcode scripts |
| jq | Yes | JSON processor for hooks |
| ollama + bge-m3 | No | Local embedding model for grepai |
| grepai | No | Semantic code search CLI |

Required components are installed automatically. Optional components are offered interactively. If all prerequisites are already present, Phase 0 is skipped entirely.

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Full auto-detect | `/brewcode:setup` | Scans the project, detects stack, generates all templates and review skill |
| Custom template | `/brewcode:setup path/to/PLAN.md.template` | Uses the provided template as a base and adapts it to the project |

Both modes run the same phases: **check prerequisites**, scan, analyze, generate templates, create review skill, and update the global `~/.claude/CLAUDE.md` agents section (with confirmation).

## Examples

### Good Usage

```bash
# First-time setup in a new project -- run before anything else
/brewcode:setup
```

```bash
# Setup auto-checks prerequisites -- skips if already installed
/brewcode:setup
# Phase 0: All prerequisites present, skipping installation.
# Phase 1: Scanning project...
```

```bash
# After adding new agents to .claude/agents/ -- re-run to pick them up
/brewcode:setup
```

```bash
# Use a shared team template as the starting point
/brewcode:setup ~/.claude/templates/PLAN.md.template
```

```bash
# After switching from JPA to jOOQ -- re-run so templates reflect the new stack
/brewcode:setup
```

### Common Mistakes

```bash
# WRONG: Running /brewcode:spec before setup
# Setup has not run yet, so there are no templates to base the spec on.
/brewcode:spec "Add payment endpoint"

# FIX: Run setup first, then spec.
/brewcode:setup
/brewcode:spec "Add payment endpoint"
```

```bash
# WRONG: Editing .claude/tasks/templates/PLAN.md.template by hand
# The next /brewcode:setup will overwrite your manual changes.

# FIX: Put customizations in the source template and pass it as an argument.
/brewcode:setup ~/my-custom-template.md
```

```bash
# WRONG: Running setup from a different directory than the project root
# The scan script looks at the current working directory for build files and agents.

# FIX: Open Claude Code at the project root, then run setup.
```

## Output

| File | Location | Purpose |
|------|----------|---------|
| PLAN template | `.claude/tasks/templates/PLAN.md.template` | Multi-phase task plan adapted to your stack |
| SPEC template | `.claude/tasks/templates/SPEC.md.template` | Specification template for `brewcode:spec` |
| KNOWLEDGE template | `.claude/tasks/templates/KNOWLEDGE.jsonl.template` | Knowledge base seed for task sessions |
| Config | `.claude/tasks/cfg/brewcode.config.json` | Runtime settings (knowledge limits, agent lists) |
| Review skill | `.claude/skills/brewcode-review/SKILL.md` | Tech-specific code review checklist |

The review skill is generated with checks matched to the detected stack (e.g., Spring DI rules for Java, async patterns for Node.js, error wrapping for Go).

## Tips

- Run setup again whenever you change your tech stack, add project agents, or update your test framework. Templates are overwritten; rules are preserved.
- The skill asks for confirmation before modifying `~/.claude/CLAUDE.md`. You can safely decline and still get all project-level templates.
- After setup completes, the typical workflow is `spec` -> `plan` -> `start`. Each of those skills depends on the templates setup creates.
- Check `.claude/tasks/cfg/brewcode.config.json` to tune knowledge compaction limits and agent injection settings after the initial run.
- Setup handles prerequisites automatically. No need to install anything manually before running it.

## Documentation

Full docs: [setup](https://doc-claude.brewcode.app/brewcode/skills/setup/)
