#!/bin/sh
set -eu

TEAM_NAME="${1:-}"
if [ -z "$TEAM_NAME" ]; then
  echo "Usage: verify-team.sh <team-name>"
  exit 1
fi

TEAM_DIR=".claude/teams/$TEAM_NAME"
FAIL=0

check() {
  label="$1"
  path="$2"
  printf "CHECK: %s ... " "$label"
  if [ -e "$path" ]; then
    echo "OK"
  else
    echo "MISSING"
    FAIL=1
  fi
}

check "teams dir" "$TEAM_DIR"
check "team.md" "$TEAM_DIR/team.md"
check "trace.jsonl" "$TEAM_DIR/trace.jsonl"

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
        printf "CHECK: agent %s ... " "$agent"
        if [ -f ".claude/agents/${agent}.md" ]; then
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
fi

if [ "$FAIL" -eq 0 ]; then
  echo "VERIFY: PASS"
  exit 0
else
  echo "VERIFY: FAIL"
  exit 1
fi
