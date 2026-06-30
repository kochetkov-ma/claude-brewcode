# Merged Report Layout (superreview Phase 4 — {PROJECT_NAME})

Output: `.claude/reports/{TIMESTAMP}_superreview/REPORT.md`. ONE consolidated, validated, P0->P3-sorted report.

```markdown
# Super Review Report — {PROJECT_NAME}

**Generated:** {TIMESTAMP}
**Mode:** {MODE}  (branch: {BRANCH})
**Scope:** {concrete scope — commit range | branch-vs-main | folder | working-tree vs HEAD | full project}
**Focus:** {resolved focus — user directive, else default ordering; security only if P0}
**Files Reviewed:** {COUNT}
**Search tool used:** {grepai | Grep/Glob/Bash fallback}
**Agents run (targeted fan-out):** {AGENT_LIST}

> Findings section below is MANDATORY-sorted by priority P0 -> P3 (highest severity first).

## Summary Severity Matrix

| Priority | Meaning | Count |
|----------|---------|-------|
| P0 | Architecture blockers + CRITICAL security + validator-restored misses | {N} |
| P1 | Confirmed correctness + architecture/boundary | {N} |
| P2 | Reuse misses + over-complexity + version-pin errors | {N} |
| P3 | Business-requirements nits + minor over-complexity + warnings | {N} |

## Merged Prioritized Findings (sorted P0 -> P3, highest severity first)

| ID | Priority | Source | File:Line | Category | Severity | Title | Suggestion |
|----|----------|--------|-----------|----------|----------|-------|------------|
| P0-1 | P0 | {agent} | path:42-45 | boundary | blocker | ... | ... |

## Boundary & Architecture

| File:Line | Invariant | Issue | Fix |
|-----------|-----------|-------|-----|

## Reuse / Duplicates

| New Code | Existing | Similarity | Action | Note |
|----------|----------|------------|--------|------|

## Over-Complexity / Over-Engineering

| File:Line | What | Rule | Simpler shape |
|-----------|------|------|---------------|
| ... | speculative abstraction / gold-plating / premature generalization / collapsible dup | best-practices#N \| avoid#N | delete layer / inline one-caller / collapse dup / reuse existing |

## Dropped in Validation (false-positive / already-fixed / de-dup)

| Title | Reason |
|-------|--------|

## VERDICT

**{APPROVED | CONDITIONAL | REWORK}**

## Stats

| Metric | Value |
|--------|-------|
| P0 / P1 / P2 / P3 | {a} / {b} / {c} / {d} |
| Over-complexity findings | {OC} |
| Candidate findings (pre-validation) | {N} |
| Confirmed by validation | {N} |
| Dropped by validation | {N} |
| Agents spawned | {N} |
| Files reviewed | {COUNT} |

## Recommendations / Next steps

> **superreview is READ-ONLY — it does not apply fixes.** It only reports. Act on the findings as below.

- **To FIX the findings:** start a NEW session (English), turn on **Manager mode (`++m`)**, and DELEGATE the fixes
  to the domain-owner agents. Address **P0/P1 first, then P2/P3**.
- **To reduce over-complexity:** {OC} over-complexity / missed-reuse / duplication findings.
  {if {OC} > 0: **run the built-in `/simplify` skill** — it reviews the changed code for reuse / simplification /
  efficiency and APPLIES the cleanups. Run it in a fix-session, then re-run superreview to confirm.}
  {if {OC} == 0: `/simplify` is OPTIONAL — no over-complexity was flagged.}
  `/simplify` is a BUILT-IN Claude Code skill (NOT this skill, NOT a plugin); if it is unavailable, skip it.
- **Optional:** `/code-review` (built-in) for a focused correctness diff pass.

> These are RECOMMENDATIONS only. superreview does NOT invoke `/simplify`, does NOT call any other skill, and does
> NOT edit code — acting on them is the user's next session.
```

## Severity / reuse legend

- **Priority:** P0 (blocker — fix first) -> P3 (nice-to-have).
- **Severity:** blocker (outage/breach/data-loss) > critical (significant bug/perf/boundary) > major (maintainability) > minor (style).
- **Reuse:** REUSE (import existing 90-100%) | EXTEND (add params to existing 70-89%) | CONSIDER (evaluate 50-69%) | KEEP_NEW (<50%, justified).
- **Verdict:** REWORK if any P0; CONDITIONAL if any P1/P2 (no P0); APPROVED if only P3 / none.
