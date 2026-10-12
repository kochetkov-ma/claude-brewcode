#!/usr/bin/env bash
# Run every *.mjs test in this dir (setup-status probes); rc 1 if any test file fails or none is found.
set -euo pipefail
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
