#!/usr/bin/env sh
# Brewcode Convention Setup — detection, generation metadata, lifecycle, validation
# Usage: convention.sh <detect-stack|scan|setup|validate|status|install|upgrade|enable|disable|uninstall|purge>
set -eu

# Self-location: scripts/ -> convention-setup/ -> skills/ -> PLUGIN_ROOT. Correct in the dev checkout
# AND in the installed cache, so the version is read from the manifest and never hardcoded.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN_JSON="$SCRIPT_DIR/../../../package/plugin.json"
[ -f "$PLUGIN_JSON" ] || PLUGIN_JSON="$SCRIPT_DIR/../../../.codex-plugin/plugin.json"
GENERATED_BY="brewcode:convention-setup"
RULE=".codex/rules/convention.md"

usage() {
  echo "Usage: convention.sh <command>"
  echo ""
  echo "Commands:"
  echo "  detect-stack  Detect tech stack from build/config files"
  echo "  scan          Scan project directory structure"
  echo "  setup         Create .codex/convention/ directory"
  echo "  validate      Check if convention files exist"
  echo "  status        Report generated documents and loading-rule state"
  echo "  install       Activate loading after document generation"
  echo "  upgrade       Refresh loading metadata, preserving disabled state"
  echo "  enable/disable Restore/park the convention loading rule"
  echo "  uninstall     Remove the loading rule, preserve documents and accepted rules"
  echo "  purge         Also remove owned generated documents; preserve accepted rules"
  exit 2
}

err() { echo "$*" >&2; }

HAS_JQ=false
command -v jq >/dev/null 2>&1 && HAS_JQ=true

is_skip_dir() {
  case "$1" in .*|node_modules|target|build|dist|vendor|__pycache__) return 0 ;; esac
  return 1
}

# Check if dir has a build file; prints stack name if found
has_build_file() {
  [ -f "$1/pom.xml" ] || [ -f "$1/build.gradle" ] || [ -f "$1/build.gradle.kts" ] || \
  [ -f "$1/package.json" ] || [ -f "$1/go.mod" ] || [ -f "$1/Cargo.toml" ] || \
  [ -f "$1/pyproject.toml" ] || [ -f "$1/mix.exs" ] || [ -f "$1/Gemfile" ] || \
  find "$1" -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) -print -quit 2>/dev/null | grep -q .
}

# Append stack if not already present: add_stack "java"
add_stack() {
  case ",$stacks," in *",$1,"*) return ;; esac
  stacks="${stacks:+$stacks,}$1"
}

detect_stack() {
  stacks="" build_file="" modules=""

  # Root-level detection (priority order)
  if [ -f pom.xml ]; then add_stack java; build_file="pom.xml"
  elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then
    add_stack java; build_file=$([ -f build.gradle.kts ] && echo "build.gradle.kts" || echo "build.gradle")
  fi
  if [ -f package.json ]; then
    if [ -f tsconfig.json ] || find . -maxdepth 2 -name '*.tsx' -print -quit 2>/dev/null | grep -q .; then
      add_stack typescript
    else add_stack javascript; fi
    [ -z "$build_file" ] && build_file="package.json"
  fi
  if [ -f pyproject.toml ] || [ -f setup.py ] || [ -f requirements.txt ]; then
    add_stack python
    if [ -z "$build_file" ]; then
      if [ -f pyproject.toml ]; then build_file="pyproject.toml"
      elif [ -f setup.py ]; then build_file="setup.py"
      else build_file="requirements.txt"; fi
    fi
  fi
  [ -f go.mod ] && { add_stack go; [ -z "$build_file" ] && build_file="go.mod"; }
  [ -f Cargo.toml ] && { add_stack rust; [ -z "$build_file" ] && build_file="Cargo.toml"; }
  if find . -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) -print -quit 2>/dev/null | grep -q .; then
    add_stack dotnet
    [ -z "$build_file" ] && build_file=$(find . -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) -print -quit 2>/dev/null | sed 's|^\./||')
  fi
  [ -f mix.exs ] && { add_stack elixir; [ -z "$build_file" ] && build_file="mix.exs"; }
  [ -f Gemfile ] && { add_stack ruby; [ -z "$build_file" ] && build_file="Gemfile"; }

  # One level deep: monorepo modules
  for d in */; do
    [ -d "$d" ] || continue
    d_name=$(echo "$d" | sed 's|/$||')
    is_skip_dir "$d_name" && continue
    has_build_file "$d_name" || continue
    modules="${modules:+$modules,}\"$d_name\""
    [ -f "$d/pom.xml" ] || [ -f "$d/build.gradle" ] || [ -f "$d/build.gradle.kts" ] && add_stack java
    if [ -f "$d/package.json" ]; then
      if [ -f "$d/tsconfig.json" ]; then add_stack typescript; else add_stack javascript; fi
    fi
    { [ -f "$d/pyproject.toml" ] || [ -f "$d/setup.py" ] || [ -f "$d/requirements.txt" ]; } && add_stack python
    [ -f "$d/go.mod" ] && add_stack go
    find "$d" -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) -print -quit 2>/dev/null | grep -q . && add_stack dotnet
  done

  primary=$(echo "$stacks" | cut -d',' -f1)
  if [ -z "$stacks" ]; then
    stacks_json=""
  else
    stacks_json=$(echo "$stacks" | sed 's/,/","/g')
    stacks_json="\"$stacks_json\""
  fi

  if $HAS_JQ; then
    printf '{"stacks":[%s],"primary":"%s","build_file":"%s","modules":[%s]}' \
      "$stacks_json" "$primary" "$build_file" "$modules" | jq -c .
  else
    printf '{"stacks":[%s],"primary":"%s","build_file":"%s","modules":[%s]}\n' \
      "$stacks_json" "$primary" "$build_file" "$modules"
  fi
}

scan_project() {
  src_dirs=""
  for d in src/main/java src/main/kotlin src/test/java src/test/kotlin \
           src/main/resources src/test/resources src lib app test tests cmd pkg internal api; do
    [ -d "$d" ] && src_dirs="${src_dirs:+$src_dirs,}\"$d\""
  done

  # One walk, two consumers: total_files counts the WHOLE stream, `head -10` truncates the
  # histogram only. Summing the truncated histogram undercounts every extension past the tenth
  # and can keep total_files under the scoped-mode threshold in a polyglot repo.
  file_counts="" total_files=0
  scan_list=$(mktemp -t convention-scan.XXXXXX)
  trap 'rm -f "$scan_list"' EXIT INT TERM
  find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' \
    -not -path '*/target/*' -not -path '*/build/*' -not -path '*/__pycache__/*' \
    -not -path '*/dist/*' -not -path '*/vendor/*' >"$scan_list" 2>/dev/null || true

  total_files=$(wc -l <"$scan_list" | tr -d '[:space:]')
  counts_raw=$(sed 's/.*\.//' "$scan_list" | sort | uniq -c | sort -rn | head -10)
  rm -f "$scan_list"
  trap - EXIT INT TERM

  if [ -n "$counts_raw" ]; then
    while IFS= read -r line; do
      count=$(echo "$line" | awk '{print $1}')
      ext=$(echo "$line" | awk '{print $2}')
      case "$ext" in */*|"") continue ;; esac
      file_counts="${file_counts:+$file_counts,}\"$ext\":$count"
    done <<EOF
$counts_raw
EOF
  fi

  mod_list=""
  for d in */; do
    [ -d "$d" ] || continue
    d_name=$(echo "$d" | sed 's|/$||')
    is_skip_dir "$d_name" && continue
    has_build_file "$d_name" && mod_list="${mod_list:+$mod_list,}\"$d_name\""
  done

  if $HAS_JQ; then
    printf '{"source_dirs":[%s],"file_counts":{%s},"modules":[%s],"total_files":%d}' \
      "$src_dirs" "$file_counts" "$mod_list" "$total_files" | jq .
  else
    printf '{"source_dirs":[%s],"file_counts":{%s},"modules":[%s],"total_files":%d}\n' \
      "$src_dirs" "$file_counts" "$mod_list" "$total_files"
  fi
}

plugin_version() {
  v=""
  if [ -f "$PLUGIN_JSON" ]; then
    if $HAS_JQ; then
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
  # the cache alike, so an unreadable one is a broken install - stop before anything is stamped.
  err "❌ cannot resolve the plugin version (X.Y.Z) from $PLUGIN_JSON - refusing to stamp an artifact with a fake version"
  return 1
}

# Creates the output dir AND hands back the artifact-metadata scalars P4 stamps into each of the
# three generated docs. The old `created` key was an ISO-8601 timestamp nothing ever persisted.
setup_convention() {
  _pv=$(plugin_version) || exit 1
  _cv=$(content_version) || exit 1
  mkdir -p .codex/convention
  printf '{"path":".codex/convention/","version":"%s","content_version":"%s","generated_by":"%s","last_updated":"%s"}\n' \
    "$_pv" "$_cv" "$GENERATED_BY" "$(date +%F)"
}

content_version() {
  _cv=$(sed -n 's/.*content_version=\([0-9][0-9.]*\).*/\1/p' "$SCRIPT_DIR/../SKILL.md" | head -1)
  [ -n "$_cv" ] || { err "Missing convention-setup content_version stamp"; return 1; }
  printf '%s' "$_cv"
}

owned_rule() {
  grep -q '^generated_by: "brewcode:convention-setup"$' "$1" || {
    err "Refusing to modify unowned loading rule: $1"; return 1;
  }
}

rule_path() {
  if [ -f "$RULE" ] && [ -f "$RULE.disabled" ]; then
    err "Both live and disabled loading rules exist; resolve the collision first"; return 1
  fi
  if [ -f "$RULE" ]; then printf '%s' "$RULE"
  elif [ -f "$RULE.disabled" ]; then printf '%s' "$RULE.disabled"
  fi
}

status_convention() {
  _rule=$(rule_path) || return 1
  _state=missing
  if [ -n "$_rule" ]; then
    owned_rule "$_rule" || return 1
    _state=partial
    if validate_convention >/dev/null 2>&1; then
      _state=installed
      _installed_cv=$(sed -n 's/^content_version: "\([0-9.]*\)"$/\1/p' "$_rule")
      [ "$_installed_cv" = "$(content_version)" ] || _state=stale
      for _doc in reference-patterns testing-conventions project-architecture; do
        _doc_cv=$(sed -n 's/^content_version: "\([0-9.]*\)"$/\1/p' ".codex/convention/$_doc.md")
        [ "$_doc_cv" = "$(content_version)" ] || _state=stale
      done
    fi
    [ "$_rule" != "$RULE.disabled" ] || _state=disabled
  elif [ -d .codex/convention ]; then _state=partial
  fi
  printf '{"state":"%s","rule":"%s"}\n' "$_state" "$_rule"
}

install_loading_rule() {
  validate_convention >/dev/null || return 1
  _rule=$(rule_path) || return 1
  _pv=$(plugin_version) || return 1
  _cv=$(content_version) || return 1
  if [ -n "$_rule" ]; then
    owned_rule "$_rule" || return 1
    # Refresh metadata without erasing local wording or re-enabling a disabled install.
    sed -i.bak -e "s/^version: .*/version: \"$_pv\"/" \
      -e "s/^content_version: .*/content_version: \"$_cv\"/" \
      -e "s/^last_updated: .*/last_updated: \"$(date +%F)\"/" "$_rule"
    rm -f "$_rule.bak"
  else
    mkdir -p .codex/rules
    cat >"$RULE" <<EOF
---
doc_type: llm
version: "$_pv"
content_version: "$_cv"
generated_by: "$GENERATED_BY"
last_updated: "$(date +%F)"
---
# Project conventions

Before implementing or reviewing code, read the relevant document in \`.codex/convention/\`:
- \`reference-patterns.md\`: representative implementations and coding patterns.
- \`testing-conventions.md\`: testing and assertion patterns.
- \`project-architecture.md\`: architecture, dependencies, and project layout.
Follow these alongside project instructions and accepted rules; report conflicts before writing.
EOF
  fi
  status_convention
}

toggle_convention() {
  _rule=$(rule_path) || return 1
  [ -n "$_rule" ] || { err "No loading rule installed; run convention-setup install"; return 1; }
  owned_rule "$_rule" || return 1
  _target="$RULE"
  [ "$1" != disable ] || _target="$RULE.disabled"
  [ "$_rule" = "$_target" ] || mv "$_rule" "$_target"
  status_convention
}

remove_convention() {
  _rule=$(rule_path) || return 1
  if [ -n "$_rule" ]; then owned_rule "$_rule" || return 1; fi
  if [ "$1" = purge ]; then
    for _doc in reference-patterns testing-conventions project-architecture; do
      _file=".codex/convention/$_doc.md"
      [ -f "$_file" ] || continue
      # Legacy generated docs belong to the same mechanism; other documents stay user-owned.
      grep -q '^generated_by: "brewcode:convention\(-setup\)\?"$' "$_file" || {
        err "Refusing to purge unowned document: $_file"; return 1;
      }
    done
    for _doc in reference-patterns testing-conventions project-architecture; do
      rm -f ".codex/convention/$_doc.md"
    done
    rmdir .codex/convention 2>/dev/null || true
  fi
  [ -z "$_rule" ] || rm -f "$_rule"
  status_convention
}

# A convention doc counts as present only when it also carries the standard metadata: a doc with
# no stamp cannot be aged against the running plugin, which is the whole point of `rules` mode.
check_doc() {
  [ -f "$1" ] || return 1
  awk '
    NR == 1 { if ($0 != "---") exit 1; next }
    $0 == "---" {
      closed = 1
      if (type && version && content && owner && updated) exit 0
      exit 1
    }
    /^doc_type: llm$/ { type = 1 }
    /^version: "[0-9]+\.[0-9]+\.[0-9]+(\+codex\.[0-9]+)?"$/ { version = 1 }
    /^content_version: "[0-9]+\.[0-9]+\.[0-9]+"$/ { content = 1 }
    /^generated_by: "brewcode:convention-setup"$/ { owner = 1 }
    /^last_updated: "[0-9]+-[0-9]+-[0-9]+"$/ { updated = 1 }
    END { if (!(closed && type && version && content && owner && updated)) exit 1 }
  ' "$1" || { err "Invalid or legacy frontmatter in $1; regenerate with convention-setup upgrade"; return 1; }
  return 0
}

validate_convention() {
  errors=0 f1=false f2=false f3=false
  check_doc .codex/convention/reference-patterns.md && f1=true || errors=$((errors + 1))
  check_doc .codex/convention/testing-conventions.md && f2=true || errors=$((errors + 1))
  check_doc .codex/convention/project-architecture.md && f3=true || errors=$((errors + 1))
  valid=true; [ "$errors" -gt 0 ] && valid=false

  if [ "$valid" = "true" ]; then err "All convention files present and stamped"
  else err "$errors convention file(s) missing or unstamped"; fi

  if $HAS_JQ; then
    printf '{"valid":%s,"files":{"reference-patterns.md":%s,"testing-conventions.md":%s,"project-architecture.md":%s}}' \
      "$valid" "$f1" "$f2" "$f3" | jq .
  else
    printf '{"valid":%s,"files":{"reference-patterns.md":%s,"testing-conventions.md":%s,"project-architecture.md":%s}}\n' \
      "$valid" "$f1" "$f2" "$f3"
  fi
  return $errors
}

case "${1:-}" in
  detect-stack) detect_stack ;;
  scan)         scan_project ;;
  setup)        setup_convention ;;
  validate)     validate_convention || exit $? ;;
  status)       status_convention ;;
  install|upgrade) install_loading_rule ;;
  enable|disable) toggle_convention "$1" ;;
  uninstall|purge) remove_convention "$1" ;;
  *)            usage ;;
esac
