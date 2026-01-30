#!/bin/bash
# grepai Initialize Index

echo "=== Initialize Index ==="

# Init if no index exists
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
