#!/bin/bash
# brewcode:superreview-setup generator (cwd = target repo -> <cwd>/.codex/skills/superreview/): scan|emit|emit-agent|upgrade|enable|disable|uninstall|purge|validate.
# Env: PROJECT_NAME, TRACKER_LABEL, SPEC/PLAN/POLICY_LOCATION; emit +STACK_LABEL, STACK_REF, SOURCE_GLOB, PATHSPEC_GLOBS, *_AGENT*.

set -euo pipefail

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/superreview-setup/scripts -> skills/superreview-setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"
# Plugin manifest by SELF-LOCATION: skills/superreview-setup -> skills -> <plugin root>.
# Correct in the dev checkout AND in the installed cache. The version is NEVER hardcoded.
PLUGIN_JSON="$SKILL_DIR/../../.codex-plugin/plugin.json"

# Target is the current working directory (the repo being reviewed)
TARGET=".codex/skills/superreview"
TARGET_REFS="$TARGET/references"
# Where `upgrade` stages a fresh emit for comparison. Dot-prefixed so the skill loader ignores it; removed by the caller.
STAGING="$TARGET/.upgrade-staging"
# Pristine copies of the templates the live install was emitted from. `upgrade` diffs the NEW template against
# these, so Phase 3 tailoring in the live files can never be mistaken for a template change.
BASELINE="$TARGET/.template-baseline"
# Where `disable` parks SKILL.md. Read by `enable`/`disable` and by `upgrade`, which must tell a DISABLED
# install apart from one whose SKILL.md was deleted.
DISABLED_MARK="$TARGET/SKILL.md.disabled"

# The one agent file this script owns, and the provenance stamp that proves a file came out of this pipeline.
IG_PATH=".codex/agents/intent-guard.toml"
IG_STAMP_PREFIX="<!-- generated_by: brewcode:superreview-setup"   # tail anchor + provenance; survives the header strip
# RETIRED pre-5.0 tail stamp (`<!-- intent-guard template v2 - emitted <ts> - source: ... -->`): without IG_STAMP_PREFIX
# it marks a pre-standard file of THIS pipeline (ours, migratable) != a hand-written agent with no stamp.
IG_LEGACY_STAMP_RE='<!--[[:space:]]*intent-guard template v[0-9]'
IG_SEED_MARK="<!-- SEEDED-DEFAULT:"              # one per generic BLOCK default; removed by Phase 3 adaptation

# Every temp dir goes through $_bd; the trap makes leaks impossible on any exit path.
_bd=""
_igt=""
trap '[ -n "$_bd" ] && rm -rf "$_bd"; [ -n "$_igt" ] && rm -rf "$_igt"' EXIT

validate_templates() {
  for t in "$REFS/SKILL.md.template" "$REFS/scope.md.template" "$REFS/agent-prompt.md" \
           "$REFS/report-template.md" "$REFS/intent-guard.md.template"; do
    if [ ! -f "$t" ]; then
      echo "❌ Emit template not found: $t"
      exit 1
    fi
  done
}

# ── scan: report what the emitted skill must be wired to ────────────────────────
# `find | sort` exits 0 on empty -> fallback lives here; `|| true`: missing dir + set -e aborts the assignment.
_list() { _out=$(eval "$1" 2>/dev/null || true); if [ -n "$_out" ]; then printf '%s\n' "$_out"; else echo "${2:-(none)}"; fi; }

scan_target() {
  echo "=== superreview: target scan ==="
  echo ""
  echo "--- Build files ---"
  _list 'find . -maxdepth 3 -type f \( \
    -name "package.json" -o -name "pom.xml" -o -name "build.gradle" -o \
    -name "build.gradle.kts" -o -name "requirements*.txt" -o -name "pyproject.toml" -o \
    -name "Pipfile" -o -name "Cargo.toml" -o -name "go.mod" -o -name "composer.json" \
  \) | sort' "(none found)"

  echo ""
  echo "--- Project agents (.codex/agents/) — DOMAIN EXPERT roster ---"
  if [ -d .codex/agents ]; then
    # Codex scans .codex/agents/ recursively; -H + [ -f ] keep symlinked dir/files.
    _n=0
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      _n=$((_n+1))
      printf '%s :: %s :: %s\n' "$f" \
        "$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//')" \
        "$(grep -m1 '^description:' "$f" | sed 's/^description:[[:space:]]*//' | cut -c1-220)"
    done <<EOF
$(find -H .codex/agents -name '*.toml' 2>/dev/null | sort || true)
EOF
    echo "agents=$_n"
    [ "$_n" -eq 0 ] && echo "⚠️ NO domain experts — superreview routed to generic agents is a DEGRADED review"
  else
    echo "(none)"
    echo "⚠️ NO .codex/agents/ — create domain experts before generating (see SKILL.md Phase 1.6)"
  fi

  echo ""
  echo "--- Scope baseline sources (tracker) ---"
  test -d .codex/features && echo "✅ .codex/features/ (file-based Kanban)" || echo "— no .codex/features/"
  command -v gh >/dev/null 2>&1 && echo "✅ gh CLI present" || echo "— no gh CLI"
  git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/branch: /' || true
  test -d .github && echo "✅ .github/ present" || echo "— no .github/"

  echo ""
  echo "--- Rules (.codex/rules/) ---"
  _list 'find .codex/rules -type f -name "*.md" | sort'

  echo ""
  echo "--- Conventions (.codex/convention/) ---"
  _list 'find .codex/convention -type f -name "*.md" | sort'

  echo ""
  echo "--- Source / service dirs (top level) ---"
  _list 'find . -maxdepth 2 -type d \( -name "src" -o -name "app" -o -name "lib" -o \
    -name "pkg" -o -name "internal" -o -name "cmd" \) | sort'

  echo ""
  echo "--- Test dirs ---"
  _list 'find . -type d \( -name "test" -o -name "tests" -o -name "__tests__" \) | head -20'

  echo ""
  echo "--- Gate commands (candidates for GATE_COMMANDS) ---"
  _list 'grep -oE "\"(build|lint|typecheck|type-check|test)\"[[:space:]]*:" package.json | tr -d "\":" | sed "s/^/npm run /"'
  _list 'grep -oE "^[a-zA-Z_-]+:" Makefile | tr -d ":" | sed "s/^/make /"' "(no Makefile targets)"

  echo ""
  echo "--- AGENTS.md ---"
  test -f ./AGENTS.md && echo "✅ AGENTS.md" || echo "⚠️ no AGENTS.md"

  echo ""
  echo "--- intent-guard: tier sources + existing agent ---"
  case "$(_ig_kind)" in
    CURRENT)
      if _check_meta_frontmatter "$IG_PATH" >/dev/null; then
        echo "✅ $IG_PATH EXISTS, current format — emit will REUSE it, never overwrite"
      else
        echo "⚠️ $IG_PATH carries our stamp but its frontmatter fails the metadata gate (earlier generation) — emit/upgrade will RESTAMP it (metadata only, body preserved)"
      fi ;;
    FOREIGN) echo "✅ $IG_PATH EXISTS, no template stamp (the project's own agent) — emit will REUSE it, never overwrite" ;;
    LEGACY)  echo "⚠️ $IG_PATH carries the RETIRED 'intent-guard template vN' stamp — emit/upgrade will MIGRATE it (metadata restamped, tailored body preserved)" ;;
    BROKEN)  echo "⚠️ $IG_PATH is empty, or is ours and has no 'name: intent-guard' frontmatter / still carries unresolved {PLACEHOLDER} tokens — emit will back it up to .bak-<ts> and RECREATE it" ;;
    *)       echo "— no $IG_PATH — emit will CREATE it from the template" ;;
  esac
  echo "Tier 2 (SPEC_LOCATION candidates):"
  _list 'find .codex/specs .codex/spec docs/specs doc/specs -maxdepth 2 -type f -name "*.md" | sort | head -20' "(none — SPEC_LOCATION=none)"
  echo "Tier 3 (PLAN_LOCATION candidates):"
  _list 'find .codex/features .codex/tasks -maxdepth 2 \( -type f -o -type d \) | sort | head -20' "(none — PLAN_LOCATION=none)"
  echo "Tier 4 (POLICY_LOCATION candidates):"
  _list 'find . -maxdepth 3 -name "AGENTS.md" -not -path "./node_modules/*" | sort' "(no AGENTS.md)"
  _list 'find .codex/rules .codex/convention -type f -name "*.md" | sort' "(no rules/convention)"
  echo "Planned scale / testing / dependency policy: read the files above — they fill {PROJECT_INVARIANTS_TABLE}"
}

# ── shared: scalar resolution + substitution (used by emit AND emit-agent) ──────
# Plugin version from manifest (jq, else sed fallback), never a literal; `|| true`: set -e aborts failing assignments.
_plugin_version() {
  _pv=""
  if [ -f "$PLUGIN_JSON" ]; then
    if command -v jq >/dev/null 2>&1; then
      _pv=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
    else
      _pv=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
    fi
  fi
  # HARD FAIL, never a placeholder: `unknown` has no `{}<>`, so `sort -V` reports `AHEAD unknown > X.Y.Z`; raw
  # `{PLUGIN_VERSION}` fails only in `validate`, after the write. Unreadable manifest = broken install -> stop first.
  case "$_pv" in
    [0-9]*.[0-9]*.[0-9]*) printf '%s' "$_pv"; return 0 ;;
  esac
  echo "❌ cannot resolve the plugin version (X.Y.Z) from $PLUGIN_JSON — refusing to stamp an artifact with a fake version" >&2
  return 1
}

# content_version from superreview-setup/SKILL.md line-1 `brewcode-meta:` marker (bump-version.sh stamps it; plugin.json
# has none). Same HARD-FAIL rule as _plugin_version(): never a placeholder-shaped value.
_content_version() {
  _cv=""
  _skill_md="$SKILL_DIR/SKILL.md"
  if [ -f "$_skill_md" ]; then
    _cv=$(grep -m1 'brewcode-meta:' "$_skill_md" | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
  fi
  case "$_cv" in
    [0-9]*.[0-9]*.[0-9]*) printf '%s' "$_cv"; return 0 ;;
  esac
  echo "❌ cannot resolve content_version from $_skill_md brewcode-meta marker — refusing to stamp an artifact with a fake value" >&2
  return 1
}

resolve_scalars() {
  [ "${_SCALARS_READY:-0}" = "1" ] && return 0
  # Scalar values (single-line ONLY — sed processes line-by-line; a newline truncates the substitution).
  PROJECT_NAME="${PROJECT_NAME:-this project}"
  STACK_LABEL="${STACK_LABEL:-the project stack}"
  STACK_REF="${STACK_REF:-python.md}"
  # Per-stack refs to COPY/RESTAMP: emit = one, upgrade derives 0..N from the install -> `${VAR-}` != `${VAR:-}`:
  # explicit EMPTY = "no stack doc", never the python.md default.
  STACK_REFS="${STACK_REFS-$STACK_REF}"
  SOURCE_GLOB="${SOURCE_GLOB:-*}"
  PATHSPEC_GLOBS="${PATHSPEC_GLOBS:-'*' 'Dockerfile*' 'docker-compose.yml' '.github/workflows/*.yml'}"
  ARBITER_AGENT="${ARBITER_AGENT:-general-purpose}"
  VALIDATOR_AGENT="${VALIDATOR_AGENT:-general-purpose}"
  SCOPE_AGENT_A="${SCOPE_AGENT_A:-Explore}"
  SCOPE_AGENT_B="${SCOPE_AGENT_B:-Explore}"
  TRACKER_LABEL="${TRACKER_LABEL:-local task board + issue tracker (read-only)}"
  # intent-guard tier sources (Tier 2/3/4). `none` is a legitimate value — an absent source is REPORTED, never invented.
  SPEC_LOCATION="${SPEC_LOCATION:-.codex/specs/**}"
  PLAN_LOCATION="${PLAN_LOCATION:-.codex/features/**}"
  POLICY_LOCATION="${POLICY_LOCATION:-\`AGENTS.md\`, \`.codex/rules/**\`}"
  # Artifact metadata, NOT env-overridable: writer is always this pipeline (teams-setup calls `emit-agent`),
  # and tail anchor IG_STAMP_PREFIX must keep matching the template.
  PLUGIN_VERSION="$(_plugin_version)" || exit 1
  CONTENT_VERSION="$(_content_version)" || exit 1
  GENERATED_BY="brewcode:superreview-setup"
  LAST_UPDATED="$(date +%F)"

  _sep=$'\x01'

  # Sanitize every scalar before it lands on a sed RHS: escape backslash FIRST, then ampersand
  # (& is the whole-match backreference in sed replacements). Order matters.
  for _var in PROJECT_NAME STACK_LABEL STACK_REF SOURCE_GLOB PATHSPEC_GLOBS ARBITER_AGENT VALIDATOR_AGENT \
              SCOPE_AGENT_A SCOPE_AGENT_B TRACKER_LABEL SPEC_LOCATION PLAN_LOCATION POLICY_LOCATION \
              PLUGIN_VERSION CONTENT_VERSION GENERATED_BY LAST_UPDATED; do
    v="${!_var}"; v="${v//\\/\\\\}"; v="${v//&/\\&}"; printf -v "$_var" '%s' "$v"
  done
  _SCALARS_READY=1
}

_subst_raw() {
    # $1 = source template -> substituted text on STDOUT
    sed \
      -e "s${_sep}{PROJECT_NAME}${_sep}${PROJECT_NAME}${_sep}g" \
      -e "s${_sep}{STACK_LABEL}${_sep}${STACK_LABEL}${_sep}g" \
      -e "s${_sep}{STACK_REF}${_sep}${STACK_REF}${_sep}g" \
      -e "s${_sep}{SOURCE_GLOB}${_sep}${SOURCE_GLOB}${_sep}g" \
      -e "s${_sep}{PATHSPEC_GLOBS}${_sep}${PATHSPEC_GLOBS}${_sep}g" \
      -e "s${_sep}{ARBITER_AGENT}${_sep}${ARBITER_AGENT}${_sep}g" \
      -e "s${_sep}{VALIDATOR_AGENT}${_sep}${VALIDATOR_AGENT}${_sep}g" \
      -e "s${_sep}{SCOPE_AGENT_A}${_sep}${SCOPE_AGENT_A}${_sep}g" \
      -e "s${_sep}{SCOPE_AGENT_B}${_sep}${SCOPE_AGENT_B}${_sep}g" \
      -e "s${_sep}{TRACKER_LABEL}${_sep}${TRACKER_LABEL}${_sep}g" \
      -e "s${_sep}{SPEC_LOCATION}${_sep}${SPEC_LOCATION}${_sep}g" \
      -e "s${_sep}{PLAN_LOCATION}${_sep}${PLAN_LOCATION}${_sep}g" \
      -e "s${_sep}{POLICY_LOCATION}${_sep}${POLICY_LOCATION}${_sep}g" \
      -e "s${_sep}{PLUGIN_VERSION}${_sep}${PLUGIN_VERSION}${_sep}g" \
      -e "s${_sep}{CONTENT_VERSION}${_sep}${CONTENT_VERSION}${_sep}g" \
      -e "s${_sep}{GENERATED_BY}${_sep}${GENERATED_BY}${_sep}g" \
      -e "s${_sep}{LAST_UPDATED}${_sep}${LAST_UPDATED}${_sep}g" \
      "$1"
}

_subst() { _subst_raw "$1" > "$2"; }

# Stack-independent emit set `<template under $REFS>|<dest rel path>`: ONE list for emit, upgrade staging,
# copy_raw_templates and upgrade's delta/restamp loops. Per-stack ref excluded ($STACK_REFS, per caller).
EMIT_SET='SKILL.md.template|SKILL.md
agent-prompt.md|references/agent-prompt.md
report-template.md|references/report-template.md
scope.md.template|references/scope.md'

# Those rel paths alone, one per line, in emit order.
_emit_rels() { printf '%s\n' "$EMIT_SET" | cut -d'|' -f2; }

# Write the set into $2. `raw` = byte copy of the template (baseline/`.template`), `subst` = scalars
# resolved (staging), `emit` = scalars resolved plus the per-file ✅ line (the live install).
write_emit_set() {
  _how="$1"; _dst="$2"
  mkdir -p "$_dst/references"
  while IFS='|' read -r _t _r; do
    [ -n "$_t" ] || continue
    case "$_how" in
      raw)   cp "$REFS/$_t" "$_dst/$_r" ;;
      subst) _subst "$REFS/$_t" "$_dst/$_r" ;;
      emit)  _subst "$REFS/$_t" "$_dst/$_r"; echo "✅ $_dst/$_r" ;;
    esac
  done <<EOF
$EMIT_SET
EOF
}

# RAW templates under $1 keyed by emitted path: raw-vs-raw keeps {LAST_UPDATED}/{PLUGIN_VERSION} out of the delta.
# INVARIANT: tokens, never baked versions (phantom DIFFERS) -> never in bump-version.sh STAMPED_FILES. `*` .gitignore hides dir.
copy_raw_templates() {
  _dst="$1"
  mkdir -p "$_dst/references"
  printf '*\n' > "$_dst/.gitignore"
  write_emit_set raw "$_dst"
  # `|| true`: a missing per-stack ref must not abort the run under `set -e`.
  for _s in $STACK_REFS; do
    { [ -f "$REFS/$_s" ] && cp "$REFS/$_s" "$_dst/references/$_s"; } || true
  done
}

# ── shared: per-stack reference of this install (emit decided it; bare-env upgrade reads it back) ──
# Catalog = references/*.md on disk minus agent-prompt/report-template (`*.template` never matches `*.md`).
_stack_catalog() {
  for _f in "$REFS"/*.md; do
    [ -f "$_f" ] || continue
    _b="$(basename "$_f")"
    case "$_b" in agent-prompt.md|report-template.md) continue ;; esac
    printf '%s\n' "$_b"
  done
}

# Recorded stack, read back from the emitted ref or its baseline copy: retroactive, pre-baseline installs too.
# Prints 0..N names; N>1 = multi-stack install, each needs the restamp.
_installed_stack_refs() {
  _stack_catalog | while IFS= read -r _b; do
    if [ -f "$TARGET_REFS/$_b" ] || [ -f "$BASELINE/references/$_b" ]; then printf '%s\n' "$_b"; fi
  done
}

# ── shared: "is something already installed here?" (emit refuses if non-empty, upgrade requires it) ──
# Any live artifact counts, SKILL.md.disabled included: keying on SKILL.md alone let emit re-default a partial install.
_live_artifacts() {
  for _rel in SKILL.md SKILL.md.disabled references/agent-prompt.md references/report-template.md references/scope.md; do
    if [ -f "$TARGET/$_rel" ]; then printf '%s\n' "$_rel"; fi
  done
  _stack_catalog | while IFS= read -r _b; do
    if [ -f "$TARGET_REFS/$_b" ]; then printf '%s\n' "references/$_b"; fi
  done
}

# The same set as one space-separated line, for messages and `[ -n ]` tests.
_live_artifact_list() { _live_artifacts | tr '\n' ' ' | sed 's/[[:space:]]*$//'; }

# ── shared: the ONE unresolved-placeholder scanner; every token check goes through here ──
# Strip shell `${UPPER_SNAKE}` first (contains `{UPPER_SNAKE}`; no BSD `grep -P` lookbehind); {2,} skips 1-char runtime tokens.
TOKEN_STRIP_SED='s/\${[A-Z_][A-Z_]*}//g'
TOKEN_RE='\{[A-Z_]{2,}\}'
# One BARE token per line — no guard character, so what `validate` prints is exactly what must be fixed.
# `|| true`: zero matches is the happy path and rc=1 would abort the caller's assignment (repo rule avoid#7).
_scan_tokens() { sed "$TOKEN_STRIP_SED" "$1" | grep -oE "$TOKEN_RE" || true; }

# ── shared: the ONE writer of .codex/agents/intent-guard.toml (emit + emit-agent) ────
# _ig_kind: ABSENT->CREATE | BROKEN (empty, or ours + unrunnable)->RECREATE after .bak-<ts> | CURRENT/FOREIGN->REUSE | LEGACY->MIGRATE.
_ig_kind() {
  [ -e "$IG_PATH" ] || { echo ABSENT; return 0; }
  [ -s "$IG_PATH" ] || { echo BROKEN; return 0; }
  # Provenance BEFORE runnability (BCOP09): unstamped = FOREIGN, never judged or rewritten by template rules.
  # Token test is stamp-independent, via _scan_tokens: `${HOME}` = shell != placeholder (misread RECREATES tailoring).
  if grep -qF "$IG_STAMP_PREFIX" "$IG_PATH"; then
    _kind=CURRENT
  elif grep -qE "$IG_LEGACY_STAMP_RE" "$IG_PATH"; then
    _kind=LEGACY
  else
    echo FOREIGN; return 0
  fi
  if ! grep -q '^name:[[:space:]]*intent-guard[[:space:]]*$' "$IG_PATH" \
     || [ -n "$(_scan_tokens "$IG_PATH")" ]; then
    echo BROKEN; return 0
  fi
  echo "$_kind"
}

# A hand-written agent that mentions `{TOKENS}` is a CONFLICT to report, never a file to overwrite:
# the tokens may be the project's own convention. Stderr only — stdout carries one status line.
_ig_foreign_conflict() {
  _tok="$(_scan_tokens "$IG_PATH" | sort -u || true)"
  [ -n "$_tok" ] || return 0
  echo "⚠️ $IG_PATH carries no stamp of ours and contains unresolved-looking token(s):" >&2
  printf '%s\n' "$_tok" >&2
  echo "   Treated as the project's own agent and REUSED byte-untouched. If these were meant to be template placeholders, delete the file by hand and re-run." >&2
}

# CURRENT-stamped but failing the metadata gate (pre-content_version generation): frontmatter restamp, body byte-kept.
_ig_restamp() {
  _igt="$(mktemp -d)"
  _subst_raw "$REFS/intent-guard.md.template" > "$_igt/tpl"
  _restamp_meta "$IG_PATH" "$_igt/tpl" >&2 || return 1
  rm -rf "$_igt"; _igt=""
  _check_meta_frontmatter "$IG_PATH" >&2 \
    || { echo "❌ restamp left $IG_PATH failing the metadata gate — fix its frontmatter by hand, then re-run" >&2; return 1; }
  echo "INTENT_GUARD: MIGRATED $IG_PATH"
}

# Restamp a LEGACY agent IN PLACE: frontmatter keys (D2 order) + tail anchor from the substituted template;
# body (every tailored line) copied through untouched: migration != re-emit.
_ig_migrate() {
  _bd="$(mktemp -d)"
  _subst_raw "$REFS/intent-guard.md.template" > "$_bd/tpl"
  # Frontmatter-only like `_restamp_meta`: a body `version:`/`last_updated:` (YAML fence) would become a duplicate key.
  _fm_block "$_bd/tpl" | grep -E '^(doc_type|version|content_version|generated_by|last_updated):' > "$_bd/meta" || true
  awk -v anchor="$IG_STAMP_PREFIX" 'f || index($0, anchor) { f = 1; print }' "$_bd/tpl" > "$_bd/tail"
  if [ ! -s "$_bd/meta" ] || [ ! -s "$_bd/tail" ]; then
    echo "❌ migration aborted: intent-guard.md.template carries no metadata frontmatter or no tail anchor" >&2
    return 1
  fi

  # 1. frontmatter: drop any pre-existing copy of the five keys, re-insert them before the closing `---`.
  awk -v metaf="$_bd/meta" '
    NR == 1 && $0 == "---" { fm = 1; print; next }
    fm == 1 && $0 == "---" {
      while ((getline l < metaf) > 0) print l
      close(metaf); fm = 2; print; next
    }
    fm == 1 && /^(doc_type|version|content_version|generated_by|last_updated):[[:space:]]/ { next }
    { print }
  ' "$IG_PATH" > "$_bd/agent.md"

  # 2. tail: delete the retired stamp comment (open line .. its `-->`), append the current anchor block.
  awk '
    /<!--[[:space:]]*intent-guard template v[0-9]/ { drop = 1 }
    drop { if (/-->/) drop = 0; next }
    { print }
  ' "$_bd/agent.md" > "$_bd/agent.next"
  printf '\n' >> "$_bd/agent.next"
  cat "$_bd/tail" >> "$_bd/agent.next"
  cat -s "$_bd/agent.next" > "$_bd/agent.md"

  # POST-CONDITIONS. Both edits are pattern-driven; a silent miss would ship a half-migrated agent that
  # still reads as legacy to `setup-status`.
  for _k in doc_type version content_version generated_by last_updated; do
    grep -q "^${_k}:" "$_bd/agent.md" || { echo "❌ migration aborted: $_k missing after restamp" >&2; return 1; }
  done
  grep -qF "$IG_STAMP_PREFIX" "$_bd/agent.md" || { echo "❌ migration aborted: current tail anchor not written" >&2; return 1; }
  grep -qE "$IG_LEGACY_STAMP_RE" "$_bd/agent.md" && { echo "❌ migration aborted: retired stamp survived" >&2; return 1; }
  grep -q '^name:[[:space:]]*intent-guard[[:space:]]*$' "$_bd/agent.md" || { echo "❌ migration aborted: frontmatter name lost" >&2; return 1; }

  mv "$_bd/agent.md" "$IG_PATH"
  rm -rf "$_bd"; _bd=""
  echo "INTENT_GUARD: MIGRATED $IG_PATH"
}

write_intent_guard() {
  if [ ! -f "$REFS/intent-guard.md.template" ]; then
    echo "❌ Emit template not found: $REFS/intent-guard.md.template"
    return 1
  fi
  resolve_scalars
  mkdir -p .codex/agents

  case "$(_ig_kind)" in
    CURRENT)
      if _check_meta_frontmatter "$IG_PATH" >/dev/null; then
        echo "INTENT_GUARD: REUSE $IG_PATH"
        return 0
      fi
      echo "ℹ️ $IG_PATH is ours but its frontmatter fails the metadata gate (earlier generation) — restamping metadata in place, body preserved" >&2
      _ig_restamp || return 1
      return 0
      ;;
    FOREIGN)
      _ig_foreign_conflict
      echo "INTENT_GUARD: REUSE $IG_PATH"
      return 0
      ;;
    LEGACY)
      # Ours, pre-standard. Restamp instead of recreating: the body is the project's own tailoring.
      echo "ℹ️ $IG_PATH carries the retired 'intent-guard template vN' stamp — restamping metadata in place, body preserved" >&2
      _ig_migrate
      return 0
      ;;
    BROKEN)
      # Only ours-stamped or empty (see _ig_kind); a nonempty file is copied to <path>.bak-<ts> first.
      # Diagnostics -> stderr: stdout carries exactly one `INTENT_GUARD:` line.
      if [ -s "$IG_PATH" ]; then
        _ig_bak="$IG_PATH.bak-$(date +%Y%m%d-%H%M%S)"
        cp "$IG_PATH" "$_ig_bak"
        echo "ℹ️ backed up $IG_PATH -> $_ig_bak before recreating" >&2
      fi
      echo "⚠️ $IG_PATH is ours (carries our stamp) but empty, without 'name: intent-guard' frontmatter, or still holding unresolved {PLACEHOLDER} tokens — recreating from template" >&2
      ;;
  esac

  # Runnable straight out of emit (spawned at BOTH depths): BLOCKs get generic defaults + SEEDED-DEFAULT marker;
  # Phase 3 replaces block + marker, a surviving marker makes skipped adaptation visible to `validate`.
  _bd="$(mktemp -d)"
  cat > "$_bd/evidence" <<IG_EVIDENCE
\`\`\`bash
git diff --stat HEAD~1..HEAD          # size of what was delivered
git log --oneline -10                 # what the commits claim
git status --porcelain                # uncommitted spill
git diff --name-only --diff-filter=A  # files ADDED (file explosion, unrequested artifacts)
git diff -- '*package.json' '*requirements*.txt' '*pom.xml' '*build.gradle*' '*go.mod' '*Cargo.toml'
\`\`\`
${IG_SEED_MARK} evidence-commands - generic floor, replace with this repo's real commands -->
IG_EVIDENCE
  cat > "$_bd/invariants" <<IG_INVARIANTS
| Invariant | Value | Drift it makes checkable |
|---|---|---|
| Planned scale | not recorded — read it out of the request before flagging | \`intent#scale\` |
| Testing policy | the project's own convention (rules / AGENTS.md) wins over any default | \`intent#tests\` |
| Dependency policy | a new runtime dependency needs an explicit request or a recorded decision | \`intent#deps\` |
| File-layout policy | follow the existing tree; a new top-level dir needs a stated reason | \`intent#files\`, \`intent#naming\` |
| Architecture stance | keep the pattern already in the repo unless the request replaces it | \`intent#arch\`, \`intent#indirection\` |

> These are the generic floor. Re-read the project's \`AGENTS.md\`, rules and conventions each run and treat
> the concrete values found there as the real invariants.
${IG_SEED_MARK} project-invariants - generic floor, replace with facts read from this repo -->
IG_INVARIANTS
  cat > "$_bd/examples" <<IG_EXAMPLES
| Asked | Delivered | Class |
|---|---|---|
| "fix this one function" | the function fixed plus a refactor of its two callers | \`intent#scope\` |
| "add a small helper" | a new package with an interface, a factory and an impl | \`intent#indirection\` |
| "one script" | a directory of scripts plus a README nobody asked for | \`intent#files\`, \`intent#artifacts\` |
| "do A and B" | A done, B silently dropped, report says done | \`intent#skip\` |

> Replace these with real instances from this repo's own history — the closer the wording, the higher the hit rate.
${IG_SEED_MARK} drift-examples - generic floor, replace with real instances from this repo -->
IG_EXAMPLES

  # The template header comment carries generator instructions; it MUST NOT ship in the emitted agent.
  _subst_raw "$REFS/intent-guard.md.template" \
    | sed '/^<!-- TEMPLATE HEADER/,/-->[[:space:]]*$/d' \
    | cat -s > "$_bd/agent.md"

  # POST-STRIP POST-CONDITION: a runaway sed range deletes to EOF yet passes validate;
  # both anchors sit OUTSIDE the header, so losing either proves the runaway.
  if ! grep -q '^name:[[:space:]]*intent-guard[[:space:]]*$' "$_bd/agent.md"; then
    echo "❌ emit aborted: header strip removed the frontmatter of intent-guard.md.template"
    return 1
  fi
  if ! grep -qF "$IG_STAMP_PREFIX" "$_bd/agent.md"; then
    echo "❌ emit aborted: header strip removed the template stamp (tail anchor) of intent-guard.md.template"
    return 1
  fi

  for _pair in "{EVIDENCE_COMMANDS_BASH}:evidence" "{PROJECT_INVARIANTS_TABLE}:invariants" "{DRIFT_EXAMPLES_TABLE}:examples"; do
    _tok="${_pair%%:*}"; _file="$_bd/${_pair##*:}"
    awk -v tok="$_tok" -v cf="$_file" '
      $0 == tok { while ((getline line < cf) > 0) print line; close(cf); next }
      { print }
    ' "$_bd/agent.md" > "$_bd/agent.next" && mv "$_bd/agent.next" "$_bd/agent.md"
  done

  mv "$_bd/agent.md" "$IG_PATH"
  rm -rf "$_bd"; _bd=""
  echo "INTENT_GUARD: CREATED $IG_PATH"
}

# ── emit: sweep per-stack refs of an EARLIER emit (a stack switch left both installed) ──
# Owned = QUOTED `generated_by:` key inside LEADING `---` frontmatter, never a body mention; $TARGET_REFS only; redirect, no pipe (pipefail/SIGPIPE).
_ref_is_owned() {
  _fm=0
  while IFS= read -r _fl || [ -n "$_fl" ]; do
    _fm=$((_fm + 1))
    if [ "$_fm" = 1 ]; then
      [ "$_fl" = "---" ] || return 1
      continue
    fi
    case "$_fl" in
      "---") return 1 ;;
      "generated_by: \"$GENERATED_BY\""|"generated_by: \"$GENERATED_BY\" "*) return 0 ;;
    esac
    [ "$_fm" -lt 20 ] || return 1
  done < "$1"
  return 1
}

_sweep_stale_refs() {
  [ -d "$TARGET_REFS" ] || return 0
  _keep="$STACK_REF"
  for _r in $(_emit_rels); do
    case "$_r" in references/*) _keep="$_keep ${_r#references/}" ;; esac
  done
  for _sf in "$TARGET_REFS"/*; do
    [ -f "$_sf" ] || continue
    _sb="$(basename "$_sf")"
    case " $_keep " in *" $_sb "*) continue ;; esac
    if _ref_is_owned "$_sf"; then
      rm -f "$_sf"
      echo "🔄 removed stale per-stack reference from an earlier emit: $_sf"
    fi
  done
}

# ── emit-agent: intent-guard ONLY (no superreview skill involved) ───────────────
emit_agent_only() {
  write_intent_guard
}

# ── emit: copy + scalar-substitute templates into the target ────────────────────
emit_skill() {
  echo "=== superreview: emit ==="
  validate_templates

  # Live install (whole artifact set, != SKILL.md alone) is never overwritten: it SELF-SYNCS (Phase 4b), a partial
  # one would be re-defaulted. `upgrade` refreshes; SUPERREVIEW_FORCE=1 = conscious destructive override.
  _installed="$(_live_artifact_list)"
  if [ -n "$_installed" ] && [ "${SUPERREVIEW_FORCE:-0}" != "1" ]; then
    echo "❌ superreview is already installed at $TARGET/ — live artifact(s): $_installed"
    echo "   It SELF-SYNCS (Phase 4b) — overwriting it destroys those in-place corrections, and re-emitting"
    echo "   re-substitutes EVERY file with DEFAULT scalars (this project / the project stack / python.md)."
    echo "   Use 'generate.sh upgrade' (live files preserved; a MISSING one is restored RAW), or SUPERREVIEW_FORCE=1"
    echo "   to overwrite and LOSE them."
    exit 1
  fi

  resolve_scalars

  mkdir -p "$TARGET_REFS"

  write_emit_set emit "$TARGET"

  if [ -f "$REFS/$STACK_REF" ]; then
    _subst "$REFS/$STACK_REF" "$TARGET_REFS/$STACK_REF"
    echo "✅ $TARGET_REFS/$STACK_REF"
  else
    echo "⚠️ stack reference not found: $REFS/$STACK_REF (emitted without per-stack doc)"
  fi

  _sweep_stale_refs

  # Pristine template copies — the ONLY thing that lets a later `upgrade` separate a real template change from
  # the Phase 3 tailoring these emitted files are about to receive.
  rm -rf "$BASELINE"
  copy_raw_templates "$BASELINE"
  echo "✅ $BASELINE (pristine templates for 'upgrade'; git-ignored)"

  # intent-guard — the anti-drift agent the emitted skill spawns at BOTH depths.
  # Written by the SHARED writer above (the same one `emit-agent` calls): one implementation, one status line.
  write_intent_guard

  echo ""
  echo "Next: AI fills BLOCK placeholders via Edit (SKILL.md Phase 3) in the emitted SKILL.md, and REPLACES the"
  echo "      SEEDED-DEFAULT blocks in $IG_PATH when this run CREATED it (skip on REUSE)"
  echo "      — then run: generate.sh validate"
}

# ── shared: in-place metadata restamp ──────────────────────────────────────────
# First frontmatter block -> stdout; one reader everywhere (`references/scope.md` has a second `---` in its body).
_fm_block() { awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f { print }' "$1"; }
# Everything AFTER that block -> stdout. Used as the did-not-touch-the-body proof.
_fm_body()  { awk 'NR == 1 && $0 == "---" { f = 1; next } f == 1 && $0 == "---" { f = 2; next } f == 2 { print }' "$1"; }

# Restamp $1 (live) from $2 (staging): version/content_version/generated_by/last_updated only; doc_type kept (§1), else `llm`.
# Body copied through, compared byte-for-byte; a mismatch aborts (Phase 3 / 4b edits never mangled).
_restamp_meta() {
  _live="$1"; _src="$2"
  if [ "$(head -1 "$_live")" != "---" ]; then
    echo "⚠️ RESTAMP: $_live has no frontmatter block — left untouched" >&2
    return 0
  fi
  _bd="$(mktemp -d)"
  _fm_block "$_src" | grep -E '^(version|content_version|generated_by|last_updated):[[:space:]]' > "$_bd/meta" || true
  if [ "$(grep -c . "$_bd/meta" || true)" -ne 4 ]; then
    echo "❌ restamp aborted: $_src frontmatter carries no version/content_version/generated_by/last_updated quartet" >&2
    return 1
  fi
  # Materialise the live frontmatter once: a `grep -q` / `head -1` on a live pipe can SIGPIPE the awk
  # upstream, and under `pipefail` that reads as a failure (repo rule avoid#7).
  _fm_block "$_live" > "$_bd/live.fm"
  _was=$(sed -n 's/^version:[[:space:]]*//p' "$_bd/live.fm" | sed -n 1p || true)
  _needdt=0
  grep -q '^doc_type:' "$_bd/live.fm" || _needdt=1

  awk -v metaf="$_bd/meta" -v needdt="$_needdt" '
    NR == 1 && $0 == "---" { fm = 1; print; next }
    fm == 1 && $0 == "---" {
      if (needdt == 1) print "doc_type: llm"
      while ((getline l < metaf) > 0) print l
      close(metaf); fm = 2; print; next
    }
    fm == 1 && /^(version|content_version|generated_by|last_updated):[[:space:]]/ { next }
    { print }
  ' "$_live" > "$_bd/next"

  # POST-CONDITIONS. The body must be identical, and the result must satisfy the same frontmatter gate
  # `validate` applies — one dialect, checked here so a bad restamp never reaches the user's tree.
  _fm_body "$_live" > "$_bd/body.old"; _fm_body "$_bd/next" > "$_bd/body.new"
  cmp -s "$_bd/body.old" "$_bd/body.new" \
    || { echo "❌ restamp aborted: $_live body changed — nothing written" >&2; return 1; }
  _check_meta_frontmatter "$_bd/next" \
    || { echo "❌ restamp aborted: $_live would fail the metadata gate — nothing written" >&2; return 1; }

  mv "$_bd/next" "$_live"
  rm -rf "$_bd"; _bd=""
  echo "RESTAMP: $_live version ${_was:-(none)} -> \"$PLUGIN_VERSION\", content_version -> \"$CONTENT_VERSION\", generated_by/last_updated refreshed (body untouched)"
}

# ── upgrade: refresh a LIVE installation, hand-edits preserved ──────────────────
# Delta = NEW template vs pristine .template-baseline/ (never live: tailoring != change); only a MISSING asset is restored, RAW.
upgrade_skill() {
  echo "=== superreview: upgrade ==="
  validate_templates

  # Gate = any live artifact, != SKILL.md: missing SKILL.md + tailored refs is exactly this mode's case (restored RAW below).
  _installed="$(_live_artifact_list)"
  if [ -z "$_installed" ]; then
    echo "❌ nothing to upgrade: no superreview artifact under $TARGET/ — run 'generate.sh emit' first"
    exit 1
  fi
  if [ ! -f "$TARGET/SKILL.md" ]; then
    if [ -f "$DISABLED_MARK" ]; then
      # Parked, not damaged. Restoring a RAW SKILL.md here would resurrect the skill behind the user's back and
      # leave two copies of it, so the remedy is the reversible one that already exists.
      echo "❌ superreview is DISABLED: $DISABLED_MARK is parked in place of $TARGET/SKILL.md"
      echo "   Run 'generate.sh enable' first, then upgrade."
      exit 1
    fi
    echo "ℹ️ $TARGET/SKILL.md is MISSING from an otherwise live install — it is restored RAW below (NEEDS PHASE 3);"
    echo "   every other artifact keeps its tailoring untouched."
  fi

  # STACK re-derived from the installed tree BEFORE scalars resolve: a python.md default leaves the real ref unstaged,
  # unrestamped and `stale` forever. Explicit STACK_REF env still wins.
  if [ -n "${STACK_REF:-}" ]; then
    STACK_REFS="$STACK_REF"
    echo "UPGRADE_STACK=$STACK_REFS (STACK_REF override)"
  else
    STACK_REFS="$(_installed_stack_refs | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    if [ -n "$STACK_REFS" ]; then
      # >1 = multi-stack install: all of them are live artifacts, all of them get restamped. The scalar keeps the
      # first, which is only ever substituted into TEXT (`references/{STACK_REF}` prose).
      STACK_REF="${STACK_REFS%% *}"
      echo "UPGRADE_STACK=$STACK_REFS (derived from the installed tree)"
    else
      # Undeterminable (no stack doc, or deleted by hand): guess nothing, stage nothing per-stack,
      # but never abort: the other four artifacts still need their restamp.
      STACK_REF="none"
      echo "UPGRADE_STACK=none — ❌ NO per-stack reference found in $TARGET_REFS/ or $BASELINE/references/"
      echo "   (candidates: $(_stack_catalog | tr '\n' ' ' | sed 's/[[:space:]]*$//')). No stack doc is staged or restamped; the other four"
      echo "   artifacts are. Re-run as: STACK_REF=<name>.md generate.sh upgrade — it is then restored RAW."
    fi
  fi

  resolve_scalars
  rm -rf "$STAGING"
  mkdir -p "$STAGING/references"
  printf '*\n' > "$STAGING/.gitignore"   # never `git add -A` noise in the user's repo

  write_emit_set subst "$STAGING"
  # `|| true`: a missing per-stack ref must not abort the run under `set -e`.
  for _s in $STACK_REFS; do
    { [ -f "$REFS/$_s" ] && _subst "$REFS/$_s" "$STAGING/references/$_s"; } || true
  done
  # Raw NEW templates, in the same shape as the baseline — this pair is what the delta is computed from.
  copy_raw_templates "$STAGING/.template"

  echo "UPGRADE_STAGING=$STAGING"
  echo "UPGRADE_BASELINE=$BASELINE"
  # The live artifact set: the stack-independent emit set plus every per-stack reference this install carries.
  _rels="$(_emit_rels | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  for _s in $STACK_REFS; do _rels="$_rels references/$_s"; done

  _restored=0
  for _rel in $_rels; do
    [ -f "$STAGING/$_rel" ] || continue
    if [ ! -f "$TARGET/$_rel" ]; then
      # RAW from `.template/`, never staging: bare-env defaults would silently re-guess install-time scalars.
      # RAW leaves named {TOKEN}s for `validate` = NEEDS PHASE 3 contract; the restamp loop refreshes metadata.
      cp "$STAGING/.template/$_rel" "$TARGET/$_rel"
      _restored=$((_restored+1))
      echo "UPGRADE: $_rel MISSING -> restored RAW (NEEDS PHASE 3: scalar AND block placeholders)"
    elif [ -f "$BASELINE/$_rel" ]; then
      if cmp -s "$BASELINE/$_rel" "$STAGING/.template/$_rel"; then
        echo "UPGRADE: $_rel IDENTICAL (template unchanged since install — live file untouched)"
      else
        # `|| true`: diff exits 1 on a difference and grep exits 1 on zero matches; under pipefail either
        # would abort the assignment (repo rule avoid#7).
        _d=$(diff "$BASELINE/$_rel" "$STAGING/.template/$_rel" | grep -c '^[<>]' || true)
        echo "UPGRADE: $_rel DIFFERS ($_d template line(s)) — port into the LIVE file; see: diff \"$BASELINE/$_rel\" \"$STAGING/.template/$_rel\""
      fi
    else
      _d=$(diff "$TARGET/$_rel" "$STAGING/$_rel" | grep -c '^[<>]' || true)
      echo "UPGRADE: $_rel NO BASELINE - full diff, tailoring included ($_d line(s)) — install predates .template-baseline/; the count is NOT a template delta, review it by hand against $STAGING/$_rel"
    fi
  done

  # Restamp is UNCONDITIONAL (!=gated on IDENTICAL/DIFFERS): a version bump reports IDENTICAL, yet SKILL.md `version:`
  # is what setup-status reads for `stale`. Same `$_rels` set as the delta report, real per-stack ref included.
  for _rel in $_rels; do
    [ -f "$TARGET/$_rel" ] || continue
    [ -f "$STAGING/$_rel" ] || continue
    _restamp_meta "$TARGET/$_rel" "$STAGING/$_rel" || exit 1
  done

  # Same writer as emit: a current or hand-written intent-guard.toml is REUSED byte-untouched, and a
  # pre-standard one of ours is MIGRATED here — this is the `upgrade restamps it` path setup-status promises.
  write_intent_guard

  echo ""
  echo "No live file was overwritten. Apply the template delta with targeted Edit calls (SKILL.md Phase 2b),"
  echo "keeping every self-synced correction."
  [ "$_restored" -gt 0 ] && echo "$_restored restored file(s) are RAW templates — run Phase 3 on them BEFORE validate."
  echo "Then promote the new templates to the baseline and clean up:"
  echo "  rm -rf \"$BASELINE\" && mv \"$STAGING/.template\" \"$BASELINE\" && rm -rf \"$STAGING\" && generate.sh validate"
}

# Metadata frontmatter gate: 5 keys, D2 order, quoted like brewcode/skills/rules/scripts/rules.sh; one line per defect, rc 1.
_check_meta_frontmatter() {
  _f="$1"; _bad=0
  _fm=$(awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f { print }' "$_f")
  for _k in doc_type version content_version generated_by last_updated; do
    printf '%s\n' "$_fm" | grep -q "^${_k}:" || { echo "❌ $_f frontmatter missing metadata key: $_k"; _bad=1; }
  done
  printf '%s\n' "$_fm" | grep -q '^doc_type: llm$' \
    || { echo "❌ $_f doc_type must be exactly 'llm', UNQUOTED"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^version: "[0-9]+\.[0-9]+\.[0-9]+(\+[0-9A-Za-z.-]+)?"$' \
    || { echo "❌ $_f version must be a QUOTED X.Y.Z"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^content_version: "[0-9]+\.[0-9]+\.[0-9]+"$' \
    || { echo "❌ $_f content_version must be a QUOTED X.Y.Z"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^generated_by: "[^"]+"$' \
    || { echo "❌ $_f generated_by must be a QUOTED <plugin>:<skill>"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^last_updated: "[0-9]{4}-[0-9]{2}-[0-9]{2}"$' \
    || { echo "❌ $_f last_updated must be a QUOTED YYYY-MM-DD"; _bad=1; }
  _order=$(printf '%s\n' "$_fm" | grep -oE '^(doc_type|version|content_version|generated_by|last_updated)' | tr '\n' ' ' || true)
  [ "$_order" = "doc_type version content_version generated_by last_updated " ] \
    || { echo "❌ $_f metadata keys out of order [$_order] — must be doc_type, version, content_version, generated_by, last_updated"; _bad=1; }
  return "$_bad"
}

# ── validate: no setup-time {PLACEHOLDER} may remain ────────────────────────────
validate_emit() {
  echo "=== superreview: validate ==="

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ emitted skill missing: $TARGET/SKILL.md — run 'generate.sh emit' first"
    exit 1
  fi

  # Runtime tokens resolved at REVIEW time; `_scan_tokens` handles `${VAR}`. MAIN/ROOT/TOK/REPORT_DIR = harmless no-ops:
  # never add a name to silence a shell variable, that workaround hid the collision.
  _runtime='MODE|DEPTH|BRANCH|SCOPE|FILES|COUNT|TIMESTAMP|FOCUS|FILE_LIST|AGENT_LIST|CANDIDATES|MERGED|PATHSPEC|MAIN|SHA|FOLDER|GROUP|AGENT|N|OC|SC|K|U|D|ROOT|TOK|RANGE|REPORT_DIR|SCOPE_BASELINE|OWNERSHIP|GATE_RESULTS|PR_ISSUE_JSON|INTENT_VERDICT|USER_REQUEST'

  _errors=0
  # Every emitted reference, not a fixed list: the per-stack ref is substituted too, so an unresolved
  # metadata token in it must fail the gate like any other.
  for f in "$TARGET/SKILL.md" "$TARGET_REFS"/*.md; do
    [ -f "$f" ] || continue
    _unresolved=$(_scan_tokens "$f" | sort -u | grep -vE "^\{(${_runtime})\}$" || true)
    if [ -n "$_unresolved" ]; then
      echo "❌ unresolved setup-time placeholders in $f:"
      echo "$_unresolved"
      _errors=$((_errors+1))
    fi
  done

  # Agent-reference allowlist: every agent named in the emitted SKILL.md must be a
  # project-local agent (.codex/agents/**/*.toml, nested included) or a real built-in (Explore|Plan|general-purpose).
  _builtins="Explore Plan general-purpose"
  _local_agents=""
  while IFS= read -r _af; do
    [ -f "$_af" ] || continue
    _an="$(basename "$_af" .toml)"
    _local_agents="$_local_agents $_an"
  done <<EOF
$(find -H .codex/agents -name '*.toml' 2>/dev/null | sort || true)
EOF

  # (a) explicit task_role="NAME" / task_role=NAME references
  _referenced=$(grep -oE 'task_role=("?)[A-Za-z0-9_-]+' "$TARGET/SKILL.md" \
    | sed -E 's/^task_role=("?)//' | sort -u || true)
  if [ -n "$_referenced" ]; then
    while IFS= read -r _name; do
      [ -n "$_name" ] || continue
      case " $_builtins $_local_agents " in
        *" $_name "*) : ;;
        *)
          echo "❌ unknown agent referenced in SKILL.md: $_name (not in target .codex/agents/ nor built-in Explore|Plan|general-purpose)"
          _errors=$((_errors+1))
          ;;
      esac
    done <<EOF
$_referenced
EOF
  fi

  # (b) guard the known leak: bare reviewer/architect used as a built-in/fallback agent.
  for _bare in reviewer architect; do
    case " $_local_agents " in
      *" $_bare "*) continue ;;  # legitimately exists in target -> allowed
    esac
    _leak=$(grep -nE "(built-in[^A-Za-z]+\`?${_bare}\`?|fallback[^A-Za-z]+\`?${_bare}\`?|on \`${_bare}\`)" "$TARGET/SKILL.md" || true)
    if [ -n "$_leak" ]; then
      echo "❌ bare \`${_bare}\` used as a built-in/fallback agent in SKILL.md (not in target .codex/agents/ nor built-in Explore|Plan|general-purpose):"
      echo "$_leak"
      _errors=$((_errors+1))
    fi
  done

  # (c) required emitted assets — a missing one silently guts a phase of the emitted skill.
  # .codex/agents/intent-guard.toml is EXECUTED by the emitted skill at BOTH depths: without it, QUICK is empty.
  for _req in "$TARGET_REFS/agent-prompt.md" "$TARGET_REFS/report-template.md" "$TARGET_REFS/scope.md"; do
    if [ ! -f "$_req" ]; then
      echo "❌ missing emitted asset: $_req"
      _errors=$((_errors+1))
    fi
  done
  # intent-guard is EXECUTED at both depths: an empty or frontmatter-less file is as broken as a missing one,
  # and a LEGACY one is a live agent whose restamp never ran — both are failures with a one-command fix.
  _ig_state="$(_ig_kind)"
  case "$_ig_state" in
    BROKEN)
      echo "❌ unusable emitted asset: $IG_PATH (empty, or ours with no 'name: intent-guard' frontmatter / unresolved {PLACEHOLDER} tokens) — re-run 'generate.sh emit-agent'"
      _errors=$((_errors+1))
      ;;
    LEGACY)
      echo "❌ pre-standard emitted asset: $IG_PATH still carries the retired 'intent-guard template vN' stamp and none of the four metadata keys — run 'generate.sh emit-agent' (or 'upgrade') to restamp it; the tailored body is preserved"
      _errors=$((_errors+1))
      ;;
    ABSENT)
      echo "❌ missing emitted asset: $IG_PATH"
      _errors=$((_errors+1))
      ;;
  esac

  # (c2) TEMPLATE-DERIVED agents only: every {PLACEHOLDER} must be resolved (emit scalars, Phase 3 BLOCKs);
  # a REUSED hand-written intent-guard is byte-untouchable, never judged by template rules.
  if [ "$_ig_state" = "CURRENT" ]; then
    _ig_unresolved=$(_scan_tokens "$IG_PATH" | sort -u || true)
    if [ -n "$_ig_unresolved" ]; then
      echo "❌ unresolved placeholders in $IG_PATH (no token is runtime here):"
      echo "$_ig_unresolved"
      _errors=$((_errors+1))
    fi
    if grep -q '^<!-- TEMPLATE HEADER' "$IG_PATH"; then
      echo "❌ $IG_PATH still carries the TEMPLATE HEADER comment — emit must strip it"
      _errors=$((_errors+1))
    fi
    _check_meta_frontmatter "$IG_PATH" \
      || { _errors=$((_errors+1)); echo "   Fix: 'generate.sh upgrade' (or 'emit-agent') restamps its metadata in place; the body is preserved"; }
    # (c3) TAILORING: seeded BLOCK defaults = runnable floor, not target -> WARN, not fail
    # (`emit-agent` is a standalone path whose adaptation happens in the caller's flow).
    _ig_seeded=$(grep -cF "$IG_SEED_MARK" "$IG_PATH" || true)
    if [ "${_ig_seeded:-0}" -gt 0 ]; then
      echo "⚠️ UNTAILORED: $IG_PATH still carries $_ig_seeded seeded generic BLOCK default(s)"
      grep -nF "$IG_SEED_MARK" "$IG_PATH" || true
      echo "   INTENT_GUARD: UNTAILORED $IG_PATH ($_ig_seeded seeded block(s)) — run SKILL.md Phase 3 and replace each block + its marker"
    fi
    # (c4) RETURN CONTRACT `## 5. Output`: upgrade REUSEs a pre-rule CURRENT install byte-untouched,
    # so the clause arrives only by hand -> WARN with the source line, never fail.
    if ! grep -qF 'Verdict first, <=30 lines' "$IG_PATH"; then
      echo "⚠️ $IG_PATH has no return-length rule in '## 5. Output' (agent predates it)."
      echo "   Fix: copy the three paragraphs after the cap line of references/intent-guard.md.template into"
      echo "   the live '## 5. Output' section — the body is byte-untouchable, so no script writes it for you"
    fi
  elif [ "$_ig_state" = "FOREIGN" ]; then
    echo "ℹ️ $IG_PATH carries no template stamp of any generation — treated as the project's own hand-written agent, not checked against the template"
    # Tokens in a foreign file are a CONFLICT to surface, never an error: it is not ours to judge.
    _ig_foreign_tokens=$(_scan_tokens "$IG_PATH" | sort -u || true)
    if [ -n "$_ig_foreign_tokens" ]; then
      echo "⚠️ CONFLICT: it also contains token(s) that look unresolved — reported, never rewritten:"
      echo "$_ig_foreign_tokens"
    fi
  fi

  # (d) DOMAIN EXPERTS (intent-guard excluded; SUPERREVIEW_ALLOW_NO_EXPERTS=1 overrides). Routing != mention: a whole
  # table CELL (backticks/emphasis stripped, comma lists split) or `task_role=NAME`, matched exact-line (`grep -xF`).
  _wired=$( { awk -F'|' '
      /^[[:space:]]*\|/ {
        for (i = 1; i <= NF; i++) {
          n = split($i, parts, ",")
          for (j = 1; j <= n; j++) {
            c = parts[j]
            gsub(/[`*[:space:]]/, "", c)
            if (c != "") print c
          }
        }
      }' "$TARGET/SKILL.md"
    grep -oE 'task_role=("?)[A-Za-z0-9_-]+' "$TARGET/SKILL.md" | sed -E 's/^task_role=("?)//'
  } | sort -u || true)
  _experts=0
  for _name in $_local_agents; do
    [ "$_name" = "intent-guard" ] && continue
    printf '%s\n' "$_wired" | grep -qxF "$_name" && _experts=$((_experts+1))
  done
  if [ "$_experts" -eq 0 ]; then
    if [ "${SUPERREVIEW_ALLOW_NO_EXPERTS:-0}" = "1" ]; then
      echo "⚠️ no project domain expert wired (allowed by SUPERREVIEW_ALLOW_NO_EXPERTS=1) — the emitted review is DEGRADED"
    else
      echo "❌ no project domain expert (.codex/agents/**/*.toml) is wired into SKILL.md — create the missing experts"
      echo "   (see SKILL.md Phase 1.6) or re-run with SUPERREVIEW_ALLOW_NO_EXPERTS=1 to accept a degraded review"
      _errors=$((_errors+1))
    fi
  else
    echo "✅ domain experts wired: $_experts"
  fi

  # Leftover upgrade staging: a stale second copy of the skill. Warning only — it changes no behaviour, and its
  # own .gitignore keeps it out of the user's commits.
  [ -d "$STAGING" ] && echo "⚠️ leftover upgrade staging at $STAGING — once the delta is applied: rm -rf \"$BASELINE\" && mv \"$STAGING/.template\" \"$BASELINE\" && rm -rf \"$STAGING\"" || true
  # No baseline = every future `upgrade` falls back to a live-vs-template diff that cannot separate tailoring
  # from a template change. Warning only: an install emitted before baselines existed is still valid.
  [ -d "$BASELINE" ] || echo "⚠️ no $BASELINE — 'upgrade' will report NO BASELINE (full diff, tailoring included). Re-emit or promote a staged .template to fix it"

  if [ "$_errors" -eq 0 ]; then
    echo "✅ no unresolved setup-time placeholders"
  fi
  exit "$_errors"
}

# --- enable / disable: park <dir>/SKILL.md as SKILL.md.disabled; references/, .template-baseline/, tailoring stay ---
# intent-guard is NEVER parked: shared with $brewcode:teams-setup. ($DISABLED_MARK is defined next to $TARGET.)

toggle_skill() {
  _want="$1"   # enable | disable
  if [ "$_want" = "disable" ]; then _from="$TARGET/SKILL.md"; _to="$DISABLED_MARK"
  else _from="$DISABLED_MARK"; _to="$TARGET/SKILL.md"; fi

  echo "=== superreview: $_want ==="
  if [ ! -d "$TARGET" ]; then
    echo "❌ not installed: $TARGET does not exist — run 'generate.sh emit' first"
    exit 1
  fi
  if [ -f "$_to" ] && [ ! -f "$_from" ]; then
    echo "✅ already ${_want}d — $_to is in place, nothing to move"
    exit 0
  fi
  if [ ! -f "$_from" ]; then
    echo "❌ broken installation: neither $TARGET/SKILL.md nor $DISABLED_MARK exists"
    exit 1
  fi
  mv "$_from" "$_to"
  echo "MOVED: $_from -> $_to"
  echo "KEPT:  $TARGET_REFS/ $BASELINE/ $IG_PATH"
  echo "✅ $_want (a running session picks it up without a restart; bare mode: new session)"
}

# --- uninstall / purge: machinery/data split: uninstall removes the skill dir, purge also the review reports ---
# intent-guard survives BOTH: shared with $brewcode:teams-setup (same split as $brewtools:task-board-setup).
REPORT_GLOB=".codex/reports"

remove_skill() {
  _purge="$1"   # 0 = uninstall, 1 = purge
  _label=$([ "$_purge" = "1" ] && echo purge || echo uninstall)
  echo "=== superreview: $_label ==="

  _found=0
  if [ -d "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "REMOVED: $TARGET/ (SKILL.md, references/, .template-baseline/, any staging)"
    _found=1
  else
    echo "SKIP: $TARGET/ absent"
  fi

  if [ "$_purge" = "1" ]; then
    _reports=$({ find "$REPORT_GLOB" -maxdepth 1 -type d -name '*_superreview' 2>/dev/null || true; } | sort)
    if [ -n "$_reports" ]; then
      printf '%s\n' "$_reports" | while IFS= read -r _d; do
        [ -n "$_d" ] || continue
        rm -rf "$_d"
        echo "REMOVED: $_d/"
      done
      _found=1
    else
      echo "SKIP: no .codex/reports/*_superreview/ to remove"
    fi
  else
    _rc=$({ find "$REPORT_GLOB" -maxdepth 1 -type d -name '*_superreview' 2>/dev/null || true; } | wc -l | tr -d ' ')
    echo "KEPT:    $_rc review report dir(s) under $REPORT_GLOB/ — 'purge' deletes those too"
  fi

  if [ -f "$IG_PATH" ]; then
    echo "KEPT:    $IG_PATH — shared with \$brewcode:teams-setup, never deleted by either skill"
  fi

  [ "$_found" = "1" ] || { echo "⚠️ nothing to $_label — superreview was not installed here"; exit 0; }
  echo "✅ $_label"
}

case "$MODE" in
  scan) scan_target ;;
  emit) emit_skill ;;
  emit-agent) emit_agent_only ;;
  upgrade) upgrade_skill ;;
  enable) toggle_skill enable ;;
  disable) toggle_skill disable ;;
  uninstall) remove_skill 0 ;;
  purge) remove_skill 1 ;;
  validate) validate_emit ;;
  *)
    echo "Usage: generate.sh <scan|emit|emit-agent|upgrade|enable|disable|uninstall|purge|validate>"
    echo "  emit        refuses to overwrite a live installation (SUPERREVIEW_FORCE=1 overrides, DESTROYS self-sync edits)"
    echo "  emit-agent  create-or-reuse <cwd>/.codex/agents/intent-guard.toml ONLY (no superreview skill needed);"
    echo "              prints 'INTENT_GUARD: CREATED|REUSE|MIGRATED <path>' (MIGRATED = pre-standard agent restamped in place)"
    echo "  upgrade     refresh a live installation; reports NEW template vs .template-baseline/ (the real template"
    echo "              delta, tailoring excluded), restores missing assets RAW (NEEDS PHASE 3), never overwrites"
    echo "  enable      rename .codex/skills/superreview/SKILL.md.disabled back to SKILL.md"
    echo "  disable     rename .codex/skills/superreview/SKILL.md to SKILL.md.disabled — /superreview stops being"
    echo "              discovered; references/, .template-baseline/ and all tailoring are untouched, reversible"
    echo "  uninstall   delete .codex/skills/superreview/; KEEPS the review reports and intent-guard.toml"
    echo "  purge       uninstall + delete .codex/reports/*_superreview/; still keeps intent-guard.toml"
    exit 1
    ;;
esac
