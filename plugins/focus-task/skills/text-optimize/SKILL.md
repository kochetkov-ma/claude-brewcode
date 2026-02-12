---
name: text-optimize
description: "Optimizes text/files for LLM consumption (Claude 4.x/Opus 4.5). Modes: -l (light), default (medium), -d (deep). Triggers: prompt optimization, file optimization, token reduction, context compression."
argument-hint: "[-l|-d] [file|folder|path1,path2] — -l light, -d deep, no flag = medium"
user-invocable: true
allowed-tools: [Read, Write, Edit, Grep, Glob, Task]
---

# Text & File Optimizer for Claude 4.x / Opus 4.5

> **FIRST:** Read `references/rules-review.md` for rule evidence and validation details.

Optimize any text/file for maximum LLM effectiveness.

## Modes

Parse `$ARGUMENTS`: `-l`/`--light` | `-d`/`--deep` | no flag → medium (default).

| Mode | Flag | Scope |
|------|------|-------|
| Light | `-l`, `--light` | Text cleanup only — structure, lists, flow untouched |
| Medium | _(default)_ | Balanced restructuring — all standard transformations |
| Deep | `-d`, `--deep` | Max density — rephrase, merge, compress aggressively |


## Usage Examples

| Command | Description |
|---------|-------------|
| `/focus-task:text-optimize` | Optimize ALL: `CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md` |
| `/focus-task:text-optimize file.md` | Single file (medium mode) |
| `/focus-task:text-optimize -l file.md` | Light mode — text cleanup only, structure untouched |
| `/focus-task:text-optimize -d file.md` | Deep mode — max compression, review diff after |
| `/focus-task:text-optimize path1.md, path2.md` | Multiple files — parallel processing |
| `/focus-task:text-optimize -d agents/` | Directory — all `.md` files with specified mode |

## Core Principles (Anthropic Official)

| Principle | Source | Impact |
|-----------|--------|--------|
| Smallest high-signal tokens | Context Engineering | Core philosophy |
| Explicit > implicit | Claude 4.5 training | Precise following |
| XML tags for structure | Claude 4.x docs | Better parsing |
| Tables 3x denser than prose | Anthropic research | -30-50% tokens |
| Dial back aggressive language | Opus 4.5 migration | Reduce overtriggering |
| Tell what TO DO, not what NOT to do | Claude 4 Best Practices | Better steering |

## Claude 4.5 / Opus 4.5 Specific

> Claude 4.x takes instructions literally. Earlier versions inferred intent; 4.x does what asked.

### Avoid These Patterns

```
❌ "CRITICAL: You MUST use..."    → ✅ "Use this tool when..."
❌ "think about..."               → ✅ "consider/evaluate/believe..."
❌ "You should do X"              → ✅ "Do X" (imperative)
❌ "Please note that..."          → ✅ Direct statement
❌ "It's important to..."         → ✅ > **Note:** ...
❌ "Do not use markdown"          → ✅ "Write in flowing prose paragraphs"
```

### Prefer These Patterns

| Pattern | Why |
|---------|-----|
| Add context/motivation | Claude generalizes from explanation |
| Explicit feature requests | 4.x won't "go above and beyond" by default |
| XML tags for sections | `<rules>`, `<examples>`, `<constraints>` |
| Examples near rules | Better pattern recognition |
| Tell what TO DO | More effective than telling what NOT to do |
| Match prompt style to output | Less markdown in prompt = less markdown in output |


## Optimization Dimensions

### 1. Token Efficiency (structural)

> **`code` > prose:** Inline code beats text explanation of same length. Example: `List.of()` vs "use immutable list factory method" — code wins.

| Transformation | Savings | When |
|----------------|---------|------|
| Prose → Tables | ~66% (3x denser) | Multi-column data |
| Numbered → Bullets | ~10% | Order irrelevant |
| Verbose → One-liner | ~40% | Simple rules |
| Bullet list → Comma-separated | ~50% | `a, b, c` inline when saving space |
| Code block → Inline | ~30% | <3 lines |
| Text → Inline `code` | ~30% | Short identifiers |
| Full → Abbreviation | ~20% | Tables only |

### 2. Logic & Clarity (semantic)

| Check | Fix |
|-------|-----|
| Contradictions | Resolve or flag |
| Ambiguity | Make explicit |
| Redundancy | Merge (single source of truth) |
| Missing context | Add motivation/why |
| Implicit assumptions | State explicitly |
| "Don't do X" | Reframe as "Do Y instead" |

### 3. Reference Integrity

| Issue | Action |
|-------|--------|
| Broken file refs | Verify paths exist |
| Dead URLs | Check or remove |
| Circular refs | Linearize |
| Orphan refs | Connect or remove |

### 4. LLM Perception (attention)

| Optimization | Effect |
|--------------|--------|
| Critical → blockquotes | Higher attention weight |
| Keywords → **bold** | Emphasis (max 2-3/section) |
| XML tags for sections | Clear boundary parsing |
| Hierarchy via headers | Structured retrieval (max 3-4 levels) |

## Transformation Rules

### Format (verified effective)

```
❌ Prose paragraphs           → ✅ Tables (multi-column only)
❌ Single-column tables       → ✅ Bullet lists
❌ `1. 2. 3.` numbered        → ✅ `- - -` bullets (if order irrelevant)
❌ 5-line code block          → ✅ Inline `code` if <3 lines
❌ Bullet per item            → ✅ Comma-separated `a, b, c` inline
❌ Repetition across sections → ✅ Single source of truth
❌ Decorative emojis          → ✅ Status only: ✅❌⚠️
❌ "Don't do X"               → ✅ "Do Y" (positive framing)
```

### Structure (XML for Claude 4.x)

```xml
<section_name>
Content with clear boundaries
</section_name>

<rules>
- Rule 1
- Rule 2
</rules>

<examples>
Example content
</examples>
```

### Agentic XML Patterns (Official)

For proactive tool usage:
```xml
<default_to_action>
By default, implement changes rather than only suggesting them.
If user's intent is unclear, infer the most useful action and proceed.
</default_to_action>
```

For parallel execution:
```xml
<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies,
make all independent calls in parallel. Maximize parallel tool calls
where possible. Never use placeholders or guess missing parameters.
</use_parallel_tool_calls>
```

Against hallucinations:
```xml
<investigate_before_answering>
Never speculate about code you have not opened. If user references
a specific file, you MUST read it before answering. Give grounded,
hallucination-free answers.
</investigate_before_answering>
```

### Abbreviations (tables/technical only)

| Full | Abbrev | Full | Abbrev |
|------|--------|------|--------|
| Required | REQ | Optional | OPT |
| Implementation | impl | Configuration | cfg |
| Arguments | args | Returns | ret |

## File Processing

### Input Parsing

| Input | Action |
|-------|--------|
| No args | Optimize ALL: `.claude/agents/*.md`, `.claude/skills/**/SKILL.md`, `CLAUDE.md` |
| Single path | Process directly |
| `path1, path2` | Parallel processing |

### 2-Phase Execution

**Phase 1: Analysis** — Parallel `Explore` agents

```
Task(subagent_type: "Explore", prompt: "Analyze {file}: structure, dependencies, cross-refs, redundancies")
```

**Phase 2: Optimization** — Parallel text-optimizer agents

> **Context:** FT_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook). Use it to access plugin resources.

```
Task(subagent_type: "text-optimizer", prompt: "FIRST: Read $FT_PLUGIN_ROOT/skills/text-optimize/references/rules-review.md for validation rules. THEN optimize {file} using {mode} mode. Apply transformations, verify refs, output report with metrics.")
```

> **Spawn parallel:** For multiple files, spawn ALL agents in ONE message for speed.

## Quality Checklist

### Before
- [ ] Read entire text
- [ ] Identify type (prompt, docs, agent, skill)
- [ ] Note critical info
- [ ] Check references/links

### During
- [ ] Respect mode constraints (light: text only | medium: restructure | deep: compress)
- [ ] No information loss (all modes)
- [ ] Tables for multi-column only (medium+)
- [ ] One-liners for rules (medium+)
- [ ] XML tags for major sections (medium+)
- [ ] Remove filler words (all modes)
- [ ] Merge duplicates (medium+)
- [ ] Calm aggressive language (all modes)
- [ ] Positive framing (all modes)
- [ ] Rephrase → shorter forms (deep only)
- [ ] Match prompt style to desired output style

### After
- [ ] All facts preserved
- [ ] Logic consistent
- [ ] References valid
- [ ] Tokens reduced

## Output Format

```markdown
## Optimization Report: [filename]

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines  | X      | Y     | -Z%    |
| Tokens | ~X     | ~Y    | -Z%    |

### Transformations Applied
- [List]

### Issues Found & Fixed
- [Issue]: [Resolution]

### Cross-Reference Verification
- [x] All file refs valid
- [x] All agent/skill refs valid
```

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Remove all examples | Hurts generalization |
| Over-abbreviate | Reduces readability |
| Generic compression | Domain terms matter |
| Over-aggressive language | Opus 4.5 overtriggers |
| Flatten hierarchy | Loses structure |
| "Don't do X" framing | Less effective than "Do Y" |
| Overengineer prompts | Opus 4.5 follows literally |

