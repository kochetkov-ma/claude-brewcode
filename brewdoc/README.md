# Brewdoc

> Documentation toolkit plugin for Claude Code -- sync, generation, memory sync, PDF conversion, publishing.

| Field | Value |
|-------|-------|
| Version | 4.2.4 |
| Skills | 6 |
| Agents | 0 |
| Hooks | 0 |

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
/brewdoc:docsync                      # First run -> init tracking; otherwise status
/brewdoc:docsync status               # What is tracked and what is stale
/brewdoc:docsync sync                 # Sync stale docs (with confirmation)
/brewdoc:my-claude                    # Document your local Claude setup
/brewdoc:my-claude ext                # Document Claude Code architecture
/brewdoc:my-claude r "how do hooks work"  # Research any Claude topic
/brewdoc:memory                       # Sync whole surface: memory, nested CLAUDE.md, rules, conventions
/brewdoc:memory "full"                # + agent roster + skill roster, synced in-place
/brewdoc:md-to-pdf README.md          # Convert markdown to PDF
/brewdoc:publish "Hello world"        # Publish to brewpage.app -- returns URL
/brewdoc:guide                        # Interactive tutorial for the suite
```

## Skills

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewdoc:docsync`](skills/docsync/README.md) | Installs project-local doc-staleness tracking (hooks) and reports/forces doc sync | sonnet | `[status] \| [sync [--all]] \| [reread] \| [frontmatter] \| [uninstall] \| free-text` |
| [`/brewdoc:my-claude`](skills/my-claude/README.md) | Document your Claude Code installation -- setup, architecture, web research | opus | `[ext [context]] \| [r <query>]` -- no args = internal installation docs |
| [`/brewdoc:memory`](skills/memory/README.md) | Syncs and shrinks Claude memory -- CLAUDE.md (incl. nested), rules, conventions, memory files; `full` also syncs agent + skill rosters | opus | `<free-form prompt: emphasis only; empty = sync whole memory surface; 'full' adds agent+skill rosters>` |
| [`/brewdoc:md-to-pdf`](skills/md-to-pdf/README.md) | Convert Markdown to PDF via reportlab or weasyprint engines | sonnet | `<file.md> [--engine name] ["prompt"] \| styles \| test` |
| [`/brewdoc:publish`](skills/publish/README.md) | Publish text/markdown/file/site to brewpage.app, returns URL | haiku | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename]` |
| [`/brewdoc:guide`](skills/guide/README.md) | Interactive tutorial for the plugin suite | haiku | `[topic]` |

> Need a portable, plugin-free version? See the standalone [`brewpage-publish`](../skills/brewpage-publish/) (Claude Code) and [`openclaw/brewpage-publish`](../openclaw/brewpage-publish/) (OpenClaw / AgentSkills) skills.

## Architecture

```
brewdoc/
+-- .claude-plugin/plugin.json        # Plugin manifest
+-- hooks/
|   +-- hooks.json                    # no hooks ({"hooks":{}})
+-- skills/
    +-- docsync/                      # Doc-staleness tracker
    +-- my-claude/                    # Installation documentation
    +-- memory/                       # Memory sync (references/: mode-sync, mode-sync-full, memory-guide)
    +-- md-to-pdf/                    # PDF conversion
    +-- publish/                      # brewpage.app publishing
    +-- guide/                        # Interactive tutorial
```

> **Brewdoc vs Brewcode:** Brewdoc is a set of documentation utilities. Each skill is self-contained. Brewcode is a task execution engine with infinite context, 2 hooks, and session handoff. Both install from the same `claude-brewcode` marketplace but operate independently.

## Documentation

Full docs: [doc-claude.brewcode.app/brewdoc/overview](https://doc-claude.brewcode.app/brewdoc/overview/)

| Resource | Link |
|----------|------|
| Docsync | [Docsync](https://doc-claude.brewcode.app/brewdoc/skills/docsync/) |
| My-Claude | [My-Claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) |
| Memory | [Memory](https://doc-claude.brewcode.app/brewdoc/skills/memory/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
