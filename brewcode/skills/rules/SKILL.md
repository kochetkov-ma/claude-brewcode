---
name: brewcode:rules
description: Syncs KNOWLEDGE.jsonl or session learnings to project rules. Use when - updating rules, syncing knowledge, extracting learnings, organizing anti-patterns. Trigger keywords - rules, knowledge sync, avoid patterns, best practices, session rules, extract rules.
user-invocable: true
argument-hint: "[list] | [<path>] | [<path> <prompt>]"
allowed-tools: Read, Bash, Task
model: sonnet
---

> **TARGET:** Project `.claude/rules/` only. NEVER `~/.claude/rules/`

<instructions>

## Mode Detection

**Arguments:** `$ARGUMENTS`

| Input | Mode |
|-------|------|
| `list` | List mode |
| `<path> <text>` | Prompt mode |
| `<path-to-file>` | File mode |
| (empty) | Session mode |

## List Mode

**EXECUTE** and **STOP:**
```bash
bash scripts/rules.sh list
```

## File / Prompt / Session Mode

Spawn `bc-rules-organizer` agent via Task tool.

### Prepare Knowledge by Mode

| Mode | Preparation |
|------|-------------|
| **file** | Read KNOWLEDGE.jsonl; parse `t:"❌"` → avoid, `t:"✅"` → practice |
| **prompt** | Extract `<path>` (first arg), `<prompt>` (rest) |
| **session** | Extract **5 most impactful** findings: errors, fixes, patterns. Format as `❌` or `✅` |

### Agent Prompt Template

```
Update PROJECT .claude/rules/ — NEVER ~/.claude/rules/

Plugin templates: $BC_PLUGIN_ROOT/templates/rules/
Validation: bash "$BC_PLUGIN_ROOT/skills/rules/scripts/rules.sh" validate
Create missing: bash "$BC_PLUGIN_ROOT/skills/rules/scripts/rules.sh" create

Targets: avoid.md, best-practice.md, {prefix}-avoid.md, {prefix}-best-practice.md

MODE: {detected mode}
KNOWLEDGE: {prepared from table above}
```

> `BC_PLUGIN_ROOT` injected by pre-task.mjs hook.

### Fallback

Agent unavailable → error: `bc-rules-organizer not available — install brewcode plugin`

</instructions>

## Output

Forward agent report to user as-is.

## Error Handling

| Condition | Action |
|-----------|--------|
| Agent unavailable | Error + install instructions |
| No knowledge found | "No new rules extracted" |
| Plugin not found | STOP + install instructions |
