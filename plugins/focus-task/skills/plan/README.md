# Plan Skill

Create an execution plan (PLAN.md) from your task specification.

## What It Does

Converts a SPEC.md into a detailed PLAN.md with phases, agent assignments, and verification criteria. Supports planning from existing SPEC files or Plan Mode files.

## How to Use

```bash
/focus-task:plan [task-dir]
/focus-task:plan [SPEC.md]
/focus-task:plan [plan-file]
/focus-task:plan              # Defaults to .claude/TASK.md reference
```

## Arguments

| Argument | Type | Optional | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | Task directory, SPEC.md, or plan file path |

## Example

```bash
# Create plan from SPEC
/focus-task:plan .claude/tasks/20260212_new_feature_task/SPEC.md

# Or from task directory
/focus-task:plan .claude/tasks/20260212_new_feature_task

# Or use latest from quick ref
/focus-task:plan
```

## Output

Creates in task directory:
- **PLAN.md** — Phases with agent assignments and success criteria
- **KNOWLEDGE.jsonl** — Pattern and architecture knowledge base
- **artifacts/** — Directory for execution outputs
- **backup/** — Directory for file backups

Next step: `/focus-task:start` to execute the plan.
