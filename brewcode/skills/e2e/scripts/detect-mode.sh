#!/bin/sh
set -eu

ARGS="${1:-}"

# Artifact-metadata standard. The plugin version that produces every artifact this run writes,
# read from the manifest by SELF-LOCATION: scripts/ -> e2e/ -> skills/ -> <plugin root>.
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
# confident `AHEAD unknown > X.Y.Z`, and an artifact stamped that way can never clear its own
# staleness. Emitting the raw `{PLUGIN_VERSION}` token instead would only defer the failure until
# after the artifact is on disk. The manifest ships with the plugin, so an unreadable one is a broken
# install - stop before install/rules writes config.json, the rules file or a single agent. Every
# mode goes through this one script and the skill treats any `ERROR:` line as STOP, status included:
# a status run that cannot name the running version has nothing to compare a stamp against.
case "$PLUGIN_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve plugin version (X.Y.Z) from %s - refusing to stamp artifacts with a fake version\n' "$PLUGIN_JSON"; exit 1 ;;
esac

# content_version - self-located from this skill's own SKILL.md brewcode-meta marker, the same
# way docsync-setup and agent-deadline-setup resolve it. Stamped by bump-version.sh at release;
# never the running PLUGIN_VERSION, which would defeat the whole point of a separate counter.
SKILL_MD="$SCRIPT_DIR/../SKILL.md"
CONTENT_VERSION=""
if [ -f "$SKILL_MD" ]; then
  CONTENT_VERSION=$(grep -m1 'brewcode-meta:' "$SKILL_MD" 2>/dev/null | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' || true)
fi
case "$CONTENT_VERSION" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve content_version (X.Y.Z) from %s - refusing to stamp artifacts with a fake version\n' "$SKILL_MD"; exit 1 ;;
esac

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
# The three metadata scalars every artifact this run writes must carry. Emitted here so the skill
# never has to guess a version or invent a date spelling.
printf 'PLUGIN_VERSION:%s\n' "$PLUGIN_VERSION"
printf 'CONTENT_VERSION:%s\n' "$CONTENT_VERSION"
printf 'GENERATED_BY:brewcode:e2e\n'
printf 'LAST_UPDATED:%s\n' "$(date +%F)"

exit 0
