---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Text Optimizer

Optimizes text files for LLM token efficiency by restructuring prose into tables, removing filler, and applying 30+ validated rules for Claude 4.x consumption. Works on single files, multiple files in parallel, or entire directories.

## Quick Start

```bash
/brewtools:text-optimize CLAUDE.md
```

Runs medium mode (default) on the specified file, applies all standard transformations, and prints a report with token savings.

## Modes

| Mode | Flag | Best For | What Changes |
|------|------|----------|--------------|
| **Light** | `-l` | Critical files, production prompts | Filler removal, tone fixes, reference checks -- structure untouched |
| **Medium** | _(default)_ | General docs, agents, skills | Tables, bullets, merged sections, full rule set |
| **Deep** | `-d` | Large prompts where every token counts | Aggressive rephrasing, max compression -- always review diff after |

## Examples

### Good Usage

```bash
# Single file, medium mode (default)
/brewtools:text-optimize CLAUDE.md

# Light mode on a production agent -- safe, minimal changes
/brewtools:text-optimize -l .claude/agents/reviewer.md

# Deep mode on a verbose prompt you want compressed
/brewtools:text-optimize -d prompts/analysis-prompt.md

# Multiple files processed in parallel
/brewtools:text-optimize agents/planner.md, agents/executor.md, CLAUDE.md

# All markdown files in a directory
/brewtools:text-optimize -d agents/
```

### Common Mistakes

```bash
# Running deep mode on production files without reviewing the diff
/brewtools:text-optimize -d CLAUDE.md
# Deep mode aggressively rephrases and merges sections.
# ALWAYS review the diff before accepting deep mode changes.

# Optimizing generated or third-party files you don't control
/brewtools:text-optimize node_modules/some-lib/README.md
# Only optimize files YOU maintain. External files get overwritten on update.

# Using deep mode on files with precise technical references
/brewtools:text-optimize -d API-REFERENCE.md
# Deep mode may rephrase domain terms or merge sections that need to stay separate.
# Use light (-l) or medium for reference documentation.
```

## What It Does

- Converts verbose prose to dense tables (up to 3x more token-efficient)
- Removes filler words and passive constructions
- Restructures numbered lists to bullets where order does not matter
- Converts multi-line code blocks to inline code when a single expression suffices
- Merges redundant or overlapping sections
- Applies positive framing ("do Y" instead of "don't do X")
- Verifies all file paths (R.1), URLs (R.2), and circular references (R.3)
- Uses standard abbreviations in tables only (full words in prose)

## Output

Each file produces an optimization report containing:

| Section | Contents |
|---------|----------|
| Metrics | Lines and tokens -- before, after, percent reduction |
| Rules Applied | Which rule IDs were used and what changed |
| Issues Found | Broken references, redundancies, structural problems -- and how they were fixed |
| Cross-Reference Check | Verification status for file paths, URLs, circular refs |

Files are modified in-place. The report is printed to the conversation.

## Tips

- **Start with light mode** (`-l`) on important files to preview what changes look like before committing to deeper optimization.
- **Review deep mode diffs carefully** -- aggressive rephrasing can alter meaning in domain-specific content.
- **Run without arguments** to optimize all standard locations at once: `CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md`.
- **Parallel processing** kicks in automatically when you pass multiple files or a directory -- no extra flags needed.

## Documentation

Full docs: [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/)
