---
name: focus-task:auto-sync
description: Universal documentation system - updates, syncs all Claude Code documents (skills, agents, markdown). Replaces /focus-task:doc. Modes - status, init, global, project (default), file, folder. Triggers "auto-sync", "sync docs", "update docs", "auto-sync status".
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

## Prerequisites

**EXECUTE** using Bash tool:
```bash
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "FT_PLUGIN=$FT_PLUGIN" || echo "PLUGIN NOT FOUND"
```
> **STOP if NOT FOUND** — run: `claude plugin add claude-brewcode/focus-task`

## Mode Detection

**EXECUTE** using Bash tool (args: `$ARGUMENTS`):
```bash
bash "$FT_PLUGIN/skills/auto-sync/scripts/detect-mode.sh" $ARGUMENTS
```

Parse output: `MODE|ARG|FLAGS`. If exit code non-zero → report error, EXIT.

| Mode | Trigger | Scope |
|------|---------|-------|
| STATUS | `status` | Report INDEX state → EXIT |
| INIT | `init <path>` | Tag file + add to INDEX → EXIT |
| GLOBAL | `global` | `~/.claude/**` |
| PROJECT | empty | `.claude/**` |
| FILE | file path | Single file |
| FOLDER | folder path | All .md in folder |


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

## Frontmatter (3 fields)

```yaml
auto-sync: enabled
auto-sync-date: 2026-02-05
auto-sync-type: skill
```

## Override Block

When present → INDEX gets `pr: "override"`:
```markdown
<auto-sync-override>
sources: src/**/*.ts, .claude/agents/*.md
focus: API endpoints, error handling
preserve: ## User Notes, ## Custom Config
</auto-sync-override>
```

</instructions>

<phase name="status">

## STATUS Mode

1. Read INDEX.jsonl, verify indexed files exist
2. Find all `.md` files in scope
3. Compare indexed vs found → identify non-indexed
4. Detect type for non-indexed (`discover.sh typed`) — output: `TYPE|PATH` per line
5. Output report:

| Section | Content |
|---------|---------|
| Indexed | Path, type, protocol, last sync, stale? |
| Non-Indexed | Path, detected type, reason |
| Summary | Counts: indexed (ok/stale), non-indexed, total |

**EXIT after output.**

</phase>

<phase name="init">

## INIT Mode

**Input:** `init <path>`

1. Read `<path>` — if NOT found → error, EXIT
2. If has `auto-sync: enabled` → report "Already tagged", EXIT
3. Detect type (`discover.sh` detect_type logic)
4. Add YAML frontmatter: `auto-sync: enabled`, `auto-sync-date: {today}`, `auto-sync-type: {type}`
5. Check `<auto-sync-override>` → set `pr: override|default`
6. Add to INDEX.jsonl (`index-ops.sh add`)
7. Output: path, type, protocol

**EXIT after completion.**

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

### Phase 1.5: Load Config

Read `autoSync` from project config (`.claude/tasks/cfg/focus-task.config.json`):
- `INTERVAL_DAYS` = `autoSync.intervalDays` (default: 7)
- `PARALLEL_AGENTS` = `autoSync.parallelAgents` (default: 5)

### Phase 2: Discover + Queue

1. Find tagged files — **EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/auto-sync/scripts/discover.sh" "$SCOPE_PATH" typed
```
Output: `TYPE|PATH` per line (types: `skill`, `agent`, `rule`, `config`, `doc`). Capped at `MAX_FILES` (default 50).

2. For each file not in INDEX → auto-add:
   - Read file, use type from discover output
   - If no frontmatter → add `auto-sync: enabled`, `auto-sync-date`, `auto-sync-type`
   - Check `<auto-sync-override>` → set `pr`
   - Add to INDEX (`index-ops.sh add`)

3. Find stale entries — **EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/auto-sync/scripts/index-ops.sh" stale "$INDEX_FILE" "$INTERVAL_DAYS"
```

4. Queue: new + stale files

### Phase 3: Process + Report

1. Launch `ft-auto-sync-processor` agents (max `parallelAgents` from config, default: 5):

```
For each file in queue:
  Task(subagent_type="focus-task:ft-auto-sync-processor", model="sonnet",
       prompt="PATH: {path} | TYPE: {type} | PLUGIN_ROOT: {FT_PLUGIN}")
```

Batches: max `PARALLEL_AGENTS` parallel.

2. For each completed processor:
   - `status: "updated"` → update INDEX `u` to today (`index-ops.sh update`)
   - `status: "unchanged"` → update INDEX `u` to today
   - `status: "error"` → log error

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
| `/focus-task:doc` called | "Use /focus-task:auto-sync" |
