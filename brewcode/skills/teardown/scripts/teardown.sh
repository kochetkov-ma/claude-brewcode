#!/bin/bash
# Brewcode Teardown Script
# Removes all files created by /brewcode:setup

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

echo "Brewcode Teardown"
echo "==================="
$DRY_RUN && echo "[DRY-RUN MODE]"
echo ""

remove_item() {
    local path="$1"
    local type="$2"  # file, dir, symlink

    if [ ! -e "$path" ] && [ ! -L "$path" ]; then
        return 0
    fi

    if $DRY_RUN; then
        echo "  [would remove] $path"
    else
        if [ "$type" == "dir" ]; then
            rm -rf "$path" && echo "  ✅ $path"
        else
            rm -f "$path" && echo "  ✅ $path"
        fi
    fi
}

echo "Project files:"

# Templates directory
remove_item ".claude/tasks/templates" "dir"

# Config directory (includes brewcode.config.json)
remove_item ".claude/tasks/cfg" "dir"

# Logs directory
remove_item ".claude/tasks/logs" "dir"

# Plans directory
remove_item ".claude/plans" "dir"

# grepai index directory
remove_item ".grepai" "dir"

# Project review skill
remove_item ".claude/skills/brewcode-review" "dir"

# Sessions
remove_item ".claude/tasks/sessions" "dir"

echo ""
echo "Preserved (not deleted):"
echo "  ⏭️  .claude/tasks/*_task/ (task directories)"
echo "  ⏭️  .claude/tasks/*_task/KNOWLEDGE.jsonl (knowledge files)"
echo "  ⏭️  .claude/tasks/*_task/artifacts/ (artifacts)"
echo "  ⏭️  .claude/rules/ (user rules)"

echo ""
$DRY_RUN && echo "Run without --dry-run to execute cleanup." || echo "Cleanup complete."
