#!/bin/bash
# Brewcode Rules Script
# Multi-function script for /brewcode:rules skill
# Usage: rules.sh <mode> [options]
#
# Modes:
#   read <path>           - Read knowledge file (first 100 lines)
#   check                 - Check existing rules files (main + specialized)
#   create                - Create missing main rules from templates
#   create-specialized <prefix> - Create specialized rules (e.g., test-avoid.md)
#   list                  - List all rule files (*-avoid.md, *-best-practice.md)
#   validate              - Validate table structure

set -euo pipefail

MODE="${1:-check}"
ARG="${2:-}"

# Self-location: derive plugin root from script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Path: scripts/rules.sh -> skills/rules/scripts -> skills/rules -> skills -> PLUGIN_ROOT
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
PLUGIN_TEMPLATES="$PLUGIN_ROOT/templates"

# Validate plugin structure
validate_plugin() {
  if [ ! -d "$PLUGIN_ROOT" ]; then
    echo "X Plugin root not found: $PLUGIN_ROOT"
    exit 1
  fi
  if [ ! -d "$PLUGIN_TEMPLATES" ]; then
    echo "X Templates not found: $PLUGIN_TEMPLATES"
    exit 1
  fi
}

# Read knowledge file
read_knowledge() {
  local path="$1"
  if [ -z "$path" ]; then
    echo "X Missing path argument"
    echo "Usage: rules.sh read <path>"
    exit 1
  fi
  if [ -f "$path" ]; then
    head -100 "$path"
  else
    echo "X File not found: $path"
    exit 1
  fi
}

# Check existing rules files (main + specialized)
check_rules() {
  echo "=== Check Rules Files ==="
  echo "--- Main Files ---"
  test -f .claude/rules/avoid.md && echo "V avoid.md exists" || echo "! avoid.md missing"
  test -f .claude/rules/best-practice.md && echo "V best-practice.md exists" || echo "! best-practice.md missing"

  echo "--- Specialized Files ---"
  local specialized_avoid specialized_bp
  specialized_avoid=$(find .claude/rules -maxdepth 1 -name "*-avoid.md" 2>/dev/null | grep -v "^.claude/rules/avoid.md$" || true)
  specialized_bp=$(find .claude/rules -maxdepth 1 -name "*-best-practice.md" 2>/dev/null | grep -v "^.claude/rules/best-practice.md$" || true)

  if [ -n "$specialized_avoid" ] || [ -n "$specialized_bp" ]; then
    echo "$specialized_avoid" | while read -r f; do [ -n "$f" ] && echo "V $(basename "$f")"; done
    echo "$specialized_bp" | while read -r f; do [ -n "$f" ] && echo "V $(basename "$f")"; done
  else
    echo "  (none found)"
  fi
}

# Create missing rules from templates
create_rules() {
  echo "=== Create Rules ==="
  validate_plugin

  mkdir -p .claude/rules

  if [ ! -f .claude/rules/avoid.md ]; then
    cp "$PLUGIN_TEMPLATES/rules/avoid.md.template" .claude/rules/avoid.md
    echo "V Created: .claude/rules/avoid.md"
  else
    echo ">> Preserved: .claude/rules/avoid.md (exists)"
  fi

  if [ ! -f .claude/rules/best-practice.md ]; then
    cp "$PLUGIN_TEMPLATES/rules/best-practice.md.template" .claude/rules/best-practice.md
    echo "V Created: .claude/rules/best-practice.md"
  else
    echo ">> Preserved: .claude/rules/best-practice.md (exists)"
  fi
}

# Validate table structure (main + specialized)
validate_rules() {
  echo "=== Validate Rules Structure ==="
  ERRORS=0

  # Validate main files
  if [ -f .claude/rules/avoid.md ]; then
    grep -q "^| #" .claude/rules/avoid.md && echo "V avoid.md valid structure" || { echo "X avoid.md invalid structure (missing table header)"; ERRORS=$((ERRORS+1)); }
  else
    echo "X avoid.md not found"
    ERRORS=$((ERRORS+1))
  fi

  if [ -f .claude/rules/best-practice.md ]; then
    grep -q "^| #" .claude/rules/best-practice.md && echo "V best-practice.md valid structure" || { echo "X best-practice.md invalid structure (missing table header)"; ERRORS=$((ERRORS+1)); }
  else
    echo "X best-practice.md not found"
    ERRORS=$((ERRORS+1))
  fi

  # Validate specialized files
  for f in .claude/rules/*-avoid.md .claude/rules/*-best-practice.md; do
    [ -f "$f" ] || continue
    # Skip main files
    [ "$(basename "$f")" = "avoid.md" ] && continue
    [ "$(basename "$f")" = "best-practice.md" ] && continue

    if grep -q "^| #" "$f"; then
      echo "V $(basename "$f") valid structure"
    else
      echo "X $(basename "$f") invalid structure (missing table header)"
      ERRORS=$((ERRORS+1))
    fi
  done

  exit $ERRORS
}

# List all rule files
list_rules() {
  echo "=== Rule Files in .claude/rules/ ==="
  mkdir -p .claude/rules

  echo "--- Avoid Files ---"
  local avoid_count=0
  for f in .claude/rules/avoid.md .claude/rules/*-avoid.md; do
    if [ -f "$f" ]; then
      rows=$(grep -c "^|" "$f" 2>/dev/null || echo 0)
      rows=$((rows - 2))  # Subtract header and separator
      [ $rows -lt 0 ] && rows=0
      echo "  $(basename "$f") ($rows entries)"
      avoid_count=$((avoid_count + 1))
    fi
  done
  [ $avoid_count -eq 0 ] && echo "  (none found)"

  echo "--- Best Practice Files ---"
  local bp_count=0
  for f in .claude/rules/best-practice.md .claude/rules/*-best-practice.md; do
    if [ -f "$f" ]; then
      rows=$(grep -c "^|" "$f" 2>/dev/null || echo 0)
      rows=$((rows - 2))  # Subtract header and separator
      [ $rows -lt 0 ] && rows=0
      echo "  $(basename "$f") ($rows entries)"
      bp_count=$((bp_count + 1))
    fi
  done
  [ $bp_count -eq 0 ] && echo "  (none found)"

  echo "---"
  echo "Total: $((avoid_count + bp_count)) rule files"
}

# Create specialized rules from template with prefix
create_specialized() {
  local prefix="$1"
  if [ -z "$prefix" ]; then
    echo "X Missing prefix argument"
    echo "Usage: rules.sh create-specialized <prefix>"
    echo "Example: rules.sh create-specialized test"
    exit 1
  fi

  echo "=== Create Specialized Rules: $prefix ==="
  validate_plugin
  mkdir -p .claude/rules

  local avoid_file=".claude/rules/${prefix}-avoid.md"
  local bp_file=".claude/rules/${prefix}-best-practice.md"

  if [ ! -f "$avoid_file" ]; then
    # Create from template with prefix substitution
    sed "s/# Avoid/# ${prefix^} Avoid/" "$PLUGIN_TEMPLATES/rules/avoid.md.template" > "$avoid_file"
    echo "V Created: $avoid_file"
  else
    echo ">> Preserved: $avoid_file (exists)"
  fi

  if [ ! -f "$bp_file" ]; then
    sed "s/# Best Practices/# ${prefix^} Best Practices/" "$PLUGIN_TEMPLATES/rules/best-practice.md.template" > "$bp_file"
    echo "V Created: $bp_file"
  else
    echo ">> Preserved: $bp_file (exists)"
  fi
}

# Main dispatch
case "$MODE" in
  read)
    read_knowledge "$ARG"
    ;;
  check)
    check_rules
    ;;
  create)
    create_rules
    ;;
  create-specialized)
    create_specialized "$ARG"
    ;;
  list)
    list_rules
    ;;
  validate)
    validate_rules
    ;;
  *)
    echo "Usage: rules.sh <mode> [options]"
    echo ""
    echo "Modes:"
    echo "  read <path>           - Read knowledge file (first 100 lines)"
    echo "  check                 - Check existing rules files (main + specialized)"
    echo "  create                - Create missing main rules from templates"
    echo "  create-specialized <prefix> - Create specialized rules (e.g., test-avoid.md)"
    echo "  list                  - List all rule files"
    echo "  validate              - Validate table structure"
    exit 1
    ;;
esac
