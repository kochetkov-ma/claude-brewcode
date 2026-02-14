---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Text & File Optimizer

Optimize any text, file, or folder for maximum clarity and efficiency when working with Claude 4.x / Opus 4.5. Reduces tokens by restructuring prose to tables, removing filler, and applying best practices for LLM consumption.

## Quick Start

```bash
/brewcode:text-optimize [options] [file or folder]
```

## Modes

| Mode | Flag | Best For |
|------|------|----------|
| **Light** | `-l` | Text cleanup only — removes filler, fixes tone, keeps structure |
| **Medium** | _(default)_ | Balanced — converts tables, removes redundancy, merges duplicates |
| **Deep** | `-d` | Maximum compression — aggressive rephrasing, review diff after |

## Examples

```bash
# Medium mode (default)
/brewcode:text-optimize CLAUDE.md

# Light mode — safe for critical files
/brewcode:text-optimize -l CLAUDE.md

# Deep mode — max compression
/brewcode:text-optimize -d agents/my-agent.md

# Multiple files in parallel
/brewcode:text-optimize path1.md, path2.md

# Whole directory
/brewcode:text-optimize -d agents/
```

## What It Does

- Converts verbose prose to dense tables (3x more efficient)
- Removes filler words and passive language
- Restructures lists for clarity
- Converts code blocks to inline code when appropriate
- Merges redundant sections
- Verifies all file references are valid
- Reports token savings

## Output

Each optimization generates a report showing:
- Token reduction percentage
- Transformations applied
- Any issues found and fixed
- Cross-reference verification status

## Tips

- **Start light** (`-l`) on important docs to review changes
- **Use medium** (default) for general documentation
- **Use deep** (`-d`) for large prompts where tokens matter most
- Always review deep mode results before accepting
