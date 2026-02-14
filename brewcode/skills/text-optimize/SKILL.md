---
name: brewcode:text-optimize
description: Optimizes text and docs for LLM token efficiency. Use when - optimizing prompts, reducing tokens, compressing text, condensing verbose content. Trigger keywords - optimize, reduce tokens, compress, condense, slim, tighten, too verbose, shrink.
argument-hint: "[-l|-d] [file|folder|path1,path2] — -l light, -d deep, no flag = medium"
user-invocable: true
allowed-tools: [Read, Write, Edit, Grep, Glob, Task]
---

# Text & File Optimizer

## Step 0: Load Rules

> **REQUIRED:** Read `references/rules-review.md` before ANY optimization.
> If file not found -> ERROR + STOP. Do not proceed without rules reference.

## Modes

Parse `$ARGUMENTS`: `-l`/`--light` | `-d`/`--deep` | no flag -> medium (default).

| Mode | Flag | Scope |
|------|------|-------|
| Light | `-l`, `--light` | Text cleanup only — structure, lists, flow untouched |
| Medium | _(default)_ | Balanced restructuring — all standard transformations |
| Deep | `-d`, `--deep` | Max density — rephrase, merge, compress aggressively |

## Rule ID Quick Reference

| Category | Rule IDs | Scope |
|----------|----------|-------|
| Claude behavior | C.1-C.6 | Literal following, avoid "think", positive framing, match style, descriptive instructions, overengineering |
| Token efficiency | T.1-T.8 | Tables, bullets, one-liners, inline code, abbreviations, filler, comma lists, arrows |
| Structure | S.1-S.8 | XML tags, imperative, single source, context/motivation, blockquotes, progressive disclosure, consistent terminology, ref depth |
| Reference integrity | R.1-R.3 | Verify file paths, check URLs, linearize circular refs |
| Perception | P.1-P.6 | Examples near rules, hierarchy, bold keywords, standard symbols, instruction order, default over options |

### ID-to-Rule Mapping

| ID | Rule | ID | Rule |
|----|------|----|------|
| C.1 | Literal instruction following | C.2 | Avoid "think" word |
| C.3 | Positive framing (do Y not don't X) | C.4 | Match prompt style to output |
| C.5 | Descriptive over emphatic instructions | C.6 | Overengineering prevention |
| T.1 | Tables over prose (multi-column) | T.2 | Bullets over numbered (~5-10%) |
| T.3 | One-liners for rules | T.4 | Inline code over blocks |
| T.5 | Standard abbreviations (tables only) | T.6 | Remove filler words |
| T.7 | Comma-separated inline lists | T.8 | Arrows for flow notation |
| S.1 | XML tags for sections | S.2 | Imperative form |
| S.3 | Single source of truth | S.4 | Add context/motivation |
| S.5 | Blockquotes for critical | S.6 | Progressive disclosure |
| R.1 | Verify file paths | R.2 | Check URLs |
| R.3 | Linearize circular refs | P.1 | Examples near rules |
| P.2 | Hierarchy via headers (max 3-4) | P.3 | Bold for keywords (max 2-3/100 lines) |
| P.4 | Standard symbols (→ + / ✅❌⚠️) | | |
| S.7 | Consistent terminology | S.8 | One-level reference depth |
| P.5 | Instruction order (anchoring) | P.6 | Default over options |

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.6, T.6, R.1-R.3, P.1-P.4 | Text cleanup only — no restructuring |
| Medium | All rules (C + T + S + R + P) | Balanced transformations |
| Deep | All rules + aggressive rephrasing | Merge sections, max compression |

## Usage Examples

| Command | Description |
|---------|-------------|
| `/brewcode:text-optimize` | Optimize ALL: `CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md` |
| `/brewcode:text-optimize file.md` | Single file (medium mode) |
| `/brewcode:text-optimize -l file.md` | Light mode — text cleanup only, structure untouched |
| `/brewcode:text-optimize -d file.md` | Deep mode — max compression, review diff after |
| `/brewcode:text-optimize path1.md, path2.md` | Multiple files — parallel processing |
| `/brewcode:text-optimize -d agents/` | Directory — all `.md` files with specified mode |

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

> **Context:** BC_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook). Use it to access plugin resources.

```
Task(subagent_type: "text-optimizer", prompt: "FIRST: Read $BC_PLUGIN_ROOT/skills/text-optimize/references/rules-review.md for validation rules. THEN optimize {file} using {mode} mode. Apply transformations, verify refs, output report with metrics.")
```

> **Spawn parallel:** For multiple files, spawn ALL agents in ONE message for speed.

## Quality Checklist

### Before
- [ ] Read entire text
- [ ] Identify type (prompt, docs, agent, skill)
- [ ] Note critical info and cross-references

### During — Apply by Mode

| Check | Light | Med | Deep |
|-------|-------|-----|------|
| C.1-C.6 (Claude behavior) | Yes | Yes | Yes |
| T.6 (filler removal) | Yes | Yes | Yes |
| T.1-T.5, T.7-T.8 (token compression) | - | Yes | Yes |
| S.1-S.8 (structure/clarity) | - | Yes | Yes |
| R.1-R.3 (reference integrity) | Yes | Yes | Yes |
| P.1-P.4 (LLM perception) | Yes | Yes | Yes |
| Aggressive rephrasing | - | - | Yes |
| No information loss | Yes | Yes | Yes |

### After
- [ ] All facts preserved
- [ ] Logic consistent
- [ ] References valid (R.1-R.3)
- [ ] Tokens reduced

## Output Format

```markdown
## Optimization Report: [filename]

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines  | X      | Y     | -Z%    |
| Tokens | ~X     | ~Y    | -Z%    |

### Rules Applied
- [Rule IDs]: [Description of changes]

### Issues Found & Fixed
- [Issue]: [Resolution]

### Cross-Reference Verification
- [x] All file refs valid (R.1)
- [x] All URLs checked (R.2)
- [x] No circular refs (R.3)
```

## Anti-Patterns

| Avoid | Why |
|-------|-----|
| Remove all examples | Hurts generalization (P.1) |
| Over-abbreviate | Reduces readability (T.5 caveat) |
| Generic compression | Domain terms matter |
| Over-aggressive language | Opus 4.5 overtriggers (C.5) |
| Flatten hierarchy | Loses structure (P.2) |
| "Don't do X" framing | Less effective than "Do Y" (C.3) |
| Overengineer prompts | Opus 4.5 follows literally (C.6) |
| Overload single prompts | Divided attention, hallucinations (S.3) |
| Over-focus on wording | Structure > word choice (T.1) |
