#!/bin/bash
set -euo pipefail
# Create timeout symlink

echo "=== Creating timeout symlink ==="

# Check if already exists
if command -v timeout &>/dev/null; then
    echo "✅ timeout: already exists"
    exit 0
fi

# Install coreutils if needed
if ! brew list coreutils &>/dev/null; then
    echo "Installing coreutils..."
    brew install coreutils
fi

# Create symlink
BREW_BIN=$(brew --prefix)/bin
GTIMEOUT_PATH="$(brew --prefix)/opt/coreutils/libexec/gnubin/timeout"

if [ -f "$GTIMEOUT_PATH" ]; then
    ln -sf "$GTIMEOUT_PATH" "$BREW_BIN/timeout"
    echo "✅ timeout: symlink created ($BREW_BIN/timeout → $GTIMEOUT_PATH)"
else
    echo "❌ timeout: gtimeout not found at $GTIMEOUT_PATH"
    exit 1
fi
