---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Start

Execute a task with **infinite context** -- the skill runs multi-agent phases from a PLAN.md, automatically handing off to a new session when context fills up, and resuming exactly where it left off. No manual intervention, no lost progress.

## Quick Start

```
/brewcode:start
```

Runs the task referenced in `.claude/TASK.md` (first line = active task path).

## Modes

| Mode | Invocation | Behavior |
|------|-----------|----------|
| Default (TASK.md) | `/brewcode:start` | Reads `.claude/TASK.md`, uses the path on line 1 |
| Explicit path | `/brewcode:start .claude/tasks/20260401-120000_migrate_api/PLAN.md` | Uses the provided path directly |
| Resume after compact | (automatic) | After context compaction, re-reads `TaskList()` + PLAN.md and continues from the current in-progress or next pending phase |

## Examples

### Good Usage

```
# 1. Full workflow: spec -> plan -> start
/brewcode:spec "Migrate REST endpoints from v1 to v2"
/brewcode:plan
/brewcode:start

# 2. Explicit path to a specific task
/brewcode:start .claude/tasks/20260401-093000_refactor_auth/PLAN.md

# 3. Multiple tasks over time -- each with its own PLAN.md
/brewcode:spec "Add rate limiting middleware"
/brewcode:plan
/brewcode:start .claude/tasks/20260401-150000_rate_limiting/PLAN.md

# 4. Resume a task that was interrupted (TASK.md still points to it)
/brewcode:start

# 5. Long-running task with many phases -- just start and walk away
/brewcode:start .claude/tasks/20260331-080000_full_rewrite/PLAN.md
```

### Common Mistakes

```
# BAD: No PLAN.md exists yet -- start has nothing to execute
/brewcode:start
# -> Error: "No task path! Run: /brewcode:spec then /brewcode:plan"

# BAD: Pointing to the task directory instead of PLAN.md
/brewcode:start .claude/tasks/20260401-120000_migrate_api/
# -> The argument should be the full path to PLAN.md

# BAD: Skipping /brewcode:spec and /brewcode:plan
#      A PLAN.md with a Phase Registry is required before start
```

## How It Works

1. **Initialize** -- The coordinator validates the task, creates an execution lock, and sets status to `in progress`.
2. **Parse phases** -- The Phase Registry table in PLAN.md is read. Each row becomes a Task with subject, agent assignment, and dependency links.
3. **Execution loop** -- Pending tasks with no blockers are spawned in parallel. Each agent runs its phase, writes a report to `artifacts/`, then the coordinator extracts knowledge.
4. **Failure handling** -- If an agent fails, it retries once. After repeated failures: root-cause exploration, phase splitting, model upgrade, or user escalation. Failed tasks cascade to their dependents, but independent tasks continue.
5. **Context compaction (handoff)** -- When the context window fills, the PreCompact hook triggers automatic compaction. On resume, the skill calls `TaskList()` to get current state, re-reads PLAN.md, and continues from wherever it left off. No progress is lost.
6. **Finalize** -- The coordinator marks the task finished (or failed if deadlock/cascade occurred).
7. **Rules extraction** -- KNOWLEDGE.jsonl entries are promoted to `.claude/rules/*.md` files, then pruned from the knowledge file.

The handoff mechanism is what makes execution "infinite": the skill can survive any number of context compactions and keep going until every phase completes or permanently fails.

## Output

| Artifact | Location | Content |
|----------|----------|---------|
| Phase reports | `artifacts/{P}-{N}{T}/{AGENT}_output.md` | Each agent's output per phase |
| Final summary | `artifacts/FINAL.md` | Coordinator-generated completion report |
| Knowledge log | `KNOWLEDGE.jsonl` | Reusable patterns, anti-patterns, and facts discovered during execution |
| Extracted rules | `.claude/rules/*.md` | Promoted knowledge entries with priority markers |

All artifacts live under the task directory: `.claude/tasks/{TS}_{NAME}_task/`.

## Tips

- **Prepare before starting.** Always run `/brewcode:spec` and `/brewcode:plan` first. The skill needs a PLAN.md with a Phase Registry table to execute.
- **Let it run.** The handoff mechanism handles context limits automatically. There is no need to monitor or intervene unless the skill asks a question via `AskUserQuestion`.
- **Check KNOWLEDGE.jsonl after completion.** It contains lessons learned during execution -- anti-patterns to avoid, patterns that worked, and architectural facts about your codebase.
- **Use explicit paths when juggling multiple tasks.** If you switch between tasks frequently, pass the PLAN.md path directly instead of relying on `.claude/TASK.md`.

## Documentation

Full docs: [start](https://doc-claude.brewcode.app/brewcode/skills/start/)
