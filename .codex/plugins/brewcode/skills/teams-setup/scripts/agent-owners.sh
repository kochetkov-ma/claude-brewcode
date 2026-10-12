#!/bin/sh
# agent-owners.sh <agent-name> (project root): teams whose `## Agents` lists it, sorted, unique, one per line.
# `.codex/agents/<name>.toml` = PROJECT-GLOBAL namespace: every delete path MUST call this, SKIP >1 owner.
set -eu
# exit 0 owners | 2 none (safe to delete) | 1 usage/invalid id/unparsable roster = unknown owners: never delete.

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
  printf '%s\n' "$1" \
    | grep -Eq '^[[:space:]]*\|[[:space:]]*:?-{3,}:?[[:space:]]*(\|[[:space:]]*:?-{3,}:?[[:space:]]*)+\|[[:space:]]*$'
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
for md in .codex/teams/*/team.md; do
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
