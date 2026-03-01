# Memory Optimizer

Optimize Claude Code memory files through a 4-step interactive workflow: remove duplicates, migrate rules to proper config files, compress remaining entries, and validate the result. Typical savings: **30-50%** on token count in memory files, meaning faster context loading and lower API cost.

## Quick Start

1. Install:
   ```bash
   npx skills add kochetkov-ma/claude-brewcode
   ```

2. Use via slash command:
   ```
   /memory-optimize
   ```

   Or via natural language prompt:
   ```
   Optimize my Claude memory files
   Clean up memory duplicates
   ```

The skill scans all memory files under `~/.claude/projects/`, cross-references them against your CLAUDE.md and rules files, then walks you through each optimization step with approval prompts before making changes.

## Why Use This

- **Token savings** -- 30-50% fewer tokens in memory context means lower cost and more room for actual work
- **Interactive** -- approve each step, skip steps you don't want; nothing changes without your confirmation
- **Safe** -- shows before/after preview before making changes; content is only deleted when it provably exists elsewhere
- **Smart migration** -- moves rules to proper config files (CLAUDE.md, `.claude/rules/`, `~/.claude/rules/`) so they load reliably instead of depending on memory

## What It Does

### Step 1: Remove Duplicates

Finds memory entries that already exist in CLAUDE.md or rules files. Shows a table of what is redundant, asks for approval before deleting.

Example:

```
Found 4 duplicate/redundant entries (35% of memory):
| Entry | Memory File | Already In | Action |
|-------|-------------|------------|--------|
| "Use grepai first" | MEMORY.md:5 | rules/grepai-first.md | DELETE |
| "Constructor injection" | MEMORY.md:12 | CLAUDE.md:## DI | DELETE |
| "No System.out" | MEMORY.md:18 | rules/best-practice.md:7 | DELETE |
| "Edit bottom-up" | MEMORY.md:23 | rules/avoid.md:8 | DELETE |
```

Options: "Yes, delete all" / "Review each" / "Skip this step"

### Step 2: Migrate to Rules/CLAUDE.md

Identifies remaining entries that belong in persistent config files rather than memory. Uses a decision tree to categorize each entry:

- Global rule (all projects) --> `~/.claude/rules/`
- Project rule (this project) --> `.claude/rules/`
- Architectural decision --> project `CLAUDE.md`
- Reusable fact/pattern --> keep in memory
- Session context --> delete (ephemeral)

Shows a migration plan with target files and token savings, asks for approval before moving anything.

### Step 3: Compress

Converts remaining entries to token-efficient formats: prose to table rows, multiple entries to a single table, verbose descriptions to imperative one-liners.

Before:
```markdown
## Plugin Development (2026-01-15)
When developing plugins, remember to update BOTH plugin.json and marketplace.json
files on version bump, otherwise autocomplete will break because versions won't match.
```

After:
```markdown
## Plugin Dev
| Rule | Why |
|------|-----|
| Update BOTH plugin.json + marketplace.json on version bump | Autocomplete breaks on mismatch |
```

Shows 2-3 specific before/after samples with token savings, asks for approval.

### Step 4: Validate (Automatic)

Runs automatically after the previous steps. Checks for:

- Broken file path references in memory files
- Contradictions between memory and CLAUDE.md
- Malformed markdown
- Orphaned memory files (files with no MEMORY.md reference)

Reports any issues found and offers to fix them.

## Where Information Goes

| Content Type | Goes In | Format |
|---|---|---|
| Rule applies to all projects | `~/.claude/rules/*.md` | Table |
| Rule applies to this project | `.claude/rules/*.md` | Table |
| Architectural decision | `CLAUDE.md` | Section |
| Reusable fact/pattern | `MEMORY.md` | Section by topic |
| Session context | DELETE | -- |

## Part of Brewdoc

This skill is extracted from [brewdoc](https://github.com/kochetkov-ma/claude-brewcode) -- a documentation tools plugin for Claude Code with memory optimization, auto-sync, Claude installation docs, and Markdown to PDF.

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewdoc@claude-brewcode
```

## License

MIT
