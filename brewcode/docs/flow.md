---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Flow diagrams for brewcode plugin execution
---

[DICT: AR=architect, ART=artifacts/, AUQ=AskUserQuestion, BC_C=bc-coordinator, BCI=bc-coordinator(mode:initialize), DV=developer, IP=in_progress, KJ=KNOWLEDGE.jsonl, LK=.lock, PC=pre-compact.mjs, PM=PLAN.md, POT=post-task.mjs, PT=pre-task.mjs, RV=reviewer, SID=session_id, SM=stop.mjs]

# Brewcode Flow Diagrams

| # | Diagram | Description |
|---|---------|-------------|
| a | Spec creation | `/brewcode:spec` — research + SPEC.md |
| b | Plan creation | `/brewcode:plan` — SPEC.md → PM |
| c | Task execution | `/brewcode:start` — full cycle with hooks |
| d | Lock lifecycle | Creation, binding, checks, deletion |
| e | Handoff/compaction | Context preservation during auto-compact |
| f | Task lifecycle | State machine |
| g | KNOWLEDGE pipeline | Extraction, rules, pruning |

---

## a) Spec creation (`/brewcode:spec`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         /brewcode:spec                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  Input: task description | path to file | empty (.claude/TASK.md)

  ┌──────────────────┐
  │ 0. Check         │
  │    templates     │
  │ SPEC.md.template │
  └────────┬─────────┘
           │ Template found
           ▼
  ┌──────────────────┐
  │ 1. Read input    │
  │ Parse args       │
  │ Define scope     │
  └────────┬─────────┘
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 2. Clarifying    │────▶│ AUQ                              │
  │    questions     │◀────│ 3-5 questions: Scope,            │
  │ (3-5 questions)  │     │ Constraints, Edge cases          │
  └────────┬─────────┘     └──────────────────────────────────┘
           │ Answers received
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 2.5 Feature Splitting Check                                         │
  │                                                                      │
  │  >3 independent areas OR >12 phases estimated?                      │
  │  ┌──────┴──────┐                                                    │
  │  │ YES         │ NO                                                 │
  │  ▼             ▼                                                     │
  │  AUQ:         Continue                                               │
  │  "Split into   with full                                             │
  │   X tasks?"    scope                                                 │
  │  ┌─────┴──────┐                                                     │
  │  │ yes  │ no  │                                                     │
  │  ▼      ▼     │                                                     │
  │  SPEC    Continue                                                    │
  │  1st     full scope                                                  │
  │  only                                                                │
  └──────────────────────────────────┬───────────────────────────────────┘
           ▼
  ┌──────────────────┐
  │ 3. Divide into   │
  │    research      │
  │    areas         │
  │ (5-10 areas)     │
  └────────┬─────────┘
           │ Standard areas: Controllers, Services, DB/Repos, Tests, Config, Docs
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 4. Parallel research (ONE call, 5-10 agents)                        │
  │                                                                      │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
  │  │DV        │ │DV        │ │DV        │ │ tester   │ │ Explore  │  │
  │  │Controller│ │ Services │ │ DB/Repos │ │  Tests   │ │   Docs   │  │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
  │       │            │            │            │            │          │
  │       ▼            ▼            ▼            ▼            ▼          │
  │  ┌──────────────────────────────────────────────────────────────┐    │
  │  │     Agent results (patterns, risks, reusable code,           │    │
  │  │     constraints)                                             │    │
  │  └──────────────────────────────────────────────────────────────┘    │
  │  + DV for Config (*.yml, docker-*) as needed                        │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
                            ┌──────────────────┐
                            │ 5. Consolidation │
                            │    into SPEC.md  │
                            │ (dedup + merge)  │
                            └────────┬─────────┘
                                     ▼
                            ┌──────────────────┐     ┌──────────────────┐
                            │ 6. Validation    │────▶│ AUQ              │
                            │    with user     │◀────│ Decisions, risks,│
                            │                  │     │ assumptions      │
                            └────────┬─────────┘     └──────────────────┘
                                     │ Feedback incorporated
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 7. SPEC review (iteration loop, MAX 3 iterations)                   │
  │                                                                      │
  │  ┌──────────┐                                                        │
  │  │ RV       │──▶ Findings (critical/major/minor)                     │
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
  │  │ Escalate via AUQ — present remaining critical/major      │       │
  │  └──────────────────────────────────────────────────────────┘       │
  └──────────────────────────────────────────────────────────────────────┘
                                     ▼
                            ┌──────────────────┐
                            │    RESULT        │
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
  │ SPEC flow        │ │ PlanMode flow  │ │ Read ref to      │
  │ (steps 1-8)      │ │ (steps 1-6)    │ │ latest task      │
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
           ▼
  ┌──────────────────┐
  │ 1. Read SPEC     │
  │ Goal, reqs,      │
  │ analysis, risks  │
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 2. Scan project  │
  │ Ref examples     │
  │ (R1, R2...)      │
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 3. Gen phases    │
  │ 5-12 phases      │
  │ + deps + agents  │
  │ + verification(NV)│
  └────────┬─────────┘
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 4. Present to    │────▶│ AUQ                              │
  │    user          │◀────│ Phases, descriptions,            │
  │                  │     │ agents, deps                     │
  └────────┬─────────┘     └──────────────────────────────────┘
           │ Confirmed / adjusted
           ▼
  ┌──────────────────┐
  │ 5. Gen artifacts │
  │ PM               │
  │ KJ               │  (0-byte empty via touch)
  │ ART              │
  │ backup/          │
  └────────┬─────────┘
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 5.5 Technology Choices                                              │
  │  Per non-trivial choice (lib, pattern, approach):                   │
  │  Document in PM under Technology Choices:                           │
  │  - Rationale for chosen approach                                    │
  │  - Alternatives considered + rejected                               │
  │  - Examples: ORM, auth lib, caching, test framework                 │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 6. Quorum plan review (3 agents, MIXED expertise)                   │
  │                                                                      │
  │  ┌──────────┐  ┌──────────────┐  ┌────────────────┐                │
  │  │  Plan    │  │  AR          │  │   RV           │                │
  │  │ (cover-  │  │ (arch+deps)  │  │ (quality+risk) │                │
  │  │  age)    │  │              │  │                │                │
  │  └────┬─────┘  └──────┬───────┘  └───────┬────────┘                │
  │       │               │                  │                          │
  │       └───────┬───────┘──────────────────┘                          │
  │               ▼                                                      │
  │   Quorum: 2/3 majority — only findings confirmed by 2+ agents       │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 7. Traceability Check (RV)                                          │
  │                                                                      │
  │  - Each SPEC > Scope > In item has >= 1 phase                       │
  │  - Each Original Requirement addressed                              │
  │  - Output: traceability matrix (requirement -> phase)               │
  │                                                                      │
  │  Gaps?                                                               │
  │  ┌──────┴──────┐                                                    │
  │  │ YES         │ NO                                                 │
  │  ▼             ▼                                                     │
  │  Add missing   Proceed to step 8                                     │
  │  phases to PM                                                        │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 8. Present       │────▶│ AUQ                              │
  │    review        │◀────│ Findings + verification          │
  │    results       │     │ Accept / reject each             │
  └────────┬─────────┘     └──────────────────────────────────┘
           │ Corrections applied
           ▼
  ┌──────────────────┐
  │ Update           │
  │ .claude/TASK.md  │
  │ (link at top)    │
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ Validation:      │
  │ TASK_DIR, PM,    │
  │ KJ, ART,         │
  │ backup/, QUICK_REF│
  └────────┬─────────┘
           ▼
  ┌──────────────────────────────────────────┐
  │              RESULT                      │
  │ .claude/tasks/{TS}_{NAME}_task/          │
  │   PM | KJ | ART | backup/               │
  │ Next: /brewcode:start {task_path}       │
  └──────────────────────────────────────────┘

  ╔═══════════════════════════════════════════════════════════╗
  ║                PLAN MODE FLOW                             ║
  ╚═══════════════════════════════════════════════════════════╝

  Steps 1-5: same as SPEC flow (read plan, create dir, split
  into phases, present to user, gen artifacts)

  ┌──────────────────────────────────────────────────────────────────────┐
  │ 6. Lightweight Plan Review (2 agents, 2/2 consensus)                │
  │                                                                      │
  │  ┌──────────────┐  ┌────────────────┐                               │
  │  │  AR          │  │   RV           │                               │
  │  │ (arch+deps)  │  │ (quality+crit) │                               │
  │  └──────┬───────┘  └───────┬────────┘                               │
  │         │                  │                                         │
  │         └────────┬─────────┘                                         │
  │                  ▼                                                    │
  │   Rule: BOTH agents must confirm (2/2 consensus)                    │
  │   Fix confirmed remarks in PM before proceeding                     │
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
           ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 2. Init via      │────▶│ BCI                              │
  │    BC_C          │◀────│ Validation, LK, status → IP     │
  └────────┬─────────┘     └──────────────────────────────────┘
           │
           │                    ┌─────────────────────────────┐
           │ ┌─ POT ───────────▶│ Bind SID to LK              │
           │ │                  └─────────────────────────────┘
           ▼
  ┌──────────────────┐
  │ 3. Load ctx      │     PM + KJ
  └────────┬─────────┘
           ▼
  ╔═══════════════════════════════════════════════════════════════════════╗
  ║ 4. PHASE EXECUTION LOOP (for each phase N)                          ║
  ╠═══════════════════════════════════════════════════════════════════════╣
  ║                                                                       ║
  ║  ┌──────────────────────────────────────────────────────────────┐    ║
  ║  │                    PHASE N (execution)                       │    ║
  ║  │                                                              │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ PT                │  Injection:                         │    ║
  ║  │   │ (PreToolUse:Task) │  1. grepai reminder                 │    ║
  ║  │   │                   │  2. ## K (knowledge from KJ)        │    ║
  ║  │   │                   │  3. Role constraints                │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             ▼                                                │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ Call worker agent │  DV / tester / RV                   │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             │                                                │    ║
  ║  │             │  ┌──────────────────────────────────────┐     │    ║
  ║  │             ├──│ POT (PostToolUse:Task)               │     │    ║
  ║  │             │  │ "AGENT DONE -> 1.WRITE 2.CALL coord" │     │    ║
  ║  │             │  └──────────────────────────────────────┘     │    ║
  ║  │             ▼                                                │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ STEP 1: Write     │  ART/{P}-{N}{T}/                   │    ║
  ║  │   │ agent report      │  {AGENT}_output.md                 │    ║
  ║  │   └─────────┬─────────┘                                     │    ║
  ║  │             ▼                                                │    ║
  ║  │   ┌───────────────────┐                                     │    ║
  ║  │   │ STEP 2: Call BC_C │  - Update phase status              │    ║
  ║  │   │                   │  - Read report from disk            │    ║
  ║  │   │                   │  - Extract knowledge -> KJ          │    ║
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
  ║  │   │ Call RV / tester  │  Check phase N results              │    ║
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
           │ All phases completed
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 5. Final review (3+ parallel reviewers)                            │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
  │  │RV#1      │  │RV#2      │  │RV#3      │                          │
  │  │business  │  │code      │  │patterns  │                          │
  │  │logic     │  │quality   │  │          │                          │
  │  └──────────┘  └──────────┘  └──────────┘                          │
  └──────────────────────────────────┬───────────────────────────────────┘
                                     ▼
  ┌──────────────────┐     ┌──────────────────────────────────┐
  │ 6. Completion    │────▶│ BC_C (mode: finalize)            │
  │                  │◀────│ FINAL.md, status → finished      │
  │                  │     │       OR status → failed         │
  └────────┬─────────┘     └──────────────────────────────────┘
           ▼
  ┌──────────────────┐
  │ Extract rules    │
  │ /brewcode:rules  │
  │ KJ -> rules      │
  └──────────────────┘
```

### c.2) Hook interaction during execution

| Hook | Event | Action |
|------|-------|--------|
| session-start.mjs | SessionStart | Log SID, bind session to task, link LATEST.md (clear) |
| PT | PreToolUse:Task (BEFORE each agent) | 1. grepai reminder 2. Inject ## K knowledge 3. Role constraints |
| POT | PostToolUse:Task (AFTER each agent) | coordinator: bind SID → LK; worker agents: remind 2-step protocol |
| PC | PreCompact (during auto-compact) | 1. Check LK 2. Validate ART 3. Compact KJ 4. Write handoff entry 5. Status → handoff 6. systemMessage with ctx |
| SM | Stop (on exit attempt) | task not terminal? → BLOCK exit; terminal (finished/failed/...)? → delete LK; stale LK (>24h)? → auto-cleanup |

---

## d) Lock file lifecycle

```
  .claude/tasks/{TS}_{NAME}_task/.lock

  ┌──────────────────────────────────────────────────────────────────────┐
  │   /brewcode:start                                                   │
  │        │                                                             │
  │        ▼                                                             │
  │   ┌─────────────────┐                                               │
  │   │ 1. CREATION     │  BCI                                          │
  │   │                 │                                               │
  │   │ {               │                                               │
  │   │  "task_path":.. │  SID NOT YET BOUND                            │
  │   │  "started_at":..│                                               │
  │   │ }               │                                               │
  │   └────────┬────────┘                                               │
  │            ▼                                                         │
  │   ┌─────────────────┐                                               │
  │   │ 2. SESSION      │  POT (after coordinator)                      │
  │   │    BINDING      │                                               │
  │   │                 │                                               │
  │   │ {               │                                               │
  │   │  "task_path":.. │  + SID BOUND                                  │
  │   │  "started_at":..│                                               │
  │   │  "session_id":..│  LK belongs to specific session               │
  │   │ }               │                                               │
  │   └────────┬────────┘                                               │
  │            ▼                                                         │
  │   ┌─────────────────────────────────────────────────────────┐       │
  │   │ 3. CHECKS DURING LIFETIME                                │       │
  │   │                                                          │       │
  │   │  checkLock(cwd, SID) called in:                         │       │
  │   │                                                          │       │
  │   │  ┌──────────────┐  LK exists + session matches?         │       │
  │   │  │ PT           │──┬─ YES -> inject knowledge           │       │
  │   │  └──────────────┘  └─ NO -> skip injection              │       │
  │   │                                                          │       │
  │   │  ┌──────────────┐  LK exists + session matches?         │       │
  │   │  │ POT          │──┬─ YES -> remind 2-step              │       │
  │   │  └──────────────┘  └─ NO -> skip                        │       │
  │   │                                                          │       │
  │   │  ┌────────────────┐  LK exists + session matches?       │       │
  │   │  │ PC             │──┬─ YES -> handoff logic            │       │
  │   │  └────────────────┘  └─ NO -> normal compact            │       │
  │   │                                                          │       │
  │   │  ┌──────────────┐  lock.SID == current session?         │       │
  │   │  │   SM         │──┬─ YES -> check task status          │       │
  │   │  └──────────────┘  └─ NO -> allow exit                  │       │
  │   │                                                          │       │
  │   │  IMP: SID does NOT change after compact!                │       │
  │   │  LK remains valid within same session.                  │       │
  │   └──────────────────────────────────────────────────────────┘       │
  │            ▼                                                         │
  │   ┌─────────────────────────────────────────────┐               │
  │   │ 4. DELETION                                  │               │
  │   │                                              │               │
  │   │  A: Task finished                            │               │
  │   │  ┌──────────┐                               │               │
  │   │  │ SM       │──▶ deleteLock() + allow exit  │               │
  │   │  └──────────┘                               │               │
  │   │                                              │               │
  │   │  B: Stale LK (> 24h)                        │               │
  │   │  ┌──────────┐                               │               │
  │   │  │ SM       │──▶ deleteLock() + allow exit  │               │
  │   │  └──────────┘                               │               │
  │   │                                              │               │
  │   │  C: No SID (unbound)                        │               │
  │   │  ┌──────────┐                               │               │
  │   │  │ SM       │──▶ deleteLock() + allow exit  │               │
  │   │  └──────────┘                               │               │
  │   │                                              │               │
  │   │  D: Emergency exit (user)                   │               │
  │   │  rm .claude/tasks/*_task/.lock               │               │
  │   │                                              │               │
  │   └──────────────────────────────────────────────┘               │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## e) Handoff during compaction

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │              INFINITE CONTEXT VIA AUTO-COMPACT                          │
  └─────────────────────────────────────────────────────────────────────────┘

  Task execution (phase N, ctx growing)
           │ ctx approaching limit -> Claude Code triggers auto-compact
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ PC (PreCompact)                                                     │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │ 1. Check LK      │  checkLock(cwd, SID)                         │
  │  │    and session   │  LK not found? -> normal compact             │
  │  └────────┬─────────┘                                               │
  │           │ LK valid                                                 │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 2. parseTask()   │  status, current phase, total phases          │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 3. Validate state│  Check current phase ART; warn if missing     │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────────────────────────────────────────────┐       │
  │  │ 4. Compact KJ                                            │       │
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
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 5. Write handoff │  KJ +=                                        │
  │  │    entry         │  {"t":"ℹ️","txt":"Handoff at phase N:         │
  │  │                  │   ctx auto-compact","src":"pre-compact"}      │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 6. Update status │  PM line 1: status: handoff                  │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 7. Save state    │  state.lastHandoff = timestamp                │
  │  │                  │  state.lastPhase = N                          │
  │  │                  │  state.lastCompactAt = new Date().toISOString()│
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 8. systemMessage │  <ft-handoff>                                 │
  │  │    for Claude    │  Task: {path}                                 │
  │  │                  │  Phase: N/{total}                             │
  │  │                  │  AFTER COMPACT: re-read TASK.md               │
  │  │                  │  </ft-handoff>                                 │
  │  └────────┬─────────┘                                               │
  │                                                                      │
  │  return { continue: true, systemMessage: ... }                      │
  └──────────┬───────────────────────────────────────────────────────────┘
             ▼
  ┌──────────────────┐
  │ AUTO-COMPACT     │  Claude Code compresses ctx
  │ (Claude Code)    │  SAME SESSION (SID does not change!)
  └────────┬─────────┘
           ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ RESUMPTION (same session, compressed ctx)                           │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │ 1. Re-read       │  .claude/TASK.md -> path to task             │
  │  │    TASK.md       │                                               │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 2. Re-read PM    │  Phase status, current position               │
  │  │                  │  status: handoff -> continue from phase N     │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 3. Re-read KJ    │  All accumulated knowledge (compacted)        │
  │  └────────┬─────────┘                                               │
  │           ▼                                                          │
  │  ┌──────────────────┐                                               │
  │  │ 4. Continue exec │  Phase N -> N+1 -> ... -> final              │
  │  └──────────────────┘                                               │
  │                                                                      │
  │  State preserved in files:                                          │
  │  - PM: phase status, progress                                       │
  │  - KJ: accumulated knowledge                                        │
  │  - ART: agent reports                                               │
  │  - LK: session binding (SID does not change)                       │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## f) Task lifecycle (state machine)

```
  State stored in PM, line 1: status: {value}

                        ┌───────────────────┐
                        │     pending       │  Initial state (after /brewcode:plan)
                        └─────────┬─────────┘
                                  │ /brewcode:start -> BCI
                                  ▼
                        ┌───────────────────┐
               ┌───────▶│                   │◀──────────────────────────┐
               │        │   IP              │  Active execution         │
               │        │                   │  (phases N -> N+1 -> ...) │
               │        └──┬────────┬───────┘                           │
               │           │        │                                    │
     ┌─────────┘     ┌─────┘        └──────┐                            │
     │               │                     │                            │
     │               ▼                     ▼                            │
     │    ┌───────────────────┐  ┌───────────────────┐                 │
     │    │                   │  │                   │                  │
     │    │     failed        │  │     handoff       │  Auto-compact   │
     │    │                   │  │                   │  (PC)           │
     │    └──┬────────┬───────┘  └─────────┬─────────┘                 │
     │       │        │                    │                            │
     │       │        │  Retry /           │  Resume after compact      │
     │       │        │  escalation        │  (same session)            │
     │       │        └────────────────────┘────────────────────────────┘
     │       │
     │       │  Escalation exhausted (TERMINAL)
     │       │
     │       │        ┌───────────────────┐
     │       └───────▶│  failed (terminal)│  Finalize(status="failed")
     │                │                   │  FINAL.md created
     │                └─────────┬─────────┘
     │                          │ SM
     │  Task restart            ▼
     │  (status IP also      ┌───────────────────┐
     │   allowed during init)│  Delete LK        │
     │                       │  Allow exit       │
     │                       └───────────────────┘
     │
     │  All phases completed -> BC_C (mode: finalize)
     │
     │        ┌───────────────────┐
     └────────│    finished       │  Final state (FINAL.md created)
              └───────────────────┘
                        │ SM
                        ▼
              ┌───────────────────┐
              │  Delete LK        │
              │  Allow exit       │
              └───────────────────┘


  Transition Table

  | From        | To          | Trigger                            |
  |-------------|-------------|------------------------------------|
  | pending     | IP          | BCI                                |
  | IP          | IP          | Phase transition (N -> N+1)        |
  | IP          | handoff     | PC (auto-compact)                  |
  | IP          | failed      | Critical error in phase            |
  | IP          | finished    | BC_C mode:finalize                 |
  | handoff     | IP          | Resume after compact               |
  | failed      | IP          | Restart / escalation               |
  | IP          | failed      | Escalation exhausted (TERMINAL)    |


  Exit Blocking (SM)

  | State    | SM Behavior                                          |
  |----------|------------------------------------------------------|
  | pending  | Allow (no LK = task not started)                     |
  | IP       | BLOCK exit, show progress                            |
  | handoff  | BLOCK exit, suggest continue                         |
  | failed   | Terminal: Allow, delete LK (escalation exhausted)   |
  | finished | Terminal: Allow, delete LK                           |

  Emergency exit: rm .claude/tasks/*_task/.lock
```

---

## g) KNOWLEDGE Pipeline

```
BC_C               KJ                   .claude/rules/
(after each phase) [❌ avoid]        →   avoid.md
                   [✅ best practice] →   best-practice.md
                   [ℹ️  info facts]   →   (kept after prune)
      ↑                  ↑
PT injects       bc-knowledge-manager
## K block       (dedupe / compact)
into every agent
```

At task COMPLETE (`/start` Step 5):
1. `Skill(brewcode:rules)` → bc-rules-organizer → writes `.claude/rules/*.md`
2. `Task(bc-knowledge-manager, prune-rules)` → removes ❌/✅, keeps ℹ️

---

## Legend

```
  ┌──────────┐  Action / stage
  │  Step    │
  └──────────┘

  ╔══════════╗  Group / loop
  ║  Block   ║
  ╚══════════╝

  ──▶  Flow direction
  ───  Connection

  ⛔   Required action (2-step protocol)
  ❌ ✅ ℹ️  KJ entry types (avoid / pattern / fact)
```
