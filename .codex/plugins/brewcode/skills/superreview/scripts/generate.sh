#!/bin/bash
# brewcode:superreview generator script
# Adapted from setup.sh copy_review_skill(): copies the emit templates into the TARGET project
# (.codex/skills/superreview/) substituting SCALAR placeholders, then validates that NO setup-time
# {PLACEHOLDER} remains. Multi-row BLOCK placeholders are filled by the AI via Edit (see SKILL.md Phase 3).
#
# Usage: generate.sh <mode>
#   scan      - Report target tech stack, agents, rules, source/test dirs (Phase 1)
#   emit      - Copy + scalar-substitute templates into <cwd>/.codex/skills/superreview/ (Phase 2)
#   validate  - Fail if any unresolved setup-time {PLACEHOLDER} remains (Phase 4)

set -euo pipefail

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/superreview/scripts -> skills/superreview
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"

# Target is the current working directory (the repo being reviewed)
TARGET=".codex/skills/superreview"
TARGET_REFS="$TARGET/references"

validate_templates() {
  for t in "$REFS/SKILL.md.template" "$REFS/scope.md.template" "$REFS/agent-prompt.md" "$REFS/report-template.md"; do
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
  echo "--- Project agents (.codex/agents/) — DOMAIN EXPERT roster ---"
  if [ -d .codex/agents ]; then
    for f in .codex/agents/*.toml; do
      [ -f "$f" ] || continue
      printf '%s :: %s :: %s\n' "$f" \
        "$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//')" \
        "$(grep -m1 '^description:' "$f" | sed 's/^description:[[:space:]]*//' | cut -c1-220)"
    done
    _n=$(find .codex/agents -maxdepth 1 -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
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
}

# ── emit: copy + scalar-substitute templates into the target ────────────────────
emit_skill() {
  echo "=== superreview: emit ==="
  validate_templates

  mkdir -p "$TARGET_REFS"

  # Scalar values (single-line ONLY — sed processes line-by-line; a newline truncates the substitution).
  PROJECT_NAME="${PROJECT_NAME:-this project}"
  STACK_LABEL="${STACK_LABEL:-the project stack}"
  STACK_REF="${STACK_REF:-python.md}"
  SOURCE_GLOB="${SOURCE_GLOB:-*}"
  PATHSPEC_GLOBS="${PATHSPEC_GLOBS:-'*' 'Dockerfile*' 'docker-compose.yml' '.github/workflows/*.yml'}"
  ARBITER_AGENT="${ARBITER_AGENT:-general-purpose}"
  VALIDATOR_AGENT="${VALIDATOR_AGENT:-general-purpose}"
  SCOPE_AGENT_A="${SCOPE_AGENT_A:-Explore}"
  SCOPE_AGENT_B="${SCOPE_AGENT_B:-Explore}"
  TRACKER_LABEL="${TRACKER_LABEL:-local task board + issue tracker (read-only)}"
  GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  _sep=$'\x01'

  # Sanitize every scalar before it lands on a sed RHS: escape backslash FIRST, then ampersand
  # (& is the whole-match backreference in sed replacements). Order matters.
  for _var in PROJECT_NAME STACK_LABEL STACK_REF SOURCE_GLOB PATHSPEC_GLOBS ARBITER_AGENT VALIDATOR_AGENT \
              SCOPE_AGENT_A SCOPE_AGENT_B TRACKER_LABEL GENERATED_AT; do
    v="${!_var}"; v="${v//\\/\\\\}"; v="${v//&/\\&}"; printf -v "$_var" '%s' "$v"
  done

  _subst() {
    # $1 = source template, $2 = destination
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
      -e "s${_sep}{GENERATED_AT}${_sep}${GENERATED_AT}${_sep}g" \
      "$1" > "$2"
  }

  _subst "$REFS/SKILL.md.template" "$TARGET/SKILL.md"
  echo "✅ $TARGET/SKILL.md"

  _subst "$REFS/agent-prompt.md" "$TARGET_REFS/agent-prompt.md"
  echo "✅ $TARGET_REFS/agent-prompt.md"

  _subst "$REFS/report-template.md" "$TARGET_REFS/report-template.md"
  echo "✅ $TARGET_REFS/report-template.md"

  _subst "$REFS/scope.md.template" "$TARGET_REFS/scope.md"
  echo "✅ $TARGET_REFS/scope.md"

  if [ -f "$REFS/$STACK_REF" ]; then
    cp "$REFS/$STACK_REF" "$TARGET_REFS/$STACK_REF"
    echo "✅ $TARGET_REFS/$STACK_REF"
  else
    echo "⚠️ stack reference not found: $REFS/$STACK_REF (emitted without per-stack doc)"
  fi

  echo ""
  echo "Next: AI fills BLOCK placeholders via Edit (SKILL.md Phase 3), then run: generate.sh validate"
}

# ── validate: no setup-time {PLACEHOLDER} may remain ────────────────────────────
validate_emit() {
  echo "=== superreview: validate ==="

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ emitted skill missing: $TARGET/SKILL.md — run 'generate.sh emit' first"
    exit 1
  fi

  # Runtime tokens the emitted skill legitimately keeps (resolved at REVIEW time, not GENERATION time).
  _runtime='MODE|BRANCH|SCOPE|FILES|COUNT|TIMESTAMP|FOCUS|FILE_LIST|AGENT_LIST|CANDIDATES|MERGED|PATHSPEC|MAIN|SHA|FOLDER|GROUP|AGENT|N|OC|SC|K|U|D|ROOT|TOK|RANGE|REPORT_DIR|SCOPE_BASELINE|OWNERSHIP|GATE_RESULTS|PR_ISSUE_JSON'

  _errors=0
  for f in "$TARGET/SKILL.md" "$TARGET_REFS/agent-prompt.md" "$TARGET_REFS/report-template.md" \
           "$TARGET_REFS/scope.md"; do
    [ -f "$f" ] || continue
    _unresolved=$(grep -oE '\{[A-Z_]+\}' "$f" | sort -u | grep -vE "^\{(${_runtime})\}$" || true)
    if [ -n "$_unresolved" ]; then
      echo "❌ unresolved setup-time placeholders in $f:"
      echo "$_unresolved"
      _errors=$((_errors+1))
    fi
  done

  # Agent-reference allowlist: every agent named in the emitted SKILL.md must be a
  # project-local agent (.codex/agents/*.toml) or a real built-in (Explore|Plan|general-purpose).
  _builtins="Explore Plan general-purpose"
  _local_agents=""
  for _af in .codex/agents/*.toml; do
    [ -f "$_af" ] || continue
    _an="$(basename "$_af" .md)"
    _local_agents="$_local_agents $_an"
  done

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
  for _req in "$TARGET_REFS/agent-prompt.md" "$TARGET_REFS/report-template.md" "$TARGET_REFS/scope.md"; do
    if [ ! -f "$_req" ]; then
      echo "❌ missing emitted asset: $_req"
      _errors=$((_errors+1))
    fi
  done

  # (d) DOMAIN EXPERTS — a review routed only to generic agents is a degraded review.
  # Override with SUPERREVIEW_ALLOW_NO_EXPERTS=1 when the target genuinely has no domain agents.
  _experts=0
  for _name in $_local_agents; do
    grep -qF "$_name" "$TARGET/SKILL.md" && _experts=$((_experts+1))
  done
  if [ "$_experts" -eq 0 ]; then
    if [ "${SUPERREVIEW_ALLOW_NO_EXPERTS:-0}" = "1" ]; then
      echo "⚠️ no project domain expert wired (allowed by SUPERREVIEW_ALLOW_NO_EXPERTS=1) — the emitted review is DEGRADED"
    else
      echo "❌ no project domain expert (.codex/agents/*.toml) is wired into SKILL.md — create the missing experts"
      echo "   (see SKILL.md Phase 1.6) or re-run with SUPERREVIEW_ALLOW_NO_EXPERTS=1 to accept a degraded review"
      _errors=$((_errors+1))
    fi
  else
    echo "✅ domain experts wired: $_experts"
  fi

  if [ "$_errors" -eq 0 ]; then
    echo "✅ no unresolved setup-time placeholders"
  fi
  exit "$_errors"
}

case "$MODE" in
  scan) scan_target ;;
  emit) emit_skill ;;
  validate) validate_emit ;;
  *)
    echo "Usage: generate.sh <scan|emit|validate>"
    exit 1
    ;;
esac
