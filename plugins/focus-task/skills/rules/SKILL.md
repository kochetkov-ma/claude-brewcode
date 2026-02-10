---
name: focus-task:rules
description: Updates PROJECT .claude/rules/ (avoid.md, best-practice.md) from KNOWLEDGE.jsonl or session context. Supports specialized rule files ({prefix}-avoid.md). NEVER touches ~/.claude/rules/. Triggers - "update rules", "sync knowledge to rules", "extract rules".
user-invocable: true
argument-hint: "[mode] [path] [prompt]"
allowed-tools: Read, Bash, Task
model: sonnet
---

Update Rules — delegates to `ft-rules-organizer` agent

## Overview

> ⚠️ **TARGET: PROJECT rules only!** Updates `{CWD}/.claude/rules/` — NEVER `~/.claude/rules/`

<instructions>

## Prerequisites

**EXECUTE FIRST:**
```bash
FT_PLUGIN=$(ls -vd "$HOME/.claude/plugins/cache/claude-brewcode/focus-task"/*/ 2>/dev/null | tail -1)
test -n "$FT_PLUGIN" && echo "✅ FT_PLUGIN=$FT_PLUGIN" || echo "❌ Plugin not found"
```

> **STOP if ❌** — run: `claude plugin add claude-brewcode/focus-task`

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
bash "$FT_PLUGIN/skills/rules/scripts/rules.sh" list
```

## File / Prompt / Session Mode → Delegate

### Step 1: Prepare Knowledge

| Mode | Action |
|------|--------|
| **file** | Note path to KNOWLEDGE.jsonl from arguments |
| **prompt** | Note `<path>` (first arg) and `<prompt>` (rest) |
| **session** | Extract **5 most impactful** findings from conversation: errors, fixes, patterns, gotchas. Format each as `❌ avoid` or `✅ practice` |

### Step 2: Spawn ft-rules-organizer Agent

Spawn via Task tool (`subagent_type: ft-rules-organizer`). Include in prompt:

```
Update PROJECT .claude/rules/ — NEVER ~/.claude/rules/

Plugin templates: {FT_PLUGIN}/templates/rules/
Validation script: bash "{FT_PLUGIN}/skills/rules/scripts/rules.sh" validate
Create missing: bash "{FT_PLUGIN}/skills/rules/scripts/rules.sh" create

Target files: avoid.md, best-practice.md, {prefix}-avoid.md, {prefix}-best-practice.md

MODE: {detected mode}
{for file mode: KNOWLEDGE file path — read it, parse t:"❌" → avoid, t:"✅" → practice, t:"ℹ️" → info}
{for prompt mode: source file path + prompt text}
{for session mode: extracted findings list}
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
