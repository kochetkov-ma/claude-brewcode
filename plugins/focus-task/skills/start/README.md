# focus-task:start

Execute a task with infinite context through automatic handoff.

## Overview

Runs a task from planning through completion with multi-agent execution. Automatically handles context limits via session handoff — no manual intervention needed.

## How to Use

```
/focus-task:start [task-path]
```

**Arguments:**
- `[task-path]` — Path to task PLAN.md (optional; defaults to path in `.claude/TASK.md`)

## Examples

Run a task from current project:

```
/focus-task:start .claude/tasks/20260211-140000_my_task/PLAN.md
```

Run task referenced in TASK.md:

```
/focus-task:start
```

## What Happens

1. Loads PLAN.md and executes each phase with the appropriate agent
2. Each agent generates output → saved to artifacts
3. Knowledge from execution is compacted and preserved
4. At context limit, automatically hands off to new session
5. Resumes from where it left off with full context

## Key Features

- **Infinite Execution** — Runs until completion even at context limits
- **Multi-Agent** — Uses developer, tester, and reviewer agents
- **Auto-Handoff** — No manual intervention for context switches
- **Artifact Tracking** — All outputs saved to task directory
- **Knowledge Preservation** — Learns from each phase

## Next Steps

Before running start, create a task with:
- `/focus-task:spec` — Describe what you want done
- `/focus-task:plan` — Plan the execution phases
