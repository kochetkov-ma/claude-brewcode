---
auto-sync: enabled
auto-sync-date: 2026-02-28
auto-sync-type: doc
description: README for brewdoc plugin — user documentation
---

# Brewdoc

Documentation tools plugin for Claude Code. Three concerns:

| Concern | Skill | What it does |
|---------|-------|--------------|
| **auto-sync** | `/brewdoc:auto-sync` | Keep `.md` docs (skills, agents, rules) in sync with actual codebase |
| **my-claude** | `/brewdoc:my-claude` | Generate documentation about your Claude Code installation, hooks, or any Claude topic |
| **memory** | `/brewdoc:memory` | Optimize memory files: deduplicate, migrate to rules/CLAUDE.md, compress, validate |

## Installation

```bash
# From marketplace
claude plugin install brewdoc@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewdoc

# Both plugins together
claude --plugin-dir ./brewcode --plugin-dir ./brewdoc
```

## Quick Start

### auto-sync

```bash
/brewdoc:auto-sync status          # See what's indexed and what's stale
/brewdoc:auto-sync init .claude/rules/testing.md   # Tag a file for auto-sync
/brewdoc:auto-sync                 # Sync all tagged files in project
/brewdoc:auto-sync global          # Sync ~/.claude/ global docs
```

### my-claude

```bash
/brewdoc:my-claude                 # Document your local Claude setup (internal mode)
/brewdoc:my-claude ext             # Document Claude Code architecture (external mode)
/brewdoc:my-claude ext context     # Document context injection schema specifically
/brewdoc:my-claude r "how do hooks work"   # Research any Claude topic (research mode)
```

### memory

```bash
/brewdoc:memory                    # Run 4-step interactive memory optimization
```

## Commands

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/brewdoc:auto-sync` | `status` / `init <path>` / `global` / `<path>` | Universal doc sync |
| `/brewdoc:my-claude` | `ext [context]` / `r <query>` / _(none)_ | Generate Claude Code docs |
| `/brewdoc:memory` | _(none)_ | Interactive memory optimizer |

## auto-sync Modes

```
+-----------------------------------------------------------+
|                   /brewdoc:auto-sync                       |
+------------+------------+-------------+-------------------+
|   status   |  init path |   global    |  (no args)        |
|            |            |             |  file/folder      |
| Report     | Tag one    | Sync        | Sync project      |
| what's     | file for   | ~/.claude/  | .claude/          |
| indexed    | auto-sync  | all docs    | all docs          |
+------------+------------+-------------+-------------------+
```

Files are discovered by YAML frontmatter (`auto-sync: enabled`) or by directory convention. The INDEX tracks sync state per file:

```
.claude/auto-sync/INDEX.jsonl          # project-level index
~/.claude/auto-sync/INDEX.jsonl        # global-level index
```

Each sync reads the source file, compares against codebase state, and updates in-place using type-specific instructions (`sync-rule.md`, `sync-skill.md`, `sync-agent.md`, `sync-doc.md`, `sync-config.md`).

## my-claude Modes

```
/brewdoc:my-claude [args]
       |
       +-- (empty) ----> INTERNAL: snapshot of your Claude setup
       |                          ~/.claude/ config, rules, agents, skills
       |                          Project CLAUDE.md + rules
       |                          Memory files
       |
       +-- ext --------> EXTERNAL: Claude Code architecture docs
       |                          Hook event model
       |                          Context injection patterns
       |                          Recent CHANGELOG
       |
       +-- ext context -> EXTERNAL/context-schema: deep dive into
       |                          additionalContext, updatedInput schemas
       |
       +-- r <query> --> RESEARCH: web research on any Claude topic
                                   Official docs + GitHub + community
                                   Citations + reliability scores
```

Output is written to `~/.claude/brewdoc/` with an index:

```
~/.claude/brewdoc/
  YYYYMMDD_my-claude-internal.md
  YYYYMMDD_my-claude-external.md
  YYYYMMDD_my-claude-research.md
  INDEX.jsonl
```

## memory Workflow

```
/brewdoc:memory
       |
       v
  Step 1: Analysis ----> Find entries that duplicate CLAUDE.md/rules
          (interactive) ----> AskUserQuestion: delete X duplicates?
       |
       v
  Step 2: Migration ---> Move entries to rules/ or CLAUDE.md
          (interactive) ----> AskUserQuestion: migrate X entries?
       |
       v
  Step 3: Compression -> Compress remaining (prose->table, verbose->concise)
          (interactive) ----> AskUserQuestion: save ~Y% tokens?
       |
       v
  Step 4: Validation --> reviewer agent checks consistency
          (automatic)   ----> Clean broken refs, orphaned files
                        ----> Final before/after report
```

Memory files location: `~/.claude/projects/.../memory/*.md`

## Plugin Variables

| Variable | Set by | Available in |
|----------|--------|--------------|
| `BD_PLUGIN_ROOT` | `session-start.mjs` (SessionStart) | Main conversation, skills |
| `BD_PLUGIN_ROOT` | `pre-task.mjs` (PreToolUse:Task) | All subagents (prefix line in prompt) |

## Output Locations

| Skill | Output location |
|-------|----------------|
| `auto-sync` | Updates files in-place; INDEX at `.claude/auto-sync/INDEX.jsonl` or `~/.claude/auto-sync/INDEX.jsonl` |
| `my-claude` | `~/.claude/brewdoc/YYYYMMDD_my-claude-{mode}.md` + `INDEX.jsonl` |
| `memory` | Modifies `~/.claude/projects/.../memory/*.md` in-place |

## Architecture

```
brewdoc/
  .claude-plugin/plugin.json       # Manifest (v3.1.0)
  hooks/
    hooks.json                     # Hook registration
    session-start.mjs              # Sets BD_PLUGIN_ROOT
    pre-task.mjs                   # Injects BD_PLUGIN_ROOT into subagent prompts
    lib/utils.mjs                  # Shared hook utilities
  skills/
    auto-sync/                     # SKILL.md + instructions/ + scripts/
    my-claude/                     # SKILL.md + references/
    memory/                        # SKILL.md + references/
  agents/
    bd-auto-sync-processor.md      # Processes single file for auto-sync
```

## Links

- [RELEASE-NOTES.md](../RELEASE-NOTES.md) -- changelog
- [brewcode plugin](../brewcode/README.md) -- companion plugin for task execution
- [GitHub](https://github.com/kochetkov-ma/claude-brewcode)

## Version

**3.1.0** -- version unified with brewcode suite. auto-sync, my-claude, memory, md-to-pdf skills.

Author: Maksim Kochetkov | License: MIT
