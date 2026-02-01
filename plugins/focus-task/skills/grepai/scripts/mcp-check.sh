#!/bin/bash
set -euo pipefail
# grepai MCP Configuration Check

echo "=== MCP Check ==="

# Phase 1: Check/Add MCP Server
echo ""
echo "--- MCP Server ---"
if grep -q '"grepai"' ~/.claude.json 2>/dev/null; then
  echo "✅ MCP grepai: already configured"
else
  echo "⚠️ MCP grepai: not configured"
  echo "   Adding via claude CLI..."
  claude mcp add --scope user grepai -- grepai mcp-serve
  if [ $? -eq 0 ]; then
    echo "✅ MCP grepai: added"
  else
    echo "❌ MCP grepai: failed to add"
    exit 1
  fi
fi

# Phase 2: Check/Add allowedTools (prevents [destructive] permission prompts)
echo ""
echo "--- Allowed Tools ---"
SETTINGS_FILE="$HOME/.claude/settings.json"

# Create settings.json if not exists
if [ ! -f "$SETTINGS_FILE" ]; then
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  echo '{}' > "$SETTINGS_FILE"
  echo "   Created $SETTINGS_FILE"
fi

# Check if mcp__grepai__ already allowed
if grep -q 'mcp__grepai__' "$SETTINGS_FILE" 2>/dev/null; then
  echo "✅ allowedTools: mcp__grepai__* already configured"
else
  echo "⚠️ allowedTools: mcp__grepai__* not configured"
  echo "   Adding to $SETTINGS_FILE..."

  # Use jq if available, otherwise use python
  if command -v jq &>/dev/null; then
    # jq approach
    TMP_FILE=$(mktemp)
    trap 'rm -f "$TMP_FILE"' EXIT
    jq '.allowedTools = ((.allowedTools // []) + ["mcp__grepai__*"] | unique)' "$SETTINGS_FILE" > "$TMP_FILE" && mv "$TMP_FILE" "$SETTINGS_FILE"
    jq . "$SETTINGS_FILE" >/dev/null 2>&1 || { echo "❌ Invalid JSON"; exit 1; }
  elif command -v python3 &>/dev/null; then
    # python approach
    SETTINGS_FILE="$SETTINGS_FILE" python3 -c "
import json, os
settings_file = os.environ['SETTINGS_FILE']
with open(settings_file, 'r') as f:
    data = json.load(f)
allowed = data.get('allowedTools', [])
if 'mcp__grepai__*' not in allowed:
    allowed.append('mcp__grepai__*')
data['allowedTools'] = allowed
with open(settings_file, 'w') as f:
    json.dump(data, f, indent=2)
"
    jq . "$SETTINGS_FILE" >/dev/null 2>&1 || { echo "❌ Invalid JSON"; exit 1; }
  else
    echo "❌ Neither jq nor python3 available"
    echo "   Manually add to $SETTINGS_FILE:"
    echo '   {"allowedTools": ["mcp__grepai__*"]}'
    exit 1
  fi

  if grep -q 'mcp__grepai__' "$SETTINGS_FILE" 2>/dev/null; then
    echo "✅ allowedTools: mcp__grepai__* added"
  else
    echo "❌ Failed to add allowedTools"
    exit 1
  fi
fi

echo ""
echo "=== MCP Check Complete ==="
echo "✅ MCP server: configured"
echo "✅ Permissions: auto-allowed (no prompts)"
echo ""
echo "ℹ️  Restart Claude Code to apply MCP changes"
exit 0
