---
name: review
description: Multi-agent code review with quorum consensus. Triggers: "review code", "parallel review", "quorum review", "/focus-task:review".
user-invocable: true
argument-hint: "<prompt-or-file-path> [-q|--quorum [G-]N-M]"
allowed-tools: Read, Glob, Grep, Task, Bash, Write
context: fork
model: opus
---

Code Review — "prompt" or path [-q|--quorum [G-]N-M]

**ROLE:** Code Review Coordinator | **OUTPUT:** Prioritized findings report

## Input Handling

| Input | Action |
|-------|--------|
| Text prompt | Use as review focus description |
| File path (`.md`, `.txt`) | Read file as review instructions |
| `-q G-N-M` / `--quorum G-N-M` | G groups, N agents per group, M = quorum threshold |
| `-q N-M` / `--quorum N-M` | Auto groups (2-5), N agents per group, M = quorum |
| Default | `-q 3-2` (auto groups, 3 agents, quorum 2) |

**Parse `$ARGUMENTS`:**
```
1. Extract -q/--quorum if present:
   - 3 values (G-N-M) → G groups, N agents, M threshold
   - 2 values (N-M) → Auto groups, N agents, M threshold
2. Remaining text → REVIEW_PROMPT or file path
3. If path exists → Read file → REVIEW_PROMPT
4. Validate: M <= N, N >= 2, M >= 2, G in [2..5] or "auto"
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

**Goal:** Define review groups based on task, codebase, and `-q/--quorum` setting

### Group Count Rules

| Mode | G value | Behavior |
|------|---------|----------|
| Explicit | `3-3-2` | Exactly 3 groups |
| Auto | `3-2` or default | 2-5 groups based on detection |

### Available Groups (priority order for auto-selection)

| Priority | Group | Focus | Default Agent | Detection |
|----------|-------|-------|---------------|-----------|
| 1 | main-code | Logic, architecture, security | `reviewer` | Always enabled |
| 2 | tests | Coverage, assertions, quality | `tester` | `**/test/**`, `*Test.*` |
| 3 | db-layer | Queries, transactions, N+1 | `reviewer` (DB-focused) | `**/repositories/**`, `*.sql` |
| 4 | security | Auth, injection, OWASP | `reviewer` | `**/auth/**`, `**/security/**` |
| 5 | config | Infrastructure, secrets | `reviewer` | `docker-*`, `*.yml`, `*.properties` |

### Auto Group Selection (G = "auto")

```
1. ALWAYS enable: main-code (group 1)
2. Detect and enable (up to 4 more):
   - tests: if test files found
   - db-layer: if repository/SQL patterns found
   - security: if auth/security modules found
   - config: if significant config files found
3. Result: 2-5 groups based on codebase
```

### Explicit Group Count (G = 2..5)

```
1. If G specified explicitly (e.g., -q 4-3-2):
   - Select top G groups by detection priority
   - main-code always included
   - Fill remaining with detected groups
   - If fewer detected than G → use main-code duplicates with different focus
```

### Agent Selection Priority

```
1. Check .claude/agents/ for project-specific agents:
   - If agent matches focus → use project agent
   - Read agent.md to verify expertise

2. Fallback to core agents:
   - Code quality → reviewer
   - Test quality → tester
   - Database → reviewer (with DB-focused prompt, see references/agent-prompt.md)
```

### Detection Rules

| Condition | Action |
|-----------|--------|
| `**/repositories/**` OR `*.sql` found | Enable db-layer group |
| `**/test/**` OR `*Test.*` found | Enable tests group |
| `**/auth/**` OR `**/security/**` found | Enable security group |
| `docker-*` OR `*.yml` > 5 files | Enable config group |

---

## Phase 3: Parallel Review

**Goal:** N agents per group review in parallel across G groups

### Execution Pattern

```
ONE message with (G × N) Task calls:

Example: -q 3-3-2 (3 groups, 3 agents, quorum 2)
  Group 1 (main-code): reviewer #1, reviewer #2, reviewer #3
  Group 2 (tests): tester #1, tester #2, tester #3
  Group 3 (db-layer): reviewer #1, reviewer #2, reviewer #3 (DB-focused prompt)
  Total: 9 parallel agents

Example: -q 4-2 (auto groups, 4 agents, quorum 2)
  Detected: 3 groups (main-code, tests, security)
  Group 1: reviewer × 4
  Group 2: tester × 4
  Group 3: reviewer × 4 (security focus)
  Total: 12 parallel agents

Example: -q 5-5-3 (5 groups, 5 agents, quorum 3)
  Group 1: reviewer × 5
  Group 2: tester × 5
  Group 3: reviewer × 5 (DB-focused prompt)
  Group 4: reviewer × 5 (security)
  Group 5: reviewer × 5 (config)
  Total: 25 parallel agents (max recommended)
```

### Agent Prompt Template

See `references/agent-prompt.md` for full template with categories, severity guide, and DB-focused variant.

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

See `references/report-template.md` for full report format including summary, priority sections, statistics, and final response format.

Output: `.claude/tasks/reviews/{TIMESTAMP}_{NAME}_report.md`

---

## Error Handling

| Condition | Action |
|-----------|--------|
| No files found for block | Skip block, warn in report |
| Agent timeout | Retry once, then mark as unavailable |
| No findings | Report "No issues found" with confidence |
| Invalid quorum args | Error: "Invalid -q/--quorum. Format: G-N-M or N-M where G∈[2..5], M≤N, N≥2, M≥2" |
| No CLAUDE.md | Use default rules only |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `-q` / `--quorum` | `3-2` | `N-M` (agents-threshold) or `G-N-M` (groups-agents-threshold) |
| Report dir | `.claude/tasks/reviews/` | Output directory |
| Max parallel | 25 | Maximum agents in one message (G×N) |
| Line tolerance | ±5 | Lines overlap for matching |
| Similarity threshold | 0.6 | Semantic similarity for matching |

### Quorum Format Examples

| Format | Groups | Agents | Quorum | Total Agents |
|--------|--------|--------|--------|--------------|
| `3-2` | auto (2-5) | 3 | 2 | 6-15 |
| `3-3-2` | 3 | 3 | 2 | 9 |
| `4-2-2` | 4 | 2 | 2 | 8 |
| `5-5-3` | 5 | 5 | 3 | 25 |
| `2-4-3` | 2 | 4 | 3 | 8 |

---

## Output Format

```markdown
# Code Review Complete

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args}` |
| Prompt | `{review focus or file path}` |
| Quorum | `{G-N-M parsed values}` |

## Configuration

| Setting | Value |
|---------|-------|
| Groups | `{G}` |
| Agents per group | `{N}` |
| Quorum threshold | `{M}` |
| Total agents | `{G × N}` |

## Results

| Priority | Count | Description |
|----------|-------|-------------|
| 1 | N | Quorum + DoubleCheck confirmed |
| 2 | N | Quorum only |
| 3 | N | Blocker/Critical exceptions |

## Report

Path: `.claude/tasks/reviews/{TIMESTAMP}_{NAME}_report.md`
```
