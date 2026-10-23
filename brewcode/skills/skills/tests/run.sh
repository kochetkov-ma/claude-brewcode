#!/usr/bin/env bash
# run.sh - offline regression for validate-skill.sh: locale-independent Cyrillic check, standalone exemption, name rule.
# Cyrillic cases run under sh and bash x LC_ALL=C, LANG=C.UTF-8, inherited locale; rc 1 on any failure.
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
  out="$(env "$@" "$shell" "$VALIDATE" "$dir" 2>&1 </dev/null)" || rc=$?
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

# make_bare <parent> -> contract-less skill under a marketplace root (marketplace.json, no plugin.json).
MKT="$WORK/mkt"
mkdir -p "$MKT/.claude-plugin"
printf '{}\n' > "$MKT/.claude-plugin/marketplace.json"
make_bare() {
  local dir="$MKT/$1/bare"
  mkdir -p "$dir"
  printf -- '---\nname: bare\ndescription: Fixture standalone skill without a prompt contract.\n---\n\n# Bare\n\nBody.\n' > "$dir/SKILL.md"
  (cd "$dir" && pwd)
}
for parent in skills openclaw; do
  dir="$(make_bare "$parent")"
  for shell in sh bash; do
    expect "standalone-$parent" "$dir" "✅ argument-hint exempt (standalone root skill): $dir" 0 "$shell"
  done
done
OTHER="$(make_bare other)"
for shell in sh bash; do
  expect "not-standalone-other" "$OTHER" '❌ argument-hint missing in frontmatter — prompt contract requires a prompt-first hint (section 1)' 1 "$shell"
done

# Name rule (Agent Skills spec): a-z/0-9 words joined by single hyphens; row = name|want-rc|exact line.
KEBAB_HINT='is not valid kebab-case (a-z/0-9 words joined by single hyphens)'
while IFS='|' read -r name want line; do
  dir="$(make_skill "$name" 'проверь' 'исправь')"
  for shell in sh bash; do
    expect "name-$name" "$dir" "$line" "$want" "$shell"
  done
done <<ROWS
a-b|0|✅ name: 'a-b' (3 chars)
a-|1|❌ name 'a-' $KEBAB_HINT
a--b|1|❌ name 'a--b' $KEBAB_HINT
-a|1|❌ name '-a' $KEBAB_HINT
ROWS

printf '=== validate-skill regression (Cyrillic, standalone, name): %s passed, %s failed ===\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
