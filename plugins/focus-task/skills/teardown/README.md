# Teardown Skill

## What It Does

Cleans up all focus-task project files created by `/focus-task:setup`. Removes templates, configs, logs, plans, and grepai data while **preserving all task directories and their content**.

## How to Use

```bash
/focus-task:teardown           # Clean up everything
/focus-task:teardown --dry-run # Preview what will be deleted
```

## What Gets Removed

- `.claude/tasks/templates/` — setup templates
- `.claude/tasks/cfg/` — config files
- `.claude/tasks/logs/` — session logs
- `.claude/plans/` — plan files
- `.grepai/` — semantic search index
- `.claude/skills/focus-task-review/` — review skill

## What Stays

- `.claude/tasks/*_task/` — all task directories and their content
- `.claude/rules/` — user rules
- Task artifacts and KNOWLEDGE files inside task directories

## Example

```bash
/focus-task:teardown --dry-run
# Outputs: Files that would be deleted (no changes made)

/focus-task:teardown
# Confirms with user, then removes all focus-task setup files
```

## Safety

- **Dry-run mode** shows what would be deleted without making changes
- **Task data preserved** — no task directories are removed
- **Confirmation required** — prompts before full cleanup
