#!/bin/sh
# glm-verify.sh — Serve generated HTML and output URL for Playwright
# Usage: glm-verify.sh <html_dir> [port]
# Starts HTTP server, outputs URL, waits for Ctrl+C

set -e

HTML_DIR="${1:?Usage: glm-verify.sh <html_dir> [port]}"
PORT="${2:-8900}"

case "$PORT" in
  *[!0-9]*) echo "ERROR: Invalid port: $PORT" >&2; exit 1 ;;
esac

# Find entry point
if [ -f "$HTML_DIR/build/web/index.html" ]; then
  SERVE_DIR="$HTML_DIR/build/web"
elif [ -f "$HTML_DIR/dist/index.html" ]; then
  SERVE_DIR="$HTML_DIR/dist"
elif [ -f "$HTML_DIR/index.html" ]; then
  SERVE_DIR="$HTML_DIR"
else
  echo "ERROR: No index.html found in $HTML_DIR (checked build/web/, dist/, root)" >&2
  exit 1
fi

ABS_DIR=$(cd "$SERVE_DIR" && pwd)

echo "Serving: $ABS_DIR" >&2
echo "Port: $PORT" >&2

(cd "$ABS_DIR" && python3 -m http.server "$PORT") &
SERVER_PID=$!
sleep 1

# Verify server started
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "ERROR: Failed to start server" >&2
  exit 1
fi

echo "http://localhost:$PORT/"

echo "Server PID: $SERVER_PID (kill with: kill $SERVER_PID)" >&2
