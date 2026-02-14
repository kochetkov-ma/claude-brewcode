---
name: brewcode:teardown
description: Removes brewcode project files (templates, configs, logs).
disable-model-invocation: true
argument-hint: "[--dry-run]"
allowed-tools: Bash, Read, AskUserQuestion
context: fork
model: haiku
---

<instructions>

## Execution

**Skill arguments received:** `$ARGUMENTS`

**If NOT `--dry-run`:** Use AskUserQuestion to confirm before executing:
> "This will delete brewcode project files (templates, configs, logs, plans). Task directories are preserved. Proceed?"

**EXECUTE** using Bash tool — run teardown script:
```bash
bash scripts/teardown.sh ARGS_HERE && echo "✅ done" || echo "❌ FAILED"
```
**IMPORTANT:** Replace `ARGS_HERE` with the actual value from "Skill arguments received" above. If empty, omit the argument.

> **STOP if ❌** — check script path exists and teardown.sh has execute permissions.

## Options

| Option | Behavior |
|--------|----------|
| `--dry-run` | List files to delete without removing them |
| (none) | Full removal after user confirmation |

## Preserved

Task directories (`.claude/tasks/*_task/`) and user rules (`.claude/rules/`) are always preserved.

</instructions>

## Output

```markdown
# Brewcode Teardown

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
  ✅ .claude/skills/brewcode-review/

Preserved:
  ⏭️  .claude/tasks/*_task/ (task directories)
  ⏭️  .claude/rules/ (user rules)
```
