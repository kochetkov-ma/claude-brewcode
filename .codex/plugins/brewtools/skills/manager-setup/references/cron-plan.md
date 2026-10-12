# [ADDON: ANTI-DRIFT CRON PLAN]

Stay read-only in Plan mode: plan the schedule now, never create it before execution. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology. If scheduling is unavailable, report the gap without claiming a schedule exists.

Each tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; repairs stale dependencies; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and identifies remaining acceptance criteria, progress, problems, blockers and user questions.

Then it emits an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation.
