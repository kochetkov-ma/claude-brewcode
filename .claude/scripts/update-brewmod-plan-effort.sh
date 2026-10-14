#!/bin/bash
# Update only brewmod-plan-effort plugin
# Usage: bash .claude/scripts/update-brewmod-plan-effort.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewmod-plan-effort "$@"
