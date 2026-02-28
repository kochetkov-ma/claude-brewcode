#!/bin/sh
# INDEX operations for auto-sync
# Usage: index-ops.sh <command> [args...]
#
# Format: {"p":"path","t":"type","u":"YYYY-MM-DD","pr":"default"}
#   p  = relative path (identity key)
#   t  = type (skill/agent/rule/config/doc)
#   u  = last sync date (YYYY-MM-DD)
#   pr = protocol ("default" or "override")
#
# Commands:
#   read <index_path>                         - Read and validate INDEX
#   add <index_path> <json_entry>             - Add entry from JSON
#   add <index_path> <path> <type> [protocol] - Add entry from positional args (date=today)
#   update <index_path> <path> <field> <val>  - Update entry field by path
#   remove <index_path> <path>                - Remove entry by path
#   stale <index_path> [days]                 - Find stale entries (default: 7)

set -e

CMD="${1:-help}"
shift 2>/dev/null || true

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "X jq is required but not installed" >&2
    echo "  Install: brew install jq" >&2
    exit 1
  fi
}

threshold_date() {
  days="$1"
  if date -v-1d +%Y-%m-%d >/dev/null 2>&1; then
    date -v-"${days}"d +%Y-%m-%d
  else
    date -d "-${days} days" +%Y-%m-%d
  fi
}

cmd_read() {
  index_path="${1:-}"
  if [ -z "$index_path" ]; then
    echo "X Missing index_path" >&2
    echo "Usage: index-ops.sh read <index_path>" >&2
    exit 1
  fi
  if [ ! -f "$index_path" ]; then
    echo "X INDEX not found: $index_path" >&2
    exit 1
  fi
  require_jq
  grep -v "^#" "$index_path" | while IFS= read -r line; do
    if [ -n "$line" ]; then
      echo "$line" | jq -c '.' 2>/dev/null || echo "X Invalid JSON: $line" >&2
    fi
  done
}

cmd_add() {
  index_path="${1:-}"
  arg2="${2:-}"
  arg3="${3:-}"
  arg4="${4:-default}"
  if [ -z "$index_path" ] || [ -z "$arg2" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh add <index_path> <json_entry>" >&2
    echo "       index-ops.sh add <index_path> <path> <type> [protocol]" >&2
    exit 1
  fi
  require_jq
  # Detect format: JSON (starts with {) or positional args
  case "$arg2" in
    \{*)
      # JSON format
      entry="$arg2"
      if ! echo "$entry" | jq -e '.' >/dev/null 2>&1; then
        echo "X Invalid JSON entry" >&2
        exit 1
      fi
      ;;
    *)
      # Positional format: <path> <type> [protocol]
      if [ -z "$arg3" ]; then
        echo "X Missing type argument" >&2
        echo "Usage: index-ops.sh add <index_path> <path> <type> [protocol]" >&2
        exit 1
      fi
      today=$(date +%Y-%m-%d)
      entry=$(jq -nc --arg p "$arg2" --arg t "$arg3" --arg u "$today" --arg pr "$arg4" \
        '{p:$p, t:$t, u:$u, pr:$pr}')
      ;;
  esac
  path=$(echo "$entry" | jq -r '.p')
  if [ -f "$index_path" ] && grep -v "^#" "$index_path" 2>/dev/null | jq -r '.p' 2>/dev/null | grep -qxF "$path"; then
    echo "X Entry already exists: $path" >&2
    echo "  Use 'update' to modify existing entries" >&2
    exit 1
  fi
  echo "$entry" >> "$index_path"
  echo "V Added: $path"
}

cmd_update() {
  # NOTE: read-modify-write is NOT atomic. Callers must invoke sequentially (SKILL.md guarantees this).
  index_path="${1:-}"
  path="${2:-}"
  field="${3:-}"
  value="${4:-}"
  if [ -z "$index_path" ] || [ -z "$path" ] || [ -z "$field" ] || [ -z "$value" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh update <index_path> <path> <field> <value>" >&2
    exit 1
  fi
  case "$field" in
    p|t|u|pr) ;;
    *) echo "X Invalid field: $field (allowed: p, t, u, pr)" >&2; exit 1 ;;
  esac
  require_jq
  tmp_file=$(mktemp)
  trap 'rm -f "$tmp_file"' EXIT
  found=false
  while IFS= read -r line; do
    case "$line" in
      \#*) echo "$line" ;;
      "")  ;; # Empty lines dropped intentionally — JSONL has no empty-line semantics
      *)
        entry_path=$(echo "$line" | jq -r '.p' 2>/dev/null)
        if [ "$entry_path" = "$path" ]; then
          echo "$line" | jq -c --arg v "$value" ".${field} = \$v"
          found=true
        else
          echo "$line"
        fi
        ;;
    esac
  done < "$index_path" > "$tmp_file"
  if [ "$found" = true ]; then
    mv "$tmp_file" "$index_path"
    echo "V Updated: $path.$field = $value"
  else
    rm "$tmp_file"
    echo "X Entry not found: $path" >&2
    exit 1
  fi
}

cmd_remove() {
  index_path="${1:-}"
  path="${2:-}"
  if [ -z "$index_path" ] || [ -z "$path" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh remove <index_path> <path>" >&2
    exit 1
  fi
  require_jq
  tmp_file=$(mktemp)
  trap 'rm -f "$tmp_file"' EXIT
  found=false
  while IFS= read -r line; do
    case "$line" in
      \#*) echo "$line" ;;
      "")  ;; # Empty lines dropped intentionally — JSONL has no empty-line semantics
      *)
        entry_path=$(echo "$line" | jq -r '.p' 2>/dev/null)
        if [ "$entry_path" = "$path" ]; then
          found=true
        else
          echo "$line"
        fi
        ;;
    esac
  done < "$index_path" > "$tmp_file"
  if [ "$found" = true ]; then
    mv "$tmp_file" "$index_path"
    echo "V Removed: $path"
  else
    rm "$tmp_file"
    echo "X Entry not found: $path" >&2
    exit 1
  fi
}

cmd_stale() {
  index_path="${1:-}"
  days="${2:-7}"
  if [ -z "$index_path" ]; then
    echo "X Missing index_path" >&2
    echo "Usage: index-ops.sh stale <index_path> [days]" >&2
    exit 1
  fi
  case "$days" in
    ''|*[!0-9]*) echo "X days must be a positive integer, got: $days" >&2; exit 1 ;;
    0) echo "X days must be > 0, got: 0" >&2; exit 1 ;;
  esac
  if [ ! -f "$index_path" ]; then
    echo "X INDEX not found: $index_path" >&2
    exit 1
  fi
  require_jq
  cutoff=$(threshold_date "$days")
  grep -v "^#" "$index_path" 2>/dev/null | while IFS= read -r line; do
    if [ -n "$line" ]; then
      entry_date=$(echo "$line" | jq -r '.u // empty' 2>/dev/null)
      if [ -z "$entry_date" ]; then
        echo "$line"
      elif expr "$entry_date" \< "$cutoff" > /dev/null 2>&1; then
        echo "$line"
      fi
    fi
  done
}

cmd_help() {
  echo "INDEX operations for auto-sync"
  echo ""
  echo "Usage: index-ops.sh <command> [args...]"
  echo ""
  echo "Format: {\"p\":\"path\",\"t\":\"type\",\"u\":\"YYYY-MM-DD\",\"pr\":\"default\"}"
  echo ""
  echo "Commands:"
  echo "  read <index_path>                         - Read and validate INDEX"
  echo "  add <index_path> <json_entry>             - Add entry from JSON"
  echo "  add <index_path> <path> <type> [protocol] - Add entry (date=today, protocol=default)"
  echo "  update <index_path> <path> <field> <val>  - Update entry field by path"
  echo "  remove <index_path> <path>                - Remove entry by path"
  echo "  stale <index_path> [days]                 - Find stale entries (default: 7)"
  echo ""
  echo "Examples:"
  echo "  index-ops.sh add idx.jsonl '{\"p\":\"file.md\",\"t\":\"doc\",\"u\":\"2026-02-11\",\"pr\":\"default\"}'"
  echo "  index-ops.sh add idx.jsonl file.md doc"
  echo "  index-ops.sh add idx.jsonl file.md skill override"
}

case "$CMD" in
  read)   cmd_read "$@" ;;
  add)    cmd_add "$@" ;;
  update) cmd_update "$@" ;;
  remove) cmd_remove "$@" ;;
  stale)  cmd_stale "$@" ;;
  help|--help|-h)
    cmd_help
    ;;
  *)
    echo "X Unknown command: $CMD" >&2
    cmd_help >&2
    exit 1
    ;;
esac
