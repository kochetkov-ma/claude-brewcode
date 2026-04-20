# 04 — NL prompt level number (уровень 3)

## Given
- Clean test-project fixture (no state files)
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `уровень 3`

(NL parser matches `уровень 3` → `profile aggressive` per synonym table.)

## Then
- exit 0
- `.claude/brewtools/think-short.json` contains `"profile": "aggressive"`
- log contains `think-short: NL-prompt` and `resolved as`

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_STATE_PROJECT_JSON_CONTAINS: "profile": "aggressive"
ASSERT_LOG_CONTAINS: think-short: NL-prompt
ASSERT_LOG_CONTAINS: resolved as
