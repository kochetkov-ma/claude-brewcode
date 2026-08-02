#!/bin/bash
set -euo pipefail
# grepai Initialize Index

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/index-common.sh
. "$SCRIPT_DIR/lib/index-common.sh"

echo "=== Initialize Index ==="

if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /brewcode:grepai setup"
  exit 1
fi

mkdir -p .grepai/logs

echo ""
echo "--- File Count ---"
estimate_timeout "$(count_indexable_files)"

echo ""
# Index already present -> just make sure watch is up
if [ -f .grepai/index.gob ]; then
  echo "⏭️ index.gob already exists ($(du -h .grepai/index.gob | cut -f1))"
  echo ""
  echo "--- Starting Watch ---"
  if pgrep -f "grepai watch" >/dev/null; then
    echo "✅ grepai watch: already running (PID: $(pgrep -f 'grepai watch' | tr '\n' ' '))"
  else
    start_watch_bg
  fi
  echo ""
  echo "=== Init Complete ==="
  report_index_state
  exit 0
fi

echo "--- Building Index ---"
: > "$WATCH_LOG"
echo ""
echo "  Log: $WATCH_LOG"
echo "  Monitor: tail -f $WATCH_LOG"
echo ""

start_watch_bg
wait_for_initial_scan "$TIMEOUT"

echo ""
echo "=== Init Complete ==="
report_index_state
echo "✅ Duration: ${ELAPSED}s"
