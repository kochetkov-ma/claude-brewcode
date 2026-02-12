# Standards Review

Reviews code for project standards compliance and finds opportunities to reuse existing code.

## What It Does

Automatically detects your project's tech stack (Java/Kotlin, TypeScript/React, or Python), then analyzes code changes to identify:
- **Standards violations** — checks against your project rules
- **Reuse opportunities** — finds similar existing code to avoid duplication
- **Best practices** — highlights exemplary patterns worth emulating

## How to Use

```bash
/standards-review
```

## Arguments

| Argument | Example | Effect |
|----------|---------|--------|
| (empty) | `/standards-review` | Reviews current branch vs main |
| Commit | `/standards-review abc123f` | Reviews specific commit |
| Folder | `/standards-review src/main/java` | Reviews folder contents |
| Custom focus | `/standards-review -p "check accessibility"` | Adds custom analysis prompt |

## Examples

```bash
# Review current branch changes
/standards-review

# Review a specific commit
/standards-review abc123f

# Review source folder
/standards-review src/components

# Review with custom focus
/standards-review -p "focus on error handling"
```

## Output

Generates a **REPORT.md** showing:
- Summary of violations and reuse opportunities
- Grouped findings by severity (errors, warnings)
- Links to existing code you can reuse
- Statistics on code reuse rate

Report saved to `.claude/reports/{timestamp}_standards-review/`.
