---
name: focus-task:install
description: Installs focus-task prerequisites (brew, coreutils, jq, grepai). Invoke via /focus-task:install only.
user-invocable: true
argument-hint: "(no args) — interactive installer for brew, coreutils, jq, grepai"
allowed-tools: Read, Bash, AskUserQuestion
context: fork
model: sonnet
---

# focus-task Install

Interactive installer for focus-task prerequisites.

<instructions>

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

**EXECUTE**: `bash scripts/install.sh state`

---

### Phase 2: Updates Check

**EXECUTE**: `bash scripts/install.sh check-updates`

**If UPDATES_AVAILABLE=true** → **ASK** (AskUserQuestion):
- Header: "Updates"
- Question: "Updates available: [list from output]. Update now?"
- Options: "Yes, update all" | "Skip"

**If Yes** → **EXECUTE**: `bash scripts/install.sh update-all`

---

### Phase 3: Timeout Check

**EXECUTE**: `bash scripts/install.sh check-timeout`

**If TIMEOUT_EXISTS=false** → **ASK**:
- Header: "Timeout Symlink"
- Question: "Create 'timeout' symlink? REQUIRED for focus-task."
- Options: "Yes, create" | "No, cancel"

> **If cancel** → STOP: "Installation cancelled. timeout command required."

---

### Phase 4: Required Components

**EXECUTE**: `bash scripts/install.sh required`

**If timeout still missing** → **EXECUTE**: `bash scripts/install.sh timeout`

> **STOP if any required failed.**

---

### Phase 5: Semantic Search (Optional)

**If not installed** → **ASK**:
- Header: "grepai"
- Question: "Install semantic search? Enables AI-powered code search."
- Options: "Yes, install (~1.5GB)" | "Skip"

**If Yes** → **EXECUTE**: `bash scripts/install.sh grepai`

---

### Phase 6: Summary

**EXECUTE**: `bash scripts/install.sh summary`

</instructions>
