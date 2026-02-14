#!/bin/sh
# Detects auto-sync mode from arguments
# Usage: detect-mode.sh "$@"
# Output: MODE|ARG|FLAGS (e.g., "STATUS||" or "PROJECT||optimize")
#
# Modes:
#   STATUS||[flags]          - "status"
#   INIT|<path>|[flags]      - "init <path> [prompt]"
#   GLOBAL||[flags]          - "global"
#   PROJECT||[flags]         - empty args
#   FILE|<path>|[flags]      - single file path (*.md)
#   FOLDER|<path>|[flags]    - folder path
#
# Flags:
#   -o, --optimize           - Enable optimization (adds "optimize" to FLAGS)

set -e

# --- Phase 1: Extract flags from arguments ---

FLAGS=""
CLEAN_ARGS=""

for arg in "$@"; do
  case "$arg" in
    -o|--optimize)
      FLAGS="optimize"
      ;;
    *)
      if [ -z "$CLEAN_ARGS" ]; then
        CLEAN_ARGS="$arg"
      else
        CLEAN_ARGS="$CLEAN_ARGS $arg"
      fi
      ;;
  esac
done

# --- Phase 2: Detect mode from cleaned arguments ---

# Normalize: lowercase, trim whitespace
ARGS_LOWER=$(echo "$CLEAN_ARGS" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# Empty args = PROJECT mode
if [ -z "$ARGS_LOWER" ]; then
  echo "PROJECT||$FLAGS"
  exit 0
fi

# Check for "status"
if [ "$ARGS_LOWER" = "status" ]; then
  echo "STATUS||$FLAGS"
  exit 0
fi

# Check for bare "init" without arguments
if [ "$ARGS_LOWER" = "init" ]; then
  echo "ERROR|init requires a path argument|$FLAGS" >&2
  exit 1
fi

# Check for "init <path>"
if echo "$ARGS_LOWER" | grep -qE '^init[[:space:]]+'; then
  INIT_ARGS=$(echo "$CLEAN_ARGS" | sed 's/^[^[:space:]][^[:space:]]*[[:space:]][[:space:]]*//')
  echo "INIT|$INIT_ARGS|$FLAGS"
  exit 0
fi

# Check for "global"
if [ "$ARGS_LOWER" = "global" ]; then
  echo "GLOBAL||$FLAGS"
  exit 0
fi

# Check if it's a file path (ends with .md)
if echo "$CLEAN_ARGS" | grep -qE '\.md$'; then
  echo "FILE|$CLEAN_ARGS|$FLAGS"
  exit 0
fi

# Check if it's a folder path
if [ -d "$CLEAN_ARGS" ]; then
  echo "FOLDER|$CLEAN_ARGS|$FLAGS"
  exit 0
fi

# Check if path looks like a folder (contains / but no .md)
if echo "$CLEAN_ARGS" | grep -qE '^[./~]' && ! echo "$CLEAN_ARGS" | grep -qE '\.md$'; then
  echo "FOLDER|$CLEAN_ARGS|$FLAGS"
  exit 0
fi

# Default: treat as PROJECT mode with the args as context
echo "WARN: unrecognized argument '$CLEAN_ARGS', defaulting to PROJECT mode" >&2
echo "PROJECT|$CLEAN_ARGS|$FLAGS"
