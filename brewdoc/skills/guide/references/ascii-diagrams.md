# ASCII Diagrams

Pre-drawn diagrams for the guide skill. Reference by name from topic files.

## Diagram: Plugin Suite Architecture

```
┌─────────────────────────────────────────────────┐
│              claude-brewcode (marketplace)       │
├─────────────────┬──────────────┬────────────────┤
│    brewcode      │   brewdoc    │   brewtools    │
│─────────────────│──────────────│────────────────│
│ setup, spec     │ auto-sync    │ text-optimize  │
│ plan, start     │ my-claude    │ text-human     │
│ teams, review   │ memory       │ secrets-scan   │
│ convention, e2e │ md-to-pdf    │                │
│ rules, grepai   │ guide        │                │
│                 │ publish      │                │
│ + 14 agents     │              │                │
│ + 9 hooks       │              │                │
└─────────────────┴──────────────┴────────────────┘
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
SessionStart         PreToolUse:Task     PostToolUse:Task
     │                     │                    │
     v                     v                    v
┌────────────┐     ┌────────────┐      ┌─────────────┐
│ session-   │     │ pre-task   │      │ post-task   │
│ start.mjs  │     │ inject ctx │      │ bind session│
└────────────┘     └────────────┘      └─────────────┘
     │                                        │
     v                                        v
┌────────────┐                        ┌─────────────┐
│ grepai-    │   PreCompact           │   Stop      │
│ session    │       │                │   event     │
└────────────┘       v                └──────┬──────┘
                ┌────────────┐               v
                │ pre-compact│        ┌─────────────┐
                │ compact KN │        │ stop.mjs    │
                │ write hoff │        │ block if    │
                └────────────┘        │ not terminal│
                                      └─────────────┘
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
