#!/bin/bash
# brewcode:superreview-setup generator script
# Adapted from setup.sh copy_review_skill(): copies the emit templates into the TARGET project
# (.claude/skills/superreview/) substituting SCALAR placeholders, then validates that NO setup-time
# {PLACEHOLDER} remains. Multi-row BLOCK placeholders are filled by the AI via Edit (see SKILL.md Phase 3).
#
# Usage: generate.sh <mode>
#   scan        - Report target tech stack, agents, rules, source/test dirs (Phase 1)
#   emit        - Copy + scalar-substitute templates into <cwd>/.claude/skills/superreview/ (Phase 2)
#                 AND create-or-reuse <cwd>/.claude/agents/intent-guard.md.
#                 Also saves PRISTINE copies of the templates it emitted from under .template-baseline/ — that
#                 baseline is what makes `upgrade` able to tell a TEMPLATE change apart from Phase 3 tailoring.
#                 REFUSES to overwrite a live installation (the emitted skill SELF-SYNCS — Phase 4b — so its
#                 SKILL.md and references/scope.md carry edits no template knows about). SUPERREVIEW_FORCE=1
#                 overrides and DESTROYS those edits.
#   upgrade     - Refresh a LIVE installation without touching hand-edits (Phase 2b): stages a fresh emit next
#                 to it and reports, per file, the NEW TEMPLATE vs the .template-baseline/ copy — IDENTICAL |
#                 DIFFERS (real template delta) | MISSING -> restored (NEEDS PHASE 3) | NO BASELINE (pre-baseline
#                 install: falls back to live-vs-template, tailoring included). Live files are never written;
#                 the AI applies the template delta with targeted Edit calls.
#   emit-agent  - Create-or-reuse <cwd>/.claude/agents/intent-guard.md ONLY. No superreview skill is
#                 written, read or required. Used by /brewcode:teams-setup, which must not author its own copy.
#                 Prints exactly one `INTENT_GUARD:` line on STDOUT: `INTENT_GUARD: CREATED <path>` |
#                 `INTENT_GUARD: REUSE <path>`. Diagnostics go to stderr and never break that contract.
#   validate    - Fail if any unresolved setup-time {PLACEHOLDER} remains (Phase 4)
#
# Env overrides (honored by BOTH emit and emit-agent; SUPERREVIEW_FORCE=1 lets emit overwrite a live install):
#   PROJECT_NAME, TRACKER_LABEL, SPEC_LOCATION, PLAN_LOCATION, POLICY_LOCATION
#   (emit also honors STACK_LABEL, STACK_REF, SOURCE_GLOB, PATHSPEC_GLOBS, ARBITER_AGENT,
#    VALIDATOR_AGENT, SCOPE_AGENT_A, SCOPE_AGENT_B)

set -euo pipefail

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/superreview-setup/scripts -> skills/superreview-setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"

# Target is the current working directory (the repo being reviewed)
TARGET=".claude/skills/superreview"
TARGET_REFS="$TARGET/references"
# Where `upgrade` stages a fresh emit for comparison. Dot-prefixed so the skill loader ignores it; removed by the caller.
STAGING="$TARGET/.upgrade-staging"
# Pristine copies of the templates the live install was emitted from. `upgrade` diffs the NEW template against
# these, so Phase 3 tailoring in the live files can never be mistaken for a template change.
BASELINE="$TARGET/.template-baseline"

# The one agent file this script owns, and the provenance stamp that proves a file came out of this pipeline.
IG_PATH=".claude/agents/intent-guard.md"
IG_STAMP_PREFIX="<!-- intent-guard template v"   # tail anchor + provenance; survives the header strip
IG_SEED_MARK="<!-- SEEDED-DEFAULT:"              # one per generic BLOCK default; removed by Phase 3 adaptation

# Every temp dir goes through $_bd; the trap makes leaks impossible on any exit path.
_bd=""
trap '[ -n "$_bd" ] && rm -rf "$_bd"' EXIT

validate_templates() {
  for t in "$REFS/SKILL.md.template" "$REFS/scope.md.template" "$REFS/agent-prompt.md" \
           "$REFS/report-template.md" "$REFS/intent-guard.md.template"; do
    if [ ! -f "$t" ]; then
      echo "❌ Emit template not found: $t"
      exit 1
    fi
  done
}

# ── scan: report what the emitted skill must be wired to ────────────────────────
# `find | sort` exits 0 on an empty result, so every listing goes through this helper:
# a bare `find ... || echo "(none)"` would never print the fallback.
# `|| true` is required: a missing dir makes find exit 1, and under `set -e` a failing command
# substitution in an assignment aborts the whole script.
_list() { _out=$(eval "$1" 2>/dev/null || true); if [ -n "$_out" ]; then printf '%s\n' "$_out"; else echo "${2:-(none)}"; fi; }

scan_target() {
  echo "=== superreview: target scan ==="
  echo ""
  echo "--- Build files ---"
  _list 'find . -maxdepth 3 -type f \( \
    -name "package.json" -o -name "pom.xml" -o -name "build.gradle" -o \
    -name "build.gradle.kts" -o -name "requirements*.txt" -o -name "pyproject.toml" -o \
    -name "Pipfile" -o -name "Cargo.toml" -o -name "go.mod" -o -name "composer.json" \
  \) | sort' "(none found)"

  echo ""
  echo "--- Project agents (.claude/agents/) — DOMAIN EXPERT roster ---"
  if [ -d .claude/agents ]; then
    for f in .claude/agents/*.md; do
      [ -f "$f" ] || continue
      printf '%s :: %s :: %s\n' "$f" \
        "$(grep -m1 '^name:' "$f" | sed 's/^name:[[:space:]]*//')" \
        "$(grep -m1 '^description:' "$f" | sed 's/^description:[[:space:]]*//' | cut -c1-220)"
    done
    _n=$(find .claude/agents -maxdepth 1 -type f -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
    echo "agents=$_n"
    [ "$_n" -eq 0 ] && echo "⚠️ NO domain experts — superreview routed to generic agents is a DEGRADED review"
  else
    echo "(none)"
    echo "⚠️ NO .claude/agents/ — create domain experts before generating (see SKILL.md Phase 1.6)"
  fi

  echo ""
  echo "--- Scope baseline sources (tracker) ---"
  test -d .claude/features && echo "✅ .claude/features/ (file-based Kanban)" || echo "— no .claude/features/"
  command -v gh >/dev/null 2>&1 && echo "✅ gh CLI present" || echo "— no gh CLI"
  git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/branch: /' || true
  test -d .github && echo "✅ .github/ present" || echo "— no .github/"

  echo ""
  echo "--- Rules (.claude/rules/) ---"
  _list 'find .claude/rules -type f -name "*.md" | sort'

  echo ""
  echo "--- Conventions (.claude/convention/) ---"
  _list 'find .claude/convention -type f -name "*.md" | sort'

  echo ""
  echo "--- Source / service dirs (top level) ---"
  _list 'find . -maxdepth 2 -type d \( -name "src" -o -name "app" -o -name "lib" -o \
    -name "pkg" -o -name "internal" -o -name "cmd" \) | sort'

  echo ""
  echo "--- Test dirs ---"
  _list 'find . -type d \( -name "test" -o -name "tests" -o -name "__tests__" \) | head -20'

  echo ""
  echo "--- Gate commands (candidates for GATE_COMMANDS) ---"
  _list 'grep -oE "\"(build|lint|typecheck|type-check|test)\"[[:space:]]*:" package.json | tr -d "\":" | sed "s/^/npm run /"'
  _list 'grep -oE "^[a-zA-Z_-]+:" Makefile | tr -d ":" | sed "s/^/make /"' "(no Makefile targets)"

  echo ""
  echo "--- CLAUDE.md ---"
  test -f ./CLAUDE.md && echo "✅ CLAUDE.md" || echo "⚠️ no CLAUDE.md"

  echo ""
  echo "--- intent-guard: tier sources + existing agent ---"
  if _ig_usable; then
    echo "✅ $IG_PATH EXISTS and is usable — emit will REUSE it, never overwrite"
  elif [ -e "$IG_PATH" ]; then
    echo "⚠️ $IG_PATH exists but is empty / has no 'name: intent-guard' frontmatter / still carries unresolved {PLACEHOLDER} tokens — emit will RECREATE it"
  else
    echo "— no $IG_PATH — emit will CREATE it from the template"
  fi
  echo "Tier 2 (SPEC_LOCATION candidates):"
  _list 'find .claude/specs .claude/spec docs/specs doc/specs -maxdepth 2 -type f -name "*.md" | sort | head -20' "(none — SPEC_LOCATION=none)"
  echo "Tier 3 (PLAN_LOCATION candidates):"
  _list 'find .claude/features .claude/tasks -maxdepth 2 \( -type f -o -type d \) | sort | head -20' "(none — PLAN_LOCATION=none)"
  echo "Tier 4 (POLICY_LOCATION candidates):"
  _list 'find . -maxdepth 3 -name "CLAUDE.md" -not -path "./node_modules/*" | sort' "(no CLAUDE.md)"
  _list 'find .claude/rules .claude/convention -type f -name "*.md" | sort' "(no rules/convention)"
  echo "Planned scale / testing / dependency policy: read the files above — they fill {PROJECT_INVARIANTS_TABLE}"
}

# ── shared: scalar resolution + substitution (used by emit AND emit-agent) ──────
resolve_scalars() {
  [ "${_SCALARS_READY:-0}" = "1" ] && return 0
  # Scalar values (single-line ONLY — sed processes line-by-line; a newline truncates the substitution).
  PROJECT_NAME="${PROJECT_NAME:-this project}"
  STACK_LABEL="${STACK_LABEL:-the project stack}"
  STACK_REF="${STACK_REF:-python.md}"
  SOURCE_GLOB="${SOURCE_GLOB:-*}"
  PATHSPEC_GLOBS="${PATHSPEC_GLOBS:-'*' 'Dockerfile*' 'docker-compose.yml' '.github/workflows/*.yml'}"
  ARBITER_AGENT="${ARBITER_AGENT:-general-purpose}"
  VALIDATOR_AGENT="${VALIDATOR_AGENT:-general-purpose}"
  SCOPE_AGENT_A="${SCOPE_AGENT_A:-Explore}"
  SCOPE_AGENT_B="${SCOPE_AGENT_B:-Explore}"
  TRACKER_LABEL="${TRACKER_LABEL:-local task board + issue tracker (read-only)}"
  # intent-guard tier sources (Tier 2/3/4). `none` is a legitimate value — an absent source is REPORTED, never invented.
  SPEC_LOCATION="${SPEC_LOCATION:-.claude/specs/**}"
  PLAN_LOCATION="${PLAN_LOCATION:-.claude/features/**}"
  POLICY_LOCATION="${POLICY_LOCATION:-\`CLAUDE.md\`, \`.claude/rules/**\`}"
  GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  _sep=$'\x01'

  # Sanitize every scalar before it lands on a sed RHS: escape backslash FIRST, then ampersand
  # (& is the whole-match backreference in sed replacements). Order matters.
  for _var in PROJECT_NAME STACK_LABEL STACK_REF SOURCE_GLOB PATHSPEC_GLOBS ARBITER_AGENT VALIDATOR_AGENT \
              SCOPE_AGENT_A SCOPE_AGENT_B TRACKER_LABEL SPEC_LOCATION PLAN_LOCATION POLICY_LOCATION GENERATED_AT; do
    v="${!_var}"; v="${v//\\/\\\\}"; v="${v//&/\\&}"; printf -v "$_var" '%s' "$v"
  done
  _SCALARS_READY=1
}

_subst_raw() {
    # $1 = source template -> substituted text on STDOUT
    sed \
      -e "s${_sep}{PROJECT_NAME}${_sep}${PROJECT_NAME}${_sep}g" \
      -e "s${_sep}{STACK_LABEL}${_sep}${STACK_LABEL}${_sep}g" \
      -e "s${_sep}{STACK_REF}${_sep}${STACK_REF}${_sep}g" \
      -e "s${_sep}{SOURCE_GLOB}${_sep}${SOURCE_GLOB}${_sep}g" \
      -e "s${_sep}{PATHSPEC_GLOBS}${_sep}${PATHSPEC_GLOBS}${_sep}g" \
      -e "s${_sep}{ARBITER_AGENT}${_sep}${ARBITER_AGENT}${_sep}g" \
      -e "s${_sep}{VALIDATOR_AGENT}${_sep}${VALIDATOR_AGENT}${_sep}g" \
      -e "s${_sep}{SCOPE_AGENT_A}${_sep}${SCOPE_AGENT_A}${_sep}g" \
      -e "s${_sep}{SCOPE_AGENT_B}${_sep}${SCOPE_AGENT_B}${_sep}g" \
      -e "s${_sep}{TRACKER_LABEL}${_sep}${TRACKER_LABEL}${_sep}g" \
      -e "s${_sep}{SPEC_LOCATION}${_sep}${SPEC_LOCATION}${_sep}g" \
      -e "s${_sep}{PLAN_LOCATION}${_sep}${PLAN_LOCATION}${_sep}g" \
      -e "s${_sep}{POLICY_LOCATION}${_sep}${POLICY_LOCATION}${_sep}g" \
      -e "s${_sep}{GENERATED_AT}${_sep}${GENERATED_AT}${_sep}g" \
      "$1"
}

_subst() { _subst_raw "$1" > "$2"; }

# Copy the RAW (unsubstituted) templates under $1, keyed by the path each one is EMITTED to. Raw on purpose:
# comparing raw-vs-raw keeps per-run scalars (GENERATED_AT above all) out of the delta, so an unchanged template
# always compares byte-identical. `*` in .gitignore keeps the whole dir — itself included — out of `git add -A`.
copy_raw_templates() {
  _dst="$1"
  mkdir -p "$_dst/references"
  printf '*\n' > "$_dst/.gitignore"
  cp "$REFS/SKILL.md.template"  "$_dst/SKILL.md"
  cp "$REFS/agent-prompt.md"    "$_dst/references/agent-prompt.md"
  cp "$REFS/report-template.md" "$_dst/references/report-template.md"
  cp "$REFS/scope.md.template"  "$_dst/references/scope.md"
  # `|| true`: a missing per-stack ref must not abort the run under `set -e`.
  { [ -f "$REFS/$STACK_REF" ] && cp "$REFS/$STACK_REF" "$_dst/references/$STACK_REF"; } || true
}

# ── shared: the ONE writer of .claude/agents/intent-guard.md ────────────────────
# Called by BOTH `emit` and `emit-agent`. Never a second implementation, never a hand-written copy.
# CREATE-OR-REUSE: a USABLE existing file is the project's own tuned version and is NEVER overwritten.
# "Usable" = non-empty AND carrying `name: intent-guard` frontmatter AND free of unresolved {UPPER_SNAKE}
# tokens — a 0-byte, truncated or placeholder-laden file is treated as ABSENT and recreated, because the
# emitted skill spawns this agent at BOTH depths. The placeholder test is deliberately independent of the
# template stamp: a stamp-less hand-written agent is still never judged by template rules (see validate c2),
# but raw {UPPER_SNAKE} tokens make a file broken whoever wrote it.
_ig_usable() {
  [ -s "$IG_PATH" ] \
    && grep -q '^name:[[:space:]]*intent-guard[[:space:]]*$' "$IG_PATH" \
    && ! grep -qE '\{[A-Z_]{2,}\}' "$IG_PATH"
}

write_intent_guard() {
  if [ ! -f "$REFS/intent-guard.md.template" ]; then
    echo "❌ Emit template not found: $REFS/intent-guard.md.template"
    return 1
  fi
  resolve_scalars
  mkdir -p .claude/agents

  if _ig_usable; then
    echo "INTENT_GUARD: REUSE $IG_PATH"
    return 0
  fi
  # Diagnostic only — STDERR, so stdout keeps carrying exactly one `INTENT_GUARD:` status line.
  if [ -e "$IG_PATH" ]; then
    echo "⚠️ $IG_PATH exists but is empty, has no 'name: intent-guard' frontmatter, or still carries unresolved {PLACEHOLDER} tokens — recreating from template" >&2
  fi

  # The agent must be RUNNABLE straight out of emit — the emitted skill spawns it at BOTH depths, so a
  # half-filled agent file breaks a QUICK run entirely. The three BLOCKs therefore get stack-generic
  # DEFAULTS here, each tagged with a SEEDED-DEFAULT marker; Phase 3 REPLACES block + marker with project
  # specifics. A surviving marker is what makes a skipped adaptation visible to `validate`.
  _bd="$(mktemp -d)"
  cat > "$_bd/evidence" <<IG_EVIDENCE
\`\`\`bash
git diff --stat HEAD~1..HEAD          # size of what was delivered
git log --oneline -10                 # what the commits claim
git status --porcelain                # uncommitted spill
git diff --name-only --diff-filter=A  # files ADDED (file explosion, unrequested artifacts)
git diff -- '*package.json' '*requirements*.txt' '*pom.xml' '*build.gradle*' '*go.mod' '*Cargo.toml'
\`\`\`
${IG_SEED_MARK} evidence-commands - generic floor, replace with this repo's real commands -->
IG_EVIDENCE
  cat > "$_bd/invariants" <<IG_INVARIANTS
| Invariant | Value | Drift it makes checkable |
|---|---|---|
| Planned scale | not recorded — read it out of the request before flagging | \`intent#scale\` |
| Testing policy | the project's own convention (rules / CLAUDE.md) wins over any default | \`intent#tests\` |
| Dependency policy | a new runtime dependency needs an explicit request or a recorded decision | \`intent#deps\` |
| File-layout policy | follow the existing tree; a new top-level dir needs a stated reason | \`intent#files\`, \`intent#naming\` |
| Architecture stance | keep the pattern already in the repo unless the request replaces it | \`intent#arch\`, \`intent#indirection\` |

> These are the generic floor. Re-read the project's \`CLAUDE.md\`, rules and conventions each run and treat
> the concrete values found there as the real invariants.
${IG_SEED_MARK} project-invariants - generic floor, replace with facts read from this repo -->
IG_INVARIANTS
  cat > "$_bd/examples" <<IG_EXAMPLES
| Asked | Delivered | Class |
|---|---|---|
| "fix this one function" | the function fixed plus a refactor of its two callers | \`intent#scope\` |
| "add a small helper" | a new package with an interface, a factory and an impl | \`intent#indirection\` |
| "one script" | a directory of scripts plus a README nobody asked for | \`intent#files\`, \`intent#artifacts\` |
| "do A and B" | A done, B silently dropped, report says done | \`intent#skip\` |

> Replace these with real instances from this repo's own history — the closer the wording, the higher the hit rate.
${IG_SEED_MARK} drift-examples - generic floor, replace with real instances from this repo -->
IG_EXAMPLES

  # The template header comment carries generator instructions; it MUST NOT ship in the emitted agent.
  _subst_raw "$REFS/intent-guard.md.template" \
    | sed '/^<!-- TEMPLATE HEADER/,/-->[[:space:]]*$/d' \
    | cat -s > "$_bd/agent.md"

  # POST-STRIP POST-CONDITION. The strip is a sed RANGE: if its end pattern ever fails to match, sed deletes
  # to EOF and the result is a plausible-looking file with no tokens and no header — i.e. it passes validate.
  # Both anchors below sit OUTSIDE the header block, so their loss proves the strip ran away.
  if ! grep -q '^name:[[:space:]]*intent-guard[[:space:]]*$' "$_bd/agent.md"; then
    echo "❌ emit aborted: header strip removed the frontmatter of intent-guard.md.template"
    return 1
  fi
  if ! grep -qF "$IG_STAMP_PREFIX" "$_bd/agent.md"; then
    echo "❌ emit aborted: header strip removed the template stamp (tail anchor) of intent-guard.md.template"
    return 1
  fi

  for _pair in "{EVIDENCE_COMMANDS_BASH}:evidence" "{PROJECT_INVARIANTS_TABLE}:invariants" "{DRIFT_EXAMPLES_TABLE}:examples"; do
    _tok="${_pair%%:*}"; _file="$_bd/${_pair##*:}"
    awk -v tok="$_tok" -v cf="$_file" '
      $0 == tok { while ((getline line < cf) > 0) print line; close(cf); next }
      { print }
    ' "$_bd/agent.md" > "$_bd/agent.next" && mv "$_bd/agent.next" "$_bd/agent.md"
  done

  mv "$_bd/agent.md" "$IG_PATH"
  rm -rf "$_bd"; _bd=""
  echo "INTENT_GUARD: CREATED $IG_PATH"
}

# ── emit-agent: intent-guard ONLY (no superreview skill involved) ───────────────
emit_agent_only() {
  write_intent_guard
}

# ── emit: copy + scalar-substitute templates into the target ────────────────────
emit_skill() {
  echo "=== superreview: emit ==="
  validate_templates

  # The emitted skill SELF-SYNCS (its Phase 4b corrects its own routing table, gates, baseline and shared
  # surfaces). A blind re-emit would silently erase every one of those corrections, so a live installation is
  # never overwritten: `upgrade` refreshes it, and SUPERREVIEW_FORCE=1 is the conscious destructive override.
  if [ -f "$TARGET/SKILL.md" ] && [ "${SUPERREVIEW_FORCE:-0}" != "1" ]; then
    echo "❌ superreview is already installed at $TARGET/SKILL.md"
    echo "   It SELF-SYNCS (Phase 4b) — overwriting it destroys those in-place corrections."
    echo "   Use 'generate.sh upgrade' (live files preserved), or SUPERREVIEW_FORCE=1 to overwrite and LOSE them."
    exit 1
  fi

  resolve_scalars

  mkdir -p "$TARGET_REFS"

  _subst "$REFS/SKILL.md.template" "$TARGET/SKILL.md"
  echo "✅ $TARGET/SKILL.md"

  _subst "$REFS/agent-prompt.md" "$TARGET_REFS/agent-prompt.md"
  echo "✅ $TARGET_REFS/agent-prompt.md"

  _subst "$REFS/report-template.md" "$TARGET_REFS/report-template.md"
  echo "✅ $TARGET_REFS/report-template.md"

  _subst "$REFS/scope.md.template" "$TARGET_REFS/scope.md"
  echo "✅ $TARGET_REFS/scope.md"

  if [ -f "$REFS/$STACK_REF" ]; then
    cp "$REFS/$STACK_REF" "$TARGET_REFS/$STACK_REF"
    echo "✅ $TARGET_REFS/$STACK_REF"
  else
    echo "⚠️ stack reference not found: $REFS/$STACK_REF (emitted without per-stack doc)"
  fi

  # Pristine template copies — the ONLY thing that lets a later `upgrade` separate a real template change from
  # the Phase 3 tailoring these emitted files are about to receive.
  rm -rf "$BASELINE"
  copy_raw_templates "$BASELINE"
  echo "✅ $BASELINE (pristine templates for 'upgrade'; git-ignored)"

  # intent-guard — the anti-drift agent the emitted skill spawns at BOTH depths.
  # Written by the SHARED writer above (the same one `emit-agent` calls): one implementation, one status line.
  write_intent_guard

  echo ""
  echo "Next: AI fills BLOCK placeholders via Edit (SKILL.md Phase 3) in the emitted SKILL.md, and REPLACES the"
  echo "      SEEDED-DEFAULT blocks in $IG_PATH when this run CREATED it (skip on REUSE)"
  echo "      — then run: generate.sh validate"
}

# ── upgrade: refresh a LIVE installation, hand-edits preserved ──────────────────
# The emitted skill is EXPECTED to have self-modified (its Phase 4b SELF-SYNC) and to carry Phase 3 tailoring, so
# no live file is ever written over AND no live file is ever the diff baseline: comparing a tailored install to a
# raw template reports every tailored line as a "change". The real question is what the TEMPLATE changed, so the
# comparison is NEW template vs the pristine .template-baseline/ copy saved at emit time. The live file is only
# the place the delta gets ported INTO. Only an asset that is MISSING is restored in place — a file that does not
# exist has no hand-edits to lose — and a restored file is RAW, so it still needs Phase 3.
upgrade_skill() {
  echo "=== superreview: upgrade ==="
  validate_templates

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ nothing to upgrade: $TARGET/SKILL.md does not exist — run 'generate.sh emit' first"
    exit 1
  fi

  resolve_scalars
  rm -rf "$STAGING"
  mkdir -p "$STAGING/references"
  printf '*\n' > "$STAGING/.gitignore"   # never `git add -A` noise in the user's repo

  _subst "$REFS/SKILL.md.template"    "$STAGING/SKILL.md"
  _subst "$REFS/agent-prompt.md"      "$STAGING/references/agent-prompt.md"
  _subst "$REFS/report-template.md"   "$STAGING/references/report-template.md"
  _subst "$REFS/scope.md.template"    "$STAGING/references/scope.md"
  # `|| true`: a missing per-stack ref must not abort the run under `set -e`.
  { [ -f "$REFS/$STACK_REF" ] && cp "$REFS/$STACK_REF" "$STAGING/references/$STACK_REF"; } || true
  # Raw NEW templates, in the same shape as the baseline — this pair is what the delta is computed from.
  copy_raw_templates "$STAGING/.template"

  echo "UPGRADE_STAGING=$STAGING"
  echo "UPGRADE_BASELINE=$BASELINE"
  _restored=0
  for _rel in "SKILL.md" "references/agent-prompt.md" "references/report-template.md" \
              "references/scope.md" "references/$STACK_REF"; do
    [ -f "$STAGING/$_rel" ] || continue
    if [ ! -f "$TARGET/$_rel" ]; then
      cp "$STAGING/$_rel" "$TARGET/$_rel"
      _restored=$((_restored+1))
      echo "UPGRADE: $_rel MISSING -> restored (NEEDS PHASE 3)"
    elif [ -f "$BASELINE/$_rel" ]; then
      if cmp -s "$BASELINE/$_rel" "$STAGING/.template/$_rel"; then
        echo "UPGRADE: $_rel IDENTICAL (template unchanged since install — live file untouched)"
      else
        # `|| true`: diff exits 1 on a difference and grep exits 1 on zero matches; under pipefail either
        # would abort the assignment (repo rule avoid#7).
        _d=$(diff "$BASELINE/$_rel" "$STAGING/.template/$_rel" | grep -c '^[<>]' || true)
        echo "UPGRADE: $_rel DIFFERS ($_d template line(s)) — port into the LIVE file; see: diff \"$BASELINE/$_rel\" \"$STAGING/.template/$_rel\""
      fi
    else
      _d=$(diff "$TARGET/$_rel" "$STAGING/$_rel" | grep -c '^[<>]' || true)
      echo "UPGRADE: $_rel NO BASELINE - full diff, tailoring included ($_d line(s)) — install predates .template-baseline/; the count is NOT a template delta, review it by hand against $STAGING/$_rel"
    fi
  done

  # Same create-or-reuse writer as emit: a usable intent-guard.md is REUSED byte-untouched.
  write_intent_guard

  echo ""
  echo "No live file was overwritten. Apply the template delta with targeted Edit calls (SKILL.md Phase 2b),"
  echo "keeping every self-synced correction."
  [ "$_restored" -gt 0 ] && echo "$_restored restored file(s) are RAW templates — run Phase 3 on them BEFORE validate."
  echo "Then promote the new templates to the baseline and clean up:"
  echo "  rm -rf \"$BASELINE\" && mv \"$STAGING/.template\" \"$BASELINE\" && rm -rf \"$STAGING\" && generate.sh validate"
}

# ── validate: no setup-time {PLACEHOLDER} may remain ────────────────────────────
validate_emit() {
  echo "=== superreview: validate ==="

  if [ ! -f "$TARGET/SKILL.md" ]; then
    echo "❌ emitted skill missing: $TARGET/SKILL.md — run 'generate.sh emit' first"
    exit 1
  fi

  # Runtime tokens the emitted skill legitimately keeps (resolved at REVIEW time, not GENERATION time).
  _runtime='MODE|DEPTH|BRANCH|SCOPE|FILES|COUNT|TIMESTAMP|FOCUS|FILE_LIST|AGENT_LIST|CANDIDATES|MERGED|PATHSPEC|MAIN|SHA|FOLDER|GROUP|AGENT|N|OC|SC|K|U|D|ROOT|TOK|RANGE|REPORT_DIR|SCOPE_BASELINE|OWNERSHIP|GATE_RESULTS|PR_ISSUE_JSON|INTENT_VERDICT|USER_REQUEST'

  _errors=0
  for f in "$TARGET/SKILL.md" "$TARGET_REFS/agent-prompt.md" "$TARGET_REFS/report-template.md" \
           "$TARGET_REFS/scope.md"; do
    [ -f "$f" ] || continue
    _unresolved=$(grep -oE '\{[A-Z_]+\}' "$f" | sort -u | grep -vE "^\{(${_runtime})\}$" || true)
    if [ -n "$_unresolved" ]; then
      echo "❌ unresolved setup-time placeholders in $f:"
      echo "$_unresolved"
      _errors=$((_errors+1))
    fi
  done

  # Agent-reference allowlist: every agent named in the emitted SKILL.md must be a
  # project-local agent (.claude/agents/*.md) or a real built-in (Explore|Plan|general-purpose).
  _builtins="Explore Plan general-purpose"
  _local_agents=""
  for _af in .claude/agents/*.md; do
    [ -f "$_af" ] || continue
    _an="$(basename "$_af" .md)"
    _local_agents="$_local_agents $_an"
  done

  # (a) explicit subagent_type="NAME" / subagent_type=NAME references
  _referenced=$(grep -oE 'subagent_type=("?)[A-Za-z0-9_-]+' "$TARGET/SKILL.md" \
    | sed -E 's/^subagent_type=("?)//' | sort -u || true)
  if [ -n "$_referenced" ]; then
    while IFS= read -r _name; do
      [ -n "$_name" ] || continue
      case " $_builtins $_local_agents " in
        *" $_name "*) : ;;
        *)
          echo "❌ unknown agent referenced in SKILL.md: $_name (not in target .claude/agents/ nor built-in Explore|Plan|general-purpose)"
          _errors=$((_errors+1))
          ;;
      esac
    done <<EOF
$_referenced
EOF
  fi

  # (b) guard the known leak: bare reviewer/architect used as a built-in/fallback agent.
  for _bare in reviewer architect; do
    case " $_local_agents " in
      *" $_bare "*) continue ;;  # legitimately exists in target -> allowed
    esac
    _leak=$(grep -nE "(built-in[^A-Za-z]+\`?${_bare}\`?|fallback[^A-Za-z]+\`?${_bare}\`?|on \`${_bare}\`)" "$TARGET/SKILL.md" || true)
    if [ -n "$_leak" ]; then
      echo "❌ bare \`${_bare}\` used as a built-in/fallback agent in SKILL.md (not in target .claude/agents/ nor built-in Explore|Plan|general-purpose):"
      echo "$_leak"
      _errors=$((_errors+1))
    fi
  done

  # (c) required emitted assets — a missing one silently guts a phase of the emitted skill.
  # .claude/agents/intent-guard.md is EXECUTED by the emitted skill at BOTH depths: without it, QUICK is empty.
  for _req in "$TARGET_REFS/agent-prompt.md" "$TARGET_REFS/report-template.md" "$TARGET_REFS/scope.md"; do
    if [ ! -f "$_req" ]; then
      echo "❌ missing emitted asset: $_req"
      _errors=$((_errors+1))
    fi
  done
  # intent-guard is EXECUTED at both depths: an empty or frontmatter-less file is as broken as a missing one.
  if ! _ig_usable; then
    if [ -e "$IG_PATH" ]; then
      echo "❌ unusable emitted asset: $IG_PATH (empty, no 'name: intent-guard' frontmatter, or unresolved {PLACEHOLDER} tokens) — re-run 'generate.sh emit-agent'"
    else
      echo "❌ missing emitted asset: $IG_PATH"
    fi
    _errors=$((_errors+1))
  fi

  # (c2) TEMPLATE-DERIVED agents only. A file carrying the template stamp came out of this pipeline, so every
  # {PLACEHOLDER} in it must be resolved (scalars by emit, the three BLOCKs by AI Edit in SKILL.md Phase 3).
  # A REUSED hand-written intent-guard is byte-untouchable by contract — it is not judged by template rules.
  if _ig_usable && grep -qF "$IG_STAMP_PREFIX" "$IG_PATH"; then
    _ig_unresolved=$(grep -oE '\{[A-Z_]+\}' "$IG_PATH" | sort -u || true)
    if [ -n "$_ig_unresolved" ]; then
      echo "❌ unresolved placeholders in $IG_PATH (no token is runtime here):"
      echo "$_ig_unresolved"
      _errors=$((_errors+1))
    fi
    if grep -q '^<!-- TEMPLATE HEADER' "$IG_PATH"; then
      echo "❌ $IG_PATH still carries the TEMPLATE HEADER comment — emit must strip it"
      _errors=$((_errors+1))
    fi
    # (c3) TAILORING. Seeded BLOCK defaults are a runnable floor, not the target: a run that skipped the
    # Phase 3 adaptation ships boilerplate and would otherwise pass every gate silently. WARN, not fail —
    # `emit-agent` is a legitimate standalone path whose adaptation happens in the caller's own flow.
    _ig_seeded=$(grep -cF "$IG_SEED_MARK" "$IG_PATH" || true)
    if [ "${_ig_seeded:-0}" -gt 0 ]; then
      echo "⚠️ UNTAILORED: $IG_PATH still carries $_ig_seeded seeded generic BLOCK default(s)"
      grep -nF "$IG_SEED_MARK" "$IG_PATH" || true
      echo "   INTENT_GUARD: UNTAILORED $IG_PATH ($_ig_seeded seeded block(s)) — run SKILL.md Phase 3 and replace each block + its marker"
    fi
  elif _ig_usable; then
    echo "ℹ️ $IG_PATH carries no template stamp — treated as the project's own hand-written agent, not checked against the template"
  fi

  # (d) DOMAIN EXPERTS — a review routed only to generic agents is a degraded review.
  # Override with SUPERREVIEW_ALLOW_NO_EXPERTS=1 when the target genuinely has no domain agents.
  # intent-guard is wired into EVERY emitted skill and is NOT a domain expert — excluded, or this check
  # would pass on a project that has no expert at all.
  # The match must prove ROUTING, not mere mention. A substring grep over the whole file credits any agent
  # whose name occurs in the emitted PROSE ("the guard SKIPS the gates" credits an unwired `guard.md`;
  # `plan.md`, `scope.md` behave the same). Two wired forms count, nothing else:
  #   - a whole CELL of a markdown table row ({DOMAIN_AGENTS_TABLE} / {FILE_GROUP_MAP} rows), backticks and
  #     emphasis stripped, comma lists split;
  #   - an explicit `subagent_type=NAME`.
  # Matching is exact-line (`grep -xF`), so a name is either the routed value or it is not wired.
  _wired=$( { awk -F'|' '
      /^[[:space:]]*\|/ {
        for (i = 1; i <= NF; i++) {
          n = split($i, parts, ",")
          for (j = 1; j <= n; j++) {
            c = parts[j]
            gsub(/[`*[:space:]]/, "", c)
            if (c != "") print c
          }
        }
      }' "$TARGET/SKILL.md"
    grep -oE 'subagent_type=("?)[A-Za-z0-9_-]+' "$TARGET/SKILL.md" | sed -E 's/^subagent_type=("?)//'
  } | sort -u || true)
  _experts=0
  for _name in $_local_agents; do
    [ "$_name" = "intent-guard" ] && continue
    printf '%s\n' "$_wired" | grep -qxF "$_name" && _experts=$((_experts+1))
  done
  if [ "$_experts" -eq 0 ]; then
    if [ "${SUPERREVIEW_ALLOW_NO_EXPERTS:-0}" = "1" ]; then
      echo "⚠️ no project domain expert wired (allowed by SUPERREVIEW_ALLOW_NO_EXPERTS=1) — the emitted review is DEGRADED"
    else
      echo "❌ no project domain expert (.claude/agents/*.md) is wired into SKILL.md — create the missing experts"
      echo "   (see SKILL.md Phase 1.6) or re-run with SUPERREVIEW_ALLOW_NO_EXPERTS=1 to accept a degraded review"
      _errors=$((_errors+1))
    fi
  else
    echo "✅ domain experts wired: $_experts"
  fi

  # Leftover upgrade staging: a stale second copy of the skill. Warning only — it changes no behaviour, and its
  # own .gitignore keeps it out of the user's commits.
  [ -d "$STAGING" ] && echo "⚠️ leftover upgrade staging at $STAGING — once the delta is applied: rm -rf \"$BASELINE\" && mv \"$STAGING/.template\" \"$BASELINE\" && rm -rf \"$STAGING\"" || true
  # No baseline = every future `upgrade` falls back to a live-vs-template diff that cannot separate tailoring
  # from a template change. Warning only: an install emitted before baselines existed is still valid.
  [ -d "$BASELINE" ] || echo "⚠️ no $BASELINE — 'upgrade' will report NO BASELINE (full diff, tailoring included). Re-emit or promote a staged .template to fix it"

  if [ "$_errors" -eq 0 ]; then
    echo "✅ no unresolved setup-time placeholders"
  fi
  exit "$_errors"
}

case "$MODE" in
  scan) scan_target ;;
  emit) emit_skill ;;
  emit-agent) emit_agent_only ;;
  upgrade) upgrade_skill ;;
  validate) validate_emit ;;
  *)
    echo "Usage: generate.sh <scan|emit|emit-agent|upgrade|validate>"
    echo "  emit        refuses to overwrite a live installation (SUPERREVIEW_FORCE=1 overrides, DESTROYS self-sync edits)"
    echo "  emit-agent  create-or-reuse <cwd>/.claude/agents/intent-guard.md ONLY (no superreview skill needed);"
    echo "              prints 'INTENT_GUARD: CREATED <path>' or 'INTENT_GUARD: REUSE <path>'"
    echo "  upgrade     refresh a live installation; reports NEW template vs .template-baseline/ (the real template"
    echo "              delta, tailoring excluded), restores missing assets RAW (NEEDS PHASE 3), never overwrites"
    exit 1
    ;;
esac
