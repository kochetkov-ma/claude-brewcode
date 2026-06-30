---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Rules

Captures learnings, anti-patterns, and best practices — from KNOWLEDGE files, arbitrary files, or the current conversation — then organizes them into structured `.claude/rules/` files that Claude Code loads automatically on every session.

**Target scope:** project `.claude/rules/` only. The skill never writes to `~/.claude/rules/`.

## Quick Start

```
/brewcode:rules
```

No arguments: presents the interactive menu with Status (rules) pre-selected as the recommended action.

Pass a free-form prompt to skip the menu entirely:

```
/brewcode:rules capture what we learned fixing the N+1 query bug today
```

## How It Works — Unified 6-Step Flow

Every invocation goes through the same flow:

1. **Input gate** — reads `$ARGUMENTS`; if empty, goes to the interactive menu.
2. **Auto-mode select** — infers mode from the prompt and announces:
   `Mode: <mode> (rules) — chosen because <evidence>`
3. **No-prompt menu** — when no arguments given, shows a single `AskUserQuestion`:
   - Status (rules) [recommended]
   - Status (all: agents + rules + skills)
   - Create
   - Improve
   - Review
   - List (plain)
   - Cancel
4. **Dispatch** — routes to `bc-rules-organizer` agent (create / improve / review / batch) or runs `rules.sh list` directly (list mode).
5. **Real status** — rich output showing current rule files, entry counts, and a diff of changes applied.
6. **Mandatory final output** — structured summary of what was written, merged, and skipped. Omitted only for `list` mode.

## Modes

| Mode | How it activates | What it does |
|------|-----------------|--------------|
| `status` | Default when no other mode is detected | Shows file counts, last-modified, coverage |
| `list` | Explicit only — "list", "show rules", "what rules" | Runs `rules.sh list`, plain file listing |
| `create` | "create", "add", "new rule" in prompt | bc-rules-organizer creates entries from knowledge source |
| `improve` | "improve", "update", "refine" in prompt | bc-rules-organizer refines existing entries |
| `review` | "review", "check", "audit" in prompt | bc-rules-organizer audits rule files for quality |
| `batch` | Multiple sources detected | bc-rules-organizer processes all sources in one pass |

## Knowledge Sources for Create / Improve

| Source | Example |
|--------|---------|
| KNOWLEDGE.jsonl path | `/brewcode:rules path/to/KNOWLEDGE.jsonl` — parses `t:"❌"` → avoid, `t:"✅"` → best-practice |
| File path + inline prompt | `/brewcode:rules docs/retro.md "extract SQL anti-patterns"` |
| Session learnings (no path) | `/brewcode:rules capture today's key findings` — extracts 5 most impactful findings as ❌/✅ |

## Examples

```bash
# Open the interactive menu
/brewcode:rules

# Check the current state of rule files
/brewcode:rules what is the current state of our rules

# Capture session learnings after debugging
/brewcode:rules capture what we learned fixing the auth bug

# Import from a KNOWLEDGE.jsonl file
/brewcode:rules path/to/KNOWLEDGE.jsonl add new entries

# Extract anti-patterns from a review document
/brewcode:rules docs/sql-review.md "extract SQL anti-patterns and best practices"

# Plain listing of all rule files and entry counts
/brewcode:rules list
```

## Output Files

Rule files are created or updated in `.claude/rules/`:

| File | Content |
|------|---------|
| `avoid.md` | General anti-patterns (table: #, Avoid, Instead, Why) |
| `best-practice.md` | General best practices (table: #, Practice, Context, Source) |
| `{prefix}-avoid.md` | Domain-specific anti-patterns, e.g. `sql-avoid.md`, `test-avoid.md` |
| `{prefix}-best-practice.md` | Domain-specific best practices, e.g. `sql-best-practice.md` |

All files use the markdown table format validated by `rules.sh validate`.

## Deduplication — 3-Check Protocol

New entries go through three checks before being written:

1. **Within-file similarity** — entries >70% similar are skipped; 40–70% are merged
2. **Cross-file antonym** — item in both avoid and best-practice → keep the avoid entry only
3. **CLAUDE.md duplicate** — entries already in CLAUDE.md are skipped

No CLAUDE.md update step: the skill writes rule files only.

## Tips

- Run `/brewcode:rules` at the end of any long debugging or implementation session to capture learnings before compaction.
- Use file + prompt mode to bulk-import rules from code review docs or retrospective notes.
- `list` is the fastest way to verify file counts and spot unbalanced rule files.
- Domain-specific files (`test-avoid.md`, `sql-best-practice.md`) reduce noise for unrelated tasks.

## Documentation

Full docs: [rules](https://doc-claude.brewcode.app/brewcode/skills/rules/)
