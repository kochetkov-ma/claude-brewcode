#!/bin/sh
# agent-owners.sh <agent-name>
#
# Prints every team whose `## Agents` roster lists <agent-name>, one team name per line,
# sorted (the `.claude/teams/*` glob order), no duplicates, nothing else on stdout.
#
# `.claude/agents/<name>.md` is a PROJECT-GLOBAL namespace, not a team's private slot: two teams
# may list the same agent. Deleting it because team A was cleaned up removes an agent team B still
# spawns. Every delete path MUST call this first and SKIP any agent with more than one owner.
#
# Run from the project root -- paths are relative to `.claude/teams/`, same as its siblings.
#
# stdout : owning team names, one per line (empty when there are none)
# exit 0 : one or more owners printed
# exit 2 : no team lists this agent (stdout empty) -- safe to delete
# exit 1 : refuse to answer -- usage error, invalid agent id, or a team.md whose roster could not
#          be parsed (reason on stderr, stdout empty). Treat as "unknown owners": never delete.
set -eu

AGENT="${1:-}"

usage() {
  echo "Usage: agent-owners.sh <agent-name>   (run from the project root)" >&2
  exit 1
}

[ -n "$AGENT" ] || usage
[ "$#" -eq 1 ] || usage

# Byte-identical rule to toggle-team.sh / verify-team.sh: an agent id is a bare
# `^[a-z0-9][a-z0-9-]*$`. One guard, mirrored, never a second dialect.
valid_agent_id() {
  case "$1" in
    ''|*[![:lower:][:digit:]-]*|[![:lower:][:digit:]]*) return 1 ;;
  esac
  return 0
}

# Markdown separator row of the `## Agents` table -- byte-identical rule to its siblings. A padded
# `| ------ |` is as valid a separator as `|---|`.
is_separator_row() {
  case "$1" in
    *[![:space:]|:-]*) return 1 ;;
  esac
  case "$1" in
    "|"*"---"*) return 0 ;;
  esac
  return 1
}

if ! valid_agent_id "$AGENT"; then
  printf 'ERROR:not an agent id: %s (must match ^[a-z0-9][a-z0-9-]*$)\n' "$AGENT" >&2
  exit 1
fi

UNREADABLE=0

# 0 = the roster lists $AGENT, 1 = it does not. A roster with no data row is unreadable, not empty:
# reporting "no owners" there is what deletes a shared agent, so it raises UNREADABLE instead.
roster_lists_agent() {
  _md="$1"
  _in=0
  _past=0
  _hit=1
  while IFS= read -r _line; do
    case "$_line" in
      "## Agents"*) _in=1; _past=0; continue ;;
      "## "*) [ "$_in" -eq 1 ] && break ;;
    esac
    [ "$_in" -eq 0 ] && continue
    case "$_line" in
      "|"*)
        if is_separator_row "$_line"; then _past=1; continue; fi
        [ "$_past" -eq 0 ] && continue
        _a=$(printf '%s' "$_line" | cut -d'|' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/`//g')
        [ "$_a" = "$AGENT" ] && { _hit=0; break; }
        ;;
    esac
  done < "$_md"
  if [ "$_past" -eq 0 ]; then
    printf 'ERROR:parsed no ## Agents rows from %s -- roster unreadable, owners unknown\n' "$_md" >&2
    UNREADABLE=1
  fi
  return "$_hit"
}

# Buffered, not streamed: a roster that turns out to be unreadable must leave stdout empty,
# and that is only known after the last team.md.
FOUND=0
OWNERS=""
for md in .claude/teams/*/team.md; do
  [ -f "$md" ] || continue
  team=$(basename "$(dirname "$md")")
  if roster_lists_agent "$md"; then
    OWNERS="${OWNERS}${team}
"
    FOUND=$((FOUND + 1))
  fi
done

[ "$UNREADABLE" -eq 0 ] || exit 1
[ "$FOUND" -gt 0 ] || exit 2
printf '%s' "$OWNERS"
exit 0
