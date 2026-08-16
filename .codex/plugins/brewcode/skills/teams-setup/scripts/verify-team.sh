#!/bin/sh
set -eu

TEAM_NAME="${1:-}"
if [ -z "$TEAM_NAME" ]; then
  echo "Usage: verify-team.sh <team-name>"
  exit 1
fi

TEAM_DIR=".codex/teams/$TEAM_NAME"
FAIL=0
DISABLED=0

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Plugin version by self-location, used to print a COPY-PASTEABLE repair row.
# `|| true` on both branches: under `set -e` a failing command substitution aborts the script.
PLUGIN_JSON="$SCRIPT_DIR/../../../.codex-plugin/plugin.json"
PV=""
if [ -f "$PLUGIN_JSON" ]; then
  if command -v jq >/dev/null 2>&1; then
    PV=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
  else
    PV=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
  fi
fi
# HARD FAIL, never a placeholder value. The repair row this prints is meant to be pasted back into an
# agent's frontmatter, so a documentation spelling like `X.Y.Z` reaches an artifact the moment anyone
# follows the advice. It carries no `{}<>`, so setup-status's PLACEHLD test cannot catch it and
# `sort -V` would print a confident `AHEAD X.Y.Z > 5.2.0`. The manifest ships with the plugin in the
# dev checkout and in the cache alike, so an unreadable one is a broken install - stop here.
case "$PV" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve plugin version (X.Y.Z) from %s - refusing to emit a repair row with a fake version\n' "$PLUGIN_JSON"; exit 1 ;;
esac
TODAY=$(date +%F)

# content_version by self-location, same source detect-mode.sh reads: this skill's OWN
# brewcode-meta marker in SKILL.md -- used only to print a copy-pasteable repair row.
SKILL_MD="$SCRIPT_DIR/../SKILL.md"
CV=""
if [ -f "$SKILL_MD" ]; then
  CV=$(grep -aoE 'content_version=[0-9]+\.[0-9]+\.[0-9]+' "$SKILL_MD" 2>/dev/null | head -1 | sed 's/^content_version=//' || true)
fi
case "$CV" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve content_version (X.Y.Z) from %s - refusing to emit a repair row with a fake content_version\n' "$SKILL_MD"; exit 1 ;;
esac

# Artifact-metadata frontmatter gate for ONE generated agent. Same four keys, same D2 order and the same
# quoting `brewcode/skills/rules/scripts/rules.sh:140-146` enforces -- one dialect across the repo, not a
# second one invented here. Returns: 0 conforming, 1 malformed, 2 no metadata at all (pre-standard agent).
check_agent_meta() {
  _f="$1"
  _fm=$(awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f { print }' "$_f")
  _present=$(printf '%s\n' "$_fm" | grep -cE '^(doc_type|version|generated_by|last_updated):' || true)
  [ "$_present" -eq 0 ] && return 2

  _bad=0
  for _k in doc_type version generated_by last_updated; do
    printf '%s\n' "$_fm" | grep -q "^${_k}:" || { echo "  FAIL: missing frontmatter key: $_k"; _bad=1; }
  done
  printf '%s\n' "$_fm" | grep -q '^doc_type: llm$' \
    || { echo "  FAIL: doc_type must be exactly 'llm', UNQUOTED"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^version: "[0-9]+\.[0-9]+\.[0-9]+"$' \
    || { echo "  FAIL: version must be a QUOTED X.Y.Z (a surviving {PLUGIN_VERSION} token fails here)"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^generated_by: "[^"]+"$' \
    || { echo "  FAIL: generated_by must be a QUOTED <plugin>:<skill>"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^last_updated: "[0-9]{4}-[0-9]{2}-[0-9]{2}"$' \
    || { echo "  FAIL: last_updated must be a QUOTED YYYY-MM-DD"; _bad=1; }
  _order=$(printf '%s\n' "$_fm" | grep -oE '^(doc_type|version|generated_by|last_updated)' | tr '\n' ' ' || true)
  [ "$_order" = "doc_type version generated_by last_updated " ] \
    || { echo "  FAIL: metadata keys out of order [$_order] -- must be doc_type, version, generated_by, last_updated"; _bad=1; }
  return "$_bad"
}

# Roster values reach `-f` probes here and `mv`/`rm -f` in toggle-team.sh and cleanup-flow.md, so a row
# like `| ../../../outside/README |` is a path, not a name. An agent id is a bare `^[a-z0-9][a-z0-9-]*$`,
# which keeps every derived path canonically inside `.codex/agents/`. Byte-identical rule in
# toggle-team.sh -- one guard, mirrored, never a second dialect.
valid_agent_id() {
  case "$1" in
    ''|*[![:lower:][:digit:]-]*|[![:lower:][:digit:]]*) return 1 ;;
  esac
  return 0
}

# Markdown separator row of the `## Agents` table -- byte-identical rule to toggle-team.sh. Only
# `|`, `-`, `:` and spaces, with a run of dashes: a padded `| ------ |` is as valid a separator as
# `|---|`, and matching only the unpadded spelling made the whole roster invisible to the parser.
is_separator_row() {
  case "$1" in
    *[![:space:]|:-]*) return 1 ;;
  esac
  case "$1" in
    "|"*"---"*) return 0 ;;
  esac
  return 1
}

check_dir() {
  printf "CHECK: %s ... " "$1"
  if [ -d "$2" ]; then
    echo "OK"
  else
    echo "MISSING"
    FAIL=1
  fi
}

check_file() {
  printf "CHECK: %s ... " "$1"
  if [ -f "$2" ]; then
    echo "OK"
  else
    echo "MISSING"
    FAIL=1
  fi
}

check_dir "teams dir" "$TEAM_DIR"
check_file "team.md" "$TEAM_DIR/team.md"
check_file "trace.jsonl" "$TEAM_DIR/trace.jsonl"

# Project-local tracer: the only path a generated agent in .codex/agents/ can resolve
# (no plugin-root substitution there). Teams created before it existed simply lack it.
if [ ! -f "$TEAM_DIR/trace-ops.sh" ]; then
  echo "WARN: $TEAM_DIR/trace-ops.sh missing -- agents cannot trace, STATUS will report 0 tasks. Fix:"
  echo "      cp \"$SCRIPT_DIR/trace-ops.sh\" \"$TEAM_DIR/trace-ops.sh\" && chmod +x \"$TEAM_DIR/trace-ops.sh\""
fi

if [ ! -f "$TEAM_DIR/trace.jsonl" ]; then
  for old_file in tracking.md issues.md insights.md; do
    if [ -f "$TEAM_DIR/$old_file" ]; then
      echo "MIGRATE: old $old_file found without trace.jsonl. Run: trace-ops.sh migrate $TEAM_DIR"
      break
    fi
  done
fi

if [ -f "$TEAM_DIR/team.md" ]; then
  # Artifact-metadata header rows -- all FOUR, adjacent, in the order Version / Content version /
  # Generated by / Last update. ABSENT ALL FOUR = a team.md written before the standard existed: WARN
  # with the fix, an old team must upgrade cleanly. Anything else -- a subset, a wrong order, a
  # placeholder or malformed value -- is a WRITER defect on a team that already claims the standard, so
  # it FAILS. A team written before content_version existed (Version/Generated by/Last update, no
  # Content version) is the SAME legacy case, not a partial-subset FAIL -- WARN with the upgrade fix too.
  meta_lines=$(grep -nE '^\|[[:space:]]*(Version|Content version|Generated by|Last update)[[:space:]]*\|' "$TEAM_DIR/team.md" || true)
  meta_order=$(printf '%s\n' "$meta_lines" | sed -n 's/^[0-9]*:|[[:space:]]*\([^|]*[^|[:space:]]\)[[:space:]]*|.*/\1/p' | tr '\n' '/' || true)
  meta_nums=$(printf '%s\n' "$meta_lines" | cut -d: -f1 | tr '\n' ' ' || true)
  case "$meta_order" in
    "" | "Version/Generated by/Last update/")
      echo "WARN: $TEAM_DIR/team.md has no | Version | / | Content version | / | Generated by | /"
      echo "      | Last update | header rows (team predates the content_version standard). Fix: run"
      echo "      \$brewcode:teams-setup upgrade, which fills them from the PLUGIN_VERSION: /"
      echo "      CONTENT_VERSION: / GENERATED_BY: / LAST_UPDATED: lines of detect-mode.sh and appends"
      echo "      the trailing Version column to the ## Agents table."
      ;;
    "Version/Content version/Generated by/Last update/")
      # shellcheck disable=SC2086
      set -- $meta_nums
      if [ "$(($1 + 1))" -eq "$2" ] && [ "$(($2 + 1))" -eq "$3" ] && [ "$(($3 + 1))" -eq "$4" ]; then
        printf "CHECK: team.md metadata rows (order + adjacency) ... OK\n"
      else
        echo "CHECK: team.md metadata rows ... FAIL (correct order, but rows $1/$2/$3/$4 are not adjacent --"
        echo "      Created / Agents / Project must sit outside the quartet, never interleaved with it)"
        FAIL=1
      fi
      grep -Eq '^\|[[:space:]]*Version[[:space:]]*\|[[:space:]]*[0-9]+\.[0-9]+\.[0-9]+[[:space:]]*\|' "$TEAM_DIR/team.md" \
        || { echo "CHECK: team.md | Version | value ... FAIL (must be a bare X.Y.Z; a surviving {PLUGIN_VERSION} token fails here)"; FAIL=1; }
      grep -Eq '^\|[[:space:]]*Content version[[:space:]]*\|[[:space:]]*[0-9]+\.[0-9]+\.[0-9]+[[:space:]]*\|' "$TEAM_DIR/team.md" \
        || { echo "CHECK: team.md | Content version | value ... FAIL (must be a bare X.Y.Z; a surviving {CONTENT_VERSION} token fails here)"; FAIL=1; }
      grep -Eq '^\|[[:space:]]*Generated by[[:space:]]*\|[[:space:]]*brewcode:teams-setup[[:space:]]*\|' "$TEAM_DIR/team.md" \
        || { echo "CHECK: team.md | Generated by | value ... FAIL (must be brewcode:teams-setup)"; FAIL=1; }
      grep -Eq '^\|[[:space:]]*Last update[[:space:]]*\|[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]*\|' "$TEAM_DIR/team.md" \
        || { echo "CHECK: team.md | Last update | value ... FAIL (must be a bare YYYY-MM-DD)"; FAIL=1; }
      ;;
    *)
      echo "CHECK: team.md metadata rows ... FAIL"
      echo "      found [${meta_order}] -- the four rows must all be present, adjacent and in this order:"
      echo "      | Version | $PV |"
      echo "      | Content version | $CV |"
      echo "      | Generated by | brewcode:teams-setup |"
      echo "      | Last update | $TODAY |"
      FAIL=1
      ;;
  esac

  in_agents=0
  past_header=0
  found_agents=0
  found_intent_guard=0
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
        found_agents=1
        agent=$(printf '%s' "$line" | cut -d'|' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/`//g')
        [ -z "$agent" ] && continue
        if ! valid_agent_id "$agent"; then
          echo "CHECK: agent '$agent' ... FAIL (not an agent id: must match ^[a-z0-9][a-z0-9-]*\$ --"
          echo "      a roster value carrying '/', '..' or a leading '.' escapes .codex/agents/ and would be"
          echo "      moved by 'disable' and deleted by 'cleanup'/'purge'. Fix team.md's ## Agents table)"
          FAIL=1
          continue
        fi
        [ "$agent" = "intent-guard" ] && found_intent_guard=1
        printf "CHECK: agent %s ... " "$agent"
        if [ -f ".codex/agents/${agent}.toml" ]; then
          # The roster row proves the file exists; the frontmatter proves the generator stamped it.
          # A generated agent with no metadata at all predates the standard -> WARN + the upgrade fix.
          # Metadata that IS there but malformed is a generator defect -> FAIL.
          set +e
          meta_out=$(check_agent_meta ".codex/agents/${agent}.toml")
          meta_rc=$?
          set -e
          case "$meta_rc" in
            0) echo "OK" ;;
            2) echo "OK (no artifact metadata -- agent predates the standard; \$brewcode:teams-setup upgrade restamps it)" ;;
            *) echo "FAIL"; printf '%s\n' "$meta_out"; FAIL=1 ;;
          esac
          # Return Contract body gate: the section every generated domain agent is born with.
          # Absent = the agent predates it -> WARN + the upgrade fix, never fail an old roster.
          # intent-guard is exempt: one writer (superreview emit-agent), own verdict-first ## Output.
          if [ "$agent" != "intent-guard" ] \
             && ! grep -qF 'Verdict first, <=30 lines' ".codex/agents/${agent}.toml"; then
            echo "  WARN: no Return Contract section (agent predates it). Fix: \$brewcode:teams-setup upgrade,"
            echo "        which re-adds '## Return Contract' from references/agent-template.md"
          fi
        elif [ -f ".codex/agents/${agent}.toml.disabled" ]; then
          # Parked by `disable`: the body is intact, only the .md extension that
          # Codex discovers on is withheld. A reversible state, not a defect.
          echo "DISABLED"
          DISABLED=$((DISABLED + 1))
        else
          echo "MISSING"
          FAIL=1
        fi
        ;;
    esac
  done < "$TEAM_DIR/team.md"
  if [ "$in_agents" -eq 1 ] && [ "$found_agents" -eq 0 ]; then
    echo "WARN: no agents found in table"
  fi
  if [ "$in_agents" -eq 0 ]; then
    echo "WARN: no ## Agents section in team.md"
  fi
  # intent-guard is a fixed review-only member of every team, outside the domain-agent count.
  # Teams created before it existed simply lack the row -- warn with the fix, never fail them.
  # Teams that DO list it are covered by the per-agent -f check above.
  if [ "$found_intent_guard" -eq 0 ]; then
    echo "WARN: team.md has no intent-guard row (team predates it). Fix:"
    echo "      bash \"$SCRIPT_DIR/../../superreview-setup/scripts/generate.sh\" emit-agent"
    echo "      then add this row to the ## Agents table (all 7 columns: Agent, Domain, Mission, Status,"
    echo "      Updated, Kind, Version):"
    echo "      | intent-guard | -- | Anti-drift check: what was ASKED vs what was DELIVERED | active | $TODAY | review-only | $PV |"
  fi
fi

printf 'DISABLED_AGENTS:%s\n' "$DISABLED"

if [ "$FAIL" -eq 0 ]; then
  if [ "$DISABLED" -gt 0 ]; then
    echo "VERIFY: PASS (team DISABLED -- $DISABLED agent file(s) parked as .md.disabled)"
  else
    echo "VERIFY: PASS"
  fi
  exit 0
else
  echo "VERIFY: FAIL"
  exit 1
fi
