#!/bin/bash
set -euo pipefail

# write-alias.sh — Safely write provider configuration to ~/.zshrc
# Usage: write-alias.sh <action> [args...]
# Actions: init, set-key, set-alias, remove-key, remove-alias
# set-key reads the secret from stdin: printf '%s' "$KEY" | write-alias.sh set-key VAR_NAME

ZSHRC="$HOME/.zshrc"
SECTION_START="# ========== Claude Code Provider Aliases =========="
SECTION_COMMENT="# Managed by brewtools:provider-switch — do not edit manually"
SECTION_END="# ========== End Claude Code Provider Aliases =========="

ACTION="${1:-}"
[[ -z "$ACTION" ]] && { echo "FAILED $ACTION — no action specified"; exit 1; }
shift

# Backup before any modification. The backup can contain API keys, so it is created
# under a private umask and force-chmodded — never left group/world readable.
backup_zshrc() {
  if [[ -f "$ZSHRC" ]]; then
    ( umask 077; cp "$ZSHRC" "$ZSHRC.bak" )
    chmod 600 "$ZSHRC.bak"
  fi
}

# Teardown paths must not leave a credential-bearing snapshot behind.
drop_backup() {
  rm -f "$ZSHRC.bak"
}

# Portable line delete (BSD and GNU): `sed -i ''` is BSD-only.
delete_lines() {
  local pattern="$1" tmp
  tmp=$(mktemp)
  awk -v pat="$pattern" '$0 !~ pat' "$ZSHRC" > "$tmp" && mv "$tmp" "$ZSHRC"
  chmod 600 "$ZSHRC"
}

# Insert a line immediately before the section end marker. Pure bash on purpose: `awk -v`
# runs escape processing over the assigned value, which eats the backslash in '\'' quoting
# and silently corrupts any key containing a single quote. It also keeps the value out of argv.
insert_before_end() {
  local line="$1" tmp l
  tmp=$(mktemp)
  while IFS= read -r l || [[ -n "$l" ]]; do
    [[ "$l" == "$SECTION_END" ]] && printf '%s\n' "$line"
    printf '%s\n' "$l"
  done < "$ZSHRC" > "$tmp"
  mv "$tmp" "$ZSHRC"
  chmod 600 "$ZSHRC"
}

# Check if section exists
section_exists() {
  [[ -f "$ZSHRC" ]] && grep -q "$SECTION_START" "$ZSHRC" 2>/dev/null
}

case "$ACTION" in
  init)
    if section_exists; then
      echo "OK init"
      exit 0
    fi
    backup_zshrc
    # Create file if missing
    [[ -f "$ZSHRC" ]] || touch "$ZSHRC"
    # Append section at end
    printf '\n%s\n%s\n%s\n' "$SECTION_START" "$SECTION_COMMENT" "$SECTION_END" >> "$ZSHRC"
    echo "OK init"
    ;;

  set-key)
    # Value comes from stdin, NEVER argv — argv is visible to `ps` and is logged verbatim.
    # Usage: printf '%s' "$KEY" | write-alias.sh set-key DEEPSEEK_API_KEY
    VAR="${1:-}"
    [[ -z "$VAR" ]] && { echo "FAILED set-key — no variable name"; exit 1; }
    if [[ -t 0 ]]; then
      echo "FAILED set-key — key must be piped on stdin, not passed as an argument"
      exit 1
    fi
    IFS= read -r VALUE || true
    VALUE="${VALUE%$'\r'}"
    [[ -z "$VALUE" ]] && { echo "FAILED set-key — empty value on stdin"; exit 1; }
    if ! section_exists; then
      echo "FAILED set-key — section not found, run init first"
      exit 1
    fi
    backup_zshrc
    # Single quotes with each `'` rewritten as '\'' — double quotes would expand a `$` or
    # backtick inside the key on every future shell start. The value goes to sed on stdin,
    # so it never lands in argv. (Quoted ${v//p/r} is not portable to bash 3.2.)
    ESCAPED=$(printf '%s' "$VALUE" | sed "s/'/'\\\\''/g")
    EXPORT_LINE="export ${VAR}='${ESCAPED}'"
    # Check if key already exists in section
    if grep -q "^export ${VAR}=" "$ZSHRC" 2>/dev/null; then
      delete_lines "^export ${VAR}="
    fi
    insert_before_end "$EXPORT_LINE"
    echo "OK set-key"
    ;;

  set-alias)
    NAME="${1:-}"
    BODY="${2:-}"
    [[ -z "$NAME" ]] && { echo "FAILED set-alias — no alias name"; exit 1; }
    [[ -z "$BODY" ]] && { echo "FAILED set-alias — no alias body"; exit 1; }
    if ! section_exists; then
      echo "FAILED set-alias — section not found, run init first"
      exit 1
    fi
    backup_zshrc
    # Build alias line — write via temp file to avoid sed escaping issues
    ALIAS_LINE="alias ${NAME}='${BODY}'"
    # Check if alias already exists
    if grep -q "^alias ${NAME}=" "$ZSHRC" 2>/dev/null; then
      delete_lines "^alias ${NAME}="
    fi
    insert_before_end "$ALIAS_LINE"
    echo "OK set-alias"
    ;;

  remove-key)
    VAR="${1:-}"
    [[ -z "$VAR" ]] && { echo "FAILED remove-key — no variable name"; exit 1; }
    if ! section_exists; then
      echo "OK remove-key"
      exit 0
    fi
    backup_zshrc
    # Remove matching export line
    delete_lines "^export ${VAR}="
    # The backup snapshotted the key we just removed — drop it.
    drop_backup
    echo "OK remove-key"
    ;;

  remove-alias)
    NAME="${1:-}"
    [[ -z "$NAME" ]] && { echo "FAILED remove-alias — no alias name"; exit 1; }
    if ! section_exists; then
      echo "OK remove-alias"
      exit 0
    fi
    backup_zshrc
    # Remove matching alias line
    delete_lines "^alias ${NAME}="
    # Teardown path — the backup still holds every configured key.
    drop_backup
    echo "OK remove-alias"
    ;;

  *)
    echo "FAILED $ACTION — unknown action"
    exit 1
    ;;
esac

exit 0
