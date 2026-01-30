# Agent Prompt Template

Template for parallel review agent invocation.

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

## DB-Layer Specific Prompt

For `db-layer` group, use `reviewer` agent with database-focused prompt additions:

```markdown
Task(subagent_type="reviewer", model="opus", prompt="
  ## Code Review Task - Database Layer

  **Group:** db-layer
  **Focus:** {REVIEW_PROMPT}
  **Instance:** {INSTANCE_NUMBER} of {TOTAL_INSTANCES}

  **Specialized focus areas:**
  - N+1 query detection
  - Transaction boundary issues
  - Connection pool exhaustion
  - SQL injection vulnerabilities
  - Missing indexes (based on WHERE/JOIN clauses)
  - Improper eager/lazy loading
  - Batch operation opportunities

  **Files to review:**
  {FILE_LIST}

  ... (rest of standard template)
")
```
