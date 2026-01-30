#!/bin/bash
# Focus-Task Rules Script
# Multi-function script for /focus-task:rules skill
# Usage: rules.sh <mode> [options]
#
# Modes:
#   read <path>  - Read knowledge file (first 100 lines)
#   check        - Check existing rules files
#   create       - Create missing rules from templates
#   validate     - Validate table structure

set -e

MODE="${1:-check}"
ARG="$2"

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
    cat "$path" | head -100
  else
    echo "X File not found: $path"
    exit 1
  fi
}

# Check existing rules files
check_rules() {
  echo "=== Check Rules Files ==="
  test -f .claude/rules/avoid.md && echo "V avoid.md exists" || echo "! avoid.md missing"
  test -f .claude/rules/best-practice.md && echo "V best-practice.md exists" || echo "! best-practice.md missing"
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

# Validate table structure
validate_rules() {
  echo "=== Validate Rules Structure ==="
  ERRORS=0

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

  exit $ERRORS
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
  validate)
    validate_rules
    ;;
  *)
    echo "Usage: rules.sh <mode> [options]"
    echo ""
    echo "Modes:"
    echo "  read <path>  - Read knowledge file (first 100 lines)"
    echo "  check        - Check existing rules files"
    echo "  create       - Create missing rules from templates"
    echo "  validate     - Validate table structure"
    exit 1
    ;;
esac
