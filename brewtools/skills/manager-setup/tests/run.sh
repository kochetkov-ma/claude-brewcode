#!/usr/bin/env bash
# Run the manager-setup E2E test suite.
set -euo pipefail
# Suites never see the live profile: always an empty temp CLAUDE_CONFIG_DIR, set or unset.
CLAUDE_CONFIG_DIR="$(mktemp -d)"; export CLAUDE_CONFIG_DIR
# EXIT: delete only the temp profile made above (non-empty, under TMPDIR); runner rc kept.
CFG_TMP_DIR="$CLAUDE_CONFIG_DIR"; CFG_TMP_ROOT="${TMPDIR:-/tmp}"; CFG_TMP_ROOT="${CFG_TMP_ROOT%/}"
readonly CFG_TMP_DIR CFG_TMP_ROOT
trap '[ -z "$CFG_TMP_ROOT" ] || case "$CFG_TMP_DIR" in "$CFG_TMP_ROOT"/?*) rm -rf -- "$CFG_TMP_DIR" || true ;; esac' EXIT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/suite.mjs"
