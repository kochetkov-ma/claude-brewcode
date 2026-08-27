#!/usr/bin/env bash
# Run the agent-router E2E test suite.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node --experimental-vm-modules "$SCRIPT_DIR/suite.mjs"
node "$SCRIPT_DIR/suite-install.mjs"
