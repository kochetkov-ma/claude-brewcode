---
name: brewcode:text-human
description: Removes AI artifacts, cleans comments, simplifies documentation in code. Use when - humanizing code, removing AI comments, cleaning docs, fixing unicode, making code human-readable. Trigger keywords - humanize, human, ai artifacts, ai comments, clean comments, simplify docs, unicode fix, remove generated, make readable.
argument-hint: <commit-hash|path> [custom instructions]
user-invocable: true
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Task]
---

# Text Humanizer

Detect and remove AI-generated artifacts from code and documentation. Process commits, files, or folders with parallel sub-agents.

## Language References

| Language | Reference | Load When |
|----------|-----------|-----------|
| Java/Kotlin | `@reference/java.md` | `*.java`, `*.kt`, `*.groovy`, Spring, Maven/Gradle |
| TypeScript/JS/React | `@reference/typescript.md` | `*.ts`, `*.tsx`, `*.js`, `*.jsx`, Node.js, React |
| Python | `@reference/python.md` | `*.py`, Django, FastAPI, Flask |

Multi-language projects: Load ALL relevant references.

---

## Argument

**First token** = scope (required):

| Input | Action |
|-------|--------|
| None | Ask for commit hash or path |
| Commit hash (7+ hex) | Process all text files from commit |
| File path | Process single file |
| Folder path | Process all files in folder |
| "entire project" | Ask for specific scope |

**Everything after first token** = custom prompt (optional). Free-form text, no quotes needed. Overrides or extends default humanization rules for this run. Passed to every sub-agent prompt.

### Custom Prompt Handling

1. Parse: split args into `scope` (first token) and `customPrompt` (rest)
2. If `customPrompt` is present, prepend it to every sub-agent Task prompt as:
   ```
   CUSTOM INSTRUCTIONS (highest priority, override defaults):
   <customPrompt>
   ```
3. Custom prompt wins over default rules on conflict

---

## Architecture

```
Orchestrator -> Detect Language -> Load Reference -> Analyze -> Classify -> Split (3-10 blocks) -> Parallel Task agents -> Aggregate
```

## Phase 1: Scope Analysis

### Commit Mode

Process all text files from commit. No extension filtering: `git diff --name-only <hash>^..<hash>`

### File Inclusion Rules

| Include | Exclude |
|---------|---------|
| Source code (`*.java`, `*.kt`, `*.py`, `*.ts`, `*.js`, etc.) | Binary files (`*.class`, `*.pyc`, `*.exe`) |
| Config (`*.xml`, `*.yaml`, `*.yml`, `*.json`, `*.toml`) | Images (`*.png`, `*.jpg`, `*.gif`, `*.ico`) |
| Docs (`*.md`, `*.txt`, `*.rst`) | Archives (`*.zip`, `*.tar`, `*.gz`) |
| Build files (`pom.xml`, `package.json`, `pyproject.toml`) | Generated (`target/`, `build/`, `dist/`, `node_modules/`) |
| SQL (`*.sql`, `*.ddl`) | Lock files, IDE files |

### Path Mode

```bash
find <path> -type f \( -name "*.java" -o -name "*.py" -o -name "*.ts" -o -name "*.js" -o -name "*.md" \) | grep -v -E "(target/|node_modules/|\.git/|build/|dist/|__pycache__/)"
```

### Block Count

| Files | Lines | Blocks |
|-------|-------|--------|
| 1-2 | <200 | 1 (direct) |
| 3-5 | <500 | 3 |
| 6-10 | 500-1500 | 5 |
| 11-20 | 1500-3000 | 7 |
| 21+ | 3000+ | 10 |

Single file: process directly without Task delegation.

## Phase 2: File Classification

### Haiku (Simple)

| Type | Patterns |
|------|----------|
| Config | `*.properties`, `*.yaml`, `*.yml`, `*.toml`, `*.ini` |
| Data | `*.json`, `*.csv` |
| Text | `*.txt`, `*.md` |
| Simple SQL | Single CREATE/ALTER, no CTEs/subqueries |
| Small files | <50 lines, no logic |

### Sonnet (Complex)

| Type | Patterns |
|------|----------|
| Source with logic | Business logic, algorithms |
| Tests | Test files for any framework |
| Complex SQL | CTEs, window functions, JOINs, subqueries |
| Config classes | Framework configuration |

> **Note:** See language-specific references for detailed classification rules.

## Phase 3: Block Formation

Group files by type, complexity (avoid mixed haiku/sonnet), line count balance. Keep related files together (same package/directory).

Data files block: YAML, JSON, CSV with comments → haiku for unicode fixes

## Phase 4: Parallel Execution

Launch all Task calls in single message for true parallelism.

```
Task(subagent_type="developer", model="haiku", prompt="> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).\n\n[CUSTOM_INSTRUCTIONS_IF_ANY]\nBlock 1: [files] [rules] Return JSON")
Task(subagent_type="developer", model="sonnet", prompt="> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).\n\n[CUSTOM_INSTRUCTIONS_IF_ANY]\nBlock 2: [files] [rules] Return JSON")
```

If custom prompt was provided, prepend to EVERY sub-agent prompt (after the Context line):
```
> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

CUSTOM INSTRUCTIONS (highest priority, override defaults):
<user's custom prompt text>
---
```

<output_format>
{
  "files_processed": N,
  "changes": [{"file": "path", "removed_comments": N, "fixed_unicode": N, "simplified_docs": N}]
}
</output_format>

## Phase 5: Aggregation

Collect JSON results from all agents → merge statistics → generate unified report.

---

<humanization_rules>

## AI Artifacts (Universal)

| Pattern | Action |
|---------|--------|
| `// Added by AI`, `// Claude suggestion`, `// AI-generated`, `// Generated by` | Delete |
| `# Added by AI`, `# Claude suggestion` | Delete |
| `/* Suggested by */` | Delete block |
| **AI-invented issue numbers** (`BUG-001`, `FIX-123`, `ISSUE-1`) | Delete |
| Unicode long dash (U+2014) | Replace → `--` |
| Unicode arrows (→, ←, ⇒) | Replace → `->`, `<-`, `=>` |
| Unicode bullets (•, ◦) | Replace → `-` or `*` |
| Unicode quotes (" " ' ') | Replace → `"` or `'` |

### Real vs Fake Issue References

Keep project-specific ticket patterns (INTELDEV-XXXXX, JIRA-XXXXX, GH-XXX). Remove generic AI-invented patterns (BUG-001, FIX-123, ISSUE-42).

## Documentation Cleanup (General Principles)

| Remove | Keep |
|--------|------|
| Private/internal function docs | Public API documentation |
| Test file documentation | Complex algorithm explanation |
| Obvious classes/functions (name = purpose) | Non-obvious behavior/side effects |
| Trivial parameter docs (restates name) | `@throws`/`Raises` with conditions |
| Trivial return docs (restates function) | External API contracts |

**Key Rule:** Never convert block docs to inline comments. Delete unnecessary docs entirely; for useful descriptions with trivial params, strip params and keep description.

## Comments (Universal)

Keep WHY, remove WHAT.

| Remove | Keep |
|--------|------|
| `// Initialize the list` | `// Retry 3x due to flaky external API` |
| `// Loop through items` | `// Uses UTC to match database timezone` |
| `// Check if null` | `// Thread-safe: synchronized on class lock` |
| Stale `// TODO: refactor this` | `// HACK: workaround for <issue-link>` |

## Formatting (Universal)

| Issue | Fix |
|-------|-----|
| `/* single line */` | `// single line` or `# single line` |
| 3+ blank lines | Max 2 |
| Trailing whitespace | Remove |
| Mixed tabs/spaces | Spaces |

</humanization_rules>

---

## File Type Rules

| Type | Rules |
|------|-------|
| Source code | Full doc cleanup per language reference |
| Test files | Remove all docs, keep test descriptions |
| SQL/XML | Preserve structural comments |
| Markdown | Remove AI disclosures, fix unicode |
| YAML/Properties | Fix unicode, keep config explanations |
| JSON/CSV | Check for comments with unicode, usually skip |

### YAML/Data Files

Check for unicode in comments. Section comments are valuable.

| Action | Example |
|--------|---------|
| FIX | `# Lane 90001→10001` → `# Lane 90001->10001` |
| KEEP | `# ===== VAN loads for test =====` |
| SKIP | Pure data without comments |

### SQL/XML Comments

Structural comments are valuable. Analyze neighboring files first.

| Action | Example |
|--------|---------|
| KEEP | Section headers `-- ============ TABLES ============` |
| KEEP | Block separators `<!-- ===== Mappers ===== -->` |
| KEEP | Column/field documentation |
| REMOVE | Exact duplicates, AI markers |

---

## Custom Prompt Mode

Custom prompt overrides or extends default rules. Use for:
- Restricting scope: "only remove AI artifacts, don't touch docs"
- Adding rules: "also remove all @author tags"
- Excluding files: "skip test files"
- Style reference: "use style from src/main/Service.java as reference"

## Output Format

```
## Humanization Report

### Execution Summary
| Metric | Value |
|--------|-------|
| Total files | N |
| Blocks | M |
| Haiku/Sonnet | X/Y |

### Block Results
[Per-block tables with file metrics]

### Totals
| Metric | Count |
|--------|-------|
| Files processed | N |
| Comments removed | X |
| Docs simplified | Y |
| Unicode fixed | Z |
```

## Best Practices

- Load language reference first
- Process all commit files (include yaml/data files)
- Check yaml for unicode (comments may have arrows)
- Preserve valuable comments (they add context)
- Skip binaries (avoid corruption)
- Honor style reference if provided
- Keep public API docs
- Group files by complexity
- Launch agents in parallel

## Error Handling

| Error | Action |
|-------|--------|
| Agent timeout | Continue with other blocks |
| File read error | Skip, note in report |
| Binary file | Skip, note in report |
| No changes | Report "No humanization required" |

## Examples

```bash
/text-human 3be67487                                              # Commit - all files
/text-human src/main/java/MyService.java                          # Single file
/text-human src/main/java/services/                               # Folder
/text-human 3be67487 don't touch docs on public records           # Commit + custom prompt
/text-human src/ only remove AI artifacts and fix unicode         # Path + custom prompt
/text-human 3be67487 also remove all @author tags                 # Commit + extra rule
```
