---
name: brewcode:grepai
description: Manages grepai semantic search (setup, status, start, stop, reindex, optimize, upgrade).
disable-model-invocation: true
argument-hint: "[setup|status|start|stop|reindex|optimize|upgrade]"
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion
model: sonnet
---

# grepai Skill

> **Environment:** Ollama + bge-m3 | GOB storage | Java/Kotlin/JS/TS

<instructions>

## Mode Detection

### Step 1: Detect Mode (MANDATORY FIRST STEP)

**EXECUTE** using Bash tool — detect mode from skill arguments:
```bash
bash scripts/detect-mode.sh "$ARGUMENTS"
```

Use `$ARGUMENTS` directly - it contains the skill invocation arguments.

Output format:
```
ARGS: [arguments received]
MODE: [detected mode]
```

**Use the MODE value and GOTO that section below.**

### Mode Reference

| Keyword in args | MODE |
|-----------------|------|
| upgrade, апгрейд | upgrade |
| optimize, update, улучши, обнови | optimize |
| stop, halt, kill | stop |
| start, watch | start |
| status, doctor, check, health | status |
| setup, configure, init | setup |
| reindex, rebuild, refresh | reindex |
| (empty) + .grepai/ exists | start |
| (empty) + no .grepai/ | setup |
| (unrecognized text) | prompt |

> **Prerequisites:** Run `/install` first to install brew, ollama, grepai, etc.

---

## Mode: setup

Full grepai installation and project setup.

### Phase 1: Infrastructure Check

**EXECUTE** using Bash tool:
```bash
bash scripts/infra-check.sh && echo "✅ infra-check" || echo "❌ infra-check FAILED"
```

> **STOP if ❌** — install missing components before continuing.

### Phase 2: MCP Configuration & Permissions

**EXECUTE** using Bash tool:
```bash
bash scripts/mcp-check.sh && echo "✅ mcp-check" || echo "❌ mcp-check FAILED"
```

This script configures MCP server and allowedTools permissions.

> **STOP if ❌** — fix MCP configuration before continuing.

### Phase 3: Generate Config

**SPAWN** the `bc-grepai-configurator` agent using Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `brewcode:bc-grepai-configurator` |
| `prompt` | `Configure grepai for this project. Analyze all build files, test patterns, source structure. Generate optimal .grepai/config.yaml.` |
| `model` | `opus` |

> **Context:** `BC_PLUGIN_ROOT` is available in agent context (injected by pre-task.mjs hook).

> **WAIT** for agent to complete before proceeding.

### Phase 4: Initialize Index

**EXECUTE** using Bash tool:
```bash
bash scripts/init-index.sh && echo "✅ init-index" || echo "❌ init-index FAILED"
```

> **STOP if ❌** — check `.grepai/logs/grepai-watch.log` for errors.

> ⏳ **Synchronous — Large projects (5k+ files) take 10-30+ min.** Monitor: `tail -f .grepai/logs/grepai-watch.log`

### Phase 5: Create Rule

**EXECUTE** using Bash tool:
```bash
bash scripts/create-rule.sh && echo "✅ create-rule" || echo "❌ create-rule FAILED"
```

> **STOP if ❌** — manually create rule in `.claude/rules/`.

### Phase 6: Verification

**EXECUTE** using Bash tool:
```bash
bash scripts/verify.sh && echo "✅ verify" || echo "❌ verify FAILED"
```

---

## Mode: status

**EXECUTE** using Bash tool:
```bash
bash scripts/status.sh && echo "✅ status" || echo "❌ status FAILED"
```

---

## Mode: start

**EXECUTE** using Bash tool:
```bash
bash scripts/start.sh && echo "✅ start" || echo "❌ start FAILED"
```

---

## Mode: stop

**EXECUTE** using Bash tool:
```bash
bash scripts/stop.sh && echo "✅ stop" || echo "❌ stop FAILED"
```

---

## Mode: reindex

Full index rebuild: stop watch → clean → rebuild → restart.

**EXECUTE** using Bash tool:
```bash
bash scripts/reindex.sh && echo "✅ reindex" || echo "❌ reindex FAILED"
```

> ⏳ **Synchronous — Monitor: `tail -f .grepai/logs/grepai-watch.log`**

---

## Mode: optimize

Re-analyze project and regenerate config with backup.

### Step 1: Backup current config

**EXECUTE** using Bash tool:
```bash
bash scripts/optimize.sh && echo "✅ optimize-backup" || echo "❌ optimize-backup FAILED"
```

> **STOP if ❌** — check if .grepai/config.yaml exists.

### Step 2: Regenerate config

**SPAWN** the `bc-grepai-configurator` agent using Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `brewcode:bc-grepai-configurator` |
| `prompt` | `Re-analyze project and regenerate .grepai/config.yaml. Compare with existing config, optimize boost patterns, update trace languages.` |
| `model` | `opus` |

> **Context:** `BC_PLUGIN_ROOT` is available in agent context (injected by pre-task.mjs hook).

> **WAIT** for agent to complete.

### Step 3: Reindex with new config

**EXECUTE** using Bash tool:
```bash
bash scripts/reindex.sh && echo "✅ reindex" || echo "❌ reindex FAILED"
```

---

## Mode: upgrade

Update grepai CLI via Homebrew.

**EXECUTE** using Bash tool:
```bash
bash scripts/upgrade.sh && echo "✅ upgrade" || echo "❌ upgrade FAILED"
```

---

## Mode: prompt

Use AskUserQuestion to ask which operation to run:

```
header: "grepai"
question: "Which grepai operation do you want to run?"
options:
  - label: "setup"
    description: "Initialize and configure semantic search for this project"
  - label: "status"
    description: "Check health, index stats, doctor"
  - label: "start / watch"
    description: "Start watch mode (auto-index on file changes)"
  - label: "optimize"
    description: "Update and rebuild the search index"
```

For stop, reindex, upgrade — user types via Other. After answer, GOTO that mode section.

</instructions>

---

## Output Format

```markdown
# grepai [MODE]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[detected mode]` |

## Status

| Component | Status |
|-----------|--------|
| grepai CLI | [✅/❌] |
| ollama | [✅/❌] |
| bge-m3 model | [✅/❌] |
| MCP | [✅/❌] |
| Permissions | [✅/❌] allowedTools |
| .grepai/ | [✅/❌] |
| index | [size/indexing] |
| watch | [running/stopped] |
| rule | [✅/⚠️] |

## Actions Taken

- [action 1]
- [action 2]

## Next Steps

- [if any issues, list resolution steps]
```
