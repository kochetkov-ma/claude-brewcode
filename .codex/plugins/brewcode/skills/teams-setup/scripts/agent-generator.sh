#!/bin/sh
# agent-generator.sh <agent-name> (project root): prints <plugin>:<skill> when ANOTHER generator owns that agent.
# Owner = `generated_by` stamp of `.codex/agents/<name>.toml` (live, else parked), else a reserved name.
set -eu
# exit 0 foreign (never claimed, moved, restamped or verified by teams) | 2 ours/unstamped/absent | 1 usage.

AGENT="${1:-}"
[ "$#" -eq 1 ] && [ -n "$AGENT" ] || { echo "Usage: agent-generator.sh <agent-name>   (run from the project root)" >&2; exit 1; }
case "$AGENT" in
  *[![:lower:][:digit:]-]*|[![:lower:][:digit:]]*)
    printf 'ERROR:not an agent id: %s (must match ^[a-z0-9][a-z0-9-]*$)\n' "$AGENT" >&2; exit 1 ;;
esac

for f in ".codex/agents/$AGENT.toml" ".codex/agents/$AGENT.toml.disabled"; do
  [ -f "$f" ] || continue
  gen=$(awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit }
    f && /^generated_by:/ { sub(/^generated_by:/, ""); print; exit }' "$f" | tr -d " \t\r\"'" || true)
  # A malformed stamp (`{GENERATED_BY}` token) proves nothing: fall through to the reserved names.
  if [ "$gen" != "brewcode:teams-setup" ] && printf '%s\n' "$gen" | grep -Eq '^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$'; then
    printf '%s\n' "$gen"
    exit 0
  fi
  break
done

# Names another setup ships into `.codex/agents/` (Codex agents carry no stamp; a stale teams stamp lies).
case "$AGENT" in
  task-tracker) echo "brewtools:task-board-setup"; exit 0 ;;
esac
exit 2
