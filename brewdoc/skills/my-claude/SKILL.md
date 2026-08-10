---
name: my-claude
description: Document your Claude Code installation - setup, architecture, web research. Triggers - my claude, installation docs.
user-invocable: true
disable-model-invocation: true
argument-hint: "[ext [context]] | [r <query>] — no args = internal installation docs"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, Task, WebFetch, WebSearch, AskUserQuestion]
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

Built-in `/team-onboarding` (CC 2.1.101+) is enough for a quick teammate handoff doc from local config. Use this skill instead when the job needs web research, EXTERNAL architecture synthesis, RESEARCH mode, or the persistent `.claude/brewdoc/INDEX.jsonl` with citations.

## Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — one source group, ~<=5 files, ~<=10 steps. Bigger MUST be split into N tasks, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. Applies to every `Explore` / `general-purpose` spawn in all three modes.

## Output Directory

All generated docs go to `.claude/brewdoc/my-claude/` (project-relative — required because `~/.claude/*` is blocked by Claude Code's protected-path policy in headless sessions, even under `bypassPermissions`).
Create if not exists: `mkdir -p .claude/brewdoc/my-claude`

This is the only supported target — there is no `~/.claude` or plugin-data fallback.

### Provenance frontmatter (every generated doc, all three modes)

Every `.md` this skill writes opens with this block, before the `#` heading. `doc_type` is BARE; the other three are QUOTED. Resolve the values — never hardcode them.

**EXECUTE** using Bash tool before writing the document:
```bash
PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
PV=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version||'')" "$PJ" 2>/dev/null || true)
[ -n "$PV" ] || { echo "❌ cannot read version from $PJ — reinstall brewdoc"; exit 1; }
echo "PLUGIN_VERSION=$PV"; echo "LAST_UPDATED=$(date +%F)"
```

```yaml
---
doc_type: user
version: "{PLUGIN_VERSION}"
generated_by: "brewdoc:my-claude"
last_updated: "{LAST_UPDATED}"
---
```

Re-generating an existing doc REFRESHES all three quoted values and leaves a hand-edited `doc_type` (`llm` / `skip`) as the user set it.

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
1. Spawn 3 parallel `Explore` agents, one per source group: (1) global `~/.claude` config, (2) project `.claude` config, (3) memory files. Brief each in full shape, e.g. group (1):
   ```
   Task(subagent_type="Explore", prompt="
   GOAL: producing a document describing this user's whole Claude Code installation;
     you cover the global ~/.claude layer only, another agent covers project + memory.
   ROLE: read-only inventory of global config. Do NOT edit any file, do NOT read project files.
   SCOPE: in — ~/.claude/CLAUDE.md, ~/.claude/rules/*.md, ~/.claude/agents/*.md, ~/.claude/skills/.
     Out — project CLAUDE.md, .claude/**, memory files, source code.
   CONTEXT: nothing has been read yet — you are the first pass for this group. Two sibling
     agents scan project `.claude` config and memory files in parallel right now; the output
     dir `.claude/brewdoc/my-claude/` and the INDEX entry are already resolved by the skill.
   CONSUMER: the aggregation step merges the three inventories into one INTERNAL-mode
     document, then an `Explore` agent re-checks that every path you name exists — absolute
     paths only, and flag a missing file instead of dropping its row.
   DONE: per-section inventory (instructions summary, rules N + one line each, agents N + purpose,
     skills N + purpose) with absolute paths for every item. Flag missing files explicitly.
   ")
   ```
2. Aggregate findings into structured document
3. Write to `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-internal.md`
4. Spawn an independent `Explore` agent to validate facts (file paths exist, content accurate) — read-only check, no edits
5. Apply the validation fixes if any
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
4. Spawn an independent `general-purpose` agent to validate facts and source reliability (needs WebFetch/WebSearch to re-check sources)
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
