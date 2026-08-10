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

# Section 5 exemption list (prompt-contract.md) — pure reference/lookup skills with no
# modes and no writes skip the prompt-contract body checks (8-10) but still need
# argument-hint (check 7). Match on the resolved absolute skill dir path; add one
# `*/path/suffix)` arm per new exemption.
is_exempt_skill() {
    case "$1" in
        */.claude/skills/claude-plugin-guide) return 0 ;;
        *) return 1 ;;
    esac
}

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
# `|| true`, not `|| echo 0`: grep -c already prints 0 on no-match, it just exits 1
FM_COUNT=$(grep -c '^---$' "$SKILL_FILE" 2>/dev/null || true); FM_COUNT=${FM_COUNT:-0}
if [ "$FM_COUNT" -ge 2 ]; then
    check ok "Frontmatter has opening and closing --- delimiters"
else
    check fail "Frontmatter missing --- delimiters (found $FM_COUNT, need 2+)"
fi

# Extract frontmatter block (between first two --- lines)
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$SKILL_FILE" 2>/dev/null || true)

# 4. name field: present, bare kebab-case, max 64 chars, equal to the directory name.
# A `plugin:` prefix here is a defect: Claude Code prepends the plugin name itself, so
# `name: brewcode:e2e` in brewcode/skills/e2e renders as `/brewcode:brewcode:e2e`.
NAME=$(echo "$FRONTMATTER" | grep -E '^name:' | head -1 | sed 's/^name:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
DIR_NAME=$(basename "$(cd "$SKILL_DIR" 2>/dev/null && pwd || echo "$SKILL_DIR")")
if [ -z "$NAME" ]; then
    check fail "name field missing in frontmatter"
elif [ ${#NAME} -gt 64 ]; then
    check fail "name too long (${#NAME} chars, max 64)"
elif echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9-]*:'; then
    check fail "name '$NAME' carries a plugin prefix — Claude Code adds it, use bare '${NAME#*:}'"
elif ! echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9-]*$'; then
    check fail "name '$NAME' is not valid kebab-case"
elif [ "$NAME" != "$DIR_NAME" ]; then
    check fail "name '$NAME' does not match directory '$DIR_NAME'"
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

# 6. Body (content after frontmatter) is non-empty.
# Everything AFTER the frontmatter's closing `---`. A range-negation sed (`/^---$/,/^---$/!p`)
# pairs later `---` lines with each other and silently drops whole body chunks — several skills
# use `---` as a horizontal rule, and checks 8-10 then read a mutilated body.
FM_CLOSE=$(grep -n '^---$' "$SKILL_FILE" 2>/dev/null | sed -n '2s/:.*//p')
BODY=$(tail -n +"$((${FM_CLOSE:-0} + 1))" "$SKILL_FILE" 2>/dev/null | grep -v '^$' || true)
if [ -z "$BODY" ]; then
    check fail "Body content after frontmatter is empty"
else
    BODY_LINES=$(echo "$BODY" | wc -l | tr -d ' ')
    check ok "Body content present ($BODY_LINES non-empty lines)"
fi

# Resolve absolute skill dir path once, for the exemption check below
ABS_SKILL_DIR=$(cd "$SKILL_DIR" 2>/dev/null && pwd || echo "$SKILL_DIR")
if is_exempt_skill "$ABS_SKILL_DIR"; then
    EXEMPT=1
else
    EXEMPT=0
fi

# 7. argument-hint present and prompt-first (contract section 1). Applies even to
# exempt skills — a reference skill still accepts [prompt] in position 1.
ARG_HINT=$(echo "$FRONTMATTER" | grep -E '^argument-hint:' | head -1 | sed 's/^argument-hint:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
if [ -z "$ARG_HINT" ]; then
    check fail "argument-hint missing in frontmatter — prompt contract requires a prompt-first hint (section 1)"
else
    case "$ARG_HINT" in
        '[prompt]'*) check ok "argument-hint is prompt-first: '$ARG_HINT'" ;;
        *) check fail "argument-hint '$ARG_HINT' does not start with [prompt] (prompt contract section 1)" ;;
    esac
fi

# 8. body contains the "## Prompt contract" section (contract section 6 boilerplate)
if [ "$EXEMPT" -eq 1 ]; then
    check ok "## Prompt contract section exempt (section 5 list): $ABS_SKILL_DIR"
elif echo "$BODY" | grep -q '^## Prompt contract'; then
    check ok "## Prompt contract section present"
else
    check fail "## Prompt contract section missing (prompt-contract.md section 6 boilerplate)"
fi

# 9. PLAN block with all five labels (contract section 4)
if [ "$EXEMPT" -eq 1 ]; then
    check ok "PLAN block exempt (section 5 list): $ABS_SKILL_DIR"
else
    MISSING_LABELS=""
    for LABEL in "INPUT:" "MODE:" "SCOPE:" "DO:" "RESULT:"; do
        echo "$BODY" | grep -q "$LABEL" || MISSING_LABELS="$MISSING_LABELS $LABEL"
    done
    if echo "$BODY" | grep -qE '^PLAN( |$)' && [ -z "$MISSING_LABELS" ]; then
        check ok "PLAN block present with all 5 labels"
    else
        [ -z "$MISSING_LABELS" ] || MISSING_LABELS=" missing:$MISSING_LABELS"
        check fail "PLAN block incomplete (no 'PLAN' header line,$MISSING_LABELS)"
    fi
fi

# 10. Mode keyword table: when the skill declares 2+ modes, the table needs a
# Mutates? column and at least one Cyrillic (RU) keyword (contract section 2).
if [ "$EXEMPT" -eq 1 ]; then
    check ok "Mode table exempt (section 5 list): $ABS_SKILL_DIR"
else
    # Anchor on a header row carrying BOTH "keyword" and "mutates". Anchoring on
    # mode+keyword instead false-positives on ordinary prose rows (ssh's "keyword matching is
    # simple" row) and then audits the wrong table; requiring the literal word "mode" in the
    # header rejects the legitimate `Verb|Action|Flow|Input` first columns already in use.
    # The table may live in SKILL.md or in one of the skill's own references/*.md (semble-setup
    # keeps its routing table in references/intent-routing.md by design).
    MODE_TABLE=$(awk '
        s==1 { if ($0 !~ /^\|/) { s=0; next }; print; next }
        /^\|/ && tolower($0) ~ /keyword/ && tolower($0) ~ /mutates/ { s=1; print }
    ' "$SKILL_FILE" $(ls "$SKILL_DIR"/references/*.md 2>/dev/null) 2>/dev/null)
    # Modes declared in the hint make the table mandatory — a skill that simply omits it must not
    # pass by being undetectable. Only real mode alternation counts: `<...>` groups are targets
    # and `[-x|--yy]` groups are flags, neither is a mode (contract section 3.1).
    HINT_MODES=0
    # Two flag-strip passes: `[-q|--quorum [G-]N-M]` nests, and the inner group must go first.
    # The last pass drops bracket groups left holding no alphanumerics (`[<a>|<b>]` -> `[|]`).
    HINT_STRIPPED=$(echo "$ARG_HINT" | sed -e 's/\[prompt\]//g' -e 's/<[^>]*>//g' \
        -e 's/\[[^][]*-[^][]*\]//g' -e 's/\[[^][]*-[^][]*\]//g' -e 's/\[[^][a-zA-Z0-9]*\]//g')
    echo "$HINT_STRIPPED" | grep -q '|' && HINT_MODES=1
    if [ -z "$MODE_TABLE" ] && [ "$HINT_MODES" -eq 1 ]; then
        check fail "Mode keyword table missing — hint declares modes, so a Mode|EN|RU|Mutates? table is required (prompt-contract.md section 2)"
    elif [ -z "$MODE_TABLE" ]; then
        check ok "No mode keyword table detected (single-mode or reference skill)"
    else
        HEADER_LINE=$(echo "$MODE_TABLE" | head -1)
        DATA_ROWS=$(echo "$MODE_TABLE" | tail -n +2 | grep -Ev '^[|: -]+$' | grep -c '^|' || true)
        DATA_ROWS=${DATA_ROWS:-0}
        if [ "$DATA_ROWS" -lt 2 ]; then
            check ok "Mode table has <2 modes ($DATA_ROWS) — Mutates?/RU check not required"
        else
            MUTATES_OK=0
            echo "$HEADER_LINE" | grep -qi 'mutates' && MUTATES_OK=1
            CYR_OK=0
            # Cyrillic bracket range needs a UTF-8 locale; fall back to LANG, then en_US.UTF-8
            CYR_LOCALE="${LC_ALL:-${LANG:-en_US.UTF-8}}"
            echo "$MODE_TABLE" | LC_ALL="$CYR_LOCALE" grep -qE '[а-яёА-ЯЁ]' 2>/dev/null && CYR_OK=1
            if [ "$MUTATES_OK" -eq 1 ] && [ "$CYR_OK" -eq 1 ]; then
                check ok "Mode table ($DATA_ROWS modes) has Mutates? column + RU keyword"
            else
                MSG=""
                [ "$MUTATES_OK" -eq 0 ] && MSG="missing Mutates? column"
                [ "$CYR_OK" -eq 0 ] && MSG="$MSG${MSG:+; }missing Cyrillic (RU) keyword"
                check fail "Mode table ($DATA_ROWS modes): $MSG"
            fi
        fi
    fi
fi

# Summary
echo ""
echo "=== Result: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
