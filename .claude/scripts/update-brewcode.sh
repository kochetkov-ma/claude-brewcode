#!/bin/bash
# Update only brewcode plugin
# Usage: bash .claude/scripts/update-brewcode.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewcode "$@"
