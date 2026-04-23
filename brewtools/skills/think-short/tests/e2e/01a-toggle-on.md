# 01a — Toggle on (fresh state)

## Given
- Clean test-project fixture (no pre-existing state files)
- `CLAUDE_PLUGIN_DATA` set to a temp dir (no global state)
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `/brewtools:think-short on`

(The skill defaults to `project` scope silently under `--print` — no AskUserQuestion.
The runner pre-seeds no state files, so the skill writes a fresh project state.)

## Then
- claude exits 0
- file `.claude/brewtools/think-short.json` exists in the working dir
- that file contains `"enabled": true`
- log `.claude/logs/brewtools.log` contains a line matching `think-short`
- stdout JSON does not indicate an error

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_STATE_PROJECT_JSON_CONTAINS: "enabled": true
ASSERT_LOG_CONTAINS: think-short
