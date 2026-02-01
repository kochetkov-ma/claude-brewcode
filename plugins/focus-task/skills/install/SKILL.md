---
name: install
description: Installs focus-task prerequisites (brew, coreutils, jq, grepai). Triggers - "install focus-task", "install dependencies", "setup prerequisites", "установить зависимости".
user-invocable: true
argument-hint: ""
allowed-tools: Read, Bash, AskUserQuestion
context: fork
model: sonnet
---

# focus-task Install

Interactive installer for focus-task prerequisites.

<instructions>

## Prerequisites

**EXECUTE FIRST** — resolve plugin path:
```bash
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "✅ FT_PLUGIN=$FT_PLUGIN" || echo "❌ Plugin not found in cache"
```

> **STOP if ❌** — run: `claude plugin add claude-brewcode/focus-task`

---

## Components

| Component | Type | Purpose |
|-----------|------|---------|
| brew | required | Package manager |
| coreutils+timeout | required | Command timeout for scripts |
| jq | required | JSON processor for hooks |
| ollama | optional | Local embedding server |
| bge-m3 | optional | Multilingual embedding model (~1.2GB) |
| grepai | optional | Semantic code search CLI |

---

## Workflow

### Phase 1: State Check

**EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" state
```

### Phase 2: Updates Check

**EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" check-updates
```

**If UPDATES_AVAILABLE=true** → **ASK** (AskUserQuestion):
- Header: "Updates"
- Question: "Updates available: [UPDATES]. Update now?"
- Options: "Yes, update all" | "Skip"

**If Yes** → **EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" update-all`

### Phase 3: Timeout Check

**EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" check-timeout
```

**If TIMEOUT_EXISTS=false** → **ASK**:
- Header: "Timeout Symlink"
- Question: "Create 'timeout' symlink? REQUIRED for focus-task."
- Options: "Yes, create" | "No, cancel"

> **If cancel** → STOP: "Installation cancelled. timeout command required."

### Phase 4: Required Components

**EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" required
```

**If timeout still missing** → **EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" timeout`

> **STOP if any required failed.**

### Phase 5: Semantic Search (Optional)

**ASK**:
- Header: "grepai"
- Question: "Install semantic search? Enables AI-powered code search."
- Options: "Yes, install (~1.5GB)" | "Skip"

**If Yes** → **EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" grepai`

### Phase 6: Summary

**EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" summary
```

</instructions>

---

## Script Commands

| Command | Purpose |
|---------|---------|
| state | Current state of all components |
| check-updates | Available updates |
| check-timeout | timeout command exists? |
| update-all | Update outdated components |
| required | Install brew, coreutils, jq |
| timeout | Create timeout symlink |
| grepai | Install ollama, bge-m3, grepai |
| summary | Final summary |

---

## Next Steps

| Command | Purpose |
|---------|---------|
| `/focus-task:setup` | Initialize for project |
| `/focus-task:create <desc>` | Create task |
| `/grepai setup` | Configure semantic search |
