---
name: rules
description: Updates .claude/rules/avoid.md and best-practice.md from KNOWLEDGE.jsonl or session context. Triggers: "update rules", "sync knowledge to rules", "extract rules from knowledge".
user-invocable: true
argument-hint: "[path-to-KNOWLEDGE.jsonl]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
---

Update Rules — extract from [KNOWLEDGE.jsonl]

## Overview

Extracts anti-patterns and best practices from accumulated knowledge, optimizes `.claude/rules/avoid.md` and `.claude/rules/best-practice.md`.

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

| Mode | Condition | Source |
|------|-----------|--------|
| **File** | `$ARGUMENTS` contains path | Parse KNOWLEDGE.jsonl |
| **Session** | `$ARGUMENTS` empty | Analyze session context (max 5 rules) |

## Step 1: Extract Knowledge

### File Mode

**Skill arguments received:** `$ARGUMENTS`

**EXECUTE** using Bash tool — read knowledge file:
```bash
bash "$FT_PLUGIN/skills/rules/scripts/rules.sh" read "ARGS_HERE" && echo "✅ Read knowledge" || echo "❌ Failed to read knowledge"
```
**IMPORTANT:** Replace `ARGS_HERE` with the actual value from "Skill arguments received" above.

> **STOP if ❌** — verify path exists and is readable.

Parse entries:
- `t:"❌"` → anti-pattern (avoid)
- `t:"✅"` → best practice
- `t:"ℹ️"` → info, determine category by content

### Session Mode

Scan conversation for (limit to **5 most impactful rules**):
- Errors encountered and fixes applied
- Patterns that worked well
- Warnings or gotchas discovered
- Code review findings

## Step 2: Read Existing Rules

**EXECUTE** using Bash tool — check existing rules:
```bash
bash "$FT_PLUGIN/skills/rules/scripts/rules.sh" check && echo "✅ Check complete" || echo "❌ Check failed"
```

If missing, **EXECUTE** using Bash tool — create from templates:
```bash
bash "$FT_PLUGIN/skills/rules/scripts/rules.sh" create && echo "✅ Created rules" || echo "❌ Failed to create rules"
```

> **STOP if ❌** — verify plugin installation and template paths.

## Step 3: Optimize Rules

> **Format priority:** `code` > prose (~30% savings). Short inline code beats explanation of same length.
> Example: `List.of()` instead of "use immutable list factory method"
> Source: `~/.claude/skills/text-optimize/SKILL.md:69`

For each rule file:

1. **Add new entries** from extracted knowledge
2. **Deduplicate** by semantic similarity (not exact match)
3. **Merge** related entries into single row
4. **Prioritize** by impact: critical > important > nice-to-have
5. **Keep tables compact** - max 20 rows per file
6. **Number entries** sequentially

### Avoid Table Format

```markdown
| # | Avoid | Instead | Why |
|---|-------|---------|-----|
| 1 | `System.out.println()` | `@Slf4j` + `log.info()` | Structured logging |
| 2 | `if (cond) { assert... }` | `assertThat(cond)` first | Unconditional assertions |
```

### Best Practice Table Format

```markdown
| # | Practice | Context | Source |
|---|----------|---------|--------|
| 1 | `allSatisfy()` over `forEach` | Collection assertions | AssertJ |
| 2 | Constructor injection | Spring DI | CLAUDE.md |
```

## Step 4: Write Optimized Files

Preserve frontmatter, write optimized tables.

**EXECUTE** using Bash tool — validate structure:
```bash
bash "$FT_PLUGIN/skills/rules/scripts/rules.sh" validate && echo "✅ Validation passed" || echo "❌ Validation failed"
```

> **STOP if ❌** — fix table structure before continuing.

</instructions>

## Output Format

```markdown
# Rules Updated

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args or empty}` |
| Mode | `{file or session}` |

## Changes

| File | Added | Merged | Total |
|------|-------|--------|-------|
| avoid.md | N | N | N |
| best-practice.md | N | N | N |

## New Entries

### Avoid
| # | Pattern | Why |
|---|---------|-----|

### Best Practices
| # | Practice | Context |
|---|----------|---------|

## Optimization Applied

- Removed N duplicates
- Merged N related entries
- Files: `.claude/rules/avoid.md`, `.claude/rules/best-practice.md`
```

## Rules Frontmatter Reference

> **Source:** [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory.md#path-specific-rules)

### Official Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `paths` | No | Array of quoted glob patterns |

**Invalid fields:** `globs`, `alwaysApply`, `description` — NOT supported.

### Loading Behavior

| Frontmatter | Behavior |
|-------------|----------|
| **No `paths`** | Loads unconditionally (always) |
| **With `paths`** | ⚠️ Bug #16299: loads anyway at session start |

### Syntax Example

```yaml
---
paths:
  - "src/**/*.java"
  - "src/**/*.kt"
  - "!**/test/**"
---
```

| Rule | ❌ Bad | ✅ Good |
|------|--------|---------|
| Quote patterns | `**/*.kt` | `"**/*.kt"` |
| Array format | `paths: "**/*.ts"` | `paths: ["**/*.ts"]` |

> **⚠️ Bug #16299:** Lazy loading not working — all rules load at start.
> **Source:** [github.com/anthropics/claude-code/issues/16299](https://github.com/anthropics/claude-code/issues/16299)

## Error Handling

| Condition | Action |
|-----------|--------|
| No KNOWLEDGE.jsonl | Use session mode |
| Empty knowledge | Report "No new rules extracted" |
| No `.claude/rules/` | Create directory and files |
| Malformed entries | Skip with warning |
