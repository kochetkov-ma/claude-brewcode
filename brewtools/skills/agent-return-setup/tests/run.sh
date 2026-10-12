#!/usr/bin/env bash
# Run every agent-return suite (hooks + runbook E2E, then the status probe); rc 1 if any fails.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rc=0
node --experimental-vm-modules "$SCRIPT_DIR/suite.mjs" || rc=1
node "$SCRIPT_DIR/suite-status.mjs" || rc=1
exit "$rc"
