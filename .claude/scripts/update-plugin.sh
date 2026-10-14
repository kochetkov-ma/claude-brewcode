#!/bin/bash
# update-plugin.sh [brewcode|brewdoc|brewtools|brewui|brewmod-plan-effort|brewmod-placeholders|all] [--dry-run|--help]: marketplace -> user-scope install/update -> project/local-scope updates (from each projectPath) -> prune old cache.
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
PLUGINS="brewcode brewdoc brewtools brewui brewmod-plan-effort brewmod-placeholders"
PLUGIN_ALT="${PLUGINS// /|}"
TARGET="all"
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --help|-h)
            echo "Usage: [CLAUDE_CONFIG_DIR=<profile dir>] $(basename "$0") [$PLUGIN_ALT|all] [--dry-run]"
            echo ""
            echo "  <plugin>   Update only that plugin; all (default) updates the six, skipping any not installed at user scope"
            echo "  --dry-run  Print the profile, resolved cache paths and planned commands; change nothing"
            echo "  Profile    \$CLAUDE_CONFIG_DIR; unset = ~/.claude (from another profile: env -u CLAUDE_CONFIG_DIR bash $(basename "$0"))"
            exit 0
            ;;
        all) TARGET="all" ;;
        *)
            if [[ " $PLUGINS " == *" $arg "* ]]; then TARGET="$arg"
            else err "Unknown argument '$arg'. Use: ${PLUGINS// / | } | all | --dry-run | --help"; fi
            ;;
    esac
done

if [[ "$TARGET" == "all" ]]; then TARGETS="$PLUGINS"; else TARGETS="$TARGET"; fi
# brewmod-plan-effort -> BREWMOD_PLAN_EFFORT (stem of the per-plugin shell variables)
var_key() { printf '%s' "$1" | tr '[:lower:]-' '[:upper:]_'; }

log "=== Claude-Brewcode Plugin Suite Update (target: $TARGET) ==="
log "Profile: $CONFIG_DIR (CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<unset>}) | cache: $CACHE_ROOT"
[[ -d "$CONFIG_DIR" ]] || err "Profile dir not found: $CONFIG_DIR (a mistyped CLAUDE_CONFIG_DIR would create a new empty profile)"
log ""

# --- Read versions ---
MARKETPLACE_JSON="$REPO_ROOT/.claude-plugin/marketplace.json"
[[ -f "$MARKETPLACE_JSON" ]] || err "Not found: $MARKETPLACE_JSON"

# Sets MARKET_VER to the marketplace.json version of plugin $1, found by name (never by array index); call it unsubshelled so err exits.
market_ver() {
    MARKET_VER=$(jq -r --arg n "$1" '[.plugins[]? | select(.name == $n) | .version] | first // empty' "$MARKETPLACE_JSON") \
        || err "cannot parse $MARKETPLACE_JSON"
    [[ -n "$MARKET_VER" ]] || err "marketplace.json has no plugin entry named '$1' (or it has no version): $MARKETPLACE_JSON"
}

for NAME in $TARGETS; do
    KEY=$(var_key "$NAME")
    PLUGIN_JSON="$REPO_ROOT/$NAME/.claude-plugin/plugin.json"
    [[ -f "$PLUGIN_JSON" ]] || err "Not found: $PLUGIN_JSON"
    printf -v "${KEY}_VER" '%s' "$(jq -r '.version' "$PLUGIN_JSON")"
    market_ver "$NAME"
    printf -v "MARKET_${KEY}_VER" '%s' "$MARKET_VER"
done

# --- Version check table ---
log "| Plugin | plugin.json | marketplace.json | Match |"
log "|--------|-------------|-----------------|-------|"
for NAME in $TARGETS; do
    KEY=$(var_key "$NAME"); VV="${KEY}_VER"; MV="MARKET_${KEY}_VER"
    MATCH=$([[ "${!VV}" == "${!MV}" ]] && echo OK || echo MISMATCH)
    log "| $NAME | ${!VV} | ${!MV} | $MATCH |"
done
log ""

# --- Version mismatch check ---
for NAME in $TARGETS; do
    KEY=$(var_key "$NAME"); VV="${KEY}_VER"; MV="MARKET_${KEY}_VER"
    [[ "${!VV}" == "${!MV}" ]] || err "$NAME version mismatch! plugin.json=${!VV} marketplace.json=${!MV}"
done

if [[ "$TARGET" == "all" ]]; then
    for NAME in $TARGETS; do
        VV="$(var_key "$NAME")_VER"
        [[ "${!VV}" == "$BREWCODE_VER" ]] || err "Version mismatch across plugins! $NAME=${!VV} brewcode=$BREWCODE_VER (must be identical)"
    done
    log "Cross-plugin version: OK ($BREWCODE_VER)"
    log ""
fi

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

# all mode: user-scope ids of this profile; list failure -> "?" (state unknown, every plugin attempted).
USER_IDS="?"
load_user_ids() {
    local list
    if ! list=$(claude plugin list --json 2>&1) || ! USER_IDS=$(printf '%s' "$list" | jq -r '.[]? | select(.scope == "user") | .id' 2>/dev/null); then
        USER_IDS="?"
        log "   WARN: claude plugin list --json failed; installed state unknown, every plugin is attempted"
    fi
}

# rc 0 = all mode and NAME has no user-scope install here (single-plugin mode never skips).
not_installed() {
    [[ "$TARGET" == "all" && "$USER_IDS" != "?" ]] || return 1
    ! grep -qx "$1@claude-brewcode" <<< "$USER_IDS"
}

# --- Dry run: resolved paths + planned commands, nothing changed ---
if [[ $DRY_RUN == true ]]; then
    log "DRY RUN - nothing is changed. Planned (CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-<unset>}):"
    log "  claude plugin marketplace update claude-brewcode"
    [[ "$TARGET" != "all" ]] || load_user_ids
    for NAME in $TARGETS; do
        if not_installed "$NAME"; then log "  ${NAME}: not installed in this profile -> skipped"; continue; fi
        VER_VAR="$(var_key "$NAME")_VER"
        log "  claude plugin update ${NAME}@claude-brewcode -> $CACHE_ROOT/$NAME/${!VER_VAR} (uninstall + install only if update fails or leaves the cache missing)"
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
[[ "$TARGET" != "all" ]] || load_user_ids

# --- Install helper ---
# User-scope userConfig of plugin id $1 as key=value lines (strings raw, others JSON); none -> nothing.
saved_options() {
    jq -r --arg id "$1" '.pluginConfigs[$id].options // {} | to_entries[]
        | "\(.key)=\(if (.value | type) == "string" then .value else (.value | tojson) end)"' "$CONFIG_DIR/settings.json" 2>/dev/null || true
}

# rc 0 = plugin id $1 is explicitly disabled at user scope.
saved_disabled() {
    jq -e --arg id "$1" '.enabledPlugins[$id] == false' "$CONFIG_DIR/settings.json" >/dev/null 2>&1
}

# Fallback only: uninstall wipes userConfig and the enabled flag, so snapshot both and put them back.
reinstall_plugin() {
    local NAME="$1" VERSION="$2" ID="$1@claude-brewcode" LINE WAS_DISABLED=false
    local -a CFG=()
    while IFS= read -r LINE; do [[ -z "$LINE" ]] || CFG+=(--config "$LINE"); done < <(saved_options "$ID")
    if saved_disabled "$ID"; then WAS_DISABLED=true; fi
    log "${NAME}: Reinstalling (saved config args: $((${#CFG[@]} / 2)), disabled: $WAS_DISABLED)..."
    OUTPUT=$(claude plugin uninstall "$NAME" 2>&1) || true
    [[ -z "${OUTPUT:-}" ]] || log "   $OUTPUT"
    log "${NAME}: Installing v$VERSION..."
    if OUTPUT=$(claude plugin install "$ID" ${CFG[@]+"${CFG[@]}"} 2>&1); then
        log "   OK"
    else
        err "${NAME} install failed (exit $?): ${OUTPUT:-no output}"
    fi
    [[ -z "${OUTPUT:-}" ]] || log "   $OUTPUT"
    if [[ $WAS_DISABLED == true ]]; then
        OUTPUT=$(claude plugin disable "$ID" 2>&1) || log "   WARN: could not restore disabled state of $ID: $OUTPUT"
    fi
}

install_plugin() {
    local NAME="$1"
    local VERSION="$2"
    local CACHE_DIR="$CACHE_ROOT/$NAME"
    local EXPECTED_DIR="$CACHE_DIR/$VERSION"
    local UPDATE_RC=0

    log "${NAME}: Updating to v$VERSION..."
    if OUTPUT=$(claude plugin update "${NAME}@claude-brewcode" 2>&1); then
        log "   OK"
    else
        UPDATE_RC=$?
        log "   update failed (exit $UPDATE_RC)"
    fi
    [[ -z "${OUTPUT:-}" ]] || log "   $OUTPUT"
    # Update failed with the target cached: a real failure, not a missing-cache case.
    [[ $UPDATE_RC -eq 0 || ! -d "$EXPECTED_DIR" ]] || err "${NAME} update failed (exit $UPDATE_RC): ${OUTPUT:-no output}"

    if [[ ! -d "$EXPECTED_DIR" ]]; then
        log "${NAME}: v$VERSION not in cache after update -> reinstall fallback"
        reinstall_plugin "$NAME" "$VERSION"
    fi

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
for NAME in $TARGETS; do
    KEY=$(var_key "$NAME"); VV="${KEY}_VER"
    if not_installed "$NAME"; then
        log "$STEP. $NAME: not installed in this profile -> skipped"
        printf -v "FILES_${KEY}" '%s' "skipped (not installed)"
    else
        log "$STEP. Installing $NAME..."
        install_plugin "$NAME" "${!VV}"
        printf -v "FILES_${KEY}" '%s' "$(find "$CACHE_ROOT/$NAME/${!VV}" -type f 2>/dev/null | wc -l | tr -d ' ')"
    fi
    log ""
    STEP=$((STEP + 1))
done

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
for NAME in $TARGETS; do
    KEY=$(var_key "$NAME"); VV="${KEY}_VER"; FV="FILES_${KEY}"
    log "| $NAME | ${!VV} | ${!FV:-?} |"
done

log ""
log ">>> Restart Claude Code to apply changes <<<"
log ""
log "Log: $LOG"
[[ $PROJECT_FAILED -eq 0 ]] || err "$PROJECT_FAILED project-scope update(s) failed; the old version stays pinned (see Keep (installed, ...) lines above)"
