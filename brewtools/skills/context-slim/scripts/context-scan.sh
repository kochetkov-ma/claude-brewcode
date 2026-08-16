#!/usr/bin/env bash
# context-scan.sh - discover + measure everything that permanently enters the LLM context.
#
#   context-scan.sh [--root PATH] [--global] [--tier T] [--json] [--help]
#
#   --root PATH   project root to scan (default: CLAUDE_PROJECT_DIR, else git toplevel, else cwd)
#   --global      also scan the global root $HOME/.claude
#   --tier T      always-on | per-spawn | per-invocation | all   (default: all)
#   --json        emit JSON on stdout (default, and the only output format)
#
# Tiers: always-on = loaded into EVERY request (CLAUDE.md, rules, conventions, AGENTS.md, memory,
# agent `description:` fields, hook-injected text). per-spawn = agent .md bodies, paid once per
# subagent. per-invocation = SKILL.md + references/*.md, paid when a skill is invoked.
#
# Exit: 0 ok | 2 usage/state error (nothing written).
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

ROWS=$(mktemp); SEEN=$(mktemp)
trap 'rm -f "$ROWS" "$SEEN"' EXIT

N_A=0; B_A=0; T_A=0; N_S=0; B_S=0; T_S=0; N_I=0; B_I=0; T_I=0

json_esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g'; }

# Token proxy = chars/4, the same sizing agent-return-setup uses for subagent returns.
# Byte count stands in for chars; UTF-8 prose inflates it slightly, which is the conservative direction.
add_row() { # root_label tier path kind estimated bytes
  local label="$1" tier="$2" path="$3" kind="$4" est="$5" bytes="$6" tok key
  case "$TIER_FILTER" in all|"$tier") ;; *) return 0 ;; esac
  [ "${bytes:-0}" -gt 0 ] 2>/dev/null || return 0
  key="$tier|$path|$kind"
  grep -qxF "$key" "$SEEN" && return 0
  printf '%s\n' "$key" >> "$SEEN"
  tok=$((bytes / 4))
  printf '{"path":"%s","root":"%s","tier":"%s","kind":"%s","bytes":%s,"tokens":%s,"estimated":%s}\n' \
    "$(json_esc "$path")" "$label" "$tier" "$kind" "$bytes" "$tok" "$est" >> "$ROWS"
  case "$tier" in
    always-on)      N_A=$((N_A + 1)); B_A=$((B_A + bytes)); T_A=$((T_A + tok)) ;;
    per-spawn)      N_S=$((N_S + 1)); B_S=$((B_S + bytes)); T_S=$((T_S + tok)) ;;
    per-invocation) N_I=$((N_I + 1)); B_I=$((B_I + bytes)); T_I=$((T_I + tok)) ;;
  esac
}

add_whole() { # label path tier
  [ -f "$2" ] || return 0
  add_row "$1" "$3" "$2" file false "$(wc -c < "$2" | tr -d ' ')"
}

# Only the frontmatter `description:` of an agent is always-on; the body is per-spawn.
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
  local label="$1" root="$2" f d
  [ -d "$root" ] || return 0

  # --- always-on -------------------------------------------------------------
  for f in "$root/CLAUDE.md" "$root/CLAUDE.local.md" "$root/AGENTS.md" "$root/.claude/AGENTS.md"; do
    add_whole "$label" "$f" always-on
  done
  # Claude Code loads rules/ and convention/ ONE level deep - never recurse here.
  for f in "$root"/rules/*.md "$root"/.claude/rules/*.md "$root"/.claude/convention/*; do
    add_whole "$label" "$f" always-on
  done
  while IFS= read -r f; do add_whole "$label" "$f" always-on; done < <(
    find "$root/.claude/memory" -type f -name '*.md' 2>/dev/null | sort)

  while IFS= read -r f; do add_hook "$label" "$f"; done < <(
    find "$root" -type d \( "${PRUNE[@]}" \) -prune -o -type f -path '*/hooks/*' -name '*.mjs' -print 2>/dev/null | sort)

  # --- per-spawn: agent bodies (+ their description field, above) -------------
  while IFS= read -r f; do
    add_whole "$label" "$f" per-spawn
    add_desc "$label" "$f"
    # `! -path '*/skills/*'` excludes a SKILL directory that happens to be named `agents`
    # (brewcode/skills/agents/) - its SKILL.md is per-invocation, its README.md is not context at all.
  done < <(find "$root" -type d \( "${PRUNE[@]}" \) -prune -o -type f -path '*/agents/*.md' ! -path '*/skills/*' -print 2>/dev/null | sort)

  # --- per-invocation: SKILL.md + references/*.md ------------------------------
  while IFS= read -r f; do
    d=$(dirname "$f")
    add_whole "$label" "$f" per-invocation
    for r in "$d"/references/*.md; do add_whole "$label" "$r" per-invocation; done
  done < <(find "$root" -type d \( "${PRUNE[@]}" \) -prune -o -type f -name 'SKILL.md' -print 2>/dev/null | sort)
}

scan_root project "$ROOT"
# The per-project memory dir lives under $HOME, outside the repo, but is always-on for it.
MEM="$HOME/.claude/projects/$(printf '%s' "$ROOT" | tr '/' '-')/memory"
while IFS= read -r f; do add_whole project "$f" always-on; done < <(
  find "$MEM" -type f -name '*.md' 2>/dev/null | sort)

[ "$SCAN_GLOBAL" -eq 1 ] && scan_root global "$GLOBAL_ROOT"

grand_b=$((B_A + B_S + B_I)); grand_t=$((T_A + T_S + T_I)); grand_n=$((N_A + N_S + N_I))

{
  printf '{\n  "roots": {"project": "%s", "global": %s},\n' "$(json_esc "$ROOT")" \
    "$( [ "$SCAN_GLOBAL" -eq 1 ] && printf '"%s"' "$(json_esc "$GLOBAL_ROOT")" || printf 'null')"
  printf '  "tier_filter": "%s",\n  "token_model": "chars/4",\n  "files": [\n' "$TIER_FILTER"
  sed -e 's/^/    /' -e '$!s/$/,/' "$ROWS"
  printf '  ],\n  "totals": {\n'
  printf '    "always-on": {"files": %s, "bytes": %s, "tokens": %s},\n' "$N_A" "$B_A" "$T_A"
  printf '    "per-spawn": {"files": %s, "bytes": %s, "tokens": %s},\n' "$N_S" "$B_S" "$T_S"
  printf '    "per-invocation": {"files": %s, "bytes": %s, "tokens": %s},\n' "$N_I" "$B_I" "$T_I"
  printf '    "grand": {"files": %s, "bytes": %s, "tokens": %s}\n  }\n}\n' "$grand_n" "$grand_b" "$grand_t"
}
