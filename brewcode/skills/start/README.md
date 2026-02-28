---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# brewcode:start

Execute a task with infinite context through automatic handoff.

## Overview

Runs a task from planning through completion with multi-agent execution. Automatically handles context limits via session handoff — no manual intervention needed.

## How to Use

```
/brewcode:start [task-path]
```

**Arguments:**
- `[task-path]` — Path to task PLAN.md (optional; defaults to path in `.claude/TASK.md`)

## Examples

Run a task from current project:

```
/brewcode:start .claude/tasks/20260211-140000_my_task/PLAN.md
```

Run task referenced in TASK.md:

```
/brewcode:start
```

## What Happens

1. Coordinator validates task and creates execution lock
2. Loads PLAN.md and executes each phase with the appropriate agent (developer/tester/reviewer)
3. After each agent: WRITE report to artifacts → CALL coordinator to extract knowledge
4. Knowledge from execution is compacted and preserved in KNOWLEDGE.jsonl
5. At context limit, PreCompact hook triggers automatic handoff to new session
6. Resumes from where it left off with full context
7. **Rules actualization**: KNOWLEDGE.jsonl -> `.claude/rules/*.md` (entries with priority markers)
8. **KNOWLEDGE cleanup**: removes actualized entries, keeps context facts

## Key Features

- **Infinite Execution** — Runs until completion even at context limits
- **Multi-Agent** — Uses developer, tester, and reviewer agents
- **Auto-Handoff** — PreCompact hook triggers automatic session handoff
- **2-Step Protocol** — WRITE report → CALL coordinator after each agent
- **Artifact Tracking** — All outputs saved to task directory
- **Knowledge Preservation** — Learns from each phase via KNOWLEDGE.jsonl

## Next Steps

Before running start, create a task with:
- `/brewcode:spec` — Describe what you want done
- `/brewcode:plan` — Plan the execution phases
