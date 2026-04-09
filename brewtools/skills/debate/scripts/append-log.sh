#!/usr/bin/env bash
set -euo pipefail

command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 required for JSONL validation" >&2; exit 1; }

# Append entry to debate JSONL log with schema validation
# Usage: bash append-log.sh <log_file> '<json_entry>'
# Example: bash append-log.sh path/to/debate-log.jsonl '{"ts":"...","from":"agent-1","to":["agent-2"],"what":"summary","why":"reasoning","type":"argument","mode":"challenge"}'

LOG_FILE="${1:-}"
ENTRY="${2:-}"

if [ -z "$LOG_FILE" ]; then
  echo "ERROR: log file path required as first argument" >&2
  exit 1
fi

if [ -z "$ENTRY" ]; then
  echo "ERROR: JSON entry required as second argument" >&2
  exit 1
fi

if [ ! -f "$LOG_FILE" ]; then
  echo "ERROR: log file does not exist: $LOG_FILE" >&2
  exit 1
fi

# Validate JSON structure using python (available on Mac by default)
VALID=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    required = {'ts', 'from', 'to', 'what', 'why', 'type', 'mode'}
    missing = required - set(d.keys())
    if missing:
        print(f'MISSING_FIELDS: {missing}', file=sys.stderr)
        sys.exit(1)
    valid_types = {'argument', 'counter', 'proposal', 'agree', 'question', 'redirect'}
    if d['type'] not in valid_types:
        print(f'INVALID_TYPE: {d[\"type\"]} (expected: {valid_types})', file=sys.stderr)
        sys.exit(1)
    valid_modes = {'challenge', 'strategy', 'critic'}
    if d['mode'] not in valid_modes:
        print(f'INVALID_MODE: {d[\"mode\"]} (expected: {valid_modes})', file=sys.stderr)
        sys.exit(1)
    if not isinstance(d['to'], list):
        print('INVALID_TO: must be array', file=sys.stderr)
        sys.exit(1)
    # Output compact JSON (normalized)
    print(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
except json.JSONDecodeError as e:
    print(f'INVALID_JSON: {e}', file=sys.stderr)
    sys.exit(1)
" "$ENTRY" 2>&1) || {
  echo "VALIDATION FAILED: $VALID" >&2
  exit 1
}

echo "$VALID" >> "$LOG_FILE"
echo "OK: appended to $LOG_FILE"
