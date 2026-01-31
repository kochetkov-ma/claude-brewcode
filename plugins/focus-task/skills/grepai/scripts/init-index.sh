#!/bin/bash
# grepai Initialize Index

echo "=== Initialize Index ==="

# Count indexable files (estimate)
echo ""
echo "--- File Count ---"
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

# Init if no index exists
echo ""
if [ ! -f .grepai/index.gob ]; then
  grepai init
  if [ $? -eq 0 ]; then
    echo "✅ grepai init: complete"
  else
    echo "❌ grepai init: FAILED"
    exit 1
  fi
else
  echo "⏭️ index.gob already exists"
fi

# Create logs directory
mkdir -p .grepai/logs

# Start watch in background
grepai watch --background --log-dir .grepai/logs 2>/dev/null
echo "✅ grepai watch: started in background"

echo ""
echo "================================================"
echo "⏳ INDEXING RUNS IN BACKGROUND"
echo "================================================"
echo ""
echo "  Files: ~$FILE_COUNT | ETA: $EST_TIME"
echo ""
echo "  Check progress:"
echo "    grepai status                         # summary"
echo "    tail -f .grepai/logs/grepai-watch.log # live log"
echo ""
echo "  Index ready when:"
echo "    grepai search \"test\" --json | jq '.r | length'"
echo "    returns >0 results"
echo ""
echo "================================================"

exit 0
