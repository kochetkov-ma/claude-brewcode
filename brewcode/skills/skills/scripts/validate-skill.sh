#!/bin/sh
# validate-skill.sh — Validate a Claude Code skill directory structure
# Usage: validate-skill.sh <skill-dir>
# Exit:  0 = all checks pass, 1 = any check fails
set -eu

SKILL_DIR="${1:-}"
if [ -z "$SKILL_DIR" ]; then
    echo "Usage: validate-skill.sh <skill-dir>"
    exit 1
fi

PASS=0
FAIL=0

check() {
    if [ "$1" = "ok" ]; then
        PASS=$((PASS + 1))
        echo "✅ $2"
    else
        FAIL=$((FAIL + 1))
        echo "❌ $2"
    fi
}

# 1. No lowercase skill.md (ls -1 for exact case on case-insensitive FS)
if ls -1 "$SKILL_DIR" 2>/dev/null | grep -q '^skill\.md$'; then
    check fail "skill.md found — must be SKILL.md (uppercase)"
else
    check ok "No lowercase skill.md"
fi

# 2. SKILL.md exists
SKILL_FILE="$SKILL_DIR/SKILL.md"
if [ ! -f "$SKILL_FILE" ]; then
    check fail "SKILL.md not found in $SKILL_DIR"
    echo ""
    echo "=== Result: $PASS passed, $FAIL failed ==="
    exit 1
fi
check ok "SKILL.md exists"

# 3. Frontmatter delimiters (opening and closing ---)
FM_COUNT=$(grep -c '^---$' "$SKILL_FILE" 2>/dev/null || echo 0)
if [ "$FM_COUNT" -ge 2 ]; then
    check ok "Frontmatter has opening and closing --- delimiters"
else
    check fail "Frontmatter missing --- delimiters (found $FM_COUNT, need 2+)"
fi

# Extract frontmatter block (between first two --- lines)
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$SKILL_FILE" 2>/dev/null || true)

# 4. name field: present, kebab-case (with optional prefix:), max 64 chars
NAME=$(echo "$FRONTMATTER" | grep -E '^name:' | head -1 | sed 's/^name:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
if [ -z "$NAME" ]; then
    check fail "name field missing in frontmatter"
elif [ ${#NAME} -gt 64 ]; then
    check fail "name too long (${#NAME} chars, max 64)"
elif ! echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9-]*(:[a-z0-9][a-z0-9-]*)?$'; then
    check fail "name '$NAME' is not valid kebab-case (or prefix:kebab-case)"
else
    check ok "name: '$NAME' (${#NAME} chars)"
fi

# 5. description field: present, max 1024 chars, not multiline (no | after description:)
DESC_LINE=$(echo "$FRONTMATTER" | grep -E '^description:' | head -1 || true)
if [ -z "$DESC_LINE" ]; then
    check fail "description field missing in frontmatter"
else
    # Check for multiline indicator (| or > after description:)
    if echo "$DESC_LINE" | grep -qE '^description:[[:space:]]*[|>]'; then
        check fail "description uses multiline syntax (| or >) — must be single line"
    else
        DESC=$(echo "$DESC_LINE" | sed 's/^description:[[:space:]]*//' | tr -d '"' | tr -d "'")
        if [ ${#DESC} -gt 1024 ]; then
            check fail "description too long (${#DESC} chars, max 1024)"
        elif [ -z "$DESC" ]; then
            check fail "description is empty"
        else
            check ok "description: ${#DESC} chars"
        fi
    fi
fi

# 6. Body (content after frontmatter) is non-empty
BODY=$(sed -n '/^---$/,/^---$/!p' "$SKILL_FILE" 2>/dev/null | grep -v '^$' || true)
if [ -z "$BODY" ]; then
    check fail "Body content after frontmatter is empty"
else
    BODY_LINES=$(echo "$BODY" | wc -l | tr -d ' ')
    check ok "Body content present ($BODY_LINES non-empty lines)"
fi

# Summary
echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
