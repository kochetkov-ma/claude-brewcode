# 01b — Toggle off (pre-seeded enabled:true)

## Given
- Project state file pre-seeded with `{enabled:true, profile:medium, blacklist:[...]}`
- `CLAUDE_PLUGIN_DATA` set to a temp dir (no global state)
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `/brewtools:think-short off`

(The skill defaults to `project` scope silently under `--print`. It flips enabled→false.)

## Then
- claude exits 0
- `.claude/brewtools/think-short.json` exists with `"enabled": false`
- log contains `think-short`

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_STATE_PROJECT_JSON_CONTAINS: "enabled": false
ASSERT_LOG_CONTAINS: think-short
