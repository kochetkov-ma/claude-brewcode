---
description: Detailed description of all brewdoc plugin commands
---

# Brewdoc Plugin Commands

> **Version:** 1.0.0 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Model | Args |
|---|---------|---------|-------|------|
| 1 | `/brewdoc:my-claude` | Generate docs about Claude Code installation and environment | opus | `[ext [context]] \| [r <query>]` |
| 2 | `/brewdoc:memory` | Optimize Claude Code memory in 4 interactive steps | opus | -- |

---

## 1. `/brewdoc:my-claude`

**Purpose:** Generates docs about your Claude Code installation and environment. Three modes: INTERNAL (local setup inventory), EXTERNAL (hook/context/agent architecture from official sources), RESEARCH (query-driven investigation from multiple web sources). Output goes to `~/.claude/brewdoc/` with INDEX tracking.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[ext [context]] \| [r <query>]` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `WebFetch`, `WebSearch`, `Skill` |

### Arguments

| Arguments | Mode | Sub-mode | Output File |
|-----------|------|----------|-------------|
| *(empty)* | INTERNAL | -- | `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md` |
| `ext` or `external` | EXTERNAL | default | `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md` |
| `ext context` or `external context` | EXTERNAL | context-schema | `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md` |
| `r <query>` or `research <query>` | RESEARCH | query = rest of args | `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md` |

### Modes

| Mode | Goal | Sources |
|------|------|---------|
| INTERNAL | Document local Claude Code setup | `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`, `~/.claude/agents/*.md`, `~/.claude/skills/`, project `CLAUDE.md`, `.claude/rules/*.md`, memory files |
| EXTERNAL (default) | Document hook/context/agent architecture | Local hook files, WebSearch (releases, CHANGELOG), official docs, GitHub, community forums |
| EXTERNAL (context-schema) | Document context injection schema | `additionalContext`, `updatedInput`, and related patterns |
| RESEARCH | Research specific Claude Code query | Official docs, GitHub, Reddit, forums, marketplaces (2-5 source groups) |

### INDEX Tracking

All entries tracked in `~/.claude/brewdoc/INDEX.jsonl`:

```jsonl
{"ts":"2026-02-28T10:00:00","mode":"internal","path":"~/.claude/brewdoc/20260228_my-claude-internal.md","title":"Internal Claude Setup Overview","version":"1.0"}
```

If an existing entry for the same mode exists, the skill offers to update (version bump).

### Workflow

**INTERNAL mode:**
1. Load `references/internal-mode.md`
2. Spawn 3 parallel `Explore` agents: (1) global `~/.claude` config, (2) project `.claude` config, (3) memory files
3. Aggregate findings into structured document
4. Write to `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md`
5. Spawn independent `reviewer` agent to validate facts (file paths exist, content accurate)
6. Apply reviewer fixes; add INDEX entry

**EXTERNAL mode (default):**
1. Load `references/external-mode.md`
2. Analyze local hook files for event model patterns
3. WebSearch for recent Claude Code releases and CHANGELOG
4. Spawn `general-purpose` agents for: official docs, GitHub releases, community forums
5. Generate `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md`; add INDEX entry

**EXTERNAL mode (context-schema):**
1. Focus on context injection schema (`additionalContext`, `updatedInput`, etc.)
2. Output to `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md`; add INDEX entry

**RESEARCH mode:**
1. Analyze query -- divide into 2-5 source groups (official docs, GitHub, Reddit, forums, marketplaces)
2. Spawn `general-purpose` agents per source group in parallel
3. Aggregate with citation tracking (source URL per fact)
4. Spawn independent `reviewer` agent to validate facts and source reliability
5. Output to `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md`; add INDEX entry

### Output

| Mode | Created Files |
|------|---------------|
| INTERNAL | `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md`, INDEX entry |
| EXTERNAL (default) | `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md`, INDEX entry |
| EXTERNAL (context) | `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md`, INDEX entry |
| RESEARCH | `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md`, INDEX entry |

### Output Document Structure

**INTERNAL:**
```markdown
# Claude Code Internal Setup -- {date}
## Global Configuration
### Instructions (CLAUDE.md)
### Rules ({N} rules)
### Agents ({N} agents)
### Skills ({N} skills)
## Project Configuration
### Project Instructions
### Project Rules
## Memory
### Active Memories ({N} entries)
## Summary
| Component | Count | Location |
```

**RESEARCH:**
```markdown
# Research: {query} -- {date}
## Findings
### {Source Group 1}
...
## Sources
| Fact | Source | Reliability |
## Review Verdict
```

### Examples

```
/brewdoc:my-claude
/brewdoc:my-claude ext
/brewdoc:my-claude ext context
/brewdoc:my-claude r "how do PreToolUse hooks modify agent prompts"
/brewdoc:my-claude research "Claude Code plugin marketplace submission process"
```

---

## 2. `/brewdoc:memory`

**Purpose:** Optimizes Claude Code memory files through 4 interactive steps: remove duplicates (entries already in CLAUDE.md/rules), migrate entries to proper locations, compress remaining entries for token efficiency, and validate final state.

| Parameter | Value |
|-----------|-------|
| **Arguments** | -- (no arguments, runs 4-step interactive workflow) |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Steps Overview

| Step | Name | Interactive | What Happens |
|------|------|-------------|--------------|
| 0 | Load Context | No | Glob memory files, read CLAUDE.md, read all rules |
| 1 | Analysis | Yes | Find entries duplicating CLAUDE.md/rules -- ask to delete |
| 2 | Migration | Yes | Categorize remaining entries -- ask to move to rules/CLAUDE.md |
| 3 | Compression | Yes | Compress prose to tables, verbose to concise -- ask to apply |
| 4 | Validation | No | `reviewer` agent checks; clean broken refs; final report |

### Workflow

**Phase 0: Load Context**
1. Glob all memory files: `~/.claude/projects/**/memory/*.md`
2. Read `~/.claude/CLAUDE.md` and project `CLAUDE.md` (if exists)
3. Glob and read `.claude/rules/*.md` (project) and `~/.claude/rules/*.md` (global)
4. Build context map: `memory_files`, `claude_md_sections`, `rules_files`

**Step 1: Analysis -- Remove Duplicates (Interactive)**
1. Spawn `Explore` agent to cross-reference all loaded files
2. Identify: same rule in CLAUDE.md, same pattern in a rules file, or contradicts CLAUDE.md (CLAUDE.md wins)
3. Show analysis table: Entry, Memory File, Already In, Action
4. `AskUserQuestion`: "Delete X duplicate entries (Y% of memory)?" -- Options: "Yes, delete all" / "Review each" / "Skip this step"
5. Apply deletion via `Edit` if approved

**Step 2: Migration -- Move to Rules/CLAUDE.md (Interactive)**

| Entry Type | Target |
|------------|--------|
| Rule/constraint, ALL projects | `~/.claude/rules/{topic}.md` |
| Rule/constraint, THIS project | `.claude/rules/{topic}.md` |
| Architectural decision | Project `CLAUDE.md` |
| Reusable pattern/fact | KEEP in memory |
| Session-specific | DELETE (ephemeral) |

1. Show categorization table: Entry, Current Location, Target, Token Reduction
2. `AskUserQuestion`: "Migrate X entries to rules/CLAUDE.md?" -- Options: "Yes, migrate all" / "Review each" / "Skip this step"
3. If approved: create/append target rule files, remove migrated entries from memory

**Step 3: Compression (Interactive)**

Techniques: prose to table row, multiple related entries to single table, verbose to imperative one-liner, list of examples to pattern + one example.

1. Show compression preview: Before, After, Savings (with 2-3 specific samples)
2. `AskUserQuestion`: "Compress remaining memory? (~Y% reduction)" -- Options: "Yes, compress all" / "Skip compression"
3. Apply via `Edit` (bottom-up order to preserve line numbers)

**Step 4: Validation (Automatic)**
1. Spawn `reviewer` agent: verify no broken file path refs, no contradictions with CLAUDE.md, well-formed markdown
2. Clean broken references via `Edit`
3. Check for orphaned memory files (`~/.claude/projects/**/memory/` with no reference)
4. Report orphaned files and ask to delete

### Output

```markdown
## Memory Optimization Complete

### Summary
| Metric | Before | After | Saved |
|--------|--------|-------|-------|
| Total entries | X | Y | Z |
| Duplicate entries | X | 0 | -- |
| Migrated entries | -- | -- | X |
| Token estimate | ~X | ~Y | ~Z (~P%) |

### Changes Made
- Step 1: Deleted X duplicate entries
- Step 2: Migrated X entries to rules/CLAUDE.md
- Step 3: Compressed X entries (Y% reduction)
- Step 4: Fixed X broken references, removed X orphaned files

### Final Memory Structure
{directory listing}
```

### Examples

```
/brewdoc:memory
```

No arguments. All interaction via `AskUserQuestion`. Each step can be skipped individually.

---

## Error Handling

| Error | Applies To | Action |
|-------|-----------|--------|
| Memory file empty | memory | Skip, report in validation |
| Broken file reference | memory | Clean in Step 4 |
| File not found | my-claude, memory | Skip, add to errors |

## Plugin Variable

brewdoc has no hooks. Skills resolve their own resources natively via `${CLAUDE_SKILL_DIR}` -- substituted by Claude Code itself. No hook injection is needed.
