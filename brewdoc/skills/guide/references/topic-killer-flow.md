# Topic 3: The Killer Flow — Board, Spec, Review

Domain: Core Workflow

## Section 1: The Pipeline

The core workflow is not a single skill — it is a generated, project-local toolchain:

1. `/brewtools:task-board-init` — analyzes the repo and deploys a file-based Kanban into
   `.claude/features/`, plus a `task-tracker` agent, a `/task-board` skill, and (when the spec
   layer is enabled) a project-tailored `/task-spec` skill.
2. `/task-spec <ID>` — the generated skill. Researches the codebase, fans out to domain
   architects for system design, asks the open questions, and writes
   `specs/<ID>-spec.md` + `specs/<ID>-design.md`.
3. Implementation — delegated to project agents, one bounded unit per subagent.
4. `/superreview` — the project-local deep-review skill written by `/brewcode:superreview`.

```
User describes task
  -> /brewtools:task-board-init deploys the board (once per repo)
    -> task lands in .claude/features/{backlog,todo}/
      -> /task-spec <ID> researches, designs, asks, writes the spec + design
        -> project agents implement, board row moves to progress/
          -> /superreview runs the quorum review
            -> task-tracker closes the task and updates board.md
```

Reference `Diagram: Killer Flow Pipeline` from ascii-diagrams.md.

Everything after step 1 is generated INTO your repo. It is yours: editable, committed, and
tailored to your stack and your agents.

## Section 2: Why It Survives Context Limits

The board is files on disk, not conversation state. That is the whole trick.

| Step | What happens |
|------|-------------|
| 1 | `task-tracker` runs in isolation at the start of any task and reports the board state |
| 2 | Work is split into bounded units, each spawned as its own subagent |
| 3 | A subagent's context is its own — it never inherits the main session's history |
| 4 | Results land in the task file and the board row, not in the transcript |
| 5 | Context compaction loses the conversation, never the board |
| 6 | The next session re-reads `.claude/features/board.md` and continues |

The `forced-eval` hook re-states the manager role and the split rule on every prompt, so the
main session keeps delegating instead of drifting into one long unobservable run.

## Section 3: The Rule File

`/brewtools:task-board-init` writes `.claude/rules/tasks.md`, scoped by frontmatter to
`.claude/features/**`. Rules load automatically when a matching file is in context — no
`@`-import, no CLAUDE.md edit.

Its key rule: **at the START of any task, run the `task-tracker` agent in isolation** — a
spawned subagent, never inlined. That keeps the board read cheap and the main context clean.

## Section 4: Task Directory Structure

Everything lives under `.claude/features/`:

```
.claude/features/
  board.md              # the Kanban: counts, task rows, feature specs
  TRACKER.md            # conventions the task-tracker agent follows
  TASK_TEMPLATE.md      # id convention + frontmatter shape
  INDEX.md              # domain / scope index
  backlog/              # not yet scheduled
  todo/                 # scheduled, not started
  progress/             # in flight
  closed/               # done
  specs/
    SPEC_TEMPLATE.md
    DESIGN_TEMPLATE.md
    <ID>-spec.md        # what to build (from /task-spec)
    <ID>-design.md      # how to build it (domain-architect fan-out)
```

Reference `Diagram: Project Directory` from ascii-diagrams.md.

Key files:
- **board.md** — single source of truth for status; rows are never reordered, ids never reused
- **`<ID>`-spec.md** — written by `/task-spec`, the WHAT
- **`<ID>`-design.md** — written by the domain-architect fan-out, the HOW
- **`.claude/rules/tasks.md`** — path-scoped rule that wires the whole thing together
