#!/bin/bash
# Update only brewdoc plugin
# Usage: bash .claude/scripts/update-brewdoc.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/update-plugin.sh" brewdoc "$@"
