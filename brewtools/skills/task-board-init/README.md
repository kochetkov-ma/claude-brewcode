# Task Board Init

> Generator -- deploys a self-contained, file-based Kanban (board + curator agent + dashboard skill + rule) into ANY repo, parametrized by a multi-agent analysis of that repo.

| Field | Value |
|-------|-------|
| Command | `/brewtools:task-board-init` |
| Model | opus |
| Arguments | `[target repo path]` (empty = current dir) `["free-text directive"]` (optional) |

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

## How it works (4 steps + optional CLAUDE.md pass)

1. **Analyze** -- parallel subagents (`architect` + `Explore`) derive: domain id-segments, source-dir exclusions the curator must never touch, release style (`vX.Y.Z` tag / commit SHA / none), doc language, and an inventory of existing task docs. Findings confirmed via AskUserQuestion (which also asks whether to run the optional CLAUDE.md pass).
2. **Generate `task-tracker`** -- the curator agent, parametrized from Step 1.
3. **Generate `task-board`** -- the on-demand dashboard skill.
4. **Generate rule + scaffold + sweep** -- writes `tasks.md`, scaffolds `.claude/features/**`, then a multi-agent sweep migrates legacy backlog/feature docs into the board (dedup, migrate done into `closed/`, author `board.md`).
5. **CLAUDE.md optimization** (P5.5, optional, opt-in) -- runs AFTER the board is deployed; see below.

## CLAUDE.md optimization (optional, gated)

An opt-in phase that runs once the board is in place. It is strictly **propose-only** -- every change is behind AskUserQuestion, nothing is rewritten without your yes. It:

- reports the target `CLAUDE.md` line count vs the ~200-line optimal / 300-line ceiling;
- proposes moving secrets / machine-specific config to a gitignored `CLAUDE.local.md`;
- proposes splitting per-module detail into nested module `CLAUDE.md` files. Claude Code loads these on-demand only when you work in that subtree, shrinking the always-on root context -- this is NOT done via `@import`, which is eager and saves nothing;
- proposes dedup across `.claude/rules/*.md`;
- delegates token-compression of the touched files to `brewtools:text-optimize`.

The free-text directive (argument 2) tunes this phase: toggle individual sub-steps (`skip module split`, `also dedupe rules`), set a line budget (`budget 250`), control compression aggressiveness (`aggressive`), or run it as a plan only (`report only`).

## Quick Start

```bash
# Deploy into the current repo
/brewtools:task-board-init

# Deploy into another repo
/brewtools:task-board-init /path/to/some-repo

# Deploy + tune the optional CLAUDE.md pass via a directive
/brewtools:task-board-init ../repo "also dedupe rules, skip module split"
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
- Steps 1-4 never touch the target's `CLAUDE.md`; the start-of-task rule lives only in `.claude/rules/tasks.md`. The optional, opt-in P5.5 pass is the only sanctioned, fully-gated path that modifies `CLAUDE.md` (propose-only).
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
| `references/07-claude-md-optimize.md` | Optional P5.5 CLAUDE.md optimization (propose-only, directive-tuned) |

## Documentation

Full docs: https://doc-claude.brewcode.app/brewtools/skills/task-board-init/
