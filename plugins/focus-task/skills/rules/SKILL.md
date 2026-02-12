---
name: focus-task:rules
description: Updates PROJECT .claude/rules/ (avoid.md, best-practice.md) from KNOWLEDGE.jsonl or session context. Supports specialized rule files ({prefix}-avoid.md). NEVER touches ~/.claude/rules/. Triggers - "update rules", "sync knowledge to rules", "extract rules".
user-invocable: true
argument-hint: "[list] | [<path>] | [<path> <prompt>] — list rules, sync file, or prompt mode"
allowed-tools: Read, Bash, Task
model: sonnet
---

## Overview

> ⚠️ **TARGET: PROJECT rules only!** Updates `{CWD}/.claude/rules/` — NEVER `~/.claude/rules/`

<instructions>

## Mode Detection

**Arguments:** `$ARGUMENTS`

```
"list"            → list mode
"<path> <text>"   → prompt mode
"<path-to-file>"  → file mode
(empty)           → session mode
```

## List Mode

**EXECUTE** and **STOP:**
```bash
bash scripts/rules.sh list
```

## File / Prompt / Session Mode → Delegate

### Spawn ft-rules-organizer Agent

Spawn via Task tool (`subagent_type: ft-rules-organizer`). Based on mode, prepare knowledge:

| Mode | Preparation |
|------|--------|
| **file** | Read KNOWLEDGE.jsonl from arguments; parse `t:"❌"` → avoid, `t:"✅"` → practice |
| **prompt** | Extract `<path>` (first arg) and `<prompt>` (rest) from arguments |
| **session** | Extract **5 most impactful** findings from conversation: errors, fixes, patterns, gotchas. Format as `❌ avoid` or `✅ practice` |

Include in agent prompt:

> **Context:** FT_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook).

```
Update PROJECT .claude/rules/ — NEVER ~/.claude/rules/

Plugin templates: $FT_PLUGIN_ROOT/templates/rules/
Validation script: bash "$FT_PLUGIN_ROOT/skills/rules/scripts/rules.sh" validate
Create missing: bash "$FT_PLUGIN_ROOT/skills/rules/scripts/rules.sh" create

Target files: avoid.md, best-practice.md, {prefix}-avoid.md, {prefix}-best-practice.md

MODE: {detected mode}
KNOWLEDGE/PROMPT/FINDINGS: {prepared from above table}
```

### Fallback

If agent unavailable → report error: `ft-rules-organizer agent not available — ensure focus-task plugin is installed`

</instructions>

## Output

Agent returns its own report. Forward to user as-is.

## Error Handling

| Condition | Action |
|-----------|--------|
| Agent unavailable | Report error, suggest installing agent |
| No knowledge found | Report "No new rules extracted" |
| Plugin not found | STOP with install instructions |
