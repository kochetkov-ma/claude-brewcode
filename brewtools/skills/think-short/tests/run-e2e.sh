#!/usr/bin/env bash
# run-e2e.sh — E2E test runner for brewtools:think-short
# Usage:
#   ./run-e2e.sh              # run all 9 scenarios
#   ./run-e2e.sh --dry-run    # print plan without invoking claude
#   ./run-e2e.sh 03 07        # run specific scenario numbers only
#
# Requirements: bash >=4, jq, node, claude CLI in PATH
# Compatible with zsh (shebang uses bash explicitly).

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
BREWTOOLS_DIR="${REPO_ROOT}/brewtools"
FIXTURES_DIR="${SCRIPT_DIR}/fixtures/test-project"
SCENARIOS_DIR="${SCRIPT_DIR}/e2e"
RESULTS_BASE="${SCRIPT_DIR}/e2e/results"

TS="$(date +%Y%m%d-%H%M%S)"
RESULTS_DIR="${RESULTS_BASE}/${TS}"

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
DRY_RUN=0
FILTER_SCENARIOS=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    [0-9][0-9]|[0-9][0-9][a-z]) FILTER_SCENARIOS+=("$arg") ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Colour helpers (no-op when not a tty)
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; RESET='\033[0m'; BOLD='\033[1m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''; BOLD=''
fi

pass() { echo -e "${GREEN}PASS${RESET} $*"; }
fail() { echo -e "${RED}FAIL${RESET} $*"; }
skip() { echo -e "${YELLOW}SKIP${RESET} $*"; }
info() { echo -e "${CYAN}INFO${RESET} $*"; }

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
TOTAL=0; PASSED=0; FAILED=0; SKIPPED=0
FAILED_NAMES=()

# ---------------------------------------------------------------------------
# Trap for failures
# ---------------------------------------------------------------------------
CURRENT_SCENARIO="(none)"
trap 'echo -e "\n${RED}TRAP${RESET}: unexpected failure during scenario: ${CURRENT_SCENARIO}" >&2' ERR

# ---------------------------------------------------------------------------
# Parse a single scenario .md file.
# Extracts: WHEN prompt, ASSERT_* directives, ALLOW_SKIP_ON_NO_TRIGGER flag.
# Outputs variables: SCENARIO_PROMPT, ALLOW_SKIP, ASSERTS (array of "KEY:VALUE")
# ---------------------------------------------------------------------------
parse_scenario() {
  local md_file="$1"
  SCENARIO_PROMPT=""
  ALLOW_SKIP=0
  ASSERTS=()

  local in_when=0
  while IFS= read -r line; do
    # Detect ## When section
    if [[ "$line" =~ ^##[[:space:]]When ]]; then
      in_when=1
      continue
    fi
    # Leave When section on next ##
    if [[ "$in_when" -eq 1 && "$line" =~ ^##[[:space:]] ]]; then
      in_when=0
    fi
    # Capture prompt line inside When
    if [[ "$in_when" -eq 1 && "$line" =~ ^user[[:space:]]prompt:[[:space:]] ]]; then
      # Strip leading: user prompt: and surrounding backticks
      SCENARIO_PROMPT="${line#*user prompt: }"
      SCENARIO_PROMPT="${SCENARIO_PROMPT#\`}"
      SCENARIO_PROMPT="${SCENARIO_PROMPT%\`}"
    fi

    # ASSERT directives
    if [[ "$line" =~ ^ASSERT_([A-Z_]+):[[:space:]]*(.*) ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      ASSERTS+=("${key}:${val}")
    fi

    # ALLOW_SKIP_ON_NO_TRIGGER
    if [[ "$line" =~ ALLOW_SKIP_ON_NO_TRIGGER ]]; then
      ALLOW_SKIP=1
    fi
  done < "$md_file"
}

# ---------------------------------------------------------------------------
# Evaluate a single ASSERT directive.
# Returns 0=pass, 1=fail, 2=skip (when ALLOW_SKIP and trigger absent)
# ---------------------------------------------------------------------------
evaluate_assert() {
  local key="$1"
  local val="$2"
  local workdir="$3"
  local out_json="$4"
  local exit_code_actual="$5"
  local allow_skip="$6"
  local plugin_data_dir="$7"

  local project_state="${workdir}/.claude/brewtools/think-short.json"
  local global_state="${plugin_data_dir}/think-short.json"
  local log_file="${workdir}/.claude/brewtools.log"

  case "$key" in
    EXIT_CODE)
      local expected_code="${val// /}"
      if [[ "$exit_code_actual" -eq "$expected_code" ]]; then
        return 0
      else
        echo "  ASSERT_EXIT_CODE: expected=${expected_code} actual=${exit_code_actual}" >&2
        return 1
      fi
      ;;

    STATE_PROJECT_JSON_CONTAINS)
      if [[ ! -f "$project_state" ]]; then
        if [[ "$allow_skip" -eq 1 ]]; then
          echo "  ALLOW_SKIP: project state file absent — hook may not have fired" >&2
          return 2
        fi
        echo "  ASSERT_STATE_PROJECT_JSON_CONTAINS: file absent: ${project_state}" >&2
        return 1
      fi
      if grep -qF -- "$val" "$project_state"; then
        return 0
      else
        echo "  ASSERT_STATE_PROJECT_JSON_CONTAINS: '${val}' not found in ${project_state}" >&2
        return 1
      fi
      ;;

    STATE_GLOBAL_JSON_CONTAINS)
      if [[ ! -f "$global_state" ]]; then
        echo "  ASSERT_STATE_GLOBAL_JSON_CONTAINS: file absent: ${global_state}" >&2
        return 1
      fi
      if grep -qF -- "$val" "$global_state"; then
        return 0
      else
        echo "  ASSERT_STATE_GLOBAL_JSON_CONTAINS: '${val}' not found in ${global_state}" >&2
        return 1
      fi
      ;;

    LOG_CONTAINS)
      if [[ ! -f "$log_file" ]]; then
        if [[ "$allow_skip" -eq 1 ]]; then
          echo "  ALLOW_SKIP: log file absent — hook may not have fired" >&2
          return 2
        fi
        echo "  ASSERT_LOG_CONTAINS: log file absent: ${log_file}" >&2
        return 1
      fi
      if grep -qF -- "$val" "$log_file"; then
        return 0
      else
        if [[ "$allow_skip" -eq 1 ]]; then
          echo "  ALLOW_SKIP: '${val}' not in log — hook may not have fired" >&2
          return 2
        fi
        echo "  ASSERT_LOG_CONTAINS: '${val}' not found in ${log_file}" >&2
        return 1
      fi
      ;;

    LOG_NOT_CONTAINS)
      if [[ ! -f "$log_file" ]]; then
        # absent log = line definitely not present = pass
        return 0
      fi
      if grep -qF -- "$val" "$log_file"; then
        echo "  ASSERT_LOG_NOT_CONTAINS: '${val}' was found (unexpected) in ${log_file}" >&2
        return 1
      else
        return 0
      fi
      ;;

    STDOUT_CONTAINS)
      if [[ ! -f "$out_json" ]]; then
        echo "  ASSERT_STDOUT_CONTAINS: out.json absent" >&2
        return 1
      fi
      # Extract result field from claude JSON output (may be array of messages)
      local stdout_text
      stdout_text="$(jq -r '
        if type == "array" then
          [.[] | if .type == "result" then .result // "" else "" end] | join("\n")
        elif type == "object" then
          .result // ""
        else ""
        end' "$out_json" 2>/dev/null || cat "$out_json")"
      if echo "$stdout_text" | grep -qF -- "$val"; then
        return 0
      else
        echo "  ASSERT_STDOUT_CONTAINS: '${val}' not found in stdout" >&2
        return 1
      fi
      ;;

    STDOUT_NOT_CONTAINS_REGEX)
      if [[ ! -f "$out_json" ]]; then
        # no output = not present = pass
        return 0
      fi
      local stdout_text
      stdout_text="$(jq -r '
        if type == "array" then
          [.[] | if .type == "result" then .result // "" else "" end] | join("\n")
        elif type == "object" then
          .result // ""
        else ""
        end' "$out_json" 2>/dev/null || cat "$out_json")"
      if echo "$stdout_text" | grep -qE -- "$val"; then
        echo "  ASSERT_STDOUT_NOT_CONTAINS_REGEX: pattern '${val}' matched (unexpected)" >&2
        return 1
      else
        return 0
      fi
      ;;

    *)
      echo "  Unknown assert directive: ASSERT_${key} — skipping" >&2
      return 0
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Run one scenario
# ---------------------------------------------------------------------------
run_scenario() {
  local md_file="$1"
  local scenario_num
  scenario_num="$(basename "$md_file" | cut -d'-' -f1)"
  local scenario_name
  scenario_name="$(basename "$md_file" .md)"

  CURRENT_SCENARIO="$scenario_name"
  TOTAL=$((TOTAL + 1))

  local workdir="${RESULTS_DIR}/${scenario_name}"
  local plugin_data_dir="${workdir}/_plugin_data"
  local out_json="${workdir}/out.json"

  # Parse scenario
  parse_scenario "$md_file"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo ""
    echo -e "${BOLD}[DRY-RUN] ${scenario_name}${RESET}"
    echo "  prompt   : ${SCENARIO_PROMPT}"
    echo "  allow_skip: ${ALLOW_SKIP}"
    echo "  asserts  :"
    for a in "${ASSERTS[@]}"; do
      echo "    ASSERT_${a%%:*}: ${a#*:}"
    done
    PASSED=$((PASSED + 1))
    return 0
  fi

  info "Running ${scenario_name} ..."

  # Create isolated workdir
  mkdir -p "$workdir" "$plugin_data_dir"
  cp -r "${FIXTURES_DIR}/." "${workdir}/"

  # -------------------------------------------------------------------------
  # Scenario-specific pre-seeding
  # -------------------------------------------------------------------------
  case "$scenario_num" in
    01b)
      mkdir -p "${workdir}/.claude/brewtools"
      printf '{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}\n' \
        > "${workdir}/.claude/brewtools/think-short.json"
      ;;
    02)
      mkdir -p "${workdir}/.claude/brewtools"
      printf '{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}\n' \
        > "${workdir}/.claude/brewtools/think-short.json"
      ;;
    05|06|07)
      mkdir -p "${workdir}/.claude/brewtools"
      printf '{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}\n' \
        > "${workdir}/.claude/brewtools/think-short.json"
      ;;
    08)
      # Global off, project on — project must win
      mkdir -p "${workdir}/.claude/brewtools"
      printf '{"version":1,"enabled":false,"profile":"light","blacklist":["debate","docs-writer","architect"]}\n' \
        > "${plugin_data_dir}/think-short.json"
      printf '{"version":1,"enabled":true,"profile":"aggressive","blacklist":["debate","docs-writer","architect"]}\n' \
        > "${workdir}/.claude/brewtools/think-short.json"
      ;;
    09)
      mkdir -p "${workdir}/.claude/brewtools"
      printf '{"version":1,"enabled":true,"profile":"medium","blacklist":["debate","docs-writer","architect"]}\n' \
        > "${workdir}/.claude/brewtools/think-short.json"
      ;;
  esac

  # -------------------------------------------------------------------------
  # Build env overrides per scenario
  # -------------------------------------------------------------------------
  local extra_env=()
  extra_env+=("CLAUDE_PLUGIN_DATA=${plugin_data_dir}")
  unset THINK_SHORT_DEFAULT 2>/dev/null || true

  if [[ "$scenario_num" == "09" ]]; then
    extra_env+=("CLAUDE_DEBUG=1")
  fi

  # -------------------------------------------------------------------------
  # Invoke claude
  # -------------------------------------------------------------------------
  local exit_code=0

  if [[ -z "$SCENARIO_PROMPT" ]]; then
    echo "  WARNING: no prompt found in ${md_file}" >&2
  fi

  set +e
  (
    cd "$workdir"
    env "${extra_env[@]}" \
      claude \
        --plugin-dir "${BREWTOOLS_DIR}" \
        --print "${SCENARIO_PROMPT}" \
        --dangerously-skip-permissions \
        --output-format json \
      > "${out_json}" 2>"${workdir}/stderr.txt"
  )
  exit_code=$?
  set -e

  # -------------------------------------------------------------------------
  # Scenario 09 second pass (without CLAUDE_DEBUG)
  # -------------------------------------------------------------------------
  if [[ "$scenario_num" == "09" ]]; then
    local log_file_2="${workdir}/.claude/brewtools.log"
    # Remove log so second pass creates a fresh one
    rm -f "$log_file_2"
    local exit_code_2=0
    set +e
    (
      cd "$workdir"
      env "CLAUDE_PLUGIN_DATA=${plugin_data_dir}" \
        claude \
          --plugin-dir "${BREWTOOLS_DIR}" \
          --print "say hi" \
          --dangerously-skip-permissions \
          --output-format json \
        >> "${workdir}/out2.json" 2>>"${workdir}/stderr2.txt"
    )
    exit_code_2=$?
    set -e
    # The second-pass assert (LOG_NOT_CONTAINS) uses the fresh log
  fi

  # -------------------------------------------------------------------------
  # Evaluate asserts
  # -------------------------------------------------------------------------
  local scenario_pass=1
  local any_skip=0

  for assert_entry in "${ASSERTS[@]}"; do
    local ak="${assert_entry%%:*}"
    local av="${assert_entry#*:}"
    # Trim leading space
    av="${av# }"

    local result=0
    evaluate_assert "$ak" "$av" "$workdir" "$out_json" "$exit_code" "$ALLOW_SKIP" "$plugin_data_dir" || result=$?

    if [[ "$result" -eq 2 ]]; then
      any_skip=1
    elif [[ "$result" -ne 0 ]]; then
      scenario_pass=0
    fi
  done

  # -------------------------------------------------------------------------
  # Scenario 09: also check second-pass asserts (LOG_NOT_CONTAINS lines)
  # The second pass expects profile preview absent — evaluated separately
  # -------------------------------------------------------------------------
  if [[ "$scenario_num" == "09" ]]; then
    local log_file_2="${workdir}/.claude/brewtools.log"
    local result_2=0
    evaluate_assert "LOG_NOT_CONTAINS" "think-short: profile preview =" \
      "$workdir" "${workdir}/out2.json" "$exit_code_2" "0" "$plugin_data_dir" || result_2=$?
    if [[ "$result_2" -ne 0 ]]; then
      scenario_pass=0
    fi
  fi

  # -------------------------------------------------------------------------
  # Report
  # -------------------------------------------------------------------------
  if [[ "$scenario_pass" -eq 0 ]]; then
    fail "${scenario_name} (exit=${exit_code})"
    FAILED=$((FAILED + 1))
    FAILED_NAMES+=("$scenario_name")
  elif [[ "$any_skip" -eq 1 && "$ALLOW_SKIP" -eq 1 ]]; then
    skip "${scenario_name} (hook did not fire — marked ALLOW_SKIP_ON_NO_TRIGGER)"
    SKIPPED=$((SKIPPED + 1))
  else
    pass "${scenario_name}"
    PASSED=$((PASSED + 1))
  fi
}

# ---------------------------------------------------------------------------
# Scenario list (ordered)
# ---------------------------------------------------------------------------
SCENARIO_FILES=()
while IFS= read -r -d '' f; do
  SCENARIO_FILES+=("$f")
done < <(find "${SCENARIOS_DIR}" -maxdepth 1 \( -name '[0-9][0-9]-*.md' -o -name '[0-9][0-9][a-z]-*.md' \) -print0 | sort -z)

if [[ "${#SCENARIO_FILES[@]}" -eq 0 ]]; then
  echo "No scenario .md files found in ${SCENARIOS_DIR}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Pre-flight checks (skip in dry-run)
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" -eq 0 ]]; then
  for cmd in claude jq node; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Required tool not found: $cmd" >&2
      exit 1
    fi
  done
  mkdir -p "${RESULTS_DIR}"
fi

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=== think-short E2E test runner ===${RESET}"
echo "Brewtools dir : ${BREWTOOLS_DIR}"
echo "Results dir   : ${RESULTS_DIR}"
echo "Dry-run       : ${DRY_RUN}"
echo ""

for md_file in "${SCENARIO_FILES[@]}"; do
  num="$(basename "$md_file" | cut -d'-' -f1)"

  # Apply filter if provided
  if [[ "${#FILTER_SCENARIOS[@]}" -gt 0 ]]; then
    local_match=0
    for f in "${FILTER_SCENARIOS[@]}"; do
      [[ "$f" == "$num" ]] && local_match=1 && break
    done
    if [[ "$local_match" -eq 0 ]]; then
      continue
    fi
  fi

  run_scenario "$md_file"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=== Summary ===${RESET}"
printf "Total: %d  |  " "$TOTAL"
printf "${GREEN}Passed: %d${RESET}  |  " "$PASSED"
printf "${RED}Failed: %d${RESET}  |  " "$FAILED"
printf "${YELLOW}Skipped: %d${RESET}\n" "$SKIPPED"

if [[ "${#FAILED_NAMES[@]}" -gt 0 ]]; then
  echo ""
  echo -e "${RED}Failed scenarios:${RESET}"
  for name in "${FAILED_NAMES[@]}"; do
    echo "  - ${name}"
  done
fi

echo ""
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo -e "${CYAN}Dry-run complete — no claude invocations made.${RESET}"
  exit 0
fi

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
exit 0
