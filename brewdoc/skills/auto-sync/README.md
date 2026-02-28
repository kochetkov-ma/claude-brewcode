---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Auto-Sync

Automatically update and synchronize Claude Code documentation (skills, agents, rules, markdown) across your project or globally.

## Quick Start

```sh
/brewdoc:auto-sync              # Sync project documentation
/brewdoc:auto-sync status       # Show what's tracked and what's stale
/brewdoc:auto-sync init <path>  # Tag a file for auto-sync
/brewdoc:auto-sync global       # Sync ~/.claude/ documentation
```

## What It Does

- **Tracks** documentation files with `auto-sync: enabled` frontmatter
- **Detects** stale content based on sync interval (default: 7 days)
- **Updates** skills, agents, rules by researching code and verifying paths/URLs
- **Reports** changes with detailed summaries

## How to Use

**Check status of all tracked documents:**
```sh
/brewdoc:auto-sync status
```

**Initialize a new file (adds frontmatter + INDEX entry):**
```sh
/brewdoc:auto-sync init plugins/my-plugin/SKILL.md
```

**Sync specific file or folder:**
```sh
/brewdoc:auto-sync path/to/file.md
/brewdoc:auto-sync path/to/folder
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

## Migrating from /brewdoc:doc

This skill replaces the deprecated `/brewdoc:doc` skill:
- `/brewdoc:doc update` → `/brewdoc:auto-sync`
- `/brewdoc:doc sync` → `/brewdoc:auto-sync`
