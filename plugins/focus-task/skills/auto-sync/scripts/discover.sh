#!/bin/sh
# Discovers files with auto-sync enabled
# Usage: discover.sh [search_path] [output_format]
#   search_path   - Directory to search (default: current directory)
#   output_format - paths (default) | json

set -e

SEARCH_PATH="${1:-.}"
OUTPUT_FORMAT="${2:-paths}"

# Find files with auto-sync: enabled (YAML frontmatter) or auto-sync:enabled (HTML comment)
find_autosync_files() {
  # Search for both patterns using grep
  # Pattern 1: YAML frontmatter - auto-sync: enabled
  # Pattern 2: HTML comment - <!-- auto-sync:enabled -->
  grep -rl -E '(^auto-sync:\s*enabled|<!--\s*auto-sync:enabled)' "$SEARCH_PATH" \
    --include="*.md" \
    2>/dev/null | sort -u || true
}

# Output as paths (one per line)
output_paths() {
  find_autosync_files
}

# Output as JSON array
output_json() {
  FILES=$(find_autosync_files)
  if [ -z "$FILES" ]; then
    echo "[]"
    return
  fi
  echo "["
  echo "$FILES" | sed 's/.*/  "&"/' | sed '$!s/$/,/'
  echo "]"
}

# Main
case "$OUTPUT_FORMAT" in
  paths)
    output_paths
    ;;
  json)
    output_json
    ;;
  *)
    echo "Usage: discover.sh [search_path] [output_format]" >&2
    echo "  search_path   - Directory to search (default: .)" >&2
    echo "  output_format - paths (default) | json" >&2
    exit 1
    ;;
esac
