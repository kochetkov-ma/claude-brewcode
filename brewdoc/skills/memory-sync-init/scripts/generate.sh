#!/bin/bash
# brewdoc:memory-sync-init generator script
# Analyzes the TARGET repo (= current working directory) and emits a self-contained project-local
# .claude/skills/memory-sync/ into it, substituting SCALAR placeholders. Multi-row BLOCK placeholders
# are filled by the AI via Edit (see SKILL.md Phase 3) and `validate` FAILS while any of them remain.
#
# Usage: generate.sh <mode>        (mode defaults to `emit`)
#   scan      - read-only report of the memory surface the emitted skill must be wired to:
#               CLAUDE.md tree, AGENTS.md family (symlink / vendor-marked = VERIFY-ONLY), rules with
#               line counts + `paths:`, conventions, agents, skills, memory dir, git visibility,
#               default branch, tracker hint, per-batch counts, hooks reacting to memory edits.
#               Prints GIT_VISIBILITY=, DEFAULT_BRANCH=, SURFACE_COUNTS=, TRACKER_NOTE= for pass-back.
#   emit      - write <cwd>/.claude/skills/memory-sync/{SKILL.md,references/*.md}, substitute the 8
#               scalars, append the provenance stamp. REFUSES to overwrite a live installation.
#   validate  - fail (non-zero) on any unresolved {PLACEHOLDER}, missing emitted file, broken/unused
#               references/*.md citation, or a missing provenance stamp. Reports file:line.
#   status    - read-only, always exit 0. Machine-greppable KEY=value lines + a verdict
#               NOT INSTALLED / IN SYNC / STALE (<n> drifts). This is what AI-driven `upgrade` consults.
#
# Env overrides (SCALARS - each has a documented fallback, none is ever left empty):
#   PROJECT_NAME     basename of the target root
#   DEFAULT_BRANCH   derived from `git symbolic-ref --short refs/remotes/origin/HEAD` (remote prefix
#                    stripped), else `main`
#   MEMORY_DIR       literal `none`
#   GIT_VISIBILITY   derived: `git-ignored` when `git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md'`
#                    returns 0 rows, else `git-tracked`
#   LANGUAGE_POLICY  short neutral default (English-only surface, aliases only in description:)
#   FOCUS_EMPHASIS   short neutral default (facts > dedup > compression)
#   SURFACE_COUNTS   derived from the live enumeration
#   TRACKER_NOTE     literal `none`
#
# Other env:
#   MEMORY_SYNC_FORCE=1   let `emit` overwrite a live installation (DESTROYS hand-edits)

set -euo pipefail

VERSION="1.0.0"

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/memory-sync-init/scripts -> skills/memory-sync-init
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"

# Target is the current working directory (the repo getting the memory-sync skill)
TARGET=".claude/skills/memory-sync"
TARGET_REFS="$TARGET/references"
EMITTED_REFS="memory-guide.md agent-audit.md hard-sync.md"

STAMP_PREFIX="<!-- memory-sync template v"

# Runtime tokens the emitted skill resolves per RUN - allow-listed by validate, MUST survive emit.
RUNTIME_ALLOW="SCOPE FOCUS DEPTH BATCH FILE_LIST FACTS BROKEN_REFS DATE N M K"

# Every temp dir goes through $_bd; the trap makes leaks impossible on any exit path.
_bd=""
trap '[ -n "$_bd" ] && rm -rf "$_bd"' EXIT

# Shared find pruning - node_modules/.git/dist/build/.next/vendor are never memory.
FIND_EXCL='-not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/.next/*" -not -path "*/vendor/*"'

# `find | sort` exits 0 on an empty result, so every listing goes through this helper: a bare
# `find ... || echo "(none)"` would never print the fallback. `|| true` is required - a missing dir
# makes find exit 1, and under `set -e` a failing command substitution in an assignment aborts.
_list() { _out=$(eval "$1" 2>/dev/null || true); if [ -n "$_out" ]; then printf '%s\n' "$_out"; else echo "${2:-(none)}"; fi; }

# Count lines of an eval'd listing, 0 when empty. Same `|| true` contract.
_count() { _o=$(eval "$1" 2>/dev/null || true); if [ -z "$_o" ]; then echo 0; else printf '%s\n' "$_o" | wc -l | tr -d ' '; fi; }

validate_templates() {
  for t in "$REFS/SKILL.md.template" "$REFS/memory-guide.md" "$REFS/agent-audit.md" "$REFS/hard-sync.md"; do
    if [ ! -f "$t" ]; then
      echo "❌ FAILED: emit template not found: $t - reinstall brewdoc"
      exit 1
    fi
  done
}

# ── derivations shared by scan / emit / status ──────────────────────────────────
derive_branch() {
  _b=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)
  if [ -n "$_b" ]; then
    printf '%s\n' "${_b#*/}"
  else
    echo "main"
  fi
}

derive_git_visibility() {
  _rows=$( { git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$_rows" -eq 0 ]; then
    echo "git-ignored"
  else
    echo "git-tracked"
  fi
}

derive_memory_dir() {
  for _s in .claude/settings.json .claude/settings.local.json; do
    [ -f "$_s" ] || continue
    _m=$(grep -o '"autoMemoryDirectory"[[:space:]]*:[[:space:]]*"[^"]*"' "$_s" 2>/dev/null | head -1 | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//' || true)
    if [ -n "$_m" ]; then printf '%s\n' "$_m"; return 0; fi
  done
  for _d in "$HOME"/.claude/projects/*/memory; do
    if [ -d "$_d" ]; then printf '%s\n' "$_d"; return 0; fi
  done
  echo "none"
}

derive_tracker_note() {
  _t=""
  [ -d .claude/features ] && _t=".claude/features/** is operational task state - owned by the task board, excluded"
  if [ -z "$_t" ] && [ -d .github ]; then _t=".github/ issue tracker owns operational task state - excluded"; fi
  if [ -n "$_t" ]; then printf '%s\n' "$_t"; else echo "none"; fi
}

# Per-batch counts. The emitted skill dir is excluded EVERYWHERE (scan, emit stamp, status) so all three
# agree: it does not exist at analysis time, so counting it later would make every fresh install look
# drifted. The emitted skill's Phase 4 subtracts its own files before comparing, for the same reason.
count_root_md()    { _count "find . -maxdepth 1 -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' -o -name 'CONVENTIONS.md' -o -name 'CONTRIBUTING.md' \\)"; }
count_nested_md()  { _count "find . -mindepth 2 -type f -name 'CLAUDE.md' $FIND_EXCL"; }
count_agents_md()  { _count "find . -type f -o -type l | grep -E '(^|/)AGENTS\\.md$' | grep -vE '/(node_modules|\\.git|dist|build|\\.next|vendor)/' || true"; }
count_rules()      { _count "find .claude/rules -maxdepth 1 -type f -name '*.md'"; }
count_conv()       { _count "find .claude/convention -maxdepth 1 -type f -name '*.md'"; }
count_agents()     { _count "find .claude/agents -maxdepth 1 -type f -name '*.md'"; }
count_skills()     { _count "find .claude/skills -type f -name '*.md' -not -path '*/memory-sync/*'"; }

derive_surface_counts() {
  _r=$(count_root_md); _n=$(count_nested_md); _a=$(count_agents_md); _u=$(count_rules)
  _c=$(count_conv); _g=$(count_agents); _s=$(count_skills)
  _tot=$((_r + _n + _a + _u + _c + _g + _s))
  echo "$_tot files: $_r root, $_n nested CLAUDE.md, $_a AGENTS.md, $_u rules, $_c conventions, $_g agents, $_s skill files"
}

surface_total() {
  _r=$(count_root_md); _n=$(count_nested_md); _a=$(count_agents_md); _u=$(count_rules)
  _c=$(count_conv); _g=$(count_agents); _s=$(count_skills)
  echo $((_r + _n + _a + _u + _c + _g + _s))
}

# ── scan ────────────────────────────────────────────────────────────────────────
scan_target() {
  echo "=== memory-sync-init: target scan ==="
  echo "Target: $(pwd)"
  echo ""

  echo "--- CLAUDE.md tree (root + nested, any depth) ---"
  _list "find . -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' \\) $FIND_EXCL | sort"

  echo ""
  echo "--- AGENTS.md family (SYMLINK / vendor-marked = VERIFY-ONLY) ---"
  _agents_md=$(eval "find . \\( -type f -o -type l \\) -name 'AGENTS.md' $FIND_EXCL | sort" 2>/dev/null || true)
  if [ -z "$_agents_md" ]; then
    echo "(none)"
  else
    printf '%s\n' "$_agents_md" | while IFS= read -r f; do
      [ -n "$f" ] || continue
      if [ -L "$f" ]; then
        echo "$f :: SYMLINK -> $(readlink "$f" 2>/dev/null || echo '?') :: VERIFY-ONLY (another tool owns it)"
        continue
      fi
      _first=$(grep -m1 -v '^[[:space:]]*$' "$f" 2>/dev/null || true)
      _last=$(grep -v '^[[:space:]]*$' "$f" 2>/dev/null | tail -1 || true)
      case "$_first" in
        *"<!-- BEGIN"*)
          case "$_last" in
            *"END"*"-->"*) echo "$f :: VENDOR-MARKED (whole body inside BEGIN/END markers) :: VERIFY-ONLY" ;;
            *)             echo "$f :: has a BEGIN marker but no closing END on the last line :: inspect before editing" ;;
          esac
          ;;
        *) echo "$f :: plain file :: editable" ;;
      esac
    done
  fi

  echo ""
  echo "--- Rules (.claude/rules/) :: lines :: paths: ---"
  if [ -d .claude/rules ]; then
    _any=0
    for f in .claude/rules/*.md; do
      [ -f "$f" ] || continue
      _any=1
      _ln=$(wc -l < "$f" | tr -d ' ')
      _paths=$(grep -m1 '^paths:' "$f" 2>/dev/null | sed 's/^paths:[[:space:]]*//' || true)
      [ -n "$_paths" ] || _paths="(no paths:)"
      printf '%s :: %s lines :: %s\n' "$f" "$_ln" "$_paths"
    done
    [ "$_any" -eq 0 ] && echo "(none)"
  else
    echo "(none)"
  fi

  echo ""
  echo "--- Conventions ---"
  _list "find .claude/convention -maxdepth 1 -type f -name '*.md' | sort"
  _list "find . -maxdepth 1 -type f \\( -name 'CONVENTIONS.md' -o -name 'CONTRIBUTING.md' \\) | sort" "(no root CONVENTIONS.md / CONTRIBUTING.md)"

  echo ""
  echo "--- Agents (.claude/agents/) ---"
  if [ -d .claude/agents ]; then
    for f in .claude/agents/*.md; do
      [ -f "$f" ] || continue
      printf '%s :: %s :: %s\n' "$f" \
        "$(grep -m1 '^name:' "$f" 2>/dev/null | sed 's/^name:[[:space:]]*//' || true)" \
        "$(grep -m1 '^description:' "$f" 2>/dev/null | sed 's/^description:[[:space:]]*//' | cut -c1-200 || true)"
    done
  fi
  _na=$(count_agents)
  echo "agents=$_na"
  [ "$_na" -eq 0 ] && echo "⚠️ NO .claude/agents/ - the agent batch is dropped from {BATCH_TABLE} and the re-audit reduces to skills"

  echo ""
  echo "--- Skills (.claude/skills/) ---"
  _anyskill=0
  for d in .claude/skills/*/; do
    [ -d "$d" ] || continue
    _anyskill=1
    _fc=$(_count "find '$d' -type f -name '*.md'")
    printf '%s :: %s md files\n' "${d%/}" "$_fc"
  done
  [ "$_anyskill" -eq 0 ] && echo "(none)"

  echo ""
  echo "--- Hooks reacting to memory edits (informational - NEVER edited) ---"
  _list "find .claude/hooks -maxdepth 1 -type f | sort" "(no .claude/hooks/)"
  _list "grep -n '\"\\(PreToolUse\\|PostToolUse\\|UserPromptSubmit\\|SessionStart\\|Stop\\|SubagentStop\\)\"' .claude/settings.json" "(no hook registrations in .claude/settings.json)"

  echo ""
  echo "--- Tracker ---"
  test -d .claude/features && echo "✅ .claude/features/ present" || echo "- no .claude/features/"
  test -d .github && echo "✅ .github/ present" || echo "- no .github/"

  echo ""
  echo "--- Derived values (pass these back as env vars to emit) ---"
  echo "DEFAULT_BRANCH=$(derive_branch)"
  echo "GIT_VISIBILITY=$(derive_git_visibility)"
  echo "MEMORY_DIR=$(derive_memory_dir)"
  echo "TRACKER_NOTE=$(derive_tracker_note)"
  echo "SURFACE_COUNTS=$(derive_surface_counts)"
  echo "PROJECT_NAME=$(basename "$(pwd)")"
}

# ── scalar resolution ───────────────────────────────────────────────────────────
# Never let an empty env var blank a placeholder: every fallback that fires is logged.
resolve_scalars() {
  _fellback=""
  _fb() { _fellback="$_fellback  - $1 -> $2
"; }

  if [ -z "${PROJECT_NAME:-}" ]; then PROJECT_NAME="$(basename "$(pwd)")"; _fb PROJECT_NAME "$PROJECT_NAME (basename of cwd)"; fi
  if [ -z "${DEFAULT_BRANCH:-}" ]; then DEFAULT_BRANCH="$(derive_branch)"; _fb DEFAULT_BRANCH "$DEFAULT_BRANCH (derived)"; fi
  if [ -z "${MEMORY_DIR:-}" ]; then MEMORY_DIR="none"; _fb MEMORY_DIR "none"; fi
  if [ -z "${GIT_VISIBILITY:-}" ]; then GIT_VISIBILITY="$(derive_git_visibility)"; _fb GIT_VISIBILITY "$GIT_VISIBILITY (derived)"; fi
  if [ -z "${LANGUAGE_POLICY:-}" ]; then
    LANGUAGE_POLICY="English everywhere; non-English trigger aliases are legal ONLY inside agent/skill \`description:\` fields"
    _fb LANGUAGE_POLICY "neutral default"
  fi
  if [ -z "${FOCUS_EMPHASIS:-}" ]; then FOCUS_EMPHASIS="default ordering: facts > dedup > compression"; _fb FOCUS_EMPHASIS "neutral default"; fi
  if [ -z "${SURFACE_COUNTS:-}" ]; then SURFACE_COUNTS="$(derive_surface_counts)"; _fb SURFACE_COUNTS "$SURFACE_COUNTS (enumerated)"; fi
  if [ -z "${TRACKER_NOTE:-}" ]; then TRACKER_NOTE="none"; _fb TRACKER_NOTE "none"; fi

  export PROJECT_NAME DEFAULT_BRANCH MEMORY_DIR GIT_VISIBILITY LANGUAGE_POLICY FOCUS_EMPHASIS SURFACE_COUNTS TRACKER_NOTE
}

# Literal (non-regex, non-sed) substitution: awk reads values from ENVIRON, so `/`, `&`, `\` and
# newlines inside a value are inserted verbatim - no escaping, no delimiter collisions.
SCALAR_KEYS="PROJECT_NAME DEFAULT_BRANCH MEMORY_DIR GIT_VISIBILITY LANGUAGE_POLICY FOCUS_EMPHASIS SURFACE_COUNTS TRACKER_NOTE"

_subst() {
  awk -v keys="$SCALAR_KEYS" '
    BEGIN { nk = split(keys, k, " ") }
    {
      line = $0
      for (i = 1; i <= nk; i++) {
        tok = "{" k[i] "}"
        val = ENVIRON[k[i]]
        out = ""; rest = line
        while ((p = index(rest, tok)) > 0) {
          out = out substr(rest, 1, p - 1) val
          rest = substr(rest, p + length(tok))
        }
        line = out rest
      }
      print line
    }
  ' "$1" > "$2"
}

# ── emit ────────────────────────────────────────────────────────────────────────
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
  mkdir -p "$TARGET_REFS"

  _subst "$REFS/SKILL.md.template" "$TARGET/SKILL.md"

  # Provenance stamp - LAST line of the emitted SKILL.md; `status` and `upgrade` read it.
  printf '\n%s%s emitted %s by brewdoc:memory-sync-init | surface: %s -->\n' \
    "$STAMP_PREFIX" "$VERSION" "$(date +%F)" "$SURFACE_COUNTS" >> "$TARGET/SKILL.md"
  echo "✅ $TARGET/SKILL.md ($(wc -l < "$TARGET/SKILL.md" | tr -d ' ') lines, stamped v$VERSION)"

  for r in $EMITTED_REFS; do
    cp "$REFS/$r" "$TARGET_REFS/$r"
    echo "✅ $TARGET_REFS/$r ($(wc -l < "$TARGET_REFS/$r" | tr -d ' ') lines, verbatim)"
  done

  echo ""
  echo "Scalars applied:"
  _v=""
  for k in $SCALAR_KEYS; do
    eval "_v=\${$k}"
    printf '  %s = %s\n' "$k" "$_v"
  done
  if [ -n "$_fellback" ]; then
    echo "Fallbacks that fired (env var unset or empty):"
    printf '%s' "$_fellback"
  else
    echo "Fallbacks that fired: none (all 8 scalars came from the environment)"
  fi

  echo ""
  echo "Next: AI fills the BLOCK placeholders via Edit (SKILL.md Phase 3) - validate FAILS until then."
}

# ── validate ────────────────────────────────────────────────────────────────────
validate_emit() {
  echo "=== memory-sync-init: validate ==="
  validate_templates
  _errors=0

  # (1) every emitted file present
  _missing=0
  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ FAILED: missing emitted file: $TARGET/SKILL.md - run 'generate.sh emit' first"
    _missing=1; _errors=$((_errors+1))
  fi
  for r in $EMITTED_REFS; do
    if [ ! -f "$TARGET_REFS/$r" ]; then echo "❌ FAILED: missing emitted file: $TARGET_REFS/$r"; _missing=1; _errors=$((_errors+1)); fi
  done
  [ "$_missing" -eq 0 ] && echo "✅ all emitted files present (SKILL.md + $(echo $EMITTED_REFS | wc -w | tr -d ' ') references)"

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ FAILED: $TARGET/SKILL.md absent - remaining checks skipped"
    exit "$_errors"
  fi

  # (2) unresolved {PLACEHOLDER}: matches \{[A-Z_]+\}, IGNORES a `$`-prefixed occurrence
  # (${CLAUDE_SKILL_DIR} is a shell expansion, not a placeholder), allow-lists runtime tokens.
  _unresolved=""
  for f in "$TARGET/SKILL.md" $(for r in $EMITTED_REFS; do echo "$TARGET_REFS/$r"; done); do
    [ -f "$f" ] || continue
    _hits=$(awk -v allow="$RUNTIME_ALLOW" '
      BEGIN { n = split(allow, a, " "); for (i = 1; i <= n; i++) ok[a[i]] = 1 }
      {
        line = $0; pos = 1
        while (match(substr(line, pos), /\{[A-Z_]+\}/)) {
          s = pos + RSTART - 1
          tok = substr(line, s, RLENGTH)
          prev = (s > 1) ? substr(line, s - 1, 1) : ""
          name = substr(tok, 2, length(tok) - 2)
          if (prev != "$" && !(name in ok)) print FILENAME ":" FNR ": " tok
          pos = s + RLENGTH
        }
      }
    ' "$f" || true)
    [ -n "$_hits" ] && _unresolved="$_unresolved$_hits
"
  done
  if [ -n "$_unresolved" ]; then
    echo "❌ FAILED: unresolved setup-time placeholders (AI must fill the BLOCKs via Edit - SKILL.md Phase 3):"
    printf '%s' "$_unresolved" | sed 's/^/   /'
    _errors=$((_errors+1))
  else
    echo "✅ no unresolved placeholders (runtime allow-list: $RUNTIME_ALLOW)"
  fi

  # (3) references, BOTH directions: every cited references/*.md exists, every emitted one is cited.
  _cited=$(grep -oE 'references/[A-Za-z0-9._-]+\.md' "$TARGET/SKILL.md" | sort -u || true)
  _refbad=0
  if [ -n "$_cited" ]; then
    while IFS= read -r c; do
      [ -n "$c" ] || continue
      if [ ! -f "$TARGET/$c" ]; then
        _ln=$(grep -nF "$c" "$TARGET/SKILL.md" | head -1 | cut -d: -f1 || true)
        echo "❌ FAILED: $TARGET/SKILL.md:${_ln:-?}: cites $c which does not exist"
        _refbad=1; _errors=$((_errors+1))
      fi
    done <<EOF
$_cited
EOF
  fi
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
      if grep -qF "$STAMP_PREFIX" "$TARGET/SKILL.md"; then
        echo "❌ FAILED: $TARGET/SKILL.md: provenance stamp is not the LAST line"
      else
        echo "❌ FAILED: $TARGET/SKILL.md: provenance stamp absent (expected a last line starting '$STAMP_PREFIX')"
      fi
      _errors=$((_errors+1))
      ;;
  esac

  if [ "$_errors" -eq 0 ]; then
    echo "✅ validate PASSED"
  else
    echo "❌ FAILED: $_errors check(s) failed"
  fi
  exit "$_errors"
}

# ── status ──────────────────────────────────────────────────────────────────────
# Read-only, always exit 0. KEY=value lines so the AI-driven `upgrade` can grep them.
status_report() {
  echo "=== memory-sync-init: status ==="
  echo "TARGET=$(pwd)"
  echo "SKILL_PATH=$TARGET"

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "INSTALLED=no"
    echo "STAMP_VERSION=none"
    echo "STAMP_DATE=none"
    echo "STAMP_SURFACE=none"
    echo "SURFACE_FILES_NOW=$(surface_total)"
    echo "SURFACE_FILES_STAMPED=unknown"
    echo "MISSING_FILES=$(( 1 + $(echo $EMITTED_REFS | wc -w | tr -d ' ') ))"
    echo "DRIFTS=0"
    echo "VERDICT=NOT INSTALLED"
    return 0
  fi

  echo "INSTALLED=yes"
  _drifts=0

  _stamp=$(grep -F "$STAMP_PREFIX" "$TARGET/SKILL.md" | tail -1 || true)
  if [ -z "$_stamp" ]; then
    echo "STAMP_VERSION=UNSTAMPED"
    echo "STAMP_DATE=UNSTAMPED"
    echo "STAMP_SURFACE=UNSTAMPED"
    _stamped_n="unknown"
  else
    _sv=$(printf '%s\n' "$_stamp" | sed -e "s|^${STAMP_PREFIX}||" -e 's/ .*//')
    _sd=$(printf '%s\n' "$_stamp" | sed -e 's/.* emitted //' -e 's/ .*//')
    _ss=$(printf '%s\n' "$_stamp" | sed -e 's/.*| surface: //' -e 's/ -->$//')
    echo "STAMP_VERSION=$_sv"
    echo "STAMP_DATE=$_sd"
    echo "STAMP_SURFACE=$_ss"
    _stamped_n=$(printf '%s\n' "$_ss" | grep -oE '^[0-9]+' || true)
    [ -n "$_stamped_n" ] || _stamped_n="unknown"
    [ "$_sv" = "$VERSION" ] || { echo "NOTE=template version moved $_sv -> $VERSION"; _drifts=$((_drifts+1)); }
  fi

  _now=$(surface_total)
  echo "SURFACE_FILES_NOW=$_now"
  echo "SURFACE_FILES_STAMPED=$_stamped_n"
  if [ "$_stamped_n" != "unknown" ] && [ "$_stamped_n" -ne "$_now" ]; then
    echo "NOTE=surface moved $_stamped_n -> $_now files"
    _drifts=$((_drifts+1))
  fi

  _miss=0
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] || { echo "NOTE=missing emitted reference: $TARGET_REFS/$r"; _miss=$((_miss+1)); }
  done
  echo "MISSING_FILES=$_miss"
  _drifts=$((_drifts + _miss))

  _open=$(awk -v allow="$RUNTIME_ALLOW" '
    BEGIN { n = split(allow, a, " "); for (i = 1; i <= n; i++) ok[a[i]] = 1 }
    {
      line = $0; pos = 1
      while (match(substr(line, pos), /\{[A-Z_]+\}/)) {
        s = pos + RSTART - 1; tok = substr(line, s, RLENGTH)
        prev = (s > 1) ? substr(line, s - 1, 1) : ""
        name = substr(tok, 2, length(tok) - 2)
        if (prev != "$" && !(name in ok)) print tok
        pos = s + RLENGTH
      }
    }
  ' "$TARGET/SKILL.md" | sort -u | wc -l | tr -d ' ')
  echo "OPEN_PLACEHOLDERS=$_open"
  [ "$_open" -gt 0 ] && _drifts=$((_drifts + _open))

  echo "DEFAULT_BRANCH=$(derive_branch)"
  echo "GIT_VISIBILITY=$(derive_git_visibility)"
  echo "DRIFTS=$_drifts"
  if [ "$_drifts" -eq 0 ]; then
    echo "VERDICT=IN SYNC"
  else
    echo "VERDICT=STALE ($_drifts drifts)"
  fi
  return 0
}

case "$MODE" in
  scan)     scan_target ;;
  emit)     emit_skill ;;
  validate) validate_emit ;;
  status)   status_report ;;
  *)
    echo "Usage: generate.sh <scan|emit|validate|status>   (default: emit)"
    echo "  scan      read-only surface report + derived DEFAULT_BRANCH= / GIT_VISIBILITY= / SURFACE_COUNTS="
    echo "  emit      write $TARGET (refuses to overwrite; MEMORY_SYNC_FORCE=1 overrides)"
    echo "  validate  fail on unresolved {PLACEHOLDER}, missing file, broken reference, missing stamp"
    echo "  status    machine-greppable KEY=value drift report, always exit 0"
    exit 1
    ;;
esac
