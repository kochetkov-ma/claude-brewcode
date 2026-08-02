#!/bin/bash
set -euo pipefail
# grepai Create Rule + CLAUDE.md entry

echo "=== Create Rule ==="

RULE_FILE=".claude/rules/grepai-first.md"
CLAUDE_MD="CLAUDE.md"
GREPAI_MARKER="grepai_search"

mkdir -p .claude/rules

append_claude_md_entry() {
  {
    echo ""
    echo "## Code Search"
    echo ""
    echo "> **CRITICAL:** Use \`grepai_search\` FIRST for code exploration."
    echo "> **ALWAYS \`compact:true\` + \`format:\"toon\"\`** → path+lines only, then \`Read\` the top hits."
    echo "> Full content (\`compact:false\`) only as an exception, after a compact pass, with \`limit<=3\` — it overflows the context."
  } >> "$1"
}

if [ ! -f "$CLAUDE_MD" ]; then
  echo "# CLAUDE.md" > "$CLAUDE_MD"
  append_claude_md_entry "$CLAUDE_MD"
  echo "✅ CLAUDE.md created with grepai entry"
elif ! grep -q "$GREPAI_MARKER" "$CLAUDE_MD" 2>/dev/null; then
  append_claude_md_entry "$CLAUDE_MD"
  echo "✅ CLAUDE.md updated with grepai entry"
else
  echo "⏭️ CLAUDE.md already has grepai entry"
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

## Compact-first (HARD)

| | Rule |
|---|---|
| Default call | `compact:true, format:"toon", limit:10` → path+lines only → `Read` top 1-3 hits |
| `compact:false` ONLY if | compact pass already ran AND `limit<=3` AND one narrow query |
| NEVER | `compact:false` first, or `limit>3`, or on a broad query — full chunks overflow the context |

| Task | Tool |
|------|------|
| Search by intent | `grepai_search` |
| Exact text / path pattern | Bash (`grep`/`rg`, `find`) |

**Decision:** "Need exact text/pattern?" → YES: Bash grep/find, NO: grepai (compact)
RULE
  echo "✅ Rule updated (default): $RULE_FILE"
fi
