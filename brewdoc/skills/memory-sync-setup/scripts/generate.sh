#!/bin/bash
# brewdoc:memory-sync-setup generator script
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

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/memory-sync-setup/scripts -> skills/memory-sync-setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"
PLUGIN_JSON="$SKILL_DIR/../../.claude-plugin/plugin.json"

# The artifact stamp carries the PLUGIN version - there is no private template version any more.
# Resolved by self-location, never hardcoded; jq when present, grep+sed otherwise.
resolve_plugin_version() {
  [ -f "$PLUGIN_JSON" ] || { echo "unknown"; return 0; }
  _v=""
  command -v jq >/dev/null 2>&1 && _v=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
  [ -n "$_v" ] || _v=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_JSON" 2>/dev/null | head -1 | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//' || true)
  [ -n "$_v" ] || _v="unknown"
  printf '%s\n' "$_v"
}
VERSION=$(resolve_plugin_version)

# content_version has no plugin.json field - it is this GENERATOR's own last-changed release,
# self-located from the brewcode-meta marker bump-version.sh stamps into this SKILL.md
# (STAMPED_FILES, kind marker) - same pattern as docsync-setup's INSTALL.md config block.
resolve_content_version() {
  [ -f "$SKILL_DIR/SKILL.md" ] || { echo "unknown"; return 0; }
  _cv=$(grep -m1 'brewcode-meta:' "$SKILL_DIR/SKILL.md" 2>/dev/null | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
  [ -n "$_cv" ] || _cv="unknown"
  printf '%s\n' "$_cv"
}
CONTENT_VERSION=$(resolve_content_version)

# Target paths are relative to the resolved ROOT (see resolve_root - every mode cd's there first).
TARGET=".claude/skills/memory-sync"
TARGET_REFS="$TARGET/references"
EMITTED_REFS="memory-guide.md agent-audit.md hard-sync.md"
EMITTED_N=3

# Provenance lives in the emitted SKILL.md's YAML FRONTMATTER (the artifact-metadata standard):
# doc_type / version / content_version / generated_by / last_updated, then the skill-specific surface_files.
META_DOC_TYPE="llm"
META_GENERATED_BY="brewdoc:memory-sync-setup"
META_KEYS="doc_type version content_version generated_by last_updated surface_files"
# Pre-5.0 installs stamped a tail comment instead. Kept ONLY to recognise them and report stale-legacy.
LEGACY_STAMP_PREFIX="<!-- memory-sync template v"
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
  # A stamp is only worth writing if it names a real plugin version.
  [ "$VERSION" != "unknown" ] || { echo "❌ FAILED: cannot read .version from $PLUGIN_JSON - reinstall brewdoc"; exit 1; }
  [ "$CONTENT_VERSION" != "unknown" ] || { echo "❌ FAILED: cannot read content_version from $SKILL_DIR/SKILL.md - reinstall brewdoc"; exit 1; }
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
# house fact into the emitted skill and breaks its `branch` scope. Tracked rows are compared against
# what is actually on disk: a SINGLE tracked row used to label the whole surface `git-tracked`, which
# drops the "VERIFY must re-read files directly" guidance in exactly the mixed case that needs it.
derive_git_visibility() {
  git rev-parse --git-dir >/dev/null 2>&1 || { echo "not-a-git-repo"; return 0; }
  _rows=$( { git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$_rows" -eq 0 ]; then
    git rev-parse --verify HEAD >/dev/null 2>&1 || { echo "no-commits"; return 0; }
    echo "git-ignored"; return 0
  fi
  # Same surface as the pathspec above (`*CLAUDE.md` matches at any depth in both git and find).
  # SET DIFFERENCE on paths, never a count delta: the two enumerations differ (git pathspec vs a
  # FIND_EXCL-pruned find), so subtracting the totals cancels a tracked-but-pruned row against a
  # real untracked file and mislabels a mixed surface `git-tracked` - dropping the re-read guidance.
  _disk=$(eval "find . \\( -type f -o -type l \\) \\( -path './.claude/*' -o -name '*CLAUDE.md' -o -name '*AGENTS.md' \\) $FIND_EXCL" 2>/dev/null || true)
  # `grep -c .` exits 1 on zero matches - a legitimate outcome that `pipefail` would turn into an abort.
  _untracked=$(printf '%s\n' "$_disk" | sed -e 's|^\./||' -e '/^$/d' | sort \
    | comm -23 - <( { git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' 2>/dev/null || true; } | sort) \
    | grep -c . || true)
  if [ "$_untracked" -gt 0 ]; then echo "mixed ($_rows tracked, $_untracked untracked)"; return 0; fi
  echo "git-tracked"
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
  _c=$(_count_md .claude/convention); _g=$(_count_md .claude/agents 99); _s=$(count_skills)
  _tot=$((_r + _n + _a + _u + _c + _g + _s))
  echo "$_tot files: $_r root, $_n nested CLAUDE.md, $_a AGENTS.md, $_u rules, $_c conventions, $_g agents, $_s skill files"
}

surface_total() { derive_surface_counts | cut -d' ' -f1; }

# ── provenance frontmatter (emit writes it, validate + status read it) ──────────
# The standard keys go AFTER the template's own frontmatter keys - i.e. immediately before the
# closing `---`. Every value is QUOTED except `doc_type`: surface_files contains `: ` and would
# otherwise be invalid YAML, and a bare date is typed as a Date by real YAML consumers, while
# `doc_type` is an enum matched literally as `^doc_type: llm$` by brewcode's rules validator.
_stamp_frontmatter() {
  _sfile="$1"
  _sfv=$(printf '%s' "${SURFACE_COUNTS:-unknown}" | tr -d '"' | tr '\n\r' '  ')
  awk -v dt="$META_DOC_TYPE" -v ver="$VERSION" -v cv="$CONTENT_VERSION" -v gb="$META_GENERATED_BY" \
      -v lu="$(date +%F)" -v sf="$_sfv" '
    BEGIN { n = 0; done = 0 }
    NR == 1 && $0 != "---" { exit 3 }
    /^---[[:space:]]*$/ {
      n++
      if (n == 2 && !done) {
        printf "doc_type: %s\nversion: \"%s\"\ncontent_version: \"%s\"\ngenerated_by: \"%s\"\nlast_updated: \"%s\"\nsurface_files: \"%s\"\n", dt, ver, cv, gb, lu, sf
        done = 1
      }
    }
    { print }
    END { if (!done) exit 3 }
  ' "$_sfile" > "$_sfile.stamped" && mv "$_sfile.stamped" "$_sfile"
}

# One frontmatter value, quotes stripped. Prints nothing when the key or the block is absent.
_fm_meta() {
  awk -v k="$2" '
    NR == 1 && $0 != "---" { exit }
    /^---[[:space:]]*$/ { n++; if (n == 2) exit; next }
    index($0, k ":") == 1 { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/^"|"$/, ""); print; exit }
  ' "$1" 2>/dev/null || true
}

# Pre-5.0 tail stamp, if any. `|| true` covers grep's rc=1 under pipefail.
_legacy_stamp() { grep -F "$LEGACY_STAMP_PREFIX" "$1" 2>/dev/null | tail -1 || true; }

# ── unresolved-token scan (ONE implementation - validate and status MUST agree) ──
# Matches \{[A-Z_]+\}, IGNORES a `$`-prefixed occurrence (${CLAUDE_SKILL_DIR} is a shell expansion,
# not a placeholder) and allow-lists the runtime tokens the emitted skill resolves per run.
# A PARKED install keeps its body (placeholders included) in SKILL.md.disabled, so `status` must scan
# that file instead. `validate` never reaches here on a parked install - it exits on the missing
# SKILL.md first, by design.
_emitted_files() {
  if [ ! -f "$TARGET/SKILL.md" ] && [ -f "$TARGET/SKILL.md.disabled" ]
  then echo "$TARGET/SKILL.md.disabled"
  else echo "$TARGET/SKILL.md"
  fi
  for r in $EMITTED_REFS; do echo "$TARGET_REFS/$r"; done
}

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

# Paths arrive on STDIN, one per line - a recursive `find` feed reaches nested files no single-level
# glob produces (CC discovers agents in subfolders such as `.claude/agents/review/`).
_fm_list() {
  _any=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    _any=1
    printf '%s :: %s :: %s\n' "$f" "$(_fm_field "$f" name)" "$(_fm_field "$f" description)"
  done
  [ "$_any" -eq 0 ] && echo "(none)"
  return 0
}

scan_target() {
  echo "=== memory-sync-setup: target scan ==="
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
  { find .claude/agents -type f -name '*.md' 2>/dev/null || true; } | sort | _fm_list
  _na=$(_count_md .claude/agents 99)
  echo "agents=$_na"
  [ "$_na" -eq 0 ] && echo "⚠️ NO .claude/agents/ - the agent batch is dropped from {BATCH_TABLE} and the re-audit reduces to skills"

  _hdr "Skills (.claude/skills/) :: name :: description"
  printf '%s\n' .claude/skills/*/SKILL.md | _fm_list
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
  echo "=== memory-sync-setup: emit ==="
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
  # Provenance stamp - YAML frontmatter of the emitted SKILL.md; `status`, `validate` and `upgrade` read it.
  _stamp_frontmatter "$_stage/SKILL.md" || _emit_abort
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

# ── restamp ─────────────────────────────────────────────────────────────────────
# The FINAL step of `upgrade`, ALWAYS run and never conditional on the stamp format. It refreshes the
# provenance keys of an ALREADY INSTALLED SKILL.md - version / last_updated / surface_files, plus
# doc_type and generated_by when absent - and drops a surviving pre-5.0 tail stamp. Nothing else moves:
# the body, every SELF-SYNC hand-edit and every foreign frontmatter key are copied through verbatim,
# and the copy is PROVEN byte-identical below before the new file is kept. Without this, an install
# already in the current format but on an older plugin version had no path to a fresh stamp at all:
# `upgrade` refreshed the tables, `validate` then hard-failed on the stale version, and the only escape
# was MEMORY_SYNC_FORCE=1 emit - which destroys exactly the hand-edits `upgrade` exists to preserve.
_meta_body() {
  awk -v legacy="$LEGACY_STAMP_PREFIX" '
    BEGIN { n = 0 }
    n < 2 && /^---[[:space:]]*$/ { n++; next }
    n < 2 { next }
    index($0, legacy) > 0 { next }
    { print }
  ' "$1"
}

restamp_skill() {
  echo "=== memory-sync-setup: restamp ==="
  echo "TARGET=$ROOT"
  _f="$TARGET/SKILL.md"
  if [ ! -f "$_f" ]; then
    if [ -f "$DISABLED_MARK" ]; then
      echo "❌ FAILED: memory-sync is PARKED at $DISABLED_MARK - run 'generate.sh enable' first, then restamp"
    else
      echo "❌ FAILED: not installed - $ROOT/$_f does not exist. Run 'generate.sh emit' first."
    fi
    exit 1
  fi

  _was=$(_fm_meta "$_f" version); [ -n "$_was" ] || _was="(unstamped)"
  _wascv=$(_fm_meta "$_f" content_version); [ -n "$_wascv" ] || _wascv="(unstamped)"
  _wasl=$(_legacy_stamp "$_f")
  # Legacy installs (emitted while the template still baked it) are user-only; the emitted skill must be
  # model-invocable, so the key is dropped here - the only mode that can reach an installed SKILL.md.
  _wasdmi=$(_fm_meta "$_f" disable-model-invocation)
  _dt=$(_fm_meta "$_f" doc_type)
  case "$_dt" in llm|user|skip) ;; *) _dt="$META_DOC_TYPE" ;; esac
  _sfv=$(printf '%s' "${SURFACE_COUNTS:-$(derive_surface_counts)}" | tr -d '"' | tr '\n\r' '  ')
  _lu=$(date +%F)

  _bd=$(mktemp -d "${TMPDIR:-/tmp}/memory-sync-restamp.XXXXXX") || { echo "❌ FAILED: cannot create a temp dir"; exit 1; }
  cp "$_f" "$_bd/orig" || { echo "❌ FAILED: cannot read $_f"; exit 1; }
  _meta_body "$_bd/orig" > "$_bd/pre"

  if ! awk -v dt="$_dt" -v ver="$VERSION" -v cv="$CONTENT_VERSION" -v gb="$META_GENERATED_BY" -v lu="$_lu" -v sf="$_sfv" \
           -v legacy="$LEGACY_STAMP_PREFIX" '
    BEGIN { n = 0; done = 0 }
    NR == 1 && $0 != "---" { exit 3 }
    /^---[[:space:]]*$/ {
      n++
      if (n == 2 && !done) {
        printf "doc_type: %s\nversion: \"%s\"\ncontent_version: \"%s\"\ngenerated_by: \"%s\"\nlast_updated: \"%s\"\nsurface_files: \"%s\"\n", dt, ver, cv, gb, lu, sf
        done = 1
      }
      print; next
    }
    n == 1 && /^(doc_type|version|content_version|generated_by|last_updated|surface_files):/ { next }
    n == 1 && /^disable-model-invocation:/ { next }
    n >= 2 && index($0, legacy) > 0 { next }
    { print }
    END { if (!done) exit 3 }
  ' "$_bd/orig" > "$_bd/new"; then
    echo "❌ FAILED: $_f has no YAML frontmatter block to stamp - nothing was written."
    echo "   Add the skill's own frontmatter first, or re-install into a clean target."
    exit 1
  fi

  _meta_body "$_bd/new" > "$_bd/post"
  # (the temp dir stays alive for refresh_refs below - it is cleared at the end of this function)
  if ! cmp -s "$_bd/pre" "$_bd/post"; then
    echo "❌ FAILED: restamp would have changed more than the provenance keys - aborted, $_f untouched."
    exit 1
  fi
  cp "$_bd/new" "$_f" || { echo "❌ FAILED: cannot write $_f"; exit 1; }

  echo "RESTAMPED: $_f"
  echo "  version:         $_was -> $VERSION"
  echo "  content_version: $_wascv -> $CONTENT_VERSION"
  echo "  last_updated:  -> $_lu"
  echo "  generated_by:  -> $META_GENERATED_BY"
  echo "  doc_type:      -> $_dt"
  echo "  surface_files: -> $_sfv"
  [ -z "$_wasl" ] || echo "REMOVED:   pre-5.0 tail stamp -> $_wasl"
  [ -z "$_wasdmi" ] || echo "REMOVED:   disable-model-invocation: $_wasdmi -> /memory-sync is model-invocable again"
  refresh_refs
  rm -rf "$_bd"; _bd=""
  echo "✅ restamp (metadata keys only - body and every hand-edit verified byte-identical)"
}

# The 3 references are mechanism-`a` byte copies: their version stamp is BAKED at release into the
# plugin's own file, so an installed copy only becomes current by being copied again. `upgrade` never
# re-copied them, which left `setup-status`'s `cmp` reporting DIFFERS forever with no mode that could
# clear it. Re-copy only where that is PROVABLY lossless - the sole difference is the release stamp
# line. Anything else (a SELF-SYNC hand-edit, hard-sync.md's two filled BLOCKs, prose that moved in a
# newer release) is reported and left alone: a re-copy there would destroy content.
refresh_refs() {
  for r in $EMITTED_REFS; do
    _src="$REFS/$r"; _dst="$TARGET_REFS/$r"
    # An ABSENT reference has nothing to preserve, and `emit` cannot restore it (it refuses while
    # SKILL.md exists), so copying it here is the only non-destructive route back to a complete install.
    if [ ! -f "$_dst" ]; then
      mkdir -p "$TARGET_REFS" && cp "$_src" "$_dst" && echo "REF RESTORED: $_dst (was missing - copied from the plugin)"
      continue
    fi
    if cmp -s "$_src" "$_dst"; then echo "REF OK:       $_dst (byte-identical to the plugin source)"; continue; fi
    awk '!/brewcode-meta:/' "$_src" > "$_bd/rs"
    awk '!/brewcode-meta:/' "$_dst" > "$_bd/rd"
    if cmp -s "$_bd/rs" "$_bd/rd"; then
      cp "$_src" "$_dst" && echo "REF RECOPIED: $_dst (differed ONLY in the release stamp - nothing to lose)"
    else
      echo "REF DIFFERS:  $_dst - content differs from $_src. NOT touched (hand-edit, filled BLOCKs, or"
      echo "              prose that moved in a newer release). Diff the two and port changes by hand."
    fi
  done
}

# ── validate ────────────────────────────────────────────────────────────────────
validate_emit() {
  echo "=== memory-sync-setup: validate ==="
  _errors=0

  # (1) every emitted file present
  _missing=0
  [ -f "$TARGET/SKILL.md" ] || { echo "❌ FAILED: missing emitted file: $TARGET/SKILL.md - run 'generate.sh emit' first"; _missing=1; _errors=$((_errors+1)); }
  for r in $EMITTED_REFS; do
    # `emit` refuses while SKILL.md exists, so it can never be the remedy here - `restamp` re-copies a
    # missing reference from the plugin, which is lossless because there is no local content to keep.
    if [ ! -f "$TARGET_REFS/$r" ]; then echo "❌ FAILED: missing emitted file: $TARGET_REFS/$r - run 'generate.sh restamp' to restore it from the plugin"; _missing=1; _errors=$((_errors+1)); fi
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

  # (4) provenance frontmatter - the five standard keys plus surface_files
  _mv=$(_fm_meta "$TARGET/SKILL.md" version)
  _mc=$(_fm_meta "$TARGET/SKILL.md" content_version)
  _mg=$(_fm_meta "$TARGET/SKILL.md" generated_by)
  _ml=$(_fm_meta "$TARGET/SKILL.md" last_updated)
  _md=$(_fm_meta "$TARGET/SKILL.md" doc_type)
  _ms=$(_fm_meta "$TARGET/SKILL.md" surface_files)
  _legacy=$(_legacy_stamp "$TARGET/SKILL.md")
  if [ -z "$_mv" ] || [ -z "$_mc" ] || [ -z "$_mg" ] || [ -z "$_ml" ] || [ -z "$_md" ] || [ -z "$_ms" ]; then
    if [ -n "$_legacy" ]; then
      echo "❌ FAILED: $TARGET/SKILL.md carries the pre-5.0 TAIL stamp, not provenance frontmatter:"
      echo "   $_legacy"
      echo "   -> run \`generate.sh restamp\`: it writes doc_type/version/content_version/generated_by/last_updated/surface_files"
      echo "      and deletes the tail line, touching nothing else (this is also the last step of \`upgrade\`)"
    else
      _lack=""
      for _k in $META_KEYS; do
        [ -n "$(_fm_meta "$TARGET/SKILL.md" "$_k")" ] || _lack="$_lack${_lack:+, }$_k"
      done
      echo "❌ FAILED: $TARGET/SKILL.md: provenance frontmatter incomplete (missing: $_lack)"
      echo "   -> run \`generate.sh restamp\` to write all six keys in place (hand-edits untouched)"
    fi
    _errors=$((_errors+1))
  elif [ "$_mv" != "$VERSION" ] || [ "$_mc" != "$CONTENT_VERSION" ]; then
    # Never name `upgrade` here: `upgrade` is the mode whose tail runs this check, so pointing back at it
    # was a closed loop with MEMORY_SYNC_FORCE=1 (hand-edit destroying) as the only documented escape.
    echo "❌ FAILED: $TARGET/SKILL.md: stamped version $_mv/$_mc != plugin version $VERSION/$CONTENT_VERSION"
    echo "   -> run \`generate.sh restamp\`: it refreshes version/content_version/last_updated/surface_files in place,"
    echo "      body and hand-edits untouched, and is the mandatory last step of \`upgrade\`"
    _errors=$((_errors+1))
  else
    echo "✅ provenance frontmatter present: doc_type=$_md version=$_mv content_version=$_mc generated_by=$_mg last_updated=$_ml surface_files=\"$_ms\""
    [ -z "$_legacy" ] || echo "⚠️ a pre-5.0 tail stamp also survives in this file - delete that line, the frontmatter supersedes it"
  fi

  # (5) the emitted skill stays model-invocable - plain prose must reach it, not only `/memory-sync`
  _dmi=$(_fm_meta "$TARGET/SKILL.md" disable-model-invocation)
  if [ -n "$_dmi" ]; then
    echo "❌ FAILED: $TARGET/SKILL.md: frontmatter sets disable-model-invocation: $_dmi - the emitted skill must stay model-invocable"
    echo "   -> run \`generate.sh restamp\`: it deletes the key in place, body and hand-edits untouched"
    _errors=$((_errors+1))
  else
    echo "✅ model-invocable (no disable-model-invocation key - prose invocation works alongside /memory-sync)"
  fi

  if [ "$_errors" -eq 0 ]; then echo "✅ validate PASSED"; else echo "❌ FAILED: $_errors check(s) failed"; fi
  exit "$_errors"
}

# ── status ──────────────────────────────────────────────────────────────────────
# Read-only, always exit 0. PURE KEY=value (no banner, every key unique) so a naive parser keeps every row.
status_report() {
  echo "TARGET=$ROOT"
  echo "SKILL_PATH=$ROOT/$TARGET"

  echo "PLUGIN_VERSION=$VERSION"

  # PARKED (SKILL.md renamed to SKILL.md.disabled by `disable`) is a THIRD state, never collapsed into
  # absent: the body, the 3 references and every SELF-SYNC hand-edit are still on disk, so the stamp is
  # read out of the parked file and reported at its real version. Only `enable` brings it back.
  _skf="$TARGET/SKILL.md"; _parked=no
  if [ ! -f "$_skf" ] && [ -f "$DISABLED_MARK" ]; then _skf="$DISABLED_MARK"; _parked=yes; fi

  if [ ! -f "$_skf" ]; then
    # Same KEY set as the installed branch - a parser keyed on any row must not go blind on a fresh target.
    echo "INSTALLED=no"; echo "PARKED=no"; echo "STAMP_FORMAT=none"
    echo "META_DOC_TYPE=none"; echo "META_VERSION=none"; echo "META_CONTENT_VERSION=none"; echo "META_GENERATED_BY=none"
    echo "META_LAST_UPDATED=none"; echo "META_SURFACE=none"
    echo "SURFACE_FILES_NOW=$(surface_total)"; echo "SURFACE_FILES_STAMPED=unknown"
    echo "MISSING_FILES=$(( 1 + EMITTED_N ))"
    echo "OPEN_PLACEHOLDERS=$( { _open_tokens || true; } | awk '{ print $NF }' | sort -u | wc -l | tr -d ' ')"
    echo "DEFAULT_BRANCH=$(derive_branch)"; echo "GIT_VISIBILITY=$(derive_git_visibility)"
    echo "DRIFTS=0"; echo "VERDICT=NOT INSTALLED"
    return 0
  fi

  if [ "$_parked" = yes ]; then
    echo "INSTALLED=parked"; echo "PARKED=yes"
    echo "NOTE_PARKED=disabled, not missing - $DISABLED_MARK holds the body and every SELF-SYNC hand-edit; run \`enable\` to bring /memory-sync back"
  else
    echo "INSTALLED=yes"; echo "PARKED=no"
  fi
  _drifts=0

  # Provenance: frontmatter (5.0+) | legacy tail stamp (pre-5.0) | none. Read from the live SKILL.md,
  # or from the parked SKILL.md.disabled - both carry the same stamp.
  _sv=$(_fm_meta "$_skf" version)
  _sc=$(_fm_meta "$_skf" content_version)
  _sg=$(_fm_meta "$_skf" generated_by)
  _sd=$(_fm_meta "$_skf" last_updated)
  _st=$(_fm_meta "$_skf" doc_type)
  _ss=$(_fm_meta "$_skf" surface_files)
  _legacy=$(_legacy_stamp "$_skf")
  _fmt=frontmatter
  if [ -z "$_sv" ] && [ -n "$_legacy" ]; then
    # Pre-5.0 install: parse what the old tail stamp holds, never crash on it, count it as drift.
    _fmt=legacy
    _sv=$(printf '%s\n' "$_legacy" | sed -e "s|^.*${LEGACY_STAMP_PREFIX}||" -e 's/ .*//')
    _sd=$(printf '%s\n' "$_legacy" | sed -e 's/.* emitted //' -e 's/ .*//')
    _ss=$(printf '%s\n' "$_legacy" | sed -e 's/.*| surface: //' -e 's/ -->$//')
    _sg="brewdoc:memory-sync-setup"; _st=unknown; _sc=unknown
    echo "NOTE_LEGACY=pre-5.0 tail stamp (template v$_sv) - no provenance frontmatter; \`generate.sh restamp\` migrates it (it is also the last step of \`upgrade\`)"
    _drifts=$((_drifts+1))
  elif [ -z "$_sv" ]; then
    _fmt=none
    _sv=UNSTAMPED; _sd=UNSTAMPED; _ss=UNSTAMPED; _sg=UNSTAMPED; _st=UNSTAMPED; _sc=UNSTAMPED
  fi
  [ -n "$_sd" ] || _sd=unknown
  [ -n "$_st" ] || _st=unknown
  [ -n "$_sc" ] || _sc=unknown
  if [ "$_ss" = UNSTAMPED ] || [ -z "$_ss" ]; then
    _stamped_n=unknown
  else
    _stamped_n=$(printf '%s\n' "$_ss" | grep -oE '^[0-9]+' || true)
    [ -n "$_stamped_n" ] || _stamped_n=unknown
  fi
  if [ "$_fmt" = frontmatter ] && [ "$_sv" != "$VERSION" ]; then
    echo "NOTE_VERSION=plugin version moved $_sv -> $VERSION"; _drifts=$((_drifts+1))
  fi
  if [ "$_fmt" = frontmatter ] && [ "$_sc" != "$CONTENT_VERSION" ]; then
    echo "NOTE_CONTENT_VERSION=content_version moved $_sc -> $CONTENT_VERSION"; _drifts=$((_drifts+1))
  fi
  echo "STAMP_FORMAT=$_fmt"
  echo "META_DOC_TYPE=$_st"; echo "META_VERSION=$_sv"; echo "META_CONTENT_VERSION=$_sc"; echo "META_GENERATED_BY=$_sg"
  echo "META_LAST_UPDATED=$_sd"; echo "META_SURFACE=$_ss"

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
  if [ "$_fmt" = legacy ]; then _verdict="STALE-LEGACY ($_drifts drifts)"
  elif [ "$_drifts" -eq 0 ]; then _verdict="IN SYNC"
  else _verdict="STALE ($_drifts drifts)"
  fi
  # PARKED carries its staleness with it - the two answers are orthogonal and both are reported.
  [ "$_parked" = no ] || _verdict="PARKED - $_verdict"
  echo "VERDICT=$_verdict"
  return 0
}

# ── enable / disable ────────────────────────────────────────────────────────────
# Claude Code discovers a project skill only through <dir>/SKILL.md. Parking that ONE file as
# SKILL.md.disabled withdraws /memory-sync from the roster while the emitted references AND every
# hand-edit the skill accumulated through its SELF-SYNC phase stay byte-identical on disk. Fully
# reversible, nothing regenerated, no provenance stamp touched.
DISABLED_MARK="$TARGET/SKILL.md.disabled"

toggle_skill() {
  _want="$1"   # enable | disable
  if [ "$_want" = "disable" ]; then _from="$TARGET/SKILL.md"; _to="$DISABLED_MARK"
  else _from="$DISABLED_MARK"; _to="$TARGET/SKILL.md"; fi

  echo "=== memory-sync-setup: $_want ==="
  echo "TARGET=$ROOT"
  if [ ! -d "$TARGET" ]; then
    echo "❌ FAILED: not installed - $ROOT/$TARGET does not exist. Run 'generate.sh emit' first."
    exit 1
  fi
  if [ -f "$_to" ] && [ ! -f "$_from" ]; then
    echo "✅ already ${_want}d - $_to is in place, nothing to move"
    exit 0
  fi
  if [ ! -f "$_from" ]; then
    echo "❌ FAILED: broken installation - neither $TARGET/SKILL.md nor $DISABLED_MARK exists"
    exit 1
  fi
  mv "$_from" "$_to" || { echo "❌ FAILED: could not rename $_from"; exit 1; }
  echo "MOVED: $_from -> $_to"
  for r in $EMITTED_REFS; do [ -f "$TARGET_REFS/$r" ] && echo "KEPT:  $TARGET_REFS/$r"; done
  echo "✅ $_want (takes effect in the NEXT session - skills are discovered at session start)"
}

# ── uninstall / purge ───────────────────────────────────────────────────────────
# `emit` writes exactly SKILL.md + $EMITTED_REFS, so that manifest is also the removal manifest:
#   uninstall  deletes precisely what this generator wrote, and NOTHING it did not. Anything else
#              sitting in the dir came from the user, so it survives and is reported.
#   purge      deletes the whole directory plus any crashed-emit staging left under .claude/skills/.
# The generator has no hooks, no settings entries and no config file anywhere else in the target,
# so these two paths are its entire footprint.
remove_skill() {
  _purge="$1"   # 0 = uninstall, 1 = purge
  _label=$([ "$_purge" = "1" ] && echo purge || echo uninstall)
  echo "=== memory-sync-setup: $_label ==="
  echo "TARGET=$ROOT"

  if [ ! -d "$TARGET" ]; then
    echo "⚠️ nothing to $_label - memory-sync is not installed at $ROOT/$TARGET"
    exit 0
  fi

  if [ "$_purge" = "1" ]; then
    rm -rf "$TARGET"
    echo "REMOVED: $TARGET/ (whole directory, user-added files included)"
    _stale=$({ find "$(dirname "$TARGET")" -maxdepth 1 -type d -name '.memory-sync-emit.*' 2>/dev/null || true; } | sort)
    if [ -n "$_stale" ]; then
      printf '%s\n' "$_stale" | while IFS= read -r _d; do
        [ -n "$_d" ] || continue
        rm -rf "$_d"; echo "REMOVED: $_d/ (staging left by a crashed emit)"
      done
    else
      echo "SKIP:    no .memory-sync-emit.* staging leftovers"
    fi
    echo "✅ purge"
    return 0
  fi

  # uninstall: the emit manifest, and only the emit manifest.
  for f in "$TARGET/SKILL.md" "$DISABLED_MARK"; do
    [ -f "$f" ] && { rm -f "$f"; echo "REMOVED: $f"; }
  done
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] && { rm -f "$TARGET_REFS/$r"; echo "REMOVED: $TARGET_REFS/$r"; }
  done
  rmdir "$TARGET_REFS" 2>/dev/null || true
  rmdir "$TARGET" 2>/dev/null || true

  if [ -d "$TARGET" ]; then
    echo "KEPT:    $TARGET/ still holds files this generator never wrote -"
    find "$TARGET" -type f | sort | sed 's/^/         /'
    echo "         'purge' removes them too."
  else
    echo "REMOVED: $TARGET/ (empty after the manifest was removed)"
  fi
  echo "✅ uninstall"
}

case "$MODE" in
  scan)      resolve_root; scan_target ;;
  emit)      resolve_root; emit_skill ;;
  validate)  resolve_root; validate_emit ;;
  restamp)   resolve_root; restamp_skill ;;
  status)    resolve_root; status_report ;;
  enable)    resolve_root; toggle_skill enable ;;
  disable)   resolve_root; toggle_skill disable ;;
  uninstall) resolve_root; remove_skill 0 ;;
  purge)     resolve_root; remove_skill 1 ;;
  *)
    echo "Usage: generate.sh <scan|emit|validate|restamp|status|enable|disable|uninstall|purge>   (default: emit)"
    echo "  scan      read-only surface report + derived DEFAULT_BRANCH= / GIT_VISIBILITY= / MEMORY_DIR= /"
    echo "            TRACKER_NOTE= / SURFACE_COUNTS= / PROJECT_NAME= for pass-back to emit"
    echo "  emit      atomically write $TARGET (refuses to overwrite; MEMORY_SYNC_FORCE=1 overrides)"
    echo "  validate  fail on unresolved {PLACEHOLDER}, missing file, broken reference, missing/stale provenance frontmatter"
    echo "  restamp   refresh ONLY the provenance keys of an installed SKILL.md (version/last_updated/"
    echo "            surface_files, + doc_type/generated_by when absent) and drop a pre-5.0 tail stamp."
    echo "            Body and every hand-edit are verified byte-identical. Mandatory last step of \`upgrade\`"
    echo "  status    machine-greppable KEY=value drift report, always exit 0. INSTALLED=yes|parked|no -"
    echo "            a parked install (SKILL.md.disabled) is reported PARKED, never NOT INSTALLED"
    echo "  enable    rename $TARGET/SKILL.md.disabled back to SKILL.md"
    echo "  disable   rename $TARGET/SKILL.md to SKILL.md.disabled - /memory-sync stops being discovered;"
    echo "            the references and every SELF-SYNC hand-edit stay on disk, reversible"
    echo "  uninstall delete exactly what emit wrote (SKILL.md + $EMITTED_N references); user-added files in"
    echo "            that dir are KEPT and listed"
    echo "  purge     delete $TARGET/ outright + any .memory-sync-emit.* staging leftovers"
    exit 1
    ;;
esac
