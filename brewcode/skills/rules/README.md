---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Rules

Extracts learnings, anti-patterns, and best practices from KNOWLEDGE files, arbitrary files, or the current conversation -- then organizes them into structured `.claude/rules/` files that Claude Code loads automatically on every session.

## Quick Start

```
/brewcode:rules
```

Scans the current session for the 5 most impactful findings and writes them to your project rules.

## Modes

| Mode | Trigger | What it does |
|------|---------|--------------|
| **Session** | `/brewcode:rules` (no arguments) | Extracts top 5 findings from the current conversation, classifies each as avoid or best-practice, writes to rules |
| **File** | `/brewcode:rules path/to/KNOWLEDGE.jsonl` | Parses a KNOWLEDGE.jsonl file, maps entries by type: `t:"X"` to avoid, `t:"V"` to best-practice |
| **Prompt** | `/brewcode:rules path/to/file "your instructions"` | Reads the given file and applies your custom prompt to extract rules from it |
| **List** | `/brewcode:rules list` | Lists all rule files in `.claude/rules/` with entry counts per file |

## Examples

### Good Usage

```bash
# After a debugging session -- capture what you learned
/brewcode:rules

# Import rules from a completed brewcode task's knowledge file
/brewcode:rules .claude/tasks/20260401_auth_task/KNOWLEDGE.jsonl

# Extract SQL-specific rules from a code review document
/brewcode:rules docs/sql-review.md "Extract SQL anti-patterns and best practices"

# Check what rule files exist and how many entries each has
/brewcode:rules list
```

### Common Mistakes

```bash
# WRONG: Passing a directory instead of a file
/brewcode:rules .claude/tasks/
# FIX: Point to the specific KNOWLEDGE.jsonl inside the task directory
/brewcode:rules .claude/tasks/20260401_auth_task/KNOWLEDGE.jsonl

# WRONG: Using "list" with extra arguments
/brewcode:rules list some-filter
# FIX: "list" takes no arguments -- it always shows all rule files
/brewcode:rules list

# WRONG: Expecting global rules to be updated
# The skill ONLY writes to project .claude/rules/, never to ~/.claude/rules/
```

## Output

Rule files are created or updated in your project's `.claude/rules/` directory:

| File | Content |
|------|---------|
| `avoid.md` | General anti-patterns (table format: #, Avoid, Instead, Why) |
| `best-practice.md` | General best practices (table format: #, Practice, Context, Source) |
| `{prefix}-avoid.md` | Domain-specific anti-patterns (e.g., `sql-avoid.md`, `test-avoid.md`) |
| `{prefix}-best-practice.md` | Domain-specific practices (e.g., `sql-best-practice.md`) |

All files use a markdown table format validated by the built-in `rules.sh validate` script.

## Deduplication

New entries go through a 3-check protocol before being added:

1. **Within-file similarity** -- entries >70% similar are skipped, 40-70% are merged
2. **Cross-file antonym** -- if an item appears in both avoid and best-practice, only the avoid entry is kept
3. **CLAUDE.md duplicate** -- entries already covered in CLAUDE.md are skipped

## Tips

- Run `/brewcode:rules` at the end of any long debugging or implementation session to capture learnings before they are lost to compaction.
- Use prompt mode with a code review doc or retrospective notes to bulk-import rules from external sources.
- After importing, run `/brewcode:rules list` to verify entry counts and spot unbalanced files.
- Domain-specific rule files (e.g., `test-avoid.md`) keep rules organized and reduce noise for unrelated tasks.

## Documentation

Full docs: [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/)
