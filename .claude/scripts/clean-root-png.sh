#!/usr/bin/env bash
# clean-root-png.sh [--dry-run]: delete git-ignored *.png (Playwright strays) at repo-root depth 1; tracked/whitelisted PNGs stay.
# SessionStart hook: stdout stays EMPTY (hook stdout reaches the model); per-file notices -> stderr; always exit 0.

set -uo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0

# Portable root glob (works on BSD/macOS find-free): match *.png at depth 1 only.
shopt -s nullglob nocaseglob 2>/dev/null || true
for png in *.png; do
  [ -f "$png" ] || continue
  # Delete only if git considers it ignored (never touch tracked/whitelisted PNGs).
  if git check-ignore -q -- "$png"; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "would remove: $png" >&2
    else
      rm -f -- "$png" && echo "removed: $png" >&2
    fi
  fi
done

exit 0
