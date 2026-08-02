#!/bin/bash
set -euo pipefail
# grepai Full Reindex: stop, clean, rebuild (sync), leave watch running

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/index-common.sh
. "$SCRIPT_DIR/lib/index-common.sh"

echo "=== Reindex: Stop Watch ==="
grepai watch --stop 2>/dev/null || true
pkill -f "grepai watch" 2>/dev/null || true
sleep 1

if pgrep -f "grepai watch" >/dev/null; then
  echo "⚠️ watch still running - force kill"
  pgrep -f "grepai watch" | xargs kill -9 2>/dev/null || true
  sleep 1
fi
echo "✅ Watch stopped"

if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /brewcode:grepai setup"
  exit 1
fi

echo ""
echo "=== Reindex: Clean ==="
mkdir -p .grepai/logs
for f in .grepai/index.gob .grepai/symbols.gob; do
  if [ -f "$f" ]; then
    rm -f "$f" && echo "  ✅ removed $(basename "$f")"
  else
    echo "  ⏭️ $(basename "$f") not found"
  fi
done
rm -f .grepai/logs/*.log 2>/dev/null && echo "  ✅ cleaned old logs" || true

# CRITICAL: Remove last_index_time to force full reindex (index skip bug)
if grep -q "last_index_time:" .grepai/config.yaml 2>/dev/null; then
  grep -v 'last_index_time:' .grepai/config.yaml > .grepai/config.yaml.tmp && mv .grepai/config.yaml.tmp .grepai/config.yaml
  echo "  ✅ removed last_index_time (prevents skip bug)"
fi
echo "✅ Cleanup complete"

echo ""
echo "=== Reindex: File Count ==="
estimate_timeout "$(count_indexable_files)"

echo ""
echo "=== Reindex: Build Index ==="
: > "$WATCH_LOG"
echo "Log: $WATCH_LOG"
echo "Monitor: tail -f $WATCH_LOG"
echo ""

start_watch_bg
wait_for_initial_scan "$TIMEOUT"

echo ""
echo "=== Reindex Complete ==="
report_index_state
echo "✅ Duration: ${ELAPSED}s"
