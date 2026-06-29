# E2E Test Scenario Template

Template for skill E2E tests executed via `claude -p` from bash.

---

## Scenario Structure

```markdown
# E2E: {SKILL_NAME} -- {MODE} -- {VARIANT}

## Setup
- Skill path: {SKILL_PATH}
- Mode: {MODE} (e.g., create, up, list)
- Variant: happy-path | edge-case | error-handling

## Prompt
> The exact prompt to send to claude -p

## Expected Behavior
- [ ] Skill triggers (slash command recognized)
- [ ] Expected files created/modified
- [ ] Expected output contains key phrases
- [ ] No errors in stderr

## Assertions
| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | File exists | `test -f path` | exit 0 |
| 2 | Content match | `grep -q "pattern" file` | exit 0 |
| 3 | Line count | `wc -l < file` | 10..500 |
| 4 | No errors | `! grep -qi "error" output.log` | exit 0 |
```

---

## Execution Methods

**Method A -- Isolated (preferred for CI):**

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.claude/skills"
cp -r "$SKILL_PATH" "$TMP/.claude/skills/"
cd "$TMP" && timeout 120 claude -p "{prompt}" 2>&1 | tee "$TMP/output.log"
EXIT_CODE=$?
# run assertions against $TMP/output.log and generated files
rm -rf "$TMP"
```

**Method B -- In-session (installed plugin):**

```bash
timeout 120 claude -p '/brewcode:skills create name="my-skill"' 2>&1 | tee output.log
```

**Capture and timeout:**

```bash
timeout 120 claude -p "..." 2>&1 | tee output.log
echo "EXIT: $?"
```

---

## Assertion Patterns

**File exists:**
```bash
test -f "$FILE" && echo "PASS" || echo "FAIL: $FILE not found"
```

**Content contains pattern:**
```bash
grep -q "$PATTERN" "$FILE" && echo "PASS" || echo "FAIL: pattern '$PATTERN' not in $FILE"
```

**Line count in range:**
```bash
lines=$(wc -l < "$FILE")
[ "$lines" -ge 10 ] && [ "$lines" -le 500 ] && echo "PASS" || echo "FAIL: $lines lines (expected 10..500)"
```

**YAML frontmatter present:**
```bash
head -1 "$FILE" | grep -q "^---" && echo "PASS" || echo "FAIL: no YAML frontmatter"
```

**No errors in output:**
```bash
! grep -qi "error\|fail\|exception" output.log && echo "PASS" || echo "FAIL: errors found in output"
```

**Exit code check:**
```bash
[ "$EXIT_CODE" -eq 0 ] && echo "PASS" || echo "FAIL: exit code $EXIT_CODE"
```

**Aggregate result:**
```bash
RESULTS="$TMP/results.txt"
# ... each assertion appends PASS/FAIL to $RESULTS ...
FAILS=$(grep -c "FAIL" "$RESULTS")
echo "Total: $(wc -l < "$RESULTS") | Failed: $FAILS"
[ "$FAILS" -eq 0 ] && echo "E2E PASSED" || echo "E2E FAILED"
```

---

## Iteration Rules

| Rule | Action |
|------|--------|
| Scenario fails | Fix scenario first (not skill) unless skill is clearly broken |
| Max retries | 2 retry cycles per scenario |
| Small skill fix | Fix skill -> re-run E2E immediately |
| Major skill issue | Return to Phase 2 (full improvement cycle) |
| Flaky result | Add `sleep 2` or increase timeout, retry once before marking FAIL |
