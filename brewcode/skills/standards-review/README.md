---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Standards Review

Analyzes code changes for project standards compliance, detects duplicate code that can be replaced with existing utilities, and highlights exemplary patterns. Automatically detects your tech stack and applies the right set of rules.

## Quick Start

```bash
/brewcode:standards-review
```

Reviews all changes on your current branch compared to main.

## Modes

| Mode | How to trigger | What it does |
|------|---------------|--------------|
| Branch diff | `/brewcode:standards-review` | Compares current branch to main/master, reviews all changed files |
| Single commit | `/brewcode:standards-review abc123f` | Reviews files changed in the specified commit |
| Folder scan | `/brewcode:standards-review src/main/java` | Reviews all source files in the given directory |
| Custom focus | `/brewcode:standards-review -p "check error handling"` | Adds a custom analysis prompt on top of standard checks |
| With simplify | Answer "Yes" when prompted at start | Runs an extra `/simplify` pass for efficiency, concurrency, and hot-path analysis |

## Examples

### Good Usage

```bash
# Review branch before opening a PR
/brewcode:standards-review

# Review a specific commit after a colleague's push
/brewcode:standards-review d8c8e69

# Review an entire module after refactoring
/brewcode:standards-review src/components

# Focus on security concerns in authentication code
/brewcode:standards-review src/auth -p "focus on security and input validation"

# Review Python tests folder for test quality
/brewcode:standards-review tests/
```

### Common Mistakes

```bash
# Reviewing generated or vendored code -- produces noise, not actionable findings
/brewcode:standards-review node_modules
/brewcode:standards-review src/generated

# Reviewing the entire repo on a long-lived branch -- too many files, suggest narrowing scope
# (the skill warns you when >50 files are detected)
/brewcode:standards-review /

# Running without any project rules or CLAUDE.md -- the skill still works
# but findings will be limited to stack-specific guidelines only
```

## What It Checks

**Standards compliance** -- validates code against three layers of rules:
- Project rules from `.claude/rules/*.md` (numbered `avoid#N`, `best-practice#N`)
- Project conventions from `CLAUDE.md`
- Stack-specific guidelines from built-in reference files

**Duplicate detection** -- uses `grepai_search` to find existing utilities, helpers, and patterns before flagging new code. Similarity scoring determines the recommendation:

| Similarity | Recommendation | Meaning |
|------------|---------------|---------|
| 90-100% | REUSE | Import the existing code directly |
| 70-89% | EXTEND | Add parameters or configuration to the existing code |
| 50-69% | CONSIDER | Evaluate whether refactoring is worth the effort |
| <50% | KEEP_NEW | New code is justified |

**Pattern recognition** -- identifies good patterns worth replicating across the codebase.

**Supported stacks:**

| Stack | Detected by | File groups analyzed |
|-------|-------------|---------------------|
| Java/Kotlin | `pom.xml`, `build.gradle`, `build.gradle.kts` | entities, services, tests, build configs |
| TypeScript/React | `package.json` with react/typescript | styles, components, tests, build configs |
| Python | `pyproject.toml`, `setup.py`, `requirements.txt` | modules, tests, configs, build files |

Multi-stack projects are supported -- each stack is processed separately.

## Output

A structured `REPORT.md` is saved to `.claude/reports/{timestamp}_standards-review/` containing:

- **Summary table** -- violation counts by severity, reuse opportunities, good patterns found
- **Violations** -- grouped by severity (error, warning, info) with file, line, rule reference, and suggested fix
- **Reuse opportunities** -- new code mapped to existing code with similarity percentages
- **Good patterns** -- exemplary code worth emulating
- **Reuse statistics** -- total new code blocks, reusable percentage, overall reuse rate

Severity levels: **error** (must fix), **warning** (should fix), **info** (consider).

## Tips

- Run before opening a PR to catch standards issues early -- the branch diff mode is designed for exactly this workflow.
- If the skill detects more than 50 files, narrow the scope to a specific folder or commit to get more focused results.
- Answer "Yes" to the simplify prompt when reviewing performance-sensitive code -- the extra pass analyzes efficiency, concurrency, and hot-path optimizations.
- Make sure `grepai` is configured for your project (`/brewcode:grepai`) to get accurate duplicate detection results.
