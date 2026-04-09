---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Text Optimizer

Optimizes text files for LLM token efficiency with 4 compression modes — from light cleanup to deep dictionary-encoded compression for LLM-only documents. Applies 40+ validated rules for Claude 4.x, supports smart auto-detection of optimal mode, and verifies no information loss. Works on single files, multiple files in parallel, or entire directories.

## Quick Start

```bash
/brewtools:text-optimize CLAUDE.md
```

Auto-detects optimal mode for the file (deep for CLAUDE.md, standard for README.md), applies all standard transformations, and prints a report with token savings.

## Modes

| Mode | Flag | Best For | What Changes |
|------|------|----------|--------------|
| **Light** | `-l` | Critical files, production prompts | Filler removal, tone fixes, reference checks — structure untouched |
| **Medium** | _(default)_ | General docs, agents, skills | Tables, bullets, merged sections, full rule set |
| **Standard** | `-s` | README, docs, user-facing content | 30-50% compression preserving human readability. Filler removal, paragraph→bullets, prose→tables. 1 verification round |
| **Deep** | `-d` | CLAUDE.md, system prompts, agent/skill defs | 2-3x compression for LLM-only consumption. Dictionary encoding, symbol substitutions, abbreviation tables. 2 verification rounds |

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

# Standard mode — 30-50% compression, stays human-readable
/brewtools:text-optimize -s docs/getting-started.md

# Deep mode — max compression with dictionary encoding for LLM consumption
/brewtools:text-optimize -d CLAUDE.md

# Auto-detect: CLAUDE.md → deep, README.md → standard
/brewtools:text-optimize CLAUDE.md
/brewtools:text-optimize README.md

# Prompt hint overrides auto-detect
/brewtools:text-optimize "super compress" verbose-doc.md
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

# Using deep mode on user-facing documentation
/brewtools:text-optimize -d README.md
# Deep mode uses dictionary encoding and symbols not readable by humans.
# Use standard (-s) for docs that humans will read.

# Expecting deep mode output to be human-readable
# Deep mode is designed for LLM consumption only (CLAUDE.md, system prompts).
# The output uses DICT headers, symbols (→, !=, ∵), and abbreviations.
```

## Auto-Detection

When no mode flag is provided, the optimizer analyzes the file path and content to select the best mode:

| File Pattern | Auto-Selected Mode |
|--------------|-------------------|
| `CLAUDE.md`, `.claude/rules/*.md` | Deep |
| `.claude/agents/*.md`, `.claude/skills/**/SKILL.md` | Deep |
| `KNOWLEDGE.*`, system prompts | Deep |
| `README.md`, `docs/**` | Standard |
| API references, user-facing docs | Standard |
| Unknown / mixed | Asks user |

Prompt text can also hint at the mode: "compress for LLM" → deep, "safe compress" → standard, "super compress" → deep.

## Verification

Standard and deep modes include automatic verification to prevent information loss.

| Mode | Rounds | Pass Threshold |
|------|--------|----------------|
| Standard | 1 | All facts preserved |
| Deep | 2 | >= 95% semantic match |

The report includes a semantic match percentage and lists any facts that were lost or distorted during compression.

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
| Semantic Match | Compression ratio and semantic match % (standard/deep modes) |

Files are modified in-place. The report is printed to the conversation.

## Tips

- **Start with light mode** (`-l`) on important files to preview what changes look like before committing to deeper optimization.
- **Review deep mode diffs carefully** -- aggressive rephrasing can alter meaning in domain-specific content.
- **Run without arguments** to optimize all standard locations at once: `CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md`.
- **Parallel processing** kicks in automatically when you pass multiple files or a directory -- no extra flags needed.

## Documentation

Full docs: [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/)
