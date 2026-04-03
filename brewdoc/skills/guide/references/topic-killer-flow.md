# Topic 3: The Killer Flow — Spec, Plan, Start

Domain: Core Workflow

## Section 1: The Pipeline

The core workflow chains 3 skills into one continuous pipeline:

1. `/brewcode:spec "description"` — Creates SPEC.md through research + user Q&A
2. `/brewcode:plan` — Creates PLAN.md with phases, dependencies, agent assignments
3. `/brewcode:start` — Executes with infinite context handoff

```
User describes task
  -> /brewcode:spec analyzes codebase, asks clarifying questions
    -> Produces SPEC.md in .claude/tasks/{ts}_{name}_task/
      -> /brewcode:plan reads SPEC, creates phases
        -> Produces PLAN.md + phases/*.md
          -> /brewcode:start executes phase by phase
            -> Automatic handoff when context fills
              -> Continues from where it left off
```

Each skill feeds the next. SPEC defines WHAT. PLAN defines HOW. START does the work.

Reference `Diagram: Killer Flow Pipeline` from ascii-diagrams.md.

## Section 2: Infinite Context — How Handoff Works

The "infinite" part: tasks survive context window limits automatically.

| Step | What happens |
|------|-------------|
| 1 | Agent executes phases from PLAN.md |
| 2 | Context window fills (~80% capacity) |
| 3 | PreCompact hook triggers automatically |
| 4 | KNOWLEDGE.jsonl saved, handoff notes written |
| 5 | Auto-compact clears context |
| 6 | Agent re-reads PLAN.md + KNOWLEDGE |
| 7 | Execution resumes from where it left off |

No user intervention needed. The hook chain drives it all:

```
session-start -> pre-task -> post-task -> pre-compact -> stop
```

Pre-compact writes handoff state. Session-start reads it back. The loop is seamless.

## Section 3: Knowledge Persistence

KNOWLEDGE.jsonl stores learnings across sessions and compactions. It never gets lost.

Format:
```jsonl
{"ts":"2026-01-26T14:00:00","t":"❌","txt":"Avoid SELECT *","src":"sql_expert"}
{"ts":"2026-01-26T14:05:00","t":"✅","txt":"Use parameterized queries","src":"db_agent"}
{"ts":"2026-01-26T14:10:00","t":"ℹ️","txt":"DB uses PostgreSQL 16","src":"setup"}
```

Priority levels (highest to lowest):

| Marker | Meaning | Example |
|--------|---------|---------|
| ❌ | Avoid this pattern | "Never use raw SQL concatenation" |
| ✅ | Do this instead | "Always use ORM query builder" |
| ℹ️ | Informational fact | "Project uses Spring Boot 3.2" |

Knowledge is injected into every agent prompt via the pre-task hook. Agents learn from previous sessions without re-discovering.

## Section 4: Task Directory Structure

Every task gets its own directory under `.claude/tasks/`:

```
.claude/tasks/{ts}_{name}_task/
  SPEC.md              # What to build
  PLAN.md              # How to build it
  KNOWLEDGE.jsonl      # Learnings
  phases/              # Phase instructions
    P1_setup.md
    P1V_verify.md
    ...
  artifacts/           # Agent outputs
    FINAL.md
    {P}-{N}{T}/
  backup/              # Pre-execution backups
  .lock                # Execution lock
```

Reference `Diagram: Project Directory` from ascii-diagrams.md.

Key files:
- **SPEC.md** — Created by `/brewcode:spec`, never modified after
- **PLAN.md** — Created by `/brewcode:plan`, tracks phase status
- **KNOWLEDGE.jsonl** — Grows during execution, compacted at handoff
- **.lock** — Prevents concurrent execution of the same task
