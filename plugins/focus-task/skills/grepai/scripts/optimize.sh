#!/bin/bash
set -euo pipefail
# grepai Config Optimization (backup + reindex)

echo "=== Config Optimization ==="

# Check .grepai exists
if [ ! -d .grepai ]; then
  echo "❌ .grepai/ not found. Run setup first: /grepai setup"
  exit 1
fi

if [ ! -f .grepai/config.yaml ]; then
  echo "❌ config.yaml not found. Run setup first: /grepai setup"
  exit 1
fi

# Create backup
BACKUP_DIR=".grepai/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
cp .grepai/config.yaml "$BACKUP_DIR/config_$TIMESTAMP.yaml"
echo "✅ Backup: $BACKUP_DIR/config_$TIMESTAMP.yaml"

# Remove stale last_index_time to prepare for fresh config
if grep -q "last_index_time:" .grepai/config.yaml 2>/dev/null; then
  sed -i '' '/last_index_time:/d' .grepai/config.yaml
  echo "✅ Removed stale last_index_time"
fi

echo ""
echo "Config backed up. Agent will now analyze and regenerate config."
echo "After config update, run: /grepai reindex"
