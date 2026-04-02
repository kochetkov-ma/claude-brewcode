#!/bin/sh
set -eu

ARGS="${1:-}"

# Parse first word and remainder
FIRST=""
REST=""
if [ -n "$ARGS" ]; then
  TRIMMED=$(printf '%s' "$ARGS" | sed 's/^[[:space:]]*//')
  FIRST=$(printf '%s' "$TRIMMED" | cut -d' ' -f1)
  REST="${TRIMMED#"$FIRST"}"
  REST=$(printf '%s' "$REST" | sed 's/^[[:space:]]*//')
fi

is_keyword() {
  case "$1" in
    setup|create|update|review|rules|status) return 0 ;;
    *) return 1 ;;
  esac
}

MODE=""
PROMPT=""

if [ -z "$FIRST" ]; then
  # No args: detect mode from agent file count
  AGENT_COUNT=$(ls .claude/agents/e2e-*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AGENT_COUNT" -ge 3 ]; then
    MODE="status"
  else
    MODE="setup"
  fi
elif is_keyword "$FIRST"; then
  MODE="$FIRST"
  PROMPT="$REST"
else
  # Non-keyword first word: setup with full args as prompt
  MODE="setup"
  PROMPT="$ARGS"
fi

printf 'MODE:%s\n' "$MODE"
[ -n "$PROMPT" ] && printf 'PROMPT:%s\n' "$PROMPT"

exit 0
