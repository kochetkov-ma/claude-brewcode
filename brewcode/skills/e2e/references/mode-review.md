# Mode: REVIEW

Multi-agent quorum review of E2E scenarios and tests.

## R0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 → "Run `/brewcode:e2e setup` first." STOP.
Read `.claude/e2e/config.json` for stack, framework, paths.

## R1: Scope Definition

If PROMPT is non-empty → use as review filter (e.g., "only auth tests", "focus on assertion quality").
If PROMPT is empty → AskUserQuestion: "What to review?"
  Options: "All scenarios + tests" / "Only scenarios" / "Only tests" / "Specific domain: ___"

## R2: Artifact Scan

1. Scan `{config.scenarioDir}/` for scenarios
2. Scan `{config.testSourceDir}/` for E2E tests
3. If no artifacts found → "No E2E artifacts found. Run `/brewcode:e2e create` first." STOP.

## R3: Scope Splitting

Split review scope into parts by test file or scenario group.
Each part should be reviewable independently.

| Part | Files | Type |
|------|-------|------|
| 1 | auth scenarios + tests | domain |
| 2 | payment scenarios + tests | domain |
| ... | ... | ... |

## R4: Quorum Review (3x reviewer per part)

For each part, spawn 3 e2e-reviewer agents in parallel via Task tool:

```
Per reviewer prompt:
- Load rules from {config.rulesPath}
- Review assigned files
- Check against ALL rule categories (S, D, I, A, R, P)
- Use Review Question column from rules as checklist
- Output: findings table with severity (critical/high/medium/low)
```

**Quorum consensus (2/3):**

| Condition | Classification |
|-----------|---------------|
| 2 or 3 reviewers flag same file + same issue category | **Confirmed** finding |
| Only 1 reviewer flags | **Unconfirmed** finding (marked for re-check) |
| All 3 agree no issues in a file | **Clean** |

Merge findings across all 3 reviewers per part.

## R5: Cross-Agent Re-check

For confirmed findings only:
- Task(e2e-automation-tester OR e2e-scenario-analyst): re-check confirmed findings
  - Different agent type than reviewer = cross-domain verification
  - Verify each finding is real and actionable
  - May downgrade severity or mark as false positive

For unconfirmed findings:
- Include in report as "unconfirmed — single reviewer"
- Do NOT auto-fix unconfirmed findings

## R6: Results Report

AskUserQuestion with full results:

### Review Summary

| Metric | Value |
|--------|-------|
| Parts reviewed | {N} |
| Total findings | {N} |
| Confirmed | {N} |
| Unconfirmed | {N} |
| False positives | {N} |

### Confirmed Findings

| # | File | Category | Severity | Description | Fix Proposal |
|---|------|----------|----------|-------------|--------------|

### Unconfirmed Findings

| # | File | Category | Severity | Description | Reviewer |
|---|------|----------|----------|-------------|----------|

### Traceability Check

| Scenario | Status | Test Count | Gap? |
|----------|--------|------------|------|

Options:
- "Fix confirmed issues" → spawn appropriate agents to fix, then re-review fixed files only
- "Export report" → write to `.claude/e2e/reports/{date}_review.md`
- "Done" → end
