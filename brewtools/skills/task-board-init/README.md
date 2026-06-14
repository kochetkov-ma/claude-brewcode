# Task Board Init

> Generator -- deploys a self-contained, file-based Kanban (board + curator agent + dashboard skill + rule) into ANY repo, parametrized by a multi-agent analysis of that repo.

| Field | Value |
|-------|-------|
| Command | `/brewtools:task-board-init` |
| Model | opus |
| Arguments | `[target repo path]` (empty = current dir) |

## Overview

`task-board-init` is a one-shot scaffolder. Point it at a repo and it analyses the codebase, confirms findings with you, then writes a complete file-based task-tracking system into `.claude/`. After it runs, the repo has its own `/task-board` skill and `task-tracker` agent -- no further dependency on this generator.

It runs from the main conversation and is multi-agent: it spawns subagents for the heavy repo analysis and the legacy-doc sweep, and orchestrates their output. It does not hand-do bulk work.

## What it deploys

| Artifact | Path | Role |
|----------|------|------|
| Curator agent | `.claude/agents/task-tracker.md` | Owns the board: create/move/close tasks, groom backlog, keep `board.md` in sync. Writes ONLY `.claude/features/**`. |
| Dashboard skill | `.claude/skills/task-board/SKILL.md` | On-demand `/task-board` -- view/add/move/backlog/groom; delegates bulk passes to the agent. |
| Paths-scoped rule | `.claude/rules/tasks.md` | Lifecycle, id convention, required FM, grooming -- plus "run `task-tracker` at the start of any task". Auto-loads on `.claude/features/**`. |
| Board + control | `.claude/features/{board,TRACKER,TASK_TEMPLATE,INDEX}.md` + `{backlog,todo,progress,closed,specs}/` | The Kanban itself. |

## How it works (4 steps)

1. **Analyze** -- parallel subagents (`architect` + `Explore`) derive: domain id-segments, source-dir exclusions the curator must never touch, release style (`vX.Y.Z` tag / commit SHA / none), doc language, and an inventory of existing task docs. Findings confirmed via AskUserQuestion.
2. **Generate `task-tracker`** -- the curator agent, parametrized from Step 1.
3. **Generate `task-board`** -- the on-demand dashboard skill.
4. **Generate rule + scaffold + sweep** -- writes `tasks.md`, scaffolds `.claude/features/**`, then a multi-agent sweep migrates legacy backlog/feature docs into the board (dedup, migrate done into `closed/`, author `board.md`).

## Quick Start

```bash
# Deploy into the current repo
/brewtools:task-board-init

# Deploy into another repo
/brewtools:task-board-init /path/to/some-repo
```

## ID convention (deployed)

Ids are `UPPER-KEBAB`: `<PREFIX>-<DOMAIN>-<SLUG>`.

| Prefix | Use |
|--------|-----|
| `T-` | feature / product task |
| `BUG-` | defect |
| `M-` | maintenance / refactor / tech-debt |
| `EPIC-` | umbrella over several tasks |

`<DOMAIN>` is the per-repo first kebab segment, discovered in Step 1 (e.g. brewpage uses `HTML, KV, SITE, SEO, ...`).

## Notes

- Refuses to run if `.claude/features/board.md` already exists (board already deployed -- use `/task-board`).
- Never edits the target's `CLAUDE.md`; the start-of-task rule lives only in `.claude/rules/tasks.md`.
- Never commits -- that is a user/manager action.
- Sweep subagents write only under `.claude/features/**`; source dirs are off-limits.

## References

| File | Purpose |
|------|---------|
| `references/01-analysis.md` | Step 1 analysis prompts + AskUserQuestion confirmation contract |
| `references/02-task-tracker-agent.md` | `task-tracker` agent template (placeholders) |
| `references/03-task-board-skill.md` | `task-board` skill template |
| `references/04-tasks-rule.md` | `tasks.md` rule template (incl. run-at-start rule) |
| `references/05-features-templates.md` | `.claude/features/**` file templates |
| `references/06-doc-sweep.md` | Multi-agent doc-sweep procedure |

## Documentation

Full docs: https://doc-claude.brewcode.app/brewtools/skills/task-board-init/
