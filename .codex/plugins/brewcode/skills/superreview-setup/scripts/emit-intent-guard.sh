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
import os, stat, sys, tomllib
path = sys.argv[1]
flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
fd = -1
try:
    fd = os.open(path, flags)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        print(f"intent-guard path must be a non-symlink regular file: {path}", file=sys.stderr)
        raise SystemExit(1)
    with os.fdopen(fd, "r", encoding="utf-8") as handle:
        fd = -1
        data = tomllib.loads(handle.read())
except OSError as exc:
    print(f"intent-guard path must be a non-symlink regular file: {path} ({exc})", file=sys.stderr)
    raise SystemExit(1)
except (UnicodeError, tomllib.TOMLDecodeError) as exc:
    print(f"invalid TOML: {exc}", file=sys.stderr)
    raise SystemExit(1)
finally:
    if fd >= 0:
        os.close(fd)
required = {"name", "description", "developer_instructions"}
if set(data) != required:
    print("TOML keys must be exactly name, description, developer_instructions", file=sys.stderr)
    raise SystemExit(1)
if any(type(data[key]) is not str for key in required) or data["name"] != "intent-guard":
    print("intent-guard native fields must be strings and name must be fixed", file=sys.stderr)
    raise SystemExit(1)
body = data["developer_instructions"]
def normalize_contract(value):
    return " ".join(value.split()).casefold()
approved_contracts = {
    normalize_contract("Review-only. Compare what was requested with what was delivered, report concrete drift with file:line evidence. Never implement and never mutate project files."),
    normalize_contract("Review-only. Never implement and never mutate project files. Report a verdict with file:line evidence."),
}
if normalize_contract(body) not in approved_contracts:
    print("intent-guard contract mismatch: developer_instructions must equal an approved normalized review-only contract", file=sys.stderr)
    raise SystemExit(1)
PY
}

validate "$template"
if [ -e "$target" ] || [ -L "$target" ]; then
  validate "$target"
  echo "INTENT_GUARD: REUSE .codex/agents/intent-guard.toml"
  exit 0
fi
mkdir -p "$agents"
tmp="$(mktemp "$agents/.intent-guard.XXXXXX")"
trap 'rm -f "$tmp"' EXIT HUP INT TERM
cp "$template" "$tmp"
validate "$tmp"
python3 - "$tmp" "$target" <<'PY'
import os, sys
source, target = sys.argv[1:]
try:
    os.link(source, target)
except FileExistsError:
    print(f"intent-guard target appeared during create; refusing overwrite: {target}", file=sys.stderr)
    raise SystemExit(1)
except OSError as exc:
    print(f"intent-guard atomic publish failed for {target}: {exc}", file=sys.stderr)
    raise SystemExit(1)
PY
rm -f "$tmp"
trap - EXIT HUP INT TERM
echo "INTENT_GUARD: CREATED .codex/agents/intent-guard.toml"
