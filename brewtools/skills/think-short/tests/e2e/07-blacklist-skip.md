# 07 — Blacklist: architect agent skipped

## Given
- Clean test-project fixture
- Project state pre-seeded: `{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}`
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `Use the Task tool with subagent_type=architect to briefly describe what a plugin is`
(Task tool called with subagent_type=architect, which is in the default blacklist)

## Then
- exit 0
- log `.claude/logs/brewtools.log` contains `SKIP (agent in blacklist)` with `architect` in the surrounding context
- log does NOT contain `injecting profile-lite` for the architect call

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_LOG_CONTAINS: SKIP (agent in blacklist)
ASSERT_LOG_NOT_CONTAINS: architect) — injecting profile-lite

## Notes
ALLOW_SKIP_ON_NO_TRIGGER

The assertion `ASSERT_LOG_NOT_CONTAINS` uses a substring that would only appear if the hook wrongly
injected for the blacklisted agent. If the Task tool was never called, the log lines are absent
entirely — the runner treats this as SKIP rather than FAIL.
