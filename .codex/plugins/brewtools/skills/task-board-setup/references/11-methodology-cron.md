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

# Native session anti-drift

Main-session task-board owns schedules; task-tracker reconciles board/tasks/graph and returns CRON actions. Match one timer per active top-level task by id + absolute project root; children use their parent's timer. Read shared/task methodology, goal/scope/spec and user corrections; resolve static task id/root/paths/goal/base work/acceptance tokens and save the complete unique prompt at acceptance. Started-at is verified work-start or explicit not started while queued; refresh on claim. Future local receipt time/tick number/elapsed/report evidence are computed on delivery, never fabricated during prompt preparation.

Use the installed native session-reminders SKILL.md and supporting helper, if available; load them from the active skill installation, never assume a host-specific path. Required active-turn transport: functions.exec, notify, yield_control and session store. Follow the helper's inspect/list/status, completed prepare -> run -> bind protocol; serialize creation and bind the actual returned cell id/generation. Default hourly, 24 occurrences, session timezone; explicit user cadence/count/duration/first time overrides. Invalid/conflicting timing -> resolve before scheduling. Do not install or substitute OS/cloud timers when unavailable; save prepared/unavailable intent and say why. Respect scheduling permissions and user opt-out.

Reuse one matching active timer; inspect before creating. To change/stop or remove duplicates owned by this task, terminate the bound exec with functions.wait (terminate: true), verify termination, then record helper stop. A prepared schedule known never launched uses the helper's not_started path. Store flags/saved ids alone never prove termination; uncertain launch requires recovery of the real cell id. Completion/cancellation/parking stops and verifies; resume re-lists/reconciles. Missing state after runtime reset is not an active schedule. Preserve full task-local prompt, id/generation/cell id, requested/effective cadence, timezone, started-at, received tick time/number and lifecycle evidence.

Announce actual id/target, complete message, timezone, frequency/count, first/last due times and status/stop controls from verified helper evidence. This finite active-turn timer does not guarantee interruption, exact receipt or continuity across turn completion, runtime reset or restart. Distinguish scheduled/emitted/received/skipped/stopped/completed; increment tick number only from received evidence. Reap completed/failed cells and observe the actual final checkpoint per the skill.

Task-specific prompt baseline (resolve static angle tokens before saving): Anti-drift for <ID> in <ROOT>, goal <GOAL>, started <START>. Read <TASK>, METHODOLOGY.md, task Methodology, ANTI-DRIFT.md, board.md, task-graph.md, PROGRESS.md, <SPECS_OR_NONE>, latest user corrections. Obtain concise owner updates through supported collaboration. Reconcile status/dependencies/counts and rewrite the derived graph: ALL unfinished nodes + latest 10 done, preserve older evidence in task Notes/closed records before pruning. Force goal/acceptance drift check against <ACCEPTANCE>; correct deviations within scope, quantify remaining or say unknown; advance <BASE_WORK>'s next unblocked authorized step. Stop/verify if complete/cancelled; never recreate a timer from a tick. Persist actual received tick/time. Report at most five short lines: 🔵 <ID> · local receipt time/timezone · tick N · elapsed actual duration; 🟢 achievements; 🔵 remaining/next; 🔴 present problems/blockers/questions (omit if absent); ⚪ verified drift/correction or check unavailable. Compute report values on delivery, never invent assurance/progress/delivery.

Plan mode includes methodology/base work/graph, complete saved prompt and explicit timer reconciliation as execution steps; no writes or timer mutation while planning is read-only. Delivered planning ticks propose reconciliation only.
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

Native scheduling follows the available session-reminders skill and helper. Never infer scheduler availability or live timer state from persisted task text.
