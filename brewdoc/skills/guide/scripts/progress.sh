#!/bin/sh
# CRUD operations on guide progress JSON file
# Usage: progress.sh <command> [args]
#
# Commands:
#   path                  - Echo the progress file path
#   read                  - Output progress JSON (default if missing)
#   complete <topic>      - Mark topic as completed
#   lang <code>           - Set language code
#   reset                 - Reset to default JSON
#   status                - Show completion summary

set -e

# --- Constants ---

VALID_TOPICS="overview installation killer-flow teams skills-catalog agents-catalog customization integration advanced"
TOPIC_COUNT=9

DEFAULT_JSON='{"lang":"","completed":[],"last_topic":"","last_ts":"","shown_count":{}}'

# --- Helpers ---

has_cmd() { command -v "$1" >/dev/null 2>&1; }

require_jq() {
  if ! has_cmd jq; then
    echo "Error: jq is required but not installed." >&2
    echo "Install: brew install jq (macOS) or apt-get install jq (Linux)" >&2
    exit 1
  fi
}

die() { echo "Error: $*" >&2; exit 1; }

get_progress_path() {
  echo "${HOME}/.claude/brewdoc/guide-progress.json"
}

get_iso_ts() {
  if has_cmd date; then
    date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

ensure_file() {
  _path=$(get_progress_path)
  _dir=$(dirname "$_path")
  if [ ! -f "$_path" ]; then
    mkdir -p "$_dir" 2>/dev/null || true
    echo "$DEFAULT_JSON" > "$_path"
  fi
}

is_valid_topic() {
  _topic="$1"
  for _t in $VALID_TOPICS; do
    if [ "$_t" = "$_topic" ]; then
      return 0
    fi
  done
  return 1
}

# --- Commands ---

cmd_path() {
  get_progress_path
}

cmd_read() {
  _path=$(get_progress_path)
  if [ -f "$_path" ]; then
    cat "$_path"
  else
    echo "$DEFAULT_JSON"
  fi
}

cmd_complete() {
  require_jq
  _topic="${1:-}"
  [ -z "$_topic" ] && die "Usage: progress.sh complete <topic>"
  is_valid_topic "$_topic" || die "Invalid topic: $_topic. Valid: $VALID_TOPICS"

  ensure_file
  _path=$(get_progress_path)
  _ts=$(get_iso_ts)
  _json=$(cat "$_path")

  # Check if already completed
  _already=$(echo "$_json" | jq -r --arg t "$_topic" '.completed | index($t) // empty')
  if [ -n "$_already" ]; then
    # Already completed — just update shown_count
    _json=$(echo "$_json" | jq --arg t "$_topic" '.shown_count[$t] = ((.shown_count[$t] // 0) + 1)')
  else
    # Add to completed, update last_topic, last_ts, increment shown_count
    _json=$(echo "$_json" | jq \
      --arg t "$_topic" \
      --arg ts "$_ts" \
      '.completed += [$t] | .last_topic = $t | .last_ts = $ts | .shown_count[$t] = ((.shown_count[$t] // 0) + 1)')
  fi

  echo "$_json" | jq '.' > "$_path"
  echo "$_topic completed"
}

cmd_lang() {
  require_jq
  _code="${1:-}"
  [ -z "$_code" ] && die "Usage: progress.sh lang <code>"

  ensure_file
  _path=$(get_progress_path)
  _json=$(cat "$_path")
  echo "$_json" | jq --arg l "$_code" '.lang = $l' > "$_path"
  echo "Language set: $_code"
}

cmd_reset() {
  _path=$(get_progress_path)
  _dir=$(dirname "$_path")
  mkdir -p "$_dir" 2>/dev/null || true
  echo "$DEFAULT_JSON" | jq '.' > "$_path" 2>/dev/null || echo "$DEFAULT_JSON" > "$_path"
  echo "Progress reset"
}

cmd_status() {
  require_jq
  _path=$(get_progress_path)
  if [ ! -f "$_path" ]; then
    _json="$DEFAULT_JSON"
  else
    _json=$(cat "$_path")
  fi

  _completed=$(echo "$_json" | jq -r '.completed[]' 2>/dev/null) || _completed=""
  _count=0

  echo ""
  echo "Guide Progress"
  echo "=============="
  echo ""

  for _t in $VALID_TOPICS; do
    _done=0
    for _c in $_completed; do
      if [ "$_c" = "$_t" ]; then
        _done=1
        _count=$(( _count + 1 ))
        break
      fi
    done
    if [ "$_done" = "1" ]; then
      printf "  [x] %s\n" "$_t"
    else
      printf "  [ ] %s\n" "$_t"
    fi
  done

  echo ""
  echo "$_count/$TOPIC_COUNT topics completed"
}

# --- Main ---

CMD="${1:-}"
[ -z "$CMD" ] && die "Usage: progress.sh <command> [args]\nCommands: path, read, complete, lang, reset, status"

case "$CMD" in
  path)     cmd_path ;;
  read)     cmd_read ;;
  complete) shift; cmd_complete "$@" ;;
  lang)     shift; cmd_lang "$@" ;;
  reset)    cmd_reset ;;
  status)   cmd_status ;;
  *)        die "Unknown command: $CMD. Valid: path, read, complete, lang, reset, status" ;;
esac
