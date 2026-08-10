#!/bin/bash
# brewcode:superreview-setup generator script
# Adapted from setup.sh copy_review_skill(): copies the emit templates into the TARGET project
# (.claude/skills/superreview/) substituting SCALAR placeholders, then validates that NO setup-time
# {PLACEHOLDER} remains. Multi-row BLOCK placeholders are filled by the AI via Edit (see SKILL.md Phase 3).
#
# Usage: generate.sh <mode>
#   scan        - Report target tech stack, agents, rules, source/test dirs (Phase 1)
#   emit        - Copy + scalar-substitute templates into <cwd>/.claude/skills/superreview/ (Phase 2)
#                 AND create-or-reuse <cwd>/.claude/agents/intent-guard.md.
#                 Also saves PRISTINE copies of the templates it emitted from under .template-baseline/ — that
#                 baseline is what makes `upgrade` able to tell a TEMPLATE change apart from Phase 3 tailoring.
#                 REFUSES to overwrite a live installation (the emitted skill SELF-SYNCS — Phase 4b — so its
#                 SKILL.md and references/scope.md carry edits no template knows about). "Live" = ANY emitted
#                 artifact on disk (see `_live_artifacts`), not SKILL.md alone: a PARTIAL install must not be
#                 re-substituted with DEFAULT scalars. SUPERREVIEW_FORCE=1 overrides and DESTROYS those edits.
#   upgrade     - Refresh a LIVE installation without touching hand-edits (Phase 2b): stages a fresh emit next
#                 to it and reports, per file, the NEW TEMPLATE vs the .template-baseline/ copy — IDENTICAL |
#                 DIFFERS (real template delta) | MISSING -> restored RAW (NEEDS PHASE 3) | NO BASELINE (pre-baseline
#                 install: falls back to live-vs-template, tailoring included). Live file CONTENT is never
#                 written; the AI applies the template delta with targeted Edit calls. The one live write is an
#                 UNCONDITIONAL metadata restamp (version/generated_by/last_updated, one `RESTAMP:` line per
#                 file, body compared byte-for-byte) — without it a version bump, which reports IDENTICAL on
#                 every asset, could never clear the `stale` verdict setup-status reads off the emitted
#                 SKILL.md frontmatter. The per-stack reference is RE-DERIVED from the installed tree
#                 (see `_installed_stack_refs`), never re-defaulted — see `UPGRADE_STACK=` on stdout.
#                 Runs on ANY live install, SKILL.md included in the restorable set — so it is also the remedy
#                 for a partially damaged install, which `emit` refuses to touch. A DISABLED install (parked
#                 SKILL.md.disabled) is refused with `enable` as its remedy, never silently resurrected.
#   emit-agent  - Create-or-reuse <cwd>/.claude/agents/intent-guard.md ONLY. No superreview skill is
#                 written, read or required. Used by /brewcode:teams-setup, which must not author its own copy.
#                 Prints exactly one `INTENT_GUARD:` line on STDOUT: `INTENT_GUARD: CREATED <path>` |
#                 `INTENT_GUARD: REUSE <path>` | `INTENT_GUARD: MIGRATED <path>` (a pre-standard agent of
#                 ours, restamped in place — tailored body preserved). Diagnostics go to stderr and never
#                 break that contract.
#   validate    - Fail if any unresolved setup-time {PLACEHOLDER} remains (Phase 4)
#
# Env overrides (honored by BOTH emit and emit-agent; SUPERREVIEW_FORCE=1 lets emit overwrite a live install):
#   PROJECT_NAME, TRACKER_LABEL, SPEC_LOCATION, PLAN_LOCATION, POLICY_LOCATION
#   (emit also honors STACK_LABEL, STACK_REF, SOURCE_GLOB, PATHSPEC_GLOBS, ARBITER_AGENT,
#    VALIDATOR_AGENT, SCOPE_AGENT_A, SCOPE_AGENT_B; upgrade honors STACK_REF as an override of the
#    stack it derives from the installed tree, and ignores the rest — see upgrade_skill)

set -euo pipefail

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/superreview-setup/scripts -> skills/superreview-setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"
# Plugin manifest by SELF-LOCATION: skills/superreview-setup -> skills -> <plugin root>.
# Correct in the dev checkout AND in the installed cache. The version is NEVER hardcoded.
PLUGIN_JSON="$SKILL_DIR/../../.claude-plugin/plugin.json"

# Target is the current working directory (the repo being reviewed)
TARGET=".claude/skills/superreview"
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
IG_PATH=".claude/agents/intent-guard.md"
IG_STAMP_PREFIX="<!-- generated_by: brewcode:superreview-setup"   # tail anchor + provenance; survives the header strip
# The RETIRED pre-5.0 tail stamp (`<!-- intent-guard template v2 - emitted <ts> - source: ... -->`). Its presence
# without IG_STAMP_PREFIX is what proves a file came out of THIS pipeline before the artifact-metadata standard —
# i.e. ours, migratable, and never to be confused with a hand-written agent that carries no stamp at all.
IG_LEGACY_STAMP_RE='<!--[[:space:]]*intent-guard template v[0-9]'
IG_SEED_MARK="<!-- SEEDED-DEFAULT:"              # one per generic BLOCK default; removed by Phase 3 adaptation

# Every temp dir goes through $_bd; the trap makes leaks impossible on any exit path.
_bd=""
trap '[ -n "$_bd" ] && rm -rf "$_bd"' EXIT

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
# `find | sort` exits 0 on an empty result, so every listing goes through this helper:
# a bare `find ... || echo "(none)"` would never print the fallback.
# `|| true` is required: a missing dir makes find exit 1, and under `set -e` a failing command
# substitution in an assignment aborts the whole script.
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
  echo "--- Project agents (.claude/agents/) — DOMAIN EXPERT roster ---"
  if [ -d .claude/agents ]; then
    for f in .claude/agents/*.md; do
      [ -f "$f" ] || continue
      printf '%s :: %s :: %s\n' "$f" \
        "$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//')" \
        "$(grep -m1 '^description:' "$f" | sed 's/^description:[[:space:]]*//' | cut -c1-220)"
    done
    _n=$(find .claude/agents -maxdepth 1 -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    echo "agents=$_n"
    [ "$_n" -eq 0 ] && echo "⚠️ NO domain experts — superreview routed to generic agents is a DEGRADED review"
  else
    echo "(none)"
    echo "⚠️ NO .claude/agents/ — create domain experts before generating (see SKILL.md Phase 1.6)"
  fi

  echo ""
  echo "--- Scope baseline sources (tracker) ---"
  test -d .claude/features && echo "✅ .claude/features/ (file-based Kanban)" || echo "— no .claude/features/"
  command -v gh >/dev/null 2>&1 && echo "✅ gh CLI present" || echo "— no gh CLI"
  git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/branch: /' || true
  test -d .github && echo "✅ .github/ present" || echo "— no .github/"

  echo ""
  echo "--- Rules (.claude/rules/) ---"
  _list 'find .claude/rules -type f -name "*.md" | sort'

  echo ""
  echo "--- Conventions (.claude/convention/) ---"
  _list 'find .claude/convention -type f -name "*.md" | sort'

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
  echo "--- CLAUDE.md ---"
  test -f ./CLAUDE.md && echo "✅ CLAUDE.md" || echo "⚠️ no CLAUDE.md"

  echo ""
  echo "--- intent-guard: tier sources + existing agent ---"
  case "$(_ig_kind)" in
    CURRENT) echo "✅ $IG_PATH EXISTS, current format — emit will REUSE it, never overwrite" ;;
    FOREIGN) echo "✅ $IG_PATH EXISTS, no template stamp (the project's own agent) — emit will REUSE it, never overwrite" ;;
    LEGACY)  echo "⚠️ $IG_PATH carries the RETIRED 'intent-guard template vN' stamp — emit/upgrade will MIGRATE it (metadata restamped, tailored body preserved)" ;;
    BROKEN)  echo "⚠️ $IG_PATH exists but is empty / has no 'name: intent-guard' frontmatter / still carries unresolved {PLACEHOLDER} tokens — emit will RECREATE it" ;;
    *)       echo "— no $IG_PATH — emit will CREATE it from the template" ;;
  esac
  echo "Tier 2 (SPEC_LOCATION candidates):"
  _list 'find .claude/specs .claude/spec docs/specs doc/specs -maxdepth 2 -type f -name "*.md" | sort | head -20' "(none — SPEC_LOCATION=none)"
  echo "Tier 3 (PLAN_LOCATION candidates):"
  _list 'find .claude/features .claude/tasks -maxdepth 2 \( -type f -o -type d \) | sort | head -20' "(none — PLAN_LOCATION=none)"
  echo "Tier 4 (POLICY_LOCATION candidates):"
  _list 'find . -maxdepth 3 -name "CLAUDE.md" -not -path "./node_modules/*" | sort' "(no CLAUDE.md)"
  _list 'find .claude/rules .claude/convention -type f -name "*.md" | sort' "(no rules/convention)"
  echo "Planned scale / testing / dependency policy: read the files above — they fill {PROJECT_INVARIANTS_TABLE}"
}

# ── shared: scalar resolution + substitution (used by emit AND emit-agent) ──────
# Plugin version out of the manifest, never a literal. jq when present, a sed fallback otherwise so a
# jq-less machine still stamps a real number. `|| true` everywhere: under `set -e` a failing command
# substitution in an assignment aborts the script.
_plugin_version() {
  _pv=""
  if [ -f "$PLUGIN_JSON" ]; then
    if command -v jq >/dev/null 2>&1; then
      _pv=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
    else
      _pv=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
    fi
  fi
  # HARD FAIL, never a placeholder value. A word like `unknown` carries no `{}<>`, so the reader's
  # PLACEHLD test cannot catch it: `sort -V` would compare it against the real version and report a
  # confident `AHEAD unknown > X.Y.Z`. Emitting the raw `{PLUGIN_VERSION}` token instead would only
  # move the failure to `validate` AFTER the artifact was written. The manifest is part of the plugin
  # in the dev checkout and in the cache alike, so an unreadable one is a broken install: stop before
  # anything is written.
  case "$_pv" in
    [0-9]*.[0-9]*.[0-9]*) printf '%s' "$_pv"; return 0 ;;
  esac
  echo "❌ cannot resolve the plugin version (X.Y.Z) from $PLUGIN_JSON — refusing to stamp an artifact with a fake version" >&2
  return 1
}

resolve_scalars() {
  [ "${_SCALARS_READY:-0}" = "1" ] && return 0
  # Scalar values (single-line ONLY — sed processes line-by-line; a newline truncates the substitution).
  PROJECT_NAME="${PROJECT_NAME:-this project}"
  STACK_LABEL="${STACK_LABEL:-the project stack}"
  STACK_REF="${STACK_REF:-python.md}"
  # The per-stack references to COPY/RESTAMP, as a list. `emit` has exactly one (the scalar above); `upgrade`
  # derives it from the installed tree and may legitimately set it to MORE than one, or to NONE at all — hence
  # `${VAR-...}` and not `${VAR:-...}`: an explicitly EMPTY list means "this install has no stack doc", which
  # must never silently become the python.md default.
  STACK_REFS="${STACK_REFS-$STACK_REF}"
  SOURCE_GLOB="${SOURCE_GLOB:-*}"
  PATHSPEC_GLOBS="${PATHSPEC_GLOBS:-'*' 'Dockerfile*' 'docker-compose.yml' '.github/workflows/*.yml'}"
  ARBITER_AGENT="${ARBITER_AGENT:-general-purpose}"
  VALIDATOR_AGENT="${VALIDATOR_AGENT:-general-purpose}"
  SCOPE_AGENT_A="${SCOPE_AGENT_A:-Explore}"
  SCOPE_AGENT_B="${SCOPE_AGENT_B:-Explore}"
  TRACKER_LABEL="${TRACKER_LABEL:-local task board + issue tracker (read-only)}"
  # intent-guard tier sources (Tier 2/3/4). `none` is a legitimate value — an absent source is REPORTED, never invented.
  SPEC_LOCATION="${SPEC_LOCATION:-.claude/specs/**}"
  PLAN_LOCATION="${PLAN_LOCATION:-.claude/features/**}"
  POLICY_LOCATION="${POLICY_LOCATION:-\`CLAUDE.md\`, \`.claude/rules/**\`}"
  # Artifact-metadata standard. NOT env-overridable: the writer of every artifact below is always THIS
  # pipeline (teams-setup calls `emit-agent` rather than authoring its own copy), and the intent-guard tail
  # anchor `IG_STAMP_PREFIX` is a literal that must keep matching what the template emits.
  PLUGIN_VERSION="$(_plugin_version)" || exit 1
  GENERATED_BY="brewcode:superreview-setup"
  LAST_UPDATED="$(date +%F)"

  _sep=$'\x01'

  # Sanitize every scalar before it lands on a sed RHS: escape backslash FIRST, then ampersand
  # (& is the whole-match backreference in sed replacements). Order matters.
  for _var in PROJECT_NAME STACK_LABEL STACK_REF SOURCE_GLOB PATHSPEC_GLOBS ARBITER_AGENT VALIDATOR_AGENT \
              SCOPE_AGENT_A SCOPE_AGENT_B TRACKER_LABEL SPEC_LOCATION PLAN_LOCATION POLICY_LOCATION \
              PLUGIN_VERSION GENERATED_BY LAST_UPDATED; do
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
      -e "s${_sep}{GENERATED_BY}${_sep}${GENERATED_BY}${_sep}g" \
      -e "s${_sep}{LAST_UPDATED}${_sep}${LAST_UPDATED}${_sep}g" \
      "$1"
}

_subst() { _subst_raw "$1" > "$2"; }

# Copy the RAW (unsubstituted) templates under $1, keyed by the path each one is EMITTED to. Raw on purpose:
# comparing raw-vs-raw keeps per-run scalars ({LAST_UPDATED} and {PLUGIN_VERSION} above all) out of the delta —
# a plain version bump therefore reports IDENTICAL, not a diff on every file — so an unchanged template
# always compares byte-identical. `*` in .gitignore keeps the whole dir — itself included — out of `git add -A`.
# INVARIANT: every template copied here carries the metadata TOKENS, never a baked literal version. A baked value
# would make the frozen baseline differ from the plugin template on every release — a permanent phantom DIFFERS.
# Consequence: none of these files may appear in bump-version.sh's STAMPED_FILES manifest.
copy_raw_templates() {
  _dst="$1"
  mkdir -p "$_dst/references"
  printf '*\n' > "$_dst/.gitignore"
  cp "$REFS/SKILL.md.template"  "$_dst/SKILL.md"
  cp "$REFS/agent-prompt.md"    "$_dst/references/agent-prompt.md"
  cp "$REFS/report-template.md" "$_dst/references/report-template.md"
  cp "$REFS/scope.md.template"  "$_dst/references/scope.md"
  # `|| true`: a missing per-stack ref must not abort the run under `set -e`.
  for _s in $STACK_REFS; do
    { [ -f "$REFS/$_s" ] && cp "$REFS/$_s" "$_dst/references/$_s"; } || true
  done
}

# ── shared: which per-stack reference this install actually uses ────────────────
# The stack was a real DECISION at emit time (SKILL.md Phase 1 detects it, exports STACK_REF). `upgrade` runs with
# a bare environment, so it must READ that decision back rather than let `resolve_scalars` re-default it.
#
# The catalog is derived from the templates on disk, never a hardcoded list: everything in references/*.md that is
# not one of the two stack-INdependent emits. (`SKILL.md.template` / `scope.md.template` / `intent-guard.md.template`
# end in `.template`, so the `*.md` glob never sees them.)
_stack_catalog() {
  for _f in "$REFS"/*.md; do
    [ -f "$_f" ] || continue
    _b="$(basename "$_f")"
    case "$_b" in agent-prompt.md|report-template.md) continue ;; esac
    printf '%s\n' "$_b"
  done
}

# The recorded decision, read back from the only two places that survive an install: the emitted reference itself
# and its pristine baseline copy. Detection beats persisting a new config key because it works RETROACTIVELY — every
# install already made, including pre-baseline ones, answers the question. Prints 0..N names, one per line; N>1 is a
# multi-stack install and every one of them is a live artifact that needs the restamp.
_installed_stack_refs() {
  _stack_catalog | while IFS= read -r _b; do
    if [ -f "$TARGET_REFS/$_b" ] || [ -f "$BASELINE/references/$_b" ]; then printf '%s\n' "$_b"; fi
  done
}

# ── shared: "is something already installed here?" ──────────────────────────────
# Every artifact of a live install that is present on disk, one rel path per line (empty output = nothing
# installed). `emit` refuses when this is non-empty and `upgrade` requires it to be non-empty — ONE question,
# asked once. Keying either gate on SKILL.md alone was the defect: with SKILL.md deleted and references/ still
# tailored, `emit`'s guard did not fire and it re-substituted every surviving reference with DEFAULT scalars,
# planting `python.md` and a generic scope over, say, a TypeScript install. The parked SKILL.md.disabled counts:
# a disabled install is still an install.
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

# ── shared: the ONE unresolved-placeholder scanner ──────────────────────────────
# EVERY token check in this script goes through here. A placeholder is `{UPPER_SNAKE}`, but that is a SUBSTRING of
# the shell expansion `${UPPER_SNAKE}` — and after Phase 3 the emitted artifacts hold real shell: the shipped
# SKILL.md.template alone already carries `${MAIN}`, `${REPORT_DIR}`, `${ROOT}`, `${TOK}`, none of which ever
# appears as a bare token. Those four sit in `validate`'s `_runtime` allowlist purely so the loose pattern would
# not flag them, which masked the defect for exactly the names the template happened to use: a Phase 3 evidence
# command adding `${BASE}` or `${HOME}` was reported as an unresolved placeholder and failed `validate`, and in
# `_ig_kind` it was worse than a failed gate — it classified a correctly tailored agent as BROKEN and RECREATED
# it, destroying the tailoring.
#
# So: strip the colliding shell form FIRST, then scan what is left. A leading-guard pattern like
# `(^|[^$])\{[A-Z_]+\}` was rejected — with `-o` it consumes the guard character, so ADJACENT tokens
# (`{A_B}{C_D}`) silently lose the second one and the reported name comes out as `x{TOKEN}` instead of the token
# the user has to fix. Stripping first has neither problem and needs no `grep -P` lookbehind (absent on BSD grep,
# i.e. on the user machines this generator runs on).
#
# Only `${UPPER_SNAKE}` is stripped, which is exactly the colliding set: `${lower}` and `${VAR:-default}` do not
# match the token shape in the first place, so nothing else is weakened.
#
# TWO-or-more characters (was `+`, one-or-more): every setup-time token is a long name, and the 1-char runtime
# tokens ({N}, {K}, {U}, {D}) are allowlisted away downstream regardless — so `{2,}` changes no verdict and
# removes a false-positive surface. It also makes this scanner and `_ig_kind` agree, which they did not before.
TOKEN_STRIP_SED='s/\${[A-Z_][A-Z_]*}//g'
TOKEN_RE='\{[A-Z_]{2,}\}'
# One BARE token per line — no guard character, so what `validate` prints is exactly what must be fixed.
# `|| true`: zero matches is the happy path and rc=1 would abort the caller's assignment (repo rule avoid#7).
_scan_tokens() { sed "$TOKEN_STRIP_SED" "$1" | grep -oE "$TOKEN_RE" || true; }

# ── shared: the ONE writer of .claude/agents/intent-guard.md ────────────────────
# Called by BOTH `emit` and `emit-agent`. Never a second implementation, never a hand-written copy.
# CREATE-OR-REUSE-OR-MIGRATE. The whole decision is `_ig_kind`, which prints exactly one word:
#
#   ABSENT  no file                                                       -> CREATE from the template
#   BROKEN  empty / no `name: intent-guard` / unresolved {UPPER_SNAKE}     -> RECREATE (treated as absent)
#   CURRENT OURS, current format: carries the tail anchor IG_STAMP_PREFIX  -> REUSE, byte-untouched
#   LEGACY  OURS, pre-standard: carries a RETIRED `intent-guard template vN` stamp and no current anchor
#                                                                         -> MIGRATE (restamp in place)
#   FOREIGN no stamp of either generation                                 -> REUSE, byte-untouched
#
# LEGACY is the case the reader (`setup-status`) reports as `stale (legacy stamp)` and promises "one
# `upgrade` restamps it". Recreating it would destroy the project's Phase 3 tailoring, so the migration
# moves METADATA ONLY: the four frontmatter keys and the tail anchor. Every tailored line survives.
# FOREIGN is the reason REUSE exists and stays untouchable — a hand-written agent is never judged by, nor
# rewritten to, template rules (see validate c2). The {UPPER_SNAKE} test is deliberately independent of the
# stamp: raw tokens make a file broken whoever wrote it. It runs through `_scan_tokens`, so a Phase 3 evidence
# command holding `${HOME}` is shell, not a placeholder — misreading it here RECREATES a tailored agent.
_ig_kind() {
  [ -e "$IG_PATH" ] || { echo ABSENT; return 0; }
  if [ ! -s "$IG_PATH" ] \
     || ! grep -q '^name:[[:space:]]*intent-guard[[:space:]]*$' "$IG_PATH" \
     || [ -n "$(_scan_tokens "$IG_PATH")" ]; then
    echo BROKEN; return 0
  fi
  grep -qF "$IG_STAMP_PREFIX" "$IG_PATH" && { echo CURRENT; return 0; }
  grep -qE "$IG_LEGACY_STAMP_RE" "$IG_PATH" && { echo LEGACY; return 0; }
  echo FOREIGN
}

# "Nothing to write" — the file is runnable AND its metadata is current. LEGACY is deliberately NOT usable:
# it is a live agent that still needs its restamp, and every caller must see that as work outstanding.
_ig_usable() { case "$(_ig_kind)" in CURRENT|FOREIGN) return 0 ;; *) return 1 ;; esac; }

# Restamp a LEGACY agent IN PLACE. Metadata only: the four frontmatter keys in D2 order and the current
# tail anchor, both taken from the SUBSTITUTED template so there is exactly one source for their spelling.
# The body — invariants, drift examples, evidence commands, every hand-tailored line — is copied through
# untouched, which is what separates a migration from a re-emit.
_ig_migrate() {
  _bd="$(mktemp -d)"
  _subst_raw "$REFS/intent-guard.md.template" > "$_bd/tpl"
  # Scoped to the FRONTMATTER block, exactly as `_restamp_meta` does it — one dialect. Grepping the whole file
  # would also collect any `version:` / `last_updated:` line the BODY happens to carry (a YAML example inside a
  # fence is the obvious way that arrives) and inject it into the frontmatter as a duplicate key.
  _fm_block "$_bd/tpl" | grep -E '^(doc_type|version|generated_by|last_updated):' > "$_bd/meta" || true
  awk -v anchor="$IG_STAMP_PREFIX" 'f || index($0, anchor) { f = 1; print }' "$_bd/tpl" > "$_bd/tail"
  if [ ! -s "$_bd/meta" ] || [ ! -s "$_bd/tail" ]; then
    echo "❌ migration aborted: intent-guard.md.template carries no metadata frontmatter or no tail anchor" >&2
    return 1
  fi

  # 1. frontmatter: drop any pre-existing copy of the four keys, re-insert them before the closing `---`.
  awk -v metaf="$_bd/meta" '
    NR == 1 && $0 == "---" { fm = 1; print; next }
    fm == 1 && $0 == "---" {
      while ((getline l < metaf) > 0) print l
      close(metaf); fm = 2; print; next
    }
    fm == 1 && /^(doc_type|version|generated_by|last_updated):[[:space:]]/ { next }
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
  for _k in doc_type version generated_by last_updated; do
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
  mkdir -p .claude/agents

  case "$(_ig_kind)" in
    CURRENT|FOREIGN)
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
      # Diagnostic only — STDERR, so stdout keeps carrying exactly one `INTENT_GUARD:` status line.
      echo "⚠️ $IG_PATH exists but is empty, has no 'name: intent-guard' frontmatter, or still carries unresolved {PLACEHOLDER} tokens — recreating from template" >&2
      ;;
  esac

  # The agent must be RUNNABLE straight out of emit — the emitted skill spawns it at BOTH depths, so a
  # half-filled agent file breaks a QUICK run entirely. The three BLOCKs therefore get stack-generic
  # DEFAULTS here, each tagged with a SEEDED-DEFAULT marker; Phase 3 REPLACES block + marker with project
  # specifics. A surviving marker is what makes a skipped adaptation visible to `validate`.
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
| Testing policy | the project's own convention (rules / CLAUDE.md) wins over any default | \`intent#tests\` |
| Dependency policy | a new runtime dependency needs an explicit request or a recorded decision | \`intent#deps\` |
| File-layout policy | follow the existing tree; a new top-level dir needs a stated reason | \`intent#files\`, \`intent#naming\` |
| Architecture stance | keep the pattern already in the repo unless the request replaces it | \`intent#arch\`, \`intent#indirection\` |

> These are the generic floor. Re-read the project's \`CLAUDE.md\`, rules and conventions each run and treat
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

  # POST-STRIP POST-CONDITION. The strip is a sed RANGE: if its end pattern ever fails to match, sed deletes
  # to EOF and the result is a plausible-looking file with no tokens and no header — i.e. it passes validate.
  # Both anchors below sit OUTSIDE the header block, so their loss proves the strip ran away.
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

# ── emit-agent: intent-guard ONLY (no superreview skill involved) ───────────────
emit_agent_only() {
  write_intent_guard
}

# ── emit: copy + scalar-substitute templates into the target ────────────────────
emit_skill() {
  echo "=== superreview: emit ==="
  validate_templates

  # The emitted skill SELF-SYNCS (its Phase 4b corrects its own routing table, gates, baseline and shared
  # surfaces). A blind re-emit would silently erase every one of those corrections, so a live installation is
  # never overwritten: `upgrade` refreshes it, and SUPERREVIEW_FORCE=1 is the conscious destructive override.
  # The guard keys on the WHOLE artifact set, not on SKILL.md alone: a PARTIALLY damaged install (SKILL.md
  # deleted, every tailored reference still in place) used to slip past it, and emit then re-substituted those
  # references with DEFAULT scalars — `this project`, the generic scope, `python.md` over a TypeScript install.
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

  _subst "$REFS/SKILL.md.template" "$TARGET/SKILL.md"
  echo "✅ $TARGET/SKILL.md"

  _subst "$REFS/agent-prompt.md" "$TARGET_REFS/agent-prompt.md"
  echo "✅ $TARGET_REFS/agent-prompt.md"

  _subst "$REFS/report-template.md" "$TARGET_REFS/report-template.md"
  echo "✅ $TARGET_REFS/report-template.md"

  _subst "$REFS/scope.md.template" "$TARGET_REFS/scope.md"
  echo "✅ $TARGET_REFS/scope.md"

  if [ -f "$REFS/$STACK_REF" ]; then
    _subst "$REFS/$STACK_REF" "$TARGET_REFS/$STACK_REF"
    echo "✅ $TARGET_REFS/$STACK_REF"
  else
    echo "⚠️ stack reference not found: $REFS/$STACK_REF (emitted without per-stack doc)"
  fi

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
# First frontmatter block of a file -> stdout. One reader for every check below, so "the frontmatter" means
# the same lines everywhere — `references/scope.md` carries a second `---` in its body and must not confuse it.
_fm_block() { awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f { print }' "$1"; }
# Everything AFTER that block -> stdout. Used as the did-not-touch-the-body proof.
_fm_body()  { awk 'NR == 1 && $0 == "---" { f = 1; next } f == 1 && $0 == "---" { f = 2; next } f == 2 { print }' "$1"; }

# Refresh ONLY `version` / `generated_by` / `last_updated` in a LIVE file's own frontmatter, in place.
# $1 = live file, $2 = its freshly substituted staging counterpart — the single source for the spelling of the
# three values, exactly as `_ig_migrate` takes them from the substituted template. `doc_type` is PRESERVED when
# present (§1 of the artifact-metadata spec: it is user-owned) and seeded as `llm` only when the file has none.
# The body is copied through untouched and then compared byte-for-byte; a mismatch aborts rather than shipping a
# file whose Phase 3 tailoring or Phase 4b self-sync edits were silently mangled.
_restamp_meta() {
  _live="$1"; _src="$2"
  if [ "$(head -1 "$_live")" != "---" ]; then
    echo "⚠️ RESTAMP: $_live has no frontmatter block — left untouched" >&2
    return 0
  fi
  _bd="$(mktemp -d)"
  _fm_block "$_src" | grep -E '^(version|generated_by|last_updated):[[:space:]]' > "$_bd/meta" || true
  if [ "$(grep -c . "$_bd/meta" || true)" -ne 3 ]; then
    echo "❌ restamp aborted: $_src frontmatter carries no version/generated_by/last_updated trio" >&2
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
    fm == 1 && /^(version|generated_by|last_updated):[[:space:]]/ { next }
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
  echo "RESTAMP: $_live version ${_was:-(none)} -> \"$PLUGIN_VERSION\", generated_by/last_updated refreshed (body untouched)"
}

# ── upgrade: refresh a LIVE installation, hand-edits preserved ──────────────────
# The emitted skill is EXPECTED to have self-modified (its Phase 4b SELF-SYNC) and to carry Phase 3 tailoring, so
# no live file is ever written over AND no live file is ever the diff baseline: comparing a tailored install to a
# raw template reports every tailored line as a "change". The real question is what the TEMPLATE changed, so the
# comparison is NEW template vs the pristine .template-baseline/ copy saved at emit time. The live file is only
# the place the delta gets ported INTO. Only an asset that is MISSING is restored in place — a file that does not
# exist has no hand-edits to lose — and a restored file is RAW, so it still needs Phase 3.
upgrade_skill() {
  echo "=== superreview: upgrade ==="
  validate_templates

  # A LIVE INSTALL is the requirement, not SKILL.md specifically. Gating on SKILL.md alone left the one state
  # this mode exists for — SKILL.md deleted, every tailored reference intact — with `emit` as its only advertised
  # remedy, and `emit` re-defaults every one of those references. The restore loop below already handles a
  # missing artifact correctly (RAW, out of `.template/`, NEEDS PHASE 3), and SKILL.md is in that set.
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

  # STACK — re-derived from the INSTALLED tree BEFORE any scalar resolves. `resolve_scalars` would otherwise fall
  # back to `python.md`, and every loop below iterates `references/$STACK_REF`: on a TypeScript/Go/Java-Kotlin
  # install the project's REAL reference would never be staged, never be restamped, and stay behind at the old
  # version forever — so `setup-status` keeps printing `stale` after a successful upgrade. An explicit STACK_REF in
  # the environment still wins (documented override); nothing else re-defaults.
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
      # NOT determinable: emitted without a per-stack doc, or the reference was deleted by hand. Guessing is the
      # bug this block exists to remove, so nothing is guessed and nothing per-stack is staged — but the run does
      # NOT abort: the other four artifacts still need their restamp or `status` reads `stale` forever.
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

  _subst "$REFS/SKILL.md.template"    "$STAGING/SKILL.md"
  _subst "$REFS/agent-prompt.md"      "$STAGING/references/agent-prompt.md"
  _subst "$REFS/report-template.md"   "$STAGING/references/report-template.md"
  _subst "$REFS/scope.md.template"    "$STAGING/references/scope.md"
  # `|| true`: a missing per-stack ref must not abort the run under `set -e`.
  for _s in $STACK_REFS; do
    { [ -f "$REFS/$_s" ] && _subst "$REFS/$_s" "$STAGING/references/$_s"; } || true
  done
  # Raw NEW templates, in the same shape as the baseline — this pair is what the delta is computed from.
  copy_raw_templates "$STAGING/.template"

  echo "UPGRADE_STAGING=$STAGING"
  echo "UPGRADE_BASELINE=$BASELINE"
  # The live artifact set: four stack-independent files plus every per-stack reference this install carries.
  _rels="SKILL.md references/agent-prompt.md references/report-template.md references/scope.md"
  for _s in $STACK_REFS; do _rels="$_rels references/$_s"; done

  _restored=0
  for _rel in $_rels; do
    [ -f "$STAGING/$_rel" ] || continue
    if [ ! -f "$TARGET/$_rel" ]; then
      # RAW, from `.template/` — never the substituted staging copy. `upgrade` runs with a bare environment, so
      # every scalar in that copy would be the DEFAULT ("this project", "the project stack", `general-purpose`,
      # `Explore`), i.e. the install-time decision silently re-guessed and baked into a live file that `validate`
      # then passes. Restoring RAW makes each one an unresolved {TOKEN} that `validate` lists by name, which is
      # exactly the NEEDS PHASE 3 contract. The metadata trio is refreshed by the restamp loop below.
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

  # Restamp the LIVE files. Unconditional, and deliberately NOT gated on the IDENTICAL/DIFFERS verdict above:
  # a plain version bump changes no template line, so every asset reports IDENTICAL — yet the emitted
  # `SKILL.md` frontmatter `version:` is exactly what setup-status reads to decide `stale`. Without this an
  # `upgrade` reported success and left the stamp untouched, so the next `status` printed `stale` forever.
  # Same `$_rels` set as the delta report above — including the project's REAL per-stack reference, whatever it is.
  for _rel in $_rels; do
    [ -f "$TARGET/$_rel" ] || continue
    [ -f "$STAGING/$_rel" ] || continue
    _restamp_meta "$TARGET/$_rel" "$STAGING/$_rel" || exit 1
  done

  # Same writer as emit: a current or hand-written intent-guard.md is REUSED byte-untouched, and a
  # pre-standard one of ours is MIGRATED here — this is the `upgrade restamps it` path setup-status promises.
  write_intent_guard

  echo ""
  echo "No live file was overwritten. Apply the template delta with targeted Edit calls (SKILL.md Phase 2b),"
  echo "keeping every self-synced correction."
  [ "$_restored" -gt 0 ] && echo "$_restored restored file(s) are RAW templates — run Phase 3 on them BEFORE validate."
  echo "Then promote the new templates to the baseline and clean up:"
  echo "  rm -rf \"$BASELINE\" && mv \"$STAGING/.template\" \"$BASELINE\" && rm -rf \"$STAGING\" && generate.sh validate"
}

# Artifact-metadata frontmatter gate: the four keys, in D2 order, quoted exactly as
# `brewcode/skills/rules/scripts/rules.sh:140-146` already requires — one dialect, not a second one.
# Prints one line per defect, returns 1 when any fired.
_check_meta_frontmatter() {
  _f="$1"; _bad=0
  _fm=$(awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f { print }' "$_f")
  for _k in doc_type version generated_by last_updated; do
    printf '%s\n' "$_fm" | grep -q "^${_k}:" || { echo "❌ $_f frontmatter missing metadata key: $_k"; _bad=1; }
  done
  printf '%s\n' "$_fm" | grep -q '^doc_type: llm$' \
    || { echo "❌ $_f doc_type must be exactly 'llm', UNQUOTED"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^version: "[0-9]+\.[0-9]+\.[0-9]+"$' \
    || { echo "❌ $_f version must be a QUOTED X.Y.Z"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^generated_by: "[^"]+"$' \
    || { echo "❌ $_f generated_by must be a QUOTED <plugin>:<skill>"; _bad=1; }
  printf '%s\n' "$_fm" | grep -Eq '^last_updated: "[0-9]{4}-[0-9]{2}-[0-9]{2}"$' \
    || { echo "❌ $_f last_updated must be a QUOTED YYYY-MM-DD"; _bad=1; }
  _order=$(printf '%s\n' "$_fm" | grep -oE '^(doc_type|version|generated_by|last_updated)' | tr '\n' ' ' || true)
  [ "$_order" = "doc_type version generated_by last_updated " ] \
    || { echo "❌ $_f metadata keys out of order [$_order] — must be doc_type, version, generated_by, last_updated"; _bad=1; }
  return "$_bad"
}

# ── validate: no setup-time {PLACEHOLDER} may remain ────────────────────────────
validate_emit() {
  echo "=== superreview: validate ==="

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ emitted skill missing: $TARGET/SKILL.md — run 'generate.sh emit' first"
    exit 1
  fi

  # Runtime tokens the emitted skill legitimately keeps (resolved at REVIEW time, not GENERATION time).
  # This list is NOT the shell-variable escape hatch — `_scan_tokens` handles `${VAR}` now. `MAIN`, `ROOT`, `TOK`
  # and `REPORT_DIR` occur in SKILL.md.template ONLY as `${…}` expansions and never as bare tokens; they are kept
  # here as harmless no-ops rather than removed, but do NOT add a name here to silence a shell variable — that is
  # the workaround that hid the collision until an adapted artifact used a variable nobody had allowlisted.
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
  # project-local agent (.claude/agents/*.md) or a real built-in (Explore|Plan|general-purpose).
  _builtins="Explore Plan general-purpose"
  _local_agents=""
  for _af in .claude/agents/*.md; do
    [ -f "$_af" ] || continue
    _an="$(basename "$_af" .md)"
    _local_agents="$_local_agents $_an"
  done

  # (a) explicit subagent_type="NAME" / subagent_type=NAME references
  _referenced=$(grep -oE 'subagent_type=("?)[A-Za-z0-9_-]+' "$TARGET/SKILL.md" \
    | sed -E 's/^subagent_type=("?)//' | sort -u || true)
  if [ -n "$_referenced" ]; then
    while IFS= read -r _name; do
      [ -n "$_name" ] || continue
      case " $_builtins $_local_agents " in
        *" $_name "*) : ;;
        *)
          echo "❌ unknown agent referenced in SKILL.md: $_name (not in target .claude/agents/ nor built-in Explore|Plan|general-purpose)"
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
      echo "❌ bare \`${_bare}\` used as a built-in/fallback agent in SKILL.md (not in target .claude/agents/ nor built-in Explore|Plan|general-purpose):"
      echo "$_leak"
      _errors=$((_errors+1))
    fi
  done

  # (c) required emitted assets — a missing one silently guts a phase of the emitted skill.
  # .claude/agents/intent-guard.md is EXECUTED by the emitted skill at BOTH depths: without it, QUICK is empty.
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
      echo "❌ unusable emitted asset: $IG_PATH (empty, no 'name: intent-guard' frontmatter, or unresolved {PLACEHOLDER} tokens) — re-run 'generate.sh emit-agent'"
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

  # (c2) TEMPLATE-DERIVED agents only. A file carrying the template stamp came out of this pipeline, so every
  # {PLACEHOLDER} in it must be resolved (scalars by emit, the three BLOCKs by AI Edit in SKILL.md Phase 3).
  # A REUSED hand-written intent-guard is byte-untouchable by contract — it is not judged by template rules.
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
    _check_meta_frontmatter "$IG_PATH" || _errors=$((_errors+1))
    # (c3) TAILORING. Seeded BLOCK defaults are a runnable floor, not the target: a run that skipped the
    # Phase 3 adaptation ships boilerplate and would otherwise pass every gate silently. WARN, not fail —
    # `emit-agent` is a legitimate standalone path whose adaptation happens in the caller's own flow.
    _ig_seeded=$(grep -cF "$IG_SEED_MARK" "$IG_PATH" || true)
    if [ "${_ig_seeded:-0}" -gt 0 ]; then
      echo "⚠️ UNTAILORED: $IG_PATH still carries $_ig_seeded seeded generic BLOCK default(s)"
      grep -nF "$IG_SEED_MARK" "$IG_PATH" || true
      echo "   INTENT_GUARD: UNTAILORED $IG_PATH ($_ig_seeded seeded block(s)) — run SKILL.md Phase 3 and replace each block + its marker"
    fi
    # (c4) RETURN CONTRACT. The `## 5. Output` rule every freshly emitted intent-guard is born with. An
    # install predating it keeps a CURRENT stamp and `upgrade` REUSEs it byte-untouched by contract, so the
    # clause can only arrive by hand — WARN with the source line, never fail an otherwise working agent.
    if ! grep -qF 'Verdict first, <=30 lines' "$IG_PATH"; then
      echo "⚠️ $IG_PATH has no return-length rule in '## 5. Output' (agent predates it)."
      echo "   Fix: copy the three paragraphs after the cap line of references/intent-guard.md.template into"
      echo "   the live '## 5. Output' section — the body is byte-untouchable, so no script writes it for you"
    fi
  elif [ "$_ig_state" = "FOREIGN" ]; then
    echo "ℹ️ $IG_PATH carries no template stamp of any generation — treated as the project's own hand-written agent, not checked against the template"
  fi

  # (d) DOMAIN EXPERTS — a review routed only to generic agents is a degraded review.
  # Override with SUPERREVIEW_ALLOW_NO_EXPERTS=1 when the target genuinely has no domain agents.
  # intent-guard is wired into EVERY emitted skill and is NOT a domain expert — excluded, or this check
  # would pass on a project that has no expert at all.
  # The match must prove ROUTING, not mere mention. A substring grep over the whole file credits any agent
  # whose name occurs in the emitted PROSE ("the guard SKIPS the gates" credits an unwired `guard.md`;
  # `plan.md`, `scope.md` behave the same). Two wired forms count, nothing else:
  #   - a whole CELL of a markdown table row ({DOMAIN_AGENTS_TABLE} / {FILE_GROUP_MAP} rows), backticks and
  #     emphasis stripped, comma lists split;
  #   - an explicit `subagent_type=NAME`.
  # Matching is exact-line (`grep -xF`), so a name is either the routed value or it is not wired.
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
    grep -oE 'subagent_type=("?)[A-Za-z0-9_-]+' "$TARGET/SKILL.md" | sed -E 's/^subagent_type=("?)//'
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
      echo "❌ no project domain expert (.claude/agents/*.md) is wired into SKILL.md — create the missing experts"
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

# --- enable / disable ------------------------------------------------------
# Claude Code discovers a project skill only through <dir>/SKILL.md. Parking that ONE file as
# SKILL.md.disabled makes /superreview vanish while references/, .template-baseline/ and every
# Phase 3 tailoring stay exactly where they are, so the toggle is reversible and lossless.
# intent-guard is NEVER parked: it is shared with /brewcode:teams-setup and belongs to whichever
# install put it there. ($DISABLED_MARK is defined next to $TARGET, above.)

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
  echo "✅ $_want (takes effect in the NEXT session — skills are discovered at session start)"
}

# --- uninstall / purge -----------------------------------------------------
# uninstall removes the MACHINERY (the generated skill dir); purge additionally removes the DATA
# (the review reports it produced). Same machinery/data split as /brewtools:task-board-setup.
# intent-guard survives BOTH: shared with /brewcode:teams-setup, and deleting it would break a
# team install that has nothing to do with superreview.
REPORT_GLOB=".claude/reports"

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
      echo "SKIP: no .claude/reports/*_superreview/ to remove"
    fi
  else
    _rc=$({ find "$REPORT_GLOB" -maxdepth 1 -type d -name '*_superreview' 2>/dev/null || true; } | wc -l | tr -d ' ')
    echo "KEPT:    $_rc review report dir(s) under $REPORT_GLOB/ — 'purge' deletes those too"
  fi

  if [ -f "$IG_PATH" ]; then
    echo "KEPT:    $IG_PATH — shared with /brewcode:teams-setup, never deleted by either skill"
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
    echo "  emit-agent  create-or-reuse <cwd>/.claude/agents/intent-guard.md ONLY (no superreview skill needed);"
    echo "              prints 'INTENT_GUARD: CREATED|REUSE|MIGRATED <path>' (MIGRATED = pre-standard agent restamped in place)"
    echo "  upgrade     refresh a live installation; reports NEW template vs .template-baseline/ (the real template"
    echo "              delta, tailoring excluded), restores missing assets RAW (NEEDS PHASE 3), never overwrites"
    echo "  enable      rename .claude/skills/superreview/SKILL.md.disabled back to SKILL.md"
    echo "  disable     rename .claude/skills/superreview/SKILL.md to SKILL.md.disabled — /superreview stops being"
    echo "              discovered; references/, .template-baseline/ and all tailoring are untouched, reversible"
    echo "  uninstall   delete .claude/skills/superreview/; KEEPS the review reports and intent-guard.md"
    echo "  purge       uninstall + delete .claude/reports/*_superreview/; still keeps intent-guard.md"
    exit 1
    ;;
esac
