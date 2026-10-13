#!/bin/bash
# Update only brewtools plugin
# Usage: bash .claude/scripts/update-brewtools.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewtools "$@"
