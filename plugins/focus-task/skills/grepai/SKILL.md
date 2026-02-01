---
name: grepai
description: Semantic search setup. Triggers - "grepai", "semantic search", "setup grepai".
user-invocable: true
argument-hint: "[setup|status|start|stop|reindex|optimize|upgrade]"
allowed-tools: Read, Write, Edit, Bash, Task
context: fork
model: sonnet
---

# grepai Skill

> **Environment:** Ollama + bge-m3 | GOB storage | Java/Kotlin/JS/TS

<instructions>

## Prerequisites

**EXECUTE FIRST** — resolve plugin path:
```bash
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "✅ FT_PLUGIN=$FT_PLUGIN" || echo "❌ Plugin not found in cache"
```

> **STOP if ❌** — run: `claude plugin add claude-brewcode/focus-task`

---

## Mode Detection

### Step 1: Detect Mode (MANDATORY FIRST STEP)

**EXECUTE** using Bash tool — detect mode from skill arguments:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/detect-mode.sh" "$ARGUMENTS"
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
bash "$FT_PLUGIN/skills/grepai/scripts/infra-check.sh" && echo "✅ infra-check" || echo "❌ infra-check FAILED"
```

> **STOP if ❌** — install missing components before continuing.

### Phase 2: MCP Configuration & Permissions

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/mcp-check.sh" && echo "✅ mcp-check" || echo "❌ mcp-check FAILED"
```

This script configures:
1. **MCP Server** — adds `grepai` to `~/.claude.json` (user scope)
2. **Permissions** — adds `mcp__grepai__*` to `~/.claude/settings.json` allowedTools

> **Why permissions?** All grepai tools are read-only, but Claude Code marks MCP tools as `[destructive]` by default. This setting prevents permission prompts.

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

> **STOP if ❌** — check `.grepai/logs/grepai-watch.log` for errors.

> ⏳ **INDEXING IS SYNCHRONOUS.** Script waits for `grepai watch` initial scan to complete.
> Large projects (5k+ files) take 10-30+ min. Log: `.grepai/logs/grepai-watch.log` | Monitor: `tail -f .grepai/logs/grepai-watch.log`

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

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/status.sh" && echo "✅ status" || echo "❌ status FAILED"
```

---

## Mode: start

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/start.sh" && echo "✅ start" || echo "❌ start FAILED"
```

---

## Mode: stop

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/stop.sh" && echo "✅ stop" || echo "❌ stop FAILED"
```

---

## Mode: reindex

Full index rebuild: stop watch → clean → rebuild → restart.

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/reindex.sh" && echo "✅ reindex" || echo "❌ reindex FAILED"
```

> ⏳ **REINDEXING IS SYNCHRONOUS.** Script waits for `grepai watch` to complete initial scan.
> Log: `.grepai/logs/grepai-watch.log` | Monitor: `tail -f .grepai/logs/grepai-watch.log`

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

## Mode: upgrade

Update grepai CLI via Homebrew.

**EXECUTE** using Bash tool:
```bash
bash "$FT_PLUGIN/skills/grepai/scripts/upgrade.sh" && echo "✅ upgrade" || echo "❌ upgrade FAILED"
```

---

## Mode: prompt

Ask user:
```
Which grepai operation?
- setup    - Configure project (.grepai/config.yaml)
- status   - Check health
- start    - Start watcher
- stop     - Stop watcher
- reindex  - Rebuild index
- optimize - Regenerate config
- upgrade  - Update grepai CLI

Prerequisites missing? Run /install first.
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
