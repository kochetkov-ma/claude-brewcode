#!/bin/sh
# toggle-team.sh <team-name> <enable|disable> [--dry-run]
#
# Parks or unparks a team's agent files. Claude Code discovers a project agent only
# through `.claude/agents/<name>.md`, so renaming to `<name>.md.disabled` removes the
# agent from the roster while preserving every byte of it. Nothing else is touched:
# team.md, trace.jsonl, trace-archive.jsonl and the cursor survive both directions,
# which is what makes this a reversible toggle and not an uninstall.
#
# `intent-guard` is NEVER parked -- it is shared with /brewcode:superreview-setup and
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

# Roster values are interpolated straight into move/probe/delete paths, so a row like
# `| ../../../outside/README |` renamed a file OUTSIDE the project while the run printed a cheerful
# `MOVED:`. An agent id is a bare `^[a-z0-9][a-z0-9-]*$` -- no slash, no dot, no traversal -- which is
# also what keeps every path canonically inside `.claude/agents/`. Same guard in verify-team.sh and in
# the cleanup-flow.md delete/purge steps: one rule, three consumers.
valid_agent_id() {
  case "$1" in
    ''|*[![:lower:][:digit:]-]*|[![:lower:][:digit:]]*) return 1 ;;
  esac
  return 0
}

# Markdown separator row of the `## Agents` table. Only `|`, `-`, `:` and spaces, with a run of
# dashes -- a formatter that pads the cells (`| ------ |`) writes a separator just as valid as
# `|---|`, and matching only the unpadded spelling left past_header at 0, parsed zero rows, and
# still printed `MOVED:0 ... ✅ disable` with every agent file live. Same rule in verify-team.sh.
is_separator_row() {
  printf '%s\n' "$1" \
    | grep -Eq '^[[:space:]]*\|[[:space:]]*:?-{3,}:?[[:space:]]*(\|[[:space:]]*:?-{3,}:?[[:space:]]*)+\|[[:space:]]*$'
}

# Roster parse: identical shape to verify-team.sh -- `Agent` is field 2 of each row
# past the header separator of the `## Agents` table.
#
# One walk, two passes. `probe` decides only whether the roster is safe to move and prints nothing
# but its refusals; `apply` is the real thing. Both directions probe first, so a collision on the
# LAST member cannot leave the team half-moved -- the toggle is all-or-nothing either way.
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

        LIVE="$AGENTS_DIR/${agent}.md"
        PARKED="$AGENTS_DIR/${agent}.md.disabled"
        if [ "$ACTION" = "disable" ]; then FROM="$LIVE"; TO="$PARKED"; else FROM="$PARKED"; TO="$LIVE"; fi

        # `.claude/agents/<name>.md` is a PROJECT-GLOBAL namespace, not this team's private slot.
        # While the team was parked anyone -- another team, another skill, a hand edit -- may have
        # written a live file under the same name, and `mv parked -> live` would clobber it with no
        # trace. Disable is the mirror image: `mv live -> parked` clobbers the parked body just as
        # silently. Both copies present is an unresolved collision either way: refuse, touch nothing,
        # let a human pick which body survives.
        if [ -f "$LIVE" ] && [ -f "$PARKED" ]; then
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

# A roster the parser could not read is NOT an empty roster. Reaching no data row means the
# `## Agents` section or its header separator never matched, and reporting `MOVED:0` + `✅ disable`
# there leaves every agent file live while claiming the team is off -- the one failure mode that
# must never exit 0.
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
