# Memory Guide

## Decision Tree: Where Does This Information Belong?

```
Is this information?
├── A rule/constraint (should always apply)
│   ├── Applies to ALL projects → ~/.claude/rules/{topic}.md
│   └── Applies to THIS project only → .claude/rules/{topic}.md
├── An architectural decision (project-specific)
│   └── → project CLAUDE.md (## Architecture or ## Decisions section)
├── A reusable pattern/fact (sessions may forget)
│   └── → MEMORY.md (or topic file linked from MEMORY.md)
└── Session-specific context (current task state)
    └── → DO NOT save (ephemeral, delete if found)
```

## File Location Map

| Content Type | Location | Format |
|---|---|---|
| Global rules | `~/.claude/rules/*.md` | Table: # \| Avoid/Practice \| Context \| Why |
| Project rules | `.claude/rules/*.md` | Same format |
| Global instructions | `~/.claude/CLAUDE.md` | Sections + tables |
| Project instructions | `CLAUDE.md` or `.claude/CLAUDE.md` | Sections |
| Cross-session memory | `~/.claude/projects/{hash}/memory/MEMORY.md` | Sections by topic |
| Topic memory | `~/.claude/projects/{hash}/memory/{topic}.md` | Linked from MEMORY.md |

## Compression Patterns

| Pattern | Before | After | Savings |
|---------|--------|-------|---------|
| Prose → imperative | "When you need to update files, you should always use Edit tool..." | "Use Edit (not Write) for existing files" | ~70% |
| List → table row | "Avoid: X. Instead: Y. Because: Z" | `\| X \| Y \| Z \|` | ~40% |
| Multiple facts → table | 3 separate entries about the same topic | 1 table row per entry | ~30% |
| Verbose → concise | "It is important to note that..." | Remove filler | ~20% |

## Duplicate Detection

An entry IS a duplicate if:
1. Same rule appears in CLAUDE.md (exact or paraphrase)
2. Same pattern in a rules file
3. References a pattern that's been generalized in CLAUDE.md

An entry is NOT a duplicate if:
1. More specific than the CLAUDE.md version (add detail, not replace)
2. Context-specific exception to a general rule
3. Recent discovery not yet in CLAUDE.md

## Compression Examples

**Before:**
```
## Plugin Development (2026-01-15)
When developing Claude Code plugins, you should always remember to update BOTH plugin.json and marketplace.json files when bumping the version number, otherwise autocomplete functionality will break because the versions won't match.
```

**After:**
```
## Plugin Dev
| Rule | Why |
|------|-----|
| Update BOTH plugin.json + marketplace.json on version bump | Autocomplete breaks on mismatch |
```

## Bottom-Up Editing

Always apply edits in descending line number order:
1. Sort all changes by line number (descending)
2. Apply from last line to first
3. This preserves line numbers for subsequent edits
