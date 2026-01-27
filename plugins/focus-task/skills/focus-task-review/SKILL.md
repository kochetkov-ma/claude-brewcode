---
name: focus-task-review
description: Multi-agent code review with quorum consensus. Triggers: "review code", "parallel review", "quorum review", "/focus-task-review".
user-invocable: true
argument-hint: "<prompt-or-file-path> [--quorum N-M]"
allowed-tools: Read, Glob, Grep, Task, Bash, Write
context: fork
model: opus
---

# focus-task-review

**ROLE:** Code Review Coordinator | **OUTPUT:** Prioritized findings report

## Input Handling

| Input | Action |
|-------|--------|
| Text prompt | Use as review focus description |
| File path (`.md`, `.txt`) | Read file as review instructions |
| `--quorum N-M` | N agents per group, M = quorum threshold |
| Default | `--quorum 3-2` (3 agents, quorum 2) |

**Parse `$ARGUMENTS`:**
```
1. Extract --quorum if present → N (agents), M (threshold)
2. Remaining text → REVIEW_PROMPT or file path
3. If path exists → Read file → REVIEW_PROMPT
4. Validate: M <= N, N >= 2, M >= 2
```

---

## Phase 1: Codebase Study

**Goal:** Divide codebase into 5-10 logical blocks, gather context

**Agent:** Explore × 5-10 (parallel in ONE message)

### Default Blocks

| Block | Pattern | Purpose |
|-------|---------|---------|
| Controllers | `**/controllers/**`, `**/api/**`, `**/routes/**` | API endpoints |
| Services | `**/services/**`, `**/business/**`, `**/usecases/**` | Business logic |
| Repositories | `**/repositories/**`, `**/dao/**`, `**/data/**` | Data access |
| Tests | `**/test/**`, `**/tests/**`, `**/__tests__/**` | Test quality |
| Config | `*.yml`, `*.yaml`, `docker-*`, `*.properties` | Infrastructure |
| Domain | `**/domain/**`, `**/entities/**`, `**/models/**` | Data models |
| Security | `**/auth/**`, `**/security/**`, `**/middleware/**` | Auth/security |
| Utils | `**/utils/**`, `**/helpers/**`, `**/common/**` | Shared utilities |

### Execution

```
ONE message with 5-10 Explore agents:

Task(subagent_type="Explore", model="haiku", prompt="
  Analyze codebase block: {BLOCK_NAME}
  Pattern: {PATTERN}

  Output:
  - File count
  - Complexity indicators (LOC, cyclomatic)
  - Risk areas (security, performance, null-safety)
  - Dependencies (internal/external)
  - Key patterns used
")
```

### Output: Area Map

```markdown
| Block | Files | LOC | Risk Level | Key Concerns |
|-------|-------|-----|------------|--------------|
| Controllers | 15 | 2.5K | Medium | Input validation |
| Services | 22 | 5.1K | High | Complex logic |
| ... | ... | ... | ... | ... |
```

---

## Phase 2: Group Formation

**Goal:** Define review groups based on task and codebase

### Default Groups

| Group | Focus | Default Agent | Triggers |
|-------|-------|---------------|----------|
| 1: main-code | Logic, architecture, security | `reviewer` | Always |
| 2: tests | Coverage, assertions, quality | `tester` | Test files detected |
| 3: db-layer | Queries, transactions, N+1 | `sql_expert` | DB patterns detected |

### Agent Selection Priority

```
1. Check .claude/agents/ for project-specific agents:
   - If agent matches focus → use project agent
   - Read agent.md to verify expertise

2. Fallback to core agents:
   - Code quality → reviewer
   - Test quality → tester
   - Database → sql_expert

3. Group count:
   - 2 groups: no DB or no tests
   - 3 groups: both DB and tests detected
```

### Detection Rules

| Condition | Action |
|-----------|--------|
| `**/repositories/**` OR `*.sql` found | Enable db-layer group |
| `**/test/**` OR `*Test.*` found | Enable tests group |
| `**/auth/**` OR `**/security/**` found | Add security focus to main-code |

---

## Phase 3: Parallel Review

**Goal:** N agents per group review in parallel

### Execution Pattern

```
ONE message with (N × groups) Task calls:

With --quorum 3-2 and 2 groups:
  Group 1 (main-code): reviewer #1, reviewer #2, reviewer #3
  Group 2 (tests): tester #1, tester #2, tester #3
  Total: 6 parallel agents

With --quorum 5-2 and 3 groups:
  Group 1: reviewer × 5
  Group 2: tester × 5
  Group 3: sql_expert × 5
  Total: 15 parallel agents
```

### Agent Prompt Template

```markdown
Task(subagent_type="{AGENT_TYPE}", model="opus", prompt="
  ## Code Review Task

  **Group:** {GROUP_NAME}
  **Focus:** {REVIEW_PROMPT}
  **Instance:** {INSTANCE_NUMBER} of {TOTAL_INSTANCES}

  **Files to review:**
  {FILE_LIST}

  **Project rules (from CLAUDE.md):**
  {RELEVANT_RULES}

  **Output format (JSON array):**
  ```json
  [{
    \"file\": \"path/to/file.java\",
    \"lineStart\": 42,
    \"lineEnd\": 45,
    \"category\": \"null-safety|security|performance|logic|style|test-quality\",
    \"severity\": \"blocker|critical|major|minor\",
    \"title\": \"Short summary (max 80 chars)\",
    \"description\": \"Detailed explanation of the issue\",
    \"suggestion\": \"Recommended fix or approach\",
    \"confidence\": 0.85
  }]
  ```

  **Categories:**
  - null-safety: Potential NPE, missing null checks
  - security: Auth bypass, injection, secrets, OWASP top 10
  - performance: N+1 queries, memory leaks, inefficient algorithms
  - logic: Business logic errors, race conditions, edge cases
  - style: Code style violations, naming, patterns
  - test-quality: Missing tests, weak assertions, flaky tests

  **Severity guide:**
  - blocker: Production outage, security breach, data loss
  - critical: Significant bug, performance degradation
  - major: Important issue, maintainability concern
  - minor: Style, minor improvement

  **Rules:**
  - Report ONLY issues, not positives
  - Include confidence score (0.0-1.0)
  - Provide actionable suggestions
  - Reference specific lines
")
```

---

## Phase 4: Quorum Collection

**Goal:** Filter findings by consensus, merge duplicates

### Algorithm

```python
confirmed = []
exceptions = []
discarded = []

for finding in all_findings:
    cluster = find_similar_findings(finding, all_findings)
    unique_agents = count_unique_agents(cluster)

    if unique_agents >= M:  # Quorum threshold
        merged = merge_cluster(cluster)
        confirmed.append(merged)
    elif finding.severity in ['blocker', 'critical']:
        exceptions.append(finding)  # Priority 3
    else:
        discarded.append(finding)
```

### Matching Rules

| Criterion | Tolerance | Weight |
|-----------|-----------|--------|
| Same file | Exact | Required |
| Line range | ±5 lines | Required |
| Category | Same or equivalent | Required |
| Description | Semantic similarity ≥ 0.6 | Optional |

**Category equivalence:**
```
null-safety ≈ logic (when related to null handling)
security ≈ logic (when auth-related)
```

### Merge Rules

| Field | Merge Strategy |
|-------|----------------|
| description | Longest/most detailed |
| severity | Highest in cluster |
| suggestion | First non-null |
| confidence | Average of cluster |
| lineStart | Min of cluster |
| lineEnd | Max of cluster |
| agents | List all contributing |

### Output

```markdown
## Quorum Results

Confirmed (≥{M} agents): {COUNT}
Exceptions (blocker/critical, <{M}): {COUNT}
Discarded (no consensus): {COUNT}
```

---

## Phase 5: DoubleCheck

**Goal:** Verify quorum-passed findings before final report

**Agent:** `reviewer` (Opus) — single agent verifies ALL confirmed findings

### Prompt

```markdown
Task(subagent_type="reviewer", model="opus", prompt="
  ## DoubleCheck Verification

  Review ALL confirmed findings below. For EACH:

  1. **Verify existence:** Does the issue actually exist in code?
  2. **Verify accuracy:** Is the description correct?
  3. **Verify actionability:** Is there a clear fix path?
  4. **Verify severity:** Is the severity appropriate?

  **Findings to verify:**
  {CONFIRMED_FINDINGS_JSON}

  **Output format (JSON array):**
  ```json
  [{
    \"findingId\": \"1\",
    \"verdict\": \"CONFIRM|REJECT\",
    \"reason\": \"Explanation if REJECT\",
    \"severityAdjustment\": \"null|blocker|critical|major|minor\"
  }]
  ```

  **Verdict rules:**
  - CONFIRM: Issue exists, description accurate, actionable
  - REJECT: False positive, already fixed, or not actionable
")
```

### Outcomes

| Verdict | Action |
|---------|--------|
| CONFIRM | Priority 1 (highest confidence) |
| REJECT | Remove from report |
| Severity adjusted | Update severity in report |

---

## Phase 6: Final Report

**Goal:** Generate prioritized findings report

### Report Location

```
.claude/tasks/reviews/{TIMESTAMP}_{NAME}_report.md

Naming:
- TIMESTAMP: YYYYMMDD_HHMMSS
- NAME: sanitized REVIEW_PROMPT (first 30 chars)
```

### Priority Order

| Priority | Criteria | Confidence |
|----------|----------|------------|
| 1 | Quorum + DoubleCheck confirmed | Highest |
| 2 | Quorum but NOT DoubleCheck confirmed | Medium |
| 3 | Blocker/Critical WITHOUT quorum | Exception (needs attention) |

**Everything else:** REMOVED from report

### Report Template

```markdown
# Code Review Report

> **Scope:** {REVIEW_PROMPT}
> **Quorum:** {N}-{M} ({N} agents, {M} threshold)
> **Groups:** {GROUP_COUNT} ({GROUP_NAMES})
> **Total agents:** {TOTAL_AGENTS}
> **Generated:** {TIMESTAMP}

## Summary

| Severity | P1 (Confirmed) | P2 (Quorum) | P3 (Exception) | Total |
|----------|----------------|-------------|----------------|-------|
| Blocker | {N} | {N} | {N} | {N} |
| Critical | {N} | {N} | {N} | {N} |
| Major | {N} | {N} | {N} | {N} |
| Minor | {N} | {N} | {N} | {N} |
| **Total** | **{N}** | **{N}** | **{N}** | **{N}** |

---

## Priority 1: Confirmed (Quorum + DoubleCheck)

| # | Severity | File:Line | Category | Issue | Suggestion | Consensus |
|---|----------|-----------|----------|-------|------------|-----------|
| 1 | Critical | `path:42-45` | security | Short description | Fix approach | 3/3 agents |

### P1-1: {Title}

**File:** `{path}:{lineStart}-{lineEnd}`
**Severity:** {severity} | **Category:** {category}
**Consensus:** {agent_count}/{total} agents | **Confidence:** {avg_confidence}

**Description:**
{detailed_description}

**Suggestion:**
{suggestion}

**Reported by:** {agent_list}

---

## Priority 2: Quorum Only (NOT DoubleCheck confirmed)

| # | Severity | File:Line | Category | Issue | Suggestion | Consensus |
|---|----------|-----------|----------|-------|------------|-----------|
| ... | ... | ... | ... | ... | ... | ... |

---

## Priority 3: Critical Without Quorum (Exceptions)

> These blocker/critical findings did not reach quorum but warrant attention.

| # | Severity | File:Line | Category | Issue | Agent |
|---|----------|-----------|----------|-------|-------|
| ... | ... | ... | ... | ... | ... |

---

## Statistics

| Metric | Value |
|--------|-------|
| Files reviewed | {COUNT} |
| Total findings (pre-quorum) | {COUNT} |
| Quorum passed | {COUNT} ({PERCENT}%) |
| DoubleCheck confirmed | {COUNT} ({PERCENT}%) |
| Discarded (no consensus) | {COUNT} |

## Agent Performance

| Agent | Findings | Confirmed | Rate |
|-------|----------|-----------|------|
| reviewer #1 | {N} | {N} | {PERCENT}% |
| reviewer #2 | {N} | {N} | {PERCENT}% |
| ... | ... | ... | ... |

---

*Generated by focus-task-review | Quorum: {N}-{M}*
```

### Final Response

```
Review complete. Found {TOTAL} issues ({BLOCKERS} blocker, {CRITICAL} critical, {MAJOR} major).

Priority breakdown:
- P1 (Confirmed): {COUNT} issues
- P2 (Quorum only): {COUNT} issues
- P3 (Exceptions): {COUNT} issues

Full report: .claude/tasks/reviews/{TIMESTAMP}_{NAME}_report.md
```

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No files found for block | Skip block, warn in report |
| Agent timeout | Retry once, then mark as unavailable |
| No findings | Report "No issues found" with confidence |
| Invalid quorum args | Error: "Invalid --quorum. Format: N-M where M ≤ N, N ≥ 2, M ≥ 2" |
| No CLAUDE.md | Use default rules only |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `--quorum` | `3-2` | N agents per group, M = threshold |
| Report dir | `.claude/tasks/reviews/` | Output directory |
| Max parallel | 15 | Maximum agents in one message |
| Line tolerance | ±5 | Lines overlap for matching |
| Similarity threshold | 0.6 | Semantic similarity for matching |
