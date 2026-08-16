#!/bin/bash
# Brewcode Rules Script
# Multi-function script for $brewcode:rules skill
# Usage: rules.sh <mode> [options]
#
# Modes:
#   read <path>           - Read knowledge file (first 100 lines)
#   check                 - Check existing rules files (main + specialized)
#   create                - Create missing main rules from templates
#   create-specialized <prefix> [paths] - Create specialized rules (e.g., test-avoid.md)
#   list                  - List all rule files (*-avoid.md, *-best-practice.md)
#   validate              - Validate frontmatter + table structure

set -euo pipefail

MODE="${1:-check}"
ARG="${2:-}"
ARG2="${3:-}"

# Self-location: derive plugin root from script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Path: scripts/rules.sh -> skills/rules/scripts -> skills/rules -> skills -> PLUGIN_ROOT
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
PLUGIN_TEMPLATES="$PLUGIN_ROOT/templates"
# Manifest by self-location: correct in the dev checkout AND in the installed cache.
PLUGIN_JSON="$PLUGIN_ROOT/.codex-plugin/plugin.json"

# Artifact-metadata standard. The version is read from the manifest, never hardcoded.
plugin_version() {
  local v=""
  if [ -f "$PLUGIN_JSON" ]; then
    if command -v jq >/dev/null 2>&1; then
      v=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
    else
      v=$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_JSON" 2>/dev/null | head -1 || true)
    fi
  fi
  case "$v" in
    [0-9]*.[0-9]*.[0-9]*) printf '%s' "$v"; return 0 ;;
  esac
  # HARD FAIL, never a placeholder value. A word like `unknown` carries no `{}<>`, so setup-status's
  # PLACEHLD test cannot catch it: `sort -V` would compare it against the real version and print a
  # confident `AHEAD unknown > X.Y.Z`. The manifest ships with the plugin in the dev checkout and in
  # the cache alike, so an unreadable one is a broken install - stop before a rule file is written.
  echo "❌ cannot resolve the plugin version (X.Y.Z) from $PLUGIN_JSON - refusing to stamp an artifact with a fake version" >&2
  return 1
}

PLUGIN_VERSION="$(plugin_version)" || exit 1
GENERATED_BY="brewcode:rules"
LAST_UPDATED="$(date +%F)"

# Validate plugin structure
validate_plugin() {
  if [ ! -d "$PLUGIN_ROOT" ]; then
    echo "X Plugin root not found: $PLUGIN_ROOT"
    exit 1
  fi
  if [ ! -d "$PLUGIN_TEMPLATES" ]; then
    echo "X Templates not found: $PLUGIN_TEMPLATES"
    exit 1
  fi
}

# Read knowledge file
read_knowledge() {
  local path="$1"
  if [ -z "$path" ]; then
    echo "X Missing path argument"
    echo "Usage: rules.sh read <path>"
    exit 1
  fi
  if [ -f "$path" ]; then
    head -100 "$path"
  else
    echo "X File not found: $path"
    exit 1
  fi
}

# Check existing rules files (main + specialized)
check_rules() {
  echo "=== Check Rules Files ==="
  echo "--- Main Files ---"
  test -f .codex/rules/avoid.md && echo "V avoid.md exists" || echo "! avoid.md missing"
  test -f .codex/rules/best-practice.md && echo "V best-practice.md exists" || echo "! best-practice.md missing"

  echo "--- Specialized Files ---"
  local specialized_avoid specialized_bp
  specialized_avoid=$(find .codex/rules -maxdepth 1 -name "*-avoid.md" 2>/dev/null | grep -v "^.codex/rules/avoid.md$" || true)
  specialized_bp=$(find .codex/rules -maxdepth 1 -name "*-best-practice.md" 2>/dev/null | grep -v "^.codex/rules/best-practice.md$" || true)

  if [ -n "$specialized_avoid" ] || [ -n "$specialized_bp" ]; then
    echo "$specialized_avoid" | while read -r f; do [ -n "$f" ] && echo "V $(basename "$f")"; done
    echo "$specialized_bp" | while read -r f; do [ -n "$f" ] && echo "V $(basename "$f")"; done
  else
    echo "  (none found)"
  fi
}

# Render a template: substitute the scope scalars + the four standard metadata keys.
# `|` is the sed delimiter, so no substituted value may contain one -- all of them are
# globs, titles and versions produced here, never user prose.
# Empty paths: removes the `paths:` line entirely (for main files).
render_template() {
  local tpl="$1" out="$2" title="$3" paths="$4" desc="$5"
  # The ONE frontmatter difference between a main and a specialized file: empty paths deletes the
  # `paths:` line (repo-wide loading), a value substitutes it. Everything else is shared, so the
  # scalar list exists once -- a key added to one branch and forgotten in the other was the risk.
  local paths_expr='/^paths: {PATHS}$/d'
  [ -n "$paths" ] && paths_expr="s|{PATHS}|$paths|g"
  sed -e "$paths_expr" \
      -e "s|{TITLE}|$title|g" \
      -e "s|{DESCRIPTION}|$desc|g" \
      -e "s|{PLUGIN_VERSION}|$PLUGIN_VERSION|g" \
      -e "s|{GENERATED_BY}|$GENERATED_BY|g" \
      -e "s|{LAST_UPDATED}|$LAST_UPDATED|g" \
      "$tpl" > "$out"
}

# Create missing rules from templates
create_rules() {
  echo "=== Create Rules ==="
  validate_plugin

  mkdir -p .codex/rules

  if [ ! -f .codex/rules/avoid.md ]; then
    render_template "$PLUGIN_TEMPLATES/rules/avoid.md.template" .codex/rules/avoid.md \
      "Avoid" '' 'avoid - project-wide anti-patterns and the thing to do instead; one table row per rule'
    echo "V Created: .codex/rules/avoid.md"
  else
    echo ">> Preserved: .codex/rules/avoid.md (exists)"
  fi

  if [ ! -f .codex/rules/best-practice.md ]; then
    render_template "$PLUGIN_TEMPLATES/rules/best-practice.md.template" .codex/rules/best-practice.md \
      "Best Practices" '' 'best-practice - project-wide practices worth repeating; one table row per rule'
    echo "V Created: .codex/rules/best-practice.md"
  else
    echo ">> Preserved: .codex/rules/best-practice.md (exists)"
  fi
}

# Validate ONE rule file: frontmatter, the four standard metadata keys, table header.
# $2 = "specialized" -> require paths, reject repo-wide paths. Main files must NOT have paths.
validate_file() {
  local f="$1" kind="${2:-main}"
  local name errs=0 k
  name=$(basename "$f")

  head -1 "$f" | grep -q '^---$' || { echo "X $name no YAML frontmatter (line 1 must be ---)"; errs=$((errs+1)); }

  for k in description doc_type version generated_by last_updated; do
    grep -q "^${k}:" "$f" || { echo "X $name missing frontmatter key: $k"; errs=$((errs+1)); }
  done

  if [ "$kind" = "main" ]; then
    grep -q "^paths:" "$f" && { echo "X $name is main but has paths -> remove paths for repo-wide loading"; errs=$((errs+1)); }
  else
    grep -q "^paths:" "$f" || { echo "X $name is specialized but missing paths"; errs=$((errs+1)); }
    grep -q '"\*\*/\*"' "$f" && { echo "X $name is specialized but claims repo-wide paths -> it loads into every request"; errs=$((errs+1)); }
  fi

  grep -q '^doc_type: llm$' "$f" || { echo "X $name doc_type must be exactly 'llm'"; errs=$((errs+1)); }
  grep -Eq '^version: "[0-9]+\.[0-9]+\.[0-9]+"$' "$f" || { echo "X $name version must be a quoted X.Y.Z"; errs=$((errs+1)); }
  grep -Eq '^last_updated: "[0-9]{4}-[0-9]{2}-[0-9]{2}"$' "$f" || { echo "X $name last_updated must be a quoted YYYY-MM-DD"; errs=$((errs+1)); }

  grep -q "^| #" "$f" || { echo "X $name invalid structure (missing table header)"; errs=$((errs+1)); }

  [ "$errs" -eq 0 ] && echo "V $name valid (frontmatter + metadata + table)"
  ERRORS=$((ERRORS + errs))
}

# Validate frontmatter + table structure (main + specialized)
validate_rules() {
  echo "=== Validate Rules Structure ==="
  ERRORS=0

  # Validate main files
  if [ -f .codex/rules/avoid.md ]; then
    validate_file .codex/rules/avoid.md main
  else
    echo "X avoid.md not found"
    ERRORS=$((ERRORS+1))
  fi

  if [ -f .codex/rules/best-practice.md ]; then
    validate_file .codex/rules/best-practice.md main
  else
    echo "X best-practice.md not found"
    ERRORS=$((ERRORS+1))
  fi

  # Validate specialized files
  for f in .codex/rules/*-avoid.md .codex/rules/*-best-practice.md; do
    [ -f "$f" ] || continue
    # Skip main files
    [ "$(basename "$f")" = "avoid.md" ] && continue
    [ "$(basename "$f")" = "best-practice.md" ] && continue

    validate_file "$f" specialized
  done

  exit $ERRORS
}

# List all rule files
list_rules() {
  echo "=== Rule Files in .codex/rules/ ==="
  mkdir -p .codex/rules

  echo "--- Avoid Files ---"
  local avoid_count=0
  for f in .codex/rules/avoid.md .codex/rules/*-avoid.md; do
    if [ -f "$f" ]; then
      rows=$(grep -c "^|" "$f" 2>/dev/null || true); rows=${rows:-0}
      rows=$((rows - 2))  # Subtract header and separator
      [ $rows -lt 0 ] && rows=0
      echo "  $(basename "$f") ($rows entries)"
      avoid_count=$((avoid_count + 1))
    fi
  done
  [ $avoid_count -eq 0 ] && echo "  (none found)"

  echo "--- Best Practice Files ---"
  local bp_count=0
  for f in .codex/rules/best-practice.md .codex/rules/*-best-practice.md; do
    if [ -f "$f" ]; then
      rows=$(grep -c "^|" "$f" 2>/dev/null || true); rows=${rows:-0}
      rows=$((rows - 2))  # Subtract header and separator
      [ $rows -lt 0 ] && rows=0
      echo "  $(basename "$f") ($rows entries)"
      bp_count=$((bp_count + 1))
    fi
  done
  [ $bp_count -eq 0 ] && echo "  (none found)"

  echo "---"
  echo "Total: $((avoid_count + bp_count)) rule files"
}

# Uppercase the first character. `${var^}` is bash 4; macOS /bin/bash is 3.2.
capitalize() {
  local s="$1"
  [ -z "$s" ] && return 0
  printf '%s%s' "$(printf '%s' "${s%"${s#?}"}" | tr '[:lower:]' '[:upper:]')" "${s#?}"
}

# A specialized rule file applies to ONE slice of the repo, so it must never ship the
# repo-wide `["**/*"]` -- that is what made every specialized rule load into every request.
# Known prefixes get a curated glob set; anything else gets a prefix-derived guess that the
# caller is told to confirm. An explicit `paths` argument always wins.
default_paths_for_prefix() {
  case "$1" in
    test|tests|unit) printf '["**/test/**", "**/tests/**", "**/*_test.*", "**/*.test.*", "**/*Test.*"]' ;;
    e2e|it|integration) printf '["**/e2e/**", "**/it/**", "**/*E2E*", "**/*e2e*"]' ;;
    doc|docs) printf '["**/*.md", "**/*.mdx", "docs/**"]' ;;
    ci|cd|cicd) printf '[".github/**", "**/*.yml", "**/*.yaml"]' ;;
    sql|db|database) printf '["**/*.sql", "**/migration*/**", "**/migrations/**"]' ;;
    api) printf '["**/api/**", "**/openapi/**", "**/*.openapi.*"]' ;;
    ui|front|frontend|web) printf '["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.css"]' ;;
    infra|docker|k8s|deploy) printf '["**/Dockerfile*", "**/docker-compose*.yml", "**/docker-compose*.yaml", "**/*.tf", "k8s/**"]' ;;
    *) printf '["**/%s/**", "**/*%s*"]' "$1" "$1" ;;
  esac
}

# Create specialized rules from template with prefix
create_specialized() {
  local prefix="$1"
  local paths="${2:-}"
  if [ -z "$prefix" ]; then
    echo "X Missing prefix argument"
    echo "Usage: rules.sh create-specialized <prefix> [paths]"
    echo "Example: rules.sh create-specialized test"
    echo "Example: rules.sh create-specialized payment '[\"src/payment/**\"]'"
    exit 1
  fi

  if ! printf '%s' "$prefix" | grep -Eq '^[a-z0-9][a-z0-9-]*$'; then
    echo "X Invalid prefix: '$prefix' (must be lowercase alphanumeric + hyphens, start with alphanumeric)"
    exit 1
  fi

  echo "=== Create Specialized Rules: $prefix ==="
  validate_plugin
  mkdir -p .codex/rules

  local avoid_file=".codex/rules/${prefix}-avoid.md"
  local bp_file=".codex/rules/${prefix}-best-practice.md"
  local cap
  cap=$(capitalize "$prefix")

  if [ -z "$paths" ]; then
    paths=$(default_paths_for_prefix "$prefix")
    echo "! paths not supplied -> derived $paths"
    echo "  Confirm it with the user and narrow it by hand if it does not match this repo's layout."
  fi
  case "$paths" in
    *'"**/*"'*)
      echo "X Refusing repo-wide paths for a specialized rule: $paths"
      echo "  A ${prefix}-* rule that matches everything loads into every request. Pass a narrower glob."
      exit 1
      ;;
  esac

  if [ ! -f "$avoid_file" ]; then
    render_template "$PLUGIN_TEMPLATES/rules/avoid.md.template" "$avoid_file" \
      "${cap} Avoid" "$paths" "${prefix}-avoid - ${prefix} anti-patterns and the thing to do instead; one table row per rule"
    echo "V Created: $avoid_file"
  else
    echo ">> Preserved: $avoid_file (exists)"
  fi

  if [ ! -f "$bp_file" ]; then
    render_template "$PLUGIN_TEMPLATES/rules/best-practice.md.template" "$bp_file" \
      "${cap} Best Practices" "$paths" "${prefix}-best-practice - ${prefix} practices worth repeating; one table row per rule"
    echo "V Created: $bp_file"
  else
    echo ">> Preserved: $bp_file (exists)"
  fi
}

# Main dispatch
case "$MODE" in
  read)
    read_knowledge "$ARG"
    ;;
  check)
    check_rules
    ;;
  create)
    create_rules
    ;;
  create-specialized)
    create_specialized "$ARG" "$ARG2"
    ;;
  list)
    list_rules
    ;;
  validate)
    validate_rules
    ;;
  *)
    echo "Usage: rules.sh <mode> [options]"
    echo ""
    echo "Modes:"
    echo "  read <path>           - Read knowledge file (first 100 lines)"
    echo "  check                 - Check existing rules files (main + specialized)"
    echo "  create                - Create missing main rules from templates"
    echo "  create-specialized <prefix> [paths] - Create specialized rules (e.g., test-avoid.md);"
    echo "                          paths is a YAML flow list, e.g. '[\"src/payment/**\"]'"
    echo "  list                  - List all rule files"
    echo "  validate              - Validate frontmatter (standard metadata keys) + table structure"
    exit 1
    ;;
esac
