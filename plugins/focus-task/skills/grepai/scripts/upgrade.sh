#!/bin/bash
set -euo pipefail
# grepai CLI Upgrade via Homebrew

echo "=== grepai Upgrade ==="

# Check brew available
if ! command -v brew &>/dev/null; then
  echo "❌ Homebrew not found"
  exit 1
fi

# Get current version
CURRENT=$(grepai version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
if [ -z "$CURRENT" ]; then
  echo "⚠️ grepai not installed, installing..."
  brew install yoanbernabeu/tap/grepai && echo "✅ Installed" || { echo "❌ Install failed"; exit 1; }
  exit 0
fi

echo "Current: v$CURRENT"

# Get latest from brew
TIMEOUT_CMD=$(command -v timeout || echo "")
if [ -n "$TIMEOUT_CMD" ]; then
  LATEST=$($TIMEOUT_CMD 10 brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
else
  LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
fi
if [ -z "$LATEST" ]; then
  echo "⚠️ Cannot fetch latest version (network issue?)"
  echo "Manual check: brew info yoanbernabeu/tap/grepai"
  exit 0
fi

echo "Latest:  v$LATEST"

# Compare versions
if [ "$CURRENT" = "$LATEST" ]; then
  echo "✅ Already up to date"
  exit 0
fi

# Upgrade
echo "Upgrading..."
if brew upgrade yoanbernabeu/tap/grepai 2>&1; then
  NEW=$(grepai version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  echo "✅ Upgraded: v$CURRENT → v$NEW"
else
  echo "❌ Upgrade failed"
  exit 1
fi

exit 0
