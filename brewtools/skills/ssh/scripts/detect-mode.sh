#!/bin/bash
set -euo pipefail
# Detect SSH skill mode from arguments
# Usage: detect-mode.sh "$ARGUMENTS"
# Output: ARGS and MODE for parsing

ARGS="${1:-}"
# Trim whitespace
ARGS=$(echo "$ARGS" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
ARGS_LOWER=$(echo "$ARGS" | tr '[:upper:]' '[:lower:]')

echo "ARGS: [$ARGS]"

MODE=""

# Check keywords (order matters - first match wins)
if [[ "$ARGS_LOWER" =~ (set[[:space:]]*up|setup|new[[:space:]]+server|add[[:space:]]+server) ]]; then
    MODE="setup"
elif [[ "$ARGS_LOWER" =~ (connect\ to|ssh\ to|login\ to|connect) ]]; then
    MODE="connect"
elif [[ "$ARGS_LOWER" =~ (configure|config|harden) ]]; then
    MODE="configure"
elif [[ "$ARGS_LOWER" =~ (update\ agent|refresh\ agent|refresh) ]]; then
    MODE="update-agent"
elif [[ -z "$ARGS" ]]; then
    # No arguments - check if servers are configured
    if [[ -f "CLAUDE.local.md" ]] && grep -q "^|.*|.*|.*|.*|.*|" "CLAUDE.local.md" 2>/dev/null; then
        MODE="execute"
    else
        MODE="setup"
    fi
else
    # Has args but no keyword match - treat as execute (run command/task on server)
    MODE="execute"
fi

echo "MODE: $MODE"
