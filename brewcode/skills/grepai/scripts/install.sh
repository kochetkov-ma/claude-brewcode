#!/bin/bash
set -euo pipefail
# Install grepai prerequisites via Homebrew

echo "=== grepai Prerequisites Install ==="

INSTALLED=()
FAILED=()

# 1. Homebrew
echo ""
echo "--- Homebrew ---"
if command -v brew &>/dev/null; then
    echo "✅ brew: $(brew --version | head -1)"
else
    echo "⚠️ brew: not found, installing..."
    if /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
        eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true
        echo "✅ brew: installed"
        INSTALLED+=("brew")
    else
        echo "❌ brew: install failed"
        FAILED+=("brew")
    fi
fi

# Exit early if no brew
if ! command -v brew &>/dev/null; then
    echo ""
    echo "=== Install Failed ==="
    echo "❌ Homebrew is required for all other dependencies"
    echo "Manual install: https://brew.sh"
    exit 1
fi

# 2. timeout (from coreutils)
echo ""
echo "--- timeout ---"
if command -v timeout &>/dev/null; then
    echo "✅ timeout: $(timeout --version 2>&1 | head -1)"
else
    echo "⚠️ timeout: not found, installing coreutils..."
    if brew install coreutils &>/dev/null; then
        echo "✅ coreutils: installed"
        INSTALLED+=("coreutils")
        # Create symlink for timeout command
        BREW_BIN=$(brew --prefix)/bin
        if [ -w "$BREW_BIN" ]; then
            ln -sf "$(brew --prefix)/opt/coreutils/libexec/gnubin/timeout" "$BREW_BIN/timeout"
            echo "✅ timeout: symlink created"
        fi
    else
        echo "❌ coreutils: install failed"
        FAILED+=("coreutils")
    fi
fi

# 3. jq (JSON processor)
echo ""
echo "--- jq ---"
if command -v jq &>/dev/null; then
    echo "✅ jq: $(jq --version)"
else
    echo "⚠️ jq: not found, installing..."
    if brew install jq &>/dev/null; then
        echo "✅ jq: installed"
        INSTALLED+=("jq")
    else
        echo "❌ jq: install failed"
        FAILED+=("jq")
    fi
fi

# 4. ollama (embedding server)
echo ""
echo "--- ollama ---"
if command -v ollama &>/dev/null; then
    echo "✅ ollama: $(ollama --version 2>&1 | head -1)"
    # Check if running
    if curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags &>/dev/null; then
        echo "✅ ollama: running"
    else
        echo "⚠️ ollama: installed but not running"
        echo "   Starting ollama service..."
        brew services start ollama &>/dev/null || ollama serve &>/dev/null &
        sleep 2
        if curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags &>/dev/null; then
            echo "✅ ollama: started"
        else
            echo "⚠️ ollama: start manually with 'ollama serve'"
        fi
    fi
else
    echo "⚠️ ollama: not found, installing..."
    if brew install ollama &>/dev/null; then
        echo "✅ ollama: installed"
        INSTALLED+=("ollama")
        echo "   Starting ollama service..."
        brew services start ollama &>/dev/null || true
        sleep 2
    else
        echo "❌ ollama: install failed"
        FAILED+=("ollama")
    fi
fi

# 5. bge-m3 model (for ollama)
echo ""
echo "--- bge-m3 model ---"
if command -v ollama &>/dev/null && curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags &>/dev/null; then
    if ollama list 2>/dev/null | grep -q bge-m3; then
        echo "✅ bge-m3: installed"
    else
        echo "⚠️ bge-m3: not found, pulling..."
        if ollama pull bge-m3; then
            echo "✅ bge-m3: installed"
            INSTALLED+=("bge-m3")
        else
            echo "❌ bge-m3: pull failed"
            FAILED+=("bge-m3")
        fi
    fi
else
    echo "⏭️ bge-m3: skipped (ollama not available)"
fi

# 6. grepai CLI
echo ""
echo "--- grepai ---"
if command -v grepai &>/dev/null; then
    echo "✅ grepai: $(grepai version 2>&1)"
else
    echo "⚠️ grepai: not found, installing..."
    if brew install yoanbernabeu/tap/grepai &>/dev/null; then
        echo "✅ grepai: installed"
        INSTALLED+=("grepai")
    else
        echo "❌ grepai: install failed"
        FAILED+=("grepai")
    fi
fi

# Summary
echo ""
echo "=== Install Summary ==="

echo ""
echo "| Component | Status |"
echo "|-----------|--------|"

# Check each component
check_status() {
    local name=$1
    local cmd=$2
    if command -v "$cmd" &>/dev/null; then
        echo "| $name | ✅ |"
    else
        echo "| $name | ❌ |"
    fi
}

check_status "brew" "brew"
check_status "timeout" "timeout"
check_status "jq" "jq"
check_status "ollama" "ollama"
check_status "grepai" "grepai"

# bge-m3 special check
if command -v ollama &>/dev/null && ollama list 2>/dev/null | grep -q bge-m3; then
    echo "| bge-m3 | ✅ |"
else
    echo "| bge-m3 | ❌ |"
fi

# ollama running check
if curl -s --connect-timeout 3 --max-time 5 localhost:11434/api/tags &>/dev/null; then
    echo "| ollama running | ✅ |"
else
    echo "| ollama running | ❌ |"
fi

echo ""
if [ ${#INSTALLED[@]} -gt 0 ]; then
    echo "Installed: ${INSTALLED[*]}"
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    echo "Failed: ${FAILED[*]}"
    exit 1
fi

echo ""
echo "✅ All prerequisites installed"
exit 0
