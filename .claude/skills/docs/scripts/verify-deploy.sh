#!/usr/bin/env bash
# verify-deploy.sh — wait for docs.yml + deploy-docs.yml, report status
# Usage: bash scripts/verify-deploy.sh
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI not installed"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh not authenticated — run: gh auth login"
  exit 1
fi

echo "=== Latest docs.yml run ==="
DOCS_RUN=$(gh run list --workflow=docs.yml -L 1 --json databaseId,status,conclusion -q '.[0]')
DOCS_ID=$(echo "$DOCS_RUN" | sed -nE 's/.*"databaseId":([0-9]+).*/\1/p')
if [[ -z "$DOCS_ID" ]]; then
  echo "❌ no docs.yml runs found"
  exit 1
fi
echo "$DOCS_RUN"

echo "=== Watching docs.yml ==="
if ! gh run watch "$DOCS_ID" --exit-status --interval 10; then
  echo "❌ docs.yml FAILED (run $DOCS_ID)"
  exit 1
fi
echo "✅ docs.yml green"

echo "=== Latest deploy-docs.yml run ==="
DEPLOY_RUN=$(gh run list --workflow=deploy-docs.yml -L 1 --json databaseId,status,conclusion -q '.[0]')
DEPLOY_ID=$(echo "$DEPLOY_RUN" | sed -nE 's/.*"databaseId":([0-9]+).*/\1/p')
if [[ -z "$DEPLOY_ID" ]]; then
  echo "⚠️  no deploy-docs.yml run yet — skip"
  exit 0
fi
echo "$DEPLOY_RUN"

echo "=== Watching deploy-docs.yml ==="
if ! gh run watch "$DEPLOY_ID" --exit-status --interval 10; then
  echo "❌ deploy-docs.yml FAILED (run $DEPLOY_ID)"
  exit 1
fi
echo "✅ deploy-docs.yml green"

echo "=== Health check ==="
if curl -sf -o /dev/null -w "%{http_code}\n" https://doc-claude.brewcode.app/getting-started/ | grep -q 200; then
  echo "✅ site reachable"
else
  echo "⚠️  site health check failed (may be CDN lag)"
  exit 1
fi
