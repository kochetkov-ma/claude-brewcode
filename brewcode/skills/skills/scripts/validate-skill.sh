#!/bin/sh
# validate-skill.sh <skill-dir> — validate a Claude Code skill directory.
# Exit: 0 = all checks pass (warnings allowed), 1 = any check fails.
set -eu

SKILL_DIR="${1:-}"
if [ -z "$SKILL_DIR" ]; then
    echo "Usage: validate-skill.sh <skill-dir>"
    exit 1
fi

# Exemptions (prompt-contract.md section 5). EXEMPT_KIND=reference: pure reference skill, skips 8-10.
# EXEMPT_KIND=standalone: marketplace-root skills/<name> or openclaw/<name>, outside any plugin, skips 7-10.
EXEMPT_KIND=""
is_exempt_skill() {
    case "$1" in
        */.claude/skills/claude-plugin-guide) EXEMPT_KIND=reference; return 0 ;;
    esac
    _gp=$(dirname "$(dirname "$1")")
    case "$(basename "$(dirname "$1")")" in skills|openclaw) ;; *) return 1 ;; esac
    if [ -f "$_gp/.claude-plugin/marketplace.json" ] \
        && [ ! -f "$_gp/.claude-plugin/plugin.json" ]; then
        EXEMPT_KIND=standalone; return 0
    fi
    return 1
}

PASS=0
FAIL=0
WARN=0

check() {
    if [ "$1" = "ok" ]; then
        PASS=$((PASS + 1))
        echo "✅ $2"
    else
        FAIL=$((FAIL + 1))
        echo "❌ $2"
    fi
}

# Additive, non-fatal: a row here never fails the check — it flags something worth a human glance.
warn() {
    WARN=$((WARN + 1))
    echo "⚠️  $1"
}

# 1. No lowercase skill.md (glob yields the on-disk name: exact case on a case-insensitive FS)
LOWER_SKILL=0
for ENTRY in "$SKILL_DIR"/*; do
    if [ "${ENTRY##*/}" = "skill.md" ]; then LOWER_SKILL=1; fi
done
if [ "$LOWER_SKILL" -eq 1 ]; then
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

# CC reads frontmatter only when the opening --- is line 1; else the whole file is skill content.
if [ "$(head -n 1 "$SKILL_FILE" | tr -d '\r')" = "---" ]; then
    check ok "Opening --- is line 1"
else
    check fail "Opening --- must be line 1 of SKILL.md (else CC drops all frontmatter fields)"
fi

# Frontmatter = the lines between the FIRST two --- delimiters, by line number: a sed range
# (`/^---$/,/^---$/`) reopens on every `---` divider in the body and pulls body text in.
FM_CLOSE=$(grep -n '^---$' "$SKILL_FILE" 2>/dev/null | sed -n '2s/:.*//p')
if [ -n "${FM_CLOSE:-}" ] && [ "$FM_CLOSE" -gt 1 ] 2>/dev/null; then
    FRONTMATTER=$(sed -n "2,$((FM_CLOSE - 1))p" "$SKILL_FILE" 2>/dev/null || true)
else
    FRONTMATTER=""
fi

# 4. name: bare kebab-case (spec: no leading/trailing/double hyphen), <=64 chars, == dir name. House
# rule: one spelling, no `plugin:` prefix (Claude Code adds it; 2.1.216-2.1.245 doubled a baked one).
NAME=$(echo "$FRONTMATTER" | grep -E '^name:' | head -1 | sed 's/^name:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
DIR_NAME=$(basename "$(cd "$SKILL_DIR" 2>/dev/null && pwd || echo "$SKILL_DIR")")
if [ -z "$NAME" ]; then
    check fail "name field missing in frontmatter"
elif [ ${#NAME} -gt 64 ]; then
    check fail "name too long (${#NAME} chars, max 64)"
elif echo "$NAME" | grep -qE '^[a-z0-9][a-z0-9-]*:'; then
    check fail "name '$NAME' carries a plugin prefix — Claude Code adds it, use bare '${NAME#*:}'"
elif ! printf '%s\n' "$NAME" | LC_ALL=C grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$'; then
    check fail "name '$NAME' is not valid kebab-case (a-z/0-9 words joined by single hyphens)"
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
            # CC tolerates it; strict YAML consumers (claude.ai upload, Skills API) reject `: ` / ` #` in a plain scalar.
            case "$DESC_LINE" in
                "description: \""*|"description: '"*) ;;
                *) if printf '%s\n' "${DESC_LINE#description:}" | grep -qE ': | #'; then
                    warn "description is unquoted and holds ': ' or ' #' -- strict YAML parsers reject it, quote it"
                fi ;;
            esac
        fi
    fi
fi

# 6. Body (content after frontmatter) is non-empty.
# Everything AFTER the frontmatter's closing `---` (FM_CLOSE, computed above).
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

# 7. argument-hint present and prompt-first (contract section 1). Applies even to reference-
# exempt skills: a reference skill still accepts [prompt] in position 1.
ARG_HINT=$(echo "$FRONTMATTER" | grep -E '^argument-hint:' | head -1 | sed 's/^argument-hint:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
if [ "$EXEMPT_KIND" = "standalone" ]; then
    check ok "argument-hint exempt (standalone root skill): $ABS_SKILL_DIR"
elif [ -z "$ARG_HINT" ]; then
    check fail "argument-hint missing in frontmatter — prompt contract requires a prompt-first hint (section 1)"
else
    case "$ARG_HINT" in
        '[prompt]'*) check ok "argument-hint is prompt-first: '$ARG_HINT'" ;;
        *) check fail "argument-hint '$ARG_HINT' does not start with [prompt] (prompt contract section 1)" ;;
    esac
fi

# 8. body contains the "## Prompt contract" section (prompt-contract.md, Canonical section)
if [ "$EXEMPT" -eq 1 ]; then
    check ok "## Prompt contract section exempt ($EXEMPT_KIND): $ABS_SKILL_DIR"
elif echo "$BODY" | grep -q '^## Prompt contract'; then
    check ok "## Prompt contract section present"
else
    check fail "## Prompt contract section missing (prompt-contract.md, Canonical section)"
fi

# 9. PLAN block with all five labels (contract section 4)
if [ "$EXEMPT" -eq 1 ]; then
    check ok "PLAN block exempt ($EXEMPT_KIND): $ABS_SKILL_DIR"
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
    check ok "Mode table exempt ($EXEMPT_KIND): $ABS_SKILL_DIR"
else
    # Anchor: a header row carrying BOTH "keyword" and "mutates" (mode+keyword hits prose rows, a literal
    # "mode" rejects Verb|Action|Flow|Input). Searched in SKILL.md and the skill's own references/*.md.
    set -- "$SKILL_FILE"
    for REF in "$SKILL_DIR"/references/*.md; do
        if [ -f "$REF" ]; then set -- "$@" "$REF"; fi
    done
    MODE_TABLE=$(awk '
        s==1 { if ($0 !~ /^\|/) { s=0; next }; print; next }
        /^\|/ && tolower($0) ~ /keyword/ && tolower($0) ~ /mutates/ { s=1; print }
    ' "$@" 2>/dev/null)
    # Modes declared in the hint make the table mandatory. Only real mode alternation counts:
    # `<...>` groups are targets and `[-x|--yy]` groups are flags (contract section 3.1).
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
            CYR_OK=0; CYR_RC=0
            # Cyrillic U+0400-04FF as raw UTF-8 bytes under LC_ALL=C: GNU grep in C.UTF-8 rejects `[а-я]` (rc 2)
            CYR_RE=$(printf '[\320-\323][\200-\277]')
            printf '%s\n' "$MODE_TABLE" | LC_ALL=C grep -qE "$CYR_RE" || CYR_RC=$?
            [ "$CYR_RC" -eq 0 ] && CYR_OK=1
            if [ "$CYR_RC" -gt 1 ]; then
                check fail "Mode table: Cyrillic check could not run (grep rc=$CYR_RC)"
            elif [ "$MUTATES_OK" -eq 1 ] && [ "$CYR_OK" -eq 1 ]; then
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

# 11. Unknown top-level frontmatter key -> warning, never fail. Allow-list = the 20 native fields
# (brewcode/skills/skills/references/frontmatter-fields.md) + house keys (`cli`/`version`: skills/SKILL.md).
ALLOWED_KEYS="name description when_to_use disable-model-invocation user-invocable arguments \
argument-hint allowed-tools disallowed-tools model effort context background agent hooks paths \
shell metadata license compatibility cli version content_version generated_by last_updated \
doc_type surface_files"
FM_KEYS=$(echo "$FRONTMATTER" | grep -E '^[a-zA-Z_-]+:' | sed -E 's/^([a-zA-Z_-]+):.*/\1/' | sort -u || true)
UNKNOWN_KEYS=""
for k in $FM_KEYS; do
    case " $ALLOWED_KEYS " in
        *" $k "*) ;;
        *) UNKNOWN_KEYS="$UNKNOWN_KEYS $k" ;;
    esac
done
if [ -n "$UNKNOWN_KEYS" ]; then
    warn "Unknown frontmatter key(s):$UNKNOWN_KEYS -- not in the 20 native fields or house custom keys (see references/frontmatter-fields.md); verify before shipping, or use metadata: for free-form data"
else
    check ok "All frontmatter keys recognized"
fi

# 12. Bare top-level 'once:' — a suboption of a hook entry (hooks.<Event>[].hooks[].once), never a
# sibling of name/description. Fatal: this shape never worked.
if echo "$FRONTMATTER" | grep -qE '^once:'; then
    check fail "'once' found as a top-level frontmatter field -- it is a suboption of a hook entry (hooks.<Event>[].hooks[].once), not a sibling of name/description"
else
    check ok "No top-level 'once' field"
fi

# 13. agent: value outside the confirmed built-ins -> warning, not fail: a custom agent is legitimate
# and the frontmatter alone cannot tell it from a nonexistent built-in (developer/tester/reviewer).
AGENT_VAL=$(echo "$FRONTMATTER" | grep -E '^agent:' | head -1 | sed 's/^agent:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
if [ -n "$AGENT_VAL" ]; then
    case "$AGENT_VAL" in
        Explore|Plan|general-purpose) check ok "agent: '$AGENT_VAL' is a built-in SA type" ;;
        *) warn "agent: '$AGENT_VAL' is not one of the confirmed built-ins (Explore, Plan, general-purpose) -- fine only if '$AGENT_VAL' is a real custom agent under .claude/agents/ or ~/.claude/agents/" ;;
    esac
fi

# 14. UTF-8 BOM at file start. Files starting with a BOM were silently ignored by CC before
# 2.1.239; flag regardless of CC version so authoring stays clean.
BOM=$(head -c 3 "$SKILL_FILE" 2>/dev/null | od -An -tx1 | tr -d ' \n' || true)
if [ "$BOM" = "efbbbf" ]; then
    check fail "UTF-8 BOM detected at file start -- strip it (files starting with a BOM were silently ignored by CC before 2.1.239; keep authoring clean regardless)"
else
    check ok "No UTF-8 BOM"
fi

# 15. `$<digit>` in the body is replaced at load (0-based, fences included) once enough arguments
# are passed. Skipped as safe: `\$1`, `${1}`, `$(1)`, and `$1x` (a word character follows).
DOLLAR_N=$(awk -v s="${FM_CLOSE:-0}" 'NR > s && /(^|[^\\])\$[0-9]+([^A-Za-z0-9_]|$)/ { printf "%s%d", (n++ ? "," : ""), NR }' "$SKILL_FILE" 2>/dev/null || true)
if [ -n "$DOLLAR_N" ]; then
    check fail "Positional \$N at line(s) $DOLLAR_N is substituted at load -- write shell \${1}, awk \$(1), prose \\\$1"
else
    check ok "No bare positional \$N in the body"
fi

# 16. Plugin root: only the exact `${CLAUDE_PLUGIN_ROOT}` is substituted at load. The unbraced and
# `${CLAUDE_PLUGIN_ROOT:-x}` forms reach the shell verbatim, where the variable is unset.
ROOT_FORM=$(awk -v s="${FM_CLOSE:-0}" 'NR > s && /\$CLAUDE_PLUGIN_ROOT|\$\{CLAUDE_PLUGIN_ROOT[^}]/ { printf "%s%d", (n++ ? "," : ""), NR }' "$SKILL_FILE" 2>/dev/null || true)
if [ -n "$ROOT_FORM" ]; then
    check fail "Plugin root at line(s) $ROOT_FORM is not the exact \${CLAUDE_PLUGIN_ROOT} -- never substituted, unset in the Bash tool"
else
    check ok "Plugin root spelled \${CLAUDE_PLUGIN_ROOT} or absent"
fi

# 17. context: `fork` is the only documented value.
CONTEXT_VAL=$(echo "$FRONTMATTER" | grep -E '^context:' | head -1 | sed 's/^context:[[:space:]]*//' | tr -d '"' | tr -d "'" || true)
if [ -n "$CONTEXT_VAL" ] && [ "$CONTEXT_VAL" != "fork" ]; then
    check fail "context: '$CONTEXT_VAL' is not a documented value -- only 'fork' is"
fi

# 18. Length: upstream recommends SKILL.md under 500 lines, detail in references/.
TOTAL_LINES=$(wc -l < "$SKILL_FILE" | tr -d ' ')
if [ "$TOTAL_LINES" -gt 500 ]; then
    warn "SKILL.md is $TOTAL_LINES lines (recommended: under 500) -- move on-demand detail to references/"
fi

# 19-23: one fence-aware body scan; emits "<id> <line>". Load-time substitution hits fences and prose
# alike: `$ARGUMENTS` (any suffix; `\$ARGUMENTS` renders literal) and the exact braced CLAUDE_* tokens.
PLUGIN_SKILL=0
[ -f "$(dirname "$(dirname "$ABS_SKILL_DIR")")/.claude-plugin/plugin.json" ] && PLUGIN_SKILL=1
SCAN=$(awk -v s="${FM_CLOSE:-0}" -v q="'" -v ex="$EXEMPT_KIND" -v plug="$PLUGIN_SKILL" '
function hit(id) { print id, NR }
function quotescan(str,   i, c, n) {
    n = length(str)
    for (i = 1; i <= n; i++) {
        c = substr(str, i, 1)
        if (sq) { if (c == q) sq = 0; else if (substr(str, i, 21) == "${CLAUDE_PROJECT_DIR}") hit("22"); continue }
        if (c == "\\") { i++; continue }
        if (c == "\"") dq = !dq
        else if (c == q && !dq) sq = 1
        else if (c == "#" && !dq && (i == 1 || substr(str, i - 1, 1) ~ /[ \t]/)) return
    }
}
function nodescan(str, i,   c, n) {
    while (i <= length(str)) {
        c = substr(str, i, 1)
        if (c == "\\") { i += 2; continue }
        if (c == "`") { hit("21"); return 0 }
        if (c == "\"") { n = substr(str, i + 1, 1); if (n != "" && n !~ /[ \t;|&)<>]/) hit("21"); return 0 }
        i++
    }
    return 1
}
NR <= s { next }
{
    line = $0; t = line; sub(/^[ \t]*(> ?)*/, "", t)
    if (!inf && match(t, /^(```+|~~~+)/)) {
        inf = 1; fl = RLENGTH; fc = substr(t, 1, 1); lang = substr(t, fl + 1); sub(/[ \t].*$/, "", lang)
        sh = (lang == "bash" || lang == "sh" || lang == "shell" || lang == "zsh")
        lit = (lang ~ /^(json|jsonc|js|javascript|mjs|ts|yaml|yml|toml)$/)
        innode = 0; prev = ""; sq = 0; dq = 0; hd = ""; next
    }
    if (inf && match(t, /^(```+|~~~+)[ \t]*$/) && substr(t, 1, 1) == fc && RLENGTH >= fl) { inf = 0; next }
    args = (line ~ /(^|[^\\])\$ARGUMENTS/)
    if (inf) {
        if (lit && index(line, "${CLAUDE_PROJECT_DIR}")) hit("22")
        if (sh) {
            if (hd != "") {
                tt = t; sub(/[ \t]+$/, "", tt); if (tt == hd) hd = ""
                else if (hdq && index(line, "${CLAUDE_PROJECT_DIR}")) hit("22")
            } else {
                quotescan(line)
                if (match(line, /<<-?[ \t]*["\\\047]?[A-Za-z_][A-Za-z0-9_]*/) && substr(line, RSTART - 1, 1) != "<") {
                    hd = substr(line, RSTART, RLENGTH); hdq = (hd ~ /["\\\047]/)
                    sub(/^<<-?[ \t]*["\\\047]?/, "", hd)
                }
            }
            if (want_term) { if (t !~ /^__SKILL_ARGS__[ \t]*$/) hit("19"); want_term = 0 }
            if (args) {
                op = "<<" q "__SKILL_ARGS__" q
                if (t ~ /^\$ARGUMENTS[ \t]*$/ && index(prev, op) && prev !~ /\$\(|`/) want_term = 1
                else hit("19")
            }
            if (innode) innode = nodescan(line, 1)
            else if (match(line, /(^|[^A-Za-z0-9_.\/-])node[ \t]+(-[-A-Za-z0-9=]+[ \t]+)*(-e|-p|--eval|--print)[ \t]+"/))
                innode = nodescan(line, RSTART + RLENGTH)
            prev = line
        } else if (args) hit("20")
        next
    }
    if (line ~ /^## Prompt contract/) { want_slot = 1; next }
    if (args) {
        if (want_slot && line ~ /[^ \t]/ && !slot_used) slot_used = 1
        else if (ex != "" && !free_used) free_used = 1
        else hit("20")
    }
    if (want_slot && line ~ /[^ \t]/) want_slot = 0
    r = line
    while (match(r, /\$\{CLAUDE_(PLUGIN_ROOT|PLUGIN_DATA|SKILL_DIR|PROJECT_DIR|SESSION_ID|EFFORT)\}/)) {
        tok = substr(r, RSTART, RLENGTH)
        if (substr(r, RSTART + RLENGTH, 1) != "/" && (plug || tok !~ /PLUGIN/)) { hit("23"); break }
        r = substr(r, RSTART + RLENGTH)
    }
}' "$SKILL_FILE" 2>/dev/null || true)
scan_lines() { echo "$SCAN" | awk -v id="$1" '$1 == id { printf "%s%s", (n++ ? "," : ""), $2 }'; }

# 19. `$ARGUMENTS` in a shell fence: only a line of its own inside a quoted `__SKILL_ARGS__` heredoc
# that is not inside `$(...)` (bash 3.2 mis-parses a quote or paren of the prompt there).
L=$(scan_lines 19)
if [ -n "$L" ]; then
    check fail "\$ARGUMENTS in a shell fence at line(s) $L outside the canonical form -- IFS= read -r -d '' ARGS <<'__SKILL_ARGS__' || true / \$ARGUMENTS / __SKILL_ARGS__ (prompt-contract.md)"
else
    check ok "\$ARGUMENTS in shell fences only via the canonical heredoc (or absent)"
fi

# 20. `$ARGUMENTS` elsewhere: each occurrence pastes the raw prompt at load. One slot only: the first
# line under `## Prompt contract` (exempt skills: their first occurrence). Elsewhere say "the prompt".
L=$(scan_lines 20)
if [ -n "$L" ]; then
    check fail "\$ARGUMENTS at line(s) $L outside the one canonical slot -- substituted with the raw prompt at load; write 'the prompt', or \\\$ARGUMENTS to name it"
else
    check ok "\$ARGUMENTS in prose only at the canonical slot"
fi

# 21. `node -e "..."`: a `"` inside the program ends the shell string (`bash -n` still passes);
# a backtick runs as command substitution. Use single quotes inside the program, or a script file.
L=$(scan_lines 21)
if [ -n "$L" ]; then
    check fail "node -e \"...\" program cut by a double quote or backtick at line(s) $L"
else
    check ok "No node -e \"...\" program cut by a quote"
fi

# 22. Braced project-dir token where a literal is meant (shell single quotes, quoted heredoc, JSON/JS/
# YAML fence) is baked to an absolute path at load. Use \$CLAUDE_PROJECT_DIR or split the literal.
L=$(scan_lines 22)
if [ -n "$L" ]; then
    check fail "\${CLAUDE_PROJECT_DIR} meant as a literal at line(s) $L is baked to a path at load"
else
    check ok "No braced CLAUDE_PROJECT_DIR token meant as a literal"
fi

# 23. Warning: a braced CLAUDE_* token in prose with no `/` after it is substituted at load (path or value); fine
# for a location, wrong when it names the variable or a literal to write (drop the dollar-brace).
L=$(scan_lines 23)
if [ -n "$L" ]; then
    warn "Braced CLAUDE_* token in prose at line(s) $L is substituted at load (path or value) -- if it names the variable or a literal to write, drop the dollar-brace"
else
    check ok "No braced CLAUDE_* token named in prose"
fi

# Summary
echo ""
echo "=== Result: $PASS passed, $FAIL failed, $WARN warned ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
