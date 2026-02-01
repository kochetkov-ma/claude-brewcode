#!/bin/bash
set -euo pipefail
# grepai Create Rule + CLAUDE.md entry

echo "=== Create Rule ==="

RULE_FILE=".claude/rules/grepai-first.md"
CLAUDE_MD="CLAUDE.md"
GREPAI_MARKER="grepai_search"

mkdir -p .claude/rules

# Add grepai entry to CLAUDE.md if not present
if [ -f "$CLAUDE_MD" ]; then
  if ! grep -q "$GREPAI_MARKER" "$CLAUDE_MD" 2>/dev/null; then
    echo "" >> "$CLAUDE_MD"
    echo "## Code Search" >> "$CLAUDE_MD"
    echo "" >> "$CLAUDE_MD"
    echo "> **CRITICAL:** Use \`grepai_search\` FIRST for code exploration." >> "$CLAUDE_MD"
    echo "✅ CLAUDE.md updated with grepai entry"
  else
    echo "⏭️ CLAUDE.md already has grepai entry"
  fi
else
  echo "⚠️ CLAUDE.md not found (optional)"
fi

# Self-location: derive plugin root from script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Path: scripts/create-rule.sh -> skills/grepai/scripts -> skills/grepai -> skills -> PLUGIN_ROOT
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
PLUGIN_TEMPLATES="$PLUGIN_ROOT/templates"

if [ -f "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" ]; then
  cp "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" "$RULE_FILE"
  echo "✅ Rule updated: $RULE_FILE"
else
  echo "⚠️ Template not found, creating default rule"
  cat > "$RULE_FILE" << 'RULE'
---
paths:
  - "**/*"
description: grepai-first - semantic search FIRST for code exploration
---

# grepai-first

Use grepai as PRIMARY search tool for semantic code search.

| Task | Tool |
|------|------|
| Search by intent | grepai_search |
| Exact text match | Grep |
| File path patterns | Glob |

**Decision:** "Need exact text/pattern?" → YES: Grep/Glob, NO: grepai
RULE
  echo "✅ Rule updated (default): $RULE_FILE"
fi
