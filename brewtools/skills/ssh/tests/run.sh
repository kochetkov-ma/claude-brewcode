#!/usr/bin/env bash
# run.sh - aggregate every brewtools:ssh test suite.
#
# Usage: run.sh [suite-name ...]      (bare names or file names, e.g. `discover`)
#
# Runs tests/suite-*.mjs in sorted order. Standalone node, no network, no real
# SSH, no real docker login. Exits 1 if any suite exited non-zero.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

command -v node >/dev/null 2>&1 || { printf '❌ node is required to run the ssh suites\n' >&2; exit 1; }

SUITES=""
if [ "$#" -gt 0 ]; then
  for want in "$@"; do
    base="${want%.mjs}"
    base="${base#suite-}"
    f="$SCRIPT_DIR/suite-$base.mjs"
    if [ -f "$f" ]; then
      SUITES="${SUITES}${SUITES:+ }$f"
    else
      printf '❌ no such suite: %s\n' "$f" >&2
      exit 1
    fi
  done
else
  for f in "$SCRIPT_DIR"/suite-*.mjs; do
    [ -f "$f" ] || continue
    SUITES="${SUITES}${SUITES:+ }$f"
  done
fi

if [ -z "$SUITES" ]; then
  printf '⏭️ no suite-*.mjs found in %s - nothing to run\n' "$SCRIPT_DIR"
  exit 0
fi

TOTAL=0
FAILED=0
FAILED_NAMES=""

for suite in $SUITES; do
  name="$(basename "$suite")"
  printf '\n=== %s ===\n' "$name"
  TOTAL=$((TOTAL + 1))
  set +e
  node "$suite"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    FAILED=$((FAILED + 1))
    FAILED_NAMES="${FAILED_NAMES}${FAILED_NAMES:+ }$name(exit $rc)"
  fi
done

printf '\n=== summary ===\n'
printf 'suites: %s  failed: %s\n' "$TOTAL" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
  printf '❌ FAILED: %s\n' "$FAILED_NAMES"
  exit 1
fi
printf '✅ all suites passed\n'
