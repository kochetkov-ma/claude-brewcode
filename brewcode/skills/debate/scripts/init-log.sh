#!/usr/bin/env bash
set -euo pipefail

# Initialize debate report directory and empty JSONL log
# Usage: bash init-log.sh
# Output: REPORT_DIR=<path> and LOG_FILE=<path>

# Timestamp: use gdate if available (Mac + coreutils), fallback to POSIX date
if command -v gdate >/dev/null 2>&1; then
  TS="$(gdate -u +%Y%m%d-%H%M%S)"
elif date -u +%Y%m%d-%H%M%S >/dev/null 2>&1; then
  TS="$(date -u +%Y%m%d-%H%M%S)"
else
  TS="$(date +%Y%m%d-%H%M%S)"
fi

BASE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REPORT_DIR="${BASE}/.claude/reports/${TS}_debate"
LOG_FILE="${REPORT_DIR}/debate-log.jsonl"

mkdir -p "$REPORT_DIR"
touch "$LOG_FILE"

echo "REPORT_DIR=${REPORT_DIR}"
echo "LOG_FILE=${LOG_FILE}"
