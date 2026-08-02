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

# Start watch (|| true: set -e must not pre-empt the failure branch below)
grepai watch --background --log-dir .grepai/logs 2>/dev/null || true

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

# Ensure CLAUDE.md has grepai entry
CLAUDE_MD="CLAUDE.md"
GREPAI_MARKER="grepai_search"

append_claude_md_entry() {
  {
    echo ""
    echo "## Code Search"
    echo ""
    echo "> **CRITICAL:** Use \`grepai_search\` FIRST for code exploration."
    echo "> **ALWAYS \`compact:true\` + \`format:\"toon\"\`** → path+lines only, then \`Read\` the top hits."
    echo "> Full content (\`compact:false\`) only as an exception, after a compact pass, with \`limit<=3\` — it overflows the context."
  } >> "$1"
}

if [ ! -f "$CLAUDE_MD" ]; then
  echo "# CLAUDE.md" > "$CLAUDE_MD"
  append_claude_md_entry "$CLAUDE_MD"
  echo "✅ CLAUDE.md created with grepai entry"
elif ! grep -q "$GREPAI_MARKER" "$CLAUDE_MD" 2>/dev/null; then
  append_claude_md_entry "$CLAUDE_MD"
  echo "✅ CLAUDE.md updated with grepai entry"
fi
