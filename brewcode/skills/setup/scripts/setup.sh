#!/bin/bash
# Brewcode Setup Script
# Multi-function script for /brewcode:setup skill
# Usage: setup.sh <mode> [options]
#
# Modes:
#   scan       - Scan project structure (Phase 1)
#   structure  - Create directories (Phase 3)
#   sync       - Sync templates from plugin (Phase 3)
#   review     - Copy review skill template (Phase 3.5)
#   config     - Copy config file (Phase 3.6)
#   validate   - Validation checks (Phase 4)
#   all        - Run all phases

set -euo pipefail

MODE="${1:-all}"

# Self-location: derive plugin root from script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Path: scripts/setup.sh -> skills/setup/scripts -> skills/setup -> skills -> PLUGIN_ROOT
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
PLUGIN_TEMPLATES="$PLUGIN_ROOT/templates"
PLUGIN_SKILLS="$PLUGIN_ROOT/skills"
SETUP_TEMPLATES="$PLUGIN_ROOT/skills/setup/templates"
SETUP_REFERENCES="$PLUGIN_ROOT/skills/setup/references"

# Validate plugin structure
validate_plugin() {
  if [ ! -d "$PLUGIN_ROOT" ]; then
    echo "❌ Plugin root not found: $PLUGIN_ROOT"
    exit 1
  fi
  if [ ! -d "$SETUP_TEMPLATES" ]; then
    echo "❌ Setup templates not found: $SETUP_TEMPLATES"
    exit 1
  fi
}

# Phase 1: Scan project structure
scan_project() {
  echo "=== Phase 1: Project Scan ==="
  echo ""

  echo "--- Build Files ---"
  find . -maxdepth 3 -type f \( \
    -name "package.json" -o \
    -name "pom.xml" -o \
    -name "build.gradle" -o \
    -name "build.gradle.kts" -o \
    -name "requirements.txt" -o \
    -name "Pipfile" -o \
    -name "Cargo.toml" -o \
    -name "go.mod" -o \
    -name "composer.json" \
  \) 2>/dev/null || echo "(none found)"

  echo ""
  echo "--- Project Agents ---"
  find .claude/agents -type f -name "*.md" 2>/dev/null | sort || echo "(none)"

  echo ""
  echo "--- Test Directories ---"
  find . -type d \( -name "test" -o -name "tests" -o -name "__tests__" \) 2>/dev/null | head -20 || echo "(none)"

  echo ""
  echo "--- Sample Test Files ---"
  find . -type f \( \
    -name "*Test.java" -o \
    -name "*Test.kt" -o \
    -name "*.test.js" -o \
    -name "*.test.ts" -o \
    -name "*_test.py" -o \
    -name "*_test.go" \
  \) 2>/dev/null | head -10 || echo "(none)"

  echo ""
  echo "--- CLAUDE.md ---"
  test -f ./CLAUDE.md && echo "✅ CLAUDE.md exists" || echo "⚠️ No CLAUDE.md"
  test -f ./.claude/CLAUDE.md && echo "✅ .claude/CLAUDE.md exists" || echo "⚠️ No .claude/CLAUDE.md"
}

# Phase 3: Create directory structure
create_structure() {
  echo "=== Phase 3: Create Structure ==="
  mkdir -p .claude/tasks/templates .claude/rules
  echo "✅ Created .claude/tasks/templates/"
  echo "✅ Created .claude/rules/"
}

# Phase 3: Sync templates from plugin
sync_templates() {
  echo "=== Phase 3: Sync Templates ==="
  validate_plugin

  sync_template() {
    local src="$1" dst="$2"
    if [ ! -f "$dst" ]; then
      cp "$src" "$dst" && echo "✅ Created: $dst"
    elif ! diff -q "$src" "$dst" >/dev/null 2>&1; then
      cp "$src" "$dst" && echo "🔄 Updated: $dst"
    else
      echo "⏭️  Unchanged: $dst"
    fi
  }

  sync_template "$SETUP_TEMPLATES/PLAN.md.template" ".claude/tasks/templates/PLAN.md.template"
  sync_template "$SETUP_TEMPLATES/SPEC.md.template" ".claude/tasks/templates/SPEC.md.template"
  sync_template "$SETUP_TEMPLATES/KNOWLEDGE.jsonl.template" ".claude/tasks/templates/KNOWLEDGE.jsonl.template"

  # grepai-first: always sync (plugin-managed rule)
  if [ -f "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" ]; then
    sync_template "$PLUGIN_TEMPLATES/rules/grepai-first.md.template" ".claude/rules/grepai-first.md"
  fi

  # post-agent-protocol: always sync (plugin-managed rule)
  if [ -f "$PLUGIN_TEMPLATES/rules/post-agent-protocol.md.template" ]; then
    sync_template "$PLUGIN_TEMPLATES/rules/post-agent-protocol.md.template" ".claude/rules/post-agent-protocol.md"
  fi

  # Rules: create only if missing (never overwrite user rules)
  if [ ! -f ".claude/rules/avoid.md" ]; then
    cp "$PLUGIN_TEMPLATES/rules/avoid.md.template" .claude/rules/avoid.md
    echo "✅ Created: .claude/rules/avoid.md"
  else
    echo "⏭️  Preserved: .claude/rules/avoid.md (user rules)"
  fi

  if [ ! -f ".claude/rules/best-practice.md" ]; then
    cp "$PLUGIN_TEMPLATES/rules/best-practice.md.template" .claude/rules/best-practice.md
    echo "✅ Created: .claude/rules/best-practice.md"
  else
    echo "⏭️  Preserved: .claude/rules/best-practice.md (user rules)"
  fi
}

# Phase 3.5: Copy review skill template
copy_review_skill() {
  echo "=== Phase 3.5: Review Skill ==="
  validate_plugin

  mkdir -p .claude/skills/brewcode-review

  if [ -f "$PLUGIN_TEMPLATES/skills/review/SKILL.md.template" ]; then
    cp "$PLUGIN_TEMPLATES/skills/review/SKILL.md.template" .claude/skills/brewcode-review/SKILL.md
    echo "✅ Copied: .claude/skills/brewcode-review/SKILL.md"
  else
    echo "❌ Template not found: $PLUGIN_TEMPLATES/skills/review/SKILL.md.template"
    exit 1
  fi

  # Copy references
  if [ -d "$PLUGIN_TEMPLATES/skills/review/references" ]; then
    mkdir -p .claude/skills/brewcode-review/references
    cp "$PLUGIN_TEMPLATES/skills/review/references/"*.md .claude/skills/brewcode-review/references/
    echo "✅ Copied: references/ (agent-prompt.md, report-template.md)"
  fi

  # Verify
  test -f .claude/skills/brewcode-review/SKILL.md && echo "✅ Review skill created" || echo "❌ Review skill MISSING"
}

# Phase 3.6: Copy config
copy_config() {
  echo "=== Phase 3.6: Config ==="
  validate_plugin

  TEMPLATE="$SETUP_TEMPLATES/brewcode.config.json.template"
  PROJECT_CFG=".claude/tasks/cfg/brewcode.config.json"

  mkdir -p .claude/tasks/cfg

  if [ ! -f "$PROJECT_CFG" ]; then
    cp "$TEMPLATE" "$PROJECT_CFG"
    echo "✅ Config created: $PROJECT_CFG"
  else
    # Compare normalized JSON content
    TEMPLATE_HASH=$(jq -S . "$TEMPLATE" 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || true)
    PROJECT_HASH=$(jq -S . "$PROJECT_CFG" 2>/dev/null | shasum -a 256 | cut -d' ' -f1 || true)

    if [ "$TEMPLATE_HASH" != "$PROJECT_HASH" ]; then
      cp "$PROJECT_CFG" "$PROJECT_CFG.bak"
      cp "$TEMPLATE" "$PROJECT_CFG"
      echo "🔄 Config updated: $PROJECT_CFG"
      echo "   Backup: $PROJECT_CFG.bak"
    else
      echo "⏭️  Config unchanged: $PROJECT_CFG"
    fi
  fi
}

# Collect agents for CLAUDE.md
collect_agents() {
  echo "=== Collect Agents ==="
  echo ""

  # Header
  cat << 'EOF'
## Agents — DELEGATE!

> **MANAGER:** Delegate via Task tool. Never implement directly.

| Name | Scope | Purpose |
|------|-------|---------|
| Explore | system | Find files, search code |
| Plan | system | Design implementation |
| general-purpose | system | Multi-step research |
EOF

  # Global agents from ~/.claude/agents/
  if [ -d "$HOME/.claude/agents" ]; then
    for f in "$HOME/.claude/agents"/*.md; do
      [ -f "$f" ] || continue
      name=$(grep "^name:" "$f" 2>/dev/null | head -1 | sed 's/^name: *//' | tr -d '"' | xargs)
      desc=$(grep "^description:" "$f" 2>/dev/null | head -1 | sed 's/^description: *//' | tr -d '"')
      # Truncate to 5 words max
      purpose=$(echo "$desc" | awk '{for(i=1;i<=5&&i<=NF;i++) printf "%s ", $i}' | xargs)
      [ -n "$name" ] && echo "| $name | global | $purpose |"
    done
  fi

  # Plugin agents from PLUGIN_ROOT/agents/ (excluding internal agents)
  # Internal agents (bc-coordinator, bc-grepai-configurator, bc-knowledge-manager) are not listed
  # because they are only called by the plugin itself, not by users
  INTERNAL_AGENTS="bc-coordinator bc-grepai-configurator bc-knowledge-manager"
  if [ -d "$PLUGIN_ROOT/agents" ]; then
    for f in "$PLUGIN_ROOT/agents"/*.md; do
      [ -f "$f" ] || continue
      name=$(grep "^name:" "$f" 2>/dev/null | head -1 | sed 's/^name: *//' | tr -d '"' | xargs)
      # Skip internal agents
      echo "$INTERNAL_AGENTS" | grep -qw "$name" && continue
      desc=$(grep "^description:" "$f" 2>/dev/null | head -1 | sed 's/^description: *//' | tr -d '"')
      purpose=$(echo "$desc" | awk '{for(i=1;i<=5&&i<=NF;i++) printf "%s ", $i}' | xargs)
      [ -n "$name" ] && echo "| $name | plugin | $purpose |"
    done
  fi
}

# Phase 4: Validation
validate_setup() {
  echo "=== Phase 4: Validation ==="
  ERRORS=0

  test -f .claude/tasks/templates/PLAN.md.template && echo "✅ PLAN template" || { echo "❌ PLAN template MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/tasks/templates/SPEC.md.template && echo "✅ SPEC template" || { echo "❌ SPEC template MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/tasks/templates/KNOWLEDGE.jsonl.template && echo "✅ KNOWLEDGE template" || { echo "❌ KNOWLEDGE template MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/rules/avoid.md && echo "✅ avoid.md rules" || { echo "❌ avoid.md MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/rules/best-practice.md && echo "✅ best-practice.md rules" || { echo "❌ best-practice.md MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/tasks/cfg/brewcode.config.json && echo "✅ Config file" || echo "⚠️ Config MISSING (optional)"

  exit $ERRORS
}

# Main dispatch
case "$MODE" in
  scan)
    scan_project
    ;;
  structure)
    create_structure
    ;;
  sync)
    sync_templates
    ;;
  review)
    copy_review_skill
    ;;
  config)
    copy_config
    ;;
  validate)
    validate_setup
    ;;
  agents)
    collect_agents
    ;;
  all)
    scan_project
    echo ""
    create_structure
    echo ""
    sync_templates
    echo ""
    copy_review_skill
    echo ""
    copy_config
    echo ""
    validate_setup
    ;;
  *)
    echo "Usage: setup.sh <mode>"
    echo ""
    echo "Modes:"
    echo "  scan       - Scan project structure"
    echo "  structure  - Create directories"
    echo "  sync       - Sync templates from plugin"
    echo "  review     - Copy review skill template"
    echo "  config     - Copy config file"
    echo "  validate   - Validation checks"
    echo "  agents     - Collect agents for CLAUDE.md"
    echo "  all        - Run all phases"
    exit 1
    ;;
esac
