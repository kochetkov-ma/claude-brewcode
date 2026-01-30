#!/bin/bash
# grepai MCP Configuration Check

echo "=== MCP Check ==="

if grep -q '"grepai"' ~/.claude.json 2>/dev/null; then
  echo "✅ MCP grepai: already configured"
  exit 0
else
  echo "⚠️ MCP grepai: not configured"
  echo "   Adding via claude CLI..."
  claude mcp add --scope user grepai -- grepai mcp-serve
  if [ $? -eq 0 ]; then
    echo "✅ MCP grepai: added"
    exit 0
  else
    echo "❌ MCP grepai: failed to add"
    exit 1
  fi
fi
