---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# My Claude

Generates documentation about your Claude Code installation and environment. Supports four modes: document your local setup, analyze the external hook/context architecture, deep-dive the context injection schema, or research any Claude Code topic across the web.

## Quick Start

```
/brewdoc:my-claude              # Document your local Claude Code setup
/brewdoc:my-claude ext          # Document hook/context/agent architecture
/brewdoc:my-claude ext context  # Deep-dive into context injection schema
/brewdoc:my-claude r <query>    # Research a specific Claude Code topic
```

## Modes

| Mode | Trigger | What it does |
|------|---------|--------------|
| Internal | no arguments | Scans `~/.claude/` and project `.claude/` to document your CLAUDE.md files, rules, agents, skills, and memories |
| External | `ext` or `external` | Analyzes local hooks + searches official docs, GitHub releases, and community forums for Claude Code architecture docs |
| External (context-schema) | `ext context` or `external context` | Focuses specifically on the context injection schema (additionalContext, updatedInput, decision) |
| Research | `r <query>` or `research <query>` | Researches a specific query across official docs, GitHub, Reddit, forums, and marketplaces with citation tracking |

## Examples

### Good Usage

```
# Document everything in your local Claude Code installation
/brewdoc:my-claude

# Generate docs on hook events, agent architecture, and recent releases
/brewdoc:my-claude ext

# Understand how additionalContext and updatedInput work in hooks
/brewdoc:my-claude ext context

# Research how other projects structure their plugin hooks
/brewdoc:my-claude r plugin hook patterns and best practices

# Find out what changed in recent Claude Code versions
/brewdoc:my-claude r Claude Code changelog 2026
```

### Common Mistakes

```
# Wrong: using research mode for a code implementation task
/brewdoc:my-claude r implement a new hook for my project
# Research mode generates documentation, not code. Use /brewcode:start for implementation.

# Wrong: using ext when you want to document YOUR setup
/brewdoc:my-claude ext
# ext documents the external Claude Code architecture. Use no arguments for your local setup.

# Wrong: forgetting the space after r
/brewdoc:my-claude rsome query
# The prefix must be "r " or "research " (with a trailing space).
```

## Output Location

All generated files are saved to `~/.claude/brewdoc/` (global, not project-specific).

| Mode | Output path |
|------|-------------|
| Internal | `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md` |
| External (default) | `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md` |
| External (context-schema) | `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md` |
| Research | `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md` |

Every run appends an entry to `~/.claude/brewdoc/INDEX.jsonl` for tracking. If an entry for the same mode already exists, you will be asked whether to update it or create a new one.

## Tips

- **Re-run internal mode after changing your setup.** Adding new rules, agents, or skills makes the previous internal doc stale. Re-running produces an up-to-date snapshot.
- **Research mode is for documentation, not implementation.** It generates a cited research report. For code tasks, use brewcode skills instead.
- **External context-schema mode is useful for hook development.** Before writing a new hook, run `ext context` to get a fresh reference on which channels (additionalContext, updatedInput, decision) work for which events.
- **Check INDEX.jsonl to find previous runs.** Each entry includes timestamp, mode, path, and version, so you can track what was documented and when.
