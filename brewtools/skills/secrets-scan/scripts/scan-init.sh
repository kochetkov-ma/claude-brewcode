#!/usr/bin/env bash
# scan-init.sh - Phase 1 of brewtools:secrets-scan.
#
# Resolves the repo root, creates an owner-only report directory, makes sure
# .claude/reports/ is git-ignored (the report names credential locations, so it
# must never become committable), and writes the git-tracked file list.
#
# Prints one machine-readable line: DIR=..|REPO=..|TS=..|TOTAL=..|GITIGNORE=..
# GITIGNORE is one of: appended | already-ignored
set -euo pipefail
umask 077

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: Not git repo"; exit 1; }
REPO=$(git rev-parse --show-toplevel)
cd "$REPO"

# git check-ignore covers every source of truth at once: repo .gitignore, nested
# ones, .git/info/exclude and the user's global excludes file.
GITIGNORE_STATE=already-ignored
if ! git check-ignore -q .claude/reports/ 2>/dev/null; then
  printf '\n# brewtools:secrets-scan - reports name credential locations\n.claude/reports/\n' >> .gitignore
  GITIGNORE_STATE=appended
fi

TS=$(date +%Y%m%d-%H%M%S)
DIR="$REPO/.claude/reports/${TS}_secrets-scan"
mkdir -p "$DIR"
chmod 700 "$DIR"

git ls-files \
  | grep -viE '\.(png|jpe?g|gif|bmp|ico|svgz|webp|tiff?|pdf|psd|ai|eot|ttf|otf|woff2?|mp[34]|m4a|wav|ogg|avi|mov|mkv|webm|zip|tar|t?gz|tgz|bz2|xz|7z|rar|jar|war|ear|class|pyc|pyo|so|dylib|dll|exe|bin|dat|db|sqlite3?|wasm|pack|idx|min\.js|min\.css|map)$' \
  | grep -vE '(^|/)(node_modules|vendor|third_party|\.venv|venv|dist|build|target|out|coverage|__pycache__|\.next|\.nuxt|\.gradle|Pods|bower_components)/' \
  | grep -vE '(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum|Pipfile\.lock|gradle\.lockfile)$' \
  > "$DIR/files.txt" || true
chmod 600 "$DIR/files.txt"

echo "DIR=$DIR|REPO=$REPO|TS=$TS|TOTAL=$(wc -l < "$DIR/files.txt" | tr -d ' ')|GITIGNORE=$GITIGNORE_STATE"
