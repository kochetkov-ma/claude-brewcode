#!/bin/sh
set -eu

ARGS="${1:-}"
TEAMS_DIR=".claude/teams"

# Plugin version by SELF-LOCATION (scripts/ -> <plugin root>): dev checkout + cache; NEVER hardcoded.
# `|| true`: under `set -e` failing command substitution aborts script.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_JSON="$SCRIPT_DIR/../../../.claude-plugin/plugin.json"
PLUGIN_VERSION=""
if [ -f "$PLUGIN_JSON" ]; then
  if command -v jq >/dev/null 2>&1; then
    PLUGIN_VERSION=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
  else
    PLUGIN_VERSION=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
  fi
fi
# HARD FAIL, no placeholder: `unknown` evades setup-status PLACEHLD -> `sort -V` says `AHEAD unknown > X.Y.Z`.
# Unreadable manifest = broken install; skill treats `ERROR:` as STOP before writing team.md/agents.
case "$PLUGIN_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve plugin version (X.Y.Z) from %s - refusing to stamp artifacts with a fake version\n' "$PLUGIN_JSON"; exit 1 ;;
esac

# content_version self-location: this skill's OWN marker in SKILL.md -- the artifact whose
# stamp bump-version.sh moves via git-diff. NEVER copied from PLUGIN_VERSION, never invented.
SKILL_MD="$SCRIPT_DIR/../SKILL.md"
CONTENT_VERSION=""
if [ -f "$SKILL_MD" ]; then
  CONTENT_VERSION=$(grep -aoE 'content_version=[0-9]+\.[0-9]+\.[0-9]+' "$SKILL_MD" 2>/dev/null | head -1 | sed 's/^content_version=//' || true)
fi
case "$CONTENT_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve content_version from %s - refusing to stamp artifacts with a fake content_version\n' "$SKILL_MD"; exit 1 ;;
esac

validate_name() {
  case "$1" in
    -*) printf 'ERROR:invalid team name (must not start with a dash)\n'; exit 1 ;;
    *[!a-zA-Z0-9_-]*) printf 'ERROR:invalid team name (alphanumeric, dash, underscore only)\n'; exit 1 ;;
    "") printf 'ERROR:empty team name\n'; exit 1 ;;
  esac
}

# Flags sit anywhere and the skill reads them itself: drop them before the positional parse,
# else `--skip-review install x` named a team `--skip-review`. awk splits: no glob, any shell.
ARGS=$(printf '%s' "$ARGS" | awk '
  { for (i = 1; i <= NF; i++) if ($i != "--skip-review" && $i != "--review") out = out (out == "" ? "" : " ") $i }
  END { print out }')

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
    status|install|upgrade|enable|disable|uninstall|purge) return 0 ;;
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
    MODE="install"
    TEAM_NAME="default"
  fi
elif is_keyword "$FIRST"; then
  MODE="$FIRST"
  if [ -n "$REST" ]; then
    TEAM_NAME=$(second_word)
    if [ "$MODE" = "install" ]; then
      PROMPT=$(after_second)
    fi
  else
    TEAM_NAME="default"
  fi
else
  TEAM_NAME="$FIRST"
  # Bare `<name> <mode>` pair: an explicit mode token wins, else `billing enable` ran `install`.
  if [ -n "$REST" ] && [ -z "$(after_second)" ] && is_keyword "$(second_word)"; then
    MODE=$(second_word)
  elif [ -d "$TEAMS_DIR/$TEAM_NAME" ]; then
    MODE="status"
  else
    MODE="install"
  fi
fi

# Validate team name (skip for "default")
if [ "$TEAM_NAME" != "default" ]; then
  validate_name "$TEAM_NAME"
fi

printf 'MODE:%s\n' "$MODE"
printf 'TEAM_NAME:%s\n' "$TEAM_NAME"
[ -n "$PROMPT" ] && printf 'PROMPT:%s\n' "$PROMPT"
# The three metadata scalars every artifact this run writes must carry. Emitted here so the skill
# never has to guess a version or invent a date spelling.
printf 'PLUGIN_VERSION:%s\n' "$PLUGIN_VERSION"
printf 'CONTENT_VERSION:%s\n' "$CONTENT_VERSION"
printf 'GENERATED_BY:brewcode:teams-setup\n'
printf 'LAST_UPDATED:%s\n' "$(date +%F)"

exit 0
