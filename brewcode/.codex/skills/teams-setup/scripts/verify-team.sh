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
# Per-member states are mutually exclusive and mirror toggle-team.sh's summary keys: DISABLED counts
# members whose ONLY copy is parked, CONFLICT counts members carrying BOTH copies. A conflicted member
# is in neither the healthy nor the parked state, so it is never folded into DISABLED.
CONFLICT=0

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Plugin version by self-location, used to print a COPY-PASTEABLE repair row.
# `|| true` on both branches: under `set -e` a failing command substitution aborts the script.
PLUGIN_JSON="$SCRIPT_DIR/../../../.codex-plugin/plugin.json"
[ -f "$PLUGIN_JSON" ] || PLUGIN_JSON="$SCRIPT_DIR/../../../package/plugin.json"
PV=""
if [ -f "$PLUGIN_JSON" ]; then
  if command -v jq >/dev/null 2>&1; then
    PV=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
  else
    PV=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
  fi
fi
# HARD FAIL, never a placeholder value. The repair row this prints is meant to be pasted back into an
# agent's TOML agent schema, so a documentation spelling like `X.Y.Z` reaches an artifact the moment anyone
# follows the advice. It carries no `{}<>`, so setup-status's PLACEHLD test cannot catch it and
# `sort -V` would print a confident `AHEAD X.Y.Z > 5.2.0`. The manifest ships with the plugin in the
# dev checkout and in the cache alike, so an unreadable one is a broken install - stop here.
case "$PV" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve plugin version (X.Y.Z) from %s - refusing to emit a repair row with a fake version\n' "$PLUGIN_JSON"; exit 1 ;;
esac
PV=$(grep -aoE 'brewcode-meta: version=[0-9]+\.[0-9]+\.[0-9]+' "$SCRIPT_DIR/../SKILL.md" 2>/dev/null | head -1 | sed 's/.*version=//' || true)
case "$PV" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) printf 'ERROR:cannot resolve source plugin version (X.Y.Z) from %s\n' "$SCRIPT_DIR/../SKILL.md"; exit 1 ;;
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

# BEGIN CLIENT AGENT VALIDATION
# Native Codex agents are TOML data, not renamed Markdown. Parse before contract validation.
check_native_agent() {
  _f="$1"
  _expected_name="$2"
  _kind="$3"
  python3 - "$_f" "$_expected_name" "$_kind" "$TEAM_NAME" <<'PY'
import pathlib
import re
import sys
import tomllib

path = pathlib.Path(sys.argv[1])
expected_name, kind, team = sys.argv[2:5]
try:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
    print(f"  FAIL: invalid TOML: {exc}")
    raise SystemExit(1)

required = {"name", "description", "developer_instructions"}
if set(data) != required:
    print("  FAIL: TOML keys must be exactly name, description, developer_instructions")
    raise SystemExit(1)
if any(type(data[key]) is not str for key in required):
    print("  FAIL: name, description, and developer_instructions must all be strings")
    raise SystemExit(1)
if data["name"] != expected_name:
    print(f"  FAIL: TOML name {data['name']!r} must equal roster/file name {expected_name!r}")
    raise SystemExit(1)
if "\n" in data["description"]:
    print("  FAIL: description must be one line")
    raise SystemExit(1)
body = data["developer_instructions"]
if kind == "review-only":
    body = data["developer_instructions"]
    def normalize_contract(value):
        return " ".join(value.split()).casefold()
    approved_contracts = {
        normalize_contract("Review-only. Compare what was requested with what was delivered, report concrete drift with file:line evidence. Never implement and never mutate project files."),
        normalize_contract("Review-only. Never implement and never mutate project files. Report a verdict with file:line evidence."),
    }
    if normalize_contract(body) not in approved_contracts:
        print("intent-guard contract mismatch: developer_instructions must equal an approved normalized review-only contract", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(0)

expected_headings = [
    "Mission", "Owned surfaces", "Exclusions", "Must-load references",
    "Unique invariants", "Unique verification",
]
actual_headings = re.findall(r"^#{1,6}[ ]+(.+)$", body, flags=re.MULTILINE)
if actual_headings != expected_headings:
    print("  FAIL: body headings must be exactly the six ordered teams-setup headings in developer_instructions")
    raise SystemExit(1)
reference = f".codex/teams/{team}/team.md"
if body.count(reference) != 1:
    print(f"  FAIL: Must-load references must name {reference} exactly once")
    raise SystemExit(1)
must_load = body.split("## Must-load references\n", 1)[1].split("\n## ", 1)[0]
bullets = [line for line in must_load.splitlines() if line.startswith("- ")]
if not bullets or bullets[0] != "- " + chr(96) + reference + chr(96):
    print(f"  FAIL: {reference} must be the first Must-load references bullet")
    raise SystemExit(1)
body_bytes = len(body.encode("utf-8"))
body_tokens = (len(body) + 3) // 4
if body_bytes > 3200 or body_tokens > 800:
    print(f"  FAIL: developer_instructions is {body_bytes} bytes/{body_tokens} est-tokens; ceilings are 3200 bytes and 800 ceil(chars/4) tokens")
    raise SystemExit(1)
PY
}
# END CLIENT AGENT VALIDATION

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
  team_chars=$(wc -m < "$TEAM_DIR/team.md" | tr -d '[:space:]')
  team_tokens=$(( (team_chars + 3) / 4 ))
  if [ "$team_chars" -le 2800 ] && [ "$team_tokens" -le 700 ]; then
    echo "CHECK: full team.md ceiling ... OK ($team_chars chars, $team_tokens est-tokens)"
  else
    echo "CHECK: full team.md ceiling ... FAIL ($team_chars chars, $team_tokens est-tokens; maximum 2800 chars and 700 ceil(chars/4) tokens)"
    FAIL=1
  fi

  declared_agents_count=$(grep -cE '^\|[[:space:]]*Agents[[:space:]]*\|' "$TEAM_DIR/team.md" || true)
  declared_agents=""
  if [ "$declared_agents_count" -eq 1 ]; then
    declared_agents=$(sed -n 's/^|[[:space:]]*Agents[[:space:]]*|[[:space:]]*\([0-9][0-9]*\)[[:space:]]*|.*/\1/p' "$TEAM_DIR/team.md")
  fi
  if [ "$declared_agents_count" -ne 1 ] || [ -z "$declared_agents" ]; then
    echo "CHECK: declared Agents count ... FAIL (requires exactly one numeric | Agents | N | row)"
    FAIL=1
  fi

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

  # Current teams declare whether the shared review-only role is required or intentionally absent.
  # An old team without the field remains migratable; once the shared contract is present the policy
  # is mandatory and the roster must match it exactly.
  intent_guard_policy=""
  intent_guard_policy_count=$(grep -cE '^\|[[:space:]]*Intent guard[[:space:]]*\|' "$TEAM_DIR/team.md" || true)
  if [ "$intent_guard_policy_count" -eq 1 ]; then
    intent_guard_policy=$(sed -n 's/^|[[:space:]]*Intent guard[[:space:]]*|[[:space:]]*\([^|]*[^|[:space:]]\)[[:space:]]*|.*/\1/p' "$TEAM_DIR/team.md")
  fi

  # New teams centralize the repeated member contract once. Absence remains safe only for a fully
  # legacy roster; a compact profile with no destination contract is an interrupted-install defect.
  shared_contract_present=0
  if ! grep -qF '## Shared Agent Contract' "$TEAM_DIR/team.md"; then
    echo "WARN: $TEAM_DIR/team.md has no Shared Agent Contract (legacy team). Fix: \$brewcode:teams-setup upgrade"
  else
    shared_contract_present=1
    shared_bad=0
    if [ "$intent_guard_policy_count" -ne 1 ]; then
      echo "CHECK: Intent guard policy ... FAIL (current team.md requires exactly one policy row)"
      shared_bad=1
    else
      case "$intent_guard_policy" in
        required|legacy-absent) echo "CHECK: Intent guard policy ($intent_guard_policy) ... OK" ;;
        *) echo "CHECK: Intent guard policy ... FAIL (expected required or legacy-absent; found '$intent_guard_policy')"; shared_bad=1 ;;
      esac
    fi
    shared_count=$(grep -cF '## Shared Agent Contract' "$TEAM_DIR/team.md" || true)
    [ "$shared_count" -eq 1 ] \
      || { echo "CHECK: Shared Agent Contract ... FAIL (must occur exactly once; found $shared_count)"; shared_bad=1; }
    shared_contract=$(awk '
      /^## Shared Agent Contract$/ { active = 1 }
      /^## Agents$/ { active = 0 }
      active { print }
    ' "$TEAM_DIR/team.md")
    for shared_literal in \
      'Every domain agent loads this file before task acceptance. `intent-guard` is exempt: it keeps its review-only output contract and never implements.' \
      'Before any task evaluate `Domain`, `Duplicate`, `Best candidate`.' \
      'execute only owned surfaces' 'profile exclusions win on overlap' \
      'Optional best effort, `1 attempt max`, no retry, Bash only.' \
      ".codex/teams/$TEAM_NAME/trace-ops.sh" \
      'no `*_PLUGIN_ROOT` env' 'plugin update/move/uninstall does not break it' \
      'Track states: `took` / `refused` / `completed` / `failed`.' \
      'Issue severity: `low` / `medium` / `high` / `critical`.' \
      'Insight category (max 1-3): `pattern` / `architecture` / `performance` / `security` / `convention` / `debt`.' \
      '`$SID` is 8 chars' \
      'A task traced `took` ends with exactly one terminal track: `completed` or `failed`.' \
      'Verdict first, <=30 lines, `path:line`. !=bodies/output/log/preamble.' \
      'This holds with or without agent-return.' \
      '.codex/reports/YYYYMMDD-HHMMSS_{AGENT_NAME}/' \
      '>~1000 est-tokens (`chars/4`)' '>~2500' '<=3 lines' \
      '!=imagined load/speculative abstraction' '!=replace them'
    do
      printf '%s\n' "$shared_contract" | grep -qF "$shared_literal" \
        || { echo "CHECK: Shared Agent Contract ... FAIL (missing: $shared_literal)"; shared_bad=1; }
    done
    [ "$shared_bad" -eq 0 ] \
      && echo "CHECK: Shared Agent Contract ... OK" \
      || FAIL=1
  fi

  in_agents=0
  past_header=0
  found_agents=0
  intent_guard_count=0
  intent_guard_cells_ok=1
  unique_domain_rows=0
  seen_agent_ids="|"
  team_version=$(sed -n 's/^|[[:space:]]*Version[[:space:]]*|[[:space:]]*\([^|]*[^|[:space:]]\)[[:space:]]*|.*/\1/p' "$TEAM_DIR/team.md")
  team_last_update=$(sed -n 's/^|[[:space:]]*Last update[[:space:]]*|[[:space:]]*\([^|]*[^|[:space:]]\)[[:space:]]*|.*/\1/p' "$TEAM_DIR/team.md")
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
        case "$seen_agent_ids" in
          *"|$agent|"*)
            echo "CHECK: roster name '$agent' ... FAIL (duplicate roster name)"
            FAIL=1
            ;;
          *)
            seen_agent_ids="${seen_agent_ids}${agent}|"
            if [ "$agent" != "intent-guard" ]; then
              agent_kind=$(printf '%s' "$line" | cut -d'|' -f7 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
              case "$agent_kind" in
                ''|domain) unique_domain_rows=$((unique_domain_rows + 1)) ;;
                *) echo "CHECK: agent '$agent' kind ... FAIL (domain rows require Kind domain or blank)"; FAIL=1 ;;
              esac
            fi
            ;;
        esac
        if [ "$agent" = "intent-guard" ]; then
          intent_guard_count=$((intent_guard_count + 1))
          agent_domain=$(printf '%s' "$line" | cut -d'|' -f3 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          agent_mission=$(printf '%s' "$line" | cut -d'|' -f4 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          agent_status=$(printf '%s' "$line" | cut -d'|' -f5 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          agent_updated=$(printf '%s' "$line" | cut -d'|' -f6 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          agent_kind=$(printf '%s' "$line" | cut -d'|' -f7 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          agent_version=$(printf '%s' "$line" | cut -d'|' -f8 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
          if [ "$agent_domain" != "--" ] \
            || [ "$agent_mission" != "Anti-drift check: what was ASKED vs what was DELIVERED" ] \
            || [ "$agent_status" != "active" ] \
            || [ "$agent_updated" != "$team_last_update" ] \
            || [ "$agent_kind" != "review-only" ] \
            || [ "$agent_version" != "$team_version" ]; then
            intent_guard_cells_ok=0
          fi
        fi
        printf "CHECK: agent %s ... " "$agent"
        # BOTH copies present is checked FIRST: a live-first if/parked-elif chain reads a dual copy
        # as a healthy live agent and hides the collision. `.codex/agents/` is project-global, so the
        # live file may belong to someone else entirely and `enable` must not resolve it by guessing.
        if [ -f ".codex/agents/${agent}.toml" ] && [ -f ".codex/agents/${agent}.toml.disabled" ]; then
          echo "CONFLICT"
          echo "  CONFLICT: both .codex/agents/${agent}.toml and .codex/agents/${agent}.toml.disabled exist."
          echo "        The parked copy cannot be restored without overwriting the live one, and 'enable'"
          echo "        refuses while both are there. Keep the copy you want, delete or rename the other."
          CONFLICT=$((CONFLICT + 1))
          FAIL=1
        elif [ -f ".codex/agents/${agent}.toml" ]; then
          # BEGIN LIVE CLIENT AGENT CHECK
          native_kind=domain
          [ "$agent" = "intent-guard" ] && native_kind=review-only
          set +e
          native_out=$(check_native_agent ".codex/agents/${agent}.toml" "$agent" "$native_kind")
          native_rc=$?
          set -e
          if [ "$native_rc" -eq 0 ]; then
            echo "OK"
            if [ "$native_kind" = "domain" ] && [ "$shared_contract_present" -ne 1 ]; then
              echo "  CHECK: compact six-heading profile ... FAIL (shared team contract missing; interrupted install/unsafe migration)"
              FAIL=1
            elif [ "$native_kind" = "domain" ]; then
              echo "  CHECK: structurally parsed six-heading developer_instructions ... OK"
            fi
          else
            echo "FAIL"
            printf '%s
' "$native_out"
            FAIL=1
          fi
          # END LIVE CLIENT AGENT CHECK
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
  if [ -n "$declared_agents" ] && [ "$declared_agents" -eq "$unique_domain_rows" ]; then
    echo "CHECK: declared Agents count ... OK ($declared_agents unique domain rows)"
  elif [ -n "$declared_agents" ]; then
    echo "CHECK: declared Agents count ... FAIL (declared $declared_agents, found $unique_domain_rows unique domain rows)"
    FAIL=1
  fi
  case "$intent_guard_policy" in
    required)
      if [ "$intent_guard_count" -ne 1 ]; then
        echo "CHECK: intent-guard roster contract ... FAIL (policy required needs exactly one row; found $intent_guard_count)"
        FAIL=1
      elif [ "$intent_guard_cells_ok" -ne 1 ]; then
        echo "CHECK: intent-guard roster contract ... FAIL (fixed cells require --, anti-drift mission, active, team Last update, review-only, and team Version)"
        FAIL=1
      else
        echo "CHECK: intent-guard roster contract ... OK"
      fi
      ;;
    legacy-absent)
      if [ "$intent_guard_count" -ne 0 ]; then
        echo "CHECK: intent-guard roster contract ... FAIL (policy legacy-absent requires zero rows; found $intent_guard_count)"
        FAIL=1
      fi
      ;;
    "")
      if [ "$shared_contract_present" -eq 0 ]; then
        if [ "$intent_guard_count" -eq 0 ]; then
          echo "WARN: legacy team has no intent-guard row; upgrade records policy legacy-absent without adding a role"
        else
          echo "WARN: legacy intent-guard roster row predates the explicit required policy. Fix: \$brewcode:teams-setup upgrade"
        fi
      fi
      ;;
  esac
fi

printf 'DISABLED_AGENTS:%s\n' "$DISABLED"
printf 'CONFLICT_AGENTS:%s\n' "$CONFLICT"

if [ "$FAIL" -eq 0 ]; then
  if [ "$DISABLED" -gt 0 ]; then
    echo "VERIFY: PASS (team DISABLED -- $DISABLED agent file(s) parked as .toml.disabled)"
  else
    echo "VERIFY: PASS"
  fi
  exit 0
else
  echo "VERIFY: FAIL"
  exit 1
fi
