---
name: brewtools:text-optimize
description: Optimizes text and docs for LLM token efficiency. Use when - optimizing prompts, reducing tokens, compressing text, condensing verbose content, encoding for CLAUDE.md, compressing for context/prompt/LLM. Trigger keywords - optimize, reduce tokens, compress, condense, slim, tighten, too verbose, shrink, encode, deep compress, deep encode, super compress, maximum compress.
argument-hint: "[-l|-s|-d] [file|folder|path1,path2] — -l light, -s standard (30-50%), -d deep (LLM-only), no flag = medium or auto-detect"
user-invocable: true
allowed-tools: [Read, Write, Edit, Grep, Glob, Task, AskUserQuestion]
---

# Text & File Optimizer

## Step 0: Load Rules

> **REQUIRED:** Read `references/rules-review.md` before ANY optimization.
> If file not found -> ERROR + STOP. Do not proceed without rules reference.

## Modes

Parse `$ARGUMENTS`: `-l`/`--light` | `-s`/`--standard` | `-d`/`--deep` | no flag -> medium (default) or auto-detect.

| Mode | Flag | Target | Compression | Human-readable | Verification |
|------|------|--------|-------------|----------------|--------------|
| Light | `-l`, `--light` | Any | Minimal | Yes | None |
| Medium | _(default)_ | Any | Moderate | Yes | None |
| Standard | `-s`, `--standard` | Docs, README | 30-50% | Yes | 1 round |
| Deep | `-d`, `--deep` | CLAUDE.md, system prompts, agent/skill defs, KNOWLEDGE | 2-3x | No (LLM-only) | 1-2 rounds |

## Smart Auto-Detection

When no flag provided AND input suggests compression (not just optimization):

1. Parse file path + content header
2. Classify:
   - LLM-only files (`CLAUDE.md`, `.claude/rules/*.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md`, `KNOWLEDGE.*`, system prompts) → deep candidate
   - `README.md`, `docs/`, API references, user-facing docs → standard candidate
   - Unknown / mixed → ask user via AskUserQuestion
3. If confident → tell user: "Selected mode: {mode} for {file} because {reason}"
4. If ambiguous → AskUserQuestion with mode options
5. User can override via flags regardless of auto-detection

### Context Hints from Prompt Text

| Hint | Mode |
|------|------|
| "compress for CLAUDE.md / for context / for prompt / for LLM" | deep |
| "deep compress / deep encode / super compress / maximum" | deep |
| "compress / slim / tighten" (generic) | standard |
| "safe compress / human readable" | standard |
| Explicit target (e.g., "reduce by 70%") | adjust aggressiveness |

## Rule ID Quick Reference

| Category | Rule IDs | Scope |
|----------|----------|-------|
| Claude behavior | C.1-C.8 | Literal following, avoid "think", positive framing, match style, descriptive instructions, overengineering, avoid ALL-CAPS, prompt format |
| Token efficiency | T.1-T.8, T.10 | Tables, bullets, one-liners, inline code, abbreviations, filler, comma lists, arrows, strip whitespace |
| Structure | S.1-S.8 | XML tags, imperative, single source, context/motivation, blockquotes, progressive disclosure, consistent terminology, ref depth |
| Reference integrity | R.1-R.3 | Verify file paths, check URLs, linearize circular refs |
| Perception | P.1-P.6 | Examples near rules, hierarchy, bold keywords, standard symbols, instruction order, default over options |
| LLM Comprehension | L.1-L.7 | Critical info position, documents-first, conciseness, quote-first, add WHY, reiterate constraint, prompt repetition |

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
| C.7 | Avoid ALL-CAPS emphasis (4.x) | C.8 | Prompt format → output format |
| T.10 | Strip whitespace from code | | |
| L.1 | Critical info at START or END | L.2 | Documents first, query last |
| L.3 | Explicitly request conciseness | L.4 | Quote-first grounding |
| L.5 | Add WHY to instructions | L.6 | Reiterate constraint at END |
| L.7 | Prompt repetition (non-reasoning) | | |

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.8, T.6, R.1-R.3, P.1-P.4, L.1-L.7 | Text cleanup only — no restructuring |
| Medium | All rules (C + T + S + R + P + L) | Balanced transformations |
| Standard | All rules (C + T + S + R + P + L) + `references/standard-compression.md` | 30-50% compression, human-readable, 1 verification round |
| Deep | All rules (C + T + S + R + P + L) + `references/deep-compression.md` | DICT header, symbol substitutions, 1-2 verification rounds (conditional) |

## Usage Examples

| Command | Description |
|---------|-------------|
| `/brewtools:text-optimize` | Optimize ALL: `CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md` |
| `/brewtools:text-optimize file.md` | Single file (medium mode) |
| `/brewtools:text-optimize -l file.md` | Light mode — text cleanup only, structure untouched |
| `/brewtools:text-optimize -d file.md` | Deep mode — max compression, review diff after |
| `/brewtools:text-optimize path1.md, path2.md` | Multiple files — parallel processing |
| `/brewtools:text-optimize -d agents/` | Directory — all `.md` files with specified mode |
| `/brewtools:text-optimize -s README.md` | Standard mode — 30-50% compression, human-readable |
| `/brewtools:text-optimize -d CLAUDE.md` | Deep mode — dictionary compression, LLM-only output |
| `/brewtools:text-optimize CLAUDE.md` | Auto-detect → selects deep for CLAUDE.md |
| `/brewtools:text-optimize README.md` | Auto-detect → selects standard for README |
| `/brewtools:text-optimize "super compress" file.md` | Prompt hint → deep mode |

## File Processing

### Input Parsing

| Input | Action |
|-------|--------|
| No args | Optimize ALL: `CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**/SKILL.md` |
| Single path | Process directly |
| `path1, path2` | Parallel processing |

### 2-Phase Execution

> **Orchestration:** Phase 1+2 are executed by the SKILL in the main conversation (manager level). The text-optimizer agent handles single-file optimization only — it cannot spawn sub-agents.

**Phase 1: Analysis** — Parallel `Explore` agents

```
Task(subagent_type: "Explore", prompt: "Analyze {file}: structure, dependencies, cross-refs, redundancies")
```

**Phase 2: Optimization** — Parallel text-optimizer agents

> **Context:** BT_PLUGIN_ROOT is available in your context (injected by pre-task.mjs hook). Use it to access plugin resources.

```
Task(subagent_type: "text-optimizer", prompt: "FIRST: Read $BT_PLUGIN_ROOT/skills/text-optimize/references/rules-review.md for validation rules. FOR STANDARD MODE: Also read $BT_PLUGIN_ROOT/skills/text-optimize/references/standard-compression.md. FOR DEEP MODE: Also read $BT_PLUGIN_ROOT/skills/text-optimize/references/deep-compression.md. THEN optimize {file} using {mode} mode. Apply transformations, verify refs, output report with metrics.")
```

> **Spawn parallel:** For multiple files, spawn ALL agents in ONE message for speed.

## Quality Checklist

### Before
- [ ] Read entire text
- [ ] Identify type (prompt, docs, agent, skill)
- [ ] Note critical info and cross-references

### During — Apply by Mode

| Check | Light | Med | Std | Deep |
|-------|-------|-----|-----|------|
| C.1-C.8 (Claude behavior) | Yes | Yes | Yes | Yes |
| T.6 (filler removal) | Yes | Yes | Yes | Yes |
| T.1-T.5, T.7-T.8 (token compression) | - | Yes | Yes | Yes |
| S.1-S.8 (structure/clarity) | - | Yes | Yes | Yes |
| R.1-R.3 (reference integrity) | Yes | Yes | Yes | Yes |
| P.1-P.4 (LLM perception) | Yes | Yes | Yes | Yes |
| L.1-L.7 (LLM comprehension) | Yes | Yes | Yes | Yes |
| Standard compression ref | - | - | Yes | - |
| Deep compression ref + DICT | - | - | - | Yes |
| Aggressive rephrasing | - | - | - | Yes |
| Verification round(s) | - | - | 1 | 2 |
| No information loss | Yes | Yes | Yes | Yes |

## Deep Mode Pipeline

### Phase 1: Compress
- Load `references/deep-compression.md` for symbol/abbreviation tables
- Scan text for terms occurring 3+ times → build DICT header
- Apply symbol substitutions, filler removal, structural compression
- Apply existing rules (C, T, S, R, P) in addition to deep techniques

### Phase 2: Verify Round 1
- Spawn verification agent with ORIGINAL + COMPRESSED text
- Agent reads both, lists all lost/distorted facts
- Calculate semantic match %
- If >= 95% → done
- If < 95% → return loss list for patching

### Phase 3: Patch + Verify Round 2
- Apply patches for missing facts
- Re-verify
- If still < 95% → warn user with loss list
- Output final result + statistics

## Standard Mode Pipeline

### Phase 1: Compress
- Load `references/standard-compression.md`
- Remove filler words/constructions
- Merge repeated ideas
- Convert paragraphs to bullets/tables where appropriate
- Apply existing rules (C, T, S, R, P)

### Phase 2: Verify
- Compare compressed vs original
- List any lost facts → patch
- One round only

## Iron Rules (All Modes)

| Rule | Detail |
|------|--------|
| Preserve | Names, numbers, dates, URLs, file paths, versions, ports, sizes |
| Preserve | Negative rule semantics (`!=` notation in deep mode) |
| Preserve | At least one example per rule with examples |
| Deep only | DICT header at document start |
| Output | Statistics: original (chars/words/~tokens), compressed (chars/words/~tokens), ratio, semantic match % |

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
