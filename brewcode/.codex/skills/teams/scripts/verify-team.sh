#!/bin/sh
set -eu

TEAM_NAME="${1:-}"
if [ -z "$TEAM_NAME" ]; then
  echo "Usage: verify-team.sh <team-name>"
  exit 1
fi

TEAM_DIR=".codex/teams/$TEAM_NAME"
FAIL=0

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

check_dir() {
  printf "CHECK: %s ... " "$1"
  if [ -d "$2" ]; then
    echo "OK"
  else
    echo "MISSING"
    FAIL=1
  fi
}

check_file() {
  printf "CHECK: %s ... " "$1"
  if [ -f "$2" ]; then
    echo "OK"
  else
    echo "MISSING"
    FAIL=1
  fi
}

check_dir "teams dir" "$TEAM_DIR"
check_file "team.md" "$TEAM_DIR/team.md"
check_file "trace.jsonl" "$TEAM_DIR/trace.jsonl"

if [ ! -f "$TEAM_DIR/trace.jsonl" ]; then
  for old_file in tracking.md issues.md insights.md; do
    if [ -f "$TEAM_DIR/$old_file" ]; then
      echo "MIGRATE: old $old_file found without trace.jsonl. Run: trace-ops.sh migrate $TEAM_DIR"
      break
    fi
  done
fi

if [ -f "$TEAM_DIR/team.md" ]; then
  in_agents=0
  past_header=0
  found_agents=0
  found_intent_guard=0
  while IFS= read -r line; do
    case "$line" in
      "## Agents"*) in_agents=1; past_header=0; continue ;;
      "## "*) [ "$in_agents" -eq 1 ] && break ;;
    esac
    [ "$in_agents" -eq 0 ] && continue
    case "$line" in
      "|"*"---|"*) past_header=1; continue ;;
      "|"*)
        [ "$past_header" -eq 0 ] && continue
        found_agents=1
        agent=$(printf '%s' "$line" | cut -d'|' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/`//g')
        [ -z "$agent" ] && continue
        [ "$agent" = "intent-guard" ] && found_intent_guard=1
        printf "CHECK: agent %s ... " "$agent"
        if [ -f ".codex/agents/${agent}.toml" ]; then
          echo "OK"
        else
          echo "MISSING"
          FAIL=1
        fi
        ;;
    esac
  done < "$TEAM_DIR/team.md"
  if [ "$in_agents" -eq 1 ] && [ "$found_agents" -eq 0 ]; then
    echo "WARN: no agents found in table"
  fi
  if [ "$in_agents" -eq 0 ]; then
    echo "WARN: no ## Agents section in team.md"
  fi
  # intent-guard is a fixed review-only member of every team, outside the domain-agent count.
  # Teams created before it existed simply lack the row -- warn with the fix, never fail them.
  # Teams that DO list it are covered by the per-agent -f check above.
  if [ "$found_intent_guard" -eq 0 ]; then
    echo "WARN: team.md has no intent-guard row (team predates it). Fix:"
    echo "      bash \"$SCRIPT_DIR/../../superreview/scripts/generate.sh\" emit-agent"
    echo "      then add to the ## Agents table: | intent-guard | -- | Anti-drift check: what was ASKED vs what was DELIVERED | active | <date> | review-only |"
  fi
fi

if [ "$FAIL" -eq 0 ]; then
  echo "VERIFY: PASS"
  exit 0
else
  echo "VERIFY: FAIL"
  exit 1
fi
