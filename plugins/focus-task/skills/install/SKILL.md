---
name: focus-task:install
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

## Output Rules

> **CRITICAL:** After EACH bash command, you MUST:
> 1. Show **COMPLETE** script output in a code block — **preserve markdown tables!**
> 2. Add a brief **interpretation** of the result (1-2 sentences)
> 3. **NEVER** summarize, truncate, or skip any output

**Example format:**
```
## Phase N: Name

**Output:**
\`\`\`
[FULL script output here - preserve formatting!]
\`\`\`

**Result:** [1-2 sentence interpretation]
```

---

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

**EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" state`

→ **Show:** Full table with all components, statuses, versions, sources.

---

### Phase 2: Updates Check

**EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" check-updates`

→ **Show:** BREW_CACHE status, UPDATES_AVAILABLE, NOTES.
→ **Explain:** Did brew cache update succeed? Any updates available?

**If UPDATES_AVAILABLE=true** → **ASK** (AskUserQuestion):
- Header: "Updates"
- Question: "Updates available: [list from output]. Update now?"
- Options: "Yes, update all" | "Skip"

**If Yes** → **EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" update-all`

---

### Phase 3: Timeout Check

**EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" check-timeout`

→ **Show:** TIMEOUT_EXISTS, VERSION, SYMLINK path.
→ **Explain:** Is timeout available? Where does symlink point?

**If TIMEOUT_EXISTS=false** → **ASK**:
- Header: "Timeout Symlink"
- Question: "Create 'timeout' symlink? REQUIRED for focus-task."
- Options: "Yes, create" | "No, cancel"

> **If cancel** → STOP: "Installation cancelled. timeout command required."

---

### Phase 4: Required Components

**EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" required`

→ **Show:** Full installation output.

**If timeout still missing** → **EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" timeout`

> **STOP if any required failed.**

---

### Phase 5: Semantic Search (Optional)

**Skip if grepai already installed** (check Phase 1 state).

**If not installed** → **ASK**:
- Header: "grepai"
- Question: "Install semantic search? Enables AI-powered code search."
- Options: "Yes, install (~1.5GB)" | "Skip"

**If Yes** → **EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" grepai`

---

### Phase 6: Summary

**EXECUTE**: `bash "$FT_PLUGIN/skills/install/scripts/install.sh" summary`

→ **Show:** Full summary table with Installed vs Latest versions.
→ **Show:** Actions Performed section.

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
