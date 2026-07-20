---
name: text-optimizer
description: "Optimizes text, prompts, and documentation for LLM token efficiency. Applies 48 research-backed rules across 7 categories: Claude behavior, token efficiency, structure, deduplication, reference integrity, perception, and LLM comprehension. Use when optimizing prompts, reducing tokens, compressing verbose docs, or improving LLM instruction quality."
license: MIT
metadata:
  author: "kochetkov-ma"
  version: "2.16.0"
  source: "claude-brewcode"
allowed-tools: Read Write Edit Grep Glob
---

> Plugin: [kochetkov-ma/claude-brewcode](https://github.com/kochetkov-ma/claude-brewcode)

## Text Optimizer

Reduces token count in prompts, docs, and agent instructions by **20–40%** without losing meaning.
Applies **48 research-backed rules** across 7 categories: Claude behavior, token efficiency, structure, deduplication, reference integrity, perception, LLM comprehension.

**Benefits:** cheaper API calls · faster model responses · clearer LLM instructions · fewer hallucinations

**Examples:**
```bash
/text-optimize prompt.md          # single file, medium mode (default)
/text-optimize -d agents/         # deep mode — all .md files in directory
```

> _Skill text is written for LLM consumption and optimized for token efficiency._

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
| Claude behavior | C.1-C.8 | Literal following, avoid "think", positive framing, match style, descriptive instructions, overengineering, avoid ALL-CAPS, prompt format |
| Token efficiency | T.1-T.8, T.10 | Tables, bullets, one-liners, inline code, abbreviations, filler, comma lists, arrows, strip whitespace |
| Structure | S.1-S.8 | XML tags, imperative, single source, context/motivation, blockquotes, progressive disclosure, consistent terminology, ref depth |
| Deduplication | D.1-D.6 | Exact/near/cross-format merge, emphasis cap <=2, cross-file SSOT, wrong-merge guard |
| Reference integrity | R.1-R.3 | Verify file paths, check URLs, linearize circular refs |
| Perception | P.1-P.6 | Examples near rules, hierarchy, bold keywords, standard symbols, instruction order, default over options |
| LLM Comprehension | L.1-L.8 | Critical info position, documents-first, conciseness, quote-first, add WHY, reiterate constraint, prompt repetition, preserve scope qualifiers |

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
| L.7 | Prompt repetition (non-reasoning) | L.8 | Preserve scope qualifiers |
| D.1 | Exact-duplicate merge | D.2 | Near-duplicate merge (keep specific) |
| D.3 | Cross-format duplicate | D.4 | Emphasis cap (<=2/doc, echo @ END) |
| D.5 | Cross-file dedup (SSOT + pointer) | D.6 | Wrong-merge guard |

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.8, T.6, D.1, R.1-R.3, P.1-P.4, L.1-L.8 | Text cleanup only — no restructuring |
| Medium | All rules (C + T + S + D + R + P + L) | Balanced transformations |
| Deep | All rules (C + T + S + D + R + P + L) + aggressive rephrasing | Merge sections, max compression |

## Loss Budget per Mode

Content essence is untouchable at light/medium; small deliberate loss only at deep — explicitly reported. Dedup-merged facts count as preserved, never as loss.

| Mode | Semantic match target | Allowed loss |
|------|----------------------|--------------|
| Light | 100% | None — wording cleanup only |
| Medium | 100% | None — self-check fact inventory, zero loss |
| Deep | >= 95% | Low-value connective detail; self-verify round required, warn with loss list if < 95% |

## Deduplication Pass (All Modes)

Runs during analysis, BEFORE compression:

1. Build fact inventory: one atomic fact per line, numbered
2. Flag facts appearing 2+ times (exact, reworded, or cross-format)
3. Classify each repeat: intentional emphasis (marked critical/blockquote, or start+end sandwich) vs accidental
4. Accidental -> merge to single MOST SPECIFIC statement (D.1-D.3), best position wins
5. Intentional -> cap at 2: full form early + <=1-line echo at END (D.4)
6. Wrong-merge guard (D.6): differing scope/numbers/conditions = NOT duplicates — keep both

## Usage

| Input | Action |
|-------|--------|
| No args | Prompt user for file or folder path |
| Single path | Process file directly |
| `path1, path2` | Process files sequentially |
| `-l file.md` | Light mode — text cleanup only |
| `-d file.md` | Deep mode — max compression |
| `folder/` | All `.md` files in directory |

## File Processing

### Input Parsing

| Input | Action |
|-------|--------|
| No args | Prompt user for file or folder path |
| Single path | Process directly |
| `path1, path2` | Process files sequentially |

### Execution Flow

1. Read `references/rules-review.md` — load all optimization rules
2. Read target file(s)
3. Analyze: identify type (prompt, docs, agent, skill), note critical info and cross-references
3a. Dedup pass (D.1-D.6): fact inventory -> merge accidental dups -> cap intentional emphasis at 2/doc
4. Apply rules by mode (see Mode-to-Rules Mapping)
5. Edit file with optimized content
5a. Medium: self-check — re-check fact inventory against output, zero loss required
5b. Deep mode: self-verify — fact inventory original vs compressed, (kept + merged)/total >= 95%; merged = preserved; warn with loss list if below
6. Generate optimization report

## Quality Checklist

### Before
- [ ] Read entire text
- [ ] Identify type (prompt, docs, agent, skill)
- [ ] Note critical info and cross-references

### During — Apply by Mode

| Check | Light | Med | Deep |
|-------|-------|-----|------|
| C.1-C.8 (Claude behavior) | Yes | Yes | Yes |
| T.6 (filler removal) | Yes | Yes | Yes |
| T.1-T.5, T.7-T.8 (token compression) | - | Yes | Yes |
| T.10 (strip code whitespace) | - | Yes | Yes |
| S.1-S.8 (structure/clarity) | - | Yes | Yes |
| D.1 (exact dedup) | Yes | Yes | Yes |
| D.2-D.4, D.6 (smart dedup + emphasis cap) | - | Yes | Yes |
| D.5 (cross-file dedup, folder runs) | Yes | Yes | Yes |
| R.1-R.3 (reference integrity) | Yes | Yes | Yes |
| P.1-P.4 (LLM perception) | Yes | Yes | Yes |
| P.5-P.6 (anchoring, default-over-options) | - | Yes | Yes |
| L.1-L.8 (LLM comprehension) | Yes | Yes | Yes |
| Aggressive rephrasing | - | - | Yes |
| Loss within mode budget | 100% | 100% | >=95% |

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

---

**Full development platform:** [brewcode](https://github.com/kochetkov-ma/claude-brewcode) — infinite focus tasks, 16 agents, quorum reviews, knowledge persistence.
Install: `claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && claude plugin install brewcode@claude-brewcode`
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
| Merge similar-looking facts blindly | Different scope/numbers/conditions = different facts (D.6) |
