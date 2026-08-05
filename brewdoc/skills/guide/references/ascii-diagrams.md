# ASCII Diagrams

Pre-drawn diagrams for the guide skill. Reference by name from topic files.

## Diagram: Plugin Suite Architecture

```
┌───────────────────────────────────────────────────────┐
│             claude-brewcode (marketplace)             │
├───────────────────┬────────────────┬──────────────────┤
│     brewcode      │    brewdoc     │    brewtools     │
│───────────────────┼────────────────┼──────────────────│
│ spec, superreview │ docsync        │ text-optimize    │
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
┌──────┐   ┌──────┐   ┌───────┐   ┌─────────┐   ┌───────┐
│ spec │──>│ plan │──>│ start │──>│ handoff │──>│ start │──> ...
└──────┘   └──────┘   └───┬───┘   └────┬────┘   └───┬───┘
                          │            │             │
                     ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
                     │ hooks   │  │ compact │  │ hooks   │
                     │ inject  │  │ KNOW-   │  │ re-read │
                     │ context │  │ LEDGE   │  │ state   │
                     └─────────┘  └─────────┘  └─────────┘
                                       │
                          KNOWLEDGE.jsonl persists
                          across all sessions
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
.claude/tasks/
└── {TS}_{NAME}_task/
    ├── PLAN.md              # execution plan
    ├── SPEC.md              # task specification
    ├── KNOWLEDGE.jsonl      # persistent learnings
    ├── .lock                # session lock
    ├── artifacts/
    │   ├── FINAL.md         # final summary
    │   └── {P}-{N}{T}/     # phase artifacts
    │       └── {AGENT}_output.md
    └── backup/              # auto-backups
```
