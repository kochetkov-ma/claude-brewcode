# SPEC Creation Instructions

## Overview

Создание спецификации через параллельный анализ 5-10 логических областей проекта.

## Step 1: Partition Research Areas

Разделить исследуемый материал на 5-10 логических частей:

| Category | Examples |
|----------|----------|
| **Codebase** | src/services/, src/repositories/, src/controllers/ |
| **Config** | application.yml, docker-compose.yml, .env |
| **Tests** | src/test/, fixtures/, test data |
| **DB** | migrations/, schema, SQL queries |
| **Docs** | README, CLAUDE.md, API docs |
| **External** | Library docs (Context7), API specs |
| **Network** | External services, integrations |

**Target:** 5-10 areas based on project size and task complexity.

## Step 2: Assign Agents to Areas

Выбор агента для каждой области на основе доступных в проекте:

| Area Type | Preferred Agent | Fallback |
|-----------|-----------------|----------|
| Project Domain | matching team agent | `developer` |
| Code/Architecture | `Plan`, `developer` | `Explore` |
| Database/SQL | `developer` | `Explore` |
| Tests | `tester` | `developer` |
| Quality/Security | `reviewer` | `Plan` |
| External Docs | `Explore` | - |
| Config/Infra | `developer` | `Plan` |

**Rule:** If team exists in `.claude/teams/`, prefer team agents for matching domains. Otherwise use project-specific agents from `.claude/agents/` when available.

## Step 3: Parallel Agent Execution

> Sizing: one agent = ONE research area — ~<=5 files, ~<=10 steps; an area bigger than that is split into two areas and both are fanned out in the SAME message.

```
┌─────────────────────────────────────────────────────────────┐
│  ONE message, 5-10 Task calls in PARALLEL. Every prompt is  │
│  the 6-field brief below, filled for that area:             │
│    Plan       -> architecture area                          │
│    developer  -> DB layer                                   │
│    developer  -> services                                   │
│    tester     -> test patterns                              │
│    reviewer   -> quality / security                         │
│    ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

### Agent Prompt Template

```
Task(subagent_type="{AGENT}", prompt="
GOAL: build the SPEC for task \"{TASK_DESCRIPTION}\" — the plan a later implementation session executes.
  It is assembled from 5-10 areas analyzed in parallel and is only as good as its weakest area.
ROLE: you own the {AREA_NAME} area. Analyze and report ONLY — do NOT edit code, do NOT write the SPEC,
  do NOT cover another agent's area.
SCOPE: in — {LIST_OF_FILES_IN_AREA}. Out — every path outside that list, and the SPEC file itself.
CONTEXT: nothing is implemented yet; this is the research pass. The user's answers so far: {USER_QA}.
  Sibling agents analyze the other areas ({SIBLING_AREAS}) in the same message — assume each covers its
  own, and stay inside yours.
CONSUMER: the orchestrator merges every area report into SPEC.md (Analysis > Architecture / Data & State /
  Impact, Context Files, Risks, Recommendations). A finding without a `file:line` cannot be merged, and
  large code blocks are stripped — reference `file:line` instead.
DONE: report exactly these blocks, nothing else:
  1. Key findings (bullet points)
  2. Reusable assets (table: path | purpose)
  3. Risks/constraints (bullet points)
  4. Recommendations (bullet points)
  Cover: existing patterns and conventions, reusable components/code, potential impact areas, risks and
  constraints, best practices observed. DO NOT include large code blocks - reference file:line instead.
")
```

## Step 4: Consolidate Results

После завершения всех агентов:

1. **Merge findings** — объединить key findings
2. **Deduplicate** — убрать повторяющуюся информацию
3. **Prioritize** — ранжировать по важности для задачи
4. **Structure** — заполнить секции SPEC.md.template

### Consolidation Rules

| Section | Source |
|---------|--------|
| Goal | Original task prompt (1-2 sentences) |
| Scope | User Q&A (in/out boundaries) + original task description |
| Original Requirements | Full task prompt, preserved verbatim |
| User Q&A | From AskUserQuestion interactions |
| Analysis > Architecture | Plan agent + consolidated findings |
| Analysis > Data & State | Developer findings |
| Analysis > Impact | All agents' change impact per area |
| Context Files | All files mentioned by agents |
| Risks | All agents' risk findings |
| Decisions | Based on alternatives found |
| Research | Summary per agent |

## Step 5: Output

Create SPEC file: `.claude/tasks/{TIMESTAMP}_{NAME}_task/SPEC.md`

**Important:**
- NO large code blocks in SPEC — use `file:line` references
- Code snippets from research are for understanding, NOT for spec
- SPEC is a plan document, not a code dump

## Example Partition

For a Spring Boot project with auth feature:

| # | Area | Agent | Focus |
|---|------|-------|-------|
| 1 | Controllers | developer | Existing endpoints, patterns |
| 2 | Services | developer | Business logic, dependencies |
| 3 | Repositories | developer | Data access, queries |
| 4 | Security config | reviewer | Auth patterns, vulnerabilities |
| 5 | Tests | tester | Test patterns, coverage |
| 6 | Migrations | developer | Schema, constraints |
| 7 | External docs | Explore | Library usage (Spring Security) |

## Timing

| Step | Action |
|------|--------|
| Partition | 1 analysis pass |
| Parallel agents | 1 message, N agents |
| Consolidate | 1 synthesis pass |
| Output | Write SPEC file |

**Total:** 5-8 turns depending on review iterations and user interactions.
