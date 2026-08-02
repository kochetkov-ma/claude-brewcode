---
description: Detailed description of all brewdoc plugin commands
---

# Brewdoc Plugin Commands

> **Version:** 1.0.0 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Model | Args |
|---|---------|---------|-------|------|
| 1 | `/brewdoc:my-claude` | Generate docs about Claude Code installation and environment | opus | `[ext [context]] \| [r <query>]` |
| 2 | `/brewdoc:memory` | Sync and shrink Claude Code memory, rules, CLAUDE.md, conventions | opus | `<free-form prompt: emphasis only; empty = sync whole memory surface; 'full' adds agent+skill rosters>` |

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

**Purpose:** Re-verifies every piece of persistent memory against the code and shrinks it. `sync` (default) covers memory files + root/nested CLAUDE.md + rules + conventions; `full` adds the agent and skill rosters. A prompt is emphasis only, never a filter -- the whole surface is always checked.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `<free-form prompt: emphasis only; empty = sync whole memory surface; 'full' adds agent+skill rosters>` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `AskUserQuestion` |

### Modes

| Mode | Chosen when | Runs |
|------|-------------|------|
| `sync` (**default**) | empty prompt, or any prompt without a `full` signal | `references/mode-sync.md` S0-S5 |
| `full` | prompt says full / всё / names agents or skills | `references/mode-sync-full.md` F0-F4: `sync` + agent roster + skill roster + cross-layer dedup |

### Surface (every run)

| Layer | Path |
|-------|------|
| Memory files | `$MEMORY_DIR/*.md` (`autoMemoryDirectory`, else `~/.claude/projects/<hash>/memory/`) |
| Root CLAUDE.md | `./CLAUDE.md`, `./.claude/CLAUDE.md` |
| Nested CLAUDE.md | every `**/CLAUDE.md` at any depth |
| Global CLAUDE.md | `~/.claude/CLAUDE.md` (reference) |
| Rules | `.claude/rules/*.md`, `~/.claude/rules/*.md` |
| Conventions | `CONVENTIONS.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/**/convention*.md`, `@path` imports |

`full` additionally syncs `.claude/agents/*.md` + `*/agents/*.md` and `.claude/skills/*/SKILL.md` + `*/skills/*/SKILL.md` (with `brewcode:agent-creator`/`brewcode:skill-creator` when brewcode is installed) -- it never calls `/brewcode:agents` or `/brewcode:skills` directly (both `disable-model-invocation: true`, user-only).

### Workflow

1. **Order:** DELETE -> COMPRESS -> MOVE -> ADD, per file, longest files first.
2. **Verdicts:** DUPLICATE, OBVIOUS, STALE, OLD, EPHEMERAL, DRIFT, MISPLACED, MISSING. Adds must be non-obvious, domain-specific, source-verified, and their absence must cost a real failure.
3. **Non-growth:** each file `<=` its original line count, total delta `<= 0`.
4. **Fan-out:** one subagent per file, batches `<= 8`, `Edit`-only bottom-up; orchestrator runs a cross-file pass.
5. **Gate:** one `AskUserQuestion` -- "Apply all" / "Apply deletions+compression only" / "Review each" / "Cancel".
6. **`full` only:** agent + skill rosters synced in-place under the same rules, then cross-layer dedup.

### Output

```markdown
## memory [sync|full]

### Surface (per layer)
| Layer | Files | Lines before | Lines after | Delta |

### Longest files / Deleted / Stale facts corrected / Moved / Added / Skipped / Next Steps
```

### Examples

```
/brewdoc:memory
/brewdoc:memory "focus on the CI facts"
/brewdoc:memory "full"
```

Empty prompt and free-text prompt run the same `sync` sweep; only a `full` signal changes scope.

---

## Error Handling

| Error | Applies To | Action |
|-------|-----------|--------|
| Memory dir absent | memory | Report; sync the rest of the surface |
| Total delta positive | memory | State per-line justification, never buried |
| Confirmation cancelled | memory | Nothing written; `full` skips the roster pass |
| File not found | my-claude | Skip, add to errors |

## Plugin Variable

brewdoc has no hooks. Skills resolve their own resources natively via `${CLAUDE_SKILL_DIR}` -- substituted by Claude Code itself. No hook injection is needed.
