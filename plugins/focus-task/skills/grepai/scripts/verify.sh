#!/bin/bash
# grepai Final Verification

echo "=== Final Verification ==="

# Infrastructure
which grepai >/dev/null && echo "✅ grepai CLI" || echo "❌ grepai CLI"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama running" || echo "❌ ollama stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3 model" || echo "❌ bge-m3 missing"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP configured" || echo "❌ MCP missing"
grep -q 'mcp__grepai__' ~/.claude/settings.json 2>/dev/null && echo "✅ Permissions: auto-allowed" || echo "⚠️ Permissions: will prompt"

# Project config
test -d .grepai && echo "✅ .grepai/ directory" || echo "❌ .grepai/ missing"
test -f .grepai/config.yaml && echo "✅ config.yaml" || echo "❌ config.yaml missing"
test -f .grepai/index.gob && echo "✅ index.gob ($(du -h .grepai/index.gob | cut -f1))" || echo "⚠️ index.gob (indexing...)"
test -f .claude/rules/grepai-first.md && echo "✅ grepai-first.md rule" || echo "❌ rule missing"

# Plugin hook (self-location)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
test -f "$PLUGIN_ROOT/hooks/grepai-session.mjs" && echo "✅ hook: built-in (plugin)" || echo "❌ hook: missing in plugin"

# Watch status
pgrep -f "grepai watch" >/dev/null && echo "✅ watch running" || echo "⚠️ watch not running"

echo ""
echo "=== Setup Complete ==="
