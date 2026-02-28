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

## Workflow (SPEC Mode)

1. **Read SPEC** -- extracts goal, requirements, analysis, context files, risks, decisions
2. **Scan Project** -- finds 1-2 canonical reference files per phase type (controller, service, test, etc.)
3. **Phase Breakdown** -- splits into 5-12 phases with dependencies, agent assignments, and verification criteria
4. **User Approval** -- presents proposed phases for approval or adjustments
5. **Generate Artifacts** -- writes PLAN.md from project-adapted template
6. **Technology Choices** -- documents non-trivial tech decisions (library, pattern, approach) with rationale and rejected alternatives
7. **Quorum Review** -- 3 mixed agents (Plan + architect + reviewer) review in parallel; only remarks confirmed by 2/3 majority are accepted
8. **Traceability Check** -- verifies every Scope item and requirement from SPEC has at least one phase; adds missing phases if gaps found
9. **Present Results** -- shows confirmed remarks and traceability results for user approval

## Workflow (Plan Mode)

For plans created outside brewcode (e.g., `.claude/plans/LATEST.md`):

1. **Parse Plan File** -- extracts structure, goals, steps
2. **Create Task Dir + Scan** -- generates task directory and finds reference files
3. **Split into Granular Phases** -- each plan item may become 1-3 phases with verification
4. **User Approval** -- same as SPEC mode
5. **Generate Artifacts** -- PLAN.md, KNOWLEDGE.jsonl, artifacts/, backup/ (no SPEC.md in this flow)
6. **Lightweight Review** -- 2 agents (architect + reviewer) review in parallel; 2/2 consensus required

## Output

Creates in task directory:

| File | Description |
|------|-------------|
| `PLAN.md` | Phases with agent assignments, dependencies, and success criteria |
| `KNOWLEDGE.jsonl` | Empty (0-byte) knowledge base, populated during execution |
| `artifacts/` | Directory for execution outputs |
| `backup/` | Directory for file backups |

Also updates `.claude/TASK.md` quick reference (prepends task path, preserves history).

> **Tip:** Use `-n` flag to skip interactive questions for CI/automated pipelines.

Next step: `/brewcode:start .claude/tasks/{TS}_{NAME}_task/PLAN.md` to execute the plan.
