#!/usr/bin/env bash
# fetch-latest-versions.sh -> {"<plugin>":"X.Y.Z"} for the 4 suite plugins + 2 optional brewmod-* mods; failed plugin = "unknown".
# Source: raw plugin.json from GitHub main branch; fallback `gh api` release tag_name.

set -uo pipefail

log() { printf '%s\n' "$*" >&2; }

PLUGINS=(brewcode brewdoc brewtools brewui brewmod-plan-effort brewmod-placeholders)
REPO="kochetkov-ma/claude-brewcode"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/main"

if ! command -v jq >/dev/null 2>&1; then
  log "ERROR: jq required"
  printf '{"error":"jq-missing"}\n'
  exit 1
fi

fetch_release_tag() {
  command -v gh >/dev/null 2>&1 || { printf ''; return; }
  gh api "repos/${REPO}/releases/latest" --jq '.tag_name // ""' 2>/dev/null | sed 's/^v//'
}

RELEASE_FALLBACK=""

fetch_version() {
  local plugin="$1"
  local url="${RAW_BASE}/${plugin}/.claude-plugin/plugin.json"
  local body ver
  body=$(curl -sSL --max-time 10 "$url" 2>/dev/null || true)
  if [ -n "$body" ]; then
    ver=$(printf '%s' "$body" | jq -r '.version // ""' 2>/dev/null || true)
    if [ -n "$ver" ] && [ "$ver" != "null" ]; then
      printf '%s' "$ver"
      return
    fi
  fi
  # fallback: release tag (shared across all plugins in this repo)
  if [ -z "$RELEASE_FALLBACK" ]; then
    RELEASE_FALLBACK=$(fetch_release_tag)
  fi
  if [ -n "$RELEASE_FALLBACK" ]; then
    printf '%s' "$RELEASE_FALLBACK"
    return
  fi
  printf 'unknown'
}

# Build JSON directly (no associative array — macOS bash 3.2 compat)
entries=""
for p in "${PLUGINS[@]}"; do
  v=$(fetch_version "$p")
  entries+=$(jq -nc --arg p "$p" --arg v "$v" '{($p): $v}')
  entries+=$'\n'
done
printf '%s' "$entries" | jq -s 'add // {}'
