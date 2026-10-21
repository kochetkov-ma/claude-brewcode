#!/bin/bash
# clean-plugin-cache.sh [--dry-run] [--all]: keep latest + installed per plugin; others get .orphaned_at, deleted after the grace unless in use; --all drops keep-latest. Bad arg -> rc 2.
# Profile = $CLAUDE_CONFIG_DIR (unset = ~/.claude), grace days = $BREWCODE_CACHE_GRACE_DAYS (DEF 14): `CLAUDE_CONFIG_DIR=~/.claude-a bash clean-plugin-cache.sh --dry-run`

set -Eeuo pipefail
on_err() { trap - ERR; echo "" >&2; echo "ERROR in clean-plugin-cache.sh at line $2 (exit $1)" >&2; }
trap 'on_err $? $LINENO' ERR

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGINS_ROOT="${CLAUDE_CODE_PLUGIN_CACHE_DIR:-$CONFIG_DIR/plugins}"
CACHE_ROOT="$PLUGINS_ROOT/cache/claude-brewcode"
DRY_RUN=false
CLEAN_ALL=false
MARKER=".orphaned_at"
# Only these dir names are versions; CC's `<ver>.linking-<pid>` temp dirs and other names are never touched.
VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
# DEF 14 days = CC 2.1.300 orphan sweep grace (`1209600000` ms, keyed on the marker mtime).
GRACE_DAYS="${BREWCODE_CACHE_GRACE_DAYS:-14}"
GRACE_ROWS=()

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --all)     CLEAN_ALL=true ;;
        -h|--help) sed -n '2,3p' "$0" | sed 's/^# //'; exit 0 ;;
        *) echo "Unknown argument: $arg (usage: clean-plugin-cache.sh [--dry-run] [--all] [--help])" >&2; exit 2 ;;
    esac
done

[[ "$GRACE_DAYS" =~ ^[0-9]{1,4}$ ]] || { echo "BREWCODE_CACHE_GRACE_DAYS must be whole days 0-9999, got: $GRACE_DAYS" >&2; exit 2; }
GRACE_MS=$(( 10#$GRACE_DAYS * 86400000 ))
NOW_MS=$(( $(date +%s) * 1000 ))

command -v jq >/dev/null 2>&1 || { echo "jq is required (reads installed_plugins.json scope/projectPath)" >&2; exit 2; }

# Install rows of every profile: physical installPath, profile dir, id, scope, projectPath (TAB-separated)
INSTALLED=()
SEEN_FILES=" "
for f in "$PLUGINS_ROOT/installed_plugins.json" "$CONFIG_DIR/plugins/installed_plugins.json" "$HOME"/.claude*/plugins/installed_plugins.json; do
    [[ -f "$f" ]] || continue
    real_f="$(cd "$(dirname "$f")" && pwd -P)/installed_plugins.json"
    [[ "$SEEN_FILES" == *" $real_f "* ]] && continue
    SEEN_FILES+="$real_f "
    if [[ "$f" == "$HOME"/.claude*/plugins/installed_plugins.json ]]; then profile="$(dirname "$(dirname "$f")")"; else profile="$CONFIG_DIR"; fi
    # A broken install list (empty, truncated, multi-doc, non-object) turns installed versions into orphans: stop before any change.
    bad_list="Cannot read $f as one JSON object with a plugins map: fix or remove it; nothing was marked or deleted"
    one=$(trap - ERR; jq -s 'length == 1 and (.[0] | type == "object" and ((.plugins // {}) | type == "object"))' "$f" 2>/dev/null) || one=false
    [[ "$one" == true ]] || { echo "$bad_list" >&2; exit 2; }
    rows=$(trap - ERR; jq -r '.plugins // {} | to_entries[] | .key as $id | .value[]? | [.installPath // "", $id, .scope // "user", .projectPath // ""] | @tsv' "$f" 2>/dev/null) \
        || { echo "$bad_list" >&2; exit 2; }
    while IFS=$'\t' read -r p id scope project; do
        if [[ -n "$p" && -d "$p" ]]; then INSTALLED+=("$(cd "$p" && pwd -P)"$'\t'"$profile"$'\t'"$id"$'\t'"$scope"$'\t'"$project"); fi
    done <<< "$rows"
done

is_installed() {
    local real i
    real=$(cd "$1" && pwd -P)
    for i in "${INSTALLED[@]+"${INSTALLED[@]}"}"; do
        [[ "${i%%$'\t'*}" == "$real" ]] && return 0
    done
    return 1
}

# Exact update (or orphan-uninstall) command for one install row; ~/.claude needs CLAUDE_CONFIG_DIR unset.
row_command() {
    local profile="$1" id="$2" scope="$3" project="$4" envp
    if [[ "$profile" == "$HOME/.claude" ]]; then envp="env -u CLAUDE_CONFIG_DIR"; else envp="CLAUDE_CONFIG_DIR=$(printf '%q' "$profile")"; fi
    if [[ "$scope" == "project" || "$scope" == "local" ]]; then
        if [[ -n "$project" && -d "$project" ]]; then
            printf 'cd %q && %s claude plugin update %q --scope %s' "$project" "$envp" "$id" "$scope"
        else
            printf 'orphan (project dir missing) -> mkdir -p %q && cd %q && %s claude plugin uninstall %q --scope %s' "$project" "$project" "$envp" "$id" "$scope"
        fi
    else
        printf '%s claude plugin update %q --scope %s' "$envp" "$id" "$scope"
    fi
}

# A kept non-latest version: one line per pinning row, naming scope, projectPath and the command.
print_pins() {
    local dir="$1" version="$2" real i rest profile id scope project where
    real=$(cd "$dir" && pwd -P)
    for i in "${INSTALLED[@]+"${INSTALLED[@]}"}"; do
        [[ "${i%%$'\t'*}" == "$real" ]] || continue
        rest="${i#*$'\t'}"
        IFS=$'\t' read -r profile id scope project <<< "$rest"
        where="$scope${project:+ $project}"
        echo "Keep (installed, $where): $version -> $(row_command "$profile" "$id" "$scope" "$project")"
    done
}

# Duration in ms -> "<days>d <hours>h", rounded down.
fmt_age() { local h=$(( $1 / 3600000 )); echo "$(( h / 24 ))d $(( h % 24 ))h"; }

# Path guard before rm: $1 is a direct child of $CACHE_ROOT, $2 a version-named real dir inside it (no symlink).
is_version_dir() {
    [[ "$1" == "$CACHE_ROOT"/* && "${1#"$CACHE_ROOT"/}" != */* && "$2" =~ $VERSION_RE && -d "$1/$2" && ! -L "$1/$2" ]]
}

# CC's live-session pins: every <version>/.in_use/<pid> entry (hidden too); a non-pid name or unlistable dir counts as live.
live_pins() {
    local name rc out=""
    if [[ -d "$1/.in_use" && ! ( -r "$1/.in_use" && -x "$1/.in_use" ) ]]; then echo "unlistable .in_use"; return 0; fi
    while IFS= read -r name; do
        if [[ ! "$name" =~ ^[0-9]+$ ]]; then out+=", entry $name (no pid)"; continue; fi
        # ps rc 1 = no such process; any other failure cannot prove the session gone.
        rc=0; ps -p "$name" >/dev/null 2>&1 || rc=$?
        if [[ $rc -eq 0 ]]; then out+=", pid $name"; elif [[ $rc -ne 1 ]]; then out+=", pid $name (ps rc $rc)"; fi
    done < <(find "$1/.in_use" -mindepth 1 -maxdepth 1 -exec basename {} \; 2>/dev/null || true)
    echo "${out#, }"
}

# Installed again: drop a stale marker (CC does too), so the next orphaning starts a fresh grace.
unmark_installed() {
    [[ -e "$1/$2/$MARKER" || -L "$1/$2/$MARKER" ]] || return 0
    if [[ $DRY_RUN == true ]]; then echo "Would unmark (installed, stale $MARKER): $2"; return 0; fi
    if rm -f -- "$1/$2/$MARKER" 2>/dev/null; then echo "Unmark (installed, stale $MARKER removed): $2"
    else echo "Warning: could not remove stale $MARKER from installed $2"; fi
}

# Orphan = neither installed nor kept-latest: mark on first sight; kept ones go to GRACE_ROWS, the rest to the caller's VERSIONS_TO_DELETE.
# Age = younger of marker content and mtime (CC keys on mtime); non-13-digit or future content re-marks, old content (even 0) stays as is.
decide_orphan() {
    local plugin="$1" v="$3" m="$2/$3/$MARKER" raw="" mt="" age mt_age why="" act="mark" left pins
    if [[ -f "$m" && ! -L "$m" ]]; then raw=$(cat -- "$m" 2>/dev/null || true); mt=$(date -r "$m" +%s 2>/dev/null || true); fi
    if [[ -L "$m" || ( -e "$m" && ! -f "$m" ) ]]; then
        why="$MARKER is not a regular file"; left="once a marker can be written"
    elif [[ ! "$raw" =~ ^[0-9]{13}$ || ! "$mt" =~ ^[0-9]{1,12}$ ]] || (( 10#$raw > NOW_MS + 60000 || 10#$mt * 1000 > NOW_MS + 60000 )); then
        why="new orphan"; left="in $(fmt_age "$GRACE_MS")"
        if [[ -e "$m" ]]; then why="bad $MARKER"; act="re-mark"; fi
        if [[ $DRY_RUN == true ]]; then why+=", would $act now"
        elif { printf '%s' "$NOW_MS" > "$m"; } 2>/dev/null; then why+=", ${act}ed now"
        else why+=", marker not writable"; left="once a marker can be written"; fi
    fi
    if [[ -n "$why" ]]; then GRACE_ROWS+=("| $plugin | $v | $why | $left |"); return 0; fi
    age=$(( NOW_MS - 10#$raw )); mt_age=$(( NOW_MS - 10#$mt * 1000 ))
    if (( mt_age < age )); then age=$mt_age; fi
    if (( age < 0 )); then age=0; fi
    if (( age <= GRACE_MS )); then
        GRACE_ROWS+=("| $plugin | $v | orphaned $(fmt_age "$age") ago | in $(fmt_age $(( GRACE_MS - age ))) |")
        return 0
    fi
    pins=$(live_pins "$2/$v")
    if [[ -n "$pins" ]]; then
        GRACE_ROWS+=("| $plugin | $v | in use: $pins; orphaned $(fmt_age "$age") ago | once no live session pins it |")
        return 0
    fi
    if [[ $DRY_RUN == true ]]; then why="Would delete"; else why="Delete"; fi
    echo "$why (orphaned $(fmt_age "$age") ago > ${GRACE_DAYS}d grace): $v"
    VERSIONS_TO_DELETE+=("$v")
}

if [[ $DRY_RUN == true ]]; then
    echo "DRY RUN MODE - no files will be written or deleted"
    echo ""
fi

# --- Clean a single plugin cache directory ---
# Usage: clean_plugin_dir <cache_dir>
clean_plugin_dir() {
    local CACHE_DIR="$1"
    local PLUGIN_NAME
    PLUGIN_NAME=$(basename "$CACHE_DIR")

    if [[ ! -d "$CACHE_DIR" ]]; then
        echo "Cache directory not found: $CACHE_DIR (OK - nothing to clean)"
        return 0
    fi

    echo "=== $PLUGIN_NAME Cache Cleanup ==="
    echo "Cache: $CACHE_DIR"
    echo ""

    # Real non-hidden dirs with a version name (symlinks, files and temp dirs never count), version-sorted
    VERSIONS=()
    while IFS= read -r VERSION; do
        if [[ "$VERSION" =~ $VERSION_RE ]]; then VERSIONS+=("$VERSION"); else echo "Skip (not a version name): $VERSION"; fi
    done < <(find "$CACHE_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -exec basename {} \; | sort -V)
    TOTAL=${#VERSIONS[@]}

    if [[ $TOTAL -eq 0 ]]; then
        echo "No versions found in $CACHE_DIR"
        return 0
    fi

    # Latest version is the last one
    LATEST="${VERSIONS[$TOTAL-1]}"

    echo "Found $TOTAL versions"
    echo "Latest: $LATEST"
    echo ""

    local SIZE_TO_FREE=0 PINS GRACE_BEFORE=${#GRACE_ROWS[@]}
    local VERSIONS_TO_DELETE=()

    for VERSION in "${VERSIONS[@]}"; do
        if is_installed "$CACHE_DIR/$VERSION"; then
            if [[ "$VERSION" == "$LATEST" ]]; then echo "Keep (installed): $VERSION"; else print_pins "$CACHE_DIR/$VERSION" "$VERSION"; fi
            unmark_installed "$CACHE_DIR" "$VERSION"
        elif [[ $CLEAN_ALL == false && "$VERSION" == "$LATEST" ]]; then
            echo "Keep (latest): $VERSION"
        else
            decide_orphan "$PLUGIN_NAME" "$CACHE_DIR" "$VERSION"
        fi
    done

    for VERSION in "${VERSIONS_TO_DELETE[@]+"${VERSIONS_TO_DELETE[@]}"}"; do
        DIR_SIZE=$(du -sk "$CACHE_DIR/$VERSION" 2>/dev/null | cut -f1 || true)
        SIZE_TO_FREE=$((SIZE_TO_FREE + ${DIR_SIZE:-0}))
    done

    echo "Kept by grace: $(( ${#GRACE_ROWS[@]} - GRACE_BEFORE )) (listed at the end)"
    echo "Versions to delete: ${#VERSIONS_TO_DELETE[@]}"
    echo "Space to free: $((SIZE_TO_FREE / 1024)) MB"
    echo ""

    if [[ $DRY_RUN == true ]]; then
        if [[ ${#VERSIONS_TO_DELETE[@]} -gt 0 ]]; then
            echo "Would delete versions:"
            for VERSION in "${VERSIONS_TO_DELETE[@]}"; do
                echo "  - $VERSION"
            done
            echo ""
        fi
    else
        if [[ ${#VERSIONS_TO_DELETE[@]} -gt 0 ]]; then
            echo "Deleting old versions..."
            for VERSION in "${VERSIONS_TO_DELETE[@]}"; do
                is_version_dir "$CACHE_DIR" "$VERSION" || { echo "  Skip $VERSION: no longer a plain version dir"; continue; }
                PINS=$(live_pins "$CACHE_DIR/$VERSION")
                [[ -z "$PINS" ]] || { echo "  Skip $VERSION: a session pinned it meanwhile ($PINS)"; continue; }
                echo "  Removing $VERSION..."
                rm -rf -- "${CACHE_DIR:?}/${VERSION:?}"
            done
        fi

        echo ""
        echo "$PLUGIN_NAME cleanup complete"
    fi
    echo ""
}

# --- Clean all plugins ---
clean_plugin_dir "$CACHE_ROOT/brewcode"
clean_plugin_dir "$CACHE_ROOT/brewdoc"
clean_plugin_dir "$CACHE_ROOT/brewtools"
clean_plugin_dir "$CACHE_ROOT/brewui"
clean_plugin_dir "$CACHE_ROOT/brewmod-placeholders"
clean_plugin_dir "$CACHE_ROOT/brewmod-plan-effort"
clean_plugin_dir "$CACHE_ROOT/brewmod-reminders"

# --- Versions a running session may still use ---
echo "=== Kept by grace (${GRACE_DAYS}d, BREWCODE_CACHE_GRACE_DAYS) ==="
if [[ ${#GRACE_ROWS[@]} -eq 0 ]]; then
    echo "none"
else
    echo "| Plugin | Version | Why kept | Deletable |"
    echo "|--------|---------|----------|-----------|"
    printf '%s\n' "${GRACE_ROWS[@]}"
fi
echo ""

# --- Symlink cleanup (shared across all plugins) ---
SKILLS_DIR="$CONFIG_DIR/skills"
SYMLINKS_TO_DELETE=()

if [[ -d "$SKILLS_DIR" ]]; then
    while IFS= read -r link; do
        [[ -z "$link" ]] && continue
        target=$(readlink "$link" 2>/dev/null || true)
        if [[ "$target" == *"/plugins/cache/claude-brewcode/"* ]]; then
            SYMLINKS_TO_DELETE+=("$link")
        fi
    done < <(find "$SKILLS_DIR" -maxdepth 1 -type l 2>/dev/null)
fi

if [[ ${#SYMLINKS_TO_DELETE[@]} -gt 0 ]]; then
    echo "=== Symlink Cleanup ==="
    echo "Symlinks to delete: ${#SYMLINKS_TO_DELETE[@]}"
    echo ""

    if [[ $DRY_RUN == true ]]; then
        echo "Would delete symlinks:"
        for LINK in "${SYMLINKS_TO_DELETE[@]}"; do
            echo "  - $(basename "$LINK")"
        done
        echo ""
        echo "Run without --dry-run to actually delete"
    else
        echo "Deleting plugin symlinks..."
        for LINK in "${SYMLINKS_TO_DELETE[@]}"; do
            echo "  Removing $(basename "$LINK")..."
            rm -f "$LINK"
        done
        echo "Symlinks removed: ${#SYMLINKS_TO_DELETE[@]}"
    fi
    echo ""
fi
