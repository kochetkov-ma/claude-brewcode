#!/usr/bin/env bash
# Run every suite-*.mjs in this dir (context guard + scanner); rc 1 if any suite fails or none is found.
set -euo pipefail
# Suites never see the live profile: always an empty temp CLAUDE_CONFIG_DIR, set or unset.
CLAUDE_CONFIG_DIR="$(mktemp -d)"; export CLAUDE_CONFIG_DIR
# EXIT: delete only the temp profile made above (non-empty, under TMPDIR); runner rc kept.
CFG_TMP_DIR="$CLAUDE_CONFIG_DIR"; CFG_TMP_ROOT="${TMPDIR:-/tmp}"; CFG_TMP_ROOT="${CFG_TMP_ROOT%/}"
readonly CFG_TMP_DIR CFG_TMP_ROOT
trap '[ -z "$CFG_TMP_ROOT" ] || case "$CFG_TMP_DIR" in "$CFG_TMP_ROOT"/?*) rm -rf -- "$CFG_TMP_DIR" || true ;; esac' EXIT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rc=0
ran=0
for suite in "$SCRIPT_DIR"/suite-*.mjs; do
  [ -f "$suite" ] || continue
  ran=$((ran + 1))
  node "$suite" || rc=1
done
[ "$ran" -gt 0 ] || { echo "no suite-*.mjs found in $SCRIPT_DIR" >&2; rc=1; }
exit "$rc"
