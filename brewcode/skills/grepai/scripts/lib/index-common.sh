#!/bin/bash
# Shared index-build helpers for init-index.sh and reindex.sh.
# Source it: . "$(dirname "$0")/lib/index-common.sh"

WATCH_LOG=".grepai/logs/grepai-watch.log"

INDEX_EXTS=(java kt kts js ts tsx jsx go py rs sh md yaml yml json)
INDEX_PRUNE=(node_modules .git target build dist .grepai)

# Echoes the estimated number of indexable files.
count_indexable_files() {
  local find_args=() ext prune first=1
  for ext in "${INDEX_EXTS[@]}"; do
    if [ "$first" -eq 1 ]; then
      find_args+=(-name "*.$ext"); first=0
    else
      find_args+=(-o -name "*.$ext")
    fi
  done
  local prune_args=()
  for prune in "${INDEX_PRUNE[@]}"; do
    prune_args+=(-not -path "*/$prune/*")
  done
  find . -type f \( "${find_args[@]}" \) "${prune_args[@]}" 2>/dev/null | wc -l | tr -d ' '
}

# Sets TIMEOUT + EST_TIME from a file count, and prints both.
estimate_timeout() {
  local count="$1"
  if [ "$count" -lt 100 ]; then
    EST_TIME="<1 min"; TIMEOUT=120
  elif [ "$count" -lt 500 ]; then
    EST_TIME="1-3 min"; TIMEOUT=300
  elif [ "$count" -lt 1000 ]; then
    EST_TIME="3-7 min"; TIMEOUT=600
  elif [ "$count" -lt 5000 ]; then
    EST_TIME="10-30 min"; TIMEOUT=1800
  else
    EST_TIME="30+ min"; TIMEOUT=3600
  fi
  echo "Files to index: ~$count"
  echo "Estimated time: $EST_TIME"
}

# Starts `grepai watch` detached; exits 1 with the log tail if it does not come up.
start_watch_bg() {
  mkdir -p .grepai/logs
  grepai watch --background --log-dir .grepai/logs 2>/dev/null || true
  sleep 1
  if ! pgrep -f "grepai watch" >/dev/null; then
    echo "❌ Failed to start grepai watch"
    cat "$WATCH_LOG" 2>/dev/null || true
    exit 1
  fi
  echo "✅ Watch started (PID: $(pgrep -f 'grepai watch' | tr '\n' ' '))"
}

# Polls the watch log until "Initial scan complete"; sets ELAPSED. Exits 1 on death/timeout.
wait_for_initial_scan() {
  local timeout="$1"
  ELAPSED=0
  echo "⏳ Waiting for indexing to complete..."
  while [ "$ELAPSED" -lt "$timeout" ]; do
    if grep -q "Initial scan complete" "$WATCH_LOG" 2>/dev/null; then
      echo ""
      echo "✅ Initial scan complete"
      echo "   $(grep 'Initial scan complete' "$WATCH_LOG" | tail -1)"
      return 0
    fi
    if ! pgrep -f "grepai watch" >/dev/null; then
      echo ""
      echo "❌ Watch process died unexpectedly"
      cat "$WATCH_LOG" 2>/dev/null || true
      exit 1
    fi
    if [ $((ELAPSED % 5)) -eq 0 ] && [ "$ELAPSED" -gt 0 ]; then
      local idx sym last
      idx=$(du -h .grepai/index.gob 2>/dev/null | cut -f1 || echo "0")
      sym=$(du -h .grepai/symbols.gob 2>/dev/null | cut -f1 || echo "0")
      last=$(grep -E "Indexing|Processing" "$WATCH_LOG" 2>/dev/null | tail -1 | head -c 80 || true)
      echo "⏳ ${ELAPSED}s | index: ${idx:-0} | symbols: ${sym:-0}"
      [ -n "$last" ] && echo "   $last"
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
  done
  echo ""
  echo "❌ Timeout after ${timeout}s"
  grepai watch --stop 2>/dev/null || true
  exit 1
}

# Final index/watch summary.
report_index_state() {
  test -f .grepai/index.gob && echo "✅ index.gob: $(du -h .grepai/index.gob | cut -f1)" || echo "❌ index.gob missing"
  test -f .grepai/symbols.gob && echo "✅ symbols.gob: $(du -h .grepai/symbols.gob | cut -f1)" || echo "⚠️ symbols.gob missing"
  pgrep -f "grepai watch" >/dev/null && echo "✅ watch: running (PID: $(pgrep -f 'grepai watch' | tr '\n' ' '))" || echo "⚠️ watch: not running"
}
