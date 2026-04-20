# 08 — Project state overrides global state

## Given
- Clean test-project fixture
- Global state pre-seeded in `$CLAUDE_PLUGIN_DATA/think-short.json`:
  `{"version":1,"enabled":false,"profile":"light","blacklist":["debate","docs-writer","architect"]}`
- Project state pre-seeded in `.claude/brewtools/think-short.json`:
  `{"version":1,"enabled":true,"profile":"aggressive","blacklist":["debate","docs-writer","architect"]}`
- No `THINK_SHORT_DEFAULT` env var

## When
user prompt: `/brewtools:think-short status`
(reads merged state — project must win over global)

## Then
- exit 0
- stdout contains `enabled` and something indicating true/ENABLED
- stdout contains `aggressive`
- stdout contains `project` (indicating project-state as source)

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_STDOUT_CONTAINS: aggressive
ASSERT_STDOUT_CONTAINS: project

## Notes
The status command reads the merged effective state. Because project-state has `enabled:true` and
`profile:aggressive`, those values must appear in the output. The runner checks stdout from out.json
(the `result` field of claude's JSON output) for the directive strings.
