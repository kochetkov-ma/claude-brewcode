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
