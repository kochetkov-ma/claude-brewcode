#!/usr/bin/env bash
# snapshot|check <root> <name> [owned-prefix...]: a setup run changes only owned paths; snapshot in the git dir.
set -euo pipefail

usage() { echo "usage: scope-guard.sh snapshot <root> <name> | check <root> <name> <owned-prefix>..." >&2; exit 2; }
[ "$#" -ge 3 ] || usage
MODE=$1; ROOT=$2; NAME=$3; shift 3
case "$NAME" in *[!A-Za-z0-9_-]*|'') usage ;; esac

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "SCOPE n/a (no git at $ROOT): check the changed files by hand"; exit 0
fi
TOP=$(git -C "$ROOT" rev-parse --show-toplevel)
SNAP=$(cd "$TOP" && git rev-parse --path-format=absolute --git-path "brewcode-scope-$NAME.snap")

# One `<hash>\t<path>` line per dirty path (modified, staged, deleted, untracked); DELETED for a missing file.
state() {
  { git -C "$TOP" ls-files -z --modified --others --exclude-standard
    git -C "$TOP" diff -z --cached --name-only
  } | tr '\0' '\n' | LC_ALL=C sort -u | while IFS= read -r p; do
    [ -n "$p" ] || continue
    if [ -f "$TOP/$p" ]; then h=$(git -C "$TOP" hash-object -- "$p"); else h=DELETED; fi
    printf '%s\t%s\n' "$h" "$p"
  done
}

case "$MODE" in
  snapshot)
    state > "$SNAP"
    echo "SCOPE snapshot $(wc -l < "$SNAP" | tr -d ' ') dirty path(s) -> $SNAP" ;;
  check)
    [ "$#" -ge 1 ] || usage
    [ -f "$SNAP" ] || { echo "❌ SCOPE no snapshot for '$NAME': run snapshot before the setup writes"; exit 1; }
    now=$(state); out=0
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      owned=no
      for pre in "$@"; do case "$p" in "$pre"*) owned=yes ;; esac; done
      [ "$owned" = yes ] && continue
      before=$(awk -F'\t' -v p="$p" '$2 == p { print $1 }' "$SNAP")
      after=$(printf '%s\n' "$now" | awk -F'\t' -v p="$p" '$2 == p { print $1 }')
      [ "$before" = "$after" ] && continue
      echo "OUTSIDE $p"; out=$((out + 1))
    done < <({ cut -f2 "$SNAP"; printf '%s\n' "$now" | cut -f2; } | LC_ALL=C sort -u)
    if [ "$out" -eq 0 ]; then echo "SCOPE ok: only owned paths changed ($*)"; rm -f "$SNAP"
    else echo "❌ SCOPE $out path(s) outside the owned set changed: a defect to report, never to keep"; exit 1; fi ;;
  *) usage ;;
esac
