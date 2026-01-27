---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Flow diagrams for brewcode plugin execution
---

# Brewcode Flow Diagrams

## Table of Contents

| # | Diagram | Description |
|---|-----------|----------|
| a | Specification creation | `/brewcode:spec` — research and SPEC.md |
| b | Plan creation | `/brewcode:plan` — SPEC.md to PLAN.md |
| c | Task execution | `/brewcode:start` — full cycle with hooks |
| d | Lock file lifecycle | Creation, binding, checks, deletion |
| e | Handoff during compaction | Context preservation during auto-compact |
| f | Task lifecycle | State machine |

---

## a) Specification creation (`/brewcode:spec`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         /brewcode:spec                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  Input: task description OR path to file OR empty (.claude/TASK.md)

  ┌──────────────────┐
  │ 0. Check         │
  │    templates     │
  │ SPEC.md.template │
  └────────┬─────────┘
           │
           │ Template found
           ▼
  ┌──────────────────┐
  │ 1. Read input    │
  │ Parse arguments  │
  │ Define scope     │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 2. Clarifying    │────▶│ AskUserQuestion                  │
  │    questions     │◀────│ 1-4 questions: scope, priorities,│
  │ (1-4 questions)  │     │ constraints, edge cases          │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           │ Answers received
           ▼
  ┌──────────────────┐
  │ 3. Divide into   │
  │    research      │
  │    areas         │
  │ (5-10 areas)     │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 4. Parallel research (ONE call, 5-10 agents)                        │
  │                                                                      │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
  │  │developer │ │developer │ │sql_expert│ │ tester   │ │ Explore  │  │
  │  │Controller│ │ Services │ │ DB/Repos │ │  Tests   │ │   Docs   │  │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
  │       │            │            │            │            │          │
  │       ▼            ▼            ▼            ▼            ▼          │
  │  ┌──────────────────────────────────────────────────────────────┐    │
  │  │              Agent results (patterns, risks,                 │    │
  │  │              reusable code, constraints)                     │    │
  │  └──────────────────────────────────────────────────────────────┘    │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │ 5. Consolidation │
                            │    into SPEC.md  │
                            │ (deduplication + │
                            │  merging)        │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐     ┌──────────────────┐
                            │ 6. Validation    │────▶│ AskUserQuestion  │
                            │    with user     │◀────│ Decisions, risks,│
                            │                  │     │ assumptions      │
                            └────────┬─────────┘     └──────────────────┘
                                     │
                                     │ Feedback incorporated
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 7. SPEC review (iteration loop)                                     │
  │                                                                      │
  │  ┌──────────┐                                                        │
  │  │ reviewer │──▶ Findings (critical/major/minor)                     │
  │  └──────────┘          │                                             │
  │                        ▼                                             │
  │              critical > 0 OR major > 0?                              │
  │              ┌─────┴──────┐                                          │
  │              │ YES        │ NO                                       │
  │              ▼            ▼                                           │
  │         Fix          ┌──────────┐                                    │
  │         SPEC.md      │  READY   │                                    │
  │              │       └──────────┘                                    │
  │              └──▶ Re-review ───────┐                                 │
  │                                    │                                │
  │              ◀─────────────────────┘                                │
  └──────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │    RESULT        │
                            │                  │
                            │ .claude/tasks/   │
                            │ {TS}_{NAME}_task/│
                            │   SPEC.md        │
                            └──────────────────┘
```

---

## b) Plan creation (`/brewcode:plan`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         /brewcode:plan                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                        Determine input type
                        ┌──────────────────┐
                        │  Argument type?  │
                        └────────┬─────────┘
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
  ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐
  │ Path to task_dir │ │ Plan Mode file │ │ Empty            │
  │ or SPEC.md       │ │ LATEST.md      │ │ (.claude/TASK.md)│
  └────────┬─────────┘ └───────┬────────┘ └────────┬─────────┘
           │                   │                    │
           ▼                   ▼                    ▼
  ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐
  │ SPEC flow        │ │ PlanMode flow  │ │ Read reference   │
  │ (steps 1-8)      │ │ (steps 1-5)    │ │ to latest task   │
  └────────┬─────────┘ └───────┬────────┘ └────────┬─────────┘
           │                   │                    │
           └───────────┬───────┘────────────────────┘
                       ▼

  ╔═══════════════════════════════════════════════════════════╗
  ║                   SPEC FLOW (main)                        ║
  ╚═══════════════════════════════════════════════════════════╝

  ┌──────────────────┐
  │ 0. Check         │
  │ PLAN.md.template │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ 1. Read SPEC     │
  │ Goal, requirements,│
  │ analysis, risks  │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ 2. Scan          │
  │ project          │
  │ Reference examples│
  │ (R1, R2...)      │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ 3. Generate phases│
  │ 5-12 phases      │
  │ + dependencies    │
  │ + agents          │
  │ + verification (NV)│
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 4. Present to    │────▶│ AskUserQuestion                  │
  │    user          │◀────│ Number of phases, descriptions,  │
  │                  │     │ agents, dependencies             │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           │ Confirmed / adjusted
           ▼
  ┌──────────────────┐
  │ 5. Generate      │
  │    artifacts     │
  │ PLAN.md          │
  │ KNOWLEDGE.jsonl  │
  │ artifacts/       │
  │ backup/          │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 6. Quorum plan review (3 parallel agents)                           │
  │                                                                      │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
  │  │  Plan #1 │  │  Plan #2 │  │  Plan #3 │                          │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘                          │
  │       │            │            │                                    │
  │       └──────┬─────┘────────────┘                                   │
  │              ▼                                                       │
  │   Quorum rule: only findings                                        │
  │   confirmed by 2+ agents                                            │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────┐
  │ 7. Verification  │
  │ reviewer: each   │
  │ SPEC requirement │
  │ covered by phase │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 8. Present       │────▶│ AskUserQuestion                  │
  │    review        │◀────│ Findings + verification          │
  │    results       │     │ Accept / reject each             │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           │ Corrections applied
           ▼
  ┌──────────────────┐
  │ Update           │
  │ .claude/TASK.md  │
  │ (link at top)    │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Validation:      │
  │ TASK_DIR         │
  │ PLAN.md          │
  │ KNOWLEDGE.jsonl  │
  │ artifacts/       │
  │ backup/          │
  │ QUICK_REF        │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────────────────────────────┐
  │              RESULT                      │
  │                                          │
  │ .claude/tasks/{TS}_{NAME}_task/          │
  │   PLAN.md                                │
  │   KNOWLEDGE.jsonl                        │
  │   artifacts/                             │
  │   backup/                                │
  │                                          │
  │ Next: /brewcode:start {task_path}       │
  └──────────────────────────────────────────┘
```

---

## c) Task execution (`/brewcode:start`)

### c.1) Main execution loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        /brewcode:start                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐
  │ 1. Determine     │     $ARGUMENTS path OR .claude/TASK.md
  │    task path     │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 2. Initialize    │────▶│ bc-coordinator (mode: initialize)│
  │    via           │◀────│ Validation, .lock, status →      │
  │    coordinator   │     │ "in progress"                    │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           │                    ┌─────────────────────────────┐
           │ ┌─ post-task.mjs ─▶│ Bind session_id to .lock    │
           │ │                  └─────────────────────────────┘
           ▼
  ┌──────────────────┐
  │ 3. Load          │
  │    context       │     PLAN.md + KNOWLEDGE.jsonl
  └────────┬─────────┘
           │
           ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║ 4. PHASE EXECUTION LOOP (for each phase N)                          ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                       ║
  ║  ┌──────────────────────────────────────────────────────────────┐    ║
  ║  │                    PHASE N (execution)                       │    ║
  ║  │                                                              │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ pre-task.mjs      │  Injection:                         │    ║
  ║  │   │ (PreToolUse:Task) │  1. grepai reminder                 │    ║
  ║  │   │                   │  2. ## K (knowledge from KNOWLEDGE.jsonl) │    ║
  ║  │   │                   │  3. Role constraints                │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             ▼                                                │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ Call worker       │  developer / tester / reviewer      │    ║
  ║  │   │ agent             │                                     │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             │                                                │    ║
  ║  │             │  ┌──────────────────────────────────────┐     │    ║
  ║  │             ├──│ post-task.mjs (PostToolUse:Task)     │     │    ║
  ║  │             │  │ "AGENT DONE -> 1.WRITE 2.CALL coord"│     │    ║
  ║  │             │  └──────────────────────────────────────┘     │    ║
  ║  │             ▼                                                │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ STEP 1: Write     │  artifacts/{P}-{N}{T}/             │    ║
  ║  │   │ agent report      │  {AGENT}_output.md                 │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             ▼                                                │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ STEP 2: Call      │  bc-coordinator:                    │    ║
  ║  │   │ coordinator       │  - Update phase status              │    ║
  ║  │   │                   │  - Read report from disk            │    ║
  ║  │   │                   │  - Extract knowledge -> KNOWLEDGE   │    ║
  ║  │   │                   │  - Auto-compact if >= threshold     │    ║
  ║  │   │                   │  - Write summary.md                 │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             ▼                                                │    ║
  ║  └──────────────────────────────────────────────────────────────┘    ║
  ║                │                                                      ║
  ║                ▼                                                      ║
  ║  ┌──────────────────────────────────────────────────────────────┐    ║
  ║  │                    PHASE NV (verification)                   │    ║
  ║  │                                                              │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ Call reviewer /   │  Check phase N results              │    ║
  ║  │   │ tester            │                                     │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             ▼                                                │    ║
  ║  │        Result?                                               │    ║
  ║  │      ┌──────┴──────┐                                        │    ║
  ║  │      ▼             ▼                                        │    ║
  ║  │  PASSED        FAILED                                       │    ║
  ║  │     │         ┌────┴────┐                                   │    ║
  ║  │     │         ▼         ▼                                   │    ║
  ║  │     │   Iteration   Iterations >= 3?                        │    ║
  ║  │     │   < 3             │                                   │    ║
  ║  │     │      │            ▼                                   │    ║
  ║  │     │      │   ┌────────────────┐                           │    ║
  ║  │     │      │   │  Escalation:   │                           │    ║
  ║  │     │      │   │  1. R&D phase  │                           │    ║
  ║  │     │      │   │  2. Split      │                           │    ║
  ║  │     │      │   │  3. Upgrade    │                           │    ║
  ║  │     │      │   │  4. Reassign   │                           │    ║
  ║  │     │      │   │  5. Question   │                           │    ║
  ║  │     │      │   └────────┬───────┘                           │    ║
  ║  │     │      │            │                                   │    ║
  ║  │     │      └────┬───────┘                                   │    ║
  ║  │     │           ▼                                           │    ║
  ║  │     │   Fix -> Retry NV                                     │    ║
  ║  │     │           │                                           │    ║
  ║  │     │           └──────────────────▶ (return to verification) │    ║
  ║  │     │                                                       │    ║
  ║  └─────┼───────────────────────────────────────────────────────┘    ║
  ║        │                                                            ║
  ║        ▼                                                            ║
  ║   Next phase (N+1) ─────────────────────▶ (return to loop start)   ║
  ║                                                                     ║
  ╚═════════════════════════════════════════════════════════════════════╝
           │
           │ All phases completed
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 5. Final review (3+ parallel reviewers)                            │
  │                                                                      │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
  │  │reviewer#1│  │reviewer#2│  │reviewer#3│                          │
  │  │business  │  │code      │  │patterns  │                          │
  │  │logic     │  │quality   │  │          │                          │
  │  └──────────┘  └──────────┘  └──────────┘                          │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 6. Completion    │────▶│ bc-coordinator (mode: finalize)  │
  │                  │◀────│ FINAL.md, status -> "finished"   │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           ▼
  ┌──────────────────┐
  │ Extract rules    │
  │ /brewcode:rules │
  │ KNOWLEDGE -> rules│
  └──────────────────┘
```

### c.2) Hook interaction during execution

```
  Hook                    Event                     Action
  ════════════════════    ══════════════════════     ══════════════════════════

  session-start.mjs      SessionStart               Log session_id,
                                                     bind session to task,
                                                     link LATEST.md (clear)

  pre-task.mjs           PreToolUse:Task             1. grepai reminder
                         (BEFORE each agent)          2. Inject ## K knowledge
                                                     3. Role constraints

  post-task.mjs          PostToolUse:Task            For coordinator:
                         (AFTER each agent)            bind session -> lock
                                                     For worker agents:
                                                       remind 2-step protocol

  pre-compact.mjs        PreCompact                  1. Check lock
                         (during auto-compact)        2. Validate artifacts
                                                     3. Compact KNOWLEDGE
                                                     4. Write handoff entry
                                                     5. Status -> "handoff"
                                                     6. systemMessage with context

  stop.mjs               Stop                        Task not finished?
                         (on exit attempt)              -> BLOCK exit
                                                     Task finished?
                                                       -> Delete .lock
                                                     Stale lock (>24h)?
                                                       -> Auto-cleanup
```

---

## d) Lock file lifecycle

```
  .claude/tasks/{TS}_{NAME}_task/.lock

  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │   /brewcode:start                                                  │
  │        │                                                             │
  │        ▼                                                             │
  │   ┌─────────────────┐                                               │
  │   │ 1. CREATION     │  bc-coordinator (mode: initialize)            │
  │   │                 │                                               │
  │   │ {               │                                               │
  │   │  "task_path":.. │  session_id NOT YET BOUND                     │
  │   │  "started_at":..│                                               │
  │   │ }               │                                               │
  │   └────────┬────────┘                                               │
  │            │                                                         │
  │            ▼                                                         │
  │   ┌─────────────────┐                                               │
  │   │ 2. SESSION      │  post-task.mjs (after coordinator)            │
  │   │    BINDING      │                                               │
  │   │                 │                                               │
  │   │ {               │                                               │
  │   │  "task_path":.. │  + session_id BOUND                           │
  │   │  "started_at":..│                                               │
  │   │  "session_id":..│  Now lock belongs to specific session         │
  │   │ }               │                                               │
  │   └────────┬────────┘                                               │
  │            │                                                         │
  │            ▼                                                         │
  │   ┌─────────────────────────────────────────────────────────┐       │
  │   │ 3. CHECKS DURING LIFETIME                                │       │
  │   │                                                          │       │
  │   │  checkLock(cwd, session_id) called in:                  │       │
  │   │                                                          │       │
  │   │  ┌──────────────┐  lock exists + session matches?       │       │
  │   │  │ pre-task.mjs │──┬─ YES -> inject knowledge           │       │
  │   │  └──────────────┘  └─ NO -> skip injection              │       │
  │   │                                                          │       │
  │   │  ┌──────────────┐  lock exists + session matches?       │       │
  │   │  │ post-task.mjs│──┬─ YES -> remind 2-step              │       │
  │   │  └──────────────┘  └─ NO -> skip                        │       │
  │   │                                                          │       │
  │   │  ┌────────────────┐  lock exists + session matches?     │       │
  │   │  │pre-compact.mjs │──┬─ YES -> handoff logic            │       │
  │   │  └────────────────┘  └─ NO -> normal compact            │       │
  │   │                                                          │       │
  │   │  ┌──────────────┐  lock.session_id == current session?  │       │
  │   │  │   stop.mjs   │──┬─ YES -> check task status          │       │
  │   │  └──────────────┘  └─ NO -> allow exit                  │       │
  │   │                                                          │       │
  │   │  IMPORTANT: session_id DOES NOT CHANGE after compact!   │       │
  │   │  Lock remains valid within the same session.             │       │
  │   └──────────────────────────────────────────────────────────┘       │
  │            │                                                         │
  │            ▼                                                         │
  │   ┌─────────────────────────────────────────────────┐               │
  │   │ 4. DELETION                                      │               │
  │   │                                                  │               │
  │   │  Scenario A: Task finished (finished)            │               │
  │   │  ┌──────────┐                                   │               │
  │   │  │ stop.mjs │──▶ deleteLock() + allow exit      │               │
  │   │  └──────────┘                                   │               │
  │   │                                                  │               │
  │   │  Scenario B: Stale lock (> 24 hours)            │               │
  │   │  ┌──────────┐                                   │               │
  │   │  │ stop.mjs │──▶ deleteLock() + allow exit      │               │
  │   │  └──────────┘                                   │               │
  │   │                                                  │               │
  │   │  Scenario C: No session_id (unbound)            │               │
  │   │  ┌──────────┐                                   │               │
  │   │  │ stop.mjs │──▶ deleteLock() + allow exit      │               │
  │   │  └──────────┘                                   │               │
  │   │                                                  │               │
  │   │  Scenario D: Emergency exit (user)              │               │
  │   │  rm .claude/tasks/*_task/.lock                   │               │
  │   │                                                  │               │
  │   └──────────────────────────────────────────────────┘               │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## e) Handoff during compaction

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │              INFINITE CONTEXT VIA AUTO-COMPACT                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Task execution (phase N, context growing)
           │
           │ Context approaching limit
           │ Claude Code triggers auto-compact
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ pre-compact.mjs (PreCompact)                                        │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │ 1. Check lock    │  checkLock(cwd, session_id)                   │
  │  │    and session   │  Lock not found? -> normal compact            │
  │  └────────┬─────────┘                                               │
  │           │ Lock valid                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 2. Parse task    │  parseTask() -> status, current phase,        │
  │  │                  │  total phases                                  │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 3. Validate      │  Check current phase artifacts                │
  │  │    state         │  Warn if missing                              │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────────────────────────────────────────────┐       │
  │  │ 4. Compact KNOWLEDGE.jsonl                               │       │
  │  │                                                          │       │
  │  │  localCompact(knowledgePath, maxEntries):                │       │
  │  │                                                          │       │
  │  │  Entries >= maxEntries/2?                                │       │
  │  │     ┌──────┴──────┐                                     │       │
  │  │     │ NO          │ YES                                 │       │
  │  │     ▼             ▼                                     │       │
  │  │   Skip       ┌────────────────────────────┐             │       │
  │  │              │ a. Deduplicate (by txt)     │             │       │
  │  │              │ b. Sort by priority         │             │       │
  │  │              │    (weight: ❌ > ✅ > ℹ️)    │             │       │
  │  │              │ c. Trim to maxEntries       │             │       │
  │  │              │ d. Atomic write             │             │       │
  │  │              │    (.tmp -> rename)         │             │       │
  │  │              └────────────────────────────┘             │       │
  │  └──────────────────────────────────────────────────────────┘       │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 5. Write handoff │  KNOWLEDGE.jsonl +=                           │
  │  │    entry         │  {"t":"ℹ️","txt":"Handoff at phase N:         │
  │  │                  │   context auto-compact","src":"pre-compact"}   │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 6. Update        │  PLAN.md line 1: status: handoff              │
  │  │    status        │                                               │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 7. Save          │  state.lastHandoff = timestamp                │
  │  │    state         │  state.lastPhase = N                          │
  │  │                  │  state.lastCompactAt = new Date().toISOString()              │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 8. systemMessage │  <ft-handoff>                                 │
  │  │    for Claude    │  Task: {path}                                 │
  │  │                  │  Phase: N/{total}                             │
  │  │                  │  AFTER COMPACT: re-read TASK.md               │
  │  │                  │  </ft-handoff>                                 │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │  return { continue: true, systemMessage: ... }                      │
  └──────────┬───────────────────────────────────────────────────────────┘
             │
             ▼
  ┌──────────────────┐
  │ AUTO-COMPACT     │  Claude Code compresses context
  │ (Claude Code)    │  SAME SESSION (session_id does not change!)
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ RESUMPTION (same session, compressed context)                       │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │ 1. Re-read       │  .claude/TASK.md -> path to task              │
  │  │    TASK.md       │                                               │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 2. Re-read       │  Phase status, current position               │
  │  │    PLAN.md       │  status: handoff -> continue from phase N     │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 3. Re-read       │  All accumulated knowledge (compacted)        │
  │  │ KNOWLEDGE.jsonl  │                                               │
  │  └────────┬─────────┘                                               │
  │           │                                                          │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 4. Continue      │  Phase N -> N+1 -> ... -> final              │
  │  │    execution     │                                               │
  │  └──────────────────┘                                               │
  │                                                                      │
  │  State fully preserved in files:                                    │
  │  - PLAN.md: phase status, progress                                 │
  │  - KNOWLEDGE.jsonl: accumulated knowledge                          │
  │  - artifacts/: agent reports                                        │
  │  - .lock: session binding (session_id does not change)             │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## f) Task lifecycle (state machine)

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                    TASK STATE MACHINE                                    │
  │                                                                          │
  │    State stored in PLAN.md, line 1: status: {value}                     │
  └──────────────────────────────────────────────────────────────────────────┘


                        ┌───────────────────┐
                        │                   │
                        │     pending       │  Initial state
                        │                   │  (after /brewcode:plan)
                        └─────────┬─────────┘
                                  │
                                  │  /brewcode:start
                                  │  bc-coordinator (mode: initialize)
                                  ▼
                        ┌───────────────────┐
               ┌───────▶│                   │◀──────────────────────────┐
               │        │   in progress     │  Active execution         │
               │        │                   │  (phases N -> N+1 -> ...) │
               │        └──┬────────┬───────┘                           │
               │           │        │                                    │
               │           │        │                                    │
               │           │        │                                    │
     ┌─────────┘     ┌─────┘        └──────┐                            │
     │               │                     │                            │
     │               ▼                     ▼                            │
     │    ┌───────────────────┐  ┌───────────────────┐                 │
     │    │                   │  │                   │                  │
     │    │     failed        │  │     handoff       │  Auto-compact   │
     │    │                   │  │                   │  (PreCompact)   │
     │    └──┬────────────────┘  └─────────┬─────────┘                 │
     │       │                             │                            │
     │       │  Retry /                    │  Resume                    │
     │       │  escalation                 │  after compact             │
     │       │                             │  (same session)            │
     │       └─────────────────────────────┘────────────────────────────┘
     │
     │  Task restart
     │  (status "in progress"
     │   also allowed
     │   during initialization)
     │
     │
     │          All phases completed
     │          bc-coordinator (mode: finalize)
     │
     │        ┌───────────────────┐
     └────────│                   │
              │    finished       │  Final state
              │                   │  (FINAL.md created)
              └───────────────────┘
                        │
                        │  stop.mjs
                        ▼
              ┌───────────────────┐
              │  Delete .lock     │
              │  Allow            │
              │  exit             │
              └───────────────────┘


  ═══════════════════════════════════════════════════════════════════════
  Transition Table
  ═══════════════════════════════════════════════════════════════════════

  ┌──────────────┬──────────────┬────────────────────────────────────────┐
  │ From         │ To           │ Trigger                                │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ pending      │ in progress  │ bc-coordinator mode:initialize         │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ in progress  │ in progress  │ Phase transition (N -> N+1)           │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ in progress  │ handoff      │ pre-compact.mjs (auto-compact)         │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ in progress  │ failed       │ Critical error in phase                │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ in progress  │ finished     │ bc-coordinator mode:finalize           │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ handoff      │ in progress  │ Resume after compact                   │
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ failed       │ in progress  │ Restart / escalation                   │
  └──────────────┴──────────────┴────────────────────────────────────────┘


  ═══════════════════════════════════════════════════════════════════════
  Exit Blocking (stop.mjs)
  ═══════════════════════════════════════════════════════════════════════

  ┌──────────────┬──────────────────────────────────────────────────────┐
  │ State        │ stop.mjs Behavior                                   │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ pending      │ Allow (no lock = task not started)                  │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ in progress  │ BLOCK exit, show progress                           │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ handoff      │ BLOCK exit, suggest continue                        │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ failed       │ BLOCK exit, suggest fix                             │
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ finished     │ Allow, delete .lock                                 │
  └──────────────┴──────────────────────────────────────────────────────┘

  Emergency exit: rm .claude/tasks/*_task/.lock
```

---

## Legend

```
  ┌──────────┐
  │  Step    │  Action / stage
  └──────────┘

  ╔══════════╗
  ║  Block   ║  Group / loop
  ╚══════════╝

  ──▶          Flow direction
  ───          Connection

  ⛔           Required action (2-step protocol)
  ❌ ✅ ℹ️      KNOWLEDGE entry types (avoid / pattern / fact)
```
