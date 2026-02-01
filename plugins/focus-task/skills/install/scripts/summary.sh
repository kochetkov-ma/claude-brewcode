#!/bin/bash
set -euo pipefail
# Show final installation summary

echo ""
echo "=== Installation Complete ==="
echo ""
echo "| Component | Status | Version |"
echo "|-----------|--------|---------|"

# Required
if command -v brew &>/dev/null; then
    echo "| brew | ✅ | $(brew --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') |"
else
    echo "| brew | ❌ | - |"
fi

if command -v timeout &>/dev/null; then
    echo "| timeout | ✅ | $(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+') |"
else
    echo "| timeout | ❌ | - |"
fi

if command -v jq &>/dev/null; then
    echo "| jq | ✅ | $(jq --version) |"
else
    echo "| jq | ❌ | - |"
fi

# Optional
if command -v ollama &>/dev/null; then
    echo "| ollama | ✅ | $(ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') |"
    if curl -s localhost:11434/api/tags &>/dev/null; then
        echo "| ollama svc | ✅ | running |"
    else
        echo "| ollama svc | ⚠️ | stopped |"
    fi
else
    echo "| ollama | - | skipped |"
fi

if ollama list 2>/dev/null | grep -q bge-m3; then
    echo "| bge-m3 | ✅ | installed |"
else
    echo "| bge-m3 | - | skipped |"
fi

if command -v grepai &>/dev/null; then
    echo "| grepai | ✅ | $(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') |"
else
    echo "| grepai | - | skipped |"
fi
