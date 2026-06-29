---
auto-sync: enabled
auto-sync-date: 2026-02-11
description: Flow diagrams for brewcode plugin execution
---

[DICT: AUQ=AskUserQuestion, DV=developer, RV=reviewer]

# Brewcode Flow Diagrams

| # | Diagram | Description |
|---|---------|-------------|
| a | Spec creation | `/brewcode:spec` — research + SPEC.md |

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

  ❌ ✅ ℹ️  KJ entry types (avoid / pattern / fact)
```
