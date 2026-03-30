#!/bin/bash
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

ALLOW='{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'

if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

case "$FILE_PATH" in
  */.claude/tasks/*|*/.claude/tasks)
    echo "$ALLOW" ;;
  */.claude/reports/*|*/.claude/reports)
    echo "$ALLOW" ;;
  */.claude/rules/*|*/.claude/rules)
    echo "$ALLOW" ;;
  */.claude/skills/*|*/.claude/skills)
    echo "$ALLOW" ;;
  */.claude/scripts/*|*/.claude/scripts)
    echo "$ALLOW" ;;
  */.claude/agents/*|*/.claude/agents)
    echo "$ALLOW" ;;
  */.claude/hooks/*|*/.claude/hooks)
    echo "$ALLOW" ;;
  */.claude/private/*|*/.claude/private)
    echo "$ALLOW" ;;
  */.claude/convention/*|*/.claude/convention)
    echo "$ALLOW" ;;
  */.claude/plans/*|*/.claude/plans)
    echo "$ALLOW" ;;
  */.claude/settings.json|*/.claude/settings.local.json)
    echo "$ALLOW" ;;
  */.claude/TASK.md|*/.claude/CLAUDE.md)
    echo "$ALLOW" ;;
  *)
    echo '{}' ;;
esac
