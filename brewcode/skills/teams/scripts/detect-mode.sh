#!/bin/sh
set -eu

ARGS="${1:-}"
TEAMS_DIR=".claude/teams"

validate_name() {
  case "$1" in
    *[!a-zA-Z0-9_-]*) printf 'ERROR:invalid team name (alphanumeric, dash, underscore only)\n'; exit 1 ;;
    "") printf 'ERROR:empty team name\n'; exit 1 ;;
  esac
}

# Parse first word (shell expansion, no sed regex injection)
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
    create|update|status|cleanup) return 0 ;;
    *) return 1 ;;
  esac
}

# Extract second word and remainder from REST (shell expansion, no sed)
second_word() { printf '%s' "$REST" | cut -d' ' -f1; }
after_second() {
  _sw=$(second_word)
  _r="${REST#"$_sw"}"
  printf '%s' "$_r" | sed 's/^[[:space:]]*//'
}

MODE=""
TEAM_NAME=""
PROMPT=""

if [ -z "$FIRST" ]; then
  if [ -d "$TEAMS_DIR" ] && [ "$(find "$TEAMS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)" ]; then
    MODE="status"
    TEAM_NAME=$(find "$TEAMS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
    TEAM_NAME=$(basename "$TEAM_NAME")
  else
    MODE="create"
    TEAM_NAME="default"
  fi
elif is_keyword "$FIRST"; then
  MODE="$FIRST"
  if [ -n "$REST" ]; then
    TEAM_NAME=$(second_word)
    if [ "$MODE" = "create" ]; then
      PROMPT=$(after_second)
    fi
  else
    TEAM_NAME="default"
  fi
else
  TEAM_NAME="$FIRST"
  if [ -d "$TEAMS_DIR/$TEAM_NAME" ]; then
    MODE="status"
  else
    MODE="create"
  fi
fi

# Validate team name (skip for "default")
if [ "$TEAM_NAME" != "default" ]; then
  validate_name "$TEAM_NAME"
fi

printf 'MODE:%s\n' "$MODE"
printf 'TEAM_NAME:%s\n' "$TEAM_NAME"
[ -n "$PROMPT" ] && printf 'PROMPT:%s\n' "$PROMPT"

exit 0
