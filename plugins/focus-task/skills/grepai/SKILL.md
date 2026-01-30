---
name: grepai
description: Semantic code search setup and management. Auto-detects mode based on project state. Triggers - "grepai", "semantic search", "setup grepai", "grepai status".
user-invocable: true
argument-hint: "[setup|status|start|stop|reindex|optimize]"
allowed-tools: Read, Write, Edit, Bash, Task, Glob
context: fork
model: sonnet
---

# grepai Skill

Semantic code search setup and management for grepai.

**Scripts location:** `$FT_PLUGIN/skills/grepai/scripts/`

<instructions>

## Prerequisites

> **WORKAROUND:** `$CLAUDE_PLUGIN_ROOT` is only set in hooks, NOT in skills.
> Claude Code doesn't inject plugin env vars when executing bash from SKILL.md.
> We resolve the plugin path dynamically using the cache directory structure.

**EXECUTE FIRST** — set plugin root variable for this session:
```bash
# Resolve plugin root from cache (latest version)
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "✅ FT_PLUGIN=$FT_PLUGIN" || echo "❌ Plugin not found in cache"
```

> **STOP if ❌** — plugin not installed. Run: `claude plugin add claude-brewcode/focus-task`

---

## Mode Detection

### Step 1: Detect Mode (MANDATORY FIRST STEP)

**Skill arguments received:** `$ARGUMENTS`

**EXECUTE** using Bash tool — pass the arguments value above to the script:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/detect-mode.sh" "ARGS_HERE"
```
**IMPORTANT:** Replace `ARGS_HERE` with the actual value from "Skill arguments received" above. If empty, pass empty string `""`.

Output format:
```
ARGS: [arguments received]
MODE: [detected mode]
```

**Use the MODE value and GOTO that section below.**

### Mode Reference

| Keyword in args | MODE |
|-----------------|------|
| optimize, update, улучши, обнови | optimize |
| stop, halt, kill | stop |
| start, watch | start |
| status, doctor, check, health | status |
| setup, install, configure, init | setup |
| reindex, rebuild, refresh | reindex |
| (empty) + .grepai/ exists | start |
| (empty) + no .grepai/ | setup |

---

## Mode: setup

Full grepai installation and project setup.

### Phase 1: Infrastructure Check

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/infra-check.sh" && echo "✅ infra-check" || echo "❌ infra-check FAILED"
```

> **STOP if ❌** — install missing components before continuing.

### Phase 2: MCP Configuration

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/mcp-check.sh" && echo "✅ mcp-check" || echo "❌ mcp-check FAILED"
```

> **STOP if ❌** — fix MCP configuration before continuing.

### Phase 3: Generate Config

**SPAWN** the `ft-grepai-configurator` agent using Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `focus-task:ft-grepai-configurator` |
| `prompt` | `Configure grepai for this project. Analyze all build files, test patterns, source structure. Generate optimal .grepai/config.yaml.` |
| `model` | `opus` |

> **WAIT** for agent to complete before proceeding.

### Phase 4: Initialize Index

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/init-index.sh" && echo "✅ init-index" || echo "❌ init-index FAILED"
```

> **STOP if ❌** — check grepai logs for indexing errors.

### Phase 5: Create Rule

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/create-rule.sh" && echo "✅ create-rule" || echo "❌ create-rule FAILED"
```

> **STOP if ❌** — manually create rule in `.claude/rules/`.

### Phase 6: Verification

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/verify.sh" && echo "✅ verify" || echo "❌ verify FAILED"
```

---

## Mode: status

Read-only diagnostics.

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/status.sh" && echo "✅ status" || echo "❌ status FAILED"
```

---

## Mode: start

Start grepai watch in background.

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/start.sh" && echo "✅ start" || echo "❌ start FAILED"
```

---

## Mode: stop

Stop grepai watch.

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/stop.sh" && echo "✅ stop" || echo "❌ stop FAILED"
```

---

## Mode: reindex

Full index rebuild: stop watch, clean artifacts, rebuild, restart.

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/reindex.sh" && echo "✅ reindex" || echo "❌ reindex FAILED"
```

---

## Mode: optimize

Re-analyze project and regenerate config with backup.

### Step 1: Backup current config

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/optimize.sh" && echo "✅ optimize-backup" || echo "❌ optimize-backup FAILED"
```

> **STOP if ❌** — check if .grepai/config.yaml exists.

### Step 2: Regenerate config

**SPAWN** the `ft-grepai-configurator` agent using Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `focus-task:ft-grepai-configurator` |
| `prompt` | `Re-analyze project and regenerate .grepai/config.yaml. Compare with existing config, optimize boost patterns, update trace languages.` |
| `model` | `opus` |

> **WAIT** for agent to complete.

### Step 3: Reindex with new config

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/reindex.sh" && echo "✅ reindex" || echo "❌ reindex FAILED"
```

---

## Mode: prompt

User provided arguments but no recognized keyword. Ask what they want:

```
Which grepai operation do you want?
- setup   - Install and configure grepai
- status  - Check system health
- start   - Start file watcher
- stop    - Stop file watcher
- reindex - Rebuild search index
- optimize - Re-analyze project and regenerate config
```

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
| bge-m3 | [✅/❌] |
| MCP | [✅/❌] |
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
