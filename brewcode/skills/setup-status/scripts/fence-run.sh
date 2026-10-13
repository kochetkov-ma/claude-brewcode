#!/usr/bin/env bash
# Runs one SKILL.md fence from stdin out of a private 0700 mktemp dir (${TMPDIR:-/tmp}), removed on EXIT; rc = fence rc.
set -u
base="${TMPDIR:-/tmp}"; base="${base%/}"
umask 077
dir=$(mktemp -d "$base/setup-status.XXXXXX") || { echo "❌ FAILED: mktemp -d under $base" >&2; exit 1; }
trap 'rm -rf -- "$dir"' EXIT
chmod 700 "$dir" || exit 1
cat > "$dir/fence.sh" || exit 1
rc=0
bash "$dir/fence.sh" "$@" || rc=$?
exit "$rc"
