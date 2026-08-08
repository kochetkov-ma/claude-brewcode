#!/bin/bash
# brewdoc:memory-sync-init generator script
# Resolves the TARGET repo ROOT (never a subdirectory) and emits a self-contained project-local
# .claude/skills/memory-sync/ into it, substituting the 8 SCALAR placeholders. The 12 multi-row BLOCK
# placeholders are filled by the AI via Edit (SKILL.md Phase 3); `validate` FAILS while any of them remain.
# Modes are documented in the usage block at the bottom of this file.
#
# SCALAR env overrides (each has a fallback in _scalar_default, none is ever left empty, newlines flattened):
#   PROJECT_NAME DEFAULT_BRANCH MEMORY_DIR GIT_VISIBILITY LANGUAGE_POLICY FOCUS_EMPHASIS SURFACE_COUNTS TRACKER_NOTE
# Other env: MEMORY_SYNC_ROOT=<abs path> explicit target root | MEMORY_SYNC_FORCE=1 emit over a live install
# (DESTROYS hand-edits).

set -euo pipefail

VERSION="1.0.0"
MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/memory-sync-init/scripts -> skills/memory-sync-init
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"

# Target paths are relative to the resolved ROOT (see resolve_root - every mode cd's there first).
TARGET=".claude/skills/memory-sync"
TARGET_REFS="$TARGET/references"
EMITTED_REFS="memory-guide.md agent-audit.md hard-sync.md"
EMITTED_N=3

STAMP_PREFIX="<!-- memory-sync template v"
# Runtime tokens the emitted skill resolves per RUN - allow-listed by validate, MUST survive emit.
RUNTIME_ALLOW="SCOPE FOCUS DEPTH BATCH FILE_LIST FACTS BROKEN_REFS DATE N M K"
# Every temp dir goes through $_bd; the trap makes leaks (and partial installs) impossible on any exit path.
_bd=""
trap '[ -n "$_bd" ] && rm -rf "$_bd" || true' EXIT
# Shared find pruning - node_modules/.git/dist/build/.next/vendor are never memory.
FIND_EXCL='-not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/.next/*" -not -path "*/vendor/*"'

# `find | sort` exits 0 on an empty result, so every listing goes through this helper: a bare
# `find ... || echo "(none)"` would never print the fallback. `|| true` is required - a missing dir
# makes find exit 1, and under `set -e` a failing command substitution in an assignment aborts.
_list() { _out=$(eval "$1" 2>/dev/null || true); if [ -n "$_out" ]; then printf '%s\n' "$_out"; else echo "${2:-(none)}"; fi; }

# Count lines of an eval'd listing, 0 when empty. Same `|| true` contract.
_count() { _o=$(eval "$1" 2>/dev/null || true); if [ -z "$_o" ]; then echo 0; else printf '%s\n' "$_o" | wc -l | tr -d ' '; fi; }

# Count *.md under a dir - no eval, the path is a real ARGUMENT (a dir name may contain quotes/`$()`).
_count_md() { { find "$1" -maxdepth "${2:-1}" -type f -name '*.md' 2>/dev/null || true; } | wc -l | tr -d ' '; }

validate_templates() {
  for t in "$REFS/SKILL.md.template" "$REFS/memory-guide.md" "$REFS/agent-audit.md" "$REFS/hard-sync.md"; do
    [ -f "$t" ] || { echo "❌ FAILED: emit template not found: $t - reinstall brewdoc"; exit 1; }
  done
}

# ── target root ─────────────────────────────────────────────────────────────────
# TARGET is relative, so running from a subdirectory would scan/emit/report the WRONG tree.
# Resolve the repo root explicitly and cd there; a non-git tree whose ancestor looks like the real
# root is a hard error rather than a silent second install.
resolve_root() {
  ROOT="${MEMORY_SYNC_ROOT:-}"
  [ -n "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -z "$ROOT" ]; then
    ROOT="$(pwd)"; _up="$ROOT"
    while [ "$_up" != "/" ]; do
      _up=$(dirname "$_up")
      [ -d "$_up/.claude" ] || [ -f "$_up/CLAUDE.md" ] || continue
      echo "❌ FAILED: $(pwd) is not a repo root (no git, but $_up looks like one)."
      echo "   Run from the project root, or set MEMORY_SYNC_ROOT=<abs path>."
      exit 1
    done
  fi
  [ -d "$ROOT" ] || { echo "❌ FAILED: target root does not exist: $ROOT"; exit 1; }
  cd "$ROOT"
  ROOT="$(pwd)"
}

# ── derivations shared by scan / emit / status ──────────────────────────────────
# NEVER silently return `main`: SKILL.md's Error Handling requires the AI to ASK when the default
# branch cannot be derived, and it can only ask if it can tell derivation failed.
derive_branch() {
  _b=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)
  for _r in $( { [ -n "$_b" ] || git remote 2>/dev/null || true; } ); do
    _b=$(git symbolic-ref --short "refs/remotes/$_r/HEAD" 2>/dev/null || true)
    [ -n "$_b" ] && break
  done
  [ -z "$_b" ] || { printf '%s\n' "${_b#*/}"; return 0; }
  # No remote HEAD: a repo with exactly one local branch derives unambiguously (e.g. `develop`).
  _heads=$( { git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null || true; } )
  if [ -n "$_heads" ] && [ "$(printf '%s\n' "$_heads" | wc -l | tr -d ' ')" -eq 1 ]
  then printf '%s\n' "$_heads"
  else echo "UNDERIVABLE"
  fi
}

# A non-git dir and a commit-less repo are NOT `git-ignored` - reporting them as such bakes a false
# house fact into the emitted skill and breaks its `branch` scope.
derive_git_visibility() {
  git rev-parse --git-dir >/dev/null 2>&1 || { echo "not-a-git-repo"; return 0; }
  _rows=$( { git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$_rows" -gt 0 ]; then echo "git-tracked"; return 0; fi
  git rev-parse --verify HEAD >/dev/null 2>&1 || { echo "no-commits"; return 0; }
  echo "git-ignored"
}

# Claude Code encodes a project dir as its absolute path with `/` (and `.`) replaced by `-`.
# Only THAT dir may be reported - the old unfiltered glob returned a foreign project's memory.
derive_memory_dir() {
  for _s in .claude/settings.json .claude/settings.local.json; do
    [ -f "$_s" ] || continue
    # jq first: grep+sed truncates an escaped quote and misses a pretty-printed file.
    _m=""
    command -v jq >/dev/null 2>&1 && _m=$(jq -r '.autoMemoryDirectory // empty' "$_s" 2>/dev/null || true)
    [ -n "$_m" ] || _m=$(grep -o '"autoMemoryDirectory"[[:space:]]*:[[:space:]]*"[^"]*"' "$_s" 2>/dev/null | head -1 | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//' || true)
    [ -z "$_m" ] || { printf '%s\n' "$_m"; return 0; }
  done
  _enc=$(printf '%s' "$ROOT" | tr '/' '-')
  for _d in "$HOME/.claude/projects/$_enc/memory" "$HOME/.claude/projects/$(printf '%s' "$_enc" | tr '.' '-')/memory"; do
    [ -d "$_d" ] || continue; printf '%s\n' "$_d"; return 0
  done
  echo "none"
}

derive_tracker_note() {
  if [ -d .claude/features ]; then echo ".claude/features/** is operational task state - owned by the task board, excluded"
  elif [ -d .github ];        then echo ".github/ issue tracker owns operational task state - excluded"
  else echo "none"; fi
}

# Per-batch counts. The emitted skill dir is excluded EVERYWHERE (scan, emit stamp, status) so all three
# agree: it does not exist at analysis time, so counting it later would make every fresh install look
# drifted. The emitted skill's Phase 4 subtracts its own files before comparing, for the same reason.
count_root_md()   { _count "find . -maxdepth 1 -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' -o -name 'CONVENTIONS.md' -o -name 'CONTRIBUTING.md' \\)"; }
count_nested_md() { _count "find . -mindepth 2 -type f -name 'CLAUDE.md' $FIND_EXCL"; }
count_agents_md() { _count "find . \\( -type f -o -type l \\) -name 'AGENTS.md' $FIND_EXCL"; }
count_skills()    { { find .claude/skills -type f -name '*.md' -not -path '*/memory-sync/*' 2>/dev/null || true; } | wc -l | tr -d ' '; }

derive_surface_counts() {
  _r=$(count_root_md); _n=$(count_nested_md); _a=$(count_agents_md); _u=$(_count_md .claude/rules)
  _c=$(_count_md .claude/convention); _g=$(_count_md .claude/agents); _s=$(count_skills)
  _tot=$((_r + _n + _a + _u + _c + _g + _s))
  echo "$_tot files: $_r root, $_n nested CLAUDE.md, $_a AGENTS.md, $_u rules, $_c conventions, $_g agents, $_s skill files"
}

surface_total() { derive_surface_counts | cut -d' ' -f1; }

# ── unresolved-token scan (ONE implementation - validate and status MUST agree) ──
# Matches \{[A-Z_]+\}, IGNORES a `$`-prefixed occurrence (${CLAUDE_SKILL_DIR} is a shell expansion,
# not a placeholder) and allow-lists the runtime tokens the emitted skill resolves per run.
_emitted_files() { echo "$TARGET/SKILL.md"; for r in $EMITTED_REFS; do echo "$TARGET_REFS/$r"; done; }

_open_tokens() {
  _emitted_files | while IFS= read -r f; do
    [ -f "$f" ] || continue
    awk -v allow="$RUNTIME_ALLOW" '
      BEGIN { n = split(allow, a, " "); for (i = 1; i <= n; i++) ok[a[i]] = 1 }
      {
        line = $0; pos = 1
        while (match(substr(line, pos), /\{[A-Z_]+\}/)) {
          s = pos + RSTART - 1; tok = substr(line, s, RLENGTH)
          prev = (s > 1) ? substr(line, s - 1, 1) : ""; name = substr(tok, 2, length(tok) - 2)
          if (prev != "$" && !(name in ok)) print FILENAME ":" FNR ": " tok
          pos = s + RLENGTH
        }
      }
    ' "$f" || true
  done
}

# ── scan ────────────────────────────────────────────────────────────────────────
# path :: name: :: description: for a set of frontmatter-carrying md files (agents and skills alike).
_fm_field() { grep -m1 "^$2:" "$1" 2>/dev/null | sed "s/^$2:[[:space:]]*//" | cut -c1-200 || true; }
_hdr() { printf '\n--- %s ---\n' "$1"; }

_fm_list() {
  _any=0
  for f in "$@"; do
    [ -f "$f" ] || continue
    _any=1
    printf '%s :: %s :: %s\n' "$f" "$(_fm_field "$f" name)" "$(_fm_field "$f" description)"
  done
  [ "$_any" -eq 0 ] && echo "(none)"
  return 0
}

scan_target() {
  echo "=== memory-sync-init: target scan ==="
  echo "Target: $ROOT"
  _hdr "CLAUDE.md tree (root + nested, any depth)"
  _list "find . -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' \\) $FIND_EXCL | sort"

  _hdr "AGENTS.md family (SYMLINK / vendor-marked = VERIFY-ONLY)"
  _list "find . \\( -type f -o -type l \\) -name 'AGENTS.md' $FIND_EXCL | sort" | while IFS= read -r f; do
    [ -e "$f" ] || [ -L "$f" ] || { echo "$f"; continue; }   # the "(none)" fallback row
    if [ -L "$f" ]; then echo "$f :: SYMLINK -> $(readlink "$f" 2>/dev/null || echo '?') :: VERIFY-ONLY (another tool owns it)"; continue; fi
    _first=$(grep -m1 -v '^[[:space:]]*$' "$f" 2>/dev/null || true)
    _last=$(grep -v '^[[:space:]]*$' "$f" 2>/dev/null | tail -1 || true)
    case "$_first" in
      *"<!-- BEGIN"*)
        case "$_last" in
          *"END"*"-->"*) echo "$f :: VENDOR-MARKED (whole body inside BEGIN/END markers) :: VERIFY-ONLY" ;;
          *)             echo "$f :: BEGIN marker with no closing END on the last line :: inspect before editing" ;;
        esac ;;
      *) echo "$f :: plain file :: editable" ;;
    esac
  done

  _hdr "Rules (.claude/rules/) :: lines :: paths:"
  _anyrule=0
  for f in .claude/rules/*.md; do
    [ -f "$f" ] || continue
    _anyrule=1
    # awk counts a final line with no trailing newline; `|| echo ?` keeps an unreadable file from aborting scan.
    _ln=$(awk 'END { print NR }' "$f" 2>/dev/null || echo "?")
    _paths=$(grep -m1 '^paths:' "$f" 2>/dev/null | sed 's/^paths:[[:space:]]*//' || true)
    [ -n "$_paths" ] || _paths="(no paths:)"
    printf '%s :: %s lines :: %s\n' "$f" "$_ln" "$_paths"
  done
  [ "$_anyrule" -eq 0 ] && echo "(none)"

  _hdr "Conventions"
  _list "find .claude/convention -maxdepth 1 -type f -name '*.md' | sort"
  _list "find . -maxdepth 1 -type f \\( -name 'CONVENTIONS.md' -o -name 'CONTRIBUTING.md' \\) | sort" "(no root CONVENTIONS.md / CONTRIBUTING.md)"

  _hdr "Agents (.claude/agents/) :: name :: description"
  _fm_list .claude/agents/*.md
  _na=$(_count_md .claude/agents)
  echo "agents=$_na"
  [ "$_na" -eq 0 ] && echo "⚠️ NO .claude/agents/ - the agent batch is dropped from {BATCH_TABLE} and the re-audit reduces to skills"

  _hdr "Skills (.claude/skills/) :: name :: description"
  _fm_list .claude/skills/*/SKILL.md
  echo "skill_md_files=$(count_skills)"

  _hdr "Hooks reacting to memory edits (informational - NEVER edited)"
  _list "find .claude/hooks -maxdepth 1 -type f | sort" "(no .claude/hooks/)"
  _list "grep -n '\"\\(PreToolUse\\|PostToolUse\\|UserPromptSubmit\\|SessionStart\\|Stop\\|SubagentStop\\)\"' .claude/settings.json" "(no hook registrations in .claude/settings.json)"

  _hdr "Tracker"
  test -d .claude/features && echo "✅ .claude/features/ present" || echo "- no .claude/features/"
  test -d .github && echo "✅ .github/ present" || echo "- no .github/"

  _hdr "Derived values (pass these back as env vars to emit)"
  echo "DEFAULT_BRANCH=$(derive_branch)"
  echo "GIT_VISIBILITY=$(derive_git_visibility)"
  echo "MEMORY_DIR=$(derive_memory_dir)"
  echo "TRACKER_NOTE=$(derive_tracker_note)"
  echo "SURFACE_COUNTS=$(derive_surface_counts)"
  echo "PROJECT_NAME=$(basename "$ROOT")"
}

# ── scalar resolution ───────────────────────────────────────────────────────────
SCALAR_KEYS="PROJECT_NAME DEFAULT_BRANCH MEMORY_DIR GIT_VISIBILITY LANGUAGE_POLICY FOCUS_EMPHASIS SURFACE_COUNTS TRACKER_NOTE"

_scalar_default() {
  case "$1" in
    PROJECT_NAME)    basename "$ROOT" ;;
    DEFAULT_BRANCH)  derive_branch ;;
    MEMORY_DIR)      echo "none" ;;
    GIT_VISIBILITY)  derive_git_visibility ;;
    LANGUAGE_POLICY) echo "English everywhere; non-English trigger aliases are legal ONLY inside agent/skill \`description:\` fields" ;;
    FOCUS_EMPHASIS)  echo "default ordering: facts > dedup > compression" ;;
    SURFACE_COUNTS)  derive_surface_counts ;;
    TRACKER_NOTE)    echo "none" ;;
  esac
}

# Never let an empty env var blank a placeholder: every fallback that fires is logged. A newline inside
# a scalar would split the provenance stamp (and the emitted line it lands on), so it is flattened here.
resolve_scalars() {
  _fellback=""
  for k in $SCALAR_KEYS; do
    eval "_v=\${$k:-}"
    [ -n "$_v" ] || { _v=$(_scalar_default "$k"); _fellback="$_fellback  - $k -> $_v
"; }
    _flat=$(printf '%s' "$_v" | tr '\n\r' '  ')
    [ "$_flat" = "$_v" ] || { _v="$_flat"; echo "⚠️ $k contained a newline - flattened to a single line"; }
    eval "$k=\$_v"
    eval "export $k"
  done
}

# Literal (non-regex, non-sed) substitution: awk reads values from ENVIRON, so `/`, `&` and `\` inside a
# value are inserted verbatim. SINGLE PASS - each line is scanned once and the substituted value lands in
# an output buffer that is never re-scanned, so a value containing `{OTHER_KEY}` is not re-expanded.
_subst() {
  awk -v keys="$SCALAR_KEYS" '
    BEGIN { nk = split(keys, k, " "); for (i = 1; i <= nk; i++) have[k[i]] = 1 }
    {
      line = $0; out = ""
      while (match(line, /\{[A-Z_]+\}/)) {
        tok = substr(line, RSTART, RLENGTH)
        name = substr(tok, 2, RLENGTH - 2)
        out = out substr(line, 1, RSTART - 1) ((name in have) ? ENVIRON[name] : tok)
        line = substr(line, RSTART + RLENGTH)
      }
      print out line
    }
  ' "$1" > "$2"
}

# ── emit ────────────────────────────────────────────────────────────────────────
# ATOMIC: the whole tree is built in a staging dir on the SAME filesystem and renamed into place last.
# A failure half-way therefore leaves NO partial install - which matters because the refusal guard keys
# on SKILL.md, and a stray one would push the user to MEMORY_SYNC_FORCE=1 (the flag that destroys edits).
# Every write on the emit path routes its failure here: under `set -e` a bare `mktemp`/`cp`/redirect
# failure would abort BEFORE the guard below and the user would never see the friendly message.
_emit_abort() {
  echo "❌ FAILED: cannot install into $TARGET (permissions?) - NOTHING was written, no partial install to force past"
  exit 1
}

emit_skill() {
  echo "=== memory-sync-init: emit ==="
  validate_templates

  if [ -f "$TARGET/SKILL.md" ] && [ "${MEMORY_SYNC_FORCE:-0}" != "1" ]; then
    echo "❌ FAILED: memory-sync is already installed at $TARGET/SKILL.md"
    echo "   Use the AI-driven \`upgrade\` mode to refresh it (hand-edits preserved), or"
    echo "   \`generate.sh status\` to see its drift. MEMORY_SYNC_FORCE=1 overwrites and DESTROYS hand-edits."
    exit 1
  fi

  resolve_scalars
  _parent=$(dirname "$TARGET")
  mkdir -p "$_parent" || _emit_abort
  _bd=$(mktemp -d "$ROOT/$_parent/.memory-sync-emit.XXXXXX" 2>/dev/null) || _emit_abort
  _stage="$_bd/memory-sync"
  mkdir -p "$_stage/references" || _emit_abort

  _subst "$REFS/SKILL.md.template" "$_stage/SKILL.md" || _emit_abort
  # Provenance stamp - LAST line of the emitted SKILL.md; `status` and `upgrade` read it.
  printf '\n%s%s emitted %s by brewdoc:memory-sync-init | surface: %s -->\n' \
    "$STAMP_PREFIX" "$VERSION" "$(date +%F)" "$SURFACE_COUNTS" >> "$_stage/SKILL.md" || _emit_abort
  for r in $EMITTED_REFS; do cp "$REFS/$r" "$_stage/references/$r" || _emit_abort; done

  { rm -rf "$TARGET" && mv "$_stage" "$TARGET"; } || _emit_abort
  rm -rf "$_bd"; _bd=""

  echo "✅ $TARGET/SKILL.md ($(awk 'END { print NR }' "$TARGET/SKILL.md") lines, stamped v$VERSION)"
  for r in $EMITTED_REFS; do
    echo "✅ $TARGET_REFS/$r ($(awk 'END { print NR }' "$TARGET_REFS/$r") lines, verbatim)"
  done

  echo ""
  echo "Scalars applied:"
  for k in $SCALAR_KEYS; do
    eval "_v=\${$k}"
    printf '  %s = %s\n' "$k" "$_v"
  done
  if [ -n "$_fellback" ]
  then echo "Fallbacks that fired (env var unset or empty):"; printf '%s' "$_fellback"
  else echo "Fallbacks that fired: none (all 8 scalars came from the environment)"
  fi

  echo ""
  echo "Next: AI fills the BLOCK placeholders via Edit (SKILL.md Phase 3) - validate FAILS until then."
}

# ── validate ────────────────────────────────────────────────────────────────────
validate_emit() {
  echo "=== memory-sync-init: validate ==="
  _errors=0

  # (1) every emitted file present
  _missing=0
  [ -f "$TARGET/SKILL.md" ] || { echo "❌ FAILED: missing emitted file: $TARGET/SKILL.md - run 'generate.sh emit' first"; _missing=1; _errors=$((_errors+1)); }
  for r in $EMITTED_REFS; do
    if [ ! -f "$TARGET_REFS/$r" ]; then echo "❌ FAILED: missing emitted file: $TARGET_REFS/$r"; _missing=1; _errors=$((_errors+1)); fi
  done
  [ "$_missing" -eq 0 ] && echo "✅ all emitted files present (SKILL.md + $EMITTED_N references)"

  [ -f "$TARGET/SKILL.md" ] || { echo "❌ FAILED: $TARGET/SKILL.md absent - remaining checks skipped"; exit "$_errors"; }

  # (2) unresolved {PLACEHOLDER} across SKILL.md + every emitted reference
  _unresolved=$(_open_tokens)
  if [ -n "$_unresolved" ]; then
    echo "❌ FAILED: unresolved setup-time placeholders (AI must fill the BLOCKs via Edit - SKILL.md Phase 3):"
    printf '%s\n' "$_unresolved" | sed 's/^/   /'; _errors=$((_errors+1))
  else
    echo "✅ no unresolved placeholders (runtime allow-list: $RUNTIME_ALLOW)"
  fi

  # (3) references, BOTH directions: every cited references/*.md exists, every emitted one is cited.
  _refbad=0
  for c in $(grep -oE 'references/[A-Za-z0-9._-]+\.md' "$TARGET/SKILL.md" | sort -u || true); do
    [ -f "$TARGET/$c" ] && continue
    _ln=$(grep -nF "$c" "$TARGET/SKILL.md" | head -1 | cut -d: -f1 || true)
    echo "❌ FAILED: $TARGET/SKILL.md:${_ln:-?}: cites $c which does not exist"
    _refbad=1; _errors=$((_errors+1))
  done
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] || continue
    if ! grep -qF "references/$r" "$TARGET/SKILL.md"; then
      echo "❌ FAILED: $TARGET_REFS/$r is emitted but never cited by $TARGET/SKILL.md"
      _refbad=1; _errors=$((_errors+1))
    fi
  done
  [ "$_refbad" -eq 0 ] && echo "✅ references consistent both ways (every citation resolves, every emitted reference is cited)"

  # (4) provenance stamp, on the LAST line
  _lastline=$(tail -1 "$TARGET/SKILL.md")
  case "$_lastline" in
    "$STAMP_PREFIX"*) echo "✅ provenance stamp present: $_lastline" ;;
    *)
      if grep -qF "$STAMP_PREFIX" "$TARGET/SKILL.md"
      then echo "❌ FAILED: $TARGET/SKILL.md: provenance stamp is not the LAST line"
      else echo "❌ FAILED: $TARGET/SKILL.md: provenance stamp absent (expected a last line starting '$STAMP_PREFIX')"
      fi
      _errors=$((_errors+1)) ;;
  esac

  if [ "$_errors" -eq 0 ]; then echo "✅ validate PASSED"; else echo "❌ FAILED: $_errors check(s) failed"; fi
  exit "$_errors"
}

# ── status ──────────────────────────────────────────────────────────────────────
# Read-only, always exit 0. PURE KEY=value (no banner, every key unique) so a naive parser keeps every row.
status_report() {
  echo "TARGET=$ROOT"
  echo "SKILL_PATH=$ROOT/$TARGET"

  if [ ! -f "$TARGET/SKILL.md" ]; then
    # Same KEY set as the installed branch - a parser keyed on any row must not go blind on a fresh target.
    echo "INSTALLED=no"; echo "STAMP_VERSION=none"; echo "STAMP_DATE=none"; echo "STAMP_SURFACE=none"
    echo "SURFACE_FILES_NOW=$(surface_total)"; echo "SURFACE_FILES_STAMPED=unknown"
    echo "MISSING_FILES=$(( 1 + EMITTED_N ))"
    echo "OPEN_PLACEHOLDERS=$( { _open_tokens || true; } | awk '{ print $NF }' | sort -u | wc -l | tr -d ' ')"
    echo "DEFAULT_BRANCH=$(derive_branch)"; echo "GIT_VISIBILITY=$(derive_git_visibility)"
    echo "DRIFTS=0"; echo "VERDICT=NOT INSTALLED"
    return 0
  fi

  echo "INSTALLED=yes"
  _drifts=0

  _stamp=$(grep -F "$STAMP_PREFIX" "$TARGET/SKILL.md" | tail -1 || true)
  if [ -z "$_stamp" ]; then
    _sv=UNSTAMPED; _sd=UNSTAMPED; _ss=UNSTAMPED; _stamped_n=unknown
  else
    _sv=$(printf '%s\n' "$_stamp" | sed -e "s|^${STAMP_PREFIX}||" -e 's/ .*//')
    _sd=$(printf '%s\n' "$_stamp" | sed -e 's/.* emitted //' -e 's/ .*//')
    _ss=$(printf '%s\n' "$_stamp" | sed -e 's/.*| surface: //' -e 's/ -->$//')
    _stamped_n=$(printf '%s\n' "$_ss" | grep -oE '^[0-9]+' || true)
    [ -n "$_stamped_n" ] || _stamped_n=unknown
    [ "$_sv" = "$VERSION" ] || { echo "NOTE_VERSION=template version moved $_sv -> $VERSION"; _drifts=$((_drifts+1)); }
  fi
  echo "STAMP_VERSION=$_sv"; echo "STAMP_DATE=$_sd"; echo "STAMP_SURFACE=$_ss"

  _now=$(surface_total)
  echo "SURFACE_FILES_NOW=$_now"
  echo "SURFACE_FILES_STAMPED=$_stamped_n"
  if [ "$_stamped_n" != "unknown" ] && [ "$_stamped_n" -ne "$_now" ]; then
    echo "NOTE_SURFACE=surface moved $_stamped_n -> $_now files"; _drifts=$((_drifts+1))
  fi

  _miss=0; _misslist=""
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] || { _misslist="$_misslist${_misslist:+, }$TARGET_REFS/$r"; _miss=$((_miss+1)); }
  done
  [ "$_miss" -eq 0 ] || echo "NOTE_MISSING=$_misslist"
  echo "MISSING_FILES=$_miss"
  _drifts=$((_drifts + _miss))

  # Same file list as validate - counting SKILL.md alone let 2 open blocks in hard-sync.md report IN SYNC.
  _open=$( { _open_tokens || true; } | awk '{ print $NF }' | sort -u | wc -l | tr -d ' ')
  echo "OPEN_PLACEHOLDERS=$_open"
  [ "$_open" -gt 0 ] && _drifts=$((_drifts + _open))

  echo "DEFAULT_BRANCH=$(derive_branch)"; echo "GIT_VISIBILITY=$(derive_git_visibility)"; echo "DRIFTS=$_drifts"
  if [ "$_drifts" -eq 0 ]; then echo "VERDICT=IN SYNC"; else echo "VERDICT=STALE ($_drifts drifts)"; fi
  return 0
}

case "$MODE" in
  scan)     resolve_root; scan_target ;;
  emit)     resolve_root; emit_skill ;;
  validate) resolve_root; validate_emit ;;
  status)   resolve_root; status_report ;;
  *)
    echo "Usage: generate.sh <scan|emit|validate|status>   (default: emit)"
    echo "  scan      read-only surface report + derived DEFAULT_BRANCH= / GIT_VISIBILITY= / MEMORY_DIR= /"
    echo "            TRACKER_NOTE= / SURFACE_COUNTS= / PROJECT_NAME= for pass-back to emit"
    echo "  emit      atomically write $TARGET (refuses to overwrite; MEMORY_SYNC_FORCE=1 overrides)"
    echo "  validate  fail on unresolved {PLACEHOLDER}, missing file, broken reference, missing stamp"
    echo "  status    machine-greppable KEY=value drift report, always exit 0"
    exit 1
    ;;
esac
