---
name: install
description: Interactive installer for focus-task plugin. Triggers - "install", "установить", "setup dependencies".
user-invocable: true
argument-hint: ""
allowed-tools: Read, Bash, AskUserQuestion
context: fork
model: sonnet
---

# focus-task Install

> Interactive installer for focus-task plugin prerequisites.

<instructions>

## Prerequisites

**EXECUTE FIRST** — resolve plugin path:
```bash
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "✅ FT_PLUGIN=$FT_PLUGIN" || echo "❌ Plugin not found in cache"
```

> **STOP if ❌** — run: `claude plugin add claude-brewcode/focus-task`

---

## Overview

**Required** (installed automatically):
- **Homebrew** — package manager
- **timeout** — command timeout (coreutils) + symlink
- **jq** — JSON processor for hooks

**Optional** (ask user):
- **ollama** — local embedding server
- **bge-m3** — multilingual embedding model
- **grepai** — semantic code search CLI

---

## Phase 1: Check Current State

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" state
```

---

## Phase 2: Ask About Updates

**EXECUTE** — check for updates:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" check-updates
```

**If UPDATES_AVAILABLE=true**, **ASK user** using AskUserQuestion:

```json
{
  "questions": [{
    "question": "Updates available: [UPDATES from output]. Update now?",
    "header": "Updates",
    "multiSelect": false,
    "options": [
      {"label": "Yes, update all", "description": "Update all outdated components automatically"},
      {"label": "Skip", "description": "Keep current versions, continue installation"}
    ]
  }]
}
```

**If user chooses Yes**, **EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" update-all
```

---

## Phase 3: Ask About Timeout Symlink

**EXECUTE** — check timeout:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" check-timeout
```

**If TIMEOUT_EXISTS=false**, **ASK user** using AskUserQuestion:

```json
{
  "questions": [{
    "question": "Create 'timeout' symlink? REQUIRED for focus-task scripts.",
    "header": "Alias",
    "multiSelect": false,
    "options": [
      {"label": "Yes, create symlink", "description": "Create symlink: timeout → gtimeout in /opt/homebrew/bin"},
      {"label": "No, cancel installation", "description": "Cancel - focus-task requires timeout command"}
    ]
  }]
}
```

> **If user chooses "No, cancel"** — STOP with message:
> "Installation cancelled. The 'timeout' command is required for focus-task."

---

## Phase 4: Install Required Components

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" required
```

**If timeout still missing**, **EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" timeout
```

> **STOP if any required component failed.**

---

## Phase 5: Semantic Search (Optional)

**ASK user** using AskUserQuestion:

```json
{
  "questions": [{
    "question": "Install semantic search tools? Enables /grepai for AI-powered code search.",
    "header": "grepai",
    "multiSelect": false,
    "options": [
      {"label": "Yes, install (Recommended)", "description": "Install Ollama + bge-m3 model (~1.5GB) + grepai CLI"},
      {"label": "Skip", "description": "Skip - /grepai will not be available"}
    ]
  }]
}
```

**If user chooses Skip**, go to Phase 6 (Summary).

**If user chooses Yes**, **EXECUTE**:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" grepai
```

---

## Phase 6: Summary & Next Steps

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/install/scripts/install.sh" summary
```

**Output next steps:**

```markdown
## Next Steps

### Task Management
| Command | Purpose |
|---------|---------|
| `/focus-task:setup` | Initialize focus-task for this project |
| `/focus-task:create <desc>` | Create a new task |
| `/focus-task:start` | Start executing tasks |

### Semantic Search (if installed)
| Command | Purpose |
|---------|---------|
| `/grepai setup` | Configure grepai for this project |
| `/grepai status` | Check health |
| `grepai search "query"` | CLI semantic search |
```

</instructions>

---

## Script Reference

**Script:** `$FT_PLUGIN/skills/install/scripts/install.sh <command>`

| Command | Purpose |
|---------|---------|
| `state` | Check current state of all components |
| `check-updates` | Check for available updates |
| `check-timeout` | Check if timeout exists |
| `update-all` | Update all outdated components |
| `required` | Install required (brew, coreutils, jq) |
| `timeout` | Create timeout symlink only |
| `grepai` | Install semantic search |
| `summary` | Show final summary |

---

## Output Format

```markdown
# focus-task Installation

## Initial State
| Component | Status | Version | Type |
|-----------|--------|---------|------|
| ... | ... | ... | ... |

## Actions
- Updates: [applied/skipped]
- Timeout symlink: [created/existed]
- Required: [installed/already installed]
- grepai: [installed/skipped]

## Final State
| Component | Status | Version |
|-----------|--------|---------|
| ... | ... | ... |

## Next Steps
1. `/focus-task:setup` — Initialize project
2. `/grepai setup` — Configure semantic search (if installed)
```
