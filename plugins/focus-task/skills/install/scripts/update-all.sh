#!/bin/bash
set -euo pipefail
# Update all outdated components

echo "=== Updating Components ==="

# Update brew packages
if command -v brew &>/dev/null; then
    echo "Updating brew packages..."
    brew upgrade coreutils 2>/dev/null && echo "✅ coreutils: updated" || echo "⏭️ coreutils: skipped"
    brew upgrade jq 2>/dev/null && echo "✅ jq: updated" || echo "⏭️ jq: skipped"
fi

# Update grepai
if command -v grepai &>/dev/null; then
    CURRENT=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$LATEST" ] && [ "$CURRENT" != "$LATEST" ]; then
        echo "Updating grepai: $CURRENT → $LATEST"
        brew upgrade yoanbernabeu/tap/grepai
        echo "✅ grepai: updated"
    else
        echo "⏭️ grepai: already latest"
    fi
fi

echo ""
echo "✅ Updates complete"
