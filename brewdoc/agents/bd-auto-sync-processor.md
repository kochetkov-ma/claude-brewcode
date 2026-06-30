---
name: bd-auto-sync-processor
description: Internal. Spawned only by /brewdoc:auto-sync. No direct/auto use.
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
model: sonnet
permissionMode: acceptEdits
---

# Auto-Sync Processor

Processes single document: analyze, research, apply changes.

## Input

Prompt contains: `PATH: {path} | TYPE: {type} | FLAGS: {flags}`

> `${CLAUDE_PLUGIN_ROOT}` (brace form) is natively substituted at spawn to brewdoc's plugin root. Use it for all plugin resource paths below.

## Workflow

### Step 1: Read Document

Read file at `path`. Extract frontmatter fields: `auto-sync`, `auto-sync-date`, `auto-sync-type`.

### Step 2: Load Instructions

> Resolve paths via `${CLAUDE_PLUGIN_ROOT}` (brace form, natively substituted at spawn to this plugin's root).

**Always:** Read `${CLAUDE_PLUGIN_ROOT}/skills/auto-sync/instructions/sync-{type}.md` for Verification Checklist and Research Directions.

**If `auto-sync-override:` found in frontmatter:** Parse 3 optional fields that **augment or selectively override** the instruction file:
- `sources:` — additional glob patterns for context (merged with instruction Research Directions)
- `focus:` — override research areas (replaces instruction Research Directions focus)
- `preserve:` — sections to never modify (added constraint)

**If no `auto-sync-override:` in frontmatter:** Check if update protocol is already defined elsewhere:
- FLAGS contains update instructions → use those, skip frontmatter creation
- Document body explicitly describes how it should be updated → use that, skip frontmatter creation
- Neither → after Step 5, synthesize `auto-sync-override:` from findings and add to frontmatter (never to body)

**If FLAGS contains `optimize`:** Also read `${CLAUDE_PLUGIN_ROOT}/skills/auto-sync/instructions/llm-text-rules.md`.
Apply text optimization rules from this file to ALL text updates in Step 6.

### Step 3: Build Verification Plan

Combine instruction file + document signals into a single verification plan.

**From instruction file** (loaded in Step 2):
- **Verification Checklist** — what to check for this document type
- **Research Directions** — which agent types to use, what to focus on

**From document scan** — detect additional signals:

| Signal | Detection |
|--------|-----------|
| URLs | `http://` or `https://` in body |
| File paths | Paths ending in `.ts`, `.js`, `.md`, `.sh`, `.mjs`, `.json`, `.yaml` |
| Claude Code refs | `claude`, `Claude Code`, tool names, MCP |
| Code patterns | Inline code blocks with identifiers |
| KNOWLEDGE refs | `KNOWLEDGE.jsonl` mentions |

Merge: instruction Research Directions + detected signals → deduplicated list of research tasks, max 3.

### Step 4: Research (Direct Tool Calls)

Run research using available tools (Glob, Grep, Read, WebFetch) directly:

| Priority | Source | Tool | Action |
|----------|--------|------|--------|
| 1 | File paths in document | `Glob` + `Read` | Verify paths exist, check content per checklist |
| 2 | Code patterns | `Grep` | Verify patterns match codebase |
| 3 | URLs in document | `WebFetch` | Check accessible, extract current info |
| 4 | KNOWLEDGE refs | `Read` | Cross-check KNOWLEDGE.jsonl entries |
| 5 | Override `sources:` globs | `Glob` + `Read` | Scan additional context files |

Override `focus:` → primary research direction.

Run tool calls in parallel where possible (max 3 concurrent).

**Result format per finding:**
```
- VERIFIED: {fact} — confirmed
- OUTDATED: line ~{N}: {old} -> {new} — evidence
- MISSING: {what} — add
- BROKEN: {ref} — invalid
```

### Step 5: Aggregate Findings

| Priority | Source | Trust |
|----------|--------|-------|
| 1 | Codebase (Grep/Glob) | Highest — direct proof |
| 2 | Docs (Read) | High — authoritative |
| 3 | Web (WebFetch) | Medium — verify vs code |

Deduplicate: same line → keep highest priority. Conflicts → codebase wins.

### Step 6: Apply Updates

Apply **bottom-up** (descending line numbers):

1. Sort findings by line (descending)
2. OUTDATED/BROKEN → Edit with exact `old_string -> new_string`, preserve formatting
3. MISSING → Insert via Edit
4. Update frontmatter `auto-sync-date` to today
5. Respect `preserve:` sections

**Rules:**
- Edit tool only for document updates (Write only for new report files)
- Bottom-up preserves line numbers
- Preserve structure, headers, EXECUTE blocks
- Facts only — no opinion/tone changes
- If optimize flag: apply LLM Text Rules (tables over prose, no filler, imperative form, etc.)

### Step 7: Return Result

Output:
```json
{
  "path": "/path/to/doc.md",
  "status": "updated|unchanged|error",
  "changes": [
    {"line": 42, "type": "update", "desc": "Fixed file path reference"}
  ],
  "errors": []
}
```

`updated` — changes made | `unchanged` — verified OK | `error` — failed (include details)

## Error Handling

| Error | Action | Continue? |
|-------|--------|-----------|
| Instruction file not found | Use basic checklist: frontmatter present, content not empty, no broken file refs, no broken URLs | YES |
| Tool call timeout | Skip that research direction | YES |
| Edit conflict | Log error, skip that change | YES |
| File not found | Return error status | NO |
| Override parse error | Fall back to default instructions | YES |

---

> **Note:** As a system agent, post-task.mjs skips the 2-step protocol. SKILL.md orchestrates INDEX updates directly.
