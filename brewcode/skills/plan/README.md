---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Plan Skill

Create an execution plan (PLAN.md) from your task specification.

## What It Does

Converts a SPEC.md into a detailed PLAN.md with phases, agent assignments, and verification criteria. Supports two input modes:
- **SPEC Mode** — Creates plan from existing SPEC.md
- **Plan Mode** — Creates plan from `.claude/plans/LATEST.md` or plan file (skips SPEC step)

## How to Use

```bash
/brewcode:plan [task-dir|SPEC.md|plan-file]
```

## Arguments

| Argument | Type | Optional | Description |
|----------|------|----------|-------------|
| `-n`, `--noask` | flag | Yes | Skip all user questions, auto-approve defaults |
| `task-dir\|SPEC.md\|plan-file` | string | Yes | Task directory, SPEC.md, or plan file path — defaults to .claude/TASK.md ref |

## Examples

```bash
# Create plan from SPEC
/brewcode:plan .claude/tasks/20260212-140000_new_feature_task/SPEC.md

# Or from task directory
/brewcode:plan .claude/tasks/20260212-140000_new_feature_task

# Or from Plan Mode file
/brewcode:plan .claude/plans/LATEST.md

# Or use latest from quick ref
/brewcode:plan

# Non-interactive mode (no questions)
/brewcode:plan -n .claude/tasks/20260212-140000_new_feature_task/SPEC.md
```

## Output

Creates in task directory:
- **PLAN.md** — Phases with agent assignments and success criteria
- **KNOWLEDGE.jsonl** — Pattern and architecture knowledge base
- **artifacts/** — Directory for execution outputs
- **backup/** — Directory for file backups
- **Quick reference** — Updates `.claude/TASK.md` with task path (preserves history)

The plan undergoes quorum review (3 agents, 2/3 consensus) before finalization.

> **Tip:** Use `-n` flag to skip interactive questions for CI/automated pipelines.

Next step: `/brewcode:start .claude/tasks/{TS}_{NAME}_task/PLAN.md` to execute the plan.
