#!/usr/bin/env bash
# clean-root-png.sh — remove stray, git-ignored PNG screenshots from the repo ROOT.
#
# Playwright doc-verify / marketing runs drop *.png in the repo root. They are
# git-ignored (.gitignore: `*.png` with exceptions only under web/docs/public/),
# never referenced by tracked files, and pure clutter.
#
# Safety guarantees:
#   - Only the repo root is scanned (depth 1) — subdirectories are untouched.
#   - A file is deleted ONLY if `git check-ignore` confirms it is ignored, so a
#     tracked/whitelisted PNG (e.g. a future `!root-logo.png` exception) is never removed.
#   - Always exits 0 so it can never block a hook / session.
#
# Usage:
#   clean-root-png.sh            # delete ignored root PNGs, print summary
#   clean-root-png.sh --dry-run  # list what would be deleted, delete nothing

set -uo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 0

removed=0
# Portable root glob (works on BSD/macOS find-free): match *.png at depth 1 only.
shopt -s nullglob nocaseglob 2>/dev/null || true
for png in *.png; do
  [ -f "$png" ] || continue
  # Delete only if git considers it ignored (never touch tracked/whitelisted PNGs).
  if git check-ignore -q -- "$png"; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "would remove: $png"
    else
      rm -f -- "$png" && echo "removed: $png"
    fi
    removed=$((removed + 1))
  fi
done

if [ "$removed" -eq 0 ]; then
  echo "clean-root-png: nothing to clean."
elif [ "$DRY_RUN" = "1" ]; then
  echo "clean-root-png: $removed file(s) would be removed (dry run)."
else
  echo "clean-root-png: removed $removed file(s) from repo root."
fi

exit 0
