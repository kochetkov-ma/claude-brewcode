#!/usr/bin/env bash
# text-guard.sh - preservation guard for in-place text optimization (BT-F15, BT-F29b).
#
# The optimizer rewrites files IN PLACE. This script puts both sides of the
# quality gate on DISK so the gate survives a context compaction, and it undoes
# a rewrite that loses a critical fact.
#
#   snapshot [--allow-dirty] [--run-dir D] <file>...   copy originals, print RUN_DIR
#   verify   --run-dir D <file>...                     100% sub-gate; restore on fail
#   restore  --run-dir D <file>...                     put the snapshot back
#   status   --run-dir D                               list what is snapshotted
#
# Exit: 0 ok | 1 gate failed (files restored) | 2 usage/state error, nothing written | 3 precondition
# (dirty tree, or no git recovery path) - nothing was written.
set -euo pipefail
# comm(1) demands both inputs collate identically to the sort that produced them.
export LC_ALL=C

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
}

die() { printf '%s\n' "$*" >&2; exit 2; }

# CODEX_PROJECT_DIR -> git toplevel -> cwd. Never silent: the chosen root is printed.
resolve_root() {
  if [ -n "${CODEX_PROJECT_DIR:-}" ] && [ -d "$CODEX_PROJECT_DIR" ]; then
    (cd "$CODEX_PROJECT_DIR" && pwd)
    return 0
  fi
  local top
  if top=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ]; then
    printf '%s\n' "$top"
    return 0
  fi
  pwd
}

# Path of FILE relative to ROOT, with any leading ./ and ../ refused.
rel_path() {
  local root="$1" file="$2" abs
  abs=$(cd "$(dirname "$file")" 2>/dev/null && printf '%s/%s' "$(pwd)" "$(basename "$file")") \
    || die "❌ cannot resolve $file"
  case "$abs" in
    "$root"/*) printf '%s\n' "${abs#"$root"/}" ;;
    *) die "❌ $file is outside the project root $root" ;;
  esac
}

# The 100% sub-gate alphabet: numbers/versions, slash-bearing paths, `!=`
# prohibitions, and ALL-CAPS modal keywords. Set semantics on purpose -
# legitimate dedup collapses repeats, it never removes the last occurrence.
crit_tokens() {
  local f="$1"
  {
    grep -oE '[0-9]+(\.[0-9]+)*' "$f" | sed 's/^/num:/' || true
    # trailing sentence punctuation is stripped: `!=stable,` and `!=stable.` are one fact.
    grep -oE '[A-Za-z0-9_@.-]*/[A-Za-z0-9_@./-]+' "$f" | sed -E 's/[.,;:]+$//; s/^/path:/' || true
    grep -oE '!=[A-Za-z0-9_./-]*' "$f" | sed -E 's/[.,;:]+$//; s/^/neg:/' || true
    grep -oE 'NEVER|ALWAYS|MUST NOT|DO NOT|REQUIRED|MANDATORY' "$f" | sed 's/^/kw:/' || true
  } | sort -u
}

# `.codex/reports/` holds verbatim copies of possibly private files. Nothing in a
# consumer repo ignores `.codex/`, so the entry is added before the first copy.
ensure_gitignore() {
  local root="$1" gi="$root/.gitignore"
  [ -f "$gi" ] || : > "$gi"
  grep -qxF '.codex/reports/' "$gi" && return 0
  printf '.codex/reports/\n' >> "$gi"
}

# A clean tree is the only recovery path for a run that aborts before verify.
require_clean_tree() {
  local root="$1"; shift
  git -C "$root" rev-parse --git-dir >/dev/null 2>&1 || {
    printf '❌ %s is not a git repository - no recoverable pre-state.\n' "$root" >&2
    printf '   Commit the targets under git, or re-run with --allow-dirty to accept the risk.\n' >&2
    exit 3
  }
  local dirty
  dirty=$(git -C "$root" status --porcelain -- "$@" 2>/dev/null || true)
  [ -z "$dirty" ] && return 0
  printf '❌ uncommitted changes in the optimize targets - refusing to rewrite in place:\n' >&2
  printf '%s\n' "$dirty" >&2
  printf '   Commit or stash them, or re-run with --allow-dirty.\n' >&2
  exit 3
}

cmd_snapshot() {
  local allow_dirty=0 run_dir="" root
  local -a files=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --allow-dirty) allow_dirty=1; shift ;;
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) files+=("$1"); shift ;;
    esac
  done
  [ "${#files[@]}" -gt 0 ] || die "❌ snapshot needs at least one file"
  root=$(resolve_root)

  local -a rels=()
  local f
  for f in "${files[@]}"; do
    [ -f "$f" ] || die "❌ not a file: $f"
    rels+=("$(rel_path "$root" "$f")")
  done

  [ "$allow_dirty" -eq 1 ] || require_clean_tree "$root" "${rels[@]}"

  [ -n "$run_dir" ] || run_dir="$root/.codex/reports/$(date +%Y%m%d-%H%M%S)_text-optimize"
  ensure_gitignore "$root"

  # 077 for the whole subtree: the copies are verbatim originals, private files included.
  ( umask 077
    mkdir -p "$run_dir/orig"
    local i
    for i in "${!rels[@]}"; do
      mkdir -p "$run_dir/orig/$(dirname "${rels[$i]}")"
      cp "${files[$i]}" "$run_dir/orig/${rels[$i]}"
    done )

  printf 'ROOT: %s\n' "$root"
  printf 'SNAPSHOT: %s files\n' "${#rels[@]}"
  for f in "${rels[@]}"; do printf '  %s\n' "$f"; done
  printf 'RUN_DIR: %s\n' "$run_dir"
}

# Restores from the snapshot; caller decides the exit code.
restore_one() {
  local run_dir="$1" rel="$2" root="$3"
  local snap="$run_dir/orig/$rel"
  [ -f "$snap" ] || die "❌ no snapshot for $rel in $run_dir - run 'snapshot' before editing"
  cp "$snap" "$root/$rel"
}

cmd_verify() {
  local run_dir="" root
  local -a files=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) files+=("$1"); shift ;;
    esac
  done
  [ -n "$run_dir" ] || die "❌ verify needs --run-dir"
  [ "${#files[@]}" -gt 0 ] || die "❌ verify needs at least one file"
  [ -d "$run_dir/orig" ] || die "❌ no snapshot dir: $run_dir/orig"
  root=$(resolve_root)

  local failed=0 f rel snap missing count

  # Pre-flight EVERY file before restoring ANY of them: a state error found halfway through the
  # main loop would exit 2 ("nothing happened") after files 1..N-1 had already been rolled back.
  for f in "${files[@]}"; do
    rel=$(rel_path "$root" "$f")
    [ -f "$run_dir/orig/$rel" ] || die "❌ no snapshot for $rel in $run_dir - run 'snapshot' before editing"
    [ -f "$f" ] || die "❌ target vanished: $rel"
  done

  for f in "${files[@]}"; do
    rel=$(rel_path "$root" "$f")
    snap="$run_dir/orig/$rel"

    missing=$(comm -23 <(crit_tokens "$snap") <(crit_tokens "$f") || true)
    count=0
    [ -n "$missing" ] && count=$(printf '%s\n' "$missing" | wc -l | tr -d ' ')

    printf 'FILE: %s\n' "$rel"
    printf 'MISSING: %s\n' "$count"
    if [ "$count" -eq 0 ]; then
      printf 'GATE: PASS\nACTION: kept\n'
    else
      printf '%s\n' "$missing" | sed 's/^/  - /'
      restore_one "$run_dir" "$rel" "$root"
      printf 'GATE: FAIL\nACTION: restored\n'
      failed=$((failed + 1))
    fi
  done

  printf 'FILES_FAILED: %s\n' "$failed"
  [ "$failed" -eq 0 ] || exit 1
}

cmd_restore() {
  local run_dir="" root
  local -a files=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      -*) die "❌ unknown option: $1" ;;
      *) files+=("$1"); shift ;;
    esac
  done
  [ -n "$run_dir" ] || die "❌ restore needs --run-dir"
  [ "${#files[@]}" -gt 0 ] || die "❌ restore needs at least one file"
  root=$(resolve_root)
  local f rel
  for f in "${files[@]}"; do
    rel=$(rel_path "$root" "$f")
    restore_one "$run_dir" "$rel" "$root"
    printf 'RESTORED: %s\n' "$rel"
  done
}

cmd_status() {
  local run_dir=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --run-dir) run_dir="${2:-}"; [ -n "$run_dir" ] || die "❌ --run-dir needs a value"; shift 2 ;;
      *) die "❌ unknown argument: $1" ;;
    esac
  done
  [ -n "$run_dir" ] || die "❌ status needs --run-dir"
  [ -d "$run_dir/orig" ] || die "❌ no snapshot dir: $run_dir/orig"
  local -a snaps=()
  while IFS= read -r line; do snaps+=("$line"); done < <(cd "$run_dir/orig" && find . -type f | sed 's|^\./||' | sort)
  printf 'RUN_DIR: %s\n' "$run_dir"
  printf 'SNAPSHOT: %s files\n' "${#snaps[@]}"
  local s
  for s in "${snaps[@]}"; do printf '  %s\n' "$s"; done
}

[ "$#" -gt 0 ] || { usage; exit 2; }
CMD="$1"; shift
case "$CMD" in
  snapshot) cmd_snapshot "$@" ;;
  verify)   cmd_verify "$@" ;;
  restore)  cmd_restore "$@" ;;
  status)   cmd_status "$@" ;;
  -h|--help|help) usage ;;
  *) die "❌ unknown command: $CMD" ;;
esac
