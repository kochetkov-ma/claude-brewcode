# Summary Report Template for Skills Orchestrator (Phase 6)

> **Instructions for orchestrator:**
> - Fill all `{PLACEHOLDERS}` from collected data across phases
> - Remove empty sections (e.g., E2E Tests if Quick mode, Review if None)
> - Checkboxes reflect actual phase completion: `[x]` done, `[ ]` skipped
> - Problems table only includes confirmed and verified findings
> - After generation, remove this instructions block entirely

---

## Template

```markdown
# Skill {ACTION}: {SKILL_NAME}

| Field | Value |
|-------|-------|
| Location | {SKILL_PATH} |
| Action | {ACTION} |
| Invocation | {INVOCATION_TYPE} |
| Testing Depth | {TESTING_DEPTH} |
| Review Type | {REVIEW_TYPE} |
| Model | {MODEL} |

## What Was Done

- [{DISCOVERY}] Discovery (Explore agents)
- [{INTERACTION}] User interaction (invocation, testing depth)
- [{CREATE}] {ACTION_VERB} (skill-creator)
- [{VALIDATE}] Validation (validate-skill.sh + checklists)
- [{UNIT}] Unit Tests (scripts/)
- [{README}] README generation
- [{REVIEW}] Review ({REVIEW_TYPE})
- [{E2E}] E2E Testing

## Problems Found and Fixed

| # | Source | Severity | Issue | Fix | Verified |
|---|--------|----------|-------|-----|----------|
| {N} | {PHASE_OR_AGENT} | {HIGH/MEDIUM/LOW} | {DESCRIPTION} | {WHAT_WAS_DONE} | {YES/NO} |

## Test Results

### Unit Tests

| Script | Tests | Passed | Failed |
|--------|-------|--------|--------|
| {SCRIPT_NAME} | {TOTAL} | {PASSED} | {FAILED} |

### E2E Tests

| Scenario | Mode | Variant | Status | Assertions | Details |
|----------|------|---------|--------|------------|---------|
| {SCENARIO} | {MODE} | {VARIANT} | {PASS/FAIL} | {COUNT} | {NOTES} |

## What Could Be Improved

- {SUGGESTION_1}
- {SUGGESTION_2}

## What Was NOT Done

- {SKIPPED_ITEM} -- Reason: {WHY}
```
