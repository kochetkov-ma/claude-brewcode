#!/bin/bash
set -euo pipefail
# focus-task installer
# Usage: install.sh <command> [options]
#
# Commands:
#   state          - Check current state of all components
#   check-updates  - Check for available updates
#   check-timeout  - Check if timeout command exists
#   update-all     - Update all outdated components
#   required       - Install required components (brew, coreutils, jq)
#   timeout        - Create timeout symlink only
#   grepai         - Install semantic search (ollama, bge-m3, grepai)
#   summary        - Show final installation summary

CMD="${1:-help}"

# Helper: check ollama service with timeout
ollama_running() {
    curl -s --connect-timeout 2 --max-time 5 localhost:11434/api/tags &>/dev/null
}

# Helper: wait for ollama to start (retry loop)
wait_for_ollama() {
    local max_attempts=10
    for i in $(seq 1 $max_attempts); do
        if ollama_running; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# Helper: get grepai versions
get_grepai_versions() {
    GREPAI_CURRENT=""
    GREPAI_LATEST=""
    if command -v grepai &>/dev/null; then
        GREPAI_CURRENT=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        GREPAI_CURRENT="${GREPAI_CURRENT:-unknown}"
    fi
    if command -v brew &>/dev/null; then
        GREPAI_LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    fi
}

case "$CMD" in

  state)
    echo "=== focus-task Prerequisites ==="
    echo ""
    echo "| Component | Status | Version | Type |"
    echo "|-----------|--------|---------|------|"

    # Required
    if command -v brew &>/dev/null; then
        VER=$(brew --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        VER="${VER:-unknown}"
        echo "| brew | ✅ | $VER | required |"
    else
        echo "| brew | ❌ missing | - | required |"
    fi

    if command -v timeout &>/dev/null; then
        VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
        VER="${VER:-unknown}"
        echo "| timeout | ✅ | $VER | required |"
    else
        echo "| timeout | ❌ missing | - | required |"
    fi

    if command -v jq &>/dev/null; then
        VER=$(jq --version 2>&1)
        VER="${VER:-unknown}"
        echo "| jq | ✅ | $VER | required |"
    else
        echo "| jq | ❌ missing | - | required |"
    fi

    # Optional (grepai)
    if command -v ollama &>/dev/null; then
        VER=$(ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        VER="${VER:-unknown}"
        if ollama_running; then
            echo "| ollama | ✅ running | $VER | optional |"
        else
            echo "| ollama | ⚠️ stopped | $VER | optional |"
        fi
    else
        echo "| ollama | - | not installed | optional |"
    fi

    if command -v ollama &>/dev/null && ollama_running && ollama list 2>/dev/null | grep -q bge-m3; then
        echo "| bge-m3 | ✅ | installed | optional |"
    elif command -v ollama &>/dev/null && ! ollama_running; then
        echo "| bge-m3 | ? | ollama stopped | optional |"
    else
        echo "| bge-m3 | - | not installed | optional |"
    fi

    get_grepai_versions
    if [ -n "$GREPAI_CURRENT" ]; then
        if [ -n "$GREPAI_LATEST" ] && [ "$GREPAI_CURRENT" != "$GREPAI_LATEST" ]; then
            echo "| grepai | ⚠️ outdated | $GREPAI_CURRENT → $GREPAI_LATEST | optional |"
        else
            echo "| grepai | ✅ | $GREPAI_CURRENT | optional |"
        fi
    else
        echo "| grepai | - | not installed | optional |"
    fi
    ;;

  check-updates)
    if ! command -v brew &>/dev/null; then
        echo "UPDATES_AVAILABLE=false"
        echo "NOTE=brew not installed"
        exit 0
    fi

    UPDATES=""
    OUTDATED=$(brew outdated --quiet 2>/dev/null | grep -E "^(coreutils|jq)$" || true)
    [ -n "$OUTDATED" ] && UPDATES="$OUTDATED"

    get_grepai_versions
    if [ -n "$GREPAI_CURRENT" ] && [ -n "$GREPAI_LATEST" ] && [ "$GREPAI_CURRENT" != "$GREPAI_LATEST" ]; then
        UPDATES="${UPDATES:+$UPDATES }grepai($GREPAI_CURRENT→$GREPAI_LATEST)"
    fi

    # Trim whitespace
    UPDATES="${UPDATES## }"
    UPDATES="${UPDATES%% }"

    if [ -n "$UPDATES" ]; then
        echo "UPDATES_AVAILABLE=true"
        echo "UPDATES=$UPDATES"
    else
        echo "UPDATES_AVAILABLE=false"
    fi
    ;;

  check-timeout)
    if command -v timeout &>/dev/null; then
        echo "TIMEOUT_EXISTS=true"
        echo "VERSION=$(timeout --version 2>&1 | head -1)"
    else
        echo "TIMEOUT_EXISTS=false"
        command -v gtimeout &>/dev/null && echo "GTIMEOUT_EXISTS=true" || echo "GTIMEOUT_EXISTS=false"
    fi
    ;;

  update-all)
    echo "=== Updating Components ==="

    if ! command -v brew &>/dev/null; then
        echo "❌ brew not installed"
        exit 1
    fi

    # Update coreutils
    if brew list coreutils &>/dev/null; then
        if brew upgrade coreutils 2>&1; then
            echo "✅ coreutils: updated"
        else
            echo "⏭️ coreutils: already latest"
        fi
    fi

    # Update jq
    if brew list jq &>/dev/null; then
        if brew upgrade jq 2>&1; then
            echo "✅ jq: updated"
        else
            echo "⏭️ jq: already latest"
        fi
    fi

    # Update grepai
    get_grepai_versions
    if [ -n "$GREPAI_CURRENT" ] && [ -n "$GREPAI_LATEST" ] && [ "$GREPAI_CURRENT" != "$GREPAI_LATEST" ]; then
        echo "Updating grepai: $GREPAI_CURRENT → $GREPAI_LATEST"
        if brew upgrade yoanbernabeu/tap/grepai; then
            echo "✅ grepai: updated"
        else
            echo "⚠️ grepai: update failed"
        fi
    elif [ -n "$GREPAI_CURRENT" ]; then
        echo "⏭️ grepai: already latest ($GREPAI_CURRENT)"
    fi

    echo "✅ Updates complete"
    ;;

  required)
    echo "=== Installing Required Components ==="

    # Homebrew
    echo ""
    echo "--- Homebrew ---"
    if ! command -v brew &>/dev/null; then
        echo "Installing Homebrew..."
        NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null || true
        command -v brew &>/dev/null && echo "✅ brew: installed" || { echo "❌ brew: FAILED"; exit 1; }
    else
        echo "✅ brew: $(brew --version | head -1)"
    fi

    # coreutils
    echo ""
    echo "--- coreutils ---"
    if ! brew list coreutils &>/dev/null; then
        echo "Installing coreutils..."
        brew install coreutils
        echo "✅ coreutils: installed"
    else
        echo "✅ coreutils: already installed"
    fi

    # jq
    echo ""
    echo "--- jq ---"
    if ! command -v jq &>/dev/null; then
        echo "Installing jq..."
        brew install jq
        command -v jq &>/dev/null && echo "✅ jq: installed" || { echo "❌ jq: FAILED"; exit 1; }
    else
        echo "✅ jq: $(jq --version)"
    fi

    echo ""
    echo "=== Required Components Done ==="
    ;;

  timeout)
    echo "=== Creating timeout symlink ==="
    if command -v timeout &>/dev/null; then
        echo "✅ timeout: already exists"
        exit 0
    fi
    if ! brew list coreutils &>/dev/null; then
        echo "Installing coreutils..."
        brew install coreutils
    fi
    BREW_BIN=$(brew --prefix)/bin
    GTIMEOUT_PATH="$(brew --prefix)/opt/coreutils/libexec/gnubin/timeout"

    # Safety check: don't overwrite regular file
    if [ -e "$BREW_BIN/timeout" ] && [ ! -L "$BREW_BIN/timeout" ]; then
        echo "⚠️ timeout: file exists (not symlink), skipping"
        exit 1
    fi

    if [ -f "$GTIMEOUT_PATH" ]; then
        ln -sf "$GTIMEOUT_PATH" "$BREW_BIN/timeout"
        echo "✅ timeout: symlink created"
    else
        echo "❌ timeout: gtimeout not found at $GTIMEOUT_PATH"
        exit 1
    fi
    ;;

  grepai)
    echo "=== Installing Semantic Search ==="

    # ollama
    echo ""
    echo "--- ollama ---"
    if ! command -v ollama &>/dev/null; then
        echo "Installing ollama..."
        brew install ollama
        command -v ollama &>/dev/null && echo "✅ ollama: installed" || { echo "❌ ollama: FAILED"; exit 1; }
    else
        echo "✅ ollama: $(ollama --version 2>&1 | head -1)"
    fi

    # Start ollama with retry loop
    if command -v ollama &>/dev/null && ! ollama_running; then
        echo "Starting ollama service..."
        brew services start ollama 2>/dev/null || nohup ollama serve >/dev/null 2>&1 &
        disown 2>/dev/null || true
        if wait_for_ollama; then
            echo "✅ ollama: running"
        else
            echo "⚠️ ollama: failed to start, run manually: ollama serve"
        fi
    elif ollama_running; then
        echo "✅ ollama: already running"
    fi

    # bge-m3
    echo ""
    echo "--- bge-m3 ---"
    if command -v ollama &>/dev/null && ollama_running; then
        if ! ollama list 2>/dev/null | grep -q bge-m3; then
            echo "Pulling bge-m3 model (~1.2GB)..."
            ollama pull bge-m3
            echo "✅ bge-m3: installed"
        else
            echo "✅ bge-m3: already installed"
        fi
    else
        echo "⚠️ bge-m3: skipped (ollama not running)"
    fi

    # grepai
    echo ""
    echo "--- grepai ---"
    get_grepai_versions
    if [ -z "$GREPAI_CURRENT" ]; then
        echo "Installing grepai..."
        brew install yoanbernabeu/tap/grepai
        command -v grepai &>/dev/null && echo "✅ grepai: installed" || { echo "❌ grepai: FAILED"; exit 1; }
    elif [ -n "$GREPAI_LATEST" ] && [ "$GREPAI_CURRENT" != "$GREPAI_LATEST" ]; then
        echo "Updating grepai: $GREPAI_CURRENT → $GREPAI_LATEST"
        if brew upgrade yoanbernabeu/tap/grepai; then
            echo "✅ grepai: updated"
        else
            echo "⚠️ grepai: update failed"
        fi
    else
        echo "✅ grepai: $GREPAI_CURRENT (latest)"
    fi

    echo ""
    echo "=== Semantic Search Done ==="
    ;;

  summary)
    echo ""
    echo "=== Installation Complete ==="
    echo ""
    echo "| Component | Status | Version |"
    echo "|-----------|--------|---------|"

    if command -v brew &>/dev/null; then
        VER=$(brew --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        echo "| brew | ✅ | ${VER:-unknown} |"
    else
        echo "| brew | ❌ | - |"
    fi

    if command -v timeout &>/dev/null; then
        VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+')
        echo "| timeout | ✅ | ${VER:-unknown} |"
    else
        echo "| timeout | ❌ | - |"
    fi

    if command -v jq &>/dev/null; then
        echo "| jq | ✅ | $(jq --version) |"
    else
        echo "| jq | ❌ | - |"
    fi

    if command -v ollama &>/dev/null; then
        VER=$(ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        echo "| ollama | ✅ | ${VER:-unknown} |"
        if ollama_running; then
            echo "| ollama svc | ✅ | running |"
        else
            echo "| ollama svc | ⚠️ | stopped |"
        fi
    else
        echo "| ollama | - | skipped |"
    fi

    if command -v ollama &>/dev/null && ollama_running && ollama list 2>/dev/null | grep -q bge-m3; then
        echo "| bge-m3 | ✅ | installed |"
    elif command -v ollama &>/dev/null; then
        echo "| bge-m3 | - | skipped |"
    else
        echo "| bge-m3 | - | skipped |"
    fi

    if command -v grepai &>/dev/null; then
        VER=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        echo "| grepai | ✅ | ${VER:-unknown} |"
    else
        echo "| grepai | - | skipped |"
    fi
    ;;

  help|*)
    echo "Usage: install.sh <command>"
    echo ""
    echo "Commands:"
    echo "  state          Check current state of all components"
    echo "  check-updates  Check for available updates"
    echo "  check-timeout  Check if timeout command exists"
    echo "  update-all     Update all outdated components"
    echo "  required       Install required (brew, coreutils, jq)"
    echo "  timeout        Create timeout symlink only"
    echo "  grepai         Install semantic search (ollama, bge-m3, grepai)"
    echo "  summary        Show final installation summary"
    ;;

esac
