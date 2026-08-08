---
name: task-board-setup
description: "Creates a Codex file-based task board. Explicit user invocation only."
---

# Codex task-board initializer

Create exactly one Codex-owned file board; never create or mirror it under another assistant namespace.

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
