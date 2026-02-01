#!/bin/bash
set -euo pipefail
# Install required components: brew, timeout, jq

echo "=== Installing Required Components ==="

# 1. Homebrew
echo ""
echo "--- Homebrew ---"
if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH
    eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true
    if command -v brew &>/dev/null; then
        echo "✅ brew: installed"
    else
        echo "❌ brew: FAILED"
        exit 1
    fi
else
    echo "✅ brew: $(brew --version | head -1)"
fi

# 2. coreutils (for timeout)
echo ""
echo "--- coreutils ---"
if ! brew list coreutils &>/dev/null; then
    echo "Installing coreutils..."
    brew install coreutils
    echo "✅ coreutils: installed"
else
    echo "✅ coreutils: already installed"
fi

# 3. timeout symlink
echo ""
echo "--- timeout symlink ---"
if ! command -v timeout &>/dev/null; then
    BREW_BIN=$(brew --prefix)/bin
    GTIMEOUT_PATH="$(brew --prefix)/opt/coreutils/libexec/gnubin/timeout"
    if [ -f "$GTIMEOUT_PATH" ]; then
        ln -sf "$GTIMEOUT_PATH" "$BREW_BIN/timeout"
        echo "✅ timeout: symlink created"
    else
        echo "❌ timeout: gtimeout not found"
        exit 1
    fi
else
    echo "✅ timeout: $(timeout --version 2>&1 | head -1)"
fi

# 4. jq
echo ""
echo "--- jq ---"
if ! command -v jq &>/dev/null; then
    echo "Installing jq..."
    brew install jq
    if command -v jq &>/dev/null; then
        echo "✅ jq: installed"
    else
        echo "❌ jq: FAILED"
        exit 1
    fi
else
    echo "✅ jq: $(jq --version)"
fi

echo ""
echo "=== Required Components Done ==="
