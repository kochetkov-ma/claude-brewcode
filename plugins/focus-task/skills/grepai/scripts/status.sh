#!/bin/bash
# grepai Status Check

echo "=== grepai Status ==="
echo ""

echo "--- Infrastructure ---"
which grepai >/dev/null && echo "✅ grepai: $(grepai --version 2>/dev/null || echo 'installed')" || echo "❌ grepai: NOT FOUND"
curl -s localhost:11434/api/tags >/dev/null && echo "✅ ollama: running" || echo "❌ ollama: stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3: installed" || echo "❌ bge-m3: missing"

echo ""
echo "--- Project ---"
test -d .grepai && echo "✅ .grepai/: exists" || echo "❌ .grepai/: missing"
test -f .grepai/config.yaml && echo "✅ config.yaml: exists" || echo "❌ config.yaml: missing"
test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob 2>/dev/null | cut -f1)" || echo "⚠️ index.gob: missing"

echo ""
echo "--- Watch ---"
if pgrep -f "grepai watch" >/dev/null; then
  echo "✅ watch: running (PID: $(pgrep -f 'grepai watch'))"
else
  echo "⚠️ watch: not running"
fi

echo ""
echo "--- Integration ---"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP: configured" || echo "❌ MCP: not configured"
test -f .claude/rules/grepai-first.md && echo "✅ rule: grepai-first.md" || echo "⚠️ rule: missing"

echo ""
echo "--- Hook ---"
# Self-location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
test -f "$PLUGIN_ROOT/hooks/grepai-session.mjs" && echo "✅ hook: built-in (plugin)" || echo "⚠️ hook: missing in plugin"

echo ""
echo "--- MCP Tools ---"
if grep -q '"grepai"' ~/.claude.json 2>/dev/null; then
  echo "Available: grepai_search, grepai_trace_callers, grepai_trace_callees, grepai_trace_graph, grepai_index_status"
fi
