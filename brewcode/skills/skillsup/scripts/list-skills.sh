#!/bin/bash
# list-skills.sh — Scan and list all available Claude Code skills
# Usage: list-skills.sh
# Output: Markdown table of skills with scope, name, description, invocation
set -euo pipefail

# --- Configuration ---
GLOBAL_SKILLS="$HOME/.claude/skills"
PROJECT_SKILLS=".claude/skills"
PLUGIN_ROOT="${BC_PLUGIN_ROOT:-}"

# --- Functions ---

# Extract value from YAML frontmatter
# Usage: extract_frontmatter "field" "file"
extract_frontmatter() {
    local field="$1"
    local file="$2"
    # Match field in frontmatter (between --- markers)
    # Use grep with || true to avoid exit on no match
    sed -n '/^---$/,/^---$/p' "$file" 2>/dev/null | grep -E "^${field}:" | head -1 | sed "s/^${field}:[[:space:]]*//" | tr -d '"' | tr -d "'" || true
}

# Get first non-empty line after frontmatter for description fallback
get_first_content_line() {
    local file="$1"
    # Skip frontmatter, get first non-empty line
    # Use || true to avoid exit on no match
    sed -n '/^---$/,/^---$/!p' "$file" 2>/dev/null | grep -v '^#' | grep -v '^$' | head -1 | sed 's/^[[:space:]]*//' || true
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

# Determine invocation type from frontmatter values
# Returns: "AI + user", "user-only", "AI-only"
get_invocation_type() {
    local user_invocable="$1"
    local disable_model="$2"

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

    # Output row (tab-separated for sorting)
    echo -e "${scope}\t${skill_name}\t${description}\t${invocation}"
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

# Scan plugin skills from cache directory
scan_plugin_skills() {
    local plugins_cache=""

    # Determine plugins cache root from BC_PLUGIN_ROOT
    if [[ -n "$PLUGIN_ROOT" && -d "$PLUGIN_ROOT" ]]; then
        # BC_PLUGIN_ROOT format: ~/.claude/plugins/cache/{repo}/{plugin}/{version}
        # Go up to cache root: ../../..
        plugins_cache=$(dirname "$(dirname "$(dirname "$PLUGIN_ROOT")")")
    fi

    [[ -d "$plugins_cache" ]] || return 0

    # Scan all repos in cache
    for repo_dir in "$plugins_cache"/*/; do
        [[ -d "$repo_dir" ]] || continue
        local repo_name
        repo_name=$(basename "$repo_dir")

        # Scan all plugins in repo
        for plugin_dir in "$repo_dir"/*/; do
            [[ -d "$plugin_dir" ]] || continue
            local plugin_name
            plugin_name=$(basename "$plugin_dir")

            # Find latest version (highest version dir)
            local latest_version=""
            for version_dir in "$plugin_dir"/*/; do
                [[ -d "$version_dir" ]] || continue
                latest_version="$version_dir"
            done

            [[ -d "$latest_version" ]] || continue

            # Scan skills in this plugin
            local skills_dir="$latest_version/skills"
            if [[ -d "$skills_dir" ]]; then
                scan_skills "plugin" "$skills_dir" "$plugin_name"
            fi
        done
    done
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
    echo "| $scope | $skill | $desc | $invocation |"
done <<< "$SORTED_SKILLS"

echo ""
SKILL_COUNT=$(echo -n "$SKILLS" | grep -c '^' 2>/dev/null || echo 0)
echo "Total: $SKILL_COUNT skills found"
