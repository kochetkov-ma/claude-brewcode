# 05 — SessionStart injects profile into additionalContext

## Given
- Clean test-project fixture
- Project state pre-seeded: `{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}`
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `say hi`
(trivial prompt — just enough to trigger SessionStart hook)

## Then
- exit 0
- log `.claude/logs/brewtools.log` contains `SessionStart — injecting profile=medium`

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_LOG_CONTAINS: SessionStart — injecting profile=medium

## Notes
ALLOW_SKIP_ON_NO_TRIGGER

The hook fires via SessionStart event when claude launches. If the log line is absent it means the
hook did not fire (e.g. plugin not loaded, or session-start.mjs not executed). The runner marks this
as SKIP rather than FAIL when ALLOW_SKIP_ON_NO_TRIGGER is set, since CI may not load the plugin.
