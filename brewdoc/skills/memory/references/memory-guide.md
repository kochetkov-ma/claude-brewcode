# Memory Guide

## Decision Tree: Where Does This Information Belong?

```
Is this information?
├── A rule/constraint (should always apply)
│   ├── Applies to ALL projects → ~/.claude/rules/{topic}.md
│   └── Applies to THIS project only → .claude/rules/{topic}.md
├── An architectural decision (project-specific)
│   ├── Applies to ONE subtree (package/submodule/plugin) → that subtree's nested CLAUDE.md
│   └── Applies repo-wide → root CLAUDE.md (## Architecture or ## Decisions section)
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
| Subtree instructions | `<pkg>/CLAUDE.md` (any depth) | Sections; wins over root for its subtree |
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

| IS a duplicate | NOT a duplicate |
|---|---|
| Same rule appears in CLAUDE.md (exact or paraphrase) | More specific than the CLAUDE.md version (add detail, not replace) |
| Same pattern in a rules file | Context-specific exception to a general rule |
| References a pattern generalized in CLAUDE.md | Recent discovery not yet in CLAUDE.md |

## Obvious vs Worth Keeping

| Never write (obvious) | Write instead (domain / non-obvious) |
|---|---|
| "write good code", "clean architecture", "follow SOLID" | "orders are settled only after `PaymentIntent.succeeded`; the webhook can arrive before the DB commit" |
| "add tests", "handle errors" | "test DB resets per class, not per method — parallel tests share the schema" |
| "don't hardcode secrets" | "`.env.local` is git-ignored but baked into the Docker image by `COPY . .`" |
| a paraphrase of a tool's own docs | "`bump-version.sh` touches 6 JSON files; editing one by hand breaks autocomplete" |

Test before adding: would a competent model already assume this? -> delete. Did we hit it and lose
time? -> keep, one line, with its cause.

## Bottom-Up Editing

Always apply edits in descending line number order:
1. Sort all changes by line number (descending)
2. Apply from last line to first
3. This preserves line numbers for subsequent edits
