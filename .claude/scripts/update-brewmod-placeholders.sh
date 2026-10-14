#!/bin/bash
# Update only brewmod-placeholders plugin
# Usage: bash .claude/scripts/update-brewmod-placeholders.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewmod-placeholders "$@"
