#!/bin/bash
set -euo pipefail
# Manage CLAUDE.local.md GitHub/Workflow entries
# Usage: deploy-local-ops.sh <subcommand> [args...]
# Subcommands: read-github, add-github, add-workflows, update-workflows, list
# IMPORTANT: Never touches SSH sections (## SSH Servers, ## Server:)

LOCAL_FILE="CLAUDE.local.md"
SUBCMD="${1:?Usage: deploy-local-ops.sh <read-github|add-github|add-workflows|update-workflows|list> [args...]}"
shift

# Initialize file if missing (preserve SSH sections if they exist)
init_file() {
    if [[ ! -f "$LOCAL_FILE" ]]; then
        cat > "$LOCAL_FILE" << 'HEREDOC'
# Local Configuration

> This file is gitignored. Do not commit.
HEREDOC
    fi
}

# Check if GitHub Config section exists
has_github_config() {
    grep -q "^## GitHub Config" "$LOCAL_FILE" 2>/dev/null
}

case "$SUBCMD" in
    read-github)
        if [[ ! -f "$LOCAL_FILE" ]] || ! has_github_config; then
            echo "GITHUB_CONFIG=missing"
            exit 0
        fi
        echo "GITHUB_CONFIG=exists"
        # Parse GitHub Config table
        IN_SECTION=false
        while IFS= read -r line; do
            if [[ "$line" == "## GitHub Config"* ]]; then
                IN_SECTION=true
                continue
            fi
            if [[ "$IN_SECTION" == true ]] && [[ "$line" == "## "* ]]; then
                break
            fi
            if [[ "$IN_SECTION" == true ]] && [[ "$line" == "| "* ]] && [[ "$line" != "| Property"* ]] && [[ "$line" != "|---"* ]]; then
                PROP=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')
                VAL=$(echo "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3}')
                echo "${PROP}=${VAL}"
            fi
        done < "$LOCAL_FILE"
        ;;

    add-github)
        OWNER="${1:?add-github requires: owner repo [registry]}"
        REPO="${2:?add-github requires: repo}"
        REGISTRY="${3:-ghcr.io}"

        init_file

        if has_github_config; then
            echo "ERROR: GitHub Config already exists. Use update-workflows to modify."
            exit 1
        fi

        cat >> "$LOCAL_FILE" << HEREDOC

## GitHub Config

| Property | Value |
|----------|-------|
| Owner | $OWNER |
| Auth | gh CLI (token) |
| Registry | $REGISTRY |
| Default repo | $REPO |
HEREDOC
        echo "ADDED=github-config"
        ;;

    add-workflows)
        REPO="${1:-}"

        if [[ ! -f "$LOCAL_FILE" ]]; then
            echo "ERROR: $LOCAL_FILE not found. Run add-github first."
            exit 1
        fi

        # Auto-detect repo name if not provided
        if [[ -z "$REPO" ]]; then
            REPO=$(gh repo view --json name --jq '.name' 2>/dev/null || basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")
        fi

        SECTION_HEADER="## Workflows: $REPO"

        # Remove existing workflows section if present (preserve everything else)
        if grep -q "^$SECTION_HEADER" "$LOCAL_FILE" 2>/dev/null; then
            TMPF=$(mktemp)
            IN_SECTION=false
            while IFS= read -r line; do
                if [[ "$line" == "$SECTION_HEADER" ]]; then
                    IN_SECTION=true
                    continue
                fi
                if [[ "$IN_SECTION" == true ]] && [[ "$line" == "## "* ]]; then
                    IN_SECTION=false
                fi
                if [[ "$IN_SECTION" == false ]]; then
                    echo "$line" >> "$TMPF"
                fi
            done < "$LOCAL_FILE"
            mv "$TMPF" "$LOCAL_FILE"
        fi

        # Build workflows table
        TABLE="$SECTION_HEADER

| Name | File | Trigger | Status | Last Run |
|------|------|---------|--------|----------|"

        WORKFLOW_DIR=".github/workflows"
        if [[ -d "$WORKFLOW_DIR" ]]; then
            for wf_file in "$WORKFLOW_DIR"/*.yml "$WORKFLOW_DIR"/*.yaml; do
                [[ -f "$wf_file" ]] || continue
                BASENAME=$(basename "$wf_file")
                WF_NAME=$(grep -m1 '^name:' "$wf_file" 2>/dev/null | sed 's/^name:[[:space:]]*//' | tr -d '"'"'" || echo "$BASENAME")
                WF_TRIGGER=$(grep -A5 '^on:' "$wf_file" 2>/dev/null | grep -oE '(push|pull_request|workflow_dispatch|workflow_run|schedule|release)' | sort -u | tr '\n' ',' | sed 's/,$//' || echo "unknown")
                # Get last run status
                LAST_RUN=$(timeout 15 gh run list -w "$BASENAME" -L 1 --json conclusion,createdAt --jq '.[0] | "\(.conclusion // "pending") (\(.createdAt | split("T")[0]))"' 2>/dev/null || echo "unknown")
                # Get workflow state
                WF_STATE=$(timeout 15 gh workflow view "$BASENAME" --json state --jq '.state' 2>/dev/null || echo "unknown")
                TABLE="$TABLE
| $WF_NAME | $BASENAME | $WF_TRIGGER | $WF_STATE | $LAST_RUN |"
            done
        fi

        echo "" >> "$LOCAL_FILE"
        echo "$TABLE" >> "$LOCAL_FILE"
        echo "ADDED=workflows"
        echo "REPO=$REPO"
        ;;

    update-workflows)
        # Same as add-workflows but explicitly replaces
        exec "$0" add-workflows "$@"
        ;;

    list)
        if [[ ! -f "$LOCAL_FILE" ]]; then
            echo "NO_CONFIG"
            exit 0
        fi

        if has_github_config; then
            echo "GITHUB_CONFIG=exists"
        else
            echo "GITHUB_CONFIG=missing"
        fi

        # Count workflow sections
        WF_SECTIONS=$(grep -c "^## Workflows:" "$LOCAL_FILE" 2>/dev/null || echo "0")
        echo "WORKFLOW_SECTIONS=$WF_SECTIONS"

        # Check SSH sections (cross-reference, never modify)
        if grep -q "^## SSH Servers" "$LOCAL_FILE" 2>/dev/null; then
            echo "SSH_SERVERS=exists"
        else
            echo "SSH_SERVERS=missing"
        fi
        ;;

    *)
        echo "ERROR: Unknown subcommand '$SUBCMD'"
        echo "Usage: deploy-local-ops.sh <read-github|add-github|add-workflows|update-workflows|list> [args...]"
        exit 1
        ;;
esac
