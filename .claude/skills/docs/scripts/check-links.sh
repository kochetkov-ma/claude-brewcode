#!/usr/bin/env bash
# check-links.sh — validate internal /plugin/... cross-links in touched MDX files
# Usage: bash scripts/check-links.sh [file1.mdx file2.mdx ...]
#        (if no args, scans all .mdx under web/docs/src/content/docs/)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
NAV="$REPO_ROOT/web/docs/src/utils/navigation.ts"

if [[ ! -f "$NAV" ]]; then
  echo "❌ navigation.ts not found at $NAV"
  exit 1
fi

# Extract all known slugs from navigation.ts
KNOWN_SLUGS=$(grep -oE "slug: '[^']+'" "$NAV" | sed "s/slug: '//;s/'$//")
if [[ -z "$KNOWN_SLUGS" ]]; then
  echo "❌ failed to parse slugs from navigation.ts"
  exit 1
fi

if [[ $# -gt 0 ]]; then
  FILES=("$@")
else
  # bash 3.2 (macOS system bash) has no mapfile/readarray
  FILES=()
  while IFS= read -r _f; do
    [[ -n "$_f" ]] && FILES+=("$_f")
  done < <(find "$REPO_ROOT/web/docs/src/content/docs" -name '*.mdx' -type f)
fi

# `set -u` + bash 3.2: an empty array expands to an unbound variable error
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "⚠️  no .mdx files to check"
  exit 0
fi

FAIL=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "⚠️  skip missing: $f"; continue; }
  # Extract href="/...something.../" patterns (internal only, no http)
  LINKS=$(grep -oE 'href="/[^"#]+/?"' "$f" | sed 's/href="\///;s/\/"$//;s/"$//' || true)
  for link in $LINKS; do
    [[ -z "$link" ]] && continue
    # Strip trailing slash for comparison
    link_clean="${link%/}"
    if echo "$KNOWN_SLUGS" | grep -qFx "$link_clean"; then
      : # OK
    else
      # Check if it's a root-level page (getting-started, installation, etc)
      if echo "$KNOWN_SLUGS" | grep -qFx "$link_clean"; then
        :
      else
        echo "❌ $f: broken internal link → /$link"
        FAIL=1
      fi
    fi
  done
done

if [[ $FAIL -eq 0 ]]; then
  echo "✅ all internal links valid"
else
  echo "❌ broken links found"
  exit 1
fi
