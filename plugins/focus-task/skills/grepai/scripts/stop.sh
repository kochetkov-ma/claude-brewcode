#!/bin/bash
set -euo pipefail
# grepai Stop Watch

echo "=== Stopping grepai watch ==="

# Try graceful stop first
grepai watch --stop 2>/dev/null || true

# Force kill if still running
if pgrep -f "grepai watch" >/dev/null; then
  pkill -f "grepai watch" || true
  sleep 1
fi

# Verify
if pgrep -f "grepai watch" >/dev/null; then
  echo "❌ watch still running (PID: $(pgrep -f 'grepai watch'))"
  echo "   Try: kill -9 $(pgrep -f 'grepai watch')"
  exit 1
else
  echo "✅ watch stopped"
fi
