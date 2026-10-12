#!/usr/bin/env bash
# Run the manager-setup E2E test suite.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/suite.mjs"
