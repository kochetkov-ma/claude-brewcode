# 03 — NL prompt (Russian combo: включись агрессивно)

## Given
- Clean test-project fixture (no state files)
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `включись агрессивно`

(NL parser should match `включись` → `on`, `агрессивно` → `profile aggressive`.
Skill executes both mutations for project scope.)

## Then
- exit 0
- `.claude/brewtools/think-short.json` contains `"enabled": true`
- `.claude/brewtools/think-short.json` contains `"profile": "aggressive"`
- log contains `think-short: NL-prompt` and `resolved as`

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_STATE_PROJECT_JSON_CONTAINS: "enabled": true
ASSERT_STATE_PROJECT_JSON_CONTAINS: "profile": "aggressive"
ASSERT_LOG_CONTAINS: think-short: NL-prompt
ASSERT_LOG_CONTAINS: resolved as
