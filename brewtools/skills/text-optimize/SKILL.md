---
name: brewtools:text-optimize
description: Optimizes text/docs for LLM token efficiency. Triggers - optimize, reduce tokens, compress, deep compress.
argument-hint: "[-l|-s|-d|-x|--max] [file|folder|path1,path2] — -l light, -s standard (30-50%), -d deep (LLM-only), -x|--max max (LLM-only, atomic fact-lines, 2-round verify), no flag = medium or auto-detect"
user-invocable: true
allowed-tools: [Read, Write, Edit, Grep, Glob, Task, AskUserQuestion]
---

# Text & File Optimizer

## Step 0: Load Rules

> **REQUIRED:** Read `references/rules-review.md` before ANY optimization.
> If file not found -> ERROR + STOP. Do not proceed without rules reference.

## Modes

Parse `$ARGUMENTS`: `-l`/`--light` | `-s`/`--standard` | `-d`/`--deep` | `-x`/`--max` | no flag -> medium (default) or auto-detect.

| Mode | Flag | Target | Compression | Human-readable | Verification |
|------|------|--------|-------------|----------------|--------------|
| Light | `-l`, `--light` | Any | Minimal | Yes | None |
| Medium | _(default)_ | Any | Moderate | Yes | Self-check (fact inventory) |
| Standard | `-s`, `--standard` | Docs, README | 30-50% | Yes | 1 round (>=98%) |
| Deep | `-d`, `--deep` | CLAUDE.md, system prompts, agent/skill defs, KNOWLEDGE | 2-3x | No (LLM-only) | 1-2 rounds (>=95%) |
| Max | `-x`, `--max` | CLAUDE.md, system prompts, KNOWLEDGE | 3-4x | No (LLM-only) | 2 mandatory (>=95% + 100% sub-gate) |

## Loss Budget per Mode

Content essence is untouchable at light/medium/standard; small deliberate loss is allowed only at deep/max — explicitly reported. Dedup-merged facts count as preserved, never as loss.

| Mode | Semantic match target | Allowed loss |
|------|----------------------|--------------|
| Light | 100% | None — wording cleanup only |
| Medium | 100% | None — restructure, zero fact loss (self-check) |
| Standard | >= 98% | None intended; verification patches any slip |
| Deep | >= 95% | Low-value connective detail only, listed in report |
| Max | >= 95% + 100% sub-gate (numbers/names/negations/scope) | Small, explicit, user-reviewed loss list |

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
6. **Max is opt-in only** — NEVER auto-selected without an explicit `-x`/`--max` flag or an explicit maximum/extreme compress hint

### Context Hints from Prompt Text

| Hint | Mode |
|------|------|
| "compress for CLAUDE.md / for context / for prompt / for LLM" | deep |
| "deep compress / deep encode / super compress / maximum" | deep |
| "compress / slim / tighten" (generic) | standard |
| "safe compress / human readable" | standard |
| "max compress / extreme / maximum density / atomic" | max |
| Explicit target (e.g., "reduce by 70%") | adjust aggressiveness |

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
| L.7 | Prompt repetition (non-reasoning) | | |
| L.8 | Preserve scope qualifiers | D.1 | Exact-duplicate merge |
| D.2 | Near-duplicate merge (keep specific) | D.3 | Cross-format duplicate |
| D.4 | Emphasis cap (<=2/doc, echo @ END) | D.5 | Cross-file dedup (SSOT + pointer) |
| D.6 | Wrong-merge guard | | |

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.8, T.6, D.1, R.1-R.3, P.1-P.4, L.1-L.8 | Text cleanup + exact-dup removal — no restructuring |
| Medium | All rules (C + T + S + D + R + P + L) | Balanced transformations |
| Standard | All rules (C + T + S + D + R + P + L) + `references/standard-compression.md` | 30-50% compression, human-readable, 1 verification round |
| Deep | All rules (C + T + S + D + R + P + L) + `references/deep-compression.md` | DICT header, symbol substitutions, 1-2 verification rounds (conditional) |
| Max | All rules (C + T + S + D + R + P + L) + `references/deep-compression.md` + `references/max-compression.md` | Atomic fact-lines, ASCII operators, format-aware tables, 4 mandatory guardrails, 2 verification rounds |

> D.5 (cross-file dedup) applies in ANY mode when processing multiple files or a folder. D.6 wrong-merge guard is mandatory wherever D.2/D.3/D.5 run.

## Deduplication Pass (All Modes)

Runs during analysis, BEFORE compression:

1. Build fact inventory: one atomic fact per line, numbered
2. Flag facts appearing 2+ times (exact, reworded, or cross-format)
3. Classify each repeat: intentional emphasis (marked critical/blockquote, or start+end sandwich) vs accidental (everything else)
4. Accidental -> merge to single MOST SPECIFIC statement (D.1-D.3), best position wins
5. Intentional -> cap at 2: full form early + <=1-line echo at END (D.4)
6. Wrong-merge guard (D.6): differing scope/numbers/conditions = NOT duplicates — keep both
7. Deep/max: record merges in dedup ledger (kept <- dropped) for verification

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
| `/brewtools:text-optimize -x CLAUDE.md` | Max mode — atomic fact-lines + ASCII operators, LLM-only, 2-round verify |
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

```
Task(subagent_type: "text-optimizer", prompt: "Optimize {file} in {mode} mode. Load rule and compression references per your agent definition Step 0/Step 2 (${CLAUDE_PLUGIN_ROOT} is natively substituted at spawn). Run the dedup pass (D.1-D.6) before compressing. Apply transformations, verify refs, run the mode's verification protocol, output report with metrics + fact-inventory result.")
```

> **Spawn parallel:** For multiple files, spawn ALL agents in ONE message for speed.

## Quality Checklist

### Before
- [ ] Read entire text
- [ ] Identify type (prompt, docs, agent, skill)
- [ ] Note critical info and cross-references

### During — Apply by Mode

| Check | Light | Med | Std | Deep | Max |
|-------|-------|-----|-----|------|-----|
| C.1-C.8 (Claude behavior) | Yes | Yes | Yes | Yes | Yes |
| T.6 (filler removal) | Yes | Yes | Yes | Yes | Yes |
| T.1-T.5, T.7-T.8 (token compression) | - | Yes | Yes | Yes | Yes |
| S.1-S.8 (structure/clarity) | - | Yes | Yes | Yes | Yes |
| R.1-R.3 (reference integrity) | Yes | Yes | Yes | Yes | Yes |
| P.1-P.4 (LLM perception) | Yes | Yes | Yes | Yes | Yes |
| P.5-P.6 (anchoring, default-over-options) | - | Yes | Yes | Yes | Yes |
| L.1-L.8 (LLM comprehension) | Yes | Yes | Yes | Yes | Yes |
| D.1 (exact dedup) | Yes | Yes | Yes | Yes | Yes |
| D.2-D.4, D.6 (smart dedup + emphasis cap) | - | Yes | Yes | Yes | Yes |
| D.5 (cross-file dedup, multi-file runs) | Yes | Yes | Yes | Yes | Yes |
| Standard compression ref | - | - | Yes | - | - |
| Deep compression ref + DICT | - | - | - | Yes | Yes |
| Aggressive rephrasing | - | - | - | Yes | Yes |
| Max compression ref (atomic fact-lines) | - | - | - | - | Yes |
| Guardrails C1-C4 (scope, punctuation, signal/token) | - | - | - | - | Yes |
| Verification round(s) | - | self | 1 | 1-2 | 2 |
| Loss within mode budget (see Loss Budget) | 100% | 100% | >=98% | >=95% | >=95% |

## Deep Mode Pipeline

### Phase 1: Compress
- Load `references/deep-compression.md` for symbol/abbreviation tables
- Dedup pass (D.1-D.6) + dedup ledger before symbol substitution (see deep-compression.md Redundancy Factoring + Token-Class Keep/Drop Heuristics)
- Scan text for terms occurring 3+ times → build DICT header
- Apply symbol substitutions, filler removal, structural compression
- Apply existing rules (C, T, S, R, P) in addition to deep techniques

### Phase 2: Verify Round 1
- Spawn verification agent with ORIGINAL + COMPRESSED text
- Agent extracts numbered atomic-fact inventory from ORIGINAL, checks each in COMPRESSED, labels kept/merged/lost/distorted; match % = (kept + merged) / total; verifies no two distinct facts merged into one (D.6)
- Calculate semantic match %
- If >= 95% → done
- If < 95% → return loss list for patching

### Phase 3: Patch + Verify Round 2
- Apply patches for missing facts
- Re-verify
- If still < 95% → warn user with loss list
- Output final result + statistics
- Optional reconstruction probe: expand compressed back to prose, diff entities/numbers vs original (entities are lost first)

## Max Mode Pipeline

### Phase 1: Compress
- Dedup pass (D.1-D.6) + build dedup ledger before symbol substitution (deep-compression.md Redundancy Factoring)
- Apply all Deep techniques (DICT header, symbol substitutions, structural compression)
- Load `references/max-compression.md` for atomic fact-line decomposition, ASCII operator dialect, format-aware tables
- Respect guardrails C1-C4: optimize for signal/token (not raw token count); preserve scope qualifiers; ~20% deletion ceiling — never strip punctuation; consistent terminology throughout
- Chain-of-Density final pass (B4): fuse missing entities at fixed length

### Phase 2: Verify Round 1 — Claim Inventory
- Spawn verification agent with ORIGINAL + COMPRESSED
- Agent decomposes original into numbered atomic claims (one predicate per claim), labels each kept/merged/lost/distorted
- Semantic match % = (kept + merged) / total; merged (deduplicated) facts = preserved
- Gate >= 95% -> proceed; < 95% -> return loss list

### Phase 3: Patch + Verify Round 2 — Self-QA Probe (MANDATORY)
- Apply patches; Round 2 is mandatory, NEVER skip; use the INDEPENDENT method: generate 10-20 questions from original (entities, numbers, conditions, negations), answer from compressed only
- Sub-gate: 100% of numbers, names, negations, scope qualifiers must survive
- If still < 95% or sub-gate fails -> warn user with explicit loss list (lost/distorted/merged labels)
- Output final result + statistics

## Standard Mode Pipeline

### Phase 1: Compress
- Load `references/standard-compression.md`
- Dedup pass (D.1-D.4, D.6) on fact inventory — merge accidental repeats, cap emphasis at 2
- Sentence-level zero-loss pruning before wording compression
- Remove filler words/constructions
- Merge repeated ideas
- Convert paragraphs to bullets/tables where appropriate
- Apply existing rules (C, T, S, R, P)

### Phase 2: Verify
- Extract atomic-fact inventory from original; check each fact in compressed
- Gate: (kept + merged) / total >= 98% — list lost facts -> patch
- One round only

## Iron Rules (All Modes)

| Rule | Detail |
|------|--------|
| Preserve | Names, numbers, dates, URLs, file paths, versions, ports, sizes |
| Preserve | Negative rule semantics (`!=` notation in deep mode) |
| Preserve | At least one example per rule with examples |
| Preserve | Scope qualifiers ("every section, not just the first") — Opus 4.8 literalism (Max/Deep) |
| Deep only | DICT header at document start |
| Max only | Atomic fact-lines, ASCII operators over unicode glyphs, 2 mandatory verification rounds |
| Dedup | Accidental dups merged; intentional emphasis <= 2/doc, 2nd occurrence short @ END (D.4); merged facts = preserved, never counted as loss |
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
| Merge similar-looking facts blindly | Different scope/numbers/conditions = different facts (D.6) |
