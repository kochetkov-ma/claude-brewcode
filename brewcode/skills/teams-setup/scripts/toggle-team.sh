#!/bin/sh
# toggle-team.sh <team-name> <enable|disable> [--dry-run]: park `.claude/agents/<name>.md` <-> `<name>.md.disabled`, bytes kept.
# team.md, trace*.jsonl, cursor untouched; `intent-guard` and agents another generator owns are NEVER moved.
set -eu

TEAM_NAME="${1:-}"
ACTION="${2:-}"
DRY="${3:-}"

case "$ACTION" in
  enable|disable) ;;
  *) echo "Usage: toggle-team.sh <team-name> <enable|disable> [--dry-run]"; exit 1 ;;
esac
[ -n "$TEAM_NAME" ] || { echo "ERROR:empty team name"; exit 1; }
# Same name rule as detect-mode.sh: a `/` or `..` here reads a roster outside `.claude/teams/`.
# Explicit ASCII list: bash 3.2 under a UTF-8 locale lets a-z ranges match accented letters.
case "$TEAM_NAME" in
  -*|*[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-]*) echo "ERROR:invalid team name (alphanumeric, dash, underscore only; no leading dash)"; exit 1 ;;
esac
# A mistyped flag (`--dryrun`) must not fall through to a real move.
case "$DRY" in
  ''|--dry-run) ;;
  *) echo "ERROR:unknown argument '$DRY' (only --dry-run is accepted); nothing was touched"; exit 1 ;;
esac
[ "$#" -le 3 ] || { echo "ERROR:too many arguments; nothing was touched"; exit 1; }

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
TEAM_DIR=".claude/teams/$TEAM_NAME"
AGENTS_DIR=".claude/agents"
TEAM_MD="$TEAM_DIR/team.md"

[ -f "$TEAM_MD" ] || { echo "ERROR:team '$TEAM_NAME' not found ($TEAM_MD missing)"; exit 1; }

# Which copy an unrefused `mv` would destroy: enable clobbers the live file, disable the parked one.
if [ "$ACTION" = "disable" ]; then VICTIM="parked"; else VICTIM="live"; fi

MOVED=0
SKIPPED=0
MISSING=0
INVALID=0
CONFLICT=0

# Roster ids feed move/probe/delete paths (`| ../../../outside/README |` escaped project) -> bare `^[a-z0-9][a-z0-9-]*$`.
# Same guard: verify-team.sh, cleanup-flow.md delete/purge steps.
valid_agent_id() {
  # Explicit ASCII lists: bash 3.2 under a UTF-8 locale lets ranges and [:lower:] match accented letters.
  case "$1" in
    ''|*[!abcdefghijklmnopqrstuvwxyz0123456789-]*|[!abcdefghijklmnopqrstuvwxyz0123456789]*) return 1 ;;
  esac
  return 0
}

# `## Agents` separator row: padded `| ------ |` valid as `|---|` (unpadded-only match -> 0 rows, false `✅ disable`).
# Same rule in verify-team.sh.
is_separator_row() {
  printf '%s\n' "$1" \
    | grep -Eq '^[[:space:]]*\|[[:space:]]*:?-{3,}:?[[:space:]]*(\|[[:space:]]*:?-{3,}:?[[:space:]]*)+\|[[:space:]]*$'
}

# Roster parse as verify-team.sh (`Agent` = field 2 past separator). Pass `probe` prints only refusals,
# `apply` moves; probe runs first -> collision on LAST member !=half-moved team (all-or-nothing).
walk() {
  _pass="$1"
  MOVED=0
  SKIPPED=0
  MISSING=0
  INVALID=0
  CONFLICT=0
  in_agents=0
  past_header=0
  while IFS= read -r line; do
    case "$line" in
      "## Agents"*) in_agents=1; past_header=0; continue ;;
      "## "*) [ "$in_agents" -eq 1 ] && break ;;
    esac
    [ "$in_agents" -eq 0 ] && continue
    case "$line" in
      "|"*)
        if is_separator_row "$line"; then past_header=1; continue; fi
        [ "$past_header" -eq 0 ] && continue
        agent=$(printf '%s' "$line" | cut -d'|' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/`//g')
        [ -z "$agent" ] && continue
        if ! valid_agent_id "$agent"; then
          [ "$_pass" = "apply" ] && echo "SKIP:invalid agent id '$agent' (not ^[a-z0-9][a-z0-9-]*$) -- nothing under $AGENTS_DIR touched"
          INVALID=$((INVALID + 1))
          continue
        fi
        if [ "$agent" = "intent-guard" ]; then
          [ "$_pass" = "apply" ] && echo "SKIP:intent-guard (shared with superreview-setup)"
          SKIPPED=$((SKIPPED + 1))
          continue
        fi
        if owner=$(sh "$SCRIPT_DIR/agent-generator.sh" "$agent" 2>/dev/null); then
          [ "$_pass" = "apply" ] && echo "SKIP:$agent (owned by $owner; not a team member, never moved)"
          SKIPPED=$((SKIPPED + 1))
          continue
        fi

        LIVE="$AGENTS_DIR/${agent}.md"
        PARKED="$AGENTS_DIR/${agent}.md.disabled"
        if [ "$ACTION" = "disable" ]; then FROM="$LIVE"; TO="$PARKED"; else FROM="$PARKED"; TO="$LIVE"; fi

        # PROJECT-GLOBAL namespace: both copies (ANY dest entry, `mv` into dir too) = collision -> refuse,
        # touch nothing; `mv` either way would silently clobber the other body.
        if [ -f "$FROM" ] && { [ -e "$TO" ] || [ -L "$TO" ]; }; then
          echo "CONFLICT:$agent -- both $LIVE and $PARKED exist; $ACTION would overwrite the $VICTIM file. Nothing was touched."
          CONFLICT=$((CONFLICT + 1))
          continue
        fi

        [ "$_pass" = "probe" ] && continue

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
  return 0
}

walk probe
if [ "$CONFLICT" -gt 0 ]; then
  printf 'ACTION:%s\nTEAM:%s\nMOVED:0\nSKIPPED:0\nMISSING:0\nINVALID:0\nCONFLICT:%s\n' "$ACTION" "$TEAM_NAME" "$CONFLICT"
  echo "❌ FAILED -- $CONFLICT member(s) have BOTH a live and a parked file; $ACTION would overwrite the $VICTIM one."
  echo "   Nothing was moved. Keep the copy you want, delete or rename the other, then re-run $ACTION."
  exit 1
fi

walk apply

printf 'ACTION:%s\nTEAM:%s\nMOVED:%s\nSKIPPED:%s\nMISSING:%s\nINVALID:%s\nCONFLICT:%s\n' "$ACTION" "$TEAM_NAME" "$MOVED" "$SKIPPED" "$MISSING" "$INVALID" "$CONFLICT"

# Unparsed roster != empty: no `## Agents` separator matched -> `MOVED:0` + `✅ disable` would lie; never exit 0.
if [ "$past_header" -eq 0 ]; then
  echo "❌ FAILED -- parsed no ## Agents rows from $TEAM_MD (missing '## Agents' section, or its header separator row is malformed); nothing was touched"
  exit 1
fi
if [ "$INVALID" -gt 0 ]; then
  echo "❌ FAILED -- $INVALID roster row(s) carry a value that is not an agent id; fix team.md's ## Agents table"
  exit 1
fi
if [ "$CONFLICT" -gt 0 ]; then
  echo "❌ FAILED -- $CONFLICT member(s) have BOTH a live and a parked file; $ACTION would overwrite the $VICTIM one."
  echo "   Nothing was moved. Keep the copy you want, delete or rename the other, then re-run $ACTION."
  exit 1
fi
if [ "$MISSING" -gt 0 ]; then
  echo "❌ FAILED -- $MISSING roster member(s) have no file at all; run /brewcode:teams-setup status"
  exit 1
fi
echo "✅ $ACTION"
exit 0
