# Brewdoc

> Documentation toolkit plugin for Claude Code -- sync, generation, memory optimization, PDF conversion, publishing.

| Field | Value |
|-------|-------|
| Version | 3.4.29 |
| Skills | 6 |
| Agents | 1 |
| Hooks | 1 |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewdoc@claude-brewcode

After install, run `/reload-plugins` (or `exit` + `claude`).
```

<details>
<summary>Or install the whole suite</summary>

```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewcode@claude-brewcode
3. claude plugin install brewdoc@claude-brewcode
4. claude plugin install brewtools@claude-brewcode
5. claude plugin install brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
</details>

Update anytime with `/brewtools:plugin-update`.

## Overview

Brewdoc keeps documentation in sync with the codebase, optimizes content for LLM consumption, and exports documents to ready-made formats. Each skill is self-contained and independent of the others.

## Installation

```bash
# Marketplace (recommended)
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewdoc@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewdoc@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewdoc
```

## Quick Start

```bash
/brewdoc:auto-sync                    # Sync all project docs with codebase
/brewdoc:auto-sync status             # See what's indexed and what's stale
/brewdoc:auto-sync init ./docs/api.md # Add file to auto-sync tracking
/brewdoc:my-claude                    # Document your local Claude setup
/brewdoc:my-claude ext                # Document Claude Code architecture
/brewdoc:my-claude r "how do hooks work"  # Research any Claude topic
/brewdoc:memory                       # Optimize memory files interactively
/brewdoc:md-to-pdf README.md          # Convert markdown to PDF
/brewdoc:publish "Hello world"        # Publish to brewpage.app -- returns URL
/brewdoc:guide                        # Interactive tutorial for the suite
```

## Skills

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewdoc:auto-sync`](skills/auto-sync/README.md) | Synchronize documentation with code | opus | `[status] \| [init <path>] \| [global] \| [path]` |
| [`/brewdoc:my-claude`](skills/my-claude/README.md) | Generate documentation about Claude Code installation | opus | `[ext [context]] \| [r <query>]` |
| [`/brewdoc:memory`](skills/memory/README.md) | Optimize memory files in 4 steps | opus | -- |
| [`/brewdoc:md-to-pdf`](skills/md-to-pdf/README.md) | Convert Markdown to PDF | sonnet | `<file.md> [--engine name] ["prompt"] \| styles \| test` |
| [`/brewdoc:publish`](skills/publish/README.md) | Publish to brewpage.app -- returns public URL | haiku | `<text\|file\|json> [--ttl N]` |
| [`/brewdoc:guide`](skills/guide/README.md) | Interactive tutorial for the plugin suite | haiku | `[topic]` |

## Agent

| Agent | Model | Purpose |
|-------|-------|---------|
| [bd-auto-sync-processor](agents/bd-auto-sync-processor.md) | sonnet | Process documents for auto-sync |

## Architecture

```
brewdoc/
+-- .claude-plugin/plugin.json        # Plugin manifest
+-- hooks/
|   +-- hooks.json                    # 1 hook (Pre-Task)
|   +-- pre-task.mjs                  # BD_PLUGIN_ROOT injection
|   +-- lib/utils.mjs                 # I/O utilities
+-- skills/
|   +-- auto-sync/                    # Documentation sync
|   +-- my-claude/                    # Installation documentation
|   +-- memory/                       # Memory optimization
|   +-- md-to-pdf/                    # PDF conversion
|   +-- publish/                      # brewpage.app publishing
|   +-- guide/                        # Interactive tutorial
+-- agents/
    +-- bd-auto-sync-processor.md     # File processing agent
```

> **Brewdoc vs Brewcode:** Brewdoc is a set of documentation utilities. Each skill is self-contained. Brewcode is a task execution engine with infinite context, 9 lifecycle hooks, and session handoff. Both install from the same `claude-brewcode` marketplace but operate independently.

## Documentation

Full docs: [doc-claude.brewcode.app/brewdoc/overview](https://doc-claude.brewcode.app/brewdoc/overview/)

| Resource | Link |
|----------|------|
| Auto-Sync | [Auto-Sync](https://doc-claude.brewcode.app/brewdoc/auto-sync/) |
| My-Claude | [My-Claude](https://doc-claude.brewcode.app/brewdoc/my-claude/) |
| Memory | [Memory](https://doc-claude.brewcode.app/brewdoc/memory/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
