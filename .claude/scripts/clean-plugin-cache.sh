#!/bin/bash
# clean-plugin-cache.sh [--dry-run] [--all]: keep latest cached version per plugin + every installed one; --all drops keep-latest. Bad arg -> rc 2.
# Profile = $CLAUDE_CONFIG_DIR (unset = ~/.claude): `CLAUDE_CONFIG_DIR=~/.claude-a bash clean-plugin-cache.sh --dry-run`

set -Eeuo pipefail
on_err() { trap - ERR; echo "" >&2; echo "ERROR in clean-plugin-cache.sh at line $2 (exit $1)" >&2; }
trap 'on_err $? $LINENO' ERR

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGINS_ROOT="${CLAUDE_CODE_PLUGIN_CACHE_DIR:-$CONFIG_DIR/plugins}"
CACHE_ROOT="$PLUGINS_ROOT/cache/claude-brewcode"
DRY_RUN=false
CLEAN_ALL=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --all)     CLEAN_ALL=true ;;
        *) echo "Unknown argument: $arg (usage: clean-plugin-cache.sh [--dry-run] [--all])" >&2; exit 2 ;;
    esac
done

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
    while IFS=$'\t' read -r p id scope project; do
        [[ -d "$p" ]] && INSTALLED+=("$(cd "$p" && pwd -P)"$'\t'"$profile"$'\t'"$id"$'\t'"$scope"$'\t'"$project")
    done < <(jq -r '.plugins // {} | to_entries[] | .key as $id | .value[]? | [.installPath // "", $id, .scope // "user", .projectPath // ""] | @tsv' "$f" 2>/dev/null || true)
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

if [[ $DRY_RUN == true ]]; then
    echo "DRY RUN MODE - no files will be deleted"
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

    # All non-hidden entries, version-sorted (same set `ls -1` listed)
    VERSIONS=()
    while IFS= read -r VERSION; do
        VERSIONS+=("$VERSION")
    done < <(find "$CACHE_DIR" -mindepth 1 -maxdepth 1 ! -name '.*' -exec basename {} \; | sort -V)
    TOTAL=${#VERSIONS[@]}

    if [[ $TOTAL -eq 0 ]]; then
        echo "No versions found in $CACHE_DIR"
        return 0
    fi

    # Latest version is the last one
    LATEST="${VERSIONS[$TOTAL-1]}"

    if [[ $CLEAN_ALL == false && $TOTAL -le 1 ]]; then
        echo "Only $TOTAL version(s) found for $PLUGIN_NAME, nothing to clean"
        echo ""
        return 0
    fi

    echo "Found $TOTAL versions"
    echo "Latest: $LATEST"
    echo ""

    # Calculate size to free
    local SIZE_TO_FREE=0
    local VERSIONS_TO_DELETE=()

    for VERSION in "${VERSIONS[@]}"; do
        if is_installed "$CACHE_DIR/$VERSION" && [[ "$VERSION" != "$LATEST" ]]; then
            print_pins "$CACHE_DIR/$VERSION" "$VERSION"
        elif is_installed "$CACHE_DIR/$VERSION"; then
            echo "Keep (installed): $VERSION"
        elif [[ $CLEAN_ALL == false && "$VERSION" == "$LATEST" ]]; then
            echo "Keep (latest): $VERSION"
        else
            VERSIONS_TO_DELETE+=("$VERSION")
            DIR_SIZE=$(du -sk "$CACHE_DIR/$VERSION" 2>/dev/null | cut -f1 || true)
            SIZE_TO_FREE=$((SIZE_TO_FREE + ${DIR_SIZE:-0}))
        fi
    done

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
                echo "  Removing $VERSION..."
                rm -rf "${CACHE_DIR:?}/${VERSION:?}"
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
