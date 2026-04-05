#!/usr/bin/env bash
set -euo pipefail

# Read debate log entries
# Usage:
#   bash read-log.sh <log_file> all              — all entries
#   bash read-log.sh <log_file> last <N>          — last N entries
#   bash read-log.sh <log_file> agent <name>      — entries from specific agent
#   bash read-log.sh <log_file> round <N>         — entries from round N (by position)
#   bash read-log.sh <log_file> stats             — summary statistics

LOG_FILE="${1:-}"
CMD="${2:-all}"
ARG="${3:-}"

if [ -z "$LOG_FILE" ]; then
  echo "ERROR: log file path required" >&2
  exit 1
fi

if [ ! -f "$LOG_FILE" ]; then
  echo "ERROR: log file does not exist: $LOG_FILE" >&2
  exit 1
fi

case "$CMD" in
  all)
    cat "$LOG_FILE"
    ;;
  last)
    N="${ARG:-5}"
    tail -n "$N" "$LOG_FILE"
    ;;
  agent)
    if [ -z "$ARG" ]; then
      echo "ERROR: agent name required" >&2
      exit 1
    fi
    python3 -c "
import json, sys
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    d = json.loads(line)
    if d.get('from') == sys.argv[2]:
        print(line)
" "$LOG_FILE" "$ARG"
    ;;
  round)
    if [ -z "$ARG" ]; then
      echo "ERROR: round number required" >&2
      exit 1
    fi
    N="$ARG"
    python3 -c "
import json, sys
entries = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    entries.append(json.loads(line))
n = int(sys.argv[2])
# Determine agent count (unique non-judge 'from' values)
agents = sorted(set(e['from'] for e in entries if e['from'] != 'judge'))
agent_count = len(agents) if agents else 1
# Round N = entries[(N-1)*agent_count : N*agent_count] (judge entries interleaved are included)
# Group entries into rounds: each round = agent_count non-judge entries + any judge entries between them
non_judge = [(i, e) for i, e in enumerate(entries) if e['from'] != 'judge']
total_rounds = (len(non_judge) + agent_count - 1) // agent_count
if n < 1 or n > total_rounds:
    print(f'ERROR: round {n} out of range (1-{total_rounds})', file=sys.stderr)
    sys.exit(1)
start = (n - 1) * agent_count
end = min(n * agent_count, len(non_judge))
# Get index range in original entries list
first_idx = non_judge[start][0] if start < len(non_judge) else 0
last_idx = non_judge[end - 1][0] if end > 0 else len(entries) - 1
# Include all entries (including judge) within the index range
for i, e in enumerate(entries):
    if first_idx <= i <= last_idx:
        print(json.dumps(e, ensure_ascii=False, separators=(',', ':')))
" "$LOG_FILE" "$N"
    ;;
  stats)
    python3 -c "
import json, sys
entries = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    entries.append(json.loads(line))
agents = set(e['from'] for e in entries)
types = {}
for e in entries:
    types[e['type']] = types.get(e['type'], 0) + 1
print(f'Total entries: {len(entries)}')
print(f'Agents: {sorted(agents)}')
print(f'Types: {dict(sorted(types.items()))}')
print(f'Mode: {entries[0][\"mode\"] if entries else \"unknown\"}')
" "$LOG_FILE"
    ;;
  *)
    echo "ERROR: unknown command '$CMD' (expected: all, last, agent, round, stats)" >&2
    exit 1
    ;;
esac
