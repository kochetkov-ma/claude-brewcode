---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Teardown

Removes all brewcode project files created by `/brewcode:setup` -- templates, configs, logs, plans, sessions, and grepai index. All task directories, their artifacts, KNOWLEDGE files, and user rules are preserved intact.

## Quick Start

```
/brewcode:teardown
```

You will be prompted to confirm before anything is deleted.

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Full cleanup | `/brewcode:teardown` | Asks for confirmation, then removes all setup-generated files |
| Dry run | `/brewcode:teardown --dry-run` | Lists every file and directory that would be deleted -- no changes made, no confirmation needed |

## What Gets Removed vs Preserved

| Removed | Preserved |
|---------|-----------|
| `.claude/tasks/templates/` -- setup templates | `.claude/tasks/*_task/` -- all task directories |
| `.claude/tasks/cfg/` -- config files (brewcode.config.json, etc.) | `.claude/tasks/*_task/KNOWLEDGE.jsonl` -- knowledge files |
| `.claude/logs/` -- session logs | `.claude/tasks/*_task/artifacts/` -- task artifacts and FINAL.md |
| `.claude/tasks/sessions/` -- session metadata | `.claude/rules/` -- user rules |
| `.claude/plans/` -- plan files | |
| `.grepai/` -- semantic search index | |
| `.claude/skills/brewcode-review/` -- generated review skill | |

## Examples

### Good Usage

- **Starting fresh after finishing a project.** All tasks are done, you want a clean slate for the next project in the same repo. Run `/brewcode:teardown`, then `/brewcode:setup` again.

- **Previewing before cleanup.** Not sure what will be deleted? Run `/brewcode:teardown --dry-run` first to see the full list without touching anything.

- **Reconfiguring brewcode.** Your project structure changed and you need to regenerate templates and config. Teardown removes the old setup so `/brewcode:setup` can create fresh files.

- **Cleaning up a demo or test project.** You used brewcode to try things out and want to remove all traces of the setup while keeping any task work you did.

- **Freeing disk space from grepai index.** The `.grepai/` directory can grow large. Teardown removes it cleanly; run `/brewcode:grepai` later to rebuild if needed.

### Common Mistakes

- **Running teardown while a task is in progress.** Teardown removes configs and templates that active tasks depend on. Finish or cancel all running tasks first.

- **Expecting teardown to delete task directories.** Task directories (`.claude/tasks/*_task/`) are explicitly preserved. To remove them, delete manually.

- **Running teardown and forgetting to re-run setup.** After teardown, brewcode skills that depend on config or templates will not work until you run `/brewcode:setup` again.

## Tips

- Always run `--dry-run` first if you are unsure what will be removed.
- Teardown is safe to run multiple times -- it skips files that do not exist.
- Your task history, artifacts, and KNOWLEDGE files survive teardown. Think of it as resetting the scaffolding, not the work.
- After teardown, you need `/brewcode:setup` before using most other brewcode skills again.

## Documentation

Full docs: [teardown](https://doc-claude.brewcode.app/brewcode/skills/teardown/)
