---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Install Skill

Installs brewcode prerequisites interactively. Required before using brewcode tasks.

## Quick Start

Invoke the skill:
```
/brewcode:install
```

The installer guides you through 6 phases:
1. **State Check** — Detects what's already installed
2. **Updates** — Checks for available updates
3. **Timeout** — Creates required symlink
4. **Required Components** — Installs brew, coreutils, jq
5. **Semantic Search (optional)** — Installs grepai (~1.5GB)
6. **Summary** — Shows final status

## What Gets Installed

| Component | Required | Purpose |
|-----------|----------|---------|
| **brew** | Yes | Package manager |
| **coreutils** | Yes | Command tools (timeout) |
| **jq** | Yes | JSON processing |
| **grepai** | Optional | AI-powered code search |

## Example

```
User: /brewcode:install
Claude: Phase 1: Checking current state...
  ✅ brew 4.0.1
  ❌ grepai (not installed)
  [Ask: Install grepai? Yes/Skip]

User: Yes, install (~1.5GB)
Claude: Installing grepai...
  ✅ ollama 0.1.2
  ✅ bge-m3 model loaded
  ✅ grepai 1.0.5

Phase 6: Summary
  All required components installed!
```

## Next Steps

After installation:
- `/brewcode:setup` — Initialize for your project
- `/brewcode:grepai setup` — Configure semantic search (if installed)
