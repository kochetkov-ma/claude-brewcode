# Mode: REVIEW

Multi-agent quorum review of E2E scenarios and tests.

## R0: Prerequisite Check

Check `.claude/agents/e2e-*.md` count. If <3 → "Run `/brewcode:e2e install` first." STOP.
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

For each part, spawn 3 e2e-reviewer agents in parallel via Task tool. One reviewer = ONE part
(~<=5 files); a part bigger than that is split in R3 first, and every part's reviewers go out in
ONE message.

```
Task(subagent_type="e2e-reviewer", prompt="
GOAL: this project's E2E suite is being audited before the user is asked to act on it; you are
      one of 3 independent votes on part {PART}, which is how we separate real defects from taste.
ROLE: you own the review of part {PART}. Read-only -- do NOT fix anything, do NOT review other
      parts, do NOT touch production code.
SCOPE: review assigned files {PART_FILES}. Out of bounds: every other file in the suite.
CONTEXT: load rules from {config.rulesPath} -- they are settled, judge against them and do not
      re-argue them. Check against ALL rule categories (S, D, I, A, R, P) and use the Review
      Question column from the rules as your checklist. 2 sibling reviewers see the exact same
      files right now and must not see your output -- review independently, do not hedge.
CONSUMER: findings are merged across the 3 of you and only what >=2 reviewers flag on the same
      file + same category counts as confirmed; confirmed ones then go to a different agent type
      for re-check. So name the file, the rule id and the category precisely, or your vote cannot
      be matched with theirs.
DONE: findings table with severity (critical/high/medium/low): file | rule id | category |
      severity | description | fix proposal.
")
```

**Quorum consensus (2/3):**

| Condition | Classification |
|-----------|---------------|
| 2 or 3 reviewers flag same file + same issue category | **Confirmed** finding |
| Only 1 reviewer flags | **Unconfirmed** finding (marked for re-check) |
| All 3 agree no issues in a file | **Clean** |

Merge findings across all 3 reviewers per part.

## R5: Cross-Agent Re-check

For confirmed findings only — one re-checker per part, all parts fanned out in ONE message:

```
Task(e2e-automation-tester OR e2e-scenario-analyst, prompt="
GOAL: a quorum review flagged issues in this project's E2E suite; before anyone is asked to fix
      them we need a second, different pair of eyes so we do not churn on false positives.
ROLE: you re-check the confirmed findings for part {PART}. Read-only -- do NOT fix anything, do
      NOT re-review files nobody flagged, do NOT add new findings outside the list.
SCOPE: the files named in the findings below. Out of bounds: the rest of the suite.
CONTEXT: 3 e2e-reviewer agents reviewed this part in parallel and 2/3 agreed on each finding
      below, so the rule reading is settled -- your job is whether it is real in this code.
      You are deliberately a different agent type than the reviewers (cross-domain verification).
      Rules: {config.rulesPath}. Confirmed findings: {FINDINGS}.
      Unconfirmed (single-reviewer) findings are NOT yours and are never auto-fixed.
CONSUMER: R6 puts your verdicts straight into the user-facing report and the user picks 'Fix
      confirmed issues' from it -- so each verdict needs a fix proposal concrete enough to spawn on.
DONE: verify each finding is real and actionable; you may downgrade severity or mark it a false
      positive. Report as: # | file | verdict (real/downgraded/false-positive) | severity | fix
      proposal.
")
```

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
