#!/bin/bash
set -euo pipefail
# grepai Final Verification

echo "=== Final Verification ==="

# Infrastructure
command -v grepai >/dev/null && echo "✅ grepai CLI" || echo "❌ grepai CLI"
curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags >/dev/null && echo "✅ ollama running" || echo "❌ ollama stopped"
ollama list 2>/dev/null | grep -q bge-m3 && echo "✅ bge-m3 model" || echo "❌ bge-m3 missing"
grep -q '"grepai"' ~/.claude.json 2>/dev/null && echo "✅ MCP configured" || echo "❌ MCP missing"
grep -q 'mcp__grepai__' ~/.claude/settings.json 2>/dev/null && echo "✅ Permissions: auto-allowed" || echo "⚠️ Permissions: will prompt"

# Project config
test -d .grepai && echo "✅ .grepai/ directory" || echo "❌ .grepai/ missing"
test -f .grepai/config.yaml && echo "✅ config.yaml" || echo "❌ config.yaml missing"
test -f .grepai/index.gob && echo "✅ index.gob ($(du -h .grepai/index.gob | cut -f1))" || echo "⚠️ index.gob (indexing...)"
test -f .claude/rules/grepai-first.md && echo "✅ grepai-first.md rule" || echo "❌ rule missing"

# Project hooks (self-installed by Phase 6 into the project, not the plugin)
HOOK_DIR=".claude/grepai/hooks"
test -f "$HOOK_DIR/grepai-session.mjs" && echo "✅ hook file: grepai-session.mjs" || echo "⚠️ hook file: grepai-session.mjs missing"
test -f "$HOOK_DIR/grepai-reminder.mjs" && echo "✅ hook file: grepai-reminder.mjs" || echo "⚠️ hook file: grepai-reminder.mjs missing"
grep -q 'grepai-session.mjs' .claude/settings.json 2>/dev/null && echo "✅ hook wired: SessionStart" || echo "⚠️ hook wired: SessionStart missing in .claude/settings.json"
grep -q 'grepai-reminder.mjs' .claude/settings.json 2>/dev/null && echo "✅ hook wired: PreToolUse:Bash" || echo "⚠️ hook wired: PreToolUse:Bash missing in .claude/settings.json"

# Watch status
pgrep -f "grepai watch" >/dev/null && echo "✅ watch running" || echo "⚠️ watch not running"

echo ""
echo "=== Setup Complete ==="
