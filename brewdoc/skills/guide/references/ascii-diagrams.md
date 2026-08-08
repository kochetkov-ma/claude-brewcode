# ASCII Diagrams

Pre-drawn diagrams for the guide skill. Reference by name from topic files.

## Diagram: Plugin Suite Architecture

```
┌───────────────────────────────────────────────────────┐
│             claude-brewcode (marketplace)             │
├───────────────────┬────────────────┬──────────────────┤
│     brewcode      │    brewdoc     │    brewtools     │
│───────────────────┼────────────────┼──────────────────│
│ superreview       │ docsync        │ text-optimize    │
│ convention, teams │ my-claude      │ text-human       │
│ rules, skills     │ memory         │ secrets-scan     │
│ agents, e2e       │ md-to-pdf      │ ssh, deploy      │
│                   │ guide, publish │ manager, plugins │
│ + 5 agents        │                │ + 3 agents       │
│ + 2 hooks         │                │ + 2 hooks        │
└───────────────────┴────────────────┴──────────────────┘

brewui: placeholder, no skills yet
```

## Diagram: Killer Flow Pipeline

```
┌──────────────┐   ┌───────────┐   ┌───────────┐   ┌──────────────┐
│ task-board-  │──>│ /task-spec│──>│ implement │──>│ /superreview │──> ...
│ init (once)  │   └─────┬─────┘   └─────┬─────┘   └──────┬───────┘
└──────┬───────┘         │               │                │
       │            ┌────┴────┐     ┌────┴────┐     ┌─────┴─────┐
       │            │ domain  │     │ bounded │     │ quorum    │
       │            │ arch.   │     │ units,  │     │ reviewers │
       │            │ fan-out │     │ fanned  │     │ + gates   │
       │            └─────────┘     └─────────┘     └───────────┘
       │                                 │
       └──────> .claude/features/board.md <──────
                state lives on disk, not in context
```

## Diagram: Teams Architecture

```
┌────────────────────┐
│   /brewcode:teams   │
└────────┬───────────┘
         │ spawns
    ┌────┴────┐
    │ agent-  │
    │ creator │
    └────┬────┘
         │ creates domain agents
   ┌─────┼─────────┐
   v     v         v
┌─────┐┌─────┐┌────────┐
│ db- ││ api- ││ ui-    │
│ agent││agent││ agent  │
└──┬──┘└──┬──┘└───┬────┘
   │      │       │
   └──────┴───────┘
         │
   trace.jsonl tracks
   all agent actions
```

## Diagram: Hook Chain

```
SessionStart                      UserPromptSubmit
     │                                   │
     ├───────────────────┐       ┌───────┴───────────┐
     v                   v       v                   v
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐
│ bc:        │  │ bt:        │  │ bc:        │  │ bt:          │
│ session-   │  │ session-   │  │ forced-    │  │ manager-     │
│ start.mjs  │  │ start.mjs  │  │ eval.mjs   │  │ prompt.mjs   │
│ version +  │  │ HARD-wall  │  │ [SKILL?]   │  │ ++m/++rr/++r │
│ perm_mode  │  │ awareness  │  │ reminder   │  │ codewords    │
└────────────┘  └────────────┘  └────────────┘  └──────────────┘
```

## Diagram: Project Directory

```
.claude/features/
├── board.md                 # the Kanban: counts, task rows, feature specs
├── TRACKER.md               # conventions for the task-tracker agent
├── TASK_TEMPLATE.md         # id convention + frontmatter shape
├── INDEX.md                 # domain / scope index
├── backlog/ todo/           # not scheduled / scheduled
├── progress/ closed/        # in flight / done
└── specs/
    ├── SPEC_TEMPLATE.md
    ├── DESIGN_TEMPLATE.md
    ├── {ID}-spec.md         # WHAT  (from /task-spec)
    └── {ID}-design.md       # HOW   (domain-architect fan-out)
```
