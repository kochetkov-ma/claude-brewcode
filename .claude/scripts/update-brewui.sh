#!/bin/bash
# Update only brewui plugin
# Usage: bash .claude/scripts/update-brewui.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewui "$@"
