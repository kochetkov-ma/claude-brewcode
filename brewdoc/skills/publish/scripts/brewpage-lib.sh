#!/usr/bin/env bash
# brewpage-lib.sh — sourced by every publish block in brewdoc:publish/SKILL.md.
#
# Owns the two things every block got wrong on its own: where the token-bearing
# history file lives (BD03) and whether the prompt-derived query parameters are
# safe to put in a URL (BD02). Sourced, not executed — it sets HISTORY_FILE and
# defines helpers in the caller's shell.

# Project root, canonical recipe: CLAUDE_PROJECT_DIR -> git toplevel -> upward
# walk for .git/.claude -> PWD. The history file must not follow a nested cwd.
bp_project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"
    return 0
  fi
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null) || root=""
  if [ -n "$root" ]; then
    printf '%s\n' "$root"
    return 0
  fi
  local d="$PWD"
  while [ "$d" != "/" ]; do
    if [ -d "$d/.git" ] || [ -d "$d/.claude" ]; then
      printf '%s\n' "$d"
      return 0
    fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"
}

BP_ROOT="$(bp_project_root)"
HISTORY_FILE="$BP_ROOT/.claude/brewpage-history.md"
BP_TMPDIR="$BP_ROOT/.claude/tmp"

# Creates the history file if absent, keeps it mode 600, and makes sure git
# never picks it up — the skill used to only *ask* the user to keep it private.
bp_history_init() {
  mkdir -p "$(dirname "$HISTORY_FILE")" "$BP_TMPDIR" || return 1
  if [ ! -f "$HISTORY_FILE" ]; then
    cat > "$HISTORY_FILE" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place republish (html/json/kv/sites all support PUT). Keep this file private.
> Delete: `curl -s -X DELETE "https://brewpage.app/api/<ns>/<id>" -H "X-Owner-Token: TOKEN"`
> Delete a site: `curl -s -X DELETE "https://brewpage.app/api/sites/<ns>/<id>" -H "X-Owner-Token: TOKEN"`
> Update a site (same URL): `PUT /api/sites/<ns>/<id>` with `X-Owner-Token: TOKEN` + the new bundle.

| Date | URL | Owner Token | TTL | Type |
|------|-----|-------------|-----|------|
HEADER
  fi
  chmod 600 "$HISTORY_FILE" 2>/dev/null || true
  bp_gitignore_entry '.claude/brewpage-history.md'
  bp_gitignore_entry '.claude/tmp/'
}

bp_gitignore_entry() {
  local line="$1" gi="$BP_ROOT/.gitignore"
  # `.git` is a FILE in a worktree and in a submodule, so `-d` misses both and the owner tokens
  # end up committable. `rev-parse --git-dir` is correct for plain, worktree and nested checkouts.
  git -C "$BP_ROOT" rev-parse --git-dir >/dev/null 2>&1 || [ -f "$gi" ] || return 0
  if [ -f "$gi" ] && grep -qxF "$line" "$gi"; then
    return 0
  fi
  printf '%s\n' "$line" >> "$gi"
}

bp_history_append() {
  printf '| %s | [%s](%s) | `%s` | %sd | %s |\n' \
    "$(date '+%Y-%m-%d %H:%M')" "$1" "$1" "$2" "$3" "$4" >> "$HISTORY_FILE"
}

# BD02: ns/ttl/entry reach the shell as literals inside single quotes, so they
# never expand; these re-check them as data before they reach the URL.
bp_validate() {
  local ns="$1" days="$2" entry="$3"
  case "$ns" in
    *[!A-Za-z0-9-]* | '') echo "FAILED: namespace must be 3-32 chars of A-Za-z0-9-"; return 1 ;;
  esac
  [ "${#ns}" -ge 3 ] && [ "${#ns}" -le 32 ] || { echo "FAILED: namespace must be 3-32 chars"; return 1; }
  case "$days" in
    '' | *[!0-9]*) echo "FAILED: ttl must be a positive integer"; return 1 ;;
  esac
  [ "$days" -ge 1 ] || { echo "FAILED: ttl must be >= 1"; return 1; }
  if [ -n "$entry" ]; then
    case "$entry" in
      *[!A-Za-z0-9._/-]* | */../* | ../* | */..) echo "FAILED: entry must be a plain relative file name"; return 1 ;;
    esac
  fi
  return 0
}

# Allocate before writing inputs; only the generated ASCII basename is substituted into blocks.
bp_prepare() {
  mkdir -p "$BP_TMPDIR" || return 1
  (umask 077; mktemp -d "$BP_TMPDIR/brewpage.XXXXXX")
}

bp_run_dir() {
  local id="${1:-}"
  case "$id" in
    brewpage.??????) : ;;
    *) echo "FAILED: invalid publish run id"; return 1 ;;
  esac
  case "$id" in *[!A-Za-z0-9.]*) echo "FAILED: invalid publish run id"; return 1 ;; esac
  BP_RUN_DIR="$BP_TMPDIR/$id"
  [ -d "$BP_RUN_DIR" ] && [ ! -L "$BP_RUN_DIR" ] && [ -O "$BP_RUN_DIR" ] &&
    [ -n "$(find "$BP_RUN_DIR" -maxdepth 0 -type d -perm 0700 -print)" ] || {
      echo "FAILED: publish run directory must be owned, private and non-symlink"; return 1;
    }
}

bp_cleanup() {
  [ -n "${BP_RUN_DIR:-}" ] || return 0
  bp_run_dir "${BP_RUN_DIR##*/}" || return 1
  rm -rf -- "$BP_RUN_DIR"
}

# Prelude: explicit run id/password policy, no implicit shared credential discovery.
bp_begin() {
  NS="$1"; DAYS="$2"; ENTRY="$3"
  bp_run_dir "${4:-}" || return 1
  trap bp_cleanup EXIT
  trap 'exit 1' HUP INT TERM
  bp_validate "$NS" "$DAYS" "$ENTRY" || return 1
  case "${5:-}" in none|file) BP_PASSWORD_MODE="$5" ;; *) echo "FAILED: explicit password mode required"; return 1 ;; esac
  bp_history_init || { echo "FAILED: cannot initialize history file"; return 1; }
  command -v jq >/dev/null || { echo "FAILED: jq required"; return 1; }
  BP_HEADER_FILE=""
  if [ "$BP_PASSWORD_MODE" = file ]; then
    local source_file="$BP_RUN_DIR/brewpage-password-source.txt" password_source=""
    [ -f "$source_file" ] && [ ! -L "$source_file" ] || { echo "FAILED: password source path file missing or unsafe"; return 1; }
    IFS= read -r password_source < "$source_file" || [ -n "$password_source" ] || return 1
    [ -f "$password_source" ] && [ ! -L "$password_source" ] || { echo "FAILED: password source must be a non-symlink regular file"; return 1; }
    local password_file="$BP_RUN_DIR/brewpage-password.txt"
    [ ! -e "$password_file" ] && [ ! -L "$password_file" ] || { echo "FAILED: password transport file already exists"; return 1; }
    (umask 077; cat -- "$password_source" > "$password_file") || return 1
    BP_HEADER_FILE="$BP_RUN_DIR/password-header.txt"
    (umask 077; jq -ner --rawfile password "$password_file" '
      ($password | rtrimstr("\n")) as $p |
      if ($p | length) >= 4 and ($p | explode | all(. >= 32 and . != 127))
      then "X-Password: " + $p else error("invalid password") end
    ' > "$BP_HEADER_FILE") 2>/dev/null || { echo "FAILED: password must have at least 4 characters and no control characters"; return 1; }
  fi
}

# curl reads the header file; neither shell argv nor output contains the password.
# A function has its own positional parameters, so no `set --` juggling is needed.
bp_post() {
  local url="$1"
  shift
  if [ -n "$BP_HEADER_FILE" ]; then
    curl -s -X POST "$url" -H "@$BP_HEADER_FILE" "$@"
  else
    curl -s -X POST "$url" "$@"
  fi
}

# The tail every block shares: URL out, owner token to history, one OK/FAILED line.
# `site` is the only type whose response carries .fileCount.
bp_finish() {
  local response="$1" days="$2" type="$3" url token fcount
  url=$(printf '%s' "$response" | jq -r '.link // empty')
  url="${url%/}"  # /public/<id>/ routes to the brewpage landing page instead of the site
  [ -n "$url" ] || { echo "FAILED: publish rejected (no .link in response)"; return 1; }
  token=$(printf '%s' "$response" | jq -r '.ownerToken // empty')
  if [ "$type" = site ]; then
    fcount=$(printf '%s' "$response" | jq -r '.fileCount // "?"')
    [ -n "$token" ] && bp_history_append "$url" "$token" "$days" "site ($fcount files)"
    echo "OK $url | Files: $fcount"
  else
    [ -n "$token" ] && bp_history_append "$url" "$token" "$days" "$type"
    echo "OK $url"
  fi
}

# Verdict on a publish.mjs run, shared by both site blocks. Sets ENTRY from the
# manifest on success; returns 2 (needs a human OK) or 1 (nothing verified), and
# in both cases removes the archive it was given, so curl is never reached.
bp_archive_gate() {
  local rc="$1" manifest="$2" zip="$3"
  if [ "$rc" -eq 2 ] && [ "${BREWPAGE_CONFIRMED:-0}" != "1" ]; then
    [ -n "$zip" ] && rm -f "$zip"
    echo "CONFIRM: flagged entries listed above — ask the user, then re-run with BREWPAGE_CONFIRMED=1"
    return 2
  fi
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 2 ]; then
    [ -n "$zip" ] && rm -f "$zip"
    echo "FAILED: archive not verified (publish.mjs exit $rc) — nothing was uploaded"
    return 1
  fi
  ENTRY=$(printf '%s\n' "$manifest" | sed -n 's/^ENTRY: //p')
}
