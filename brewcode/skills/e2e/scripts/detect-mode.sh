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
    install|create|update|review|rules|status) return 0 ;;
    *) return 1 ;;
  esac
}

# Verbs e2e does not implement. Without this they would fall through to the prompt branch
# and start a full INSTALL -- the opposite of what the user typed.
is_unsupported_keyword() {
  case "$1" in
    uninstall|purge|upgrade|enable|disable) return 0 ;;
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
    MODE="install"
  fi
elif is_unsupported_keyword "$FIRST"; then
  printf 'ERROR:e2e has no %s mode. Use: install | create | update | review | rules | status. To remove the setup, delete .claude/agents/e2e-*.md and .claude/e2e/ by hand.\n' "$FIRST"
  exit 1
elif is_keyword "$FIRST"; then
  MODE="$FIRST"
  PROMPT="$REST"
else
  # Non-keyword first word: install with full args as prompt
  MODE="install"
  PROMPT="$ARGS"
fi

printf 'MODE:%s\n' "$MODE"
[ -n "$PROMPT" ] && printf 'PROMPT:%s\n' "$PROMPT"

exit 0
