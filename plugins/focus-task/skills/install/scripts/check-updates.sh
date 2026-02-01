#!/bin/bash
set -euo pipefail
# Check for available updates

UPDATES=""

# Check brew packages
if command -v brew &>/dev/null; then
    OUTDATED=$(brew outdated --quiet 2>/dev/null | grep -E "^(coreutils|jq)$" || true)
    [ -n "$OUTDATED" ] && UPDATES="$UPDATES $OUTDATED"
fi

# Check grepai
if command -v grepai &>/dev/null; then
    CURRENT=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$LATEST" ] && [ "$CURRENT" != "$LATEST" ]; then
        UPDATES="$UPDATES grepai($CURRENT→$LATEST)"
    fi
fi

# Output
UPDATES=$(echo "$UPDATES" | xargs)  # trim whitespace
if [ -n "$UPDATES" ]; then
    echo "UPDATES_AVAILABLE=true"
    echo "UPDATES=$UPDATES"
else
    echo "UPDATES_AVAILABLE=false"
fi
