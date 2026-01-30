#!/bin/bash
# grepai Create Rule File

echo "=== Create Rule ==="

RULE_FILE=".claude/rules/grepai-first.md"
mkdir -p .claude/rules

if [ -f "$RULE_FILE" ]; then
  echo "⏭️ Rule already exists: $RULE_FILE"
  exit 0
fi

# Self-location: derive plugin root from script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Path: scripts/create-rule.sh -> skills/grepai/scripts -> skills/grepai -> skills -> PLUGIN_ROOT
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
PLUGIN_TEMPLATES="$PLUGIN_ROOT/templates"

if [ -f "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" ]; then
  cp "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" "$RULE_FILE"
  echo "✅ Rule created: $RULE_FILE"
else
  echo "⚠️ Template not found, creating default rule"
  cat > "$RULE_FILE" << 'RULE'
---
globs: ["**/*"]
alwaysApply: true
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
  echo "✅ Rule created (default): $RULE_FILE"
fi
