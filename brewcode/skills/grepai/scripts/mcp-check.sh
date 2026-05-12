#!/bin/bash
set -euo pipefail
# grepai MCP Configuration Check
# Ensures grepai MCP is registered AND alwaysLoad=true (CC 2.1.115+)
# Falls back to JSON patching if --always-load flag unsupported.

echo "=== MCP Check ==="

CLAUDE_JSON="$HOME/.claude.json"
TMP_FILE=""
TMP_FILE2=""

# Single trap for all temp files (variables can be empty/unset - rm -f is safe)
trap 'rm -f "${TMP_FILE:-}" "${TMP_FILE2:-}"' EXIT

# Helper: check if alwaysLoad already true for grepai
already_always_load() {
  command -v jq &>/dev/null || return 1
  [ -f "$CLAUDE_JSON" ] || return 1
  jq -e '.mcpServers.grepai.alwaysLoad == true' "$CLAUDE_JSON" >/dev/null 2>&1
}

# Helper: detect --always-load flag support
supports_always_load() {
  claude mcp add --help 2>&1 | grep -q -- '--always-load'
}

# Helper: backup ~/.claude.json once per invocation if we are about to mutate
backup_claude_json() {
  [ -f "$CLAUDE_JSON" ] || return 0
  local bak
  bak="$CLAUDE_JSON.bak.$(date +%s)"
  cp "$CLAUDE_JSON" "$bak" && echo "   Backup: $bak"
}

# Phase 1: Check/Add MCP Server
echo ""
echo "--- MCP Server ---"
GREPAI_PRESENT=0
if [ -f "$CLAUDE_JSON" ] && grep -q '"grepai"' "$CLAUDE_JSON" 2>/dev/null; then
  GREPAI_PRESENT=1
  echo "✅ MCP grepai: already configured"
else
  echo "⚠️ MCP grepai: not configured"
  echo "   Adding via claude CLI..."
  if supports_always_load; then
    if claude mcp add grepai --always-load --transport stdio --scope user -- grepai mcp-serve; then
      echo "✅ MCP grepai: added (alwaysLoad via CLI)"
      GREPAI_PRESENT=1
    else
      echo "❌ MCP grepai: failed to add"
      exit 1
    fi
  else
    if claude mcp add --scope user grepai -- grepai mcp-serve; then
      echo "✅ MCP grepai: added (legacy CLI, will patch alwaysLoad)"
      GREPAI_PRESENT=1
    else
      echo "❌ MCP grepai: failed to add"
      exit 1
    fi
  fi
fi

# Phase 1b: Ensure alwaysLoad=true for grepai
echo ""
echo "--- alwaysLoad Flag ---"
if [ "$GREPAI_PRESENT" -eq 1 ]; then
  if already_always_load; then
    echo "✅ alwaysLoad: already true (no changes)"
  else
    # Try CLI re-registration with --always-load first (idempotent in newer CC)
    PATCHED=0
    if supports_always_load; then
      # `claude mcp add` may refuse to overwrite; try and if it fails, fall through to JSON patch
      if claude mcp add grepai --always-load --transport stdio --scope user -- grepai mcp-serve 2>/dev/null; then
        if already_always_load; then
          echo "✅ alwaysLoad: set via CLI re-register"
          PATCHED=1
        fi
      fi
    fi

    if [ "$PATCHED" -eq 0 ]; then
      # Fallback: JSON patch
      if [ ! -f "$CLAUDE_JSON" ]; then
        echo "❌ $CLAUDE_JSON does not exist; cannot patch"
        exit 1
      fi
      if ! command -v jq &>/dev/null; then
        echo "❌ jq required for fallback patch"
        exit 1
      fi
      backup_claude_json
      TMP_FILE=$(mktemp)
      jq '.mcpServers.grepai.alwaysLoad = true' "$CLAUDE_JSON" > "$TMP_FILE" && mv "$TMP_FILE" "$CLAUDE_JSON"
      # Validate JSON
      jq empty "$CLAUDE_JSON" >/dev/null 2>&1 || { echo "❌ Invalid JSON after patch"; exit 1; }
      if already_always_load; then
        echo "✅ alwaysLoad: set via JSON patch"
      else
        echo "❌ alwaysLoad: patch did not take effect"
        exit 1
      fi
    fi
  fi
else
  echo "⏭️ alwaysLoad: skipped (grepai not present)"
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
    TMP_FILE2=$(mktemp)
    jq '.allowedTools = ((.allowedTools // []) + ["mcp__grepai__*"] | unique)' "$SETTINGS_FILE" > "$TMP_FILE2" && mv "$TMP_FILE2" "$SETTINGS_FILE"
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
    python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$SETTINGS_FILE" 2>/dev/null || { echo "❌ Invalid JSON in $SETTINGS_FILE"; exit 1; }
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
echo "✅ alwaysLoad: enabled (no ToolSearch preflight needed)"
echo "✅ Permissions: auto-allowed (no prompts)"
echo ""
echo "ℹ️  Restart Claude Code to apply MCP changes"
exit 0
