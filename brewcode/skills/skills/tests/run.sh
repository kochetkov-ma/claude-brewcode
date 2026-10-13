#!/usr/bin/env bash
# run.sh - offline regression for validate-skill.sh: Cyrillic mode-table check is locale-independent.
# Each case runs under sh and bash x LC_ALL=C, LANG=C.UTF-8, inherited locale; rc 1 on any failure.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE="$SCRIPT_DIR/../scripts/validate-skill.sh"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

WORK="$(mktemp -d)"
WORK_ROOT="${TMPDIR:-/tmp}"; WORK_ROOT="${WORK_ROOT%/}"
readonly WORK WORK_ROOT
trap 'case "$WORK" in "$WORK_ROOT"/?*|/tmp/?*) rm -rf -- "$WORK" || true ;; esac' EXIT

# make_skill <name> <ru-cell-1> <ru-cell-2> -> skill dir with a 2-mode keyword table.
make_skill() {
  local dir="$WORK/$1"
  mkdir -p "$dir"
  cat > "$dir/SKILL.md" <<MD
---
name: $1
description: Fixture skill for the locale-independent Cyrillic mode-table regression.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [check|fix]"
allowed-tools: [Read]
---

# Fixture

## Prompt contract

| Mode | EN keyword | RU keyword | Mutates? |
|------|------------|------------|----------|
| check | check | $2 | no |
| fix | fix | $3 | yes |

PLAN — fixture:$1
INPUT: x
MODE: x
SCOPE: x
DO: x
RESULT: x
MD
  printf '%s\n' "$dir"
}

POS="$(make_skill fixture-ru 'проверь' 'исправь')"
POS_YO="$(make_skill fixture-yo 'ёж' 'ёлка')"
NEG="$(make_skill fixture-en 'check-ru' 'fix-ru')"
OK_LINE='✅ Mode table (2 modes) has Mutates? column + RU keyword'
FAIL_LINE='❌ Mode table (2 modes): missing Cyrillic (RU) keyword'

pass=0; fail=0
# expect <label> <skill-dir> <exact-line> <want-rc> <shell> [env assignments...]
expect() {
  local label="$1" dir="$2" line="$3" want="$4" shell="$5"; shift 5
  local out rc=0
  out="$(env "$@" "$shell" "$VALIDATE" "$dir" 2>&1)" || rc=$?
  # Here-string: `printf | grep -q` under pipefail SIGPIPEs printf on an early match -> false FAIL.
  if grep -qxF -- "$line" <<<"$out" && [ "$rc" -eq "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL %s [%s %s]: want rc=%s + line %q; got rc=%s\n%s\n' \
      "$label" "$shell" "${*:-inherited}" "$want" "$line" "$rc" "$out" >&2
  fi
}

for shell in sh bash; do
  for loc in "LC_ALL=C" "LC_ALL=POSIX" "LC_ALL=C.UTF-8" "LANG=C.UTF-8" ""; do
    set --
    [ -z "$loc" ] || set -- -u LC_ALL -u LANG "$loc"
    expect "positive-cyrillic" "$POS" "$OK_LINE" 0 "$shell" "$@"
    expect "positive-yo" "$POS_YO" "$OK_LINE" 0 "$shell" "$@"
    expect "negative-no-cyrillic" "$NEG" "$FAIL_LINE" 1 "$shell" "$@"
  done
done

printf '=== validate-skill Cyrillic regression: %s passed, %s failed ===\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
