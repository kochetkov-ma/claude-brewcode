---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Install

Installs brewcode prerequisites interactively. Run once before using any brewcode skills -- the installer detects existing components and only installs what is missing.

## Quick Start

```
/brewcode:install
```

No arguments needed. The skill walks through 6 phases with user prompts for optional components.

## What Gets Installed

| Component | Required | Purpose | Install Source |
|-----------|----------|---------|---------------|
| brew | Yes | Homebrew package manager -- used to install everything else | Official installer script |
| coreutils | Yes | GNU core utilities (provides `gtimeout`) | `brew install coreutils` |
| timeout | Yes | Symlink to `gtimeout` -- required by brewcode hook scripts | Symlink in `$(brew --prefix)/bin/` |
| jq | Yes | JSON processor -- used by brewcode hooks for config/state parsing | `brew install jq` |
| ollama | No | Local inference server -- hosts the embedding model for grepai | `brew install ollama` |
| bge-m3 | No | Multilingual embedding model (~1.2GB) -- generates code embeddings | `ollama pull bge-m3` |
| grepai | No | Semantic code search CLI -- AI-powered codebase exploration | `brew install yoanbernabeu/tap/grepai` |

## Phases

The installer runs 6 sequential phases. Each phase is self-contained and reports its own status.

| Phase | Name | What It Does |
|-------|------|-------------|
| 1 | State Check | Scans all components, prints a status table (installed, missing, outdated) |
| 2 | Updates Check | Checks brew-managed packages for newer versions; asks to update if found |
| 3 | Timeout Check | Verifies the `timeout` command exists; offers to create the symlink if missing |
| 4 | Required Components | Installs brew, coreutils, and jq -- stops on failure |
| 5 | Semantic Search | Asks whether to install grepai stack (ollama + bge-m3 + grepai CLI, ~1.5GB total) |
| 6 | Summary | Prints final status table with versions, sources, and actions performed |

## Script Commands

The underlying `install.sh` script supports individual commands. The skill invokes them automatically, but they can also be run directly for debugging.

| Command | Purpose |
|---------|---------|
| `state` | Print status table of all components |
| `check-updates` | Check for available brew updates |
| `check-timeout` | Check if `timeout` command exists, suggest symlink |
| `update-all` | Upgrade all outdated brew-managed components |
| `required` | Install only required components (brew, coreutils, jq) |
| `timeout` | Create the `timeout -> gtimeout` symlink only |
| `grepai` | Install the full semantic search stack (ollama, bge-m3, grepai) |
| `summary` | Print final installation summary with actions log |

## Examples

### Good Usage

**First-time setup on a new machine:**
```
User: /brewcode:install

Phase 1: State Check
| Component | Status    | Version | Type     |
|-----------|-----------|---------|----------|
| brew      | installed | 4.3.1   | required |
| timeout   | missing   | -       | required |
| jq        | missing   | -       | required |
| grepai    | missing   | -       | optional |

Phase 3: "Create timeout symlink? REQUIRED for brewcode."
User: Yes, create

Phase 5: "Install semantic search? (~1.5GB)"
User: Skip

Phase 6: Summary
  All required components installed.
  grepai: skipped
```

**Checking for updates when everything is already installed:**
```
User: /brewcode:install

Phase 1: All components present
Phase 2: "Updates available: grepai(1.0.5 -> 1.1.0). Update now?"
User: Yes, update all

Phase 6: Summary
  Updated grepai: 1.0.5 -> 1.1.0
```

**Installing grepai after previously skipping it:**
```
User: /brewcode:install

Phase 1: grepai not installed
Phase 5: "Install semantic search?"
User: Yes, install (~1.5GB)

  ollama: installed
  bge-m3: pulled
  grepai: installed
```

### Common Mistakes

**Running install inside CI/CD pipelines:**
The skill requires interactive user input (AskUserQuestion) for optional components and confirmations. It will hang or fail in non-interactive environments. Install prerequisites manually in CI.

**Re-running install expecting it to fix a broken grepai index:**
The install skill only handles binary installation. For grepai configuration and indexing issues, use `/brewcode:grepai setup` instead.

**Cancelling the timeout symlink prompt:**
If you decline the timeout symlink in Phase 3, the installer stops immediately. The `timeout` command is non-negotiable -- brewcode hooks depend on it.

## Tips

- Run `/brewcode:install` after upgrading macOS or Homebrew to verify nothing broke.
- The grepai stack is optional but strongly recommended -- it enables `/brewcode:grepai` for semantic code search across your project.
- If ollama fails to start automatically, run `ollama serve` in a separate terminal before retrying the install.
- After install, continue with `/brewcode:setup` to initialize brewcode for your project.
