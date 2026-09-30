#!/usr/bin/env sh
# Bump version in ALL 4 JSON files (must always be in sync)
#
# Usage:
#   bash .claude/scripts/bump-version.sh <new-version>
#   bash .claude/scripts/bump-version.sh 3.3.0
#   bash .claude/scripts/bump-version.sh          # show current version
#
# Exit codes: 0 success, 1 error, 2 bad args

set -eu

# --- Paths (relative to repo root) ---
BREWCODE_PLUGIN="brewcode/.claude-plugin/plugin.json"
BREWDOC_PLUGIN="brewdoc/.claude-plugin/plugin.json"
BREWTOOLS_PLUGIN="brewtools/.claude-plugin/plugin.json"
BREWUI_PLUGIN="brewui/.claude-plugin/plugin.json"
MARKETPLACE=".claude-plugin/marketplace.json"
PACKAGE="brewcode/package.json"

# --- Baked artifact stamps ---------------------------------------------------
# Every asset a setup skill copies byte-for-byte into a consumer project carries
#   brewcode-meta: version=<X.Y.Z> content_version=<X.Y.Z> generated_by=<plugin>:<skill>
# baked at RELEASE time, never at install time: `setup-status` compares the
#
# `version` = the plugin release that produced this file (bumped every run).
# `content_version` = the release in which this file's BODY last actually
# changed (computed below in content_version_for/strip_meta_for_diff) — lets
# `setup-status` tell real drift apart from a version-only churn.
# installed file against the plugin asset with `cmp -s`, so an install-time
# stamp would make every install report DIFFERS forever.
#
# A file that instead carries {PLUGIN_VERSION}/{GENERATED_BY}/{LAST_UPDATED} tokens is
# substituted at INSTALL time and MUST NOT be listed here: a baked literal would make its
# raw baseline copy differ on every release (the superreview references were exactly that
# bug). The two mechanisms are mutually exclusive per file.
#
# Columns: path|kind|generated_by
# `mjs`/`sh`/`md`/`marker` all share ONE position-independent global substitution on the
# `brewcode-meta: version=... generated_by=...` fragment — the kind only records which
# comment syntax wraps it, never where the line sits:
#   mjs    -> `// brewcode-meta: ...`  (line 2 after the shebang)
#   sh     -> `# brewcode-meta: ...`   (line 2 after a shebang, line 1 when there is none)
#   md     -> `<!-- brewcode-meta: ... -->` (line 1)
#   marker -> the asset's own line-1 HTML marker carries the stamp inline
#   fm     -> YAML frontmatter keys `version:` / `generated_by:`
#   fmd    -> `fm` plus `last_updated:` set to the release date. Only for
#             hand-maintained SHIPPED artifacts (the 8 plugin agents + the
#             artifact-metadata spec doc), where the date legitimately means
#             "shipped in the release of that day".
#             `generated_by` is the BARE plugin name there — no skill produces them.
#             Never for byte-copied assets: a date there would churn every build.
# Frontmatter rewrites are scoped to the leading `---` block, so YAML examples
# inside fenced code further down a file can never be touched.
# A file listed here and missing on disk FAILS the run.
STAMPED_FILES='brewcode/skills/semble-setup/assets/semble-session.mjs|mjs|brewcode:semble-setup
brewcode/skills/semble-setup/assets/semble-prefetch.mjs|mjs|brewcode:semble-setup
brewcode/skills/semble-setup/assets/semble-stats.mjs|mjs|brewcode:semble-setup
brewcode/skills/semble-setup/assets/semble-first.md.template|fm|brewcode:semble-setup
brewcode/skills/semble-setup/assets/sembleignore.template|sh|brewcode:semble-setup
brewcode/skills/teams-setup/scripts/trace-ops.sh|sh|brewcode:teams-setup
brewcode/skills/teams-setup/SKILL.md|marker|brewcode:teams-setup
brewtools/skills/think-short-setup/assets/think-short-session.mjs|mjs|brewtools:think-short-setup
brewtools/skills/think-short-setup/assets/think-short-prompt-counter.mjs|mjs|brewtools:think-short-setup
brewtools/skills/think-short-setup/assets/think-short-subagent.mjs|mjs|brewtools:think-short-setup
brewtools/skills/think-short-setup/assets/think-short-prompt.md|marker|brewtools:think-short-setup
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

# --- Shipped docs carrying a bare version literal ----------------------------
# Not byte-copied assets, so they get no `brewcode-meta` stamp — they are human-facing
# pages shipped inside the plugin whose header states the plugin version. They were
# hand-maintained, which is how brewui/README.md drifted to 3.18.0 against a 5.0.0
# manifest. Same loop as the README table row rather than a third mechanism: every
# carrier here is a one-line header literal, so one anchored rewrite covers all of them.
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
for f in "$BREWCODE_PLUGIN" "$BREWDOC_PLUGIN" "$BREWTOOLS_PLUGIN" "$BREWUI_PLUGIN" "$MARKETPLACE" "$PACKAGE"; do
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
    echo "  marketplace.json meta:   $(jq -r '.metadata.version' "$MARKETPLACE")"
    echo "  marketplace.json [0]:    $(jq -r '.plugins[0].version' "$MARKETPLACE")"
    echo "  marketplace.json [1]:    $(jq -r '.plugins[1].version' "$MARKETPLACE")"
    echo "  marketplace.json [2]:    $(jq -r '.plugins[2].version' "$MARKETPLACE")"
    echo "  marketplace.json [3]:    $(jq -r '.plugins[3].version' "$MARKETPLACE")"
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

# --- Update all 4 files ---
jq_update ".version = \"$NEW\"" "$BREWCODE_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWDOC_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWTOOLS_PLUGIN"
jq_update ".version = \"$NEW\"" "$BREWUI_PLUGIN"
jq_update ".metadata.version = \"$NEW\" | .plugins[0].version = \"$NEW\" | .plugins[1].version = \"$NEW\" | .plugins[2].version = \"$NEW\" | .plugins[3].version = \"$NEW\"" "$MARKETPLACE"
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

# --- Content-version helpers --------------------------------------------------
# content_version stays put across a release that never touched this file's body,
# and only advances to $NEW when the body genuinely changed since the release
# that last moved it. Comparison strips the meta line/fields (which always change)
# before diffing, so a version-only bump never looks like a content change.
strip_meta_for_diff() {
    _kind="$1"
    if [ "$_kind" = "fm" ] || [ "$_kind" = "fmd" ]; then
        sed -E '2,/^---$/{/^version: "/d;/^content_version: "/d;/^generated_by: "/d;/^last_updated: "/d;}'
    else
        sed -E '/brewcode-meta:/d'
    fi
}

# Reads the file's CURRENT on-disk content_version, compares its stripped body
# against the copy at that same content_version's git tag. Identical -> preserve
# the old value. Anything else (no old value, no matching tag, no historical
# copy, or a real content diff) is treated as CHANGED -> $NEW (safe default).
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

# --- Regenerate the Codex compatibility mirror ---
# .codex/plugins/** duplicates a dozen of the stamped assets, so the mirror MUST be
# rebuilt from source in the same transaction that moves the version. Wired into the
# script rather than left as a documented manual step: the documented step is exactly
# what let the mirror rot a full major version behind (4.0.6 vs 5.0.0).
# The mirror's OWN compat version is deliberately independent of the plugin version and is
# NOT touched here — not by this script, not by hand. It is `VERSION = '4.0.6'` in
# .codex/scripts/validate-compat.mjs:9, enforced at validate-compat.mjs:86 against NINE
# manifests that must all read `4.0.6` or `4.0.6+codex.<date>`:
#   brewcode/.codex/.codex-plugin/plugin.json   brewcode/.codex/package/plugin.json
#   brewdoc/.codex/.codex-plugin/plugin.json    brewdoc/.codex/package/plugin.json
#   brewtools/.codex/.codex-plugin/plugin.json  brewtools/.codex/package/plugin.json
#   .codex/plugins/brewcode/.codex-plugin/plugin.json
#   .codex/plugins/brewdoc/.codex-plugin/plugin.json
#   .codex/plugins/brewtools/.codex-plugin/plugin.json
# Raising any of them to the plugin version is NOT a fix — it breaks the Codex contract.
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
verify "marketplace.json meta"   "$(jq -r '.metadata.version' "$MARKETPLACE")"
verify "marketplace.json [0]"    "$(jq -r '.plugins[0].version' "$MARKETPLACE")"
verify "marketplace.json [1]"    "$(jq -r '.plugins[1].version' "$MARKETPLACE")"
verify "marketplace.json [2]"    "$(jq -r '.plugins[2].version' "$MARKETPLACE")"
verify "marketplace.json [3]"    "$(jq -r '.plugins[3].version' "$MARKETPLACE")"
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
        # grep -c prints 0 AND exits 1 on zero matches -> || true, then default.
        # -a: agent-router.mjs holds a raw NUL byte (line 429), so grep classifies it as
        # binary and some implementations (ugrep) then print nothing at all for -c.
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
echo "  $MARKETPLACE (5 fields)"
echo "  $PACKAGE (2 fields)"
echo "  $STAMP_COUNT baked asset stamps (brewcode-meta: version + content_version)"
echo "  $DOC_COUNT shipped docs with a version header"
echo "  .codex/ mirror regenerated + validated"
echo ""
echo "Next: bash .claude/scripts/update-plugin.sh && claude plugin marketplace update claude-brewcode && claude plugin update brewcode@claude-brewcode && claude plugin update brewdoc@claude-brewcode && claude plugin update brewtools@claude-brewcode && claude plugin update brewui@claude-brewcode"
