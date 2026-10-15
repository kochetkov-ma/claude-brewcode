#!/bin/bash
# Live verification of brewmod-placeholders (tmux screens + claude -p context); args and rc in README.md.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v tmux >/dev/null || { echo "tmux not found" >&2; exit 2; }
command -v claude >/dev/null || { echo "claude not found" >&2; exit 2; }
exec node "$here/drive.mjs" "$@"
