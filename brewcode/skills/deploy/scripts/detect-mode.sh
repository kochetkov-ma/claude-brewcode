#!/bin/bash
set -euo pipefail
# Detect deploy skill mode from arguments
# Usage: detect-mode.sh "$ARGUMENTS"
# Output: ARGS and MODE for parsing

ARGS="${1:-}"
# Trim whitespace
ARGS=$(echo "$ARGS" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
ARGS_LOWER=$(echo "$ARGS" | tr '[:upper:]' '[:lower:]')

echo "ARGS: [$ARGS]"

MODE=""

# Check keywords (order matters - first match wins)
if [[ "$ARGS_LOWER" =~ (monitor|watch|status|check[[:space:]]+runs|logs) ]]; then
    MODE="monitor"
elif [[ "$ARGS_LOWER" =~ (set[[:space:]]*up|setup|check|prerequisites|init) ]]; then
    MODE="setup"
elif [[ "$ARGS_LOWER" =~ (create|new[[:space:]]+workflow|add[[:space:]]+workflow) ]]; then
    MODE="create"
elif [[ "$ARGS_LOWER" =~ (release|bump|version|tag|publish) ]]; then
    MODE="release"
elif [[ "$ARGS_LOWER" =~ (deploy|trigger|dispatch|run[[:space:]]+workflow) ]]; then
    MODE="deploy"
elif [[ "$ARGS_LOWER" =~ (update[[:space:]]+agent|refresh|rescan) ]]; then
    MODE="update-agent"
elif [[ -z "$ARGS" ]]; then
    # No arguments - check if GitHub config exists
    if [[ -f "CLAUDE.local.md" ]] && grep -q "^## GitHub Config" "CLAUDE.local.md" 2>/dev/null; then
        MODE="monitor"
    else
        MODE="setup"
    fi
else
    # Has args but no keyword match - treat as deploy (run/trigger something)
    MODE="deploy"
fi

echo "MODE: $MODE"
