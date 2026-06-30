# Step 6 Output Template — skills create/improve detail

> **Instructions for orchestrator:**
> - This template is the SINGLE summary. It mirrors the canonical Step 6 output block
>   (`# skills [<mode>]` / `## Detection` / `## Result` / `## Status` / `## Next Steps`).
>   Do NOT emit a second report.
> - Fill all `{PLACEHOLDERS}` from collected data across phases.
> - Remove empty sub-tables (e.g., E2E Tests if Quick mode, Problems if none).
> - After generation, remove this instructions block entirely.

---

## Template

```markdown
# skills [{MODE}]

## Detection

| Field | Value |
|-------|-------|
| Input | {PROMPT or "(none -> menu)"} |
| Mode | {MODE} |
| Reason | {WHY_THIS_MODE} |
| Targets | {SKILL_NAME / SKILL_PATH} |

## Result

| Field | Value |
|-------|-------|
| Location | {SKILL_PATH} |
| Specialist | brewcode:skill-creator |
| Action | {ACTION} |
| Invocation | {INVOCATION_TYPE} |
| Testing Depth | {TESTING_DEPTH} |
| Review Type | {REVIEW_TYPE} |
| Model | {MODEL} |

Phases completed:
- [{DISCOVERY}] Discovery (Explore agents)
- [{INTERACTION}] User interaction (invocation, testing depth)
- [{CREATE}] {ACTION_VERB} (skill-creator)
- [{VALIDATE}] Validation (validate-skill.sh + checklists)
- [{UNIT}] Unit Tests (scripts/)
- [{README}] README generation
- [{REVIEW}] Review ({REVIEW_TYPE})
- [{E2E}] E2E Testing

## Status

### Problems Found and Fixed

| # | Source | Severity | Issue | Fix | Verified |
|---|--------|----------|-------|-----|----------|
| {N} | {PHASE_OR_AGENT} | {HIGH/MEDIUM/LOW} | {DESCRIPTION} | {WHAT_WAS_DONE} | {YES/NO} |

### Unit Tests

| Script | Tests | Passed | Failed |
|--------|-------|--------|--------|
| {SCRIPT_NAME} | {TOTAL} | {PASSED} | {FAILED} |

### E2E Tests

| Scenario | Mode | Variant | Status | Assertions | Details |
|----------|------|---------|--------|------------|---------|
| {SCENARIO} | {MODE} | {VARIANT} | {PASS/FAIL} | {COUNT} | {NOTES} |

## Next Steps

- Run `/docs "обнови документацию для brewcode:{SKILL_NAME}"` for any created/changed skill
- {SUGGESTION_1}
- Not done: {SKIPPED_ITEM} -- Reason: {WHY}
```
