#!/usr/bin/env bash
# Offline suite for scripts/mods-ref-check.mjs; set MODS_TYPES=<types.d.ts> to add the live check, else it prints SKIP.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null || { echo "need node >= 20" >&2; exit 2; }

suites=("$SCRIPT_DIR/suite-mods-ref-check.mjs")
if [ -z "${MODS_TYPES:-}" ]; then
  echo "SKIP live check: MODS_TYPES unset"
elif [ -f "$MODS_TYPES" ]; then
  suites+=("$SCRIPT_DIR/suite-live.mjs")
else
  echo "MODS_TYPES is not a file: $MODS_TYPES" >&2; exit 2
fi

LOG="$(mktemp)"
trap 'rm -f -- "$LOG"' EXIT
rc=0
node --test --test-reporter=tap "${suites[@]}" > "$LOG" 2>&1 || rc=$?
grep -E '^# (tests|pass|fail) ' "$LOG" || true
[ "$rc" -eq 0 ] || { cat "$LOG" >&2; echo "FAIL mods-ref-check suite rc=$rc" >&2; }
exit "$rc"
