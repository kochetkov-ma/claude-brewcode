# 02 — Profile switch

## Given
- Clean test-project fixture
- Project state pre-seeded: `{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}`
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `/brewtools:think-short profile aggressive`

## Then
- exit 0
- `.claude/brewtools/think-short.json` contains `"profile": "aggressive"`
- `"enabled": true` is preserved (profile switch must not flip enabled)
- log `.claude/brewtools.log` contains `think-short`

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_STATE_PROJECT_JSON_CONTAINS: "profile": "aggressive"
ASSERT_STATE_PROJECT_JSON_CONTAINS: "enabled": true
ASSERT_LOG_CONTAINS: think-short
