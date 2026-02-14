#!/bin/bash
set -euo pipefail
# Detect grepai mode from arguments
# Usage: detect-mode.sh "$ARGUMENTS"
# Output: ARGS and MODE for debugging

ARGS="${1:-}"
ARGS_LOWER=$(echo "$ARGS" | tr '[:upper:]' '[:lower:]')

# Debug output
echo "ARGS: [$ARGS]"

# Determine mode
MODE=""

# Check keywords (order matters - first match wins)
if [[ "$ARGS_LOWER" =~ (upgrade|апгрейд) ]]; then
    MODE="upgrade"
elif [[ "$ARGS_LOWER" =~ (optimize|update|улучши|обнови) ]]; then
    MODE="optimize"
elif [[ "$ARGS_LOWER" =~ (stop|halt|kill) ]]; then
    MODE="stop"
elif [[ "$ARGS_LOWER" =~ (start|watch) ]]; then
    MODE="start"
elif [[ "$ARGS_LOWER" =~ (status|doctor|check|health) ]]; then
    MODE="status"
elif [[ "$ARGS_LOWER" =~ (setup|configure|init) ]]; then
    MODE="setup"
elif [[ "$ARGS_LOWER" =~ (reindex|rebuild|refresh) ]]; then
    MODE="reindex"
elif [[ -z "$ARGS" ]]; then
    # No arguments - check filesystem
    if [[ -d ".grepai" ]]; then
        MODE="start"
    else
        MODE="setup"
    fi
else
    # Has args but no keyword match
    MODE="prompt"
fi

echo "MODE: $MODE"
