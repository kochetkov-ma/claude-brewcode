---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# /brewcode:spec

Create a detailed specification for your task through research and Q&A.

## What It Does

This skill researches your codebase, asks clarifying questions, and generates a comprehensive SPEC.md document that outlines requirements, architecture, and risks.

## How to Use

```bash
/brewcode:spec "Build authentication system with OAuth2 support"
```

Or provide a requirements file:

```bash
/brewcode:spec /path/to/requirements.md
```

Non-interactive mode (no questions):

```bash
/brewcode:spec -n "Build authentication system with OAuth2 support"
```

## Arguments

| Argument | Description |
|----------|-------------|
| `-n`, `--noask` | Skip all user questions, auto-approve defaults |
| `<description>` | Task description (text) |
| `<path>` | Path to requirements file |
| (empty) | Reads from `.claude/TASK.md` |

## Workflow

1. **Invoke** with your task description
2. **Clarifying Questions** -- 3-5 questions in 3 categories: Scope (in/out, modules), Constraints (libraries, compatibility, API contracts), Edge cases (concurrency, nulls, error recovery)
3. **Feature Splitting Check** -- if requirements cover >3 independent areas or >12 estimated phases, the skill suggests splitting into smaller tasks
4. **Parallel Research** -- 5-10 agents explore codebase in parallel (controllers, services, tests, config, docs, etc.)
5. **Consolidation** -- merges agent findings into SPEC.md, deduplicates, fills all sections from project-adapted template
6. **User Validation** -- presents key architectural decisions, risks, and assumptions for confirmation
7. **Quality Gate** -- reviewer agent checks completeness, consistency, and feasibility; fixes critical/major remarks in a loop (max 3 iterations)
8. **Output** -- `SPEC.md` in `.claude/tasks/{TIMESTAMP}_{NAME}_task/`

> **Tip:** Use `-n` flag to skip interactive questions (steps 2, 3, 6) for CI/automated pipelines.

## Next Steps

After spec is created, run:
```bash
/brewcode:plan .claude/tasks/{TIMESTAMP}_{NAME}_task/
```

## Requirements

- Must run `/brewcode:setup` first (creates adapted templates)
- Project must have `.claude/` directory
