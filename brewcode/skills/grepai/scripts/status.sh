#!/bin/bash
set -euo pipefail
# grepai Status Check

echo "=== grepai Status ==="
echo ""

echo "--- Infrastructure ---"
if command -v grepai &>/dev/null; then
  CURRENT=$(grepai version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE 'stable [0-9]+\.[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || true)
  if [ -n "$CURRENT" ] && [ -n "$LATEST" ]; then
    # Compare versions (newer installed = ok, older = update available)
    if [ "$(printf '%s\n' "$LATEST" "$CURRENT" | sort -V | tail -1)" = "$LATEST" ] && [ "$CURRENT" != "$LATEST" ]; then
      echo "⚠️ grepai: v$CURRENT → v$LATEST available — run: /grepai upgrade"
    else
      echo "✅ grepai: v$CURRENT (brew: v$LATEST)"
    fi
  elif [ -n "$CURRENT" ]; then
    echo "✅ grepai: v$CURRENT"
  else
    echo "✅ grepai: installed"
  fi
else
  echo "❌ grepai: NOT FOUND"
fi
curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags >/dev/null && echo "✅ ollama: running" || echo "❌ ollama: stopped"
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
  # Check if actively indexing (recent log activity)
  if [ -f .grepai/logs/grepai-watch.log ]; then
    LAST_LOG=$(tail -1 .grepai/logs/grepai-watch.log 2>/dev/null | head -c 100)
    if echo "$LAST_LOG" | grep -qiE "index|embed|chunk"; then
      echo "   ⏳ indexing in progress..."
      echo "   last: $(echo "$LAST_LOG" | cut -c1-60)..."
    fi
  fi
else
  echo "⚠️ watch: not running"
fi

echo ""
echo "--- Integration ---"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP: configured" || echo "❌ MCP: not configured"
grep -q 'mcp__grepai__' ~/.claude/settings.json 2>/dev/null && echo "✅ Permissions: auto-allowed" || echo "⚠️ Permissions: will prompt (run /grepai setup)"
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
