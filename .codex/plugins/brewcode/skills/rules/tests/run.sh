#!/usr/bin/env bash
# Run every *.mjs test in this dir (rules.sh validate); rc 1 if any test file fails or none is found.
set -euo pipefail
# Suites never see the live profile: always an empty temp CODEX_HOME, set or unset.
CODEX_HOME="$(mktemp -d)"; export CODEX_HOME
# EXIT: delete only the temp profile made above (non-empty, under TMPDIR); runner rc kept.
CFG_TMP_DIR="$CODEX_HOME"; CFG_TMP_ROOT="${TMPDIR:-/tmp}"; CFG_TMP_ROOT="${CFG_TMP_ROOT%/}"
readonly CFG_TMP_DIR CFG_TMP_ROOT
trap '[ -z "$CFG_TMP_ROOT" ] || case "$CFG_TMP_DIR" in "$CFG_TMP_ROOT"/?*) rm -rf -- "$CFG_TMP_DIR" || true ;; esac' EXIT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rc=0
ran=0
for suite in "$SCRIPT_DIR"/*.mjs; do
  [ -f "$suite" ] || continue
  ran=$((ran + 1))
  node "$suite" || rc=1
done
[ "$ran" -gt 0 ] || { echo "no *.mjs test found in $SCRIPT_DIR" >&2; rc=1; }
exit "$rc"
