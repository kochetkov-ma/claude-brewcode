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
| `disable` | First stop/verify this board's active session reminders, then park the task-tracker agent, board/spec skills and task rule as `.disabled`. Bodies and task data are kept. |
| `uninstall` | First stop/verify this board's active session reminders, then remove the generated agent, skills/rule and parked twins. Keep `.codex/features/**` as user data. |
| `purge` | `uninstall` plus deletion of `.codex/features/**`. Confirm first, stating the task counts that will be destroyed, and offer `uninstall` as the alternative that keeps them. |

`status`, `enable`, `disable`, `uninstall` and `purge` replace the phases below; run the `status` inventory afterwards as the proof. Optimization of `AGENTS.md` is never reverted by any mode -- say so in the report and point at version history.

Timer-stop gate: use the installed native `session-reminders` skill if available. List only schedules matching this absolute project root + board task id; stop their bound exec cells and verify native termination before parking/removing files. Saved ids/store flags never prove termination. Preserve task prompts/runtime evidence; leave unrelated schedules untouched. Required transport/helper unavailable or cleanup unverifiable -> report the gap and stop before removing recovery records. Enabling restores discovery; task-board reconciles one timer per active top-level task on claim/resume.

## P0: resolve target and directive

1. Resolve the target repository, language, release marker style, exclusions, and whether optional AGENTS.md optimization is requested.

## P1: analyze the repository

2. Analyze repository domains, documentation, release conventions, and current task artifacts using bounded Codex collaboration when explicitly authorized.

## P2-P4: generate native board components

3. Generate a native task-tracker TOML at `.codex/agents/task-tracker.toml` from the Codex template in `references/02-task-tracker-agent.md`.
4. Generate the task-board skill at `.codex/skills/task-board/SKILL.md` from `references/03-task-board-skill.md`.
5. Create the single canonical board under `.codex/features/`: `board.md`, `PROGRESS.md`, `INDEX.md`, `TRACKER.md`, `TASK_TEMPLATE.md`, `METHODOLOGY.md`, `ANTI-DRIFT.md`, `task-graph.md`, and status/spec folders. The three ref-11 controls and task Methodology/Anti-drift cron sections are ungated in both spec modes. Populate shared review/test methodology from actual domain instructions and verified local checks.
6. Add Codex task rules under `.codex/rules/` only if that rule layer is active in the target repository. Sweep documentation links without creating duplicate boards.

## P5: verify and report

7. Verify paths, TOML, skill frontmatter, folder/status invariants, board counts, link integrity, and idempotence.

Install/upgrade uses `references/11-methodology-cron.md` for all three control bodies. Upgrade adds missing controls/consumer sections without replacing task-local methodology, prompts, scheduler state or evidence; restamp control provenance only. The board remains canonical status authority; derived graph retains all unfinished nodes + latest 10 completed, archiving older evidence to task Notes/closed records before pruning rows. Scheduling is through available native session-reminders transport, with hourly defaults/user override and finite lifetime disclosed; unavailable transport is reported, never disguised as a scheduled cron. Planning includes saved task-specific prompt/base work/graph/timer execution steps and remains read-only.

## P5.5: optional AGENTS.md optimization

8. Optimize `AGENTS.md` only behind the separate explicit gate and preserve project-specific constraints.

Do not create a migration-card file automatically and do not create a duplicate board under another assistant namespace.

## Native user gates

Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval.
