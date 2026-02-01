#!/bin/bash
set -euo pipefail
# Install semantic search components: ollama, bge-m3, grepai

echo "=== Installing Semantic Search ==="

# 1. ollama
echo ""
echo "--- ollama ---"
if ! command -v ollama &>/dev/null; then
    echo "Installing ollama..."
    brew install ollama
    if command -v ollama &>/dev/null; then
        echo "✅ ollama: installed"
    else
        echo "❌ ollama: FAILED"
        exit 1
    fi
else
    echo "✅ ollama: $(ollama --version 2>&1 | head -1)"
fi

# Start ollama if not running
if command -v ollama &>/dev/null && ! curl -s localhost:11434/api/tags &>/dev/null; then
    echo "Starting ollama service..."
    brew services start ollama 2>/dev/null || (nohup ollama serve &>/dev/null &)
    sleep 3
    if curl -s localhost:11434/api/tags &>/dev/null; then
        echo "✅ ollama: running"
    else
        echo "⚠️ ollama: start manually with 'ollama serve'"
    fi
else
    echo "✅ ollama: already running"
fi

# 2. bge-m3 model
echo ""
echo "--- bge-m3 ---"
if command -v ollama &>/dev/null && curl -s localhost:11434/api/tags &>/dev/null; then
    if ! ollama list 2>/dev/null | grep -q bge-m3; then
        echo "Pulling bge-m3 model (~1.2GB)..."
        ollama pull bge-m3
        echo "✅ bge-m3: installed"
    else
        echo "✅ bge-m3: already installed"
    fi
else
    echo "⚠️ bge-m3: skipped (ollama not running)"
fi

# 3. grepai
echo ""
echo "--- grepai ---"
if ! command -v grepai &>/dev/null; then
    echo "Installing grepai..."
    brew install yoanbernabeu/tap/grepai
    if command -v grepai &>/dev/null; then
        echo "✅ grepai: installed ($(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'))"
    else
        echo "❌ grepai: FAILED"
        exit 1
    fi
else
    CURRENT=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$LATEST" ] && [ "$CURRENT" != "$LATEST" ]; then
        echo "Updating grepai: $CURRENT → $LATEST"
        brew upgrade yoanbernabeu/tap/grepai
        echo "✅ grepai: updated to $(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
    else
        echo "✅ grepai: $CURRENT (latest)"
    fi
fi

echo ""
echo "=== Semantic Search Done ==="
