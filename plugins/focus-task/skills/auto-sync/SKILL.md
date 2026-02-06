---
name: focus-task:auto-sync
description: Universal documentation system - updates, syncs all Claude Code documents (skills, agents, markdown). Replaces /focus-task:doc. Modes - status, init, global, project (default), file, folder. Triggers "auto-sync", "sync docs", "update docs", "auto-sync status".
user-invocable: true
argument-hint: "[status] | [init <path> [prompt]] | [global] | [path]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, WebFetch
context: fork
model: opus
---

# Auto-Sync - Track & Sync Documents

<instructions>

## Prerequisites

Set plugin root:
```bash
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "FT_PLUGIN=$FT_PLUGIN" || echo "PLUGIN NOT FOUND"
```
> If NOT FOUND: `claude plugin add claude-brewcode/focus-task`

## Mode Detection

**Arguments:** `$ARGUMENTS`

| Mode | Trigger | Scope |
|------|---------|-------|
| STATUS | `status` | Report: INDEX state + non-indexed files |
| INIT | `init <path> [prompt]` | Add auto-sync tag + custom protocol to file |
| GLOBAL | `global` | `~/.claude/**` (auto-tags .md) |
| PROJECT | empty | `.claude/**` (auto-tags .md) |
| FILE | file path | Single file (auto-tags if needed) |
| FOLDER | folder path | All .md in folder (auto-tags) |

Detect mode:
```bash
bash "$FT_PLUGIN/skills/auto-sync/scripts/detect-mode.sh" "$ARGUMENTS" && echo "Mode detected" || echo "Detection failed"
```

## INDEX Format (JSONL)

```jsonl
{"p":"skills/auth/SKILL.md","t":"skill","m":1706745600,"h":"a1b2c3d4","pr":"default","v":"1.0.0","u":"2026-02-05T14:00Z","s":"ok"}
```

| Field | Description |
|-------|-------------|
| `p` | Relative path |
| `t` | Type: `skill`/`agent`/`doc`/`rule` |
| `m` | mtime (Unix epoch) |
| `h` | SHA256[:8] hash |
| `pr` | Protocol: `default`/`custom` |
| `v` | SemVer |
| `u` | Last sync (ISO8601) |
| `s` | Status: `ok`/`stale`/`error` |

**Paths:** Project `.claude/auto-sync/INDEX.jsonl` | Global `~/.claude/auto-sync/INDEX.jsonl`
**Stale threshold:** 7 days

</instructions>

<phase name="status">

## STATUS Mode (separate flow — skip sync phases)

### Steps
1. Read INDEX.jsonl
2. Verify each indexed file exists on disk
3. Find all `.md` files in scope
4. Compare: indexed vs found → identify non-indexed
5. Detect type + protocol for each file
6. Output report

### Search Areas

**Project scope:** `.claude/skills/`, `.claude/agents/`, `.claude/rules/`, `.claude/` (root)
**Global scope:** `~/.claude/skills/`, `~/.claude/agents/`, `~/.claude/rules/`, `~/.claude/` (root)
**Extension:** `*.md` only

### Output

| Section | Content |
|---------|---------|
| Scope | mode, scope path, search areas, extensions |
| Indexed | Path, type, status, version, protocol (default/custom name), last sync |
| Non-Indexed | Path, detected type, has auto-sync tag?, reason |
| Summary | Counts: indexed (ok/stale/error), non-indexed, total |

**EXIT after output. Do not proceed to sync phases.**

</phase>

<phase name="init">

## INIT Mode (separate flow — add auto-sync to existing document)

**Input:** `init <path> [custom protocol prompt]`

### Steps

1. Read document at `<path>`. Verify file exists. If NOT found → report error, EXIT
2. If already has `auto-sync: enabled` → report "Already tagged" and EXIT
3. Detect document type (skill/agent/rule/doc)
4. Add auto-sync tag:
   - YAML frontmatter exists → add `auto-sync: enabled` + `auto-sync-version: 1.0.0`
   - No frontmatter → add `<!-- auto-sync:enabled -->` after first `# Title`
5. If custom protocol prompt provided:
   a. Parse user prompt into `<auto-sync-protocol>` block structure:
      - Extract sources (files, urls, related)
      - Define split strategy (default: 3 blocks by ##)
      - Define research blocks per user description
      - Set merge rules (dedupe: true, priority: code > docs > web)
      - Set update rules from user constraints
   b. Add multi-agent research description to research blocks:
      - Each block → parallel Explore agent with focus area
      - Format: `block-N: {user_focus} (Explore agent: {search_pattern})`
   c. **Optimize ONLY the `<auto-sync-protocol>` block** for LLM efficiency:
      - Prose → tables where multi-column data
      - Remove filler words ("please note", "it's important")
      - Compact format: key-value pairs, not sentences
      - Use inline `code` for paths/patterns instead of code blocks
      - Positive framing: "Do Y" not "Don't do X"
      - Max density: abbreviations in tables
      - Do NOT modify any other part of the document
   d. Insert `<auto-sync-protocol>` block after frontmatter / after title
6. Add entry to INDEX.jsonl
7. Output report: path, type, protocol (default/custom), version

**EXIT after completion. Do not proceed to sync phases.**

</phase>

<phase name="1-setup">

## Phase 1: Setup (sync modes only)

**Mode-to-scope mapping:**

| Mode | SCOPE |
|------|-------|
| PROJECT, FILE, FOLDER | project |
| GLOBAL | global |

Setup INDEX:
```bash
SCOPE="project"  # or "global"
INDEX_DIR="${SCOPE:+.claude/auto-sync}"
[ "$SCOPE" = "global" ] && INDEX_DIR="$HOME/.claude/auto-sync"
mkdir -p "$INDEX_DIR" && INDEX_FILE="$INDEX_DIR/INDEX.jsonl" && touch "$INDEX_FILE"
echo "INDEX=$INDEX_FILE" && head -20 "$INDEX_FILE" 2>/dev/null || echo "Empty"
```

</phase>

<phase name="2-discovery">

## Phase 2: Discovery & Auto-Tag

### Auto-Tag Strategy

Files in scope without `auto-sync: enabled` receive auto-tag.

**Find all .md files:**
```bash
find "$SCOPE_PATH" -name "*.md" -type f 2>/dev/null | head -100
```

**Tag logic per file:**

| Pattern | Type | Header to Add |
|---------|------|---------------|
| `*/SKILL.md` | skill | YAML frontmatter + `auto-sync: enabled` |
| `agents/*.md` | agent | YAML frontmatter + `auto-sync: enabled` |
| `rules/*.md` | rule | `<!-- auto-sync:enabled -->` after title |
| Other `.md` | doc | `<!-- auto-sync:enabled -->` after title |

**Process each file:**
1. Read file
2. If has `auto-sync: enabled` or `auto-sync:enabled` → skip
3. If has YAML frontmatter (`---`) → add `auto-sync: enabled` line
4. Else → add `<!-- auto-sync:enabled -->` after first `# Title` line
5. Add to queue

**Merge with INDEX:** Add new entries, mark removed files.

</phase>

<phase name="3-queue">

## Phase 3: Build Queue

**Priority order:**

| Priority | Criteria |
|----------|----------|
| 1 | New (not in INDEX) |
| 2 | mtime changed |
| 3 | hash changed |
| 4 | Stale > 7 days |
| 5 | error status |

Build queue:
```bash
bash "$FT_PLUGIN/skills/auto-sync/scripts/build-queue.sh" "$INDEX_FILE" && echo "Built" || echo "Failed"
```

**Skip criteria:** Unchanged mtime+hash+not stale | `auto-sync: disabled`

</phase>

<phase name="4-process">

## Phase 4: Parallel Processing

Process queue using `ft-auto-sync-processor` agents (max 5 per batch).

```
Task(subagent_type="ft-auto-sync-processor", model="sonnet", prompt=file_N)
```

<agent-prompt-processor>
ft-auto-sync-processor - PATH: {PATH} | TYPE: {TYPE} | PROTOCOL: {PROTOCOL}

1. Read content
2. Analyze referenced code
3. Update outdated (preserve `<!-- user -->` sections)
4. Return: `{"path":"...","status":"updated|unchanged|error","version":"1.0.1","hash":"...","changes":[...],"error":null}`
</agent-prompt-processor>

**Batching:** >5 files → process in batches with wait between.

</phase>

<phase name="5-update">

## Phase 5: Update INDEX & Report

Update index:
```bash
bash "$FT_PLUGIN/skills/auto-sync/scripts/update-index.sh" "$INDEX_FILE" '{JSON}' && echo "Updated" || echo "Failed"
```

### Report Template

```markdown
## Auto-Sync Complete

| Metric | Count |
|--------|-------|
| Discovered | {N} |
| Updated | {N} |
| Unchanged | {N} |
| Errors | {N} |

### Updated
| Path | Type | Version | Changes |
|------|------|---------|---------|

### Errors
| Path | Error |
|------|-------|
```

**Write to:** `.claude/tasks/reports/{TS}_auto-sync/report.md`

</phase>

## Document Headers

### SKILL.md
```yaml
---
name: focus-task:auth
description: ...
auto-sync: enabled
auto-sync-version: 1.0.0
auto-sync-protocol: default
---
```

### Agent.md
```yaml
---
name: ft-validator
description: ...
auto-sync: enabled
auto-sync-version: 1.0.0
---
```

### Minimal
```markdown
<!-- auto-sync:enabled -->
```

| Protocol | Behavior |
|----------|----------|
| `default` | Update from codebase |
| `custom` | Read `auto-sync-source` |

## Error Handling

| Error | Action |
|-------|--------|
| INDEX corrupt | Rebuild from discovery |
| Protocol parse | Use default |
| File not found | Skip, add to errors |
| Agent timeout | Retry once |
| No tagged files | Report "0 found" |
| Write conflict | Preserve original |
| `/focus-task:doc` | Deprecation notice |
| INIT: file not found | Report error, EXIT |
| INIT: already tagged | Report "Already tagged", EXIT |

## Output

```markdown
# Auto-Sync Complete

## Detection
| Field | Value |
|-------|-------|
| Arguments | `{args}` |
| Mode | `{MODE}` |
| Scope | `{scope}` |

## Summary
| Metric | Count |
|--------|-------|
| Discovered | {N} |
| Updated | {N} |
| Unchanged | {N} |
| Errors | {N} |

## Files
### Updated
### Errors

Report: .claude/tasks/reports/{TS}_auto-sync/report.md
```

## Integration

**ft-coordinator:** Call after completion to write report, update task status.

**Deprecation:** `/focus-task:doc` → "Use /focus-task:auto-sync"
