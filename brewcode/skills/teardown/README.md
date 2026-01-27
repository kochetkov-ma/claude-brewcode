---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Teardown Skill

## What It Does

Cleans up all brewcode project files created by `/brewcode:setup`. Removes templates, configs, logs, plans, and grepai data while **preserving all task directories and their content**.

## How to Use

```bash
/brewcode:teardown           # Clean up everything
/brewcode:teardown --dry-run # Preview what will be deleted
```

## What Gets Removed

- `.claude/tasks/templates/` — setup templates
- `.claude/tasks/cfg/` — config files
- `.claude/tasks/logs/` — session logs
- `.claude/tasks/sessions/` — session metadata
- `.claude/plans/` — plan files
- `.grepai/` — semantic search index
- `.claude/skills/brewcode-review/` — review skill

## What Stays

- `.claude/tasks/*_task/` — all task directories and their content
- `.claude/rules/` — user rules
- Task artifacts and KNOWLEDGE files inside task directories

## Example

```bash
/brewcode:teardown --dry-run
# Outputs: Files that would be deleted (no changes made)

/brewcode:teardown
# Confirms with user, then removes all brewcode setup files
```

## Safety

- **Dry-run mode** shows what would be deleted without making changes
- **Task data preserved** — no task directories are removed
- **Confirmation required** — prompts before full cleanup
