# Text Optimization: Compact Rules (Fallback)

> Use when brewtools is NOT installed and text-optimizer agent is unavailable.
> For full rules: install brewtools plugin and use `text-optimizer` agent.

## Key Rules by Category

### C -- Claude Behavior

| ID | Rule | Key Point |
|----|------|-----------|
| C.1 | Literal following | Instructions execute exactly as written -- be precise |
| C.3 | Positive framing | "Do Y" not "Don't do X" |
| C.5 | Descriptive over emphatic | "Use when..." not "CRITICAL: MUST..." |
| C.6 | No overengineering | Claude follows literally -- simpler is better |
| C.7 | No ALL-CAPS emphasis | Normal tone; aggressive caps causes overapplication |

### T -- Token Efficiency

| ID | Rule | Key Point |
|----|------|-----------|
| T.1 | Tables over prose | Multi-column data ~30% savings; single-column use bullets |
| T.2 | Bullets over numbered | `-` (1 char) vs `1. ` (3 chars), ~5-10% savings |
| T.3 | One-liners for rules | `bad -> good` is self-documenting |
| T.4 | Inline code over blocks | Inline `code` for <3 lines |
| T.6 | Remove filler | Cut "please note", "it's important", "basically" |
| T.7 | Comma-separated inline | `a, b, c` for 3-7 short items |
| T.8 | Arrows for flow | `A -> B -> C` not prose sequences |

### S -- Structure

| ID | Rule | Key Point |
|----|------|-----------|
| S.1 | XML tags for sections | `<rules>...</rules>` -- clear parsing boundaries |
| S.2 | Imperative form | "Do X" not "You should do X" |
| S.3 | Single source of truth | Merge duplicates; repetition wastes tokens |
| S.6 | Progressive disclosure | Overview -> details -> examples; SKILL.md <500 lines |
| S.7 | Consistent terminology | One term per concept, no synonyms |

### R -- Reference Integrity

| ID | Rule | Key Point |
|----|------|-----------|
| R.1 | Verify file paths | Use Read/Glob to confirm before writing |
| R.2 | Check URLs | Validate accessible URLs |

### P -- Perception

| ID | Rule | Key Point |
|----|------|-----------|
| P.1 | Examples near rules | Inline, not in appendix |
| P.2 | Max 3-4 header levels | Structured documents improve retrieval |
| P.3 | Bold for keywords | Max 2-3 per 100 lines |
| P.5 | Critical info first | First-position = strongest anchoring |

### L -- LLM Comprehension

| ID | Rule | Key Point |
|----|------|-----------|
| L.1 | Critical info at START or END | Middle content gets 40-50% less attention |
| L.5 | Add WHY to instructions | Claude generalizes the reason to edge cases |

## Self-Apply Instructions

1. Read entire text to understand context
2. Apply T.6 first (remove filler) -- easiest wins
3. Apply T.1 (convert prose lists -> tables where applicable)
4. Apply T.2-T.4 (compress remaining lists/code)
5. Apply S.2 (imperative form)
6. Verify: no information loss, all refs valid
7. Target: 20-40% token reduction

## Anti-Patterns

| Avoid | Why |
|-------|-----|
| Remove examples | Hurts generalization (P.1) |
| Over-abbreviate | Reduces readability |
| Flatten hierarchy | Loses structure (P.2) |
| Compress domain terms | 30+ point accuracy drops (T.5) |

## Compression Ratios

| Content Type | Typical Savings |
|--------------|-----------------|
| Prose docs | 40-50% |
| Technical specs | 20-30% |
| System prompts | 30-40% |
