# 11 -- Methodology and session anti-drift

UNGATED: install/upgrade writes the three control files below in BOTH `SPEC_MODE` states; substitute the same provenance, `{{REPO_NAME}}`, `{{DOMAINS}}` and `{{LANG}}` tokens as ref 05. Populate `METHODOLOGY.md` from detected domain instructions and actual check commands; never invent a runnable command. Preserve user decisions and task-specific prompts on upgrade. Fill missing task sections from ref 05 when a task is added or claimed.

## `METHODOLOGY.md`

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# {{REPO_NAME}} task methodology

Domains: {{DOMAINS}}. Derive the method from the domain's risks and local instructions; specialize it in each task's `## Methodology` before implementation. Keep this shared method about the domain, not one task's execution history. Content follows {{LANG}}.

| Domain | Authoritative instructions | Review strategy | Narrow reliable tests/checks |
|--------|----------------------------|-----------------|-----------------------------|
| (populate from the project) | (existing paths) | (domain risks and reviewers) | (verified commands or explicit validation gap) |

At task start, the main session uses `task-board` to prepare a unique session anti-drift schedule for EACH active top-level task: hourly by default, user cadence overrides it. Announce cadence and session scope; retain the task-specific prompt and base checklist before creation. Child work units are graph nodes of their parent, not independent timers. Scheduling/lifecycle: `ANTI-DRIFT.md`.

Base work for every task: confirm goal/scope and latest user corrections; assign bounded owners/dependencies; implement; simplify; review correctness/safety, then clarity/maintainability/missing validation; run the task's reliable checks; reconcile graph/board/evidence; stop its schedule on completion/cancellation. Tasks refine this checklist with domain-specific work and acceptance evidence. Do not add release work without authorization.
```

## `ANTI-DRIFT.md`

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# Session anti-drift

## Ownership and lifecycle

The main session's `task-board` flow owns timers; the `task-tracker` agent owns board/task/graph reconciliation and returns scheduling actions to the main session. Never delegate timer creation to a child agent. One live timer per active top-level task IN THIS SESSION, matched by task id + absolute project root in its prompt; never adopt or delete unrelated timers. A child has a parent id in its task methodology; it has no independent timer.

On claim/resume and every transition:
1. Read shared/task methodology, current goal/scope/spec (when present), user corrections and this file. Author/refine `## Methodology`, its base work units/dependencies, and the task-specific prompt in `## Anti-drift cron` BEFORE creation. Persist task id, project root, started-at time, requested/effective cadence, timezone, scheduler id, state, last delivered tick time and tick number. Keep execution state out of generator provenance.
2. Use available `CronList`, `CronCreate`, `CronDelete` in the main session. List before creating; verify the prompt matches this task + project and record the confirmed id/state. Default fixed cadence: `0 * * * *`, recurring. Convert the user's cadence to supported five-field cron; if it cannot be represented exactly, report the actual cadence instead of silently claiming the requested interval. Invalid/ambiguous cadence -> ask once before scheduling. Respect scheduling permissions and explicit user opt-out.
3. Reuse one matching live timer; remove only this task's duplicates. On changed prompt/cadence, delete the old timer and verify absence before replacing; if deletion fails, report it and do not create a duplicate. On completion/cancellation/parking, delete this task's live timer(s), verify via `CronList`, then persist stopped state; failed deletion remains an explicit cleanup gap. Resume creates/reconciles one timer again. A persisted id alone never proves a timer is live.
4. If tools are unavailable, disabled, denied, expired, or at capacity, retain prompt/state and report the limitation; never substitute OS/cloud scheduling or claim delivery. On session resume re-list before creating. Only create/renew while the task is still active and authorized.
5. Announce: task id, effective cadence, timezone, verified scheduler id/state, first scheduled due time (if known), session scope and cancel/change controls. Scheduling is approximate, not guaranteed receipt; distinguish scheduled, fired and received. Persisted prompt/state is task evidence, not an independent durable scheduler.

## Task-specific tick prompt

At task acceptance, resolve the static task tokens below to its actual id, absolute root, task/methodology/spec paths, goal, base work and acceptance evidence; store the COMPLETE unique plain prompt in its task file. Started-at is its verified work-start time, or explicit `not started` while queued; refresh it on claim before scheduling. Report labels `local receipt time`, `tick N` and `elapsed` are evaluated on delivery, never prefilled with invented future values. Use a plain prompt, not a slash command: scheduled delivery may not execute a skill with model invocation disabled.

> Anti-drift tick for <TASK_ID> at <ABSOLUTE_PROJECT_ROOT>; goal: <GOAL>; started: <STARTED_AT>. Read <TASK_PATH>, METHODOLOGY.md, its task methodology, ANTI-DRIFT.md, board.md, task-graph.md, PROGRESS.md, <SPEC_PATHS_OR_NONE> and latest user corrections. Reconcile facts from owners/check evidence, statuses, dependencies, counts and next work; request concise updates from available in-flight agents through supported tools. Use the task-tracker owner for board/task/graph changes. Rebuild the derived task graph: keep ALL unfinished nodes and only the latest 10 completed nodes; preserve older completion evidence in task Notes/closed files before pruning. Reread/reconcile methodology; check drift against <GOAL> and <ACCEPTANCE_EVIDENCE>, name/correct deviations within authorized scope, quantify remaining work or say unknown; advance the next unblocked authorized step from <BASE_WORK_UNITS>. If complete/cancelled, have task-board stop and verify this task's timer. Increment the persisted tick number only for a delivered tick; record actual local receipt time. Report at most five short lines: 🔵 <TASK_ID> · local receipt time + timezone · tick N · elapsed actual duration; 🟢 achievements; 🔵 remaining units/acceptance + next action; 🔴 present problems/blockers/user question (omit if absent); ⚪ drift none verified OR deviation/correction OR check unavailable. Compute these report values from actual delivery/evidence; do not invent progress, timing or assurance. Full evidence goes to the task record, not chat.

Planning only: include task methodology, graph/base work, a saved task-specific prompt and an execution step to reconcile/create the session timer in the plan. Do not mutate files or schedule while plan mode forbids those actions. Read-only ticks in plan mode report proposed reconciliation; defer all writes and execution to the approved execution phase.
```

## `task-graph.md`

```markdown
---
doc_type: llm
version: "{PLUGIN_VERSION}"
content_version: "{CONTENT_VERSION}"
generated_by: "{GENERATED_BY}"
last_updated: "{LAST_UPDATED}"
---

# {{REPO_NAME}} active task graph

Derived from `board.md` and each task's Methodology/Notes; never a competing status authority. Rewrite after transitions/ticks: ALL unfinished top-level tasks and their work units, plus only the latest 10 completed nodes by recorded completion time (stable id tie-break). Missing completion evidence -> flag uncertainty, never classify as done. Before pruning, preserve each completed node's outcome/check evidence in its task Notes or `closed/` record; remove the graph row only. `board.md` counts include archived closed tasks; graph counts describe its retained nodes. Root/backlog ideas are not work units until accepted.

Updated: --
Counts: queued 0 | in-progress 0 | blocked 0 | done-recent 0 | done-archived 0

| Node | Parent task | Work / acceptance evidence | Owner | Depends on | State | Completed at / evidence |
|------|-------------|----------------------------|-------|------------|-------|-------------------------|

States: queued, in-progress, blocked, done. Preserve every unfinished node and dependency; retained nodes may reference archived completions by task record path. Scope changes, user corrections and newly discovered blockers update base work/dependencies rather than erase unfinished work. A tick checks the goal/acceptance gap, records deviations/corrections in the task and refreshes `PROGRESS.md` from the canonical board.
```

## Runtime evidence

[Official Claude Code scheduling docs](https://code.claude.com/docs/en/scheduled-tasks), checked 2026-09-30: `CronCreate` accepts a five-field expression, prompt and recurring/one-shot choice; `CronList` and `CronDelete` manage ids. Session schedules need a running session, fire between turns, can be delayed and do not catch up every missed interval. Recurring schedules expire after seven days; eligible schedules can be restored by resuming the conversation. Runtime tool availability remains authoritative; no exact delivery or persistence guarantee is inferred from a saved task record.
