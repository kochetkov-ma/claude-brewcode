#!/bin/bash
set -euo pipefail
# grepai Start Watch

echo "=== Starting grepai watch ==="

# Check prerequisites
if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /grepai setup"
  exit 1
fi

# Check if already running
if pgrep -f "grepai watch" >/dev/null; then
  echo "⚠️ watch already running (PID: $(pgrep -f 'grepai watch'))"
  exit 0
fi

# Create logs directory
mkdir -p .grepai/logs

# Start watch
grepai watch --background --log-dir .grepai/logs 2>/dev/null

# Verify
sleep 1
if pgrep -f "grepai watch" >/dev/null; then
  echo "✅ watch started (PID: $(pgrep -f 'grepai watch'))"
  echo "   Logs: .grepai/logs/"
else
  echo "❌ watch failed to start"
  echo "   Check: grepai watch (foreground) for errors"
  exit 1
fi

# TODO: Extract shared CLAUDE.md logic to common function (duplicated in create-rule.sh)
# Ensure CLAUDE.md has grepai entry
CLAUDE_MD="CLAUDE.md"
GREPAI_MARKER="grepai_search"
if [ ! -f "$CLAUDE_MD" ]; then
  echo "# CLAUDE.md" > "$CLAUDE_MD"
  echo "" >> "$CLAUDE_MD"
  echo "## Code Search" >> "$CLAUDE_MD"
  echo "" >> "$CLAUDE_MD"
  echo "> **CRITICAL:** Use \`grepai_search\` FIRST for code exploration." >> "$CLAUDE_MD"
  echo "✅ CLAUDE.md created with grepai entry"
elif ! grep -q "$GREPAI_MARKER" "$CLAUDE_MD" 2>/dev/null; then
  echo "" >> "$CLAUDE_MD"
  echo "## Code Search" >> "$CLAUDE_MD"
  echo "" >> "$CLAUDE_MD"
  echo "> **CRITICAL:** Use \`grepai_search\` FIRST for code exploration." >> "$CLAUDE_MD"
  echo "✅ CLAUDE.md updated with grepai entry"
fi
