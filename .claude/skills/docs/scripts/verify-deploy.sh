#!/usr/bin/env bash
# verify-deploy.sh — wait for one tag's docs.yml + deploy-docs.yml, then gate on the live build-info.json + CSP header
# Usage: bash scripts/verify-deploy.sh vX.Y.Z   (rc 0 = live site serves exactly that tag's build, with a CSP header)
set -euo pipefail

TAG="${1:-}"
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ usage: verify-deploy.sh vX.Y.Z (got '$TAG')"
  exit 2
fi
BUILD_INFO_URL="https://doc-claude.brewcode.app/build-info.json"
PAGE_URL="https://doc-claude.brewcode.app/getting-started/"

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI not installed"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh not authenticated — run: gh auth login"
  exit 1
fi

echo "=== docs.yml run for $TAG ==="
DOCS_ID=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  DOCS_ID=$(gh run list --workflow=docs.yml --branch "$TAG" --event push -L 1 --json databaseId \
    -q '.[0].databaseId // empty' || true)
  [[ -n "$DOCS_ID" ]] && break
  sleep 10
done
if [[ -z "$DOCS_ID" ]]; then
  echo "❌ no docs.yml run for $TAG after 120s — was the tag pushed?"
  exit 1
fi
if ! gh run watch "$DOCS_ID" --exit-status --interval 10; then
  echo "❌ docs.yml FAILED (run $DOCS_ID)"
  exit 1
fi
DOCS_SHA=$(gh run view "$DOCS_ID" --json headSha -q .headSha)
DOCS_DONE=$(gh run view "$DOCS_ID" --json updatedAt -q .updatedAt)
echo "✅ docs.yml green (run $DOCS_ID, sha $DOCS_SHA)"

echo "=== deploy-docs.yml run triggered by run $DOCS_ID ==="
# Deploy runs carry headBranch main: creation time is the only link to the build that triggered them.
DEPLOY_ID=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  DEPLOY_ID=$(gh run list --workflow=deploy-docs.yml --event workflow_run -L 20 --json databaseId,createdAt \
    -q "[.[] | select(.createdAt >= \"$DOCS_DONE\")] | last | .databaseId // empty" || true)
  [[ -n "$DEPLOY_ID" ]] && break
  sleep 10
done
if [[ -z "$DEPLOY_ID" ]]; then
  echo "⚠️  no deploy-docs.yml run created after $DOCS_DONE — the version gate decides"
elif ! gh run watch "$DEPLOY_ID" --exit-status --interval 10; then
  echo "❌ deploy-docs.yml FAILED (run $DEPLOY_ID)"
  exit 1
else
  echo "✅ deploy-docs.yml green (run $DEPLOY_ID)"
fi

echo "=== Version gate ==="
# Same byte-exact shape docs.yml writes to build-info.json: a 200 from an older build must fail.
EXPECTED=$(printf '{"version":"%s","sha":"%s","buildRunId":"%s"}' "${TAG#v}" "$DOCS_SHA" "$DOCS_ID")
LIVE=""
for _ in 1 2 3 4 5 6; do
  LIVE=$(curl -fsS -m 15 "${BUILD_INFO_URL}?build=${DOCS_ID}" || true)
  if [[ "$LIVE" == "$EXPECTED" ]]; then
    echo "✅ live build-info matches $TAG: $LIVE"
    CSP=$(curl -fsS -m 15 -D - -o /dev/null "${PAGE_URL}?build=${DOCS_ID}" | tr -d '\r' | grep -i '^content-security-policy: ' || true)
    if [[ -z "$CSP" ]]; then
      echo "❌ CSP gate FAILED: no content-security-policy header on $PAGE_URL"
      exit 1
    fi
    echo "✅ live ${CSP:0:120}..."
    exit 0
  fi
  sleep 10
done
echo "❌ version gate FAILED for $TAG"
echo "   live:     $LIVE"
echo "   expected: $EXPECTED"
exit 1
