#!/usr/bin/env bash
# run.sh - aggregate every brewcode:semble-setup test suite.
#
# Usage: run.sh [suite-name ...]      (bare names or file names, e.g. `status`)
#
# Iterates tests/suite-*.mjs in sorted order and runs each one. Suites land in
# parallel from six units, so a *missing* suite is not an error; a suite that
# exists and fails is. Exits 1 if any suite exited non-zero.
#
# Also lints every shipped shell script with `shellcheck -S error` first; an
# absent shellcheck is skipped, a finding fails the run.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

command -v node >/dev/null 2>&1 || { printf '❌ node is required to run the semble suites\n' >&2; exit 1; }

# Hermetic gate: both variables outrank the cwd walk when a script or hook
# resolves the project root, so an ambient one points the fixtures at whatever
# repo the caller happens to sit in. Unset once, for every suite.
unset CLAUDE_PROJECT_DIR SEMBLE_PROJECT_ROOT

# Optional filter: `run.sh status core` -> suite-status.mjs suite-core.mjs
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

# Shell lint gate: the shipped scripts are the other half of this skill and had
# no lint step at all, which is how a malformed `# shellcheck disable=...` sat in
# semble-mcp.sh unnoticed. -S error only: warnings stay advisory. shellcheck is
# not a dependency of the suites, so an absent binary is skipped, never a failure.
SC_STATUS=skipped
if command -v shellcheck >/dev/null 2>&1; then
  printf '\n=== shellcheck -S error ===\n'
  if shellcheck -S error "$SCRIPT_DIR"/../scripts/*.sh "$SCRIPT_DIR"/../scripts/lib/*.sh "$SCRIPT_DIR"/run.sh; then
    SC_STATUS=ok
    printf '✅ shell scripts clean at -S error\n'
  else
    SC_STATUS=failed
  fi
fi

TOTAL=0
FAILED=0
FAILED_NAMES=""

for suite in $SUITES; do
  name="$(basename "$suite")"
  printf '\n=== %s ===\n' "$name"
  TOTAL=$((TOTAL + 1))
  set +e
  node --experimental-vm-modules "$suite"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    FAILED=$((FAILED + 1))
    FAILED_NAMES="${FAILED_NAMES}${FAILED_NAMES:+ }$name(exit $rc)"
  fi
done

printf '\n=== semble suites ===\n'
printf '| Suite set | Value |\n'
printf '|-----------|-------|\n'
printf '| suites run | %s |\n' "$TOTAL"
printf '| failed | %s |\n' "$FAILED"
printf '| shellcheck | %s |\n' "$SC_STATUS"

if [ "$FAILED" -ne 0 ]; then
  printf '❌ failing: %s\n' "$FAILED_NAMES"
  exit 1
fi
if [ "$SC_STATUS" = "failed" ]; then
  printf '❌ shellcheck -S error reported findings\n'
  exit 1
fi
printf '✅ all suites passed\n'
