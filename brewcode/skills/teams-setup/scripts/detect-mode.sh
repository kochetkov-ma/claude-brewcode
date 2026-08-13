#!/bin/sh
set -eu

ARGS="${1:-}"
TEAMS_DIR=".claude/teams"

# Artifact-metadata standard. The plugin version that produces every artifact this run writes,
# read from the manifest by SELF-LOCATION: scripts/ -> teams-setup/ -> skills/ -> <plugin root>.
# Correct in the dev checkout AND in the installed cache. NEVER hardcoded, never a template version.
# `|| true` on both branches: under `set -e` a failing command substitution aborts the script.
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
# HARD FAIL, never a placeholder value. A word like `unknown` carries no `{}<>`, so setup-status's
# PLACEHLD test cannot catch it: `sort -V` would compare it against the real version and print a
# confident `AHEAD unknown > X.Y.Z`. The manifest ships with the plugin, so an unreadable one is a
# broken install - stop before the skill writes team.md or a single agent. The skill already treats
# any `ERROR:` line as STOP.
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
  if [ -d "$TEAMS_DIR/$TEAM_NAME" ]; then
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
