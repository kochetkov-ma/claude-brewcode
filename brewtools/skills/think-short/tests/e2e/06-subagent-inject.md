# 06 — Pre-task injects profile-lite into sub-agent prompt

## Given
- Clean test-project fixture
- Project state pre-seeded: `{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}`
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `Use the Task tool with subagent_type=general-purpose to say the word "hello"`
(causes claude to call the Task tool, triggering PreToolUse:Task hook)

## Then
- exit 0
- log `.claude/logs/brewtools.log` contains `injecting profile-lite`

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_LOG_CONTAINS: injecting profile-lite

## Notes
ALLOW_SKIP_ON_NO_TRIGGER

Whether the Task invocation occurs depends on whether the model complies. If the log line is absent
the runner marks as SKIP. Confirmed triggers: pre-task.mjs fires on PreToolUse for any tool_name
Task or Agent. The log prefix is `think-short` and message contains `injecting profile-lite`.
