#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  printf '  \xe2\x9c\x85 PASS: %s\n' "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf '  \xe2\x9d\x8c FAIL: %s\n' "$1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_file_exists() {
  local file="$1"
  local desc="$2"
  if [[ -f "$file" ]]; then
    pass "$desc"
  else
    fail "$desc — file not found: $file"
  fi
}

check_contains() {
  local file="$1"
  local pattern="$2"
  local desc="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    pass "$desc"
  else
    fail "$desc — pattern not found: $pattern"
  fi
}

echo "=== Text-Optimize Skill Tests ==="
echo ""

# --- Structural Validation ---

echo "[Structure]"

check_file_exists "$SKILL_DIR/SKILL.md" "SKILL.md exists"

for section in "Modes" "Smart Auto-Detection" "Deep Mode Pipeline" "Standard Mode Pipeline" "Max Mode Pipeline" "Deduplication Pass" "Loss Budget" "Iron Rules"; do
  check_contains "$SKILL_DIR/SKILL.md" "$section" "SKILL.md contains '$section' section"
done

check_file_exists "$SKILL_DIR/references/rules-review.md" "Reference: rules-review.md exists"
check_file_exists "$SKILL_DIR/references/deep-compression.md" "Reference: deep-compression.md exists"
check_file_exists "$SKILL_DIR/references/standard-compression.md" "Reference: standard-compression.md exists"
check_file_exists "$SKILL_DIR/references/max-compression.md" "Reference: max-compression.md exists"

AGENT_DIR="$(cd "$SKILL_DIR/../../agents" && pwd)"
AGENT_FILE="$AGENT_DIR/text-optimizer.toml"
check_file_exists "$AGENT_FILE" "Agent: text-optimizer.toml exists"
for key in "name = " "description = " "developer_instructions = "; do
  check_contains "$AGENT_FILE" "$key" "text-optimizer.toml declares $key"
done

check_file_exists "$SKILL_DIR/tests/input-prose.md" "Fixture: input-prose.md exists"
check_file_exists "$SKILL_DIR/tests/input-agents-md.md" "Fixture: input-agents-md.md exists"
check_file_exists "$SKILL_DIR/tests/input-readme.md" "Fixture: input-readme.md exists"

echo ""

# --- Content Validation ---

echo "[Content]"

for flag in "\-l" "\-s" "\-d" "\-x"; do
  check_contains "$SKILL_DIR/SKILL.md" "$flag" "SKILL.md contains mode flag '$flag'"
done

check_contains "$SKILL_DIR/SKILL.md" "request_user_input" "SKILL.md contains request_user_input in allowed-tools"
check_contains "$SKILL_DIR/SKILL.md" "text-guard.sh" "SKILL.md wires the Phase 0/3 preservation guard"
check_file_exists "$SKILL_DIR/scripts/text-guard.sh" "Script: text-guard.sh exists"
check_file_exists "$SKILL_DIR/tests/suite-guard.mjs" "Suite: suite-guard.mjs exists"
check_file_exists "$SKILL_DIR/tests/run.sh" "Runner: tests/run.sh exists"

check_contains "$SKILL_DIR/references/deep-compression.md" "DICT" "deep-compression.md contains DICT section"
check_contains "$SKILL_DIR/references/deep-compression.md" "Symbol Substitution" "deep-compression.md contains Symbol Substitution section"

check_contains "$SKILL_DIR/references/standard-compression.md" "Verification Checklist" "standard-compression.md contains Verification Checklist section"


check_contains "$SKILL_DIR/references/rules-review.md" "Compression References" "rules-review.md contains Compression References section"

echo ""

# --- Consistency Validation ---

echo "[Consistency]"

# Check that SKILL.md references C.7, C.8 (not just C.1-C.6)
if grep -q "C\.1-C\.8" "$SKILL_DIR/SKILL.md"; then
  pass "SKILL.md references C.1-C.8 range"
else
  fail "SKILL.md still references old C.1-C.6 range instead of C.1-C.8"
fi

# Check that SKILL.md references L category
if grep -q "L\.1-L\.8" "$SKILL_DIR/SKILL.md"; then
  pass "SKILL.md references L.1-L.8 category"
else
  fail "SKILL.md missing L.1-L.8 (LLM Comprehension) category"
fi

# Check that SKILL.md references T.10
if grep -q "T\.10" "$SKILL_DIR/SKILL.md"; then
  pass "SKILL.md references T.10 rule"
else
  fail "SKILL.md missing T.10 (strip whitespace) rule"
fi

# Check D category present everywhere
if grep -q "D\.1-D\.6" "$SKILL_DIR/SKILL.md"; then
  pass "SKILL.md references D.1-D.6 (Deduplication) category"
else
  fail "SKILL.md missing D.1-D.6 (Deduplication) category"
fi

check_contains "$SKILL_DIR/references/rules-review.md" "## D - Deduplication" "rules-review.md contains D - Deduplication section"
check_contains "$SKILL_DIR/references/rules-review.md" "52 rules" "rules-review.md declares 52 rules"
check_contains "$SKILL_DIR/references/rules-review.md" "Wrong-Merge Guard" "rules-review.md contains D.6 Wrong-Merge Guard"
check_contains "$SKILL_DIR/references/rules-review.md" "## A - Aggressive Lossy" "rules-review.md contains A - Aggressive Lossy section"
check_contains "$SKILL_DIR/SKILL.md" "A\.1-A\.4" "SKILL.md references A.1-A.4 (aggressive lossy) range"
check_contains "$SKILL_DIR/references/deep-compression.md" "Redundancy Factoring" "deep-compression.md contains Redundancy Factoring section"
check_contains "$SKILL_DIR/references/max-compression.md" "Self-QA probe" "max-compression.md contains Self-QA probe round"
check_contains "$SKILL_DIR/references/max-compression.md" "merged:" "max-compression.md loss list supports merged label"
check_contains "$SKILL_DIR/SKILL.md" "Loss Budget" "SKILL.md contains Loss Budget section"




# Check no duplicate abbreviation cfg vs config in deep-compression
if ! grep -q "| config |" "$SKILL_DIR/references/deep-compression.md" 2>/dev/null; then
  pass "No duplicate 'config' abbreviation in deep-compression.md"
else
  fail "Duplicate 'config' abbreviation found (should only have 'cfg')"
fi

echo ""

# --- Summary ---

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "=== Results: $PASS_COUNT/$TOTAL passed ==="

if [[ $FAIL_COUNT -gt 0 ]]; then
  exit 1
fi
