---
name: task-board-setup
description: "Creates a Codex file-based task board. Explicit user invocation only."
---

# Codex task-board initializer

Create exactly one Codex-owned file board; never create or mirror it under another assistant namespace.

## Modes

Resolve exactly one canonical mode from `status`, `install`, `upgrade`, `enable`, `disable`, `uninstall`, `purge` -- a standalone token only, never a word that merely appears inside a sentence. With no mode given, a deployed board (`.codex/features/board.md` exists) resolves to `status` and an empty target resolves to `install`. `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update` and `cleanup` are not modes: read them as the canonical verb, echo the canonical name back, and never print a retired alias as a command.

| Mode | Effect |
|------|--------|
| `status` | Read-only inventory of the target board. Writes nothing, delegates nothing, asks nothing. A parked `.disabled` twin is reported as parked, never as missing. |
| `install` | Run the phases below and deploy the board into the resolved target. |
| `upgrade` | Retrofit onto an already deployed board instead of the fresh-init phases. Recover the existing findings from the deployed artifacts rather than re-deriving them, ask for anything unrecoverable, write new files outright, and gate every edit of an existing file behind its own diff and confirmation. Never renumber and never delete. The metadata restamp is ungated and always runs -- it is the only thing that clears a stale version report. |
| `enable` | Restore parked machinery by renaming each `.disabled` twin back to the filename discovery keys on. Writes no content. |
| `disable` | Park the machinery by renaming the task-tracker agent, the `task-board` and `task-spec` skills and the task rule to `.disabled`. Bodies are untouched and every task is kept. |
| `uninstall` | Remove the generated agent, skills and rule plus any `.disabled` twin of them. `.codex/features/**` is KEPT: the generated pieces are machinery, the board is the user's data. |
| `purge` | `uninstall` plus deletion of `.codex/features/**`. Confirm first, stating the task counts that will be destroyed, and offer `uninstall` as the alternative that keeps them. |

`status`, `enable`, `disable`, `uninstall` and `purge` replace the phases below; run the `status` inventory afterwards as the proof. Optimization of `AGENTS.md` is never reverted by any mode -- say so in the report and point at version history.

## P0: resolve target and directive

1. Resolve the target repository, language, release marker style, exclusions, and whether optional AGENTS.md optimization is requested.

## P1: analyze the repository

2. Analyze repository domains, documentation, release conventions, and current task artifacts using bounded Codex collaboration when explicitly authorized.

## P2-P4: generate native board components

3. Generate a native task-tracker TOML at `.codex/agents/task-tracker.toml` from the Codex template in `references/02-task-tracker-agent.md`.
4. Generate the task-board skill at `.codex/skills/task-board/SKILL.md` from `references/03-task-board-skill.md`.
5. Create the single canonical board under `.codex/features/`: `board.md`, `INDEX.md`, `TRACKER.md`, `TASK_TEMPLATE.md`, and `backlog/`, `todo/`, `progress/`, `closed/`, `specs/`.
6. Add Codex task rules under `.codex/rules/` only if that rule layer is active in the target repository. Sweep documentation links without creating duplicate boards.

## P5: verify and report

7. Verify paths, TOML, skill frontmatter, folder/status invariants, board counts, link integrity, and idempotence.

## P5.5: optional AGENTS.md optimization

8. Optimize `AGENTS.md` only behind the separate explicit gate and preserve project-specific constraints.

Do not create a migration-card file automatically and do not create a duplicate board under another assistant namespace.
