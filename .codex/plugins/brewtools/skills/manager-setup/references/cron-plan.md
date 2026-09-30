# [ADDON: ANTI-DRIFT CRON PLAN]

Stay read-only in Plan mode. Add an execution step to the task-board plan: announce and create one unique session cron per top-level task, hourly by default or at the user's interval. Record its task-specific prompt, schedule ID, timezone, tick count and stop rule in that task's methodology; create it only during execution using available native scheduling tools. If unavailable, report the gap without claiming a schedule exists.

Each tick must reread the goal, task-specific methodology and anti-drift rules; collect active agent updates; reconcile task statuses, dependencies and remaining work; update the task graph, keeping all unfinished entries and only the latest 10 completed entries. Preserve older completion evidence outside the active graph and repair stale dependencies. Check delivered work against the end goal, correct drift, and identify remaining acceptance criteria, progress, problems, blockers and user questions.

Then emit an extremely compact, clearly formatted report: `HH:MM TZ · tick N · elapsed`; `🟢 completed`; `🔵 active / remaining / next`; `🔴 problems / blockers / questions`; `⚪ anti-drift verdict`. Omit empty rows; use only these circles. Stop and verify cron removal on task completion or cancellation. Plan the schedule now; never create it while Plan mode is read-only.
