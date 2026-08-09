#!/bin/sh
# toggle-team.sh <team-name> <enable|disable> [--dry-run]
#
# Parks or unparks a team's agent files. Codex discovers a project agent only
# through `.codex/agents/<name>.toml`, so renaming to `<name>.toml.disabled` removes the
# agent from the roster while preserving every byte of it. Nothing else is touched:
# team.md, trace.jsonl, trace-archive.jsonl and the cursor survive both directions,
# which is what makes this a reversible toggle and not an uninstall.
#
# `intent-guard` is NEVER parked -- it is shared with $brewcode:superreview-setup and
# may belong to an install that has nothing to do with this team. Same exclusion as
# cleanup-flow.md Step 3 and Step P.
set -eu

TEAM_NAME="${1:-}"
ACTION="${2:-}"
DRY="${3:-}"

case "$ACTION" in
  enable|disable) ;;
  *) echo "Usage: toggle-team.sh <team-name> <enable|disable> [--dry-run]"; exit 1 ;;
esac
[ -n "$TEAM_NAME" ] || { echo "ERROR:empty team name"; exit 1; }

TEAM_DIR=".codex/teams/$TEAM_NAME"
AGENTS_DIR=".codex/agents"
TEAM_MD="$TEAM_DIR/team.md"

[ -f "$TEAM_MD" ] || { echo "ERROR:team '$TEAM_NAME' not found ($TEAM_MD missing)"; exit 1; }

MOVED=0
SKIPPED=0
MISSING=0

# Roster parse: identical shape to verify-team.sh -- `Agent` is field 2 of each row
# past the header separator of the `## Agents` table.
in_agents=0
past_header=0
while IFS= read -r line; do
  case "$line" in
    "## Agents"*) in_agents=1; past_header=0; continue ;;
    "## "*) [ "$in_agents" -eq 1 ] && break ;;
  esac
  [ "$in_agents" -eq 0 ] && continue
  case "$line" in
    "|"*"---|"*) past_header=1; continue ;;
    "|"*)
      [ "$past_header" -eq 0 ] && continue
      agent=$(printf '%s' "$line" | cut -d'|' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/`//g')
      [ -z "$agent" ] && continue
      [ "$agent" = "intent-guard" ] && { echo "SKIP:intent-guard (shared with superreview-setup)"; SKIPPED=$((SKIPPED + 1)); continue; }

      LIVE="$AGENTS_DIR/${agent}.toml"
      PARKED="$AGENTS_DIR/${agent}.toml.disabled"
      if [ "$ACTION" = "disable" ]; then FROM="$LIVE"; TO="$PARKED"; else FROM="$PARKED"; TO="$LIVE"; fi

      if [ -f "$FROM" ]; then
        if [ "$DRY" = "--dry-run" ]; then
          echo "WOULD:$FROM -> $TO"
        else
          mv "$FROM" "$TO"
          echo "MOVED:$FROM -> $TO"
        fi
        MOVED=$((MOVED + 1))
      elif [ -f "$TO" ]; then
        echo "NOOP:$agent already ${ACTION}d"
        SKIPPED=$((SKIPPED + 1))
      else
        echo "MISSING:$agent (neither $LIVE nor $PARKED exists)"
        MISSING=$((MISSING + 1))
      fi
      ;;
  esac
done < "$TEAM_MD"

printf 'ACTION:%s\nTEAM:%s\nMOVED:%s\nSKIPPED:%s\nMISSING:%s\n' "$ACTION" "$TEAM_NAME" "$MOVED" "$SKIPPED" "$MISSING"

if [ "$MISSING" -gt 0 ]; then
  echo "❌ FAILED -- $MISSING roster member(s) have no file at all; run $brewcode:teams-setup status"
  exit 1
fi
echo "✅ $ACTION"
exit 0
