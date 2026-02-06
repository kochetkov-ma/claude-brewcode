#!/bin/sh
# INDEX operations for auto-sync
# Usage: index-ops.sh <command> [args...]
#
# Commands:
#   read <index_path>                         - Read and validate INDEX
#   add <index_path> <json_entry>             - Add entry to INDEX
#   update <index_path> <path> <field> <val>  - Update entry field
#   remove <index_path> <path>                - Remove entry by path
#   query <index_path> <field> <value>        - Query entries
#   check-stale <index_path> [days]           - Find stale entries (default: 7 days)
#   hash <file_path>                          - Get SHA256[:8] of file
#   mtime <file_path>                         - Get mtime as Unix epoch

set -e

CMD="${1:-help}"
shift 2>/dev/null || true

# Validate jq is available
require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "X jq is required but not installed" >&2
    echo "  Install: brew install jq" >&2
    exit 1
  fi
}

# Read and validate INDEX file
cmd_read() {
  local index_path="$1"
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
  # Filter comments and validate JSON
  grep -v "^#" "$index_path" | while IFS= read -r line; do
    if [ -n "$line" ]; then
      echo "$line" | jq -c '.' 2>/dev/null || echo "X Invalid JSON: $line" >&2
    fi
  done
}

# Add entry to INDEX
cmd_add() {
  local index_path="$1"
  local entry="$2"
  if [ -z "$index_path" ] || [ -z "$entry" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh add <index_path> <json_entry>" >&2
    exit 1
  fi
  require_jq
  # Validate entry is valid JSON
  if ! echo "$entry" | jq -e '.' >/dev/null 2>&1; then
    echo "X Invalid JSON entry" >&2
    exit 1
  fi
  # Check if path already exists
  local path
  path=$(echo "$entry" | jq -r '.p')
  if grep -v "^#" "$index_path" 2>/dev/null | jq -r '.p' 2>/dev/null | grep -qx "$path"; then
    echo "X Entry already exists: $path" >&2
    echo "  Use 'update' to modify existing entries" >&2
    exit 1
  fi
  # Append entry
  echo "$entry" >> "$index_path"
  echo "V Added: $path"
}

# Update entry field
cmd_update() {
  local index_path="$1"
  local path="$2"
  local field="$3"
  local value="$4"
  if [ -z "$index_path" ] || [ -z "$path" ] || [ -z "$field" ] || [ -z "$value" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh update <index_path> <path> <field> <value>" >&2
    exit 1
  fi
  require_jq
  local tmp_file
  tmp_file=$(mktemp)
  local found=false
  while IFS= read -r line; do
    if echo "$line" | grep -q "^#"; then
      echo "$line"
    elif [ -n "$line" ]; then
      local entry_path
      entry_path=$(echo "$line" | jq -r '.p' 2>/dev/null)
      if [ "$entry_path" = "$path" ]; then
        echo "$line" | jq -c ".$field = \"$value\""
        found=true
      else
        echo "$line"
      fi
    fi
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

# Remove entry by path
cmd_remove() {
  local index_path="$1"
  local path="$2"
  if [ -z "$index_path" ] || [ -z "$path" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh remove <index_path> <path>" >&2
    exit 1
  fi
  require_jq
  local tmp_file
  tmp_file=$(mktemp)
  local found=false
  while IFS= read -r line; do
    if echo "$line" | grep -q "^#"; then
      echo "$line"
    elif [ -n "$line" ]; then
      local entry_path
      entry_path=$(echo "$line" | jq -r '.p' 2>/dev/null)
      if [ "$entry_path" = "$path" ]; then
        found=true
      else
        echo "$line"
      fi
    fi
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

# Query entries by field value
cmd_query() {
  local index_path="$1"
  local field="$2"
  local value="$3"
  if [ -z "$index_path" ] || [ -z "$field" ] || [ -z "$value" ]; then
    echo "X Missing arguments" >&2
    echo "Usage: index-ops.sh query <index_path> <field> <value>" >&2
    exit 1
  fi
  require_jq
  grep -v "^#" "$index_path" 2>/dev/null | while IFS= read -r line; do
    if [ -n "$line" ]; then
      local entry_value
      entry_value=$(echo "$line" | jq -r ".$field" 2>/dev/null)
      if [ "$entry_value" = "$value" ]; then
        echo "$line"
      fi
    fi
  done
}

# Find stale entries
cmd_check_stale() {
  local index_path="$1"
  local days="${2:-7}"
  if [ -z "$index_path" ]; then
    echo "X Missing index_path" >&2
    echo "Usage: index-ops.sh check-stale <index_path> [days]" >&2
    exit 1
  fi
  require_jq
  local threshold
  threshold=$(($(date +%s) - days * 86400))
  grep -v "^#" "$index_path" 2>/dev/null | while IFS= read -r line; do
    if [ -n "$line" ]; then
      local mtime
      mtime=$(echo "$line" | jq -r '.m' 2>/dev/null)
      if [ "$mtime" -lt "$threshold" ] 2>/dev/null; then
        echo "$line"
      fi
    fi
  done
}

# Get SHA256[:8] hash of file
cmd_hash() {
  local file_path="$1"
  if [ -z "$file_path" ]; then
    echo "X Missing file_path" >&2
    echo "Usage: index-ops.sh hash <file_path>" >&2
    exit 1
  fi
  if [ ! -f "$file_path" ]; then
    echo "X File not found: $file_path" >&2
    exit 1
  fi
  # Use shasum on macOS, sha256sum on Linux
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | cut -c1-8
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | cut -c1-8
  else
    echo "X No SHA256 tool available" >&2
    exit 1
  fi
}

# Get mtime as Unix epoch
cmd_mtime() {
  local file_path="$1"
  if [ -z "$file_path" ]; then
    echo "X Missing file_path" >&2
    echo "Usage: index-ops.sh mtime <file_path>" >&2
    exit 1
  fi
  if [ ! -f "$file_path" ]; then
    echo "X File not found: $file_path" >&2
    exit 1
  fi
  # Use stat with appropriate flags for macOS vs Linux
  if stat -f %m "$file_path" 2>/dev/null; then
    : # macOS
  elif stat -c %Y "$file_path" 2>/dev/null; then
    : # Linux
  else
    echo "X Could not get mtime" >&2
    exit 1
  fi
}

# Help
cmd_help() {
  echo "INDEX operations for auto-sync"
  echo ""
  echo "Usage: index-ops.sh <command> [args...]"
  echo ""
  echo "Commands:"
  echo "  read <index_path>                         - Read and validate INDEX"
  echo "  add <index_path> <json_entry>             - Add entry to INDEX"
  echo "  update <index_path> <path> <field> <val>  - Update entry field"
  echo "  remove <index_path> <path>                - Remove entry by path"
  echo "  query <index_path> <field> <value>        - Query entries"
  echo "  check-stale <index_path> [days]           - Find stale entries (default: 7)"
  echo "  hash <file_path>                          - Get SHA256[:8] of file"
  echo "  mtime <file_path>                         - Get mtime as Unix epoch"
}

# Main dispatch
case "$CMD" in
  read)       cmd_read "$@" ;;
  add)        cmd_add "$@" ;;
  update)     cmd_update "$@" ;;
  remove)     cmd_remove "$@" ;;
  query)      cmd_query "$@" ;;
  check-stale) cmd_check_stale "$@" ;;
  hash)       cmd_hash "$@" ;;
  mtime)      cmd_mtime "$@" ;;
  help|--help|-h)
    cmd_help
    ;;
  *)
    echo "X Unknown command: $CMD" >&2
    cmd_help >&2
    exit 1
    ;;
esac
