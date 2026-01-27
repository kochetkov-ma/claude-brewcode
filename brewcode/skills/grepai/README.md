---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# grepai Skill

## What It Does

Sets up and manages semantic code search for your project using grepai (Ollama + bge-m3 embeddings). Enables Claude to find code by meaning, not just keywords.

## Quick Start

```bash
/brewcode:grepai setup       # First-time configuration
/brewcode:grepai status      # Check health
/brewcode:grepai start       # Start watching for changes
/brewcode:grepai stop        # Stop watcher
```

## Available Commands

| Command | Purpose |
|---------|---------|
| `setup` | Configure project, initialize index |
| `status` | Check grepai health and components |
| `start` | Start continuous file watching |
| `stop` | Stop the watcher |
| `reindex` | Rebuild entire search index |
| `optimize` | Regenerate config with project analysis |
| `upgrade` | Update grepai to latest version |

## Example Usage

First time? Run setup (5-30+ minutes for initial indexing, depending on project size):
```
/brewcode:grepai setup
```

This will:
1. Check infrastructure (Ollama, bge-m3, grepai CLI)
2. Configure MCP server permissions
3. Generate optimal config via bc-grepai-configurator agent
4. Build initial search index
5. Create grepai rule in .claude/rules/

Check if everything works:
```
/brewcode:grepai status
```

Start watching for code changes:
```
/brewcode:grepai start
```

## Prerequisites

Run `/install` first to install Homebrew, Ollama, and grepai CLI.

## Need Help?

- Check logs at `.grepai/logs/grepai-watch.log`
- Run `status` to verify all components
- See SKILL.md for phase-by-phase setup instructions (infrastructure, MCP, config generation, indexing)
