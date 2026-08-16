#!/bin/bash
set -euo pipefail
# Discover GitHub Actions workflows
# No args needed — works from project root
# Output: structured key=value pairs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-common.sh
. "$SCRIPT_DIR/lib/deploy-common.sh"

echo "=== Workflow Discovery ==="
echo "WATCHDOG=$(ght_backend)"

# Count local workflow files
WORKFLOW_DIR=".github/workflows"
if [[ -d "$WORKFLOW_DIR" ]]; then
    WORKFLOW_FILES=()
    while IFS= read -r -d '' f; do
        WORKFLOW_FILES+=("$f")
    done < <(find "$WORKFLOW_DIR" -maxdepth 1 \( -name '*.yml' -o -name '*.yaml' \) -print0 2>/dev/null || true)
    echo "WORKFLOW_COUNT=${#WORKFLOW_FILES[@]}"
else
    echo "WORKFLOW_COUNT=0"
    echo "WORKFLOW_DIR=missing"
    exit 0
fi

# Enumerate each workflow file
# bash 3.2 (macOS) raises "unbound variable" on "${arr[@]}" of an empty array under set -u.
echo "=== Workflows ==="
IDX=0
if [[ ${#WORKFLOW_FILES[@]} -gt 0 ]]; then
for wf_file in "${WORKFLOW_FILES[@]}"; do
    IDX=$((IDX + 1))
    BASENAME=$(basename "$wf_file")
    # Extract name from YAML
    WF_NAME=$(grep -m1 '^name:' "$wf_file" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '"'"'" || echo "$BASENAME")
    # Extract triggers
    WF_TRIGGER=$(grep -A5 '^on:' "$wf_file" 2>/dev/null | grep -oE '(push|pull_request|workflow_dispatch|workflow_run|schedule|release)' | sort -u | tr '\n' ',' | sed 's/,$//' || echo "unknown")

    echo "WF_${IDX}_NAME=$WF_NAME"
    echo "WF_${IDX}_FILE=$BASENAME"
    echo "WF_${IDX}_TRIGGER=$WF_TRIGGER"
done
fi

# Get workflow status from GitHub API.
# One bounded call, not a probe plus a real call: the probe doubled the cost and
# its exit code was thrown away. ght_reason keeps "gh is missing" separate from
# "the API said no" -- collapsing them was the whole BT-F30 misreport.
echo "=== Workflow Status ==="
WF_RC=0
WF_JSON=$(ght 30 gh workflow list --json name,state 2>/dev/null) || WF_RC=$?
if [[ "$WF_RC" -eq 0 && -n "$WF_JSON" ]]; then
    printf '%s' "$WF_JSON" | jq -r '.[] | "WF_STATUS_\(.name | gsub("[^a-zA-Z0-9]"; "_"))=\(.state)"' 2>/dev/null || echo "WF_STATUS=api_error"
else
    echo "WF_STATUS=$(ght_reason "$WF_RC")"
fi

# Get recent runs
echo "=== Recent Runs ==="
RUNS_RC=0
RUNS_JSON=$(ght 30 gh run list -L 5 --json workflowName,status,conclusion,createdAt,headBranch 2>/dev/null) || RUNS_RC=$?
if [[ "$RUNS_RC" -eq 0 && -n "$RUNS_JSON" ]]; then
    printf '%s' "$RUNS_JSON" | jq -r '.[] | "RUN: \(.workflowName) | \(.status)/\(.conclusion // "pending") | \(.headBranch) | \(.createdAt)"' 2>/dev/null || echo "RUNS=api_error"
else
    echo "RUNS=$(ght_reason "$RUNS_RC")"
fi

echo "=== Discovery Complete ==="
