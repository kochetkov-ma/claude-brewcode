#!/bin/bash
set -euo pipefail
# Check GitHub environment: gh CLI, auth, repo
# No args needed
# Output: structured key=value pairs

echo "=== GitHub Environment Check ==="

# Check gh CLI
if command -v gh &>/dev/null; then
    echo "GH_CLI=installed"
    GH_VERSION=$(gh --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    echo "GH_VERSION=$GH_VERSION"
else
    echo "GH_CLI=missing"
    echo "ERROR: gh CLI not installed. Install: https://cli.github.com/"
    exit 1
fi

# Check auth
echo "=== Auth ==="
if gh auth status &>/dev/null; then
    echo "GH_AUTH=authenticated"
    GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "unknown")
    echo "GH_USER=$GH_USER"
    GH_TOKEN_SCOPES=$(gh auth status 2>&1 | grep -oE 'Token scopes:.*' || echo "unknown")
    echo "GH_TOKEN_SCOPES=$GH_TOKEN_SCOPES"
else
    echo "GH_AUTH=not_authenticated"
    echo "ERROR: Not authenticated. Run: gh auth login"
    exit 1
fi

# Check repo
echo "=== Repository ==="
if gh repo view --json owner,name,url,defaultBranchRef &>/dev/null; then
    REPO_JSON=$(gh repo view --json owner,name,url,defaultBranchRef,visibility 2>/dev/null)
    REPO_OWNER=$(echo "$REPO_JSON" | jq -r '.owner.login // "unknown"')
    REPO_NAME=$(echo "$REPO_JSON" | jq -r '.name // "unknown"')
    REPO_URL=$(echo "$REPO_JSON" | jq -r '.url // "unknown"')
    REPO_DEFAULT_BRANCH=$(echo "$REPO_JSON" | jq -r '.defaultBranchRef.name // "main"')
    REPO_VISIBILITY=$(echo "$REPO_JSON" | jq -r '.visibility // "unknown"')
    echo "REPO_OWNER=$REPO_OWNER"
    echo "REPO_NAME=$REPO_NAME"
    echo "REPO_URL=$REPO_URL"
    echo "REPO_DEFAULT_BRANCH=$REPO_DEFAULT_BRANCH"
    echo "REPO_VISIBILITY=$REPO_VISIBILITY"
else
    echo "REPO=not_detected"
    echo "ERROR: Not in a git repo or no remote configured"
fi

# Check secrets
echo "=== Secrets ==="
SECRETS_COUNT=$(gh secret list 2>/dev/null | wc -l | tr -d ' ')
echo "SECRETS_COUNT=$SECRETS_COUNT"

# Check GHCR access
echo "=== GHCR ==="
GHCR_ACCESS=$(gh auth status 2>&1 | grep -q "write:packages" && echo "yes" || echo "no")
echo "GHCR_ACCESS=$GHCR_ACCESS"

echo "=== Check Complete ==="
