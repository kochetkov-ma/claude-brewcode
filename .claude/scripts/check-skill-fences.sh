#!/usr/bin/env bash
# check-skill-fences.sh — syntax-check every bash fence in every distributed SKILL.md.
#
# A bash fence inside a SKILL.md is an instruction the model may execute verbatim,
# so a block that does not parse is a real defect. This extracts each ```bash / ```sh
# fence and runs `bash -n` on it.
#
# Scanned: brew*/skills/*/SKILL.md, their references/*.md and assets/INSTALL.md,
#          plus workspace-local .claude/skills/*/SKILL.md (+ references).
#
# Extractor rules (both traps were live bugs):
#   - a fence nested in a blockquote keeps its `> ` prefix on every body line — stripped
#     using the prefix captured from the opening fence line, else the block fails spuriously
#   - fences tagged anything other than bash/sh/shell are skipped, not parsed as bash
#   - indented (list-nested) fences: leading indent of the opening line is stripped
#
# Usage:
#   check-skill-fences.sh           # sweep, print per-file failures, exit 1 on any
#   check-skill-fences.sh --verbose # also print every file/fence checked

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

VERBOSE=0
[ "${1:-}" = "--verbose" ] && VERBOSE=1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Emit each bash fence of $1 as a file $TMP/block.<n>, and print "<n> <startline>" per block.
extract() {
  awk -v out="$TMP" '
    function flush() { if (n > 0) close(f); }
    {
      line = $0
      if (!inblock) {
        # opening fence: optional indent, optional repeated "> " blockquote prefix, then ```
        if (match(line, /^[ \t]*(> ?)*```+[A-Za-z0-9_+-]*[ \t]*$/)) {
          hdr = substr(line, RSTART, RLENGTH)
          # prefix = everything up to the first backtick (indent + blockquote markers)
          bt = index(hdr, "`")
          prefix = substr(hdr, 1, bt - 1)
          rest = substr(hdr, bt)
          nticks = 0
          while (substr(rest, nticks + 1, 1) == "`") nticks++
          lang = substr(rest, nticks + 1)
          gsub(/[ \t]+$/, "", lang)
          if (lang == "bash" || lang == "sh" || lang == "shell") {
            n++
            f = out "/block." n
            printf "" > f
            inblock = 1
            start = NR
            plen = length(prefix)
          }
          next
        }
        next
      }
      # inside a bash block
      body = line
      if (plen > 0 && substr(body, 1, plen) == prefix) body = substr(body, plen + 1)
      else { sub(/^[ \t]*(> ?)+/, "", body) }   # tolerate prefix drift
      probe = body
      gsub(/[ \t]+$/, "", probe)
      if (probe ~ /^`{3,}$/) {
        close(f)
        print n " " start
        inblock = 0
        next
      }
      print body >> f
    }
    END { if (inblock) { close(f); print n " " start } }
  ' "$1"
}

files=$(
  ls brew*/skills/*/SKILL.md \
     brew*/skills/*/references/*.md \
     brew*/skills/*/assets/INSTALL.md \
     .claude/skills/*/SKILL.md \
     .claude/skills/*/references/*.md 2>/dev/null || true
)

total_files=0
total_blocks=0
failed=0
fail_list=""

for file in $files; do
  [ -f "$file" ] || continue
  rm -f "$TMP"/block.* 2>/dev/null || true
  map=$(extract "$file")
  [ -n "$map" ] || continue
  total_files=$((total_files + 1))
  while read -r idx startline; do
    [ -n "${idx:-}" ] || continue
    blk="$TMP/block.$idx"
    [ -f "$blk" ] || continue
    total_blocks=$((total_blocks + 1))
    # bash -n exits 0 on an unterminated heredoc but warns on stderr, so any
    # stderr output counts as a failure too (that case means a truncated fence).
    err=$(bash -n "$blk" 2>&1) && rc=0 || rc=$?
    if [ "$rc" -eq 0 ] && [ -z "$err" ]; then
      [ "$VERBOSE" = "1" ] && echo "  ok   $file:$startline"
    else
      failed=$((failed + 1))
      msg=$(printf '%s' "$err" | sed "s|$TMP/block.$idx|$file (fence at line $startline)|g")
      fail_list="${fail_list}
FAIL $file:$startline
$msg"
    fi
  done <<EOF
$map
EOF
done

echo "check-skill-fences: $total_blocks bash fence(s) across $total_files file(s)."

if [ "$failed" -gt 0 ]; then
  printf '%s\n' "$fail_list"
  echo
  echo "check-skill-fences: ❌ $failed fence(s) failed \`bash -n\`."
  exit 1
fi

echo "check-skill-fences: ✅ all fences parse."
exit 0
