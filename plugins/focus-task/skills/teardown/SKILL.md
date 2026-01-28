---
name: teardown
description: Remove all focus-task files created by /focus-task:setup. Cleans templates, configs, rules, skills, and symlinks.
user-invocable: true
argument-hint: [--dry-run]
allowed-tools: Bash, Read
model: haiku
---

Teardown Focus-Task — remove all project files created by setup

## Overview

Removes all files and directories created by `/focus-task:setup`:
- `.claude/tasks/templates/`
- `.claude/tasks/cfg/focus-task.config.json`
- `.claude/skills/focus-task-review/`
- `~/.claude/skills/focus-task-*` (symlinks)

<instructions>

## Usage

```
/focus-task:teardown           # Full cleanup
/focus-task:teardown --dry-run # Show what would be deleted
```

## Execution

**EXECUTE** using Bash tool — run teardown script:
```bash
SCRIPT_DIR="$HOME/.claude/plugins/cache/claude-brewcode/focus-task/$(ls $HOME/.claude/plugins/cache/claude-brewcode/focus-task 2>/dev/null | sort -V | tail -1)/skills/teardown"
bash "$SCRIPT_DIR/teardown.sh" $ARGUMENTS
```

## What Gets Removed

```
PROJECT/
└── .claude/
    ├── tasks/
    │   ├── templates/           ← 🗑️ DELETE (entire dir)
    │   │   ├── TASK.md.template
    │   │   ├── SPEC.md.template
    │   │   └── KNOWLEDGE.jsonl.template
    │   ├── cfg/
    │   │   └── focus-task.config.json  ← 🗑️ DELETE
    │   ├── reports/             ← ⏭️ KEEP
    │   ├── specs/               ← ⏭️ KEEP
    │   └── *_TASK.md            ← ⏭️ KEEP
    ├── skills/
    │   └── focus-task-review/   ← 🗑️ DELETE (entire dir)
    └── rules/                   ← ⏭️ KEEP

~/.claude/skills/
├── focus-task-setup    → ...  ← 🗑️ symlink
├── focus-task-create   → ...  ← 🗑️ symlink
├── focus-task-doc      → ...  ← 🗑️ symlink
├── focus-task-rules    → ...  ← 🗑️ symlink
├── focus-task-start    → ...  ← 🗑️ symlink
└── focus-task-teardown → ...  ← 🗑️ symlink
```

## Safety

- **--dry-run**: Shows files without deleting
- **No task files**: Does NOT delete active tasks (`.claude/tasks/*_TASK.md`)
- **No KNOWLEDGE**: Does NOT delete task knowledge files (`*_KNOWLEDGE.jsonl`)
- **No reports**: Does NOT delete `.claude/tasks/reports/`

</instructions>

## Output

```
Focus-Task Teardown

Removed:
  ✅ .claude/tasks/templates/
  ✅ .claude/tasks/cfg/focus-task.config.json
  ✅ .claude/rules/avoid.md
  ✅ .claude/rules/best-practice.md
  ✅ .claude/skills/focus-task-review/
  ✅ ~/.claude/skills/focus-task-setup (symlink)
  ✅ ~/.claude/skills/focus-task-create (symlink)
  ...

Preserved:
  ⏭️  .claude/tasks/*_TASK.md (active tasks)
  ⏭️  .claude/tasks/*_KNOWLEDGE.jsonl
  ⏭️  .claude/tasks/reports/
  ⏭️  .claude/rules/ (user rules)
```
