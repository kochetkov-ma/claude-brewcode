#!/bin/bash
# brewcode:superreview generator script
# Adapted from setup.sh copy_review_skill(): copies the emit templates into the TARGET project
# (.claude/skills/superreview/) substituting SCALAR placeholders, then validates that NO setup-time
# {PLACEHOLDER} remains. Multi-row BLOCK placeholders are filled by the AI via Edit (see SKILL.md Phase 3).
#
# Usage: generate.sh <mode>
#   scan      - Report target tech stack, agents, rules, source/test dirs (Phase 1)
#   emit      - Copy + scalar-substitute templates into <cwd>/.claude/skills/superreview/ (Phase 2)
#   validate  - Fail if any unresolved setup-time {PLACEHOLDER} remains (Phase 4)

set -euo pipefail

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/superreview/scripts -> skills/superreview
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"

# Target is the current working directory (the repo being reviewed)
TARGET=".claude/skills/superreview"
TARGET_REFS="$TARGET/references"

validate_templates() {
  if [ ! -f "$REFS/SKILL.md.template" ]; then
    echo "❌ Emit template not found: $REFS/SKILL.md.template"
    exit 1
  fi
}

# ── scan: report what the emitted skill must be wired to ────────────────────────
scan_target() {
  echo "=== superreview: target scan ==="
  echo ""
  echo "--- Build files ---"
  find . -maxdepth 3 -type f \( \
    -name "package.json" -o -name "pom.xml" -o -name "build.gradle" -o \
    -name "build.gradle.kts" -o -name "requirements*.txt" -o -name "pyproject.toml" -o \
    -name "Pipfile" -o -name "Cargo.toml" -o -name "go.mod" -o -name "composer.json" \
  \) 2>/dev/null | sort || echo "(none found)"

  echo ""
  echo "--- Project agents (.claude/agents/) ---"
  find .claude/agents -type f -name "*.md" 2>/dev/null | sort || echo "(none)"

  echo ""
  echo "--- Rules (.claude/rules/) ---"
  find .claude/rules -type f -name "*.md" 2>/dev/null | sort || echo "(none)"

  echo ""
  echo "--- Conventions (.claude/convention/) ---"
  find .claude/convention -type f -name "*.md" 2>/dev/null | sort || echo "(none)"

  echo ""
  echo "--- Source / service dirs (top level) ---"
  find . -maxdepth 2 -type d \( -name "src" -o -name "app" -o -name "lib" -o \
    -name "pkg" -o -name "internal" -o -name "cmd" \) 2>/dev/null | sort || echo "(none)"

  echo ""
  echo "--- Test dirs ---"
  find . -type d \( -name "test" -o -name "tests" -o -name "__tests__" \) 2>/dev/null | head -20 || echo "(none)"

  echo ""
  echo "--- CLAUDE.md ---"
  test -f ./CLAUDE.md && echo "✅ CLAUDE.md" || echo "⚠️ no CLAUDE.md"
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
  GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  _sep=$'\x01'

  # Sanitize every scalar before it lands on a sed RHS: escape backslash FIRST, then ampersand
  # (& is the whole-match backreference in sed replacements). Order matters.
  for _var in PROJECT_NAME STACK_LABEL STACK_REF SOURCE_GLOB PATHSPEC_GLOBS ARBITER_AGENT VALIDATOR_AGENT GENERATED_AT; do
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
      -e "s${_sep}{GENERATED_AT}${_sep}${GENERATED_AT}${_sep}g" \
      "$1" > "$2"
  }

  _subst "$REFS/SKILL.md.template" "$TARGET/SKILL.md"
  echo "✅ $TARGET/SKILL.md"

  _subst "$REFS/agent-prompt.md" "$TARGET_REFS/agent-prompt.md"
  echo "✅ $TARGET_REFS/agent-prompt.md"

  _subst "$REFS/report-template.md" "$TARGET_REFS/report-template.md"
  echo "✅ $TARGET_REFS/report-template.md"

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
  _runtime='MODE|BRANCH|SCOPE|FILES|COUNT|TIMESTAMP|FOCUS|FILE_LIST|AGENT_LIST|CANDIDATES|MERGED|PATHSPEC|MAIN|SHA|FOLDER|GROUP|AGENT|N|OC|REPORT_DIR'

  _errors=0
  for f in "$TARGET/SKILL.md" "$TARGET_REFS/agent-prompt.md" "$TARGET_REFS/report-template.md"; do
    [ -f "$f" ] || continue
    _unresolved=$(grep -oE '\{[A-Z_]+\}' "$f" | sort -u | grep -vE "^\{(${_runtime})\}$" || true)
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
