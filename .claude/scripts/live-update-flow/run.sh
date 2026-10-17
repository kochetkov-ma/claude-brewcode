#!/bin/bash
# Live e2e of the brewcode update flow (plugin-update -> /reload-plugins -> setup-status upgrade); args and rc in README.md.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for t in tmux claude git node rsync tar; do command -v "$t" >/dev/null || { echo "$t not found" >&2; exit 2; }; done
exec node "$here/drive.mjs" "$@"
