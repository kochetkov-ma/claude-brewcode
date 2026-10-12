#!/bin/bash
# list-skills.sh (no args) - list all Claude Code skills as a Markdown table: scope, name, description, invocation.
set -euo pipefail

# --- Configuration ---
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
GLOBAL_SKILLS="$CONFIG_DIR/skills"
PROJECT_SKILLS="${CLAUDE_PROJECT_DIR:-.}/.claude/skills"
# Plugins root: CLAUDE_CODE_PLUGIN_CACHE_DIR names it (not the cache), else <config dir>/plugins
PLUGINS_ROOT="${CLAUDE_CODE_PLUGIN_CACHE_DIR:-$CONFIG_DIR/plugins}"
# Self-location: scripts/ -> skills/skills/ -> skills/ -> plugin root
PLUGIN_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# --- Functions ---

# Extract value from YAML frontmatter
# Usage: extract_frontmatter "field" "file"
extract_frontmatter() {
    local field="$1"
    local file="$2"
    # First --- block at line 1 only; a body `---` never reopens it. Strips one pair of wrapping quotes
    awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {exit} f' "$file" 2>/dev/null | grep -E "^${field}:" | head -1 \
        | sed -E "s/^${field}:[[:space:]]*//; s/^\"(.*)\"[[:space:]]*$/\\1/; s/^'(.*)'[[:space:]]*$/\\1/" || true
}

# Get first non-empty, non-heading line after the frontmatter for description fallback
get_first_content_line() {
    local file="$1"
    awk 'NR==1 && /^---$/ {f=1; next} f && /^---$/ {f=0; next} !f' "$file" 2>/dev/null \
        | grep -v '^#' | grep -v '^[[:space:]]*$' | head -1 | sed 's/^[[:space:]]*//' || true
}

# Plugin name from .claude-plugin/plugin.json (top-level "name" comes first), else $2 or the dir name
plugin_name_of() {
    local dir="$1" name=""
    name=$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$dir/.claude-plugin/plugin.json" 2>/dev/null | head -1 || true)
    [[ -n "$name" ]] || name="${2:-$(basename "$dir")}"
    echo "$name"
}

# Truncate string to max length with ellipsis
truncate() {
    local str="$1"
    local max="${2:-50}"
    if [[ ${#str} -gt $max ]]; then
        echo "${str:0:$((max-3))}..."
    else
        echo "$str"
    fi
}

# yaml_bool "<raw value>" "<default when absent>": CC coercion; absent -> default, only `1|true|yes|on`
# (case-insensitive, trimmed) is true, every other spelling false.
yaml_bool() {
    local value="$1"
    local default="$2"

    [[ -z "$value" ]] && { echo "$default"; return 0; }
    value=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
    case "$value" in
        1|true|yes|on) echo "true" ;;
        *)             echo "false" ;;
    esac
}

# Determine invocation type from frontmatter values
# Returns: "AI + user", "user-only", "AI-only"
get_invocation_type() {
    local user_invocable
    local disable_model

    # Defaults per official skill frontmatter: user-invocable true, disable-model-invocation false
    user_invocable=$(yaml_bool "$1" "true")
    disable_model=$(yaml_bool "$2" "false")

    if [[ "$user_invocable" == "true" ]]; then
        if [[ "$disable_model" == "true" ]]; then
            echo "user-only"
        else
            echo "AI + user"
        fi
    else
        echo "AI-only"
    fi
}

# Process a single skill directory
# Usage: process_skill "scope" "skill_dir" "prefix"
process_skill() {
    local scope="$1"
    local skill_dir="$2"
    local prefix="$3"
    local skill_name
    local skill_file=""
    local description=""
    local user_invocable=""
    local disable_model=""
    local invocation=""

    # Skip if not a directory
    [[ -d "$skill_dir" ]] || return 0

    # Determine skill file (SKILL.md preferred, then README.md)
    if [[ -f "$skill_dir/SKILL.md" ]]; then
        skill_file="$skill_dir/SKILL.md"
    elif [[ -f "$skill_dir/README.md" ]]; then
        skill_file="$skill_dir/README.md"
    fi

    # Get skill name from frontmatter or folder name
    local folder_name
    folder_name=$(basename "$skill_dir")

    if [[ -n "$skill_file" ]]; then
        skill_name=$(extract_frontmatter "name" "$skill_file")
        [[ -z "$skill_name" ]] && skill_name="$folder_name"

        # Get description from frontmatter or first content line
        description=$(extract_frontmatter "description" "$skill_file")
        if [[ -z "$description" ]]; then
            description=$(get_first_content_line "$skill_file")
        fi
        # Never empty: `read` with IFS=tab merges an empty field and shifts the columns
        [[ -n "$description" ]] || description="(no description)"

        # Get invocation flags
        user_invocable=$(extract_frontmatter "user-invocable" "$skill_file")
        disable_model=$(extract_frontmatter "disable-model-invocation" "$skill_file")
    else
        skill_name="$folder_name"
        description="(no description)"
    fi

    # Format skill name with prefix if provided (skip if name already contains prefix)
    if [[ -n "$prefix" && ! "$skill_name" =~ ^"$prefix": ]]; then
        skill_name="${prefix}:${skill_name}"
    fi

    # Truncate description
    description=$(truncate "$description" 50)

    # Determine invocation type
    invocation=$(get_invocation_type "$user_invocable" "$disable_model")

    # Output row (tab-separated for sorting); printf keeps backslashes in descriptions literal
    printf '%s\t%s\t%s\t%s\n' "$scope" "$skill_name" "$description" "$invocation"
}

# Scan skills in a directory
# Usage: scan_skills "scope" "directory" "prefix"
scan_skills() {
    local scope="$1"
    local directory="$2"
    local prefix="${3:-}"

    [[ -d "$directory" ]] || return 0

    for skill_dir in "$directory"/*/; do
        [[ -d "$skill_dir" ]] || continue
        process_skill "$scope" "$skill_dir" "$prefix"
    done
}

# Scan plugin skills: this script's own copy (cache) or workspace (dev / local marketplace) first,
# then every other plugin in the installed cache.
scan_plugin_skills() {
    local seen=" "
    local cache_root=""
    local plugin_name

    # Installed layout: <plugins root>/cache/<marketplace>/<plugin>/<version>/skills/skills/scripts.
    # Running from it: siblings of PLUGIN_ROOT are other versions, so only this copy is scanned first.
    local up3
    up3="$(cd "$PLUGIN_ROOT/../../.." 2>/dev/null && pwd)"
    if [[ "$(basename "$up3")" == "cache" ]]; then
        cache_root="$up3"
        plugin_name=$(plugin_name_of "$PLUGIN_ROOT" "$(basename "$(dirname "$PLUGIN_ROOT")")")
        seen="$seen$plugin_name "
        scan_skills "plugin" "$PLUGIN_ROOT/skills" "$plugin_name"
    else
        cache_root="$PLUGINS_ROOT/cache"
        # Dev / local-marketplace layout: <workspace>/<plugin>/skills.
        # Scanned first so the copy this script actually ships in wins over a stale cached one.
        local workspace
        workspace=$(dirname "$PLUGIN_ROOT")
        for plugin_dir in "$workspace"/*/; do
            [[ -d "$plugin_dir/skills" ]] || continue
            [[ -f "$plugin_dir/.claude-plugin/plugin.json" ]] || continue
            plugin_name=$(plugin_name_of "${plugin_dir%/}")

            case "$seen" in *" $plugin_name "*) continue ;; esac
            seen="$seen$plugin_name "
            scan_skills "plugin" "$plugin_dir/skills" "$plugin_name"
        done
    fi

    if [[ -d "$cache_root" ]]; then
        for repo_dir in "$cache_root"/*/; do
            [[ -d "$repo_dir" ]] || continue

            for plugin_dir in "$repo_dir"*/; do
                [[ -d "$plugin_dir" ]] || continue

                # Highest version (sort -V, not glob order: 6.10.0 > 6.9.0) that ships skills/ wins
                local latest_version="" version_dir
                while IFS= read -r version_dir; do
                    [[ -n "$version_dir" && -d "$version_dir/skills" ]] || continue
                    latest_version="$version_dir"
                done < <(find "${plugin_dir%/}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V || true)
                [[ -n "$latest_version" ]] || continue
                plugin_name=$(plugin_name_of "$latest_version" "$(basename "${plugin_dir%/}")")

                case "$seen" in *" $plugin_name "*) continue ;; esac
                seen="$seen$plugin_name "
                scan_skills "plugin" "$latest_version/skills" "$plugin_name"
            done
        done
    fi
}

# --- Main ---

# Collect all skills
SKILLS=""

# 1. Global skills
if [[ -d "$GLOBAL_SKILLS" ]]; then
    while IFS= read -r line; do
        [[ -n "$line" ]] && SKILLS="${SKILLS}${line}"$'\n'
    done < <(scan_skills "global" "$GLOBAL_SKILLS" "")
fi

# 2. Project skills
if [[ -d "$PROJECT_SKILLS" ]]; then
    while IFS= read -r line; do
        [[ -n "$line" ]] && SKILLS="${SKILLS}${line}"$'\n'
    done < <(scan_skills "project" "$PROJECT_SKILLS" "")
fi

# 3. Plugin skills
while IFS= read -r line; do
    [[ -n "$line" ]] && SKILLS="${SKILLS}${line}"$'\n'
done < <(scan_plugin_skills)

# Sort by scope order (global, plugin, project) then by name
# Custom sort: global=1, plugin=2, project=3
SORTED_SKILLS=$(echo -n "$SKILLS" | sed 's/^global/1_global/; s/^plugin/2_plugin/; s/^project/3_project/' | sort -t$'\t' -k1,1 -k2,2 | sed 's/^[0-9]_//')

# Output markdown table
echo "| Scope | Skill | Description | Invocation |"
echo "|-------|-------|-------------|------------|"

while IFS=$'\t' read -r scope skill desc invocation; do
    [[ -z "$scope" ]] && continue
    echo "| $scope | $skill | ${desc//|/\\|} | $invocation |"
done <<< "$SORTED_SKILLS"

echo ""
# `|| true`, not `|| echo 0`: grep -c already prints 0 on no-match, it just exits 1
SKILL_COUNT=$(echo -n "$SKILLS" | grep -c '^' 2>/dev/null || true); SKILL_COUNT=${SKILL_COUNT:-0}
echo "Total: $SKILL_COUNT skills found"
