---
name: focus-task:teardown
description: Remove all focus-task files created by /focus-task:setup. Cleans templates, configs, and skills.
user-invocable: true
argument-hint: "[--dry-run]"
allowed-tools: Bash, Read, AskUserQuestion
context: fork
model: haiku
---

Teardown Focus-Task — remove all project files created by setup

## Overview

Removes all files and directories created by `/focus-task:setup`:
- `.claude/tasks/templates/`
- `.claude/tasks/cfg/`
- `.claude/tasks/logs/`
- `.claude/plans/`
- `.grepai/`
- `.claude/skills/focus-task-review/`

<instructions>

## Usage

```
/focus-task:teardown           # Full cleanup
/focus-task:teardown --dry-run # Show what would be deleted
```

## Execution

**Skill arguments received:** `$ARGUMENTS`

**If NOT `--dry-run`:** Use AskUserQuestion to confirm before executing:
> "This will delete focus-task project files (templates, configs, logs, plans). Task directories are preserved. Proceed?"

**EXECUTE** using Bash tool — run teardown script:
```bash
SCRIPT_DIR="$HOME/.claude/plugins/cache/claude-brewcode/focus-task/$(ls $HOME/.claude/plugins/cache/claude-brewcode/focus-task 2>/dev/null | sort -V | tail -1)/skills/teardown"
bash "$SCRIPT_DIR/teardown.sh" ARGS_HERE && echo "✅ done" || echo "❌ FAILED"
```
**IMPORTANT:** Replace `ARGS_HERE` with the actual value from "Skill arguments received" above. If empty, omit the argument.

> **STOP if ❌** — check script path exists and teardown.sh has execute permissions.

## What Gets Removed

```
PROJECT/
├── .grepai/                     ← 🗑️ DELETE (entire dir)
├── .claude/
│   ├── tasks/
│   │   ├── templates/           ← 🗑️ DELETE (entire dir)
│   │   ├── cfg/                 ← 🗑️ DELETE (entire dir)
│   │   ├── logs/                ← 🗑️ DELETE (entire dir)
│   │   ├── reports/             ← ⏭️ KEEP (legacy)
│   │   └── *_task/              ← ⏭️ KEEP (task directories)
│   ├── plans/                   ← 🗑️ DELETE (entire dir)
│   ├── skills/
│   │   └── focus-task-review/   ← 🗑️ DELETE (entire dir)
│   └── rules/                   ← ⏭️ KEEP
```

## Safety

- **--dry-run**: Shows files without deleting
- **No task dirs**: Does NOT delete task directories (`.claude/tasks/*_task/`)
- **No KNOWLEDGE**: Does NOT delete task knowledge files (within task dirs)
- **No artifacts**: Does NOT delete task artifacts (within task dirs)

</instructions>

## Output

```markdown
# Focus-Task Teardown

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args or empty}` |
| Mode | `{full or dry-run}` |

## Result

Removed:
  ✅ .claude/tasks/templates/
  ✅ .claude/tasks/cfg/
  ✅ .claude/tasks/logs/
  ✅ .claude/plans/
  ✅ .grepai/
  ✅ .claude/skills/focus-task-review/

Preserved:
  ⏭️  .claude/tasks/*_task/ (task directories)
  ⏭️  .claude/rules/ (user rules)
```
