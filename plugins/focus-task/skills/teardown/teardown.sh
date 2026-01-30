#!/bin/bash
# Focus-Task Teardown Script
# Removes all files created by /focus-task:setup

set -e

DRY_RUN=false
[[ "$1" == "--dry-run" ]] && DRY_RUN=true

echo "Focus-Task Teardown"
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

# Config directory (includes focus-task.config.json)
remove_item ".claude/tasks/cfg" "dir"

# Logs directory
remove_item ".claude/tasks/logs" "dir"

# Plans directory
remove_item ".claude/plans" "dir"

# grepai index directory
remove_item ".grepai" "dir"

# Project review skill
remove_item ".claude/skills/focus-task-review" "dir"

echo ""
echo "Global symlinks:"

# Remove all focus-task-* symlinks from ~/.claude/skills/
for link in ~/.claude/skills/focus-task-*; do
    if [ -L "$link" ]; then
        remove_item "$link" "symlink"
    fi
done

echo ""
echo "Preserved (not deleted):"
echo "  ⏭️  .claude/tasks/*_TASK.md (active tasks)"
echo "  ⏭️  .claude/tasks/*_KNOWLEDGE.jsonl"
echo "  ⏭️  .claude/tasks/reports/"
echo "  ⏭️  .claude/tasks/specs/"
echo "  ⏭️  .claude/rules/ (user rules)"

echo ""
$DRY_RUN && echo "Run without --dry-run to execute cleanup." || echo "Cleanup complete."
