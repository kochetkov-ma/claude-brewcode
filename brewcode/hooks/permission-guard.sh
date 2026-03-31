#!/bin/bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

ALLOW='{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'

# --- Helper: check if a single path is within allowed directories ---
is_allowed_path() {
  local p="$1"
  # Skip global ~/.claude/
  [[ "$p" == "$HOME/.claude/"* || "$p" == "$HOME/.claude" ]] && return 1
  # System temp dirs
  [[ "$p" == /tmp/* || "$p" == /tmp || "$p" == /private/tmp/* || "$p" == /private/tmp ]] && return 0
  # Allowed .claude/ subdirectories (both relative .claude/ and absolute */.claude/)
  case "$p" in
    .claude/tasks/*|.claude/tasks|*/.claude/tasks/*|*/.claude/tasks) return 0 ;;
    .claude/tmp/*|.claude/tmp|*/.claude/tmp/*|*/.claude/tmp) return 0 ;;
    .claude/reports/*|.claude/reports|*/.claude/reports/*|*/.claude/reports) return 0 ;;
    .claude/rules/*|.claude/rules|*/.claude/rules/*|*/.claude/rules) return 0 ;;
    .claude/skills/*|.claude/skills|*/.claude/skills/*|*/.claude/skills) return 0 ;;
    .claude/scripts/*|.claude/scripts|*/.claude/scripts/*|*/.claude/scripts) return 0 ;;
    .claude/agents/*|.claude/agents|*/.claude/agents/*|*/.claude/agents) return 0 ;;
    .claude/hooks/*|.claude/hooks|*/.claude/hooks/*|*/.claude/hooks) return 0 ;;
    .claude/private/*|.claude/private|*/.claude/private/*|*/.claude/private) return 0 ;;
    .claude/convention/*|.claude/convention|*/.claude/convention/*|*/.claude/convention) return 0 ;;
    .claude/plans/*|.claude/plans|*/.claude/plans/*|*/.claude/plans) return 0 ;;
    .claude/settings.json|.claude/settings.local.json|*/.claude/settings.json|*/.claude/settings.local.json) return 0 ;;
    .claude/TASK.md|.claude/CLAUDE.md|*/.claude/TASK.md|*/.claude/CLAUDE.md) return 0 ;;
    *) return 1 ;;
  esac
}

# --- Bash tool handling ---
if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  [[ -z "$CMD" ]] && { echo '{}'; exit 0; }

  # Block network commands unconditionally
  if echo "$CMD" | grep -qE '\b(curl|wget|ssh|scp|rsync|nc|ncat|socat|ftp|sftp)\b'; then
    echo '{}'
    exit 0
  fi

  # Block dangerous redirections / evals
  if echo "$CMD" | grep -qE '(>\s*/dev/|>\s*/etc/|\beval\b|\bexec\b|\bsource\b|\b\.\s+/)'; then
    echo '{}'
    exit 0
  fi

  # For rm: only allow within .claude/tasks/ or .claude/tmp/ or /tmp/
  if echo "$CMD" | grep -qE '\brm\b'; then
    RM_PATHS=$(echo "$CMD" | grep -oE '(\.claude|/tmp|/private/tmp)[^ ]*' || true)
    [[ -z "$RM_PATHS" ]] && { echo '{}'; exit 0; }
    while IFS= read -r rp; do
      case "$rp" in
        .claude/tasks/*|*/.claude/tasks/*) ;;
        .claude/tmp/*|*/.claude/tmp/*) ;;
        /tmp/*|/private/tmp/*) ;;
        *) echo '{}'; exit 0 ;;
      esac
    done <<< "$RM_PATHS"
    echo "$ALLOW"
    exit 0
  fi

  # Extract all path-like tokens that reference .claude/ or temp dirs
  # Match: .claude/..., /abs/path/.claude/..., /tmp/..., /private/tmp/...
  ALL_PATHS=$(echo "$CMD" | grep -oE '(/[^ "'"'"'|;&>]*/?\.claude/[^ "'"'"'|;&>]*|\.claude/[^ "'"'"'|;&>]*|/tmp/[^ "'"'"'|;&>]*|/private/tmp/[^ "'"'"'|;&>]*)' || true)

  # If no .claude/ or temp paths found, not our concern -- don't auto-allow
  [[ -z "$ALL_PATHS" ]] && { echo '{}'; exit 0; }

  # Verify ALL extracted paths are within allowed directories
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if ! is_allowed_path "$path"; then
      echo '{}'
      exit 0
    fi
  done <<< "$ALL_PATHS"

  echo "$ALLOW"
  exit 0
fi

# --- Edit/Write/MultiEdit tool handling (existing logic) ---
if [ -z "$FILE_PATH" ]; then
  echo '{}'
  exit 0
fi

# Skip global ~/.claude/ — only auto-allow project .claude/
if [[ "$FILE_PATH" == "$HOME/.claude/"* ]]; then
  echo '{}'
  exit 0
fi

case "$FILE_PATH" in
  */.claude/tasks/*|*/.claude/tasks)
    echo "$ALLOW" ;;
  */.claude/tmp/*|*/.claude/tmp)
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
  /tmp/*|/private/tmp/*)
    echo "$ALLOW" ;;
  *)
    echo '{}' ;;
esac
