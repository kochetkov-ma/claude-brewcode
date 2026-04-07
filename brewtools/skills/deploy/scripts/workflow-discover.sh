#!/bin/bash
set -euo pipefail
# Discover GitHub Actions workflows
# No args needed — works from project root
# Output: structured key=value pairs

echo "=== Workflow Discovery ==="

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
echo "=== Workflows ==="
IDX=0
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

# Get workflow status from GitHub API
echo "=== Workflow Status ==="
if timeout 30 gh workflow list &>/dev/null; then
    timeout 30 gh workflow list --json name,state 2>/dev/null | jq -r '.[] | "WF_STATUS_\(.name | gsub("[^a-zA-Z0-9]"; "_"))=\(.state)"' 2>/dev/null || echo "WF_STATUS=api_error"
else
    echo "WF_STATUS=api_unavailable"
fi

# Get recent runs
echo "=== Recent Runs ==="
if timeout 30 gh run list -L 5 &>/dev/null; then
    timeout 30 gh run list -L 5 --json workflowName,status,conclusion,createdAt,headBranch 2>/dev/null | jq -r '.[] | "RUN: \(.workflowName) | \(.status)/\(.conclusion // "pending") | \(.headBranch) | \(.createdAt)"' 2>/dev/null || echo "RUNS=api_error"
else
    echo "RUNS=api_unavailable"
fi

echo "=== Discovery Complete ==="
