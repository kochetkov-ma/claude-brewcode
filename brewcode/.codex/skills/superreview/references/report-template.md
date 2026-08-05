# Merged Report Layout (superreview Phase 4 — {PROJECT_NAME})

Output: `.codex/reports/{TIMESTAMP}_superreview/REPORT.md`. ONE consolidated, validated, P0->P3-sorted report.

```markdown
# Super Review Report — {PROJECT_NAME}

**Generated:** {TIMESTAMP}
**Mode:** {MODE}  (branch: {BRANCH})
**Scope:** {concrete scope — commit range | branch-vs-main | folder | working-tree vs HEAD | full project}
**Focus:** {resolved focus — user directive, else default ordering; security only if P0}
**Files Reviewed:** {COUNT}
**Sanctioned scope:** task {T-ID | none} / issue {id | none | not reached} / decisions {ids | none} — {K}/{COUNT} files outside it
**Gates:** {gate} {OK|FAIL|not run} / ...
**Validation:** {all {N} findings validated | **{U} UNVALIDATED of {N} — run is INCOMPLETE ({reason})**} — every row below carries a verdict
**Search tool used:** {Bash rg/grep/git ls-files}
**Agents run (derived from live roster):** {AGENT_LIST}{, DEGRADED: <group> -> generic}

> Findings section below is MANDATORY-sorted by priority P0 -> P3 (highest severity first).

## Summary Severity Matrix

| Priority | Meaning | Count |
|----------|---------|-------|
| P0 | Architecture blockers + CRITICAL security + unsanctioned foreign-surface scope + undelivered criterion / unrecorded reduction + validator-restored misses | {N} |
| P1 | Confirmed correctness + architecture/boundary + unsanctioned feature / silent doc mutation + partially delivered criteria + misleading closeout + other gate failures | {N} |
| P2 | Reuse misses + over-complexity + drive-by scope + version-pin errors + test quality | {N} |
| P3 | Business-requirements nits + minor over-complexity + style + warnings | {N} |

## Scope Discipline / Blast Radius (category `scope-creep`; taxonomy in `references/scope.md`)

**Baseline:** task {T-ID + file} | none — issue {id} "{title}" | not reached — decisions {ids} | none
**Acceptance criteria covered:** {c}/{total} ({unmet ones listed as findings})
**Files outside the sanctioned surface:** {K}/{COUNT}
**Delivery (section 3b):** D1 {n} undelivered / D2 {n} partial-or-stubbed / D3 {n} unprovable — reductions: {none \| accepted, blocker recorded in {where} \| UNRECORDED -> D4}
**Closeout (section 4b):** PR {id} — body {OK \| C1 gap \| too long \| too thin}; `Closes`/`Refs` {correct \| C2 {detail}}; issue comments {OK \| missing}; AI attribution {none \| C4 found in {artefact}} \| **PR: none — closeout skipped**

| File:Line | Shape / rule | Sanctioned? | Who else is hit | Issue | Fix |
|-----------|--------------|-------------|-----------------|-------|-----|
| ... | 1 foreign-surface \| 2 unsanctioned-feature \| 3 drive-by \| 4 opportunistic-dep \| 5 silent-doc-mutation \| 6 unrecorded \| D1-D4 delivery \| C1-C4 closeout | NO \| UNKNOWN \| yes ({decision id}) | {task/owner/shared surface} | ... | split out \| revert \| deliver the criterion \| fix the PR body \| record the decision |

**Scope gate (Phase 3b):** {not triggered | Q + user's answer, verbatim, per expansion | not available — findings kept at the priority they entered with}

## Mechanical Gate Results (verdict `CONFIRMED-BY-EXECUTION` — validated by the run itself, cite command + output)

| Gate | Result | Detail |
|------|--------|--------|
| {build/lint/type/test command} | {OK \| FAIL \| not run} | {first errors / reason not run} |

## Merged Prioritized Findings (sorted P0 -> P3, highest severity first)

Every row carries a Verdict. `CONFIRM` = adversarially validated; `CONFIRMED-BY-EXECUTION` = gate output, cite the
command; `UNVALIDATED` = validation could not run, run is INCOMPLETE. No other value, no blank.

| ID | Priority | Verdict | Source | File:Line | Category | Severity | Rule | Title | Suggestion |
|----|----------|---------|--------|-----------|----------|----------|------|-------|------------|
| P0-1 | P0 | CONFIRM | {agent} | path:42-45 | boundary | blocker | architecture#3 | ... | ... |

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

## Dropped in Validation (false-positive / already-fixed / unverified-rule / in-sanctioned-scope / de-dup)

| Title | Reason |
|-------|--------|

## VERDICT

**{APPROVED | CONDITIONAL | REWORK}{ - INCOMPLETE ({U} unvalidated) if any row is UNVALIDATED}**

## Stats

| Metric | Value |
|--------|-------|
| P0 / P1 / P2 / P3 | {a} / {b} / {c} / {d} |
| Scope-creep findings (files outside the sanctioned surface) | {SC} ({K}/{COUNT} files) |
| Over-complexity findings | {OC} |
| Candidate findings (pre-validation) | {N} |
| Confirmed by validation | {N} |
| Confirmed by execution (gate output) | {N} |
| **UNVALIDATED (forces INCOMPLETE)** | **{N}** |
| Dropped by validation | {N} |
| Agents spawned | {N} |
| Files reviewed | {COUNT} |

## Recommendations / Next steps

> **superreview is READ-ONLY — it does not apply fixes.** It only reports. Act on the findings as below.

- **To FIX the findings:** start a NEW session (English), turn on **Manager mode (`++m`)**, and DELEGATE the fixes
  to the domain-expert agents the routing map named. Address **P0/P1 first, then P2/P3**.
- **Scope:** {SC} scope finding(s). {if any P0/P1: split the unsanctioned work into its own task + PR, or get the
  decision recorded in the task notes and as a comment on the issue — superreview does NOT touch the board or the
  issue. | if none: blast radius stayed inside the sanctioned surface.}
- **Re-run the gates after fixing:** the same commands Phase 0 ran.
- **To reduce over-complexity:** {OC} over-complexity / missed-reuse / duplication findings.
  {if {OC} > 0: **run the built-in `/simplify` skill** — it reviews the changed code for reuse / simplification /
  efficiency and APPLIES the cleanups. Run it in a fix-session, then re-run superreview to confirm.}
  {if {OC} == 0: `/simplify` is OPTIONAL — no over-complexity was flagged.}
  `/simplify` is a BUILT-IN Codex skill (NOT this skill, NOT a plugin); if it is unavailable, skip it.
- **Optional:** `/code-review` (built-in) for a focused correctness diff pass.

> These are RECOMMENDATIONS only. superreview does NOT invoke `/simplify`, does NOT call any other skill, and does
> NOT edit code — acting on them is the user's next session.
```

## Severity / reuse legend

- **Priority:** P0 (blocker — fix first) -> P3 (nice-to-have).
- **Severity:** blocker (outage/breach/data-loss) > critical (significant bug/perf/boundary) > major (maintainability) > minor (style).
- **Reuse:** REUSE (import existing 90-100%) | EXTEND (add params to existing 70-89%) | CONSIDER (evaluate 50-69%) | KEEP_NEW (<50%, justified).
- **Run verdict:** REWORK if any P0; CONDITIONAL if any P1/P2 (no P0); APPROVED if only P3 / none; suffix
  `- INCOMPLETE` whenever any row is UNVALIDATED.
- **Row verdict:** CONFIRM (adversarially validated) | CONFIRMED-BY-EXECUTION (gate output, command + line cited) |
  UNVALIDATED (validation could not run). No row ships without one.
- **Scope shapes:** 1 foreign-surface (P0) | 2 unsanctioned-feature (P1) | 3 drive-by (P2) | 4 opportunistic-dep
  (P2) | 5 silent-doc-mutation (P1) | 6 sanctioned-but-unrecorded (P2); delivery D1/D4 (P0, proof required),
  D2 (P1), D3 (P2); closeout C2 (P1), C1/C3/C4 (P2).
