---
name: brewdoc:auto-sync
description: Universal documentation sync for skills, agents, markdown. Modes - status, init, global, project, file, folder.
disable-model-invocation: true
user-invocable: true
argument-hint: "[status] | [init <path>] | [global] | [path]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, WebFetch, Skill
model: opus
auto-sync: enabled
auto-sync-date: 2026-02-11
auto-sync-type: skill
---

# Auto-Sync

<instructions>

## Mode Detection

**EXECUTE** using Bash tool (args: `$ARGUMENTS`):
```bash
bash "scripts/detect-mode.sh" $ARGUMENTS
```
> Script path is relative to skill directory.

Parse output: `MODE|ARG|FLAGS`. If exit code non-zero → report error, EXIT.

| Mode | Trigger | Scope |
|------|---------|-------|
| STATUS | `status` | Report INDEX state → EXIT |
| INIT | `init <path>` | Tag file + add to INDEX → EXIT |
| GLOBAL | `global` | `~/.claude/**` (excludes managed dirs) |
| PROJECT | empty | `.claude/**` (excludes managed dirs) |
| FILE | file path | Single file |
| FOLDER | folder path | All .md in folder |

**Managed directories** (excluded from auto-scan, explicit path required):
- `rules/` — sync via `/brewdoc:auto-sync .claude/rules`
- `agents/` — sync via `/brewdoc:auto-sync .claude/agents`
- `skills/` — sync via `/brewdoc:auto-sync .claude/skills`


## INDEX Format

```jsonl
{"p":"skills/auth/SKILL.md","t":"skill","u":"2026-02-05","pr":"default"}
```

| Field | Description |
|-------|-------------|
| `p` | Relative path |
| `t` | Type: `skill`/`agent`/`rule`/`config`/`doc` |
| `u` | Last sync date (YYYY-MM-DD) |
| `pr` | Protocol: `default`/`override` |

**Paths:** Project `.claude/auto-sync/INDEX.jsonl` | Global `~/.claude/auto-sync/INDEX.jsonl`

## Frontmatter Fields

Required (3):
```yaml
auto-sync: enabled
auto-sync-date: 2026-02-05
auto-sync-type: skill
```

Optional override (multiline YAML):
```yaml
auto-sync-override: |
  sources: src/**/*.ts, .claude/agents/*.md
  focus: API endpoints, error handling
  preserve: ## User Notes, ## Custom Config
```

## Override Field

When `auto-sync-override:` present in frontmatter → INDEX gets `pr: "override"`.

Stored in frontmatter only — **never in document body**.

</instructions>

<phase name="status">

1. Read INDEX.jsonl, verify indexed files exist
2. Find all `.md` files in scope
3. Compare indexed vs found → identify non-indexed
4. Detect type for non-indexed (`discover.sh typed`) — output: `TYPE|PATH` per line
5. Output report: Indexed (path, type, protocol, last sync, stale), Non-Indexed (path, detected type, reason), Summary (counts)
6. EXIT

</phase>

<phase name="init">

Input: `init <path>`

1. Read `<path>` — if NOT found → error, EXIT
2. If has `auto-sync: enabled` → "Already tagged", EXIT
3. Detect type via discover.sh
4. Add frontmatter: `auto-sync: enabled`, `auto-sync-date: {today}`, `auto-sync-type: {type}`
5. Check frontmatter `auto-sync-override:` → set `pr: override|default`
6. Add to INDEX.jsonl
7. Output: path, type, protocol; EXIT

</phase>

<phase name="sync">

## Sync Mode (PROJECT/GLOBAL/FILE/FOLDER)

### Phase 1: Setup INDEX

**EXECUTE** using Bash tool:
```bash
SCOPE="project"  # or "global"
INDEX_DIR=".claude/auto-sync"
[ "$SCOPE" = "global" ] && INDEX_DIR="$HOME/.claude/auto-sync"
mkdir -p "$INDEX_DIR" && INDEX_FILE="$INDEX_DIR/INDEX.jsonl" && touch "$INDEX_FILE"
echo "INDEX=$INDEX_FILE"
```

### Phase 2: Discover + Queue (load config: `INTERVAL_DAYS`, `PARALLEL_AGENTS` from `.claude/tasks/cfg/brewdoc.config.json`)

1. Find tagged files — **EXECUTE** using Bash tool:
```bash
bash "scripts/discover.sh" "$SCOPE_PATH" typed
```
> Script path is relative to skill directory.
Output: `TYPE|PATH` per line (types: `skill`, `agent`, `rule`, `config`, `doc`). Capped at `MAX_FILES` (default 50).

2. For each file not in INDEX → auto-add:
   - Read file, use type from discover output
   - If no frontmatter → add `auto-sync: enabled`, `auto-sync-date`, `auto-sync-type`
   - Check `<auto-sync-override>` → set `pr`
   - Add to INDEX (`index-ops.sh add`)

3. Find stale entries — **EXECUTE** using Bash tool:
```bash
bash "scripts/index-ops.sh" stale "$INDEX_FILE" "$INTERVAL_DAYS"
```
> Script path is relative to skill directory.

4. Queue: new + stale files

### Phase 3: Process + Report

1. Launch `bd-auto-sync-processor` agents (max `PARALLEL_AGENTS` batches, model="sonnet"):
   ```
   Task(subagent_type="brewdoc:bd-auto-sync-processor",
        prompt="PATH: {path} | TYPE: {type} | FLAGS: {flags}")
   ```
   > **Context:** BD_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

2. For each result:
   - If status = `updated` or `unchanged` → update INDEX `u` to today (`index-ops.sh update`)
   - If status = `error` → log to Errors table, do NOT update INDEX (file remains stale for retry)

3. Output report:

```markdown
## Auto-Sync Complete

| Metric | Count |
|--------|-------|
| Discovered | {N} |
| Queued (stale/new) | {N} |
| Updated | {N} |
| Unchanged | {N} |
| Errors | {N} |

### Updated
| Path | Type | Changes |
|------|------|---------|

### Errors
| Path | Error |
|------|-------|
```

</phase>

## Error Handling

| Error | Action |
|-------|--------|
| INDEX corrupt | Rebuild from discovery |
| File not found | Skip, add to errors |
| Agent timeout | Retry once |
| No tagged files | Report "0 found" |
| `/brewdoc:doc` called | "Use /brewdoc:auto-sync" |
