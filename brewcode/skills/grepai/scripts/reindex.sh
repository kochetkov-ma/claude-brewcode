#!/bin/bash
set -euo pipefail
# grepai Full Reindex: stop, clean, rebuild (sync), start background

echo "=== Reindex: Stop Watch ==="
grepai watch --stop 2>/dev/null || true
pkill -f "grepai watch" 2>/dev/null || true
sleep 1

# Force kill if still running
if pgrep -f "grepai watch" >/dev/null; then
  echo "⚠️ watch still running - force kill"
  pgrep -f "grepai watch" | xargs kill -9 2>/dev/null || true
  sleep 1
fi
echo "✅ Watch stopped"

# Check .grepai exists
if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /grepai setup"
  exit 1
fi

echo ""
echo "=== Reindex: Clean ==="
mkdir -p .grepai/logs
rm -f .grepai/index.gob && echo "  ✅ removed index.gob" || echo "  ⏭️ index.gob not found"
rm -f .grepai/symbols.gob && echo "  ✅ removed symbols.gob" || echo "  ⏭️ symbols.gob not found"
rm -f .grepai/logs/*.log 2>/dev/null && echo "  ✅ cleaned old logs" || true

# CRITICAL: Remove last_index_time to force full reindex
if grep -q "last_index_time:" .grepai/config.yaml 2>/dev/null; then
  grep -v 'last_index_time:' .grepai/config.yaml > .grepai/config.yaml.tmp && mv .grepai/config.yaml.tmp .grepai/config.yaml
  echo "  ✅ removed last_index_time (prevents skip bug)"
fi
echo "✅ Cleanup complete"

echo ""
echo "=== Reindex: File Count ==="

# Count indexable files (estimate)
FILE_COUNT=$(find . -type f \( -name "*.java" -o -name "*.kt" -o -name "*.kts" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.go" -o -name "*.py" -o -name "*.rs" -o -name "*.sh" -o -name "*.md" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/target/*" -not -path "*/build/*" -not -path "*/dist/*" -not -path "*/.grepai/*" 2>/dev/null | wc -l | tr -d ' ')
echo "Files to index: ~$FILE_COUNT"

# Estimate time and set timeout
if [ "$FILE_COUNT" -lt 100 ]; then
  EST_TIME="<1 min"
  TIMEOUT=120
elif [ "$FILE_COUNT" -lt 500 ]; then
  EST_TIME="1-3 min"
  TIMEOUT=300
elif [ "$FILE_COUNT" -lt 1000 ]; then
  EST_TIME="3-7 min"
  TIMEOUT=600
elif [ "$FILE_COUNT" -lt 5000 ]; then
  EST_TIME="10-30 min"
  TIMEOUT=1800
else
  EST_TIME="30+ min"
  TIMEOUT=3600
fi
echo "Estimated time: $EST_TIME"

echo ""
echo "=== Reindex: Build Index ==="
WATCH_LOG=".grepai/logs/grepai-watch.log"
> "$WATCH_LOG"  # truncate

echo "Log: $WATCH_LOG"
echo "Monitor: tail -f $WATCH_LOG"
echo ""

# Start watch in BACKGROUND with logging
# grepai watch --background writes to grepai-watch.log automatically
grepai watch --background --log-dir .grepai/logs 2>/dev/null
sleep 1

if ! pgrep -f "grepai watch" >/dev/null; then
  echo "❌ Failed to start grepai watch"
  cat "$WATCH_LOG" 2>/dev/null
  exit 1
fi
echo "✅ Watch started in background (PID: $(pgrep -f 'grepai watch'))"

# Poll for "Initial scan complete" in log
ELAPSED=0
echo "⏳ Waiting for indexing to complete..."

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  # Check completion marker in log
  if grep -q "Initial scan complete" "$WATCH_LOG" 2>/dev/null; then
    echo ""
    echo "✅ Initial scan complete"
    break
  fi

  # Check watch still running
  if ! pgrep -f "grepai watch" >/dev/null; then
    echo ""
    echo "❌ Watch process died unexpectedly"
    cat "$WATCH_LOG" 2>/dev/null
    exit 1
  fi

  # Progress every 5s with file sizes
  if [ $((ELAPSED % 5)) -eq 0 ] && [ "$ELAPSED" -gt 0 ]; then
    IDX_SIZE=$(du -h .grepai/index.gob 2>/dev/null | cut -f1 || echo "0")
    SYM_SIZE=$(du -h .grepai/symbols.gob 2>/dev/null | cut -f1 || echo "0")
    # Show last indexing line from log
    LAST_LINE=$(grep -E "Indexing|Processing" "$WATCH_LOG" 2>/dev/null | tail -1 | head -c 80 || true)
    echo "⏳ ${ELAPSED}s | index: ${IDX_SIZE} | symbols: ${SYM_SIZE}"
    [ -n "$LAST_LINE" ] && echo "   $LAST_LINE"
  fi

  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
  echo ""
  echo "❌ Timeout after ${TIMEOUT}s"
  grepai watch --stop 2>/dev/null || true
  exit 1
fi

# Extract stats from log
STATS=$(grep "Initial scan complete" "$WATCH_LOG" | tail -1 || true)
echo "   $STATS"

# Watch is already running in background - no need to restart
echo ""
echo "=== Reindex Complete ==="
test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob | cut -f1)" || echo "❌ index.gob missing"
test -f .grepai/symbols.gob && echo "✅ symbols.gob: $(du -h .grepai/symbols.gob | cut -f1)" || echo "⚠️ symbols.gob missing"
pgrep -f "grepai watch" >/dev/null && echo "✅ watch: running (PID: $(pgrep -f 'grepai watch'))" || echo "⚠️ watch: not running"
echo "✅ Duration: ${ELAPSED}s"
