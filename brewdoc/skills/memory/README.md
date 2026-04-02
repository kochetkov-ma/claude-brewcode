---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Memory Optimizer

Optimizes Claude Code memory files through a 4-step interactive workflow -- removes duplicates, migrates entries to persistent config, compresses remaining content, and validates the final state.

## Quick Start

```bash
/brewdoc:memory
```

No arguments. The skill detects your memory directory automatically and guides you through each step interactively.

## How It Works

The skill loads all memory files, CLAUDE.md configs, and rules files into a context map. It then walks you through four steps: deduplication, migration, compression, and validation. Each step shows a preview of proposed changes and asks for your approval before modifying anything.

## The 4 Steps

| Step | Name | What Happens | Interactive? |
|------|------|--------------|--------------|
| 1 | Remove Duplicates | Finds memory entries already present in CLAUDE.md or rules files, then deletes them | Yes -- choose "delete all", "review each", or "skip" |
| 2 | Migrate to Rules | Moves entries better suited to `.claude/rules/` or `CLAUDE.md` out of memory | Yes -- choose "migrate all", "review each", or "skip" |
| 3 | Compress | Rewrites remaining entries using token-efficient formatting (tables, one-liners) | Yes -- choose "compress all" or "skip" |
| 4 | Validate | Checks for broken references, contradictions, and orphaned files; cleans up automatically | Automatic (asks only if orphaned files found) |

## Examples

### Good Usage

**After many sessions with accumulated memory.** Memory files grow over time as Claude saves patterns and facts. Running the optimizer consolidates and trims the bloat.

```bash
# Memory has grown to 200+ lines across multiple files
/brewdoc:memory
# Result: 40% token reduction, 12 duplicates removed, 8 entries migrated to rules
```

**Before a project handoff.** Clean memory ensures the next person (or session) gets a concise, non-redundant context.

```bash
# Preparing project for another developer
/brewdoc:memory
# Result: memory files are compact, all reusable rules live in .claude/rules/
```

**When memory contradicts CLAUDE.md.** Over time, memory entries may drift from the authoritative config. The optimizer detects contradictions and resolves them (CLAUDE.md always wins).

### Common Mistakes

**Running on a fresh project with minimal memory.** If you only have a few entries, there is nothing to optimize. Wait until memory has grown meaningfully.

**Skipping all steps every run.** If you skip deduplication, migration, and compression, the skill does nothing useful. Engage with at least one step for meaningful results.

**Running after every single session.** The optimizer is most effective after 10+ sessions of accumulated memory. Running it daily on a lightly-used project wastes time.

## What Gets Optimized

| Source | Location | What Happens |
|--------|----------|--------------|
| Project memory | `.claude/projects/<hash>/memory/*.md` or custom `autoMemoryDirectory` | Deduplicated, compressed, validated |
| Global CLAUDE.md | `~/.claude/CLAUDE.md` | Read-only -- used as reference for duplicate detection |
| Project CLAUDE.md | `./CLAUDE.md` | Read-only reference; migration target for architectural decisions |
| Global rules | `~/.claude/rules/*.md` | Read-only reference; migration target for cross-project rules |
| Project rules | `.claude/rules/*.md` | Read-only reference; migration target for project-specific rules |

**Removed:** Entries duplicating existing rules or CLAUDE.md content, contradictions (CLAUDE.md wins), broken file references.

**Migrated:** Rules/constraints moved to `.claude/rules/`, architectural decisions moved to `CLAUDE.md`.

**Compressed:** Prose rewritten as table rows, related entries merged into tables, verbose descriptions replaced with imperative one-liners.

## Output

The skill produces a summary report at the end:

```
## Memory Optimization Complete

### Summary
| Metric         | Before | After | Saved      |
|----------------|--------|-------|------------|
| Total entries  | 45     | 28    | 17         |
| Duplicates     | 12     | 0     | --         |
| Migrated       | --     | --    | 8          |
| Token estimate | ~1200  | ~720  | ~480 (40%) |

### Changes Made
- Step 1: Deleted 12 duplicate entries
- Step 2: Migrated 8 entries to rules/CLAUDE.md
- Step 3: Compressed 5 entries (25% reduction)
- Step 4: Fixed 1 broken reference, removed 0 orphaned files
```

Files modified: memory files in `$MEMORY_DIR`, and optionally `.claude/rules/*.md` or `CLAUDE.md` (migration targets).

## Tips

- **Run after 10+ sessions** when memory has accumulated enough content to benefit from optimization.
- **Say "review each" on your first run** to understand what the skill considers duplicate or migratable. After that, "delete all" / "migrate all" is safe.
- **Check the migration targets** after Step 2 -- the skill creates or appends to rules files, so verify the new rules fit your project structure.
- **Memory directory auto-detection** reads `.claude/settings.json` for a custom `autoMemoryDirectory`. If unset, it falls back to the legacy `~/.claude/projects/<hash>/memory/` path.
