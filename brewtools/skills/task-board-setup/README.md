# Task Board Setup

> Generator -- deploys a self-contained, file-based Kanban (board + curator agent + dashboard skill + rule) into ANY repo, parametrized by a multi-agent analysis of that repo.

| Field | Value |
|-------|-------|
| Command | `/brewtools:task-board-setup` |
| Model | opus |
| Arguments | `[status\|install\|upgrade\|uninstall\|purge]` (optional) `[target repo path]` (empty = current dir) `["free-text directive"]` (optional) |

## Overview

`task-board-setup` is a one-shot scaffolder. Point it at a repo and it analyses the codebase, confirms findings with you, then writes a complete file-based task-tracking system into `.claude/`. After it runs, the repo has its own `/task-board` skill and `task-tracker` agent -- no further dependency on this generator.

It runs from the main conversation and is multi-agent: it spawns subagents for the heavy repo analysis and the legacy-doc sweep, and orchestrates their output. It does not hand-do bulk work.

## What it deploys

| Artifact | Path | Role |
|----------|------|------|
| Curator agent | `.claude/agents/task-tracker.md` | Owns the board: create/move/close tasks, groom backlog, keep `board.md` in sync. Writes ONLY `.claude/features/**`. |
| Dashboard skill | `.claude/skills/task-board/SKILL.md` | On-demand `/task-board` -- view/add/move/backlog/groom; delegates bulk passes to the agent. |
| Paths-scoped rule | `.claude/rules/tasks.md` | Lifecycle, id convention, required FM, grooming -- plus "run `task-tracker` at the start of any task". Auto-loads on `.claude/features/**`. |
| Board + control | `.claude/features/{board,TRACKER,TASK_TEMPLATE,INDEX}.md` + `{backlog,todo,progress,closed,specs}/` | The Kanban itself. |
| Spec skill (SPEC_MODE) | `.claude/skills/task-spec/SKILL.md` | `/task-spec <ID>` -- authors the spec + design docs via a domain-architect fan-out. |
| Spec templates (SPEC_MODE) | `.claude/features/specs/{SPEC_TEMPLATE,DESIGN_TEMPLATE}.md` | Fixed section skeletons for the two spec documents. |

## How it works (4 steps + optional spec layer + optional CLAUDE.md pass)

1. **Analyze** -- parallel subagents (`architect` + `Explore` + a domain-agent inventory pass) derive: domain id-segments, source-dir exclusions the curator must never touch, release style (`vX.Y.Z` tag / commit SHA / none), doc language, an inventory of existing task docs, and the target's own `.claude/agents/**` roster mapped to domains. Findings confirmed via AskUserQuestion (which also asks about `SPEC_MODE` and the optional CLAUDE.md pass).
2. **Generate `task-tracker`** -- the curator agent, parametrized from Step 1.
3. **Generate `task-board`** -- the on-demand dashboard skill.
3.5. **Generate `task-spec`** (SPEC_MODE only) -- the spec + design authoring skill, baked with the repo's own domain agents.
4. **Generate rule + scaffold + sweep** -- writes `tasks.md`, scaffolds `.claude/features/**` (plus the two spec templates under SPEC_MODE), then a multi-agent sweep migrates legacy backlog/feature docs into the board (dedup, migrate done into `closed/`, author `board.md`).
5. **CLAUDE.md optimization** (P5.5, optional, opt-in) -- runs AFTER the board is deployed; see below.

## Spec + system-design layer (optional, `SPEC_MODE`)

Confirmed in the same AskUserQuestion as the rest of the findings. `SPEC_MODE=off` is the default-compatible path: nothing below is emitted and every artifact is byte-identical to the pre-spec-layer generator.

With `SPEC_MODE=on`, a non-trivial task becomes THREE documents instead of one:

| Doc | Path | Owns |
|-----|------|------|
| Task | `.claude/features/{backlog,todo,progress,closed}/<ID>.md` | WHAT + WHY -- context, links, the ask, and a `## Scope` table of blocks `S1..Sn` |
| Product spec | `.claude/features/specs/<ID>-spec.md` | HOW -- decisions `D1..Dn`, resolved questions, open questions `Q1..Qn`, scope-coverage matrix |
| Design spec | `.claude/features/specs/<ID>-design.md` | Architecture -- components, data flow, interfaces, failure modes, complexity budget, non-goals |

The task's frontmatter gains `spec: none | pending | full | design-only`. It is ALWAYS written -- "no spec" is a recorded decision, never an omission. A task needs a spec if it touches more than one domain, more than ~5 files, adds an integration or dependency, changes a schema/API/contract, is ambiguous, or the user asked for a design.

### The emitted `task-spec` skill

Three invocation paths, all supported:

| Path | Form |
|------|------|
| Explicit | `/task-spec <ID>` (default `full`), `/task-spec <ID> design`, `/task-spec <ID> refresh` |
| Plain prose | model-invoked -- "architect this task", "write the spec", "системный дизайн", "продумай архитектуру". No skill name needed |
| Redirect | `task-tracker` ends its report with `NEXT: run /task-spec <ID> (spec required: <reason>)` when a task needs a spec and has none. An agent cannot call a skill for the main session, so it hands the call back to you |

**Domain-architect fan-out is mandatory.** The design document is never written by a single generalist. For every domain the task touches, `task-spec` spawns at least one agent -- the repo's own domain agent first, then any architecture-capable project agent, then the built-in `Plan` -- all in ONE message, and names per domain which one was used in the design's `## Evidence`. Domains with no owning agent are reported as gaps at install time and again in the design.

### Gates

| Gate | Rule |
|------|------|
| Coverage | every `in` scope id must appear as `covered` in BOTH coverage tables; any `partial`/`uncovered` keeps the spec at `status: draft` |
| Close | `progress -> closed` is blocked while any open question is `blocking: yes`. Override only by an explicit `SPEC WAIVER: <reason>` line in the task's `## Notes` |
| Sync | editing the task's `## Scope` invalidates both specs -- back to `draft`, run `/task-spec <ID> refresh` |

### `upgrade` -- retrofit onto an existing board

A repo that already has `.claude/features/board.md` cannot be re-installed. Use the `upgrade` verb to add the spec layer to it:

```bash
/brewtools:task-board-setup upgrade /path/to/repo
```

Upgrade is **additive only**: it writes the new `task-spec` skill and the spec templates outright, recovers the original findings from the deployed artifacts, and re-runs the domain-agent inventory. Every edit of an existing file is shown as a diff and gated behind AskUserQuestion. Existing task ids, scope ids and board rows are never renumbered or deleted; backfilled `spec:` values are `pending` or `none`, never `full`.

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
# No verb: status if a board is already deployed here, otherwise install
/brewtools:task-board-setup

# What is deployed in this repo?
/brewtools:task-board-setup status

# Deploy into another repo
/brewtools:task-board-setup install /path/to/some-repo

# Deploy + tune the optional CLAUDE.md pass via a directive
/brewtools:task-board-setup install ../repo "also dedupe rules, skip module split"

# Retrofit the spec + design layer onto a repo that already has a board
/brewtools:task-board-setup upgrade ../repo

# Remove the generated agent/skills/rule, KEEP every task under .claude/features/**
/brewtools:task-board-setup uninstall ../repo

# Remove all of it, tasks included
/brewtools:task-board-setup purge ../repo
```

## Modes

| Mode | Agent + skills + rule | `.claude/features/**` | Asks |
|------|----------------------|------------------------|------|
| `status` | — | — | never — read-only |
| `install` | written | written | full P1 confirmation |
| `upgrade` | spec layer added | additive edits only | per-file diff gate |
| `uninstall` | deleted | **kept** | one confirmation |
| `purge` | deleted | deleted | one confirmation, task counts stated |

No verb = `status` when a board is already deployed at the target, `install` when it is not. `init`, `setup`, `on`, `off`, `remove` and `reset` are no longer command words.

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

- Refuses `install` if `.claude/features/board.md` already exists (board already deployed -- use `/task-board` to operate it, or `upgrade` to add the spec layer).
- `upgrade` without an existing `board.md` is refused too -- there is nothing to upgrade; run `install` instead.
- `uninstall` never deletes tasks; only `purge` does, and it states the counts before asking. Neither reverts a P5.5 `CLAUDE.md` edit -- that is on git history.
- `SPEC_MODE=off` emits nothing spec-related; the output is byte-identical to the pre-spec-layer generator.
- Steps 1-4 never touch the target's `CLAUDE.md`; the start-of-task rule lives only in `.claude/rules/tasks.md`. The optional, opt-in P5.5 pass is the only sanctioned, fully-gated path that modifies `CLAUDE.md` (propose-only).
- Never commits -- that is a user/manager action.
- Sweep subagents write only under `.claude/features/**`; source dirs are off-limits.

## References

| File | Purpose |
|------|---------|
| `references/01-analysis.md` | Step 1 analysis prompts + domain-agent inventory + AskUserQuestion confirmation contract |
| `references/02-task-tracker-agent.md` | `task-tracker` agent template (placeholders) |
| `references/03-task-board-skill.md` | `task-board` skill template |
| `references/04-tasks-rule.md` | `tasks.md` rule template (incl. run-at-start rule) |
| `references/05-features-templates.md` | `.claude/features/**` file templates |
| `references/06-doc-sweep.md` | Multi-agent doc-sweep procedure |
| `references/07-claude-md-optimize.md` | Optional P5.5 CLAUDE.md optimization (propose-only, directive-tuned) |
| `references/08-task-spec-skill.md` | `task-spec` skill template (SPEC_MODE) |
| `references/09-spec-templates.md` | `SPEC_TEMPLATE.md` + `DESIGN_TEMPLATE.md` (SPEC_MODE) |
| `references/10-upgrade.md` | `upgrade` mode -- retrofit the spec layer onto a deployed board |

## Documentation

Full docs: https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/
