#!/bin/bash
set -euo pipefail

# read-secret.sh <env:VAR_NAME|file:PATH> <DEST_VAR_NAME> -> out-of-band key into ~/.zshrc; value NEVER echoed (stdout/stderr/log).
# CC 2.1.296: no masked input (AskUserQuestion -> transcript, `sensitive: true` !=substituted) -> only length + SHA-256 prefix reported.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  echo "FAILED read-secret — $1"
  [[ $# -gt 1 ]] && echo "$2"
  exit 1
}

SOURCE="${1:-}"
DEST="${2:-}"

[[ -z "$SOURCE" ]] && fail "no source" "Usage: read-secret.sh <env:VAR_NAME|file:PATH> <DEST_VAR_NAME>"
[[ -z "$DEST" ]] && fail "no destination variable" "Usage: read-secret.sh <env:VAR_NAME|file:PATH> <DEST_VAR_NAME>"
[[ "$DEST" =~ ^[A-Z][A-Z0-9_]*$ ]] || fail "invalid destination variable name: $DEST"

VALUE=""

case "$SOURCE" in
  env:*)
    VAR="${SOURCE#env:}"
    [[ "$VAR" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail "invalid env var name: $VAR"
    if [[ -z "${!VAR:-}" ]]; then
      fail "\$$VAR is unset or empty in this shell" \
"Set it yourself, then re-run — do not paste the key into the conversation:
  export $VAR='<your-key>'"
    fi
    VALUE="${!VAR}"
    ;;
  file:*)
    FILE="${SOURCE#file:}"
    FILE="${FILE/#\~/$HOME}"
    [[ -f "$FILE" ]] || fail "no such file: $FILE" \
"Create it yourself, then re-run — do not paste the key into the conversation:
  umask 077; printf '%s' '<your-key>' > $FILE"
    [[ -r "$FILE" ]] || fail "file is not readable: $FILE"
    # Group/world accessible = already leaked: refuse. GNU stat first (BSD rejects -c, no stdout);
    # GNU `stat -f` is --file-system and prints junk, so an unreadable mode fails closed.
    MODE="$(stat -c '%a' "$FILE" 2>/dev/null || stat -f '%Lp' "$FILE" 2>/dev/null || true)"
    [[ "$MODE" =~ ^[0-7]{1,4}$ ]] || fail "cannot determine the permissions of $FILE — refusing to read it" \
"Neither GNU 'stat -c %a' nor BSD 'stat -f %Lp' printed an octal mode."
    if (( 8#$MODE & 8#077 )); then
      fail "$FILE is mode $MODE — group/world accessible" "Run: chmod 600 $FILE"
    fi
    IFS= read -r VALUE < "$FILE" || true
    ;;
  *)
    fail "unknown source '$SOURCE' — expected env:VAR_NAME or file:PATH"
    ;;
esac

VALUE="${VALUE%$'\r'}"
[[ -z "$VALUE" ]] && fail "source $SOURCE holds an empty value"
[[ "$VALUE" =~ [^[:print:]] ]] && fail "value contains control characters — re-create the source without a trailing newline or stray bytes"

BYTES="${#VALUE}"
if command -v shasum >/dev/null 2>&1; then
  FINGERPRINT="$(printf '%s' "$VALUE" | shasum -a 256 | cut -c1-12)"
elif command -v sha256sum >/dev/null 2>&1; then
  FINGERPRINT="$(printf '%s' "$VALUE" | sha256sum | cut -c1-12)"
else
  FINGERPRINT="unavailable"
fi

set +e
OUT="$(printf '%s' "$VALUE" | bash "$SCRIPT_DIR/write-alias.sh" set-key "$DEST" 2>&1)"
EC=$?
set -e
VALUE=""
unset VALUE

if [[ $EC -ne 0 ]]; then
  # write-alias.sh never echoes the value, so its message is safe to surface.
  fail "write-alias.sh set-key $DEST failed" "$OUT"
fi

echo "SOURCE=$SOURCE"
echo "DEST=$DEST"
echo "BYTES=$BYTES"
echo "FINGERPRINT=$FINGERPRINT"
echo "OK read-secret"
exit 0
