#!/bin/bash
# Update only brewmod-reminders plugin
# Usage: bash .claude/scripts/update-brewmod-reminders.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewmod-reminders "$@"
