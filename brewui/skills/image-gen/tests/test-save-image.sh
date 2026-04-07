#!/bin/sh
# test-save-image.sh — Unit tests for save-image.sh
# GIVEN/WHEN/THEN pattern: invoke save-image.sh, inspect outputs and filesystem artifacts

set -e

SCRIPT="$(dirname "$0")/../scripts/save-image.sh"
WORK_DIR="/tmp/image-gen-tests"
PASS=0
FAIL=0

# Tiny 1x1 valid PNG as base64 (single-pixel transparent PNG)
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

pass() {
  printf 'PASS: %s\n' "$1"
  PASS=$((PASS + 1))
}

fail() {
  printf 'FAIL: %s\n  %s\n' "$1" "$2"
  FAIL=$((FAIL + 1))
}

setup() {
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"
  # Write test base64 file once
  printf '%s' "$PNG_B64" > "$WORK_DIR/test-b64.txt"
}

setup

# --- Test 1: No args → exit 1 with usage message ---
# GIVEN no arguments
# WHEN save-image.sh runs
# THEN exit code is non-zero
if sh "$SCRIPT" >/dev/null 2>&1; then
  fail "TC1 no args" "expected exit 1 but exited 0"
else
  pass "TC1 no args: exits non-zero"
fi

# --- Test 2: Create from base64 file → creates PNG + JSON sidecar ---
# GIVEN a valid base64-encoded PNG file as source
# WHEN save-image.sh runs with output dir, title, service, and prompt
# THEN a PNG file and a JSON sidecar are created
OUT_DIR="$WORK_DIR/tc2"
SAVED=$(sh "$SCRIPT" "$WORK_DIR/test-b64.txt" "$OUT_DIR" "dark workspace" "gemini" "a dark workspace" 2>/dev/null)

if [ -f "$SAVED" ]; then
  pass "TC2 base64 decode: PNG file created"
else
  fail "TC2 base64 decode: PNG file created" "file not found: $SAVED"
fi

SIDECAR="${SAVED%.png}.json"
if [ -f "$SIDECAR" ]; then
  pass "TC2 base64 decode: JSON sidecar created"
else
  fail "TC2 base64 decode: JSON sidecar created" "sidecar not found: $SIDECAR"
fi

# --- Test 3: Naming convention check: YYYYMMDD-HHMMSS_*_gemini_v1.png ---
# GIVEN save-image.sh ran as in TC2
# WHEN we inspect the returned filename
# THEN it matches the expected pattern
FNAME=$(basename "$SAVED")
if printf '%s\n' "$FNAME" | grep -qE '^[0-9]{8}-[0-9]{6}_.+_gemini_v[0-9]+\.png$'; then
  pass "TC3 naming convention: $FNAME matches YYYYMMDD-HHMMSS_*_gemini_vN.png"
else
  fail "TC3 naming convention" "filename '$FNAME' does not match pattern"
fi

# --- Test 4: Auto-versioning: run twice → v1 and v2 ---
# GIVEN we call save-image.sh twice with identical arguments in the same second
# WHEN we inspect the version suffix
# THEN the first file is v1 and the second is v2
OUT_DIR="$WORK_DIR/tc4"
mkdir -p "$OUT_DIR"

# Force both into the same timestamp by pre-creating the v1 file
TS=$(date +"%Y%m%d-%H%M%S")
PREEXIST="${OUT_DIR}/${TS}_version-test_gemini_v1.png"
touch "$PREEXIST"

SAVED2=$(sh "$SCRIPT" "$WORK_DIR/test-b64.txt" "$OUT_DIR" "version test" "gemini" "version test" 2>/dev/null)
FNAME2=$(basename "$SAVED2")

if printf '%s\n' "$FNAME2" | grep -qE '_v2\.png$'; then
  pass "TC4 auto-versioning: second run produces v2"
else
  fail "TC4 auto-versioning" "expected v2 suffix, got: $FNAME2"
fi

# --- Test 5: Sidecar JSON has all required fields ---
# GIVEN save-image.sh ran successfully (reuse TC2 output)
# WHEN we read the sidecar JSON
# THEN it contains prompt, provider, model, timestamp, filename
SIDECAR="${SAVED%.png}.json"
JSON=$(cat "$SIDECAR")

check_json_field() {
  FIELD="$1"
  if printf '%s\n' "$JSON" | grep -q "\"$FIELD\""; then
    pass "TC5 sidecar field: $FIELD"
  else
    fail "TC5 sidecar field: $FIELD" "not found in $SIDECAR"
  fi
}

check_json_field "prompt"
check_json_field "provider"
check_json_field "model"
check_json_field "timestamp"
check_json_field "filename"

# --- Test 6: Output dir creation: non-existing dir gets created ---
# GIVEN an output directory that does not exist
# WHEN save-image.sh runs
# THEN the directory is created and the file is saved
NEW_DIR="$WORK_DIR/tc6/nested/new"
SAVED3=$(sh "$SCRIPT" "$WORK_DIR/test-b64.txt" "$NEW_DIR" "newdir test" "gemini" "newdir prompt" 2>/dev/null)

if [ -d "$NEW_DIR" ]; then
  pass "TC6 dir creation: output directory created"
else
  fail "TC6 dir creation: output directory created" "dir not found: $NEW_DIR"
fi

if [ -f "$SAVED3" ]; then
  pass "TC6 dir creation: file saved in new dir"
else
  fail "TC6 dir creation: file saved in new dir" "file not found: $SAVED3"
fi

# --- Test 7: Title truncation — long title → max 30 chars in filename stem ---
# GIVEN a very long title (>30 chars)
# WHEN save-image.sh runs
# THEN the title portion of the filename is truncated to 30 characters
LONG_TITLE="this is an extremely long title that should definitely be truncated"
OUT_DIR="$WORK_DIR/tc7"
SAVED4=$(sh "$SCRIPT" "$WORK_DIR/test-b64.txt" "$OUT_DIR" "$LONG_TITLE" "openai" "trunc test" 2>/dev/null)
FNAME4=$(basename "$SAVED4")

# Remove timestamp prefix (YYYYMMDD-HHMMSS_) and suffix (_service_vN.png)
# Remaining is the title portion
TITLE_PART=$(printf '%s\n' "$FNAME4" | sed 's/^[0-9]*-[0-9]*_//' | sed 's/_openai_v[0-9]*\.png$//')
TITLE_LEN=$(printf '%s' "$TITLE_PART" | wc -c | tr -d ' ')

if [ "$TITLE_LEN" -le 30 ]; then
  pass "TC7 title truncation: length=$TITLE_LEN (<=30) in '$TITLE_PART'"
else
  fail "TC7 title truncation" "title part '$TITLE_PART' has $TITLE_LEN chars, expected <=30"
fi

# --- Cleanup ---
rm -rf "$WORK_DIR"

# --- Summary ---
TOTAL=$((PASS + FAIL))
printf '\n=== RESULTS: %d/%d passed ===\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAILED: %d test(s) failed\n' "$FAIL"
  exit 1
fi
exit 0
