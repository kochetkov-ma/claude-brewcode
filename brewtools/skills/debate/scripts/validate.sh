#!/usr/bin/env bash
set -euo pipefail

# Validate all debate skill files exist
# Usage: bash validate.sh
# Returns: 0 if all files present, 1 if any missing

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MISSING=0

check_file() {
  if [ ! -f "$SKILL_DIR/$1" ]; then
    echo "MISSING: $1"
    MISSING=$((MISSING + 1))
  fi
}

# Core
check_file "SKILL.md"

# Agents
check_file "agents/debater-template.md"
check_file "agents/defender-template.md"
check_file "agents/critic-template.md"
check_file "agents/strategist-template.md"
check_file "agents/secretary.md"
check_file "agents/archetypes.md"

# References
check_file "references/setup-flow.md"
check_file "references/challenge-flow.md"
check_file "references/strategy-flow.md"
check_file "references/critic-flow.md"
check_file "references/discovery-flow.md"
check_file "references/summary-flow.md"

# Scripts
check_file "scripts/validate.sh"
check_file "scripts/init-log.sh"
check_file "scripts/append-log.sh"
check_file "scripts/read-log.sh"

if [ "$MISSING" -gt 0 ]; then
  echo "VALIDATION FAILED: $MISSING file(s) missing"
  exit 1
fi

echo "All debate skill files present ($SKILL_DIR)"
exit 0
