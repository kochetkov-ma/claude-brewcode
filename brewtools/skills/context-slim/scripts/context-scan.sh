#!/usr/bin/env bash
# context-scan.sh - discover potential context inventory and byte-size proxies.
#
#   context-scan.sh [--root PATH] [--global] [--tier T] [--json] [--help]
#
#   --root PATH   project root to scan (default: CLAUDE_PROJECT_DIR, else git toplevel, else cwd)
#   --global      also scan the global root $HOME/.claude
#   --tier T      always-on | per-spawn | per-invocation | all   (default: all)
#   --json        emit JSON on stdout (default, and the only output format)
#
# Tiers are inventory buckets, not observed loading: always-on includes conditional/imported
# instructions and memory; per-spawn inventories agent files; per-invocation inventories skills
# and lazy references. Loading conditions are reported separately; totals are potential sizes.
#
# Exit: 0 complete inventory | 2 usage/state/discovery error (partial JSON has scan_issues; no project writes).
set -euo pipefail
export LC_ALL=C

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }
die() { printf '%s\n' "$*" >&2; exit 2; }

# CLAUDE_PROJECT_DIR -> git toplevel -> cwd (same contract as text-guard.sh).
resolve_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    (cd "$CLAUDE_PROJECT_DIR" && pwd); return 0
  fi
  local top
  if top=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ]; then printf '%s\n' "$top"; return 0; fi
  pwd
}

ROOT=""; SCAN_GLOBAL=0; TIER_FILTER="all"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:-}"; [ -n "$ROOT" ] || die "❌ --root needs a value"; shift 2 ;;
    --global) SCAN_GLOBAL=1; shift ;;
    --tier) TIER_FILTER="${2:-}"; shift 2
            case "$TIER_FILTER" in always-on|per-spawn|per-invocation|all) ;; *) die "❌ unknown tier: $TIER_FILTER" ;; esac ;;
    --json) shift ;;
    -h|--help|help) usage; exit 0 ;;
    *) die "❌ unknown option: $1" ;;
  esac
done
[ -n "$ROOT" ] || ROOT=$(resolve_root)
[ -d "$ROOT" ] || die "❌ not a directory: $ROOT"
ROOT=$(cd "$ROOT" && pwd)
GLOBAL_ROOT="$HOME/.claude"

# Vendored/mirrored/scratch trees are not context - they are copies of what is already counted.
# `backups` and `reports` hold verbatim ORIGINALS (context-guard/text-guard snapshots): scanning them
# both inflates the baseline and would hand a snapshot copy to a rewriting subagent.
PRUNE=( -name .git -o -name node_modules -o -name dist -o -name build -o -name .next -o -name vendor
        -o -name .codex -o -name tmp -o -name web -o -name plugins -o -name projects -o -name .template-baseline
        -o -name backups -o -name reports -o -name worktrees )

ROWS=$(mktemp); SEEN=$(mktemp); ISSUES=$(mktemp); FIND_ERRORS=$(mktemp)
trap 'rm -f "$ROWS" "$SEEN" "$ISSUES" "$FIND_ERRORS"' EXIT

N_A=0; B_A=0; T_A=0; N_S=0; B_S=0; T_S=0; N_I=0; B_I=0; T_I=0

json_esc() {
  local value="$1"
  value=${value//\\/\\\\}; value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}; value=${value//$'\r'/\\r}; value=${value//$'\t'/\\t}
  printf '%s' "$value"
}
# Follow links only in declared instruction roots; broad project discovery stays physical.
find_docs() { # label instruction_root
  local label="$1" path="$2" detail status=1
  if [ -d "$path" ]; then
    if find -L "$path" -type d \( "${PRUNE[@]}" \) -prune -o -type f -name '*.md' -print 2>"$FIND_ERRORS"; then
      status=0
    else
      status=$?
    fi
    if [ "$status" -eq 0 ] && [ ! -s "$FIND_ERRORS" ]; then return 0; fi
    detail=$(cat "$FIND_ERRORS")
  elif [ -L "$path" ]; then
    detail="Instruction directory link does not resolve to a directory"
  else
    return 0
  fi
  printf '{"root":"%s","path":"%s","kind":"discovery-incomplete","exit_status":%s,"detail":"%s"}\n' \
    "$label" "$(json_esc "$path")" "$status" "$(json_esc "$detail")" >> "$ISSUES"
}

# Legacy token_model stays chars/4; the actual proxy is bytes/4, not a tokenizer measurement.
# UTF-8 byte counts differ from character counts; no bound on tokenizer error is claimed.
add_row() { # root_label tier path kind estimated bytes [loading]
  local label="$1" tier="$2" path="$3" kind="$4" est="$5" bytes="$6" loading="${7:-runtime-dependent}" tok key
  case "$TIER_FILTER" in all|"$tier") ;; *) return 0 ;; esac
  [ "${bytes:-0}" -gt 0 ] 2>/dev/null || return 0
  key="$tier|$path|$kind"
  grep -qxF "$key" "$SEEN" && return 0
  printf '%s\n' "$key" >> "$SEEN"
  tok=$((bytes / 4))
  printf '{"path":"%s","root":"%s","tier":"%s","kind":"%s","bytes":%s,"tokens":%s,"estimated":%s,"loading":"%s"}\n' \
    "$(json_esc "$path")" "$label" "$tier" "$kind" "$bytes" "$tok" "$est" "$loading" >> "$ROWS"
  case "$tier" in
    always-on)      N_A=$((N_A + 1)); B_A=$((B_A + bytes)); T_A=$((T_A + tok)) ;;
    per-spawn)      N_S=$((N_S + 1)); B_S=$((B_S + bytes)); T_S=$((T_S + tok)) ;;
    per-invocation) N_I=$((N_I + 1)); B_I=$((B_I + bytes)); T_I=$((T_I + tok)) ;;
  esac
}

add_whole() { # label path tier [loading]
  [ -f "$2" ] || return 0
  add_row "$1" "$3" "$2" file false "$(wc -c < "$2" | tr -d ' ')" "${4:-runtime-dependent}"
}

add_memory() { # label memory_file
  case "${2##*/}" in
    MEMORY.md) add_whole "$1" "$2" always-on memory-index-limited ;;
    *) add_whole "$1" "$2" always-on on-demand ;;
  esac
}

add_rule() { # label rule_file
  local loading="unscoped-rule"
  if awk 'NR == 1 && $0 !~ /^---[[:space:]]*$/ {exit}
          NR > 1 && /^---[[:space:]]*$/ {exit}
          /^paths:/ {found=1} END {exit !found}' "$2"; then
    loading="path-scoped-rule"
  fi
  add_whole "$1" "$2" always-on "$loading"
}

# Agent description fields are discovery inventory; bodies belong to per-spawn inventory.
# Handles both the inline form and the `description: |` / `>` block scalar (whose value is the
# indented lines that follow, not the marker char).
add_desc() { # label agent_md
  local n
  [ -f "$2" ] || return 0
  n=$(awk 'NR>1 && /^---[[:space:]]*$/ {exit}
           blk { if ($0 ~ /^[[:space:]]/ || $0 == "") { print; next } exit }
           /^description:[[:space:]]*[|>]/ {blk=1; next}
           /^description:/ {sub(/^description:[[:space:]]*/,""); print; exit}' "$2" | wc -c | tr -d ' ')
  add_row "$1" always-on "$2" "field:description" false "$n"
}

# Hook-injected text is emitted by a script, not read as a file, so it cannot be measured exactly.
# Heuristic (ESTIMATE): sum the RHS of top-level UPPER_SNAKE string constants - the shape every
# injected block in brewcode/hooks/lib/reminder.mjs uses. Quote chars are counted, runtime
# interpolation is not; expect a few percent either way.
add_hook() { # label mjs
  local n
  [ -f "$2" ] || return 0
  n=$( (grep -E "^(export )?const [A-Z][A-Z0-9_]+ = ." "$2" || true) | sed -e 's/^[^=]*= //' -e 's/;$//' | wc -c | tr -d ' ')
  [ "$n" -gt 1 ] || return 0
  add_row "$1" always-on "$2" hook-payload true "$n"
}

scan_root() { # label root
  local label="$1" root="$2" f d r
  [ -d "$root" ] || return 0

  # --- always-on -------------------------------------------------------------
  for f in "$root/CLAUDE.md" "$root/CLAUDE.local.md"; do
    add_whole "$label" "$f" always-on startup-instruction
  done
  for f in "$root/AGENTS.md" "$root/.claude/AGENTS.md"; do
    add_whole "$label" "$f" always-on client-or-import-dependent
  done
  while IFS= read -r f; do add_rule "$label" "$f"; done < <(
    { find_docs "$label" "$root/rules"; find_docs "$label" "$root/.claude/rules"; } | sort)
  for f in "$root"/.claude/convention/*; do
    add_whole "$label" "$f" always-on import-or-read-required
  done
  while IFS= read -r f; do add_memory "$label" "$f"; done < <(
    find "$root/.claude/memory" -type f -name '*.md' 2>/dev/null | sort)

  while IFS= read -r f; do add_hook "$label" "$f"; done < <(
    find "$root" -type d \( "${PRUNE[@]}" \) -prune -o -type f -path '*/hooks/*' -name '*.mjs' -print 2>/dev/null | sort)

  # --- per-spawn: agent bodies (+ their description field, above) -------------
  while IFS= read -r f; do
    add_whole "$label" "$f" per-spawn selected-agent
    add_desc "$label" "$f"
    # `! -path '*/skills/*'` excludes a SKILL directory that happens to be named `agents`
    # (brewcode/skills/agents/) - its SKILL.md is per-invocation, its README.md is not context at all.
  done < <(find "$root" -type d \( "${PRUNE[@]}" \) -prune -o -type f -path '*/agents/*.md' ! -path '*/skills/*' -print 2>/dev/null | sort)

  # --- per-invocation: skill bodies and references read on demand -------------
  while IFS= read -r f; do
    d=$(dirname "$f")
    add_whole "$label" "$f" per-invocation invoked-skill
    while IFS= read -r r; do add_whole "$label" "$r" per-invocation on-demand; done < <(
      find_docs "$label" "$d/references" | sort)
  done < <(find "$root" -type d \( "${PRUNE[@]}" \) -prune -o -type f -name 'SKILL.md' -print 2>/dev/null | sort)
}

scan_root project "$ROOT"
# Default auto-memory inventory; configured paths and actual loaded content are not observed.
MEM="$HOME/.claude/projects/$(printf '%s' "$ROOT" | tr '/' '-')/memory"
while IFS= read -r f; do add_memory project "$f"; done < <(
  find "$MEM" -type f -name '*.md' 2>/dev/null | sort)

[ "$SCAN_GLOBAL" -eq 1 ] && scan_root global "$GLOBAL_ROOT"

grand_b=$((B_A + B_S + B_I)); grand_t=$((T_A + T_S + T_I)); grand_n=$((N_A + N_S + N_I))

{
  printf '{\n  "roots": {"project": "%s", "global": %s},\n' "$(json_esc "$ROOT")" \
    "$( [ "$SCAN_GLOBAL" -eq 1 ] && printf '"%s"' "$(json_esc "$GLOBAL_ROOT")" || printf 'null')"
  printf '  "tier_filter": "%s",\n  "token_model": "chars/4",\n' "$TIER_FILTER"
  printf '  "measurement": {"scope": "potential-inventory", "token_proxy": "bytes/4", "actual_loading_observed": false},\n  "files": [\n'
  sed -e 's/^/    /' -e '$!s/$/,/' "$ROWS"
  printf '  ],\n  "scan_issues": [\n'
  sed -e 's/^/    /' -e '$!s/$/,/' "$ISSUES"
  printf '  ],\n  "totals": {\n'
  printf '    "always-on": {"files": %s, "bytes": %s, "tokens": %s},\n' "$N_A" "$B_A" "$T_A"
  printf '    "per-spawn": {"files": %s, "bytes": %s, "tokens": %s},\n' "$N_S" "$B_S" "$T_S"
  printf '    "per-invocation": {"files": %s, "bytes": %s, "tokens": %s},\n' "$N_I" "$B_I" "$T_I"
  printf '    "grand": {"files": %s, "bytes": %s, "tokens": %s}\n  }\n}\n' "$grand_n" "$grand_b" "$grand_t"
}
if [ -s "$ISSUES" ]; then exit 2; fi
