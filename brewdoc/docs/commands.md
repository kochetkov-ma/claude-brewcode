---
auto-sync: enabled
auto-sync-date: 2026-02-28
auto-sync-type: doc
description: Detailed description of all brewdoc plugin commands
---

# Brewdoc Plugin Commands

> **Version:** 1.0.0 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Model | Args |
|---|---------|---------|-------|------|
| 1 | `/brewdoc:auto-sync` | Universal documentation sync for skills, agents, rules, markdown | opus | `[status] \| [init <path>] \| [global] \| [path]` |
| 2 | `/brewdoc:my-claude` | Generate documentation about Claude Code installation and environment | opus | `[ext [context]] \| [r <query>]` |
| 3 | `/brewdoc:memory` | Optimize Claude Code memory in 4 interactive steps | opus | -- |

## Plugin Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `bd-auto-sync-processor` | sonnet | Processes single document for auto-sync: analyze, research, apply changes |

---

## 1. `/brewdoc:auto-sync`

**Purpose:** Universal documentation sync engine. Discovers tagged markdown files, detects staleness via INDEX, and delegates per-file processing to `bd-auto-sync-processor` agents running in parallel. Supports project-scoped, global, single-file, and folder-level sync.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[status] \| [init <path>] \| [global] \| [path]` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `WebFetch`, `Skill` |

### Arguments

| Argument | Mode | Description |
|----------|------|-------------|
| `status` | STATUS | Report INDEX state and exit |
| `init <path>` | INIT | Tag single file with frontmatter + add to INDEX and exit |
| `global` | GLOBAL | Sync all tagged `.md` in `~/.claude/**` |
| *(empty)* | PROJECT | Sync all tagged `.md` in `.claude/**` |
| `<file path>` | FILE | Sync a single file |
| `<folder path>` | FOLDER | Sync all `.md` in folder |

### Modes

| Mode | Trigger | Scope |
|------|---------|-------|
| STATUS | `status` | Report INDEX state, list indexed/non-indexed files |
| INIT | `init <path>` | Tag single file with frontmatter + add to INDEX |
| GLOBAL | `global` | `~/.claude/**` (excludes managed dirs) |
| PROJECT | *(no args)* | `.claude/**` (excludes managed dirs) |
| FILE | file path | Single file |
| FOLDER | folder path | All `.md` files in folder |

**Managed directories** (excluded from auto-scan; explicit path required):
- `rules/` -- sync via `/brewdoc:auto-sync .claude/rules`
- `agents/` -- sync via `/brewdoc:auto-sync .claude/agents`
- `skills/` -- sync via `/brewdoc:auto-sync .claude/skills`

### INDEX Format

Location: `.claude/auto-sync/INDEX.jsonl` (project) or `~/.claude/auto-sync/INDEX.jsonl` (global)

```jsonl
{"p":"skills/auth/SKILL.md","t":"skill","u":"2026-02-05","pr":"default"}
```

| Field | Description |
|-------|-------------|
| `p` | Relative path from scope root |
| `t` | Type: `skill` / `agent` / `rule` / `config` / `doc` |
| `u` | Last sync date (`YYYY-MM-DD`) |
| `pr` | Protocol: `default` / `override` |

### Frontmatter Tags

Required on each synced document (3 fields):

```yaml
auto-sync: enabled
auto-sync-date: 2026-02-28
auto-sync-type: skill   # skill | agent | rule | config | doc
```

Optional override (multiline YAML, stored in frontmatter only -- never in body):

```yaml
auto-sync-override: |
  sources: src/**/*.ts, .claude/agents/*.md
  focus: API endpoints, error handling
  preserve: ## User Notes, ## Custom Config
```

When `auto-sync-override:` is present, INDEX entry gets `pr: "override"`.

| Override Field | Purpose |
|----------------|---------|
| `sources:` | Additional glob patterns for context (merged with instruction Research Directions) |
| `focus:` | Override research areas (replaces instruction Research Directions focus) |
| `preserve:` | Sections to never modify (added constraint) |

### Bash Scripts

| Script | Purpose |
|--------|---------|
| `detect-mode.sh $ARGUMENTS` | Parse arguments, output `MODE\|ARG\|FLAGS` |
| `discover.sh "$SCOPE_PATH" typed` | Find tagged files, output `TYPE\|PATH` per line (max 50) |
| `index-ops.sh add` | Add entry to INDEX |
| `index-ops.sh stale "$INDEX_FILE" "$INTERVAL_DAYS"` | Find stale entries |
| `index-ops.sh update` | Update entry's `u` field to today |

### Workflow

**STATUS mode:**
1. Read `INDEX.jsonl`, verify indexed files exist
2. Find all `.md` files in scope
3. Compare indexed vs found -- identify non-indexed
4. Detect type for non-indexed via `discover.sh typed`
5. Output report: Indexed, Non-Indexed, Summary
6. Exit

**INIT mode:**
1. Read `<path>` -- if not found, error and exit
2. If already has `auto-sync: enabled` -- report "Already tagged", exit
3. Detect type via `discover.sh`
4. Add frontmatter: `auto-sync: enabled`, `auto-sync-date: {today}`, `auto-sync-type: {type}`
5. Check `auto-sync-override:` -- set `pr: override|default`
6. Add to INDEX via `index-ops.sh add`
7. Output: path, type, protocol; exit

**SYNC mode (PROJECT / GLOBAL / FILE / FOLDER):**
1. **Setup INDEX** -- create `INDEX.jsonl` if missing
2. **Discover + Queue** -- find tagged files, auto-add new ones, find stale entries via `index-ops.sh stale`
3. **Process** -- launch `bd-auto-sync-processor` agents (max `PARALLEL_AGENTS` batches, model=sonnet)
4. **Update INDEX** -- for `updated`/`unchanged` results, update `u` to today; for `error`, skip (remains stale for retry)
5. **Report** -- output table with Discovered, Queued, Updated, Unchanged, Errors counts

### Output

| Mode | Created/Modified |
|------|------------------|
| STATUS | *(read-only report)* |
| INIT | Target file (frontmatter added), `INDEX.jsonl` (entry added) |
| SYNC | Synced files (content updated), `INDEX.jsonl` (dates updated) |

### Examples

```
/brewdoc:auto-sync status
/brewdoc:auto-sync init .claude/agents/reviewer.md
/brewdoc:auto-sync global
/brewdoc:auto-sync
/brewdoc:auto-sync .claude/rules/
/brewdoc:auto-sync brewdoc/skills/auto-sync/SKILL.md
```

---

## 2. `/brewdoc:my-claude`

**Purpose:** Generates documentation about your Claude Code installation and environment. Three modes: INTERNAL (local setup inventory), EXTERNAL (hook/context/agent architecture from official sources), and RESEARCH (query-driven investigation from multiple web sources). All output goes to `~/.claude/brewdoc/` with INDEX tracking.

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
1. Load reference file from `$BD_PLUGIN_ROOT/skills/my-claude/references/internal-mode.md`
2. Spawn 3 parallel `Explore` agents: (1) global `~/.claude` config, (2) project `.claude` config, (3) memory files
3. Aggregate findings into structured document
4. Write to `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md`
5. Spawn independent `reviewer` agent to validate facts (file paths exist, content accurate)
6. Apply reviewer fixes
7. Add INDEX entry

**EXTERNAL mode (default):**
1. Load reference file from `$BD_PLUGIN_ROOT/skills/my-claude/references/external-mode.md`
2. Analyze local hook files for event model patterns
3. WebSearch for recent Claude Code releases and CHANGELOG
4. Spawn `general-purpose` agents for: official docs, GitHub releases, community forums
5. Generate `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md`
6. Add INDEX entry

**EXTERNAL mode (context-schema):**
1. Focus specifically on context injection schema (`additionalContext`, `updatedInput`, etc.)
2. Output to `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md`
3. Add INDEX entry

**RESEARCH mode:**
1. Analyze query -- divide into 2-5 source groups (official docs, GitHub, Reddit, forums, marketplaces)
2. Spawn `general-purpose` agents per source group in parallel
3. Aggregate with citation tracking (source URL per fact)
4. Spawn independent `reviewer` agent to validate facts and source reliability
5. Output to `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md`
6. Add INDEX entry

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

## 3. `/brewdoc:memory`

**Purpose:** Optimizes Claude Code memory files through 4 interactive steps: remove duplicates (entries already in CLAUDE.md/rules), migrate entries to proper locations (rules/CLAUDE.md), compress remaining entries for token efficiency, and validate final state with automated cleanup.

| Parameter | Value |
|-----------|-------|
| **Arguments** | -- (no arguments, runs 4-step interactive workflow) |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Arguments

No arguments. The command runs a fixed 4-step interactive workflow.

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
3. Glob and read `.claude/rules/*.md` (project rules)
4. Glob and read `~/.claude/rules/*.md` (global rules)
5. Build context map: `memory_files`, `claude_md_sections`, `rules_files`

**Step 1: Analysis -- Remove Duplicates (Interactive)**
1. Spawn `Explore` agent to cross-reference all loaded files
2. Identify entries where: same rule already in CLAUDE.md, same pattern already in a rules file, or contradicts CLAUDE.md (CLAUDE.md wins)
3. Show analysis table: Entry, Memory File, Already In, Action
4. `AskUserQuestion`: "Delete X duplicate entries (Y% of memory)?"
   - Options: "Yes, delete all" / "Review each" / "Skip this step"
5. Apply deletion via `Edit` if approved

**Step 2: Migration -- Move to Rules/CLAUDE.md (Interactive)**

Decision tree per entry:

| Entry Type | Target |
|------------|--------|
| Rule/constraint, ALL projects | `~/.claude/rules/{topic}.md` |
| Rule/constraint, THIS project | `.claude/rules/{topic}.md` |
| Architectural decision | Project `CLAUDE.md` |
| Reusable pattern/fact | KEEP in memory |
| Session-specific | DELETE (ephemeral) |

1. Show categorization table: Entry, Current Location, Target, Token Reduction
2. `AskUserQuestion`: "Migrate X entries to rules/CLAUDE.md?"
   - Options: "Yes, migrate all" / "Review each" / "Skip this step"
3. If approved: create/append target rule files, remove migrated entries from memory

**Step 3: Compression (Interactive)**

Compression techniques:
- Prose to table row
- Multiple related entries to single table
- Verbose description to imperative one-liner
- List of examples to pattern + one example

1. Show compression preview: Before, After, Savings
2. Show 2-3 specific before/after samples
3. `AskUserQuestion`: "Compress remaining memory? (~Y% reduction)"
   - Options: "Yes, compress all" / "Skip compression"
4. Apply compression via `Edit` (bottom-up order to preserve line numbers)

**Step 4: Validation (Automatic)**
1. Spawn `reviewer` agent to verify: no broken file path references, no contradictions with CLAUDE.md, well-formed markdown
2. Clean broken references via `Edit`
3. Check for orphaned memory files (files in `~/.claude/projects/**/memory/` with no reference)
4. Report orphaned files and ask to delete

### Output

Final report:

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

The command takes no arguments. All interaction happens through `AskUserQuestion` prompts during execution. Each step can be skipped individually.

---

## Error Handling

| Error | Applies To | Action |
|-------|-----------|--------|
| INDEX corrupt | auto-sync | Rebuild from discovery |
| File not found | auto-sync, memory | Skip, add to errors |
| Agent timeout | auto-sync | Retry once |
| No tagged files | auto-sync | Report "0 found" |
| Instruction file missing | auto-sync (processor) | Fall back to basic checklist |
| Edit conflict | auto-sync (processor) | Log error, skip that change |
| Override parse error | auto-sync (processor) | Fall back to default instructions |
| Memory file empty | memory | Skip, report in validation |
| Broken file reference | memory | Clean in Step 4 |
| `/brewdoc:doc` called | auto-sync | "Use /brewdoc:auto-sync" |

## Plugin Variable

| Variable | Injected By | Available In | Value |
|----------|-------------|--------------|-------|
| `BD_PLUGIN_ROOT` | pre-task.mjs | Skills, Agents | Absolute path to brewdoc plugin root |
