#!/bin/sh
# Detects auto-sync mode from arguments
# Usage: detect-mode.sh "$@"
# Output: MODE|ARG (e.g., "STATUS|" or "PROJECT|")
#
# Modes:
#   STATUS|              - "status"
#   INIT|<path>          - "init <path> [prompt]"
#   GLOBAL|              - "global"
#   PROJECT|             - empty args
#   FILE|<path>          - single file path (*.md)
#   FOLDER|<path>        - folder path

set -e

# Join all arguments
ARGS="$*"

# Normalize: lowercase, trim whitespace
ARGS_LOWER=$(echo "$ARGS" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# Empty args = PROJECT mode
if [ -z "$ARGS_LOWER" ]; then
  echo "PROJECT|"
  exit 0
fi

# Check for "status"
if [ "$ARGS_LOWER" = "status" ]; then
  echo "STATUS|"
  exit 0
fi

# Check for bare "init" without arguments
if [ "$ARGS_LOWER" = "init" ]; then
  echo "ERROR|init requires a path argument" >&2
  exit 1
fi

# Check for "init <path>"
if echo "$ARGS_LOWER" | grep -qE '^init[[:space:]]+'; then
  INIT_ARGS=$(echo "$ARGS" | sed -E 's/^[^[:space:]]+[[:space:]]+//')
  echo "INIT|$INIT_ARGS"
  exit 0
fi

# Check for "global"
if [ "$ARGS_LOWER" = "global" ]; then
  echo "GLOBAL|"
  exit 0
fi

# Check if it's a file path (ends with .md)
if echo "$ARGS" | grep -qE '\.md$'; then
  echo "FILE|$ARGS"
  exit 0
fi

# Check if it's a folder path
if [ -d "$ARGS" ]; then
  echo "FOLDER|$ARGS"
  exit 0
fi

# Check if path looks like a folder (contains / but no .md)
if echo "$ARGS" | grep -qE '^[./~]' && ! echo "$ARGS" | grep -qE '\.md$'; then
  echo "FOLDER|$ARGS"
  exit 0
fi

# Default: treat as PROJECT mode with the args as context
echo "PROJECT|$ARGS"
