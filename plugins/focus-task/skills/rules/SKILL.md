---
name: rules
description: Updates .claude/rules/avoid.md and best-practice.md from KNOWLEDGE.jsonl or session context. Triggers: "update rules", "sync knowledge to rules", "extract rules from knowledge".
user-invocable: true
argument-hint: "[path-to-KNOWLEDGE.jsonl]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
context: fork
model: sonnet
---

Update Rules — extract from [KNOWLEDGE.jsonl]

## Overview

Extracts anti-patterns and best practices from accumulated knowledge, optimizes `.claude/rules/avoid.md` and `.claude/rules/best-practice.md`.

<instructions>

## Mode Detection

| Mode | Condition | Source |
|------|-----------|--------|
| **File** | `$ARGUMENTS` contains path | Parse KNOWLEDGE.jsonl |
| **Session** | `$ARGUMENTS` empty | Analyze session context |

## Step 1: Extract Knowledge

### File Mode

**EXECUTE** using Bash tool — read knowledge file:
```bash
test -f "$ARGUMENTS" && cat "$ARGUMENTS" | head -100 || echo "❌ File not found: $ARGUMENTS"
```

Parse entries:
- `t:"❌"` → anti-pattern (avoid)
- `t:"✅"` → best practice
- `t:"ℹ️"` → info, determine category by content

### Session Mode

Scan conversation for:
- Errors encountered and fixes applied
- Patterns that worked well
- Warnings or gotchas discovered
- Code review findings

## Step 2: Read Existing Rules

**EXECUTE** using Bash tool — check existing rules:
```bash
test -f .claude/rules/avoid.md && echo "✅ avoid.md exists" || echo "⚠️ avoid.md missing"
test -f .claude/rules/best-practice.md && echo "✅ best-practice.md exists" || echo "⚠️ best-practice.md missing"
```

If missing, **EXECUTE** using Bash tool — create from templates:
```bash
mkdir -p .claude/rules
PLUGIN_TEMPLATES="$HOME/.claude/plugins/cache/claude-brewcode/focus-task/$(ls -v $HOME/.claude/plugins/cache/claude-brewcode/focus-task 2>/dev/null | tail -1)/templates"
test -f .claude/rules/avoid.md || cp "$PLUGIN_TEMPLATES/rules/avoid.md.template" .claude/rules/avoid.md
test -f .claude/rules/best-practice.md || cp "$PLUGIN_TEMPLATES/rules/best-practice.md.template" .claude/rules/best-practice.md
```

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
grep -q "^| #" .claude/rules/avoid.md && echo "✅ avoid.md valid" || echo "❌ avoid.md invalid structure"
grep -q "^| #" .claude/rules/best-practice.md && echo "✅ best-practice.md valid" || echo "❌ best-practice.md invalid structure"
```

> **STOP if any ❌** — fix table structure before continuing.

</instructions>

## Output Format

```markdown
# Rules Updated

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

## Path-Specific Rules

When adapting for project (via `/focus-task-adapt`), update frontmatter:

```yaml
paths:
  - "src/**/*.java"
  - "src/**/*.kt"
  - "!**/test/**"
```

## Error Handling

| Condition | Action |
|-----------|--------|
| No KNOWLEDGE.jsonl | Use session mode |
| Empty knowledge | Report "No new rules extracted" |
| No `.claude/rules/` | Create directory and files |
| Malformed entries | Skip with warning |
