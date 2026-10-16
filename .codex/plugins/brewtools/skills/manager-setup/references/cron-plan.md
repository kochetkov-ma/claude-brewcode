# [ADDON: ANTI-DRIFT CRON]

Now: announce and create one unique session cron for the current task, hourly unless the user's interval differs, using available native scheduling tools. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule. If scheduling is unavailable, report the gap without claiming a schedule exists.

Each tick rereads the goal, task-specific methodology and anti-drift rules; collects active agent updates; reconciles task statuses, dependencies and remaining work; updates the task graph, keeping all unfinished entries and only the latest 10 completed entries, with older completion evidence preserved outside the active graph. It checks delivered work against the end goal, corrects drift, and names remaining acceptance criteria, problems, blockers and user questions.

Then it emits an extremely compact report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. On task completion or cancellation, stop the cron and verify its removal.

# [ADDON: ANTI-DRIFT CRON PLAN]

Stay read-only in Plan mode: create no cron now. Plan it as an execution step instead: on exit, announce and create one unique session cron per top-level task, with its task-specific prompt, interval and stop rule recorded in that task's methodology.
