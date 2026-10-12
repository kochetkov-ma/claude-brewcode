# My Claude

Generates documentation about your Claude Code installation and environment. It can document your local setup, analyze the external hook/context architecture, deep-dive the context injection schema, or research any Claude Code topic across the web.

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
| Internal | no arguments | Scans the active config directory (`CLAUDE_CONFIG_DIR`, default `~/.claude/`) and the project to document instructions, settings, hooks, plugins, agents, skills, and memory. Secret values are never copied, only their names |
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
# Research mode generates documentation, not code. Delegate implementation to a project agent.

# Wrong: using ext when you want to document YOUR setup
/brewdoc:my-claude ext
# ext documents the external Claude Code architecture. Use no arguments for your local setup.

# Wrong: forgetting the space after r
/brewdoc:my-claude rsome query
# The prefix must be "r " or "research " (with a trailing space).
```

## Validation

After the document is written, an independent built-in agent re-checks it so that no file name, path, or source in the output is invented. Internal mode uses `Explore`, which checks that paths exist and counts match. External and research modes use `general-purpose`, which re-opens the cited sources with `WebFetch` / `WebSearch`.

## Output Location

All generated files are saved to `.claude/brewdoc/my-claude/` inside your current project; there is no other output location. Writes under `.claude/` are protected paths, so Claude Code asks before writing unless you run in `bypassPermissions` mode, and a headless run without it fails.

| Mode | Output path |
|------|-------------|
| Internal | `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-internal.md` |
| External (default) | `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-external.md` |
| External (context-schema) | `.claude/brewdoc/my-claude/external/YYYYMMDD_context-schema.md` |
| Research | `.claude/brewdoc/my-claude/YYYYMMDD_research-{slug}.md` |

Every run appends an entry to `.claude/brewdoc/INDEX.jsonl` for tracking. If an entry for the same mode already exists, you will be asked whether to update it or create a new one.

If a legacy `~/.claude/brewdoc/INDEX.jsonl` exists from an older install, its entries are merged into the project INDEX once (read-only) and the skill prints a one-line migration notice. The legacy file is never written to.

## Tips

- **Re-run internal mode after changing your setup.** Adding new rules, agents, or skills makes the previous internal doc stale. Re-running produces an up-to-date snapshot.
- **External context-schema mode is useful for hook development.** Before writing a new hook, run `ext context` to get a fresh reference on which channels (additionalContext, updatedInput, decision) work for which events.
- **Need only a quick teammate handoff guide?** The built-in `/team-onboarding` (Claude Code 2.1.101+) builds one from your local usage history. Use this skill for web research, architecture docs, and the persistent INDEX with citations.
- **Check INDEX.jsonl to find previous runs.** Each entry includes timestamp, mode, path, and version, so you can track what was documented and when.

## Documentation

Full docs: [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/)
