---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Rules Skill

Extract and organize project guidelines from knowledge, files, or conversation.

## Usage

```bash
/brewcode:rules                    # Extract from current session
/brewcode:rules list               # List existing rules
/brewcode:rules path/to/KNOWLEDGE.jsonl  # Extract from KNOWLEDGE file
/brewcode:rules path/to/file "prompt text"  # Extract with custom prompt
```

## What It Does

Automatically updates your project's `.claude/rules/` with:
- **avoid.md** — anti-patterns to skip
- **best-practice.md** — practices to follow
- **Custom rule files** — domain-specific guidelines (e.g., `sql-avoid.md`)

Rules are sourced from:
- KNOWLEDGE.jsonl files (❌ avoid, ✅ practice, ℹ️ info)
- Explicit file paths
- Session conversation (auto-extracted findings)

## Output

Your rules are organized in `.claude/rules/` and automatically synced into project instructions.

## Note

Updates **project rules only** (`.claude/rules/`). Does not modify global rules (`~/.claude/rules/`).
