#!/usr/bin/env sh
# Usage: bash .claude/scripts/bump-version.sh [X.Y.Z] -> 8 version JSONs (6 plugins + marketplace + package.json) + stamps + versioned docs + .codex mirror; no arg = show.
# Idempotent (same version re-applies + re-verifies). Exit: 0 ok, 1 error or verify failed, 2 bad args.

set -eu

# --- Paths (relative to repo root) ---
BREWCODE_PLUGIN="brewcode/.claude-plugin/plugin.json"
BREWDOC_PLUGIN="brewdoc/.claude-plugin/plugin.json"
BREWTOOLS_PLUGIN="brewtools/.claude-plugin/plugin.json"
BREWUI_PLUGIN="brewui/.claude-plugin/plugin.json"
BREWMOD_PLAN_EFFORT_PLUGIN="brewmod-plan-effort/.claude-plugin/plugin.json"
BREWMOD_PLACEHOLDERS_PLUGIN="brewmod-placeholders/.claude-plugin/plugin.json"
MARKETPLACE=".claude-plugin/marketplace.json"
PACKAGE="brewcode/package.json"

# path|kind|generated_by; baked at RELEASE (setup-status `cmp -s`), never for install-time {PLUGIN_VERSION} files; missing = FAIL.
# kind = wrapper only: mjs `//`, sh `#`, md `<!-- -->`, marker line-1 HTML marker, fm leading frontmatter, fmd fm + last_updated (hand-maintained shipped files).
STAMPED_FILES='brewcode/skills/semble-setup/assets/semble-session.mjs|mjs|brewcode:semble-setup
brewcode/skills/semble-setup/assets/semble-stats.mjs|mjs|brewcode:semble-setup
brewcode/skills/semble-setup/assets/semble-subagent.mjs|mjs|brewcode:semble-setup
brewcode/skills/semble-setup/assets/semble-first.md.template|fm|brewcode:semble-setup
brewcode/skills/semble-setup/assets/sembleignore.template|sh|brewcode:semble-setup
brewcode/skills/teams-setup/scripts/trace-ops.sh|sh|brewcode:teams-setup
brewcode/skills/teams-setup/SKILL.md|marker|brewcode:teams-setup
brewcode/skills/convention-setup/SKILL.md|marker|brewcode:convention-setup
brewtools/skills/agent-deadline-setup/assets/agent-deadline-guard.mjs|mjs|brewtools:agent-deadline-setup
brewtools/skills/agent-deadline-setup/assets/agent-deadline-cleanup.mjs|mjs|brewtools:agent-deadline-setup
brewtools/skills/agent-return-setup/assets/agent-return-budget.mjs|mjs|brewtools:agent-return-setup
brewtools/skills/agent-return-setup/assets/agent-return-contract.mjs|mjs|brewtools:agent-return-setup
brewtools/skills/agent-return-setup/assets/agent-return-guard.mjs|mjs|brewtools:agent-return-setup
brewtools/skills/agent-router-setup/assets/agent-router.mjs|mjs|brewtools:agent-router-setup
brewtools/hooks/hardmode-guard.mjs|mjs|brewtools:manager-setup
brewtools/hooks/lib/manager-state.mjs|mjs|brewtools:manager-setup
brewtools/agents/ssh-admin.md|fmd|brewtools
brewtools/agents/deploy-admin.md|fmd|brewtools
brewtools/agents/text-optimizer.md|fmd|brewtools
brewcode/agents/agent-creator.md|fmd|brewcode
brewcode/agents/bash-expert.md|fmd|brewcode
brewcode/agents/bc-rules-organizer.md|fmd|brewcode
brewcode/agents/hook-creator.md|fmd|brewcode
brewcode/agents/mod-creator.md|fmd|brewcode
brewcode/agents/skill-creator.md|fmd|brewcode
brewcode/skills/setup-status/references/artifact-metadata.md|fmd|brewcode
brewdoc/skills/docsync-setup/assets/docsync-track.mjs|mjs|brewdoc:docsync-setup
brewdoc/skills/docsync-setup/assets/docsync-watch.mjs|mjs|brewdoc:docsync-setup
brewdoc/skills/docsync-setup/assets/docsync-gate.mjs|mjs|brewdoc:docsync-setup
brewdoc/skills/memory-sync-setup/references/memory-guide.md|md|brewdoc:memory-sync-setup
brewdoc/skills/memory-sync-setup/references/agent-audit.md|md|brewdoc:memory-sync-setup
brewdoc/skills/memory-sync-setup/references/hard-sync.md|md|brewdoc:memory-sync-setup
brewdoc/skills/memory-sync-setup/references/prompting-guide.md|md|brewdoc:memory-sync-setup
brewtools/skills/agent-deadline-setup/assets/INSTALL.md|marker|brewtools:agent-deadline-setup
brewtools/skills/agent-return-setup/assets/INSTALL.md|marker|brewtools:agent-return-setup
brewtools/skills/agent-router-setup/assets/INSTALL.md|marker|brewtools:agent-router-setup
brewtools/skills/agent-router-setup/assets/judge-prompt.md|marker|brewtools:agent-router-setup
brewdoc/skills/docsync-setup/SKILL.md|marker|brewdoc:docsync-setup
brewdoc/skills/md-to-pdf/SKILL.md|marker|brewdoc:md-to-pdf
brewtools/skills/task-board-setup/SKILL.md|marker|brewtools:task-board-setup
brewdoc/skills/memory-sync-setup/SKILL.md|marker|brewdoc:memory-sync-setup
brewcode/skills/superreview-setup/SKILL.md|marker|brewcode:superreview-setup
brewcode/skills/e2e/SKILL.md|marker|brewcode:e2e'

# --- Shipped docs whose header states the plugin version (no stamp; one anchored rewrite each) ---
VERSIONED_DOCS='brewcode/README.md
brewdoc/README.md
brewtools/README.md
brewui/README.md
brewcode/docs/commands.md
brewcode/docs/file-tree.md
brewdoc/docs/commands.md'

# The complete set of version CARRIERS. Deliberately anchored: these files also contain
# historical prose ("dropped in v5.0.0", "broken before v5.0.0") that must never move.
DOC_VER_GREP='\| Version \| [0-9]+\.[0-9]+\.[0-9]+ \||\*\*ver:\*\* [0-9]+\.[0-9]+\.[0-9]+|\*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+|^> Version: [0-9]+\.[0-9]+\.[0-9]+|version [0-9]+\.[0-9]+\.[0-9]+, skills/|claude-plugin-brewcode@[0-9]+\.[0-9]+\.[0-9]+'

doc_rewrite() {
    _f="$1"
    [ -f "$_f" ] || return 0
    sed -i.bak -E \
        -e "s/\| Version \| [0-9]+\.[0-9]+\.[0-9]+ \|/| Version | $NEW |/" \
        -e "s/\*\*ver:\*\* [0-9]+\.[0-9]+\.[0-9]+/**ver:** $NEW/" \
        -e "s/\*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+/**Version:** $NEW/" \
        -e "s|^> Version: [0-9]+\.[0-9]+\.[0-9]+|> Version: $NEW|" \
        -e "s|version [0-9]+\.[0-9]+\.[0-9]+, skills/|version $NEW, skills/|" \
        -e "s/claude-plugin-brewcode@[0-9]+\.[0-9]+\.[0-9]+/claude-plugin-brewcode@$NEW/" "$_f"
    rm -f "${_f}.bak"
}

doc_verify() {
    _f="$1"
    if [ ! -f "$_f" ]; then
        echo "  FAILED: versioned doc missing on disk: $_f"
        ERRORS=$((ERRORS + 1))
        return 0
    fi
    _seen=$(grep -oE "$DOC_VER_GREP" "$_f" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u | tr '\n' ' ' | sed 's/ $//' || true)
    if [ -z "$_seen" ]; then
        echo "  FAILED: $_f carries no recognised version line (carrier renamed?)"
        ERRORS=$((ERRORS + 1))
    elif [ "$_seen" != "$NEW" ]; then
        echo "  FAILED: $_f version literals = [$_seen] (expected $NEW)"
        ERRORS=$((ERRORS + 1))
    fi
}

# Release date — only ever written into `fmd` artifacts (see above).
RELEASE_DATE=$(date +%Y-%m-%d)

# --- Codex compatibility mirror ---
CODEX_GENERATE=".codex/scripts/generate-compat.mjs"
CODEX_VALIDATE=".codex/scripts/validate-compat.mjs"

# --- Helpers ---
die() { echo "ERROR: $*" >&2; exit 1; }
die_args() { echo "ERROR: $*" >&2; exit 2; }

# --- Prereqs ---
command -v jq >/dev/null 2>&1 || die "jq required. Run: brew install jq"

# --- Validate repo root ---
for f in "$BREWCODE_PLUGIN" "$BREWDOC_PLUGIN" "$BREWTOOLS_PLUGIN" "$BREWUI_PLUGIN" "$BREWMOD_PLAN_EFFORT_PLUGIN" "$BREWMOD_PLACEHOLDERS_PLUGIN" "$MARKETPLACE" "$PACKAGE"; do
    [ -f "$f" ] || die "Not found: $f (run from project root)"
done

# --- Read current version ---
CURRENT=$(jq -r '.version' "$BREWCODE_PLUGIN")

# --- No arg: show current and exit ---
if [ $# -eq 0 ]; then
    echo "Current version: $CURRENT"
    echo ""
    echo "  brewcode plugin.json:    $(jq -r '.version' "$BREWCODE_PLUGIN")"
    echo "  brewdoc plugin.json:     $(jq -r '.version' "$BREWDOC_PLUGIN")"
    echo "  brewtools plugin.json:   $(jq -r '.version' "$BREWTOOLS_PLUGIN")"
    echo "  brewui plugin.json:      $(jq -r '.version' "$BREWUI_PLUGIN")"
    echo "  brewmod-placeholders:    $(jq -r '.version' "$BREWMOD_PLACEHOLDERS_PLUGIN")"
    echo "  brewmod-plan-effort:     $(jq -r '.version' "$BREWMOD_PLAN_EFFORT_PLUGIN")"
    echo "  marketplace.json meta:   $(jq -r '.metadata.version' "$MARKETPLACE")"
    jq -r '.plugins[] | "  marketplace.json " + .name + ": " + .version' "$MARKETPLACE"
    echo "  package.json:            $(jq -r '.version' "$PACKAGE")"
    echo "  package.json plugin:     $(jq -r '."claude-plugin".version' "$PACKAGE")"
    exit 0
fi

NEW="$1"

# --- Validate version format (N.N.N) ---
echo "$NEW" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || die_args "Invalid version format: '$NEW' (expected N.N.N)"

# --- Already at target version: still re-apply stamps + verify (idempotent) ---
if [ "$CURRENT" = "$NEW" ]; then
    echo "Already at version $NEW - re-applying stamps and verifying"
else
    echo "Bumping version: $CURRENT -> $NEW"
fi
echo ""

# --- Update helper: jq filter -> file ---
jq_update() {
    _filter="$1"
    _file="$2"
    _tmp="${_file}.tmp"
    jq "$_filter" "$_file" > "$_tmp" && mv "$_tmp" "$_file"
}

# --- Update all version files (marketplace: every plugin entry by wildcard) ---
jq_update ".version = \"$NEW\"" "$BREWCODE_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWDOC_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWTOOLS_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWUI_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWMOD_PLAN_EFFORT_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWMOD_PLACEHOLDERS_PLUGIN"
jq_update ".metadata.version = \"$NEW\" | (.plugins[].version) = \"$NEW\"" "$MARKETPLACE"
jq_update ".version = \"$NEW\" | .\"claude-plugin\".version = \"$NEW\"" "$PACKAGE"

# Update every shipped doc that states the plugin version
DOC_COUNT=0
while IFS= read -r _d; do
    [ -z "$_d" ] && continue
    doc_rewrite "$_d"
    DOC_COUNT=$((DOC_COUNT + 1))
done <<DOCS
$VERSIONED_DOCS
DOCS

# --- Content-version helpers ---
# content_version advances to $NEW only when the meta-stripped body changed since tag v<content_version>.
strip_meta_for_diff() {
    _kind="$1"
    if [ "$_kind" = "fm" ] || [ "$_kind" = "fmd" ]; then
        sed -E '2,/^---$/{/^version: "/d;/^content_version: "/d;/^generated_by: "/d;/^last_updated: "/d;}'
    else
        sed -E '/brewcode-meta:/d'
    fi
}

# Body identical to tag v<old> -> keep old; no old value/tag/copy or any diff -> $NEW.
content_version_for() {
    _f="$1"; _kind="$2"
    _old_cv=""
    if [ -f "$_f" ]; then
        if [ "$_kind" = "fm" ] || [ "$_kind" = "fmd" ]; then
            _old_cv=$(sed -n '2,/^---$/s/^content_version: "\(.*\)"$/\1/p' "$_f" | head -1)
        else
            _old_cv=$(grep -aoE 'content_version=[0-9]+\.[0-9]+\.[0-9]+' "$_f" | head -1 | sed 's/^content_version=//')
        fi
    fi
    if [ -n "$_old_cv" ] && git rev-parse -q --verify "v$_old_cv" >/dev/null 2>&1; then
        _hist=$(git show "v$_old_cv:$_f" 2>/dev/null | strip_meta_for_diff "$_kind")
        _cur=$(strip_meta_for_diff "$_kind" < "$_f")
        if [ -n "$_hist" ] && [ "$_hist" = "$_cur" ]; then
            echo "$_old_cv"
            return 0
        fi
    fi
    echo "$NEW"
}

# --- Rewrite the baked stamps ---
# A missing file is NOT patched here; stamp_verify below turns it into a hard failure.
stamp_rewrite() {
    _f="$1"; _kind="$2"; _by="$3"; _cv="$4"
    [ -f "$_f" ] || return 0
    if [ "$_kind" = "fm" ] || [ "$_kind" = "fmd" ]; then
        # `2,/^---$/` confines every substitution to the leading frontmatter block.
        sed -i.bak -E \
            -e "2,/^---\$/s|^version: \"[0-9]+\.[0-9]+\.[0-9]+\"\$|version: \"$NEW\"|" \
            -e "2,/^---\$/s|^content_version: \"[0-9]+\.[0-9]+\.[0-9]+\"\$|content_version: \"$_cv\"|" \
            -e "2,/^---\$/s|^generated_by: \".*\"\$|generated_by: \"$_by\"|" "$_f"
        if [ "$_kind" = "fmd" ]; then
            rm -f "${_f}.bak"
            sed -i.bak -E \
                "2,/^---\$/s|^last_updated: \".*\"\$|last_updated: \"$RELEASE_DATE\"|" "$_f"
        fi
    else
        sed -i.bak -E \
            "s|brewcode-meta: version=[0-9]+\.[0-9]+\.[0-9]+ content_version=[0-9]+\.[0-9]+\.[0-9]+ generated_by=[^ ]*|brewcode-meta: version=$NEW content_version=$_cv generated_by=$_by|" "$_f"
    fi
    rm -f "${_f}.bak"
}

STAMP_COUNT=0
CV_MAP_FILE=$(mktemp "${TMPDIR:-/tmp}/bump-version-cv.XXXXXX")
while IFS='|' read -r _p _k _b; do
    [ -z "$_p" ] && continue
    _cv=$(content_version_for "$_p" "$_k")
    printf '%s|%s\n' "$_p" "$_cv" >> "$CV_MAP_FILE"
    stamp_rewrite "$_p" "$_k" "$_b" "$_cv"
    STAMP_COUNT=$((STAMP_COUNT + 1))
done <<STAMPS
$STAMPED_FILES
STAMPS

# --- Regenerate the Codex mirror (it duplicates stamped assets) in the same run ---
# Its 9 `codex*/plugin.json` manifests stay 4.0.6[+codex.*] (`VERSION` in validate-compat.mjs), != plugin version; never raise them.
[ -f "$CODEX_GENERATE" ] || die "Not found: $CODEX_GENERATE"
command -v node >/dev/null 2>&1 || die "node required to regenerate $CODEX_GENERATE"
node "$CODEX_GENERATE" || die "Codex mirror regeneration failed: $CODEX_GENERATE"
echo "Codex mirror regenerated from source"
echo ""

# --- Verify all fields ---
ERRORS=0
verify() {
    _label="$1"
    _actual="$2"
    if [ "$_actual" != "$NEW" ]; then
        echo "  FAILED: $_label = $_actual (expected $NEW)"
        ERRORS=$((ERRORS + 1))
    fi
}

verify "brewcode plugin.json"    "$(jq -r '.version' "$BREWCODE_PLUGIN")"
verify "brewdoc plugin.json"     "$(jq -r '.version' "$BREWDOC_PLUGIN")"
verify "brewtools plugin.json"   "$(jq -r '.version' "$BREWTOOLS_PLUGIN")"
verify "brewui plugin.json"      "$(jq -r '.version' "$BREWUI_PLUGIN")"
verify "brewmod-plan-effort plugin.json"  "$(jq -r '.version' "$BREWMOD_PLAN_EFFORT_PLUGIN")"
verify "brewmod-placeholders plugin.json" "$(jq -r '.version' "$BREWMOD_PLACEHOLDERS_PLUGIN")"
verify "marketplace.json meta"   "$(jq -r '.metadata.version' "$MARKETPLACE")"
# Every marketplace plugin by NAME (no fixed indexes), then the required six must all be present.
_mp_rows=$(jq -r '.plugins[] | .name + "|" + (.version // "null")' "$MARKETPLACE")
_mp_seen=" "
while IFS='|' read -r _n _mv; do
    [ -z "$_n" ] && continue
    verify "marketplace.json plugin $_n" "$_mv"
    _mp_seen="$_mp_seen$_n "
done <<MPROWS
$_mp_rows
MPROWS
for _n in brewcode brewdoc brewtools brewui brewmod-plan-effort brewmod-placeholders; do
    case "$_mp_seen" in
        *" $_n "*) ;;
        *) echo "  FAILED: marketplace.json has no plugin entry named $_n"; ERRORS=$((ERRORS + 1)) ;;
    esac
done
verify "package.json"            "$(jq -r '.version' "$PACKAGE")"
verify "package.json plugin"     "$(jq -r '."claude-plugin".version' "$PACKAGE")"

while IFS= read -r _d; do
    [ -z "$_d" ] && continue
    doc_verify "$_d"
done <<DOCS
$VERSIONED_DOCS
DOCS

# --- Verify every baked stamp ---
stamp_verify() {
    _f="$1"; _kind="$2"; _by="$3"; _cv="$4"
    if [ ! -f "$_f" ]; then
        echo "  FAILED: stamped asset missing on disk: $_f"
        ERRORS=$((ERRORS + 1))
        return 0
    fi
    if [ "$_kind" = "fm" ] || [ "$_kind" = "fmd" ]; then
        _v=$(sed -n '2,/^---$/s/^version: "\(.*\)"$/\1/p' "$_f" | head -1)
        _c=$(sed -n '2,/^---$/s/^content_version: "\(.*\)"$/\1/p' "$_f" | head -1)
        _g=$(sed -n '2,/^---$/s/^generated_by: "\(.*\)"$/\1/p' "$_f" | head -1)
        if [ "$_v" != "$NEW" ] || [ "$_c" != "$_cv" ] || [ "$_g" != "$_by" ]; then
            echo "  FAILED: $_f frontmatter stamp = version:'$_v' content_version:'$_c' generated_by:'$_g' (expected '$NEW' / '$_cv' / '$_by')"
            ERRORS=$((ERRORS + 1))
        fi
        if [ "$_kind" = "fmd" ]; then
            _d=$(sed -n '2,/^---$/s/^last_updated: "\(.*\)"$/\1/p' "$_f" | head -1)
            if [ "$_d" != "$RELEASE_DATE" ]; then
                echo "  FAILED: $_f last_updated:'$_d' (expected '$RELEASE_DATE')"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    else
        # grep -c exits 1 on zero matches -> || true; -a: a binary-classified file makes ugrep -c print nothing.
        _n=$(grep -acF "brewcode-meta: version=$NEW content_version=$_cv generated_by=$_by" "$_f" || true)
        _n=${_n:-0}
        if [ "$_n" -lt 1 ]; then
            echo "  FAILED: $_f carries no 'brewcode-meta: version=$NEW content_version=$_cv generated_by=$_by'"
            ERRORS=$((ERRORS + 1))
        fi
    fi
}

while IFS='|' read -r _p _k _b; do
    [ -z "$_p" ] && continue
    _cv=$(awk -F'|' -v p="$_p" '$1==p{print $2; exit}' "$CV_MAP_FILE")
    stamp_verify "$_p" "$_k" "$_b" "$_cv"
done <<STAMPS
$STAMPED_FILES
STAMPS
rm -f "$CV_MAP_FILE"

if [ -f "$CODEX_VALIDATE" ]; then
    node "$CODEX_VALIDATE" >/dev/null || {
        echo "  FAILED: $CODEX_VALIDATE - run it directly for the error list"
        ERRORS=$((ERRORS + 1))
    }
else
    echo "  FAILED: missing $CODEX_VALIDATE"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
    die "Verification failed: $ERRORS field(s) not updated"
fi

# --- Summary ---
echo "Version bumped: $CURRENT -> $NEW"
echo ""
echo "Updated files:"
echo "  $BREWCODE_PLUGIN"
echo "  $BREWDOC_PLUGIN"
echo "  $BREWTOOLS_PLUGIN"
echo "  $BREWUI_PLUGIN"
echo "  $BREWMOD_PLACEHOLDERS_PLUGIN"
echo "  $BREWMOD_PLAN_EFFORT_PLUGIN"
echo "  $MARKETPLACE (metadata + every plugin entry)"
echo "  $PACKAGE (2 fields)"
echo "  $STAMP_COUNT baked asset stamps (brewcode-meta: version + content_version)"
echo "  $DOC_COUNT shipped docs with a version header"
echo "  .codex/ mirror regenerated + validated"
echo ""
echo "Next: bash .claude/scripts/update-plugin.sh && claude plugin marketplace update claude-brewcode && for p in brewcode brewdoc brewtools brewui brewmod-placeholders brewmod-plan-effort; do claude plugin update \$p@claude-brewcode; done"
