---
name: brewdoc:my-claude
description: Extended documentation skill for Claude Code installations. Complements built-in /team-onboarding with multi-mode research — internal setup analysis, external architecture docs, and web research from forums/GitHub/marketplaces.
argument-hint: "[ext [context]] | [r <query>] — no args = internal installation docs"
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, WebFetch, WebSearch, Skill, AskUserQuestion
model: opus
---

# My Claude

Generates documentation about your Claude Code installation and environment.

## Mode Detection

Detect mode from `$ARGUMENTS`:

| `$ARGUMENTS` value | Mode | Sub-mode |
|---|---|---|
| empty | INTERNAL | — |
| `ext` or `external` (alone) | EXTERNAL | default |
| `ext context` or `external context` | EXTERNAL | context-schema |
| starts with `r ` or `research ` | RESEARCH | query = rest of args |

After detection, load the appropriate reference file:
- INTERNAL: `references/internal-mode.md`
- EXTERNAL: `references/external-mode.md`
- RESEARCH: `references/research-mode.md`

## vs built-in `/team-onboarding`

Claude Code 2.1.101 shipped `/team-onboarding` — a built-in slash that generates a teammate ramp-up guide from local usage. It's simpler and sufficient for basic onboarding.

Use `/team-onboarding` when you need: quick teammate handoff doc from your local config.

Use `/brewdoc:my-claude` when you need:
- **Web research** — current releases, forum discussions, GitHub issues (beyond static docs)
- **EXTERNAL mode** — architecture synthesis from official Anthropic docs
- **RESEARCH mode** — custom query-driven multi-source investigation
- **Persistent INDEX** — tracked in `.claude/brewdoc/INDEX.jsonl` with citation links

## Output Directory

All generated docs go to `.claude/brewdoc/my-claude/` (project-relative — required because `~/.claude/*` is blocked by Claude Code's protected-path policy in headless sessions, even under `bypassPermissions`).
Create if not exists: `mkdir -p .claude/brewdoc/my-claude`

**Optional interactive fallback:** `${BD_PLUGIN_DATA}/my-claude/` may be used when running interactively — it is NOT usable in headless `claude -p` sessions due to the protected-path restriction. Prefer the project-relative path everywhere.

## INDEX Tracking

Append entry to `.claude/brewdoc/INDEX.jsonl`:
```jsonl
{"ts":"2026-02-28T10:00:00","mode":"internal","path":".claude/brewdoc/my-claude/20260228_my-claude-internal.md","title":"Internal Claude Setup Overview","version":"1.0"}
```

**Legacy read-only merge** — if `~/.claude/brewdoc/INDEX.jsonl` exists AND the new project INDEX is empty, read the legacy file once, merge its entries into `.claude/brewdoc/INDEX.jsonl`, and print: `ℹ️ Migrated {N} entries from legacy ~/.claude/brewdoc/INDEX.jsonl (read-only; legacy file untouched)`. NEVER write back to the legacy path.

If an existing entry for the same mode exists: use AskUserQuestion — header: "INDEX", question: "Entry for this mode already exists (v{VERSION}). Update it?", options: "Yes, update (bump version)" / "No, create new entry".

## INTERNAL Mode

**Goal:** Document your local Claude Code setup — CLAUDE.md files, rules, agents, skills, memories.

**Sources to analyze:**
- `~/.claude/CLAUDE.md` — global instructions
- `~/.claude/rules/*.md` — global rules
- `~/.claude/agents/*.md` — global agents
- `~/.claude/skills/` — global skills
- Project `CLAUDE.md` (current working directory)
- `.claude/rules/*.md` — project rules
- `~/.claude/projects/**/memory/MEMORY.md` — memory files

**Process:**
1. Spawn 3 parallel `Explore` agents, one per source group: (1) global ~/.claude config, (2) project .claude config, (3) memory files
2. Aggregate findings into structured document
3. Write to `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-internal.md`
4. Spawn independent `reviewer` agent to validate facts (file paths exist, content accurate)
5. Apply reviewer fixes if any
6. Add INDEX entry

**Output document structure:**
```markdown
# Claude Code Internal Setup — {date}

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
|-----------|-------|----------|
```

## EXTERNAL Mode

**Goal:** Document Claude Code's hook/context/agent architecture from official sources + local analysis.

**Sub-mode default:**
1. Analyze local hook files for event model patterns
2. WebSearch for recent Claude Code releases and CHANGELOG
3. Spawn `general-purpose` agents for: official docs (code.claude.com), GitHub releases, community forums
4. Generate `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-external.md`

**Sub-mode context-schema:**
1. Focus specifically on context injection schema (additionalContext, updatedInput, etc.)
2. Output: `.claude/brewdoc/my-claude/external/YYYYMMDD_context-schema.md`

## RESEARCH Mode

**Goal:** Research a specific query about Claude Code using multiple sources.

**Query:** everything after `r ` or `research ` in `$ARGUMENTS`

**Process:**
1. Analyze query — divide into 2-5 source groups (official docs, GitHub, Reddit, forums, marketplaces)
2. Spawn `general-purpose` agents per source group in parallel
3. Aggregate with citation tracking (source URL per fact)
4. Spawn independent `reviewer` agent to validate facts and source reliability
5. Output: `.claude/brewdoc/my-claude/YYYYMMDD_research-{slug}.md`

**Output structure:**
```markdown
# Research: {query} — {date}

## Findings

### {Source Group 1}
...

## Sources
| Fact | Source | Reliability |
|------|--------|-------------|

## Review Verdict
```
