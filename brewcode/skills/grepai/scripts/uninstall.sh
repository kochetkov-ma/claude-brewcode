#!/bin/bash
set -euo pipefail
# grepai Uninstall (project scope) — stop watch, unwire hooks, drop rule.
# Usage: uninstall.sh [--purge-index]
# Leaves the grepai CLI, ollama, the bge-m3 model and the user-scope MCP entry alone.

PURGE_INDEX=0
[ "${1:-}" = "--purge-index" ] && PURGE_INDEX=1

echo "=== grepai Uninstall (project) ==="

echo ""
echo "--- Watch ---"
grepai watch --stop 2>/dev/null || true
pkill -f "grepai watch" 2>/dev/null || true
sleep 1
pgrep -f "grepai watch" >/dev/null && echo "⚠️ watch: still running" || echo "✅ watch: stopped"

echo ""
echo "--- Hooks ---"
HOOK_DIR=".claude/grepai/hooks"
SETTINGS=".claude/settings.json"

if [ -d "$HOOK_DIR" ]; then
  rm -f "$HOOK_DIR/grepai-session.mjs" "$HOOK_DIR/grepai-reminder.mjs"
  rmdir "$HOOK_DIR" 2>/dev/null || true
  rmdir ".claude/grepai" 2>/dev/null || true
  echo "✅ hook files: removed"
else
  echo "⏭️ hook files: none"
fi

if [ -f "$SETTINGS" ] && grep -q 'grepai-\(session\|reminder\)\.mjs' "$SETTINGS" 2>/dev/null; then
  if command -v jq >/dev/null 2>&1; then
    cp "$SETTINGS" "$SETTINGS.bak"
    TMP="$(mktemp)"
    jq '
      def strip_grepai:
        map(.hooks = ((.hooks // []) | map(select((.command // "") | test("grepai-(session|reminder)\\.mjs") | not))))
        | map(select((.hooks | length) > 0));
      .hooks.SessionStart = ((.hooks.SessionStart // []) | strip_grepai)
      | .hooks.PreToolUse = ((.hooks.PreToolUse // []) | strip_grepai)
    ' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"
    if jq empty "$SETTINGS" >/dev/null 2>&1 && ! grep -q 'grepai-\(session\|reminder\)\.mjs' "$SETTINGS"; then
      echo "✅ settings.json: entries removed (backup: $SETTINGS.bak)"
    else
      echo "❌ settings.json: unwire failed — restore from $SETTINGS.bak"
      exit 1
    fi
  else
    echo "❌ jq not found — remove the grepai hook entries from $SETTINGS manually"
    exit 1
  fi
else
  echo "⏭️ settings.json: no grepai entries"
fi

echo ""
echo "--- Rule ---"
if [ -f .claude/rules/grepai-first.md ]; then
  rm -f .claude/rules/grepai-first.md && echo "✅ rule: removed"
else
  echo "⏭️ rule: none"
fi

echo ""
echo "--- Index ---"
if [ "$PURGE_INDEX" -eq 1 ]; then
  rm -rf .grepai && echo "✅ .grepai/: removed (config + index gone)"
else
  test -d .grepai && echo "⏭️ .grepai/ kept (re-run with --purge-index to delete config + index)" || echo "⏭️ .grepai/: none"
fi

echo ""
echo "=== Uninstall Complete ==="
echo "ℹ️  Left untouched: grepai CLI, ollama, bge-m3, user-scope MCP entry in ~/.claude.json"
echo "ℹ️  Remove the '## Code Search' section from CLAUDE.md by hand if you no longer want it"
