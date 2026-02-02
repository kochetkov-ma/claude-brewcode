#!/bin/bash
# Focus-Task Setup Script
# Multi-function script for /focus-task:setup skill
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

set -e

MODE="${1:-all}"

# Self-location: derive plugin root from script path
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Path: scripts/setup.sh -> skills/setup/scripts -> skills/setup -> skills -> PLUGIN_ROOT
PLUGIN_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
PLUGIN_TEMPLATES="$PLUGIN_ROOT/templates"
PLUGIN_SKILLS="$PLUGIN_ROOT/skills"

# Validate plugin structure
validate_plugin() {
  if [ ! -d "$PLUGIN_ROOT" ]; then
    echo "❌ Plugin root not found: $PLUGIN_ROOT"
    exit 1
  fi
  if [ ! -d "$PLUGIN_TEMPLATES" ]; then
    echo "❌ Templates not found: $PLUGIN_TEMPLATES"
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
  mkdir -p .claude/tasks/templates .claude/tasks/specs .claude/rules
  echo "✅ Created .claude/tasks/templates/"
  echo "✅ Created .claude/tasks/specs/"
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

  sync_template "$PLUGIN_TEMPLATES/TASK.md.template" ".claude/tasks/templates/TASK.md.template"
  sync_template "$PLUGIN_TEMPLATES/SPEC.md.template" ".claude/tasks/templates/SPEC.md.template"
  sync_template "$PLUGIN_TEMPLATES/KNOWLEDGE.jsonl.template" ".claude/tasks/templates/KNOWLEDGE.jsonl.template"

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

  mkdir -p .claude/skills/focus-task-review

  if [ -f "$PLUGIN_TEMPLATES/skills/review/SKILL.md.template" ]; then
    cp "$PLUGIN_TEMPLATES/skills/review/SKILL.md.template" .claude/skills/focus-task-review/SKILL.md
    echo "✅ Copied: .claude/skills/focus-task-review/SKILL.md"
  else
    echo "❌ Template not found: $PLUGIN_TEMPLATES/skills/review/SKILL.md.template"
    exit 1
  fi

  # Copy references
  if [ -d "$PLUGIN_TEMPLATES/skills/review/references" ]; then
    mkdir -p .claude/skills/focus-task-review/references
    cp "$PLUGIN_TEMPLATES/skills/review/references/"*.md .claude/skills/focus-task-review/references/
    echo "✅ Copied: references/ (agent-prompt.md, report-template.md)"
  fi

  # Verify
  test -f .claude/skills/focus-task-review/SKILL.md && echo "✅ Review skill created" || echo "❌ Review skill MISSING"
}

# Phase 3.6: Copy config
copy_config() {
  echo "=== Phase 3.6: Config ==="
  validate_plugin

  TEMPLATE="$PLUGIN_TEMPLATES/focus-task.config.json.template"
  PROJECT_CFG=".claude/tasks/cfg/focus-task.config.json"

  mkdir -p .claude/tasks/cfg

  if [ ! -f "$PROJECT_CFG" ]; then
    cp "$TEMPLATE" "$PROJECT_CFG"
    echo "✅ Config created: $PROJECT_CFG"
  else
    # Compare normalized JSON content
    TEMPLATE_HASH=$(jq -S . "$TEMPLATE" 2>/dev/null | shasum -a 256 | cut -d' ' -f1)
    PROJECT_HASH=$(jq -S . "$PROJECT_CFG" 2>/dev/null | shasum -a 256 | cut -d' ' -f1)

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

# Phase 4: Validation
validate_setup() {
  echo "=== Phase 4: Validation ==="
  ERRORS=0

  test -f .claude/tasks/templates/TASK.md.template && echo "✅ TASK template" || { echo "❌ TASK template MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/tasks/templates/SPEC.md.template && echo "✅ SPEC template" || { echo "❌ SPEC template MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/tasks/templates/KNOWLEDGE.jsonl.template && echo "✅ KNOWLEDGE template" || { echo "❌ KNOWLEDGE template MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/rules/avoid.md && echo "✅ avoid.md rules" || { echo "❌ avoid.md MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/rules/best-practice.md && echo "✅ best-practice.md rules" || { echo "❌ best-practice.md MISSING"; ERRORS=$((ERRORS+1)); }
  test -f .claude/tasks/cfg/focus-task.config.json && echo "✅ Config file" || echo "⚠️ Config MISSING (optional)"

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
    echo "  all        - Run all phases"
    exit 1
    ;;
esac
