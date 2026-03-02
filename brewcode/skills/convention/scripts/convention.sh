#!/usr/bin/env sh
# Brewcode Convention Script — stack detection, scanning, setup, validation
# Usage: convention.sh <detect-stack|scan|setup|validate>
set -eu

usage() {
  echo "Usage: convention.sh <command>"
  echo ""
  echo "Commands:"
  echo "  detect-stack  Detect tech stack from build/config files"
  echo "  scan          Scan project directory structure"
  echo "  setup         Create .claude/convention/ directory"
  echo "  validate      Check if convention files exist"
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

  file_counts="" total_files=0
  counts_raw=$(find . -type f -not -path '*/\.*' -not -path '*/node_modules/*' \
    -not -path '*/target/*' -not -path '*/build/*' -not -path '*/__pycache__/*' \
    -not -path '*/dist/*' -not -path '*/vendor/*' 2>/dev/null \
    | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10)
  if [ -n "$counts_raw" ]; then
    while IFS= read -r line; do
      count=$(echo "$line" | awk '{print $1}')
      ext=$(echo "$line" | awk '{print $2}')
      case "$ext" in */*|"") continue ;; esac
      file_counts="${file_counts:+$file_counts,}\"$ext\":$count"
      total_files=$((total_files + count))
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

setup_convention() {
  mkdir -p .claude/convention
  printf '{"created":"%s","path":".claude/convention/"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

validate_convention() {
  errors=0 f1=false f2=false f3=false
  [ -f .claude/convention/reference-patterns.md ] && f1=true || errors=$((errors + 1))
  [ -f .claude/convention/testing-conventions.md ] && f2=true || errors=$((errors + 1))
  [ -f .claude/convention/project-architecture.md ] && f3=true || errors=$((errors + 1))
  valid=true; [ "$errors" -gt 0 ] && valid=false

  if [ "$valid" = "true" ]; then err "All convention files present"
  else err "Missing $errors convention file(s)"; fi

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
  *)            usage ;;
esac
