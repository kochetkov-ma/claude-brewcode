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
| g | KNOWLEDGE pipeline | Knowledge extraction, rules, pruning |

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
  │    questions     │◀────│ 3-5 questions in 3 categories:   │
  │ (3-5 questions)  │     │ Scope, Constraints, Edge cases   │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           │ Answers received
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 2.5 Feature Splitting Check                                         │
  │                                                                      │
  │  >3 independent areas OR >12 phases estimated?                      │
  │  ┌──────┴──────┐                                                    │
  │  │ YES         │ NO                                                 │
  │  ▼             ▼                                                     │
  │  AskUser:     Continue                                               │
  │  "Split into   with full                                             │
  │   X tasks?"    scope                                                 │
  │  ┌─────┴──────┐                                                     │
  │  │ yes  │ no  │                                                     │
  │  ▼      ▼     │                                                     │
  │  SPEC    Continue                                                    │
  │  1st     full scope                                                  │
  │  only                                                                │
  └──────────────────────────────────┬───────────────────────────────────┘
           │
           ▼
  ┌──────────────────┐
  │ 3. Divide into   │
  │    research      │
  │    areas         │
  │ (5-10 areas)     │
  └────────┬─────────┘
           │
           │ Standard research areas:
           │ Controllers, Services, DB/Repos, Tests, Config, Docs
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 4. Parallel research (ONE call, 5-10 agents)                        │
  │                                                                      │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
  │  │developer │ │developer │ │developer │ │ tester   │ │ Explore  │  │
  │  │Controller│ │ Services │ │ DB/Repos │ │  Tests   │ │   Docs   │  │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
  │       │            │            │            │            │          │
  │       ▼            ▼            ▼            ▼            ▼          │
  │  ┌──────────────────────────────────────────────────────────────┐    │
  │  │              Agent results (patterns, risks,                 │    │
  │  │              reusable code, constraints)                     │    │
  │  └──────────────────────────────────────────────────────────────┘    │
  │                                                                      │
  │  + developer for Config (*.yml, docker-*) as needed                 │
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
  │ 7. SPEC review (iteration loop, MAX 3 iterations)                   │
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
  │                                                                      │
  │  After 3 iterations with remaining remarks:                         │
  │  ┌──────────────────────────────────────────────────────────┐       │
  │  │ Escalate to user via AskUserQuestion                     │       │
  │  │ Present remaining critical/major remarks for decision    │       │
  │  └──────────────────────────────────────────────────────────┘       │
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
  │ (steps 1-8)      │ │ (steps 1-6)    │ │ to latest task   │
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
  │ KNOWLEDGE.jsonl  │  (0-byte empty file via touch)
  │ artifacts/       │
  │ backup/          │
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 5.5 Technology Choices                                              │
  │                                                                      │
  │  For each non-trivial choice (library, pattern, approach):          │
  │  ┌──────────────────────────────────────────────────────────┐       │
  │  │ Document in PLAN.md under Technology Choices section:    │       │
  │  │  - Rationale for chosen approach                         │       │
  │  │  - Alternatives considered and rejected                  │       │
  │  │  - Examples: ORM, auth library, caching, test framework  │       │
  │  └──────────────────────────────────────────────────────────┘       │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 6. Quorum plan review (3 agents, MIXED expertise)                   │
  │                                                                      │
  │  ┌──────────┐  ┌──────────────┐  ┌────────────────┐                │
  │  │  Plan    │  │  brewcode:   │  │   brewcode:    │                │
  │  │ (cover-  │  │  architect   │  │   reviewer     │                │
  │  │  age)    │  │ (arch+deps)  │  │ (quality+risk) │                │
  │  └────┬─────┘  └──────┬───────┘  └───────┬────────┘                │
  │       │               │                  │                          │
  │       └───────┬───────┘──────────────────┘                          │
  │               ▼                                                      │
  │   Quorum rule: 2/3 majority                                         │
  │   Only findings confirmed by 2+ agents accepted                     │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 7. Traceability Check (brewcode:reviewer)                           │
  │                                                                      │
  │  Checks:                                                             │
  │  ┌──────────────────────────────────────────────────────────┐       │
  │  │ - Each item from SPEC > Scope > In has at least one phase│       │
  │  │ - Each requirement from Original Requirements addressed  │       │
  │  │ - Output: traceability matrix (requirement -> phase)     │       │
  │  └──────────────────────────────────────────────────────────┘       │
  │                                                                      │
  │  Gaps found?                                                         │
  │  ┌──────┴──────┐                                                    │
  │  │ YES         │ NO                                                 │
  │  ▼             ▼                                                     │
  │  Add missing   Proceed                                               │
  │  phases to     to step 8                                             │
  │  PLAN.md                                                             │
  └──────────────────────────────────┬───────────────────────────────────┘
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

  ╔═══════════════════════════════════════════════════════════╗
  ║                PLAN MODE FLOW                             ║
  ╚═══════════════════════════════════════════════════════════╝

  Steps 1-5: same as SPEC flow (read plan, create dir, split
  into phases, present to user, generate artifacts)

  ┌──────────────────────────────────────────────────────────────────────┐
  │ 6. Lightweight Plan Review (2 agents, 2/2 consensus)                │
  │                                                                      │
  │  ┌──────────────┐  ┌────────────────┐                               │
  │  │  brewcode:   │  │   brewcode:    │                               │
  │  │  architect   │  │   reviewer     │                               │
  │  │ (arch+deps)  │  │ (quality+crit) │                               │
  │  └──────┬───────┘  └───────┬────────┘                               │
  │         │                  │                                         │
  │         └────────┬─────────┘                                         │
  │                  ▼                                                    │
  │   Rule: BOTH agents must confirm a remark (2/2 consensus)           │
  │   Fix confirmed remarks in PLAN.md before proceeding                │
  └──────────────────────────────────────────────────────────────────────┘
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
  ║  │     │   Escalation exhausted?                               │    ║
  ║  │     │      │                                                │    ║
  ║  │     │      ▼                                                │    ║
  ║  │     │   ┌────────────────────┐                              │    ║
  ║  │     │   │ Failure Cascade:   │                              │    ║
  ║  │     │   │ 1. Mark failed     │                              │    ║
  ║  │     │   │ 2. Cascade to deps │                              │    ║
  ║  │     │   │ 3. Deadlock check  │                              │    ║
  ║  │     │   └────────┬───────────┘                              │    ║
  ║  │     │            ▼                                          │    ║
  ║  │     │   Finalize(status="failed")                           │    ║
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
  │                  │     │       OR status -> "failed"      │
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

  stop.mjs               Stop                        Task not in terminal state?
                         (on exit attempt)              -> BLOCK exit
                                                     Terminal (finished/failed/...)?
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
     │    └──┬────────┬───────┘  └─────────┬─────────┘                 │
     │       │        │                    │                            │
     │       │        │  Retry /           │  Resume                    │
     │       │        │  escalation        │  after compact             │
     │       │        │                    │  (same session)            │
     │       │        └────────────────────┘────────────────────────────┘
     │       │
     │       │  Escalation exhausted
     │       │  (TERMINAL)
     │       │
     │       │        ┌───────────────────┐
     │       └───────▶│                   │
     │                │  failed (terminal)│  Finalize(status="failed")
     │                │                   │  FINAL.md created
     │                └─────────┬─────────┘
     │                          │
     │  Task restart            │  stop.mjs
     │  (status "in progress"   ▼
     │   also allowed        ┌───────────────────┐
     │   during init)        │  Delete .lock     │
     │                       │  Allow exit       │
     │                       └───────────────────┘
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
  ├──────────────┼──────────────┼────────────────────────────────────────┤
  │ in progress  │ failed       │ Escalation exhausted (TERMINAL)        │
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
  │ failed       │ Terminal: Allow, delete .lock (escalation exhausted)│
  ├──────────────┼──────────────────────────────────────────────────────┤
  │ finished     │ Terminal: Allow, delete .lock                       │
  └──────────────┴──────────────────────────────────────────────────────┘

  Emergency exit: rm .claude/tasks/*_task/.lock
```

---

## g) KNOWLEDGE Pipeline

```
bc-coordinator            KNOWLEDGE.jsonl          .claude/rules/
(after each phase)   →   [❌ avoid]           →    avoid.md
                         [✅ best practice]   →    best-practice.md
                         [ℹ️  info facts]     →    (kept after prune)
      ↑                        ↑
pre-task.mjs              bc-knowledge-manager
injects ## K block         (dedupe / compact)
into every agent
```

**At task COMPLETE (`/start` Step 5):**
1. `Skill(brewcode:rules)` → bc-rules-organizer → writes `.claude/rules/*.md`
2. `Task(bc-knowledge-manager, prune-rules)` → removes ❌/✅, keeps ℹ️

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
