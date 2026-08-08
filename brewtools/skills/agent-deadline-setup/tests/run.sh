#!/usr/bin/env bash
# Run the agent-deadline E2E test suite.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node --experimental-vm-modules "$SCRIPT_DIR/suite.mjs"
