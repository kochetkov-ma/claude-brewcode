#!/usr/bin/env bash
# Validates internal /plugin/... cross-links, JSX <code> smartypants hazards, entities in backtick code, code inside <Callout> in MDX files.
# Usage: bash scripts/check-links.sh [file.mdx ...]; no args -> all .mdx under web/docs/src/content/docs/
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

# Fence or <pre> between <Callout ...> and </Callout> -> "line:kind:open_line"; fence bodies, frontmatter, backtick spans skipped
# shellcheck disable=SC2016
CALLOUT_AWK='
function hit(ln, kind) { print ln ":" kind ":" open_ln }
NR == 1 && $0 == "---" { fm = 1; next }
fm { if ($0 == "---") fm = 0; next }
{
  s = $0; sub(/^[ \t]+/, "", s)
  if (fch != "") {
    t = s; sub(/[ \t]+$/, "", t); n = 0
    while (substr(t, n + 1, 1) == fch) n++
    if (n >= flen && n == length(t)) fch = ""
    next
  }
  c = substr(s, 1, 3)
  if (c == "```" || c == "~~~") {
    ch = substr(s, 1, 1); n = 0
    while (substr(s, n + 1, 1) == ch) n++
    if (!(ch == "`" && index(substr(s, n + 1), "`") > 0)) {
      fch = ch; flen = n
      if (depth > 0) hit(NR, "fenced code block")
      next
    }
  }
  t = $0 " "; gsub(/`[^`]*`/, "", t)
  while (match(t, /<\/?Callout[ \t>\/]|<pre[ \t>]/)) {
    tok = substr(t, RSTART, RLENGTH); t = substr(t, RSTART + RLENGTH)
    if (substr(tok, 2, 1) == "/") { if (depth > 0) depth--; continue }
    if (substr(tok, 2, 3) == "pre") { if (depth > 0) hit(NR, "<pre>"); continue }
    last = substr(tok, RLENGTH, 1); sc = (last == "/")
    if (last == " " || last == "\t") { e = index(t, ">"); sc = (e > 1 && substr(t, e - 1, 1) == "/") }
    if (!sc && depth++ == 0) open_ln = NR
  }
}'

FAIL=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "⚠️  skip missing: $f"; continue; }
  # Internal links only: href="/..." attributes and markdown ](/...) targets; a #anchor is dropped
  LINKS=$({ grep -oE '(href="|\]\()/[^")# ]*' "$f" || true; } | sed -E 's/^(href="|\]\()\///')
  for link in $LINKS; do
    [[ -z "$link" ]] && continue
    # Strip trailing slash for comparison
    link_clean="${link%/}"
    if ! grep -qFx -- "$link_clean" <<< "$KNOWN_SLUGS"; then
      echo "❌ $f: broken internal link → /$link"
      FAIL=1
    fi
  done
  # smartypants rewrites -- ... ' " inside JSX <code>; a {expression} start is exempt
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    echo "❌ $f:${hit%%:*}: JSX <code> with --, ..., ' or \" (smartypants corrupts it) → use backtick code inside JSX"
    FAIL=1
  done < <(grep -nE "<code>[^<{][^<]*</code>" "$f" | grep -E "<code>[^<{]*(--|\.\.\.|[\"'])[^<]*</code>" || true)
  # an entity inside a single-line backtick span renders literally (backtick code is not entity-decoded)
  # shellcheck disable=SC2016
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    echo "❌ $f:${hit%%:*}: entity (&lt; &gt; &amp; &quot; &#39;) inside backtick code renders literally → use the raw character"
    FAIL=1
  done < <(grep -nE '`' "$f" | while IFS= read -r _l; do
    grep -oE '`[^`]+`' <<< "${_l#*:}" | grep -qE '&(lt|gt|amp|quot|#39);' && echo "$_l" || true
  done)
  # a bare assignment keeps errexit: an awk failure aborts loudly instead of reading as zero hits
  CALLOUT_HITS=$(awk "$CALLOUT_AWK" "$f")
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    _rest="${hit#*:}"
    echo "❌ $f:${hit%%:*}: ${_rest%:*} inside <Callout> (opened at line ${_rest##*:}) renders as a cramped scroll strip → put the code right after </Callout>"
    FAIL=1
  done <<< "$CALLOUT_HITS"
done

if [[ $FAIL -eq 0 ]]; then
  echo "✅ all internal links valid, no JSX <code> hazards, no code inside <Callout>"
else
  echo "❌ broken links, JSX <code> hazards or code inside <Callout> found"
  exit 1
fi
