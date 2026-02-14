#!/bin/bash
# install-hook.sh — Install forced-eval hook for skill activation
# Usage: install-hook.sh
# Requires: jq
set -euo pipefail

# --- Configuration ---
PLUGIN_ROOT="${FT_PLUGIN_ROOT:-}"
HOOK_SRC="${PLUGIN_ROOT}/skills/skillsup/references/forced-eval-hook.mjs"
HOOK_DST=".claude/hooks/skill-forced-eval.mjs"
SETTINGS=".claude/settings.json"
HOOK_MATCHER="UserPromptSubmit"

# --- Validation ---

# Check FT_PLUGIN_ROOT is set
if [[ -z "$PLUGIN_ROOT" ]]; then
    echo "ERROR: FT_PLUGIN_ROOT environment variable not set"
    exit 1
fi

# Check jq is installed
if ! command -v jq &>/dev/null; then
    echo "ERROR: jq is required but not installed"
    echo "Install with: brew install jq"
    exit 1
fi

# Check source hook exists
if [[ ! -f "$HOOK_SRC" ]]; then
    echo "ERROR: Source hook not found: $HOOK_SRC"
    exit 1
fi

# --- Functions ---

# Create settings.json with hook config
create_settings_with_hook() {
    cat <<'SETTINGS_EOF'
{
  "hooks": [
    {
      "matcher": "UserPromptSubmit",
      "hooks": [".claude/hooks/skill-forced-eval.mjs"]
    }
  ]
}
SETTINGS_EOF
}

# Add hook to existing settings.json
add_hook_to_settings() {
    local settings_file="$1"
    local temp_file
    temp_file=$(mktemp)

    # Check if hooks array exists
    if jq -e '.hooks' "$settings_file" &>/dev/null; then
        # Check if UserPromptSubmit matcher already exists
        local matcher_index
        matcher_index=$(jq --arg m "$HOOK_MATCHER" '.hooks | to_entries | .[] | select(.value.matcher == $m) | .key' "$settings_file" 2>/dev/null | head -1)

        if [[ -n "$matcher_index" ]]; then
            # Matcher exists - check if hook already in array
            local hook_exists
            hook_exists=$(jq --arg m "$HOOK_MATCHER" --arg h "$HOOK_DST" \
                '.hooks[] | select(.matcher == $m) | .hooks[] | select(. == $h)' "$settings_file" 2>/dev/null)

            if [[ -n "$hook_exists" ]]; then
                echo "Hook already installed in settings.json (skipped)"
                rm -f "$temp_file"
                return 0
            fi

            # Add hook to existing matcher's hooks array
            jq --arg m "$HOOK_MATCHER" --arg h "$HOOK_DST" \
                '(.hooks[] | select(.matcher == $m) | .hooks) += [$h]' \
                "$settings_file" > "$temp_file"
        else
            # No matching matcher - add new hook entry
            jq --arg m "$HOOK_MATCHER" --arg h "$HOOK_DST" \
                '.hooks += [{"matcher": $m, "hooks": [$h]}]' \
                "$settings_file" > "$temp_file"
        fi
    else
        # No hooks array - add one
        jq --arg m "$HOOK_MATCHER" --arg h "$HOOK_DST" \
            '. + {"hooks": [{"matcher": $m, "hooks": [$h]}]}' \
            "$settings_file" > "$temp_file"
    fi

    # Replace original file
    mv "$temp_file" "$settings_file"
    echo "Updated settings.json with hook configuration"
}

# --- Main ---

echo "=== Installing Skill Forced-Eval Hook ==="
echo ""

# Step 1: Create hooks directory
mkdir -p .claude/hooks
echo "Created .claude/hooks directory"

# Step 2: Copy hook file
if [[ -f "$HOOK_DST" ]]; then
    # Check if files are identical
    if diff -q "$HOOK_SRC" "$HOOK_DST" &>/dev/null; then
        echo "Hook file already installed (skipped): $HOOK_DST"
    else
        cp "$HOOK_SRC" "$HOOK_DST"
        echo "Updated hook file: $HOOK_DST"
    fi
else
    cp "$HOOK_SRC" "$HOOK_DST"
    echo "Installed hook file: $HOOK_DST"
fi

# Step 3: Update settings.json
if [[ -f "$SETTINGS" ]]; then
    # Validate existing JSON
    if ! jq empty "$SETTINGS" &>/dev/null; then
        echo "ERROR: Invalid JSON in $SETTINGS"
        exit 1
    fi
    add_hook_to_settings "$SETTINGS"
else
    # Create new settings.json
    mkdir -p .claude
    create_settings_with_hook > "$SETTINGS"
    echo "Created settings.json with hook configuration"
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Hook installed: $HOOK_DST"
echo "Settings updated: $SETTINGS"
echo ""
echo "The hook will activate on UserPromptSubmit events."
