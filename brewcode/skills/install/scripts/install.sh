#!/bin/bash
set -euo pipefail
# brewcode installer
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

# Helper: log action
if [ -z "${ACTIONS_FILE:-}" ]; then
  ACTIONS_FILE=$(mktemp /tmp/ft-install-actions.XXXXXX)
  trap 'rm -f "$ACTIONS_FILE"' EXIT
fi
log_action() {
    echo "- $1" >> "$ACTIONS_FILE"
}

# Helper: clear actions at start
clear_actions() {
    rm -f "$ACTIONS_FILE"
}

# Helper: get grepai versions
get_grepai_versions() {
    GREPAI_CURRENT=""
    GREPAI_LATEST=""
    if command -v grepai &>/dev/null; then
        GREPAI_CURRENT=$(grepai version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        GREPAI_CURRENT="${GREPAI_CURRENT:-unknown}"
    fi
    if command -v brew &>/dev/null; then
        GREPAI_LATEST=$(brew info yoanbernabeu/tap/grepai 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
    fi
}

case "$CMD" in

  state)
    clear_actions
    echo "=== brewcode Prerequisites ==="
    echo ""
    echo "| Component | Status | Version | Source | Type |"
    echo "|-----------|--------|---------|--------|------|"

    # Required: brew
    if command -v brew &>/dev/null; then
        VER=$(brew --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        VER="${VER:-unknown}"
        echo "| brew | ✅ | $VER | - | required |"
    else
        echo "| brew | ❌ missing | - | - | required |"
    fi

    # Required: timeout (coreutils)
    if command -v timeout &>/dev/null; then
        VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        VER="${VER:-unknown}"
        TIMEOUT_PATH=$(command -v timeout)
        if [ -L "$TIMEOUT_PATH" ]; then
            echo "| timeout | ✅ | $VER | symlink | required |"
        elif brew list coreutils &>/dev/null 2>&1; then
            echo "| timeout | ✅ | $VER | brew | required |"
        else
            echo "| timeout | ✅ | $VER | system | required |"
        fi
    else
        echo "| timeout | ❌ missing | - | - | required |"
    fi

    # Required: jq
    if command -v jq &>/dev/null; then
        VER=$(jq --version 2>&1)
        VER="${VER:-unknown}"
        if brew list jq &>/dev/null 2>&1; then
            echo "| jq | ✅ | $VER | brew | required |"
        else
            echo "| jq | ✅ | $VER | system | required |"
        fi
    else
        echo "| jq | ❌ missing | - | - | required |"
    fi

    # Optional: ollama
    if command -v ollama &>/dev/null; then
        VER=$(ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        VER="${VER:-unknown}"
        SRC=$(brew list ollama &>/dev/null 2>&1 && echo "brew" || echo "system")
        if ollama_running; then
            echo "| ollama | ✅ running | $VER | $SRC | optional |"
        else
            echo "| ollama | ⚠️ stopped | $VER | $SRC | optional |"
        fi
    else
        echo "| ollama | - | not installed | - | optional |"
    fi

    # Optional: bge-m3
    if command -v ollama &>/dev/null && ollama_running && ollama list 2>/dev/null | grep -q bge-m3; then
        echo "| bge-m3 | ✅ | installed | ollama | optional |"
    elif command -v ollama &>/dev/null && ! ollama_running; then
        echo "| bge-m3 | ? | ollama stopped | - | optional |"
    else
        echo "| bge-m3 | - | not installed | - | optional |"
    fi

    # Optional: grepai
    get_grepai_versions
    if [ -n "$GREPAI_CURRENT" ]; then
        SRC=$(brew list yoanbernabeu/tap/grepai &>/dev/null 2>&1 && echo "brew" || echo "system")
        if [ -n "$GREPAI_LATEST" ] && [ "$GREPAI_CURRENT" != "$GREPAI_LATEST" ]; then
            echo "| grepai | ⚠️ outdated | $GREPAI_CURRENT → $GREPAI_LATEST | $SRC | optional |"
        else
            echo "| grepai | ✅ | $GREPAI_CURRENT | $SRC | optional |"
        fi
    else
        echo "| grepai | - | not installed | - | optional |"
    fi
    ;;

  check-updates)
    if ! command -v brew &>/dev/null; then
        echo "UPDATES_AVAILABLE=false"
        echo "NOTE=brew not installed"
        exit 0
    fi

    # Update brew cache first
    echo "BREW_CACHE=updating"
    brew update --quiet 2>/dev/null && echo "BREW_CACHE=updated" || echo "BREW_CACHE=failed"

    UPDATES=""
    NOTES=""

    # Check coreutils (timeout) - only if brew-managed
    if brew list coreutils &>/dev/null; then
        COREUTILS_CURRENT=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        COREUTILS_LATEST=$(brew info coreutils 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        if [ -n "$COREUTILS_CURRENT" ] && [ -n "$COREUTILS_LATEST" ] && [ "$COREUTILS_CURRENT" != "$COREUTILS_LATEST" ]; then
            UPDATES="${UPDATES:+$UPDATES }coreutils($COREUTILS_CURRENT→$COREUTILS_LATEST)"
        fi
    fi

    # Check jq - only if brew-managed
    if brew list jq &>/dev/null; then
        JQ_CURRENT=$(jq --version 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || true)
        JQ_LATEST=$(brew info jq 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        if [ -n "$JQ_CURRENT" ] && [ -n "$JQ_LATEST" ] && [ "$JQ_CURRENT" != "$JQ_LATEST" ]; then
            UPDATES="${UPDATES:+$UPDATES }jq($JQ_CURRENT→$JQ_LATEST)"
        fi
    elif command -v jq &>/dev/null; then
        # jq exists but not brew-managed - note it
        JQ_PATH=$(command -v jq)
        JQ_CURRENT=$(jq --version 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || true)
        NOTES="${NOTES:+$NOTES; }jq($JQ_CURRENT) at $JQ_PATH (not brew-managed)"
    fi

    # Check grepai
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
    [ -n "$NOTES" ] && echo "NOTES=$NOTES"
    ;;

  check-timeout)
    if command -v timeout &>/dev/null; then
        echo "TIMEOUT_EXISTS=true"
        echo "VERSION=$(timeout --version 2>&1 | head -1)"
        TIMEOUT_PATH=$(command -v timeout)
        if [ -L "$TIMEOUT_PATH" ]; then
            SYMLINK_TARGET=$(readlink "$TIMEOUT_PATH")
            echo "SYMLINK=$TIMEOUT_PATH → $SYMLINK_TARGET"
        else
            echo "PATH=$TIMEOUT_PATH"
        fi
    else
        echo "TIMEOUT_EXISTS=false"
        if command -v gtimeout &>/dev/null; then
            echo "GTIMEOUT_EXISTS=true"
            echo "GTIMEOUT_PATH=$(command -v gtimeout)"
            echo "HINT=Create symlink: ln -sf \$(brew --prefix)/opt/coreutils/libexec/gnubin/timeout \$(brew --prefix)/bin/timeout"
        else
            echo "GTIMEOUT_EXISTS=false"
        fi
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
        OLD_VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        if brew upgrade coreutils 2>&1 | grep -q "Upgrading"; then
            NEW_VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
            echo "✅ coreutils: updated"
            log_action "Updated coreutils: $OLD_VER → $NEW_VER"
        else
            echo "⏭️ coreutils: already latest"
        fi
    fi

    # Update jq
    if brew list jq &>/dev/null; then
        OLD_VER=$(jq --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        if brew upgrade jq 2>&1 | grep -q "Upgrading"; then
            NEW_VER=$(jq --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
            echo "✅ jq: updated"
            log_action "Updated jq: $OLD_VER → $NEW_VER"
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
            log_action "Updated grepai: $GREPAI_CURRENT → $GREPAI_LATEST"
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
        command -v brew &>/dev/null && { echo "✅ brew: installed"; log_action "Installed Homebrew"; } || { echo "❌ brew: FAILED"; exit 1; }
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
        log_action "Installed coreutils"
    else
        echo "✅ coreutils: already installed"
    fi

    # jq
    echo ""
    echo "--- jq ---"
    if ! command -v jq &>/dev/null; then
        echo "Installing jq..."
        brew install jq
        command -v jq &>/dev/null && { echo "✅ jq: installed"; log_action "Installed jq"; } || { echo "❌ jq: FAILED"; exit 1; }
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
        log_action "Installed coreutils"
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
        log_action "Created timeout symlink → gtimeout"
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
        command -v ollama &>/dev/null && { echo "✅ ollama: installed"; log_action "Installed ollama"; } || { echo "❌ ollama: FAILED"; exit 1; }
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
            log_action "Started ollama service"
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
            log_action "Pulled bge-m3 embedding model"
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
        command -v grepai &>/dev/null && { echo "✅ grepai: installed"; log_action "Installed grepai CLI"; } || { echo "❌ grepai: FAILED"; exit 1; }
    elif [ -n "$GREPAI_LATEST" ] && [ "$GREPAI_CURRENT" != "$GREPAI_LATEST" ]; then
        echo "Updating grepai: $GREPAI_CURRENT → $GREPAI_LATEST"
        if brew upgrade yoanbernabeu/tap/grepai; then
            echo "✅ grepai: updated"
            log_action "Updated grepai: $GREPAI_CURRENT → $GREPAI_LATEST"
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
    # Optional: read actions from env or file
    if [ -z "${ACTIONS_FILE:-}" ]; then
      ACTIONS_FILE=$(mktemp /tmp/ft-install-actions.XXXXXX)
      trap 'rm -f "$ACTIONS_FILE"' EXIT
    fi

    echo ""
    echo "=== Installation Summary ==="
    echo ""
    echo "| Component | Status | Installed | Latest | Source |"
    echo "|-----------|--------|-----------|--------|--------|"

    # brew
    if command -v brew &>/dev/null; then
        VER=$(brew --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        echo "| brew | ✅ | ${VER:-?} | - | - |"
    else
        echo "| brew | ❌ | - | - | - |"
    fi

    # timeout (coreutils)
    if command -v timeout &>/dev/null; then
        VER=$(timeout --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        LATEST=$(brew info coreutils 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        TIMEOUT_PATH=$(command -v timeout)
        if [ -L "$TIMEOUT_PATH" ]; then
            SRC="symlink"
        elif brew list coreutils &>/dev/null 2>&1; then
            SRC="brew"
        else
            SRC="system"
        fi
        echo "| timeout | ✅ | ${VER:-?} | ${LATEST:-?} | $SRC |"
    else
        echo "| timeout | ❌ | - | - | - |"
    fi

    # jq
    if command -v jq &>/dev/null; then
        VER=$(jq --version 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1 || true)
        LATEST=$(brew info jq 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || true)
        if brew list jq &>/dev/null 2>&1; then
            SRC="brew"
        else
            SRC="system"
        fi
        echo "| jq | ✅ | ${VER:-?} | ${LATEST:-?} | $SRC |"
    else
        echo "| jq | ❌ | - | - | - |"
    fi

    # ollama
    if command -v ollama &>/dev/null; then
        VER=$(ollama --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        LATEST=$(brew info ollama 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
        SRC=$(brew list ollama &>/dev/null 2>&1 && echo "brew" || echo "system")
        if ollama_running; then
            echo "| ollama | ✅ running | ${VER:-?} | ${LATEST:-?} | $SRC |"
        else
            echo "| ollama | ⚠️ stopped | ${VER:-?} | ${LATEST:-?} | $SRC |"
        fi
    else
        echo "| ollama | ⏭️ skipped | - | - | - |"
    fi

    # bge-m3
    if command -v ollama &>/dev/null && ollama_running && ollama list 2>/dev/null | grep -q bge-m3; then
        echo "| bge-m3 | ✅ | installed | - | ollama |"
    elif command -v ollama &>/dev/null && ! ollama_running; then
        echo "| bge-m3 | ? | unknown | - | - |"
    else
        echo "| bge-m3 | ⏭️ skipped | - | - | - |"
    fi

    # grepai
    get_grepai_versions
    if [ -n "$GREPAI_CURRENT" ]; then
        SRC=$(brew list yoanbernabeu/tap/grepai &>/dev/null 2>&1 && echo "brew" || echo "system")
        echo "| grepai | ✅ | $GREPAI_CURRENT | ${GREPAI_LATEST:-?} | $SRC |"
    else
        echo "| grepai | ⏭️ skipped | - | - | - |"
    fi

    # Actions performed
    echo ""
    echo "## Actions Performed"
    if [ -f "$ACTIONS_FILE" ]; then
        cat "$ACTIONS_FILE"
        rm -f "$ACTIONS_FILE"
    else
        echo "- No actions recorded (all components were already installed)"
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
