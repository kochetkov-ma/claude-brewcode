# 09 — Logging visibility: CLAUDE_DEBUG=1 exposes debug lines

## Given
- Clean test-project fixture
- Project state pre-seeded: `{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}`
- `CLAUDE_DEBUG=1` set in environment

## When
user prompt: `say hi`
(trivial prompt — triggers SessionStart hook)

## Then
- exit 0
- log `.claude/logs/brewtools.log` does NOT lack debug detail for the think-short session inject path
  (When CLAUDE_DEBUG=1, session-start.mjs logs `think-short: profile preview =` line)
- stdout does not contain error

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_LOG_CONTAINS: think-short: profile preview =
ASSERT_STDOUT_NOT_CONTAINS_REGEX: "error":\s*"

## Notes
ALLOW_SKIP_ON_NO_TRIGGER

The `profile preview` line is only emitted when `CLAUDE_DEBUG === '1'` (see session-start.mjs line 47).
If SessionStart hook does not fire (plugin not loaded), the runner marks as SKIP.

---

# Without CLAUDE_DEBUG (second pass, same scenario dir, fresh log)

## Given
- Same fixture, SAME state file
- `CLAUDE_DEBUG` unset

## When
user prompt: `say hi`

## Then
- log does NOT contain `think-short: profile preview =`
  (debug line must be absent when CLAUDE_DEBUG is not set)

## Assert
ASSERT_EXIT_CODE: 0
ASSERT_LOG_NOT_CONTAINS: think-short: profile preview =
