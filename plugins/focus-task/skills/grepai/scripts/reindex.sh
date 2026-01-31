#!/bin/bash
# grepai Full Reindex: stop, clean, rebuild, start

echo "=== Reindex: Stop & Clean ==="

# Stop watch first
grepai watch --stop 2>/dev/null
pkill -f "grepai watch" 2>/dev/null
sleep 1

# Verify stopped
if pgrep -f "grepai watch" >/dev/null; then
  echo "⚠️ watch still running - force kill"
  kill -9 $(pgrep -f "grepai watch") 2>/dev/null
  sleep 1
fi

# Check .grepai exists
if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /grepai setup"
  exit 1
fi

# Clean artifacts (keep config.yaml structure!)
echo "Cleaning artifacts..."
rm -f .grepai/index.gob && echo "  ✅ removed index.gob" || echo "  ⏭️ index.gob not found"
rm -f .grepai/symbols.gob && echo "  ✅ removed symbols.gob" || echo "  ⏭️ symbols.gob not found"
rm -rf .grepai/backups && echo "  ✅ removed backups/" || echo "  ⏭️ backups/ not found"
rm -rf .grepai/logs && echo "  ✅ removed logs/" || echo "  ⏭️ logs/ not found"

# CRITICAL: Remove last_index_time to force full reindex
# Files with ModTime < last_index_time are SKIPPED by grepai!
if grep -q "last_index_time:" .grepai/config.yaml 2>/dev/null; then
  sed -i '' '/last_index_time:/d' .grepai/config.yaml
  echo "  ✅ removed last_index_time (prevents skip bug)"
fi

echo "✅ Cleanup complete"

echo ""
echo "=== Reindex: File Count ==="

# Count indexable files (estimate)
FILE_COUNT=$(find . -type f \( -name "*.java" -o -name "*.kt" -o -name "*.kts" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" -o -name "*.jsx" -o -name "*.go" -o -name "*.py" -o -name "*.rs" -o -name "*.sh" -o -name "*.md" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/target/*" -not -path "*/build/*" -not -path "*/dist/*" -not -path "*/.grepai/*" 2>/dev/null | wc -l | tr -d ' ')
echo "Files to index: ~$FILE_COUNT"

# Estimate time (Ollama bge-m3: ~2-3 files/sec average)
if [ "$FILE_COUNT" -lt 100 ]; then
  EST_TIME="<1 min"
elif [ "$FILE_COUNT" -lt 500 ]; then
  EST_TIME="1-3 min"
elif [ "$FILE_COUNT" -lt 1000 ]; then
  EST_TIME="3-7 min"
elif [ "$FILE_COUNT" -lt 5000 ]; then
  EST_TIME="10-30 min"
else
  EST_TIME="30+ min"
fi
echo "Estimated time: $EST_TIME"

echo ""
echo "=== Reindex: Rebuild ==="

# Rebuild index
grepai init 2>&1
INIT_STATUS=$?

if [ $INIT_STATUS -eq 0 ]; then
  echo "✅ grepai init: complete"
  test -f .grepai/index.gob && echo "   index.gob: $(du -h .grepai/index.gob | cut -f1)"
else
  echo "❌ grepai init: FAILED (exit $INIT_STATUS)"
  exit 1
fi

echo ""
echo "=== Reindex: Start Watch ==="

# Create logs directory
mkdir -p .grepai/logs

# Start watch
grepai watch --background --log-dir .grepai/logs 2>/dev/null

# Verify
sleep 1
if pgrep -f "grepai watch" >/dev/null; then
  echo "✅ watch started (PID: $(pgrep -f 'grepai watch'))"
else
  echo "⚠️ watch not started - check manually"
fi

echo ""
echo "=== Reindex Complete ==="
test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob | cut -f1)" || echo "❌ index.gob missing"
pgrep -f "grepai watch" >/dev/null && echo "✅ watch: running" || echo "⚠️ watch: not running"

echo ""
echo "================================================"
echo "⏳ REINDEXING RUNS IN BACKGROUND"
echo "================================================"
echo ""
echo "  Files: ~$FILE_COUNT | ETA: $EST_TIME"
echo ""
echo "  Check progress:"
echo "    grepai status                         # summary"
echo "    tail -f .grepai/logs/grepai-watch.log # live log"
echo ""
echo "================================================"
