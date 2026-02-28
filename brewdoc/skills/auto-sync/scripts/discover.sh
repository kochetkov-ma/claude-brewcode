#!/bin/sh
# Discovers files with auto-sync enabled
# Usage: discover.sh [search_path] [output_format]
#   search_path   - Directory to search (default: .)
#   output_format - paths (default) | json | typed

set -e

SEARCH_PATH="${1:-.}"
OUTPUT_FORMAT="${2:-paths}"
MAX_FILES="${MAX_FILES:-50}"

# Explicit path detection: if path contains rules/, agents/, skills/ - user explicitly requested it
is_explicit_managed_path() {
  case "$SEARCH_PATH" in
    */rules|*/rules/*|*/agents|*/agents/*|*/skills|*/skills/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Build exclusion args for managed directories (only when auto-scanning)
build_exclusions() {
  if is_explicit_managed_path; then
    echo ""  # No exclusions for explicit paths
  else
    # Exclude rules/, agents/, skills/ from auto-scan (only by explicit request)
    echo "-not -path */rules/* -not -path */agents/* -not -path */skills/*"
  fi
}

# Find files with auto-sync: enabled (YAML frontmatter only)
find_autosync_files() {
  _exclusions=$(build_exclusions)
  # shellcheck disable=SC2086
  _all=$(find "$SEARCH_PATH" -name "*.md" \
    -not -path '*/.git/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/.claude/tasks/*' \
    $_exclusions \
    -exec grep -lE '^auto-sync:[[:space:]]*enabled' {} + \
    2>/dev/null | sort -u || true)
  _count=$(echo "$_all" | grep -c . || true)
  if [ "$_count" -gt "$MAX_FILES" ]; then
    echo "WARN: found $_count files, capped to $MAX_FILES (set MAX_FILES to override)" >&2
    echo "$_all" | head -n "$MAX_FILES"
  else
    echo "$_all"
  fi
}

# Detect type from file path
detect_type() {
  _path="$1"
  _base=$(basename "$_path")

  if [ "$_base" = "CLAUDE.md" ]; then
    echo "config"
  elif echo "$_path" | grep -qE '(^|/)skills/'; then
    echo "skill"
  elif echo "$_path" | grep -qE '(^|/)agents/'; then
    echo "agent"
  elif echo "$_path" | grep -qE '(^|/)rules/'; then
    echo "rule"
  else
    echo "doc"
  fi
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

# Output as typed (TYPE|PATH per line)
output_typed() {
  FILES=$(find_autosync_files)
  if [ -z "$FILES" ]; then
    return
  fi
  echo "$FILES" | while IFS= read -r file; do
    _type=$(detect_type "$file")
    echo "${_type}|${file}"
  done
}

# Main
case "$OUTPUT_FORMAT" in
  paths)
    output_paths
    ;;
  json)
    output_json
    ;;
  typed)
    output_typed
    ;;
  *)
    echo "Usage: discover.sh [search_path] [output_format]" >&2
    echo "  search_path   - Directory to search (default: .)" >&2
    echo "  output_format - paths (default) | json | typed" >&2
    exit 1
    ;;
esac
