# grepai Skill

## What It Does

Sets up and manages semantic code search for your project using grepai (Ollama + bge-m3 embeddings). Enables Claude to find code by meaning, not just keywords.

## Quick Start

```bash
/focus-task:grepai setup       # First-time configuration
/focus-task:grepai status      # Check health
/focus-task:grepai start       # Start watching for changes
/focus-task:grepai stop        # Stop watcher
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

First time? Run setup (5-30+ minutes depending on project size):
```
/focus-task:grepai setup
```

Check if everything works:
```
/focus-task:grepai status
```

Start watching for code changes:
```
/focus-task:grepai start
```

## Prerequisites

Run `/focus-task:install` first to install Homebrew, Ollama, and grepai CLI.

## Need Help?

- Check logs at `.grepai/logs/grepai-watch.log`
- Run `status` to verify all components
- See SKILL.md for detailed phase-by-phase instructions
