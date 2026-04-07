#!/bin/sh
# test-parse-args.sh — Unit tests for parse-args.sh
# GIVEN/WHEN/THEN pattern: run parse-args.sh with args, grep output for expected KEY=VALUE

set -e

SCRIPT="$(dirname "$0")/../scripts/parse-args.sh"
PASS=0
FAIL=0

pass() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n  %s\n' "$1" "$2"
  FAIL=$((FAIL + 1))
}

assert_kv() {
  # assert_kv <test_name> <output> <key> <expected_value>
  TEST_NAME="$1"
  OUTPUT="$2"
  KEY="$3"
  EXPECTED="$4"
  ACTUAL=$(printf '%s\n' "$OUTPUT" | grep "^${KEY}=" | cut -d= -f2-)
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    pass "$TEST_NAME: $KEY=$EXPECTED"
  else
    fail "$TEST_NAME: $KEY" "expected='$EXPECTED' actual='$ACTUAL'"
  fi
}

assert_exit_nonzero() {
  TEST_NAME="$1"
  shift
  if sh "$SCRIPT" "$@" >/dev/null 2>&1; then
    fail "$TEST_NAME" "expected exit 1 but exited 0"
  else
    pass "$TEST_NAME"
  fi
}

# --- Test 1: Simple prompt ---
# GIVEN a single positional argument
# WHEN parse-args.sh runs
# THEN PROMPT and MODE and PROMPT_MISSING are set correctly
OUT=$(sh "$SCRIPT" "a dark workspace" 2>/dev/null)
assert_kv "TC1 simple prompt: PROMPT"         "$OUT" "PROMPT"         "a dark workspace"
assert_kv "TC1 simple prompt: MODE"           "$OUT" "MODE"           "generate"
assert_kv "TC1 simple prompt: PROMPT_MISSING" "$OUT" "PROMPT_MISSING" "false"

# --- Test 2: Flags --service --style --count ---
# GIVEN flags --service openai --style art --count 3 and a prompt
# WHEN parse-args.sh runs
# THEN SERVICE, STYLE, COUNT are set to the given values
OUT=$(sh "$SCRIPT" --service openai --style art --count 3 "a city" 2>/dev/null)
assert_kv "TC2 flags: SERVICE" "$OUT" "SERVICE" "openai"
assert_kv "TC2 flags: STYLE"   "$OUT" "STYLE"   "art"
assert_kv "TC2 flags: COUNT"   "$OUT" "COUNT"   "3"

# --- Test 3: Edit mode ---
# GIVEN --edit <image_path> <instructions>
# WHEN parse-args.sh runs
# THEN MODE=edit, EDIT_IMAGE and EDIT_INSTRUCTIONS are set
OUT=$(sh "$SCRIPT" --edit /tmp/img.png "add glow" 2>/dev/null)
assert_kv "TC3 edit mode: MODE"              "$OUT" "MODE"              "edit"
assert_kv "TC3 edit mode: EDIT_IMAGE"        "$OUT" "EDIT_IMAGE"        "/tmp/img.png"
assert_kv "TC3 edit mode: EDIT_INSTRUCTIONS" "$OUT" "EDIT_INSTRUCTIONS" "add glow"

# --- Test 4: Config mode ---
# GIVEN --config flag
# WHEN parse-args.sh runs
# THEN MODE=config
OUT=$(sh "$SCRIPT" --config 2>/dev/null)
assert_kv "TC4 config mode: MODE" "$OUT" "MODE" "config"

# --- Test 5: Update mode ---
# GIVEN --update flag
# WHEN parse-args.sh runs
# THEN MODE=update
OUT=$(sh "$SCRIPT" --update 2>/dev/null)
assert_kv "TC5 update mode: MODE" "$OUT" "MODE" "update"

# --- Test 6: No args → PROMPT_MISSING=true ---
# GIVEN no arguments
# WHEN parse-args.sh runs
# THEN PROMPT_MISSING=true
OUT=$(sh "$SCRIPT" 2>/dev/null)
assert_kv "TC6 no args: PROMPT_MISSING" "$OUT" "PROMPT_MISSING" "true"

# --- Test 7: Invalid service → exit 1 ---
# GIVEN --service invalid
# WHEN parse-args.sh runs
# THEN exit code is non-zero
assert_exit_nonzero "TC7 invalid service" --service invalid "test"

# --- Test 8: Invalid style → exit 1 ---
# GIVEN --style nope
# WHEN parse-args.sh runs
# THEN exit code is non-zero
assert_exit_nonzero "TC8 invalid style" --style nope "test"

# --- Test 9: Count out of range → exit 1 ---
# GIVEN --count 15
# WHEN parse-args.sh runs
# THEN exit code is non-zero
assert_exit_nonzero "TC9 count out of range" --count 15 "test"

# --- Test 10: Output flag ---
# GIVEN --output /tmp/custom and a prompt
# WHEN parse-args.sh runs
# THEN OUTPUT=/tmp/custom
OUT=$(sh "$SCRIPT" --output /tmp/custom "test" 2>/dev/null)
assert_kv "TC10 output flag: OUTPUT" "$OUT" "OUTPUT" "/tmp/custom"

# --- Test 11: Size flag ---
# GIVEN --size 1280x720 and a prompt
# WHEN parse-args.sh runs
# THEN SIZE=1280x720
OUT=$(sh "$SCRIPT" --size 1280x720 "test" 2>/dev/null)
assert_kv "TC11 size flag: SIZE" "$OUT" "SIZE" "1280x720"

# --- Summary ---
TOTAL=$((PASS + FAIL))
printf '\n=== RESULTS: %d/%d passed ===\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAILED: %d test(s) failed\n' "$FAIL"
  exit 1
fi
exit 0
