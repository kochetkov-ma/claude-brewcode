#!/usr/bin/env bash
set -euo pipefail
root="${1:-}"
test -n "$root" || { echo "usage: emit-intent-guard.sh <project-root>" >&2; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template="$SCRIPT_DIR/../references/intent-guard.toml.template"
agents="$root/.codex/agents"
target="$agents/intent-guard.toml"

validate() {
  python3 - "$1" <<'PY'
import pathlib, sys, tomllib
path = pathlib.Path(sys.argv[1])
try:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
    print(f"invalid TOML: {exc}", file=sys.stderr)
    raise SystemExit(1)
required = {"name", "description", "developer_instructions"}
if set(data) != required:
    print("TOML keys must be exactly name, description, developer_instructions", file=sys.stderr)
    raise SystemExit(1)
if any(type(data[key]) is not str for key in required) or data["name"] != "intent-guard":
    print("intent-guard native fields must be strings and name must be fixed", file=sys.stderr)
    raise SystemExit(1)
PY
}

validate "$template"
if [ -f "$target" ]; then
  validate "$target"
  echo "INTENT_GUARD: REUSE .codex/agents/intent-guard.toml"
  exit 0
fi
mkdir -p "$agents"
tmp="$(mktemp "$agents/.intent-guard.XXXXXX")"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
cp "$template" "$tmp"
validate "$tmp"
mv "$tmp" "$target"
trap - EXIT HUP INT TERM
echo "INTENT_GUARD: CREATED .codex/agents/intent-guard.toml"
