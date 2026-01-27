---
name: brewcode:standards-review
description: Reviews code for project standards compliance and finds duplicates. Use when - reviewing code quality, checking standards, finding duplicates, analyzing compliance. Trigger keywords - standards review, check standards, find duplicates, code review, compliance check, reusable code.
argument-hint: "[commit|branch|folder] [-p <prompt>]"
allowed-tools: Read, Glob, Grep, Task, Bash, Write, mcp__grepai__search
model: opus
---

# Standards Review

## Review Priorities

| Priority | Source | Focus |
|----------|--------|-------|
| 1 | Existing code | Search FIRST, import instead of creating |
| 2 | CLAUDE.md | Project standards, conventions, patterns |
| 3 | rules/*.md | Strict rules with numbers — check ALL `[avoid#N]`, `[bp#N]` |
| 4 | references/{stack}.md | Stack-specific guidelines from this skill |

---

## Input

| Input | Example | Action |
|-------|---------|--------|
| Empty | `/standards-review` | Branch vs main/master |
| Commit | `abc123` | Single commit |
| Folder | `src/main/java/...` | Folder contents |

**Arguments:** `$ARGUMENTS`

## Phase 1: Detect Tech Stack

Check project root for stack indicators:

| Files Present | Stack | Reference |
|---------------|-------|-----------|
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java/Kotlin | `references/java-kotlin.md` |
| `package.json` with react/typescript | TypeScript/React | `references/typescript-react.md` |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python | `references/python.md` |

> **ACTION:** When stack confirmed → **READ** `references/{stack}.md` (relative to this skill directory) and use as expert guidelines.

**Multi-stack:** If multiple detected, read ALL matching references, process each separately.

**Unknown stack:** Use only project's `.claude/rules/` — skip stack reference.

## Phase 2: Get Files

Based on detected stack, use appropriate patterns:

| Stack | Patterns | Command |
|-------|----------|---------|
| Java/Kotlin | `*.java`, `*.kt` | `git diff --name-only ... -- '*.java' '*.kt'` |
| TypeScript/React | `*.ts`, `*.tsx`, `*.js`, `*.jsx` | `git diff --name-only ... -- '*.ts' '*.tsx'` |
| Python | `*.py` | `git diff --name-only ... -- '*.py'` |

**Commands by input type:**

```bash
# Commit
git diff --name-only {COMMIT}^..{COMMIT} -- {PATTERNS} | head -50

# Branch (auto-detect main/master)
MAIN=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
git diff --name-only ${MAIN}...HEAD -- {PATTERNS} | head -50

# Folder
find {FOLDER} -type f \( {FIND_PATTERNS} \) | head -50
```

## Phase 3: Load Context

| Source | Files | Condition |
|--------|-------|-----------|
| Stack reference | `references/{stack}.md` | Based on Phase 1 detection |
| Project rules | `.claude/rules/avoid.md`, `.claude/rules/best-practice.md`, `.claude/rules/*-avoid.md`, `.claude/rules/*-best-practice.md`, `.claude/rules/*.md` | May not exist |
| Project standards | `CLAUDE.md`, `.claude/CLAUDE.md` | May not exist |

## Search-First Protocol

Before reviewing code: identify new utilities/helpers/patterns/abstractions → search via `grepai_search`, check common locations → decide based on similarity.

**Common Locations by Stack:**

| Stack | Search Paths |
|-------|--------------|
| Java/Kotlin | `**/util/`, `**/common/`, `**/shared/`, `**/core/` |
| TypeScript/React | `**/components/common/`, `**/shared/`, `**/hooks/`, `**/utils/` |
| Python | `**/utils/`, `**/common/`, `**/lib/`, `**/helpers/` |

**Similarity Decision Matrix:**

| Similarity | Decision | Action |
|------------|----------|--------|
| 90-100% | REUSE | Import existing |
| 70-89% | EXTEND | Add params/config to existing |
| 50-69% | CONSIDER | Evaluate effort vs benefit |
| <50% | KEEP_NEW | Justified new code |

## Phase 4: Expert Analysis

### Step 4.1: Group Files by Type

From Phase 2 file list, group by pattern matching:

**Java/Kotlin:**

| Group | Pattern | Focus |
|-------|---------|-------|
| entities | `**/entity/*.java`, `**/model/*.kt` | Entity suffix, DI, Lombok |
| services | `**/service/*.java`, `**/service/*.kt` | Stream API, constructor injection |
| tests | `**/*Test.java`, `**/*Test.kt` | AssertJ, BDD comments, no logs |
| build | `pom.xml`, `build.gradle`, `build.gradle.kts` | Dependencies, plugins, versions |

**TypeScript/React:**

| Group | Pattern | Focus |
|-------|---------|-------|
| styles | `**/styles.ts`, `**/*.styled.ts` | Theme tokens, no hardcoded colors |
| components | `**/*.tsx` | Hooks, functional components |
| tests | `**/*.test.tsx`, `**/*.spec.ts` | Jest patterns, coverage |
| build | `package.json`, `tsconfig*.json`, `vite.config.*`, `webpack.config.*` | Dependencies, scripts, bundler config |

**Python:**

| Group | Pattern | Focus |
|-------|---------|-------|
| modules | `**/*.py` (non-test) | Type hints, docstrings |
| tests | `**/test_*.py`, `**/*_test.py` | pytest patterns |
| configs | `**/config*.py`, `**/settings*.py` | Environment handling |
| build | `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements*.txt` | Dependencies, tool configs |

### Step 4.2: Spawn Experts (haiku per group)

For each non-empty group, spawn parallel haiku agent:

**Template:**

```
Task(subagent_type="Explore", model="haiku", prompt="
## Standards Review - {EXPERT_TYPE}

**Stack:** {STACK}
**SEARCH-FIRST:** Use grepai_search for finding existing code before flagging duplicates.

**Files:** {FILE_LIST}

**Project Rules:**
{RULES_CONTENT}

**Stack Guidelines:**
{STACK_REFERENCE_CONTENT}

**Output JSON:**
{
  \"changes\": [{
    \"location\": \"file:15-20\",
    \"description\": \"...\",
    \"existing\": \"path/to/similar|null\",
    \"reuse\": \"REUSE|EXTEND|CONSIDER|KEEP_NEW\",
    \"rating\": \"good|warning|bad\"
  }],
  \"violations\": [{
    \"file\": \"path\",
    \"line\": 42,
    \"rule\": \"avoid#5|best-practice#3|stack:entity-suffix\",
    \"issue\": \"...\",
    \"fix\": \"...\",
    \"severity\": \"error|warning|info\"
  }]
}
")
```

---

## Phase 5: Validation (sonnet)

```
Task(subagent_type="reviewer", model="sonnet", prompt="
Validate EACH finding from expert analysis.
Read actual code at file:line locations.
Verify rule actually applies in context.

**Findings:** {AGGREGATED_JSON}

**Output:** [
  {\"id\": \"1\", \"verdict\": \"CONFIRM|REJECT\", \"reason\": \"...\"}
]
")
```

## Phase 6: Report

### Create Report Directory

```bash
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
REPORT_DIR=".claude/reports/${TIMESTAMP}_standards-review"
mkdir -p "${REPORT_DIR}"
```

### REPORT.md Structure

```markdown
# Standards Review Report

**Generated:** {TIMESTAMP}
**Stack:** {DETECTED_STACK}
**Scope:** {INPUT_TYPE} - {INPUT_VALUE}
**Files Reviewed:** {COUNT}

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Violations | X | Y errors, Z warnings |
| Reuse Opportunities | X | - |
| Good Patterns | X | - |

## Violations

### Errors

| File | Line | Rule | Issue | Fix |
|------|------|------|-------|-----|
| path | 42 | avoid#5 | Description | Suggested fix |

### Warnings

| File | Line | Rule | Issue | Fix |
|------|------|------|-------|-----|

## Reuse Opportunities

| New Code | Existing | Similarity | Action |
|----------|----------|------------|--------|
| path:15-20 | util/X.java | 85% | EXTEND |

## Good Patterns Found

| File | Pattern | Description |
|------|---------|-------------|
| path | stream-api | Proper use of Stream API |

## Reuse Statistics

| Metric | Value |
|--------|-------|
| Total new code blocks | X |
| Reusable (>70%) | Y |
| Reuse rate | Z% |

## Legend

**Severity:** error (must fix), warning (should fix), info (consider)
**Reuse:** REUSE (import), EXTEND (modify existing), CONSIDER (evaluate), KEEP_NEW (justified)
**Rating:** good (exemplary), warning (suboptimal), bad (violation)
```

## Error Handling

| Condition | Action |
|-----------|--------|
| No files found | Exit: "No files to review for {SCOPE}" |
| >50 files | Warn user, suggest narrowing scope |
| Unknown stack | Continue with project rules only |
| No rules found | Continue with stack reference only |
| All compliant | Report: "All code compliant with standards" |
