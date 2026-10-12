#!/usr/bin/env bash
# check-skill-fences.sh — syntax-check every shell fence in every skill's markdown, under bash AND zsh.
#
# A shell fence in a skill is an instruction the model may execute verbatim, so a block that does not
# parse is a real defect. The Bash tool runs the user's shell (zsh on macOS); suites run bash -> both.
#
# Scanned: every *.md and *.template under brew*/skills/*/, .claude/skills/*/ and root skills/*/
#          (references/, reference/, assets/, templates...), minus tests/, node_modules/, .template-baseline/.
#
# Extractor rules (both traps were live bugs):
#   - a fence nested in a blockquote keeps its `> ` prefix on every body line — stripped
#     using the prefix captured from the opening fence line, else the block fails spuriously
#   - fences tagged anything other than bash/sh/shell/zsh are skipped; `zsh` fences get only zsh -n
#   - indented (list-nested) fences: leading indent of the opening line is stripped
#
# --exec: also RUN each fence once under `zsh -f -c` in an empty scratch dir to catch zsh no-match glob
# aborts (`no matches found`: zsh skips the command, bash runs it). Side-effect-free is enforced, not
# guessed: macOS sandbox-exec denies network, mach IPC, signals to other processes and every write
# outside the scratch dir; HOME/TMPDIR/CLAUDE_CONFIG_DIR point into it; 10 s per fence. SKILL.md
# fences get the load-time substitutions first. Without sandbox-exec (Linux) nothing runs: --exec lists
# candidate fences (an unquoted * or ? outside quotes/comments) and does not change the exit code.
#
# Usage:
#   check-skill-fences.sh           # sweep, print per-file failures, exit 1 on any
#   check-skill-fences.sh --verbose # also print every file/fence checked
#   check-skill-fences.sh --exec    # parse sweep + zsh execution pass (see above)
# Exit: 0 clean, 1 a fence failed, 2 zsh missing (install it: the Bash tool's shell must be checked).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

VERBOSE=0
EXEC=0
for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=1 ;;
    --exec) EXEC=1 ;;
    *) echo "Usage: check-skill-fences.sh [--verbose] [--exec]" >&2; exit 2 ;;
  esac
done

ZSH="$(command -v zsh || true)"
if [ -z "$ZSH" ]; then
  echo "check-skill-fences: zsh not found -- the zsh pass is mandatory (apt-get install zsh)." >&2
  exit 2
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Emit each shell fence of $1 as $TMP/block.<n>, and print "<n> <startline> <lang>" per block.
extract() {
  awk -v out="$TMP" '
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
          if (lang == "bash" || lang == "sh" || lang == "shell" || lang == "zsh") {
            n++
            f = out "/block." n
            printf "" > f
            inblock = 1
            start = NR
            blang = lang
            plen = length(prefix)
          }
          next
        }
        next
      }
      # inside a shell block
      body = line
      if (plen > 0 && substr(body, 1, plen) == prefix) body = substr(body, plen + 1)
      else { sub(/^[ \t]*(> ?)+/, "", body) }   # tolerate prefix drift
      probe = body
      gsub(/[ \t]+$/, "", probe)
      if (probe ~ /^`{3,}$/) {
        close(f)
        print n " " start " " blang
        inblock = 0
        next
      }
      print body >> f
    }
    END { if (inblock) { close(f); print n " " start " " blang } }
  ' "$1"
}

# parse <shell> <block> -> prints the error text; rc 1 on any error. bash -n exits 0 on an unterminated
# heredoc but warns on stderr -> stderr fails too. zsh -n: stderr only (any `! cmd` makes it exit 1).
parse() {
  local err rc
  err=$("$1" -n "$2" 2>&1) && rc=0 || rc=$?
  case "$1" in *zsh) rc=0 ;; esac
  [ "$rc" -eq 0 ] && [ -z "$err" ] && return 0
  [ -n "$err" ] || err="exit $rc"
  printf '%s' "$err"
  return 1
}

SANDBOX=0
if [ "$EXEC" = 1 ] && command -v sandbox-exec >/dev/null 2>&1; then SANDBOX=1; fi

# Run block $1 (from file $2, skill dir $3) under zsh in a fresh sandboxed scratch dir; print abort text.
exec_zsh() {
  local blk="$1" file="$2" sdir="$3" scr plug prof err
  scr="$(mktemp -d "$TMP/exec.XXXXXX")"
  mkdir -p "$scr/w" "$scr/home/.claude" "$scr/tmp"
  if [ "${file##*/}" = "SKILL.md" ]; then
    plug="$(cd "$sdir/../.." && pwd)"
    # shellcheck disable=SC2016  # literal load-time tokens
    sed -e "s|\${CLAUDE_PLUGIN_ROOT}|$plug|g" -e "s|\${CLAUDE_SKILL_DIR}|$ROOT/$sdir|g" \
        -e "s|\${CLAUDE_PROJECT_DIR}|$scr/w|g" -e 's|\$ARGUMENTS||g' "$blk" > "$scr/fence.zsh"
  else
    cp "$blk" "$scr/fence.zsh"
  fi
  prof="(version 1)(allow default)(deny network*)(deny mach-lookup)(deny signal (target others))"
  prof="$prof(deny file-write*)(allow file-write* (subpath \"$scr\") (literal \"/dev/null\") (literal \"/dev/tty\") (subpath \"/dev/fd\"))"
  err=$(cd "$scr/w" && env -i HOME="$scr/home" PATH="$PATH" TMPDIR="$scr/tmp" LANG=en_US.UTF-8 \
        CLAUDE_CONFIG_DIR="$scr/home/.claude" perl -e 'alarm 10; exec @ARGV' \
        sandbox-exec -p "$prof" "$ZSH" -f "$scr/fence.zsh" 2>&1 >/dev/null < /dev/null) || true
  printf '%s' "$err" | grep -E 'no matches found|bad pattern' || true
}

# Static fallback for --exec without a sandbox: an unquoted * or ? outside quotes and comments.
glob_candidate() {
  awk '
    { s = $0; gsub(/\047[^\047]*\047/, "", s); gsub(/"[^"]*"/, "", s); sub(/(^|[ \t])#.*$/, "", s)
      gsub(/\$[?*#@]/, "", s); gsub(/\[\[[^]]*\]\]/, "", s)
      if (s ~ /[*?]/) { found = 1; exit } }
    END { exit !found }' "$1"
}

files=$(
  for base in brew*/skills/*/ .claude/skills/*/ skills/*/; do
    [ -d "$base" ] || continue
    find "$base" \( -name tests -o -name node_modules -o -name .template-baseline \) -prune -o \
      -type f \( -name '*.md' -o -name '*.template' \) -print
  done | sort
)

total_files=0
total_blocks=0
failed=0
exec_failed=0
candidates=0
fail_list=""

while IFS= read -r file; do
  [ -f "$file" ] || continue
  rm -f "$TMP"/block.* 2>/dev/null || true
  map=$(extract "$file")
  [ -n "$map" ] || continue
  total_files=$((total_files + 1))
  case "$file" in
    skills/*) sdir="${file#skills/}"; sdir="skills/${sdir%%/*}" ;;
    *) sdir="$(printf '%s' "$file" | sed -E 's|^((\.claude/)?[^/]+/skills/[^/]+)/.*|\1|')" ;;
  esac
  while read -r idx startline lang; do
    [ -n "${idx:-}" ] || continue
    blk="$TMP/block.$idx"
    [ -f "$blk" ] || continue
    total_blocks=$((total_blocks + 1))
    msg=""
    if [ "$lang" != "zsh" ] && ! e=$(parse bash "$blk"); then msg="${msg}[bash -n] $e
"; fi
    if ! e=$(parse "$ZSH" "$blk"); then msg="${msg}[zsh -n] $e
"; fi
    if [ -z "$msg" ] && [ "$EXEC" = 1 ]; then
      if [ "$SANDBOX" = 1 ]; then
        e=$(exec_zsh "$blk" "$file" "$sdir")
        if [ -n "$e" ]; then msg="[zsh exec] $e
"; exec_failed=$((exec_failed + 1)); fi
      elif glob_candidate "$blk"; then
        candidates=$((candidates + 1))
        echo "  candidate (unquoted glob, not run) $file:$startline"
      fi
    fi
    if [ -z "$msg" ]; then
      [ "$VERBOSE" = "1" ] && echo "  ok   $file:$startline"
    else
      failed=$((failed + 1))
      msg=$(printf '%s' "$msg" | sed -e "s|$TMP/exec\.[A-Za-z0-9]*/fence\.zsh|$file (fence at line $startline)|g" \
        -e "s|$TMP/block.$idx|$file (fence at line $startline)|g")
      fail_list="${fail_list}
FAIL $file:$startline
$msg"
    fi
  done <<EOF
$map
EOF
done <<EOF
$files
EOF

echo "check-skill-fences: $total_blocks shell fence(s) across $total_files file(s), bash -n + zsh -n."
if [ "$EXEC" = 1 ]; then
  if [ "$SANDBOX" = 1 ]; then echo "check-skill-fences: --exec ran every parsed fence under sandboxed zsh ($exec_failed no-match abort(s))."
  else echo "check-skill-fences: --exec: no sandbox-exec, nothing run; $candidates candidate fence(s) listed."; fi
fi

if [ "$failed" -gt 0 ]; then
  printf '%s\n' "$fail_list"
  echo
  echo "check-skill-fences: ❌ $failed fence(s) failed."
  exit 1
fi

echo "check-skill-fences: ✅ all fences parse."
exit 0
