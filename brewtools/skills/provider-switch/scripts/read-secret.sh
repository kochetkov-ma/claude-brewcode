#!/bin/bash
set -euo pipefail

# read-secret.sh — move a provider API key from an out-of-band source into ~/.zshrc
# without the value ever becoming model-visible text.
#
# Usage: read-secret.sh <env:VAR_NAME|file:PATH> <DEST_VAR_NAME>
#   read-secret.sh env:DEEPSEEK_API_KEY DEEPSEEK_API_KEY
#   read-secret.sh file:$HOME/.claude-deepseek.key DEEPSEEK_API_KEY
#
# Claude Code 2.1.233 has no masked runtime input: AskUserQuestion returns plain text into the
# transcript and userConfig `sensitive: true` is enable-time only and deliberately not substituted
# into skill content. So the user places the value out of band and this script is the only thing
# that ever touches it. The value is NEVER echoed — not to stdout, not to stderr, not to a log.
# Only a length and a truncated SHA-256 fingerprint are reported.

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
    # Anything group/world accessible is already leaked; refuse rather than launder it.
    MODE="$(stat -f '%Lp' "$FILE" 2>/dev/null || stat -c '%a' "$FILE" 2>/dev/null || echo '')"
    [[ -n "$MODE" ]] || fail "cannot stat $FILE"
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
