# Manager — status report shape

Moved verbatim from the `SKILL.md` `status` section. Read it before you print the full status report (the `status` action, or P3).

Shape (`references/hard.md` rendered with `hard`, `level`, `stateSource`):
```
# Manager — status

## Codewords
codewords: provided by brewmod-placeholders (Claude Code 2.1.301+) — ++m, ++a, ++rr, ++r, +++. Not part of this plugin; this skill neither enables nor disables them.
Install:   claude plugin install brewmod-placeholders@claude-brewcode
Overrides: <legacyOverrides, one path per line, or "none found"> — files under .claude/brewtools/manager/prompts/ and <config dir>/manager/prompts/ are read through the mod's legacy layer.

## HARD wall (this project) — registered=<yes|no>  armed=<ON|OFF>  level=<strict|balanced>  (state source: <project|global|default>)
Delivery: INSTALLED into this project (not a plugin hook). Registered once in .claude/settings.local.json (personal, gitignored), gated at runtime by .claude/brewtools/manager/state.json {hard}.
When armed, the main session cannot Write/Edit/WebFetch; it can delegate (Agent, Workflow), read (Read/Grep/Glob/LSP), track (TaskCreate/TaskUpdate/TaskList/TaskGet, TodoWrite), stop background work (TaskStop), enter and leave worktrees, and manage session timers (CronCreate/CronList/CronDelete/ScheduleWakeup). Task-board owns its timer matching/cleanup; scheduled work still passes through the wall. This exempts no external/OS scheduling. Bash and Monitor: strict denies both; balanced permits read-only commands. MCP: strict keeps only the read-only mcp__semble_code__* search tools; balanced allows tools that read as read-only, plus mcpAllow entries. The wall adds nothing to your prompts: a denied call carries the explanation and the exit.
Allowlist summary: <one-line summary from hard.md for current level>
State version: <stateVersion or "unknown (written before versioning)">  plugin: <pluginVersion>  <"— run upgrade" when stale and installed; "— wall not installed: run install" when installed is false>

## Task graph (TaskCreate/TaskUpdate/TaskGet/TaskList) — <ON|OFF|UNKNOWN from todoToolsOn>
Claude Code <ccVersion>. From 2.1.233 these tools are gated off by default and need env CLAUDE_CODE_ENABLE_TODO_TOOLS=1 (or true/yes/on).
<when todoToolsLayer != null>  key = <todoToolsValue> in <todoToolsLayer>, the highest layer that sets it. An off value there is the user's opt-out: install/upgrade leave it; enabling means changing that file.
<when todoToolsLayer == null and todoToolsOn false>  OFF — the manager framework cannot build a task graph. Fix: /brewtools:manager-setup install (or upgrade if the wall is already installed).
<when todoToolsLayer == null and todoToolsOn true>  ON — via the session env, or this Claude Code predates the gate.

Install:   /brewtools:manager-setup install    (install+arm; applies live, no restart)
Upgrade:   /brewtools:manager-setup upgrade    (re-copy the guard + restamp state.json; arm state kept)
Enable:    /brewtools:manager-setup enable     (arm an already-installed wall)
Disable:   /brewtools:manager-setup disable    (disarm only — registration kept, guard no-ops)
Uninstall: /brewtools:manager-setup uninstall  (deregister from settings.local.json; applies live)
Purge:     /brewtools:manager-setup purge      (uninstall + delete state; prompt overrides kept)
Level:     /brewtools:manager-setup level strict | balanced
Exit:      node <ABS project root>/.claude/brewtools/manager/manager-state.mjs set hard=false
           (the ONE self-exempt command — copy verbatim, append nothing. Fallback: delegate to a subagent.)
```
