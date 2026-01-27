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

## Typical Workflow

1. **Invoke** with your task description
2. **Answer** clarifying questions (scope, constraints, trade-offs)
3. **Review** research findings and risk assessment
4. **Confirm** completeness with feedback
5. **Get** SPEC.md in `.claude/tasks/{TIMESTAMP}_{NAME}_task/`

> **Tip:** Use `-n` flag to skip interactive questions for CI/automated pipelines.

## Next Steps

After spec is created, run:
```bash
/brewcode:plan .claude/tasks/{TIMESTAMP}_{NAME}_task/
```

## Requirements

- Must run `/brewcode:setup` first (creates templates)
- Project must have `.claude/` directory
