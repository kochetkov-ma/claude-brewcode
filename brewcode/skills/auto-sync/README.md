---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Auto-Sync

Automatically update and synchronize Claude Code documentation (skills, agents, rules, markdown) across your project or globally.

## Quick Start

```sh
/brewcode:auto-sync              # Sync project documentation
/brewcode:auto-sync status       # Show what's tracked and what's stale
/brewcode:auto-sync init <path>  # Tag a file for auto-sync
/brewcode:auto-sync global       # Sync ~/.claude/ documentation
```

## What It Does

- **Tracks** documentation files with `auto-sync: enabled` frontmatter
- **Detects** stale content based on sync interval (default: 7 days)
- **Updates** skills, agents, rules by researching code and verifying paths/URLs
- **Reports** changes with detailed summaries

## How to Use

**Check status of all tracked documents:**
```sh
/brewcode:auto-sync status
```

**Initialize a new file (adds frontmatter + INDEX entry):**
```sh
/brewcode:auto-sync init plugins/my-plugin/SKILL.md
```

**Sync specific file or folder:**
```sh
/brewcode:auto-sync path/to/file.md
/brewcode:auto-sync path/to/folder
```

## Optional: Custom Sync Behavior

Add override block to any document to customize what gets synced:

```markdown
<auto-sync-override>
sources: src/**/*.ts, plugins/**/*.md
focus: Authentication, error handling
preserve: ## Custom Config, ## Notes
</auto-sync-override>
```

## Flags

| Flag | Description |
|------|-------------|
| `-o`, `--optimize` | Enable text optimization during sync |

## Migrating from /brewcode:doc

This skill replaces the deprecated `/brewcode:doc` skill:
- `/brewcode:doc update` → `/brewcode:auto-sync`
- `/brewcode:doc sync` → `/brewcode:auto-sync`
