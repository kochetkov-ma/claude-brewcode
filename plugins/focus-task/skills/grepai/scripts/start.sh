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
