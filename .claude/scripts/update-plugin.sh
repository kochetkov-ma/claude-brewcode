#!/bin/bash
# update-plugin.sh [brewcode|brewdoc|brewtools|brewui|all] [--dry-run|--help]: marketplace -> user-scope install/update -> project/local-scope updates (from each projectPath) -> prune old cache.
# Profile = $CLAUDE_CONFIG_DIR: `env -u CLAUDE_CONFIG_DIR bash update-plugin.sh` (~/.claude) | `CLAUDE_CONFIG_DIR=~/.claude-a bash update-plugin.sh`

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Explicit ~/.claude is unset again: once the var is set the CLI reads <dir>/.claude.json, not ~/.claude.json.
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CONFIG_DIR="${CONFIG_DIR%/}"
if [[ "$CONFIG_DIR" == "$HOME/.claude" ]]; then unset CLAUDE_CONFIG_DIR; fi
PLUGINS_ROOT="${CLAUDE_CODE_PLUGIN_CACHE_DIR:-$CONFIG_DIR/plugins}"
CACHE_ROOT="$PLUGINS_ROOT/cache/claude-brewcode"

# `claude plugin` resets stdout in a non-TTY (Bash tool), so every line is also written to $LOG.
LOG="${BREWCODE_UPDATE_LOG:-${TMPDIR:-/tmp}/brewcode-update.log}"
: > "$LOG"

log() { echo "$*" | tee -a "$LOG"; }
err() { log ""; log "ERROR: $*"; exit 1; }

# --- Argument parsing ---
TARGET="all"
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        brewcode|brewdoc|brewtools|brewui|all) TARGET="$arg" ;;
        --dry-run) DRY_RUN=true ;;
        --help|-h)
            echo "Usage: [CLAUDE_CONFIG_DIR=<profile dir>] $(basename "$0") [brewcode|brewdoc|brewtools|brewui|all] [--dry-run]"
            echo ""
            echo "  <plugin>   Update only that plugin; all (default) updates the four"
            echo "  --dry-run  Print the profile, resolved cache paths and planned commands; change nothing"
            echo "  Profile    \$CLAUDE_CONFIG_DIR; unset = ~/.claude (from another profile: env -u CLAUDE_CONFIG_DIR bash $(basename "$0"))"
            exit 0
            ;;
        *) err "Unknown argument '$arg'. Use: brewcode | brewdoc | brewtools | brewui | all | --dry-run | --help" ;;
    esac
done

log "=== Claude-Brewcode Plugin Suite Update (target: $TARGET) ==="
log "Profile: $CONFIG_DIR (CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<unset>}) | cache: $CACHE_ROOT"
[[ -d "$CONFIG_DIR" ]] || err "Profile dir not found: $CONFIG_DIR (a mistyped CLAUDE_CONFIG_DIR would create a new empty profile)"
log ""

# --- Read versions ---
BREWCODE_JSON="$REPO_ROOT/brewcode/.claude-plugin/plugin.json"
BREWDOC_JSON="$REPO_ROOT/brewdoc/.claude-plugin/plugin.json"
BREWTOOLS_JSON="$REPO_ROOT/brewtools/.claude-plugin/plugin.json"
BREWUI_JSON="$REPO_ROOT/brewui/.claude-plugin/plugin.json"
MARKETPLACE_JSON="$REPO_ROOT/.claude-plugin/marketplace.json"

[[ -f "$MARKETPLACE_JSON" ]] || err "Not found: $MARKETPLACE_JSON"

# Validate and read versions only for target plugin(s)
if [[ "$TARGET" == "brewcode" || "$TARGET" == "all" ]]; then
    [[ -f "$BREWCODE_JSON" ]] || err "Not found: $BREWCODE_JSON"
    BREWCODE_VER=$(jq -r '.version' "$BREWCODE_JSON")
    MARKET_BREWCODE_VER=$(jq -r '.plugins[0].version' "$MARKETPLACE_JSON")
fi

if [[ "$TARGET" == "brewdoc" || "$TARGET" == "all" ]]; then
    [[ -f "$BREWDOC_JSON" ]] || err "Not found: $BREWDOC_JSON"
    BREWDOC_VER=$(jq -r '.version' "$BREWDOC_JSON")
    MARKET_BREWDOC_VER=$(jq -r '.plugins[1].version' "$MARKETPLACE_JSON")
fi

if [[ "$TARGET" == "brewtools" || "$TARGET" == "all" ]]; then
    [[ -f "$BREWTOOLS_JSON" ]] || err "Not found: $BREWTOOLS_JSON"
    BREWTOOLS_VER=$(jq -r '.version' "$BREWTOOLS_JSON")
    MARKET_BREWTOOLS_VER=$(jq -r '.plugins[2].version' "$MARKETPLACE_JSON")
fi

if [[ "$TARGET" == "brewui" || "$TARGET" == "all" ]]; then
    [[ -f "$BREWUI_JSON" ]] || err "Not found: $BREWUI_JSON"
    BREWUI_VER=$(jq -r '.version' "$BREWUI_JSON")
    MARKET_BREWUI_VER=$(jq -r '.plugins[3].version' "$MARKETPLACE_JSON")
fi

# --- Version check table ---
log "| Plugin | plugin.json | marketplace.json | Match |"
log "|--------|-------------|-----------------|-------|"

if [[ "$TARGET" == "brewcode" || "$TARGET" == "all" ]]; then
    BREWCODE_MATCH=$([[ "$BREWCODE_VER" == "$MARKET_BREWCODE_VER" ]] && echo OK || echo MISMATCH)
    log "| brewcode | $BREWCODE_VER | $MARKET_BREWCODE_VER | $BREWCODE_MATCH |"
fi

if [[ "$TARGET" == "brewdoc" || "$TARGET" == "all" ]]; then
    BREWDOC_MATCH=$([[ "$BREWDOC_VER" == "$MARKET_BREWDOC_VER" ]] && echo OK || echo MISMATCH)
    log "| brewdoc  | $BREWDOC_VER  | $MARKET_BREWDOC_VER  | $BREWDOC_MATCH |"
fi

if [[ "$TARGET" == "brewtools" || "$TARGET" == "all" ]]; then
    BREWTOOLS_MATCH=$([[ "$BREWTOOLS_VER" == "$MARKET_BREWTOOLS_VER" ]] && echo OK || echo MISMATCH)
    log "| brewtools | $BREWTOOLS_VER | $MARKET_BREWTOOLS_VER | $BREWTOOLS_MATCH |"
fi

if [[ "$TARGET" == "brewui" || "$TARGET" == "all" ]]; then
    BREWUI_MATCH=$([[ "$BREWUI_VER" == "$MARKET_BREWUI_VER" ]] && echo OK || echo MISMATCH)
    log "| brewui    | $BREWUI_VER | $MARKET_BREWUI_VER | $BREWUI_MATCH |"
fi

log ""

# --- Version mismatch check ---
if [[ "$TARGET" == "brewcode" || "$TARGET" == "all" ]]; then
    [[ "$BREWCODE_VER" == "$MARKET_BREWCODE_VER" ]] || err "brewcode version mismatch! plugin.json=$BREWCODE_VER marketplace.json=$MARKET_BREWCODE_VER"
fi

if [[ "$TARGET" == "brewdoc" || "$TARGET" == "all" ]]; then
    [[ "$BREWDOC_VER" == "$MARKET_BREWDOC_VER" ]] || err "brewdoc version mismatch! plugin.json=$BREWDOC_VER marketplace.json=$MARKET_BREWDOC_VER"
fi

if [[ "$TARGET" == "brewtools" || "$TARGET" == "all" ]]; then
    [[ "$BREWTOOLS_VER" == "$MARKET_BREWTOOLS_VER" ]] || err "brewtools version mismatch! plugin.json=$BREWTOOLS_VER marketplace.json=$MARKET_BREWTOOLS_VER"
fi

if [[ "$TARGET" == "brewui" || "$TARGET" == "all" ]]; then
    [[ "$BREWUI_VER" == "$MARKET_BREWUI_VER" ]] || err "brewui version mismatch! plugin.json=$BREWUI_VER marketplace.json=$MARKET_BREWUI_VER"
fi

if [[ "$TARGET" == "all" ]]; then
    for OTHER_VER in "$BREWDOC_VER" "$BREWTOOLS_VER" "$BREWUI_VER"; do
        [[ "$OTHER_VER" == "$BREWCODE_VER" ]] || err "Version mismatch across plugins! brewcode=$BREWCODE_VER brewdoc=$BREWDOC_VER brewtools=$BREWTOOLS_VER brewui=$BREWUI_VER (must be identical)"
    done
    log "Cross-plugin version: OK ($BREWCODE_VER)"
    log ""
fi

if [[ "$TARGET" == "all" ]]; then TARGETS="brewcode brewdoc brewtools brewui"; else TARGETS="$TARGET"; fi

# Allow nested session (CLAUDECODE blocks recursive launches since v0.2.47)
unset CLAUDECODE

# Project/local rows of the target suite plugins as "id<TAB>scope<TAB>projectPath"; list failure -> warn, no rows.
project_rows() {
    local list
    if ! list=$(claude plugin list --json 2>&1); then
        log "   WARN: claude plugin list --json failed; project-scope installs not checked: $list"
        return 0
    fi
    printf '%s' "$list" | jq -r --arg names "$TARGETS" '($names | split(" ") | map(. + "@claude-brewcode")) as $ids
        | .[]? | select((.scope == "project" or .scope == "local") and (.id as $i | $ids | index($i)))
        | [.id, .scope, (.projectPath // "")] | @tsv' 2>/dev/null \
        || log "   WARN: claude plugin list --json is not a JSON array; project-scope installs not checked"
}

# --- Dry run: resolved paths + planned commands, nothing changed ---
if [[ $DRY_RUN == true ]]; then
    log "DRY RUN - nothing is changed. Planned (CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<unset>}):"
    log "  claude plugin marketplace update claude-brewcode"
    for NAME in $TARGETS; do
        VER_VAR="$(printf '%s' "$NAME" | tr '[:lower:]' '[:upper:]')_VER"
        if [[ -d "$CACHE_ROOT/$NAME/${!VER_VAR}" ]]; then ACTION="update"; else ACTION="uninstall + install"; fi
        log "  claude plugin $ACTION ${NAME}@claude-brewcode -> $CACHE_ROOT/$NAME/${!VER_VAR}"
    done
    while IFS=$'\t' read -r ID SCOPE PROJECT; do
        [[ -n "$ID" ]] || continue
        if [[ -n "$PROJECT" && -d "$PROJECT" ]]; then
            log "  (cd $PROJECT && claude plugin update $ID --scope $SCOPE)"
        else
            log "  orphan $SCOPE install: $ID at ${PROJECT:-<no projectPath>} (dir gone) -> skipped"
        fi
    done < <(project_rows)
    log ""
    bash "$SCRIPT_DIR/clean-plugin-cache.sh" --dry-run 2>&1 | tee -a "$LOG"
    exit 0
fi

# --- Step 1: Update marketplace index (always — shared across plugins) ---
log "1. Updating marketplace index..."
if OUTPUT=$(claude plugin marketplace update claude-brewcode 2>&1); then
    log "   OK"
else
    err "marketplace update failed (exit $?): ${OUTPUT:-no output}"
fi
[[ -n "${OUTPUT:-}" ]] && log "   $OUTPUT"
log ""

# --- Install helper ---
install_plugin() {
    local NAME="$1"
    local VERSION="$2"
    local CACHE_DIR="$CACHE_ROOT/$NAME"
    local EXPECTED_DIR="$CACHE_DIR/$VERSION"

    if [[ ! -d "$EXPECTED_DIR" ]]; then
        log "${NAME}: Cache missing — uninstalling first..."
        OUTPUT=$(claude plugin uninstall "$NAME" 2>&1) || true
        [[ -n "${OUTPUT:-}" ]] && log "   $OUTPUT"
        log "${NAME}: Installing v$VERSION..."
        if OUTPUT=$(claude plugin install "${NAME}@claude-brewcode" 2>&1); then
            log "   OK"
        else
            err "${NAME} install failed (exit $?): ${OUTPUT:-no output}"
        fi
    else
        log "${NAME}: Updating to v$VERSION..."
        if OUTPUT=$(claude plugin update "${NAME}@claude-brewcode" 2>&1); then
            log "   OK"
        else
            err "${NAME} update failed (exit $?): ${OUTPUT:-no output}"
        fi
    fi
    [[ -n "${OUTPUT:-}" ]] && log "   $OUTPUT"

    if [[ -d "$EXPECTED_DIR" ]]; then
        FILE_COUNT=$(find "$EXPECTED_DIR" -type f | wc -l | tr -d ' ')
        log "${NAME}: Cache OK — $EXPECTED_DIR ($FILE_COUNT files)"
        [[ "$FILE_COUNT" -gt 0 ]] || err "${NAME}: Cache dir exists but is empty!"
    else
        log "${NAME}: Expected dir NOT found: $EXPECTED_DIR"
        log "   Available: $(find "$CACHE_DIR" -mindepth 1 -maxdepth 1 -exec basename {} \; 2>/dev/null | sort -V | tr '\n' ' ')"
        err "${NAME} v$VERSION not found in cache after install"
    fi
}

# --- Step 2+3: Install target plugin(s) ---
STEP=2
BC_FILES=0
BD_FILES=0
BT_FILES=0

if [[ "$TARGET" == "brewcode" || "$TARGET" == "all" ]]; then
    log "$STEP. Installing brewcode..."
    install_plugin "brewcode" "$BREWCODE_VER"
    BC_FILES=$(find "$CACHE_ROOT/brewcode/$BREWCODE_VER" -type f 2>/dev/null | wc -l | tr -d ' ')
    log ""
    STEP=$((STEP + 1))
fi

if [[ "$TARGET" == "brewdoc" || "$TARGET" == "all" ]]; then
    log "$STEP. Installing brewdoc..."
    install_plugin "brewdoc" "$BREWDOC_VER"
    BD_FILES=$(find "$CACHE_ROOT/brewdoc/$BREWDOC_VER" -type f 2>/dev/null | wc -l | tr -d ' ')
    log ""
    STEP=$((STEP + 1))
fi

if [[ "$TARGET" == "brewtools" || "$TARGET" == "all" ]]; then
    log "$STEP. Installing brewtools..."
    install_plugin "brewtools" "$BREWTOOLS_VER"
    BT_FILES=$(find "$CACHE_ROOT/brewtools/$BREWTOOLS_VER" -type f 2>/dev/null | wc -l | tr -d ' ')
    log ""
    STEP=$((STEP + 1))
fi

BU_FILES=0

if [[ "$TARGET" == "brewui" || "$TARGET" == "all" ]]; then
    log "$STEP. Installing brewui..."
    install_plugin "brewui" "$BREWUI_VER"
    BU_FILES=$(find "$CACHE_ROOT/brewui/$BREWUI_VER" -type f 2>/dev/null | wc -l | tr -d ' ')
    log ""
    STEP=$((STEP + 1))
fi

# --- Project/local scope: resolved from the cwd, so each row updates from its own projectPath ---
log "$STEP. Updating project-scope installs..."
PROJECT_FAILED=0
PROJECT_ROWS=0
while IFS=$'\t' read -r ID SCOPE PROJECT; do
    [[ -n "$ID" ]] || continue
    PROJECT_ROWS=$((PROJECT_ROWS + 1))
    if [[ -z "$PROJECT" || ! -d "$PROJECT" ]]; then
        log "   WARN: orphan $SCOPE install: $ID at ${PROJECT:-<no projectPath>} (dir gone); remove: mkdir -p ${PROJECT:-<dir>} && cd ${PROJECT:-<dir>} && claude plugin uninstall $ID --scope $SCOPE"
        continue
    fi
    log "   $ID ($SCOPE $PROJECT): updating..."
    if OUTPUT=$(cd "$PROJECT" && claude plugin update "$ID" --scope "$SCOPE" 2>&1); then
        log "   OK"
    else
        PROJECT_FAILED=$((PROJECT_FAILED + 1))
        log "   FAILED (exit $?): ${OUTPUT:-no output}"
    fi
    [[ -n "${OUTPUT:-}" ]] && log "   $OUTPUT"
done < <(project_rows)
[[ $PROJECT_ROWS -gt 0 ]] || log "   none"
log ""
STEP=$((STEP + 1))

# --- Clean old versions (after every scope moved off them) ---
log "$STEP. Cleaning old versions..."
bash "$SCRIPT_DIR/clean-plugin-cache.sh" 2>&1 | tee -a "$LOG"
log ""

# --- Summary ---
log "=== Update Complete ==="
log ""
log "| Plugin | Version | Cache Files |"
log "|--------|---------|-------------|"

if [[ "$TARGET" == "brewcode" || "$TARGET" == "all" ]]; then
    log "| brewcode | $BREWCODE_VER | ${BC_FILES:-?} |"
fi

if [[ "$TARGET" == "brewdoc" || "$TARGET" == "all" ]]; then
    log "| brewdoc  | $BREWDOC_VER  | ${BD_FILES:-?}  |"
fi

if [[ "$TARGET" == "brewtools" || "$TARGET" == "all" ]]; then
    log "| brewtools | $BREWTOOLS_VER | ${BT_FILES:-?} |"
fi

if [[ "$TARGET" == "brewui" || "$TARGET" == "all" ]]; then
    log "| brewui    | $BREWUI_VER | ${BU_FILES:-?} |"
fi

log ""
log ">>> Restart Claude Code to apply changes <<<"
log ""
log "Log: $LOG"
[[ $PROJECT_FAILED -eq 0 ]] || err "$PROJECT_FAILED project-scope update(s) failed; the old version stays pinned (see Keep (installed, ...) lines above)"
