#!/bin/bash
set -euo pipefail
# Check if timeout command exists

if command -v timeout &>/dev/null; then
    echo "TIMEOUT_EXISTS=true"
    echo "VERSION=$(timeout --version 2>&1 | head -1)"
else
    echo "TIMEOUT_EXISTS=false"
    # Check if gtimeout exists (can create symlink)
    if command -v gtimeout &>/dev/null; then
        echo "GTIMEOUT_EXISTS=true"
    else
        echo "GTIMEOUT_EXISTS=false"
    fi
fi
