#!/bin/bash
set -euo pipefail
# Check current state of all components

echo "=== focus-task Prerequisites ==="
echo ""
echo "| Component | Status | Version | Type |"
echo "|-----------|--------|---------|------|"

# Required
if command -v brew &>/dev/null; then
    VER=$(brew --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo "| brew | ✅ | $VER | required |"
else
    echo "| brew | ❌ missing | - | required |"
fi

if command -v timeout &>/dev/null; then
    VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    echo "| timeout | ✅ | $VER | required |"
else
    echo "| timeout | ❌ missing | - | required |"
fi

if command -v jq &>/dev/null; then
    VER=$(jq --version 2>&1)
    echo "| jq | ✅ | $VER | required |"
else
    echo "| jq | ❌ missing | - | required |"
fi

# Optional (grepai)
if command -v ollama &>/dev/null; then
    VER=$(ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if curl -s localhost:11434/api/tags &>/dev/null; then
        echo "| ollama | ✅ running | $VER | optional |"
    else
        echo "| ollama | ⚠️ stopped | $VER | optional |"
    fi
else
    echo "| ollama | - | not installed | optional |"
fi

if command -v ollama &>/dev/null && ollama list 2>/dev/null | grep -q bge-m3; then
    echo "| bge-m3 | ✅ | installed | optional |"
else
    echo "| bge-m3 | - | not installed | optional |"
fi

if command -v grepai &>/dev/null; then
    VER=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$LATEST" ] && [ "$VER" != "$LATEST" ]; then
        echo "| grepai | ⚠️ outdated | $VER → $LATEST | optional |"
    else
        echo "| grepai | ✅ | $VER | optional |"
    fi
else
    echo "| grepai | - | not installed | optional |"
fi
