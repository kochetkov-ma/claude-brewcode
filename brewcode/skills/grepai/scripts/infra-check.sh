#!/bin/bash
set -euo pipefail
# grepai Infrastructure Check

echo "=== Infrastructure Check ==="

ERRORS=0

# grepai CLI
if command -v grepai >/dev/null 2>&1; then
  echo "✅ grepai: $(grepai version 2>/dev/null || echo 'installed')"
else
  echo "❌ grepai: NOT FOUND"
  echo "   Install: brew install yoanbernabeu/tap/grepai"
  ERRORS=$((ERRORS + 1))
fi

# Ollama
if curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags >/dev/null 2>&1; then
  echo "✅ ollama: running"
else
  echo "❌ ollama: not running"
  echo "   Install: brew install ollama && brew services start ollama"
  ERRORS=$((ERRORS + 1))
fi

# bge-m3 model
if ollama list 2>/dev/null | grep -q bge-m3; then
  echo "✅ bge-m3: installed"
else
  echo "❌ bge-m3: not installed"
  echo "   Install: ollama pull bge-m3"
  ERRORS=$((ERRORS + 1))
fi

exit $ERRORS
