---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Standards Review

Reviews code for project standards compliance and finds opportunities to reuse existing code.

## What It Does

Automatically detects your project's tech stack (Java/Kotlin, TypeScript/React, or Python), then analyzes code changes to identify:
- **Standards violations** — checks against your project rules and stack-specific guidelines
- **Reuse opportunities** — uses semantic search (`grepai_search`) to find similar existing code to avoid duplication
- **Best practices** — highlights exemplary patterns worth emulating

Supports multi-stack projects (processes each stack separately).

## How to Use

```bash
/brewcode:standards-review
```

## Arguments

| Argument | Example | Effect |
|----------|---------|--------|
| (empty) | `/brewcode:standards-review` | Reviews current branch vs main |
| Commit | `/brewcode:standards-review abc123f` | Reviews specific commit |
| Folder | `/brewcode:standards-review src/main/java` | Reviews folder contents |
| Custom focus | `/brewcode:standards-review -p "check accessibility"` | Adds custom analysis prompt |

## Examples

```bash
# Review current branch changes
/brewcode:standards-review

# Review a specific commit
/brewcode:standards-review abc123f

# Review source folder
/brewcode:standards-review src/components

# Review with custom focus
/brewcode:standards-review -p "focus on error handling"
```

## Output

Generates a **REPORT.md** showing:
- Summary of violations and reuse opportunities
- Grouped findings by severity (errors, warnings, info)
- Links to existing code you can reuse
- Reuse recommendations with similarity scores:
  - **REUSE** (90-100%) — import existing code
  - **EXTEND** (70-89%) — add params/config to existing
  - **CONSIDER** (50-69%) — evaluate effort vs benefit
  - **KEEP_NEW** (<50%) — justified new code
- Statistics on code reuse rate

Report saved to `.claude/reports/{timestamp}_standards-review/`.

## How It Works

1. **Detects stack** — reads `pom.xml`, `package.json`, `pyproject.toml` to identify Java/Kotlin, TypeScript/React, or Python
2. **Loads guidelines** — reads stack-specific `references/*.md` files plus your `.claude/rules/`
3. **Gets files** — based on input (branch diff, commit, or folder) filtered by stack patterns
4. **Search-first** — uses `grepai_search` to find similar existing code before flagging duplication
5. **Expert analysis** — spawns specialized reviewers per file type (entities, services, tests, etc.)
6. **Validation** — reviewer agent verifies findings against actual code
7. **Report** — aggregates all findings into structured REPORT.md
