---
name: text-optimize
description: "Optimizes text/docs for LLM token efficiency. Triggers - optimize, reduce tokens, compress, deep compress."
---

# Optimize text for tokens

Compress the requested text while preserving every load-bearing constraint, identifier, example, and safety rule. Measure before and after size, explain material removals, and write only to the requested Codex-owned artifact path. Do not create Markdown agent definitions or unsupported agent calls.

## Complete native workflow

Follow every phase below. When a phase delegates work, use Codex collaboration with only `task_name` and `message`; treat each "Codex delegation brief" block as role and message content, not executable syntax. Use `request_user_input` for the documented user gates. Resolve `<skill-directory>`, `<plugin-root>`, `<project-root>`, and `<arguments>` before running commands.


# Text & File Optimizer

## Prompt contract

Position 1 of `<arguments>` is a **free-form prompt** (RU/EN) -- depth flags and paths are optional
and may follow in any order. Nobody types keys: resolve the depth (mode) + scope FROM the prompt.
The depth flags (`-l`/`-s`/`-d`/`-x`) ARE this skill's modes -- see the keyword-annotated Modes
table below.

1. Strip flags (`-l`, `-s`, `-d`, `-x`, `--light`, `--standard`, `--deep`, `--max`). An explicit
   flag anywhere wins outright, no scoring.
2. Else score depths by distinct whole-word keyword hits (Modes table below / Context Hints
   table). Highest unique score wins; tie -> the keyword appearing first; all zero -> `medium`
   (Smart Auto-Detection then still applies file-type heuristics on top).
3. Empty arguments -> `medium`, or Smart Auto-Detection's per-file-type candidate when the input
   is an LLM-only or user-facing doc path; ask ONE scoping `request_user_input` only when
   auto-detection is ambiguous (already Smart Auto-Detection step 4).
4. `--max` is opt-in only -- never auto-selected without an explicit `-x`/`--max` flag or an
   explicit maximum/extreme compress hint (unchanged rule, restated here for the contract).
5. Prose that is not a flag/depth keyword is still input: extract the target path(s) from it,
   never treat the first word of a sentence as a positional path.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:text-optimize
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved depth> — <explicit flag | matched keyword: X | auto-detected | default>
SCOPE:  <resolved target paths, resolved depth>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language. SCOPE MUST name the resolved
target paths and the resolved depth. Print it once mode + target files are resolved (end of
Input Parsing below), before Phase 1 Analysis spawns.

## Step 0: Load Rules

> **REQUIRED:** Read `references/rules-review.md` before ANY optimization.
> If file not found -> ERROR + STOP. Do not proceed without rules reference.

## Modes

Parse `<arguments>`: `-l`/`--light` | `-s`/`--standard` | `-d`/`--deep` | `-x`/`--max` | no flag -> medium (default) or auto-detect.

| Mode | Flag / EN keywords | RU keywords | Target | Compression | Human-readable | Verification | Mutates? |
|------|---------------------|--------------|--------|-------------|-----------------|---------------|----------|
| Light | `-l`, `--light`, light, quick clean | лёгкая, лёгкий, почисти текст | Any | Minimal | Yes | None | yes |
| Medium | _(default)_, medium, balanced | средняя, сбалансируй | Any | Moderate | Yes | Self-check (fact inventory) | yes |
| Standard | `-s`, `--standard`, compress, slim, tighten, safe compress, human readable | стандарт, сожми, для людей | Docs, README | 30-50% | Yes | 1 round (>=98%) | yes |
| Deep | `-d`, `--deep`, compress for AGENTS.md, for context, for prompt, for LLM, deep compress, super compress, maximum | глубокая, для контекста, максимально | AGENTS.md, system prompts, agent/skill defs, KNOWLEDGE | 2-3x | No (LLM-only) | 1-2 rounds (>=95%) | yes |
| Max | `-x`, `--max`, max compress, extreme, maximum density, atomic | максимум, предельно, атомарно | AGENTS.md, system prompts, KNOWLEDGE | 3-4x | No (LLM-only) | 2 mandatory (>=95% + 100% sub-gate) | yes |

## Loss Budget per Mode

Content essence is untouchable at light/medium/standard; small deliberate loss is allowed only at deep/max — explicitly reported. Dedup-merged facts count as preserved, never as loss.

| Mode | Semantic match target | Allowed loss |
|------|----------------------|--------------|
| Light | 100% | None — wording cleanup only |
| Medium | 100% | None — restructure, zero fact loss (self-check) |
| Standard | >= 98% | None intended; verification patches any slip |
| Deep | >= 95% | Word-level drops (A.2, ledgered, gate-neutral) + generic known-facts (A.4, `elided-known`, consumes gate), listed in report |
| Max | >= 95% + 100% sub-gate (numbers/names/negations/scope) | Small, explicit, user-reviewed loss list |

## Smart Auto-Detection

When no flag provided AND input suggests compression (not just optimization):

1. Parse file path + content header
2. Classify:
   - LLM-only files (`AGENTS.md`, `.codex/rules/*.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md`, `KNOWLEDGE.*`, system prompts) → deep candidate
   - `README.md`, `docs/`, API references, user-facing docs → standard candidate
   - Unknown / mixed → ask user via request_user_input
3. If confident → tell user: "Selected mode: {mode} for {file} because {reason}"
4. If ambiguous → request_user_input with mode options
5. User can override via flags regardless of auto-detection
6. **Max is opt-in only** — NEVER auto-selected without an explicit `-x`/`--max` flag or an explicit maximum/extreme compress hint

### Context Hints from Prompt Text

| Hint | Mode |
|------|------|
| "compress for AGENTS.md / for context / for prompt / for LLM" | deep |
| "deep compress / deep encode / super compress / maximum" | deep |
| "compress / slim / tighten" (generic) | standard |
| "safe compress / human readable" | standard |
| "max compress / extreme / maximum density / atomic" | max |
| Explicit target (e.g., "reduce by 70%") | adjust aggressiveness |

## Rule ID Quick Reference

| Category | Rule IDs | Scope |
|----------|----------|-------|
| Codex behavior | C.1-C.8 | Literal following, avoid "think", positive framing, match style, descriptive instructions, overengineering, avoid ALL-CAPS, prompt format |
| Token efficiency | T.1-T.8, T.10 | Tables, bullets, one-liners, inline code, abbreviations, filler, comma lists, arrows, strip whitespace |
| Structure | S.1-S.8 | XML tags, imperative, single source, context/motivation, blockquotes, progressive disclosure, consistent terminology, ref depth |
| Deduplication | D.1-D.6 | Exact/near/cross-format merge, emphasis cap <=2, cross-file SSOT, wrong-merge guard |
| Reference integrity | R.1-R.3 | Verify file paths, check URLs, linearize circular refs |
| Perception | P.1-P.6 | Examples near rules, hierarchy, bold keywords, standard symbols, instruction order, default over options |
| LLM Comprehension | L.1-L.8 | Critical info position, documents-first, conciseness, quote-first, add WHY, reiterate constraint, prompt repetition, preserve scope qualifiers |
| Aggressive lossy | A.1-A.4 | Line fusion, word drop, paraphrase, known-fact elision (deep/max) |

> Full per-ID definitions live in `references/rules-review.md` (loaded at Step 0) — do not restate them here.

## Mode-to-Rules Mapping

| Mode | Applies | Notes |
|------|---------|-------|
| Light | C.1-C.8, T.6, D.1, R.1-R.3, P.1-P.4, L.1-L.8 | Text cleanup + exact-dup removal — no restructuring |
| Medium | All rules (C + T + S + D + R + P + L) | Balanced transformations |
| Standard | All rules (C + T + S + D + R + P + L) + `references/standard-compression.md` | 30-50% compression, human-readable, 1 verification round |
| Deep | All rules (C + T + S + D + R + P + L) + A.1-A.4 + `references/deep-compression.md` | DICT header, symbol substitutions, aggressive lossy pass, 1-2 verification rounds (conditional) |
| Max | All rules (C + T + S + D + R + P + L) + A.1-A.4 + `references/deep-compression.md` + `references/max-compression.md` | Atomic fact-lines, ASCII operators, format-aware tables, 4 mandatory guardrails, 2 verification rounds |

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
| `$brewtools:text-optimize` | Optimize ALL: `AGENTS.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md` |
| `$brewtools:text-optimize file.md` | Single file (medium mode) |
| `$brewtools:text-optimize -l file.md` | Light mode — text cleanup only, structure untouched |
| `$brewtools:text-optimize -d file.md` | Deep mode — max compression, review diff after |
| `$brewtools:text-optimize path1.md, path2.md` | Multiple files — parallel processing |
| `$brewtools:text-optimize -d agents/` | Directory — all `.md` files with specified mode |
| `$brewtools:text-optimize -s README.md` | Standard mode — 30-50% compression, human-readable |
| `$brewtools:text-optimize -d AGENTS.md` | Deep mode — dictionary compression, LLM-only output |
| `$brewtools:text-optimize -x AGENTS.md` | Max mode — atomic fact-lines + ASCII operators, LLM-only, 2-round verify |
| `$brewtools:text-optimize AGENTS.md` | Auto-detect → selects deep for AGENTS.md |
| `$brewtools:text-optimize README.md` | Auto-detect → selects standard for README |
| `$brewtools:text-optimize "super compress" file.md` | Prompt hint → deep mode |

## File Processing

### Input Parsing

| Input | Action |
|-------|--------|
| No args | Optimize ALL: `AGENTS.md`, `.codex/agents/*.toml`, `.codex/skills/**/SKILL.md` |
| Single path | Process directly |
| `path1, path2` | Parallel processing |

Once the target files and depth are resolved above, print the Prompt contract PLAN block now
(SCOPE names the resolved paths + resolved depth), before Phase 1 Analysis spawns below.

### 2-Phase Execution

> **Orchestration:** Phase 1+2 are executed by the SKILL in the main conversation (manager level). The text-optimizer agent handles single-file optimization only — it cannot spawn sub-agents.

### Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — ONE file, ~<=10 steps. A folder or multi-path run MUST be split one-file-per-agent, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough.

**Phase 1: Analysis** — Parallel `Explore` agents

```
Codex delegation brief (task_role: "Explore", prompt: "Analyze {file}: structure, dependencies, cross-refs, redundancies")
```

**Phase 2: Optimization** — Parallel text-optimizer agents, full brief shape:

```
Codex delegation brief (task_role: "text-optimizer", prompt: "
GOAL: cutting token cost across {N} files for this repo without losing meaning; you own
  {file} only, sibling agents own the rest and the reports are merged.
ROLE: optimize {file} in place. Do NOT touch any other file, do NOT change behavior,
  do NOT drop project-specific names, numbers, paths, versions or prohibitions.
SCOPE: in — {file}. Out — every other path; references/ are read-only inputs.
CONTEXT: mode={mode} is already chosen (loss budget per the mode table); Phase 1 Explore
  already analyzed {file} — findings: {cross-refs, redundancies}, so do not re-analyze.
  Sibling agents are optimizing the other {N-1} files of this run at the same time; rule and
  compression references come from your agent definition Step 0/Step 2 (<plugin-root>
  is natively substituted at spawn).
CONSUMER: the skill merges every agent's Optimization Report into one summary for the user;
  {file} itself is consumed by an LLM loading it as a prompt/doc, and other files still point
  at its headings — a heading you rename must stay resolvable or you break a sibling's file.
DONE: run the dedup pass (D.1-D.6) before compressing, apply transformations, verify refs
  (R.1-R.3), run the mode's verification protocol, then output the Optimization Report
  (metrics table + rules applied + fact-inventory result + semantic match %).
")
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
| C.1-C.8 (Codex behavior) | Yes | Yes | Yes | Yes | Yes |
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
| A.1-A.4 (aggressive lossy) | - | - | - | Yes | Yes |
| Aggressive rephrasing | - | - | - | Yes | Yes |
| Max compression ref (atomic fact-lines) | - | - | - | - | Yes |
| Guardrails C1-C4 (scope, punctuation, signal/token) | - | - | - | - | Yes |
| Verification round(s) | - | self | 1 | 1-2 | 2 |
| Loss within mode budget (see Loss Budget) | 100% | 100% | >=98% | >=95% | >=95% |

## Deep Mode Pipeline

### Phase 1: Compress
- Load `references/deep-compression.md` for symbol/abbreviation tables
- Dedup pass (D.1-D.6) + dedup ledger before symbol substitution (see deep-compression.md Redundancy Factoring + Token-Class Keep/Drop Heuristics)
- Aggressive lossy pass (A.1-A.4) after dedup: line fusion (A.1) -> paraphrase (A.3) -> word drop (A.2) -> knowledge elision (A.4); record every A.2/A.4 drop in loss ledger (dropped -> reason)
- Scan text for terms occurring 3+ times → build DICT header
- Apply symbol substitutions, filler removal, structural compression
- Apply existing rules (C, T, S, R, P) in addition to deep techniques

### Phase 2: Verify Round 1
- Spawn verification agent with ORIGINAL + COMPRESSED text
- Agent extracts numbered atomic-fact inventory from ORIGINAL, checks each in COMPRESSED, labels kept/merged/lost/distorted; match % = (kept + merged) / total; verifies no two distinct facts merged into one (D.6)
- A.1 fused / A.3 paraphrased facts count as kept/merged; A.4 elisions labeled `elided-known` in loss list and count as loss against the 95% gate
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
- Apply all Deep techniques (DICT header, symbol substitutions, structural compression, aggressive lossy A.1-A.4 with loss ledger, inherited from deep)
- Load `references/max-compression.md` for atomic fact-line decomposition, ASCII operator dialect, format-aware tables
- Respect guardrails C1-C4: optimize for signal/token (not raw token count); preserve scope qualifiers; ~20% deletion ceiling — never strip punctuation; consistent terminology throughout
- Chain-of-Density final pass (B4): fuse missing entities at fixed length

### Phase 2: Verify Round 1 — Claim Inventory
- Spawn verification agent with ORIGINAL + COMPRESSED
- Agent decomposes original into numbered atomic claims (one predicate per claim), labels each kept/merged/lost/distorted
- Semantic match % = (kept + merged) / total; merged (deduplicated) facts = preserved; A.1 fused / A.3 paraphrased facts = kept/merged; A.4 elisions labeled `elided-known` = loss against the 95% gate
- Gate >= 95% -> proceed; < 95% -> return loss list

### Phase 3: Patch + Verify Round 2 — Self-QA Probe (MANDATORY)
- Apply patches; Round 2 is mandatory, NEVER skip; use the INDEPENDENT method: generate 10-20 questions from original (entities, numbers, conditions, negations), answer from compressed only
- Sub-gate: 100% of numbers, names, negations, scope qualifiers must survive
- If still < 95% or sub-gate fails -> warn user with explicit loss list (lost/distorted/merged/elided-known labels)
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
| Preserve | Scope qualifiers ("every section, not just the first") — high-reasoning model 4.8 literalism (Max/Deep) |
| Deep only | DICT header at document start |
| Deep/Max | A.2/A.4 drops recorded in loss ledger; never elide project-specific facts (names, numbers, paths, versions, prohibitions) |
| Max only | Atomic fact-lines, ASCII operators over unicode glyphs, 2 mandatory verification rounds |
| Dedup | Accidental dups merged; intentional emphasis <= 2/doc, 2nd occurrence short @ END (D.4); merged facts = preserved, never counted as loss |
| Output | Statistics: original (chars/words/~tokens), compressed (chars/words/~tokens), ratio, semantic match % |

### After
- [ ] All facts preserved (except ledgered A.2/A.4 drops at deep/max)
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
| Over-aggressive language | high-reasoning model 4.5 overtriggers (C.5) |
| Flatten hierarchy | Loses structure (P.2) |
| "Don't do X" framing | Less effective than "Do Y" (C.3) |
| Overengineer prompts | high-reasoning model 4.5 follows literally (C.6) |
| Overload single prompts | Divided attention, hallucinations (S.3) |
| Over-focus on wording | Structure > word choice (T.1) |
| Merge similar-looking facts blindly | Different scope/numbers/conditions = different facts (D.6) |

