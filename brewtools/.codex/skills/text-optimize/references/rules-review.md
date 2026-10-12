> Native applicability: preserve the named Anthropic models and cited research below. Apply model-specific advice only when the optimized artifact targets that model/configuration; it is not a Codex runtime guarantee. Other targets require their own verified guidance/evaluation.

# LLM Text Optimization and Comprehension Rules

Categorized rules for LLM token efficiency and comprehension optimization with 52 rules across 8 categories.
Apply by category; cite IDs in reviews (e.g., "violates T.1").

Model advice targets the Claude 5.5 family unless a row names another model (official prompting
guidance, checked 2026-10-12): apply a named-model row only to that model/configuration,
re-evaluate on others. Research ratios/examples are historical measurements, not universal guarantees or this artifact's measured savings.

## C - Claude Behavior

| ID | Rule | Notes |
|----|------|-------|
| C.1 | Literal Instruction Following | Claude does exactly what is asked and infers no unstated request. Precise, explicit instructions required |
| C.2 | No Forced Thinking | Delete "think step by step"/"think carefully": the model sets its own depth, and the effort setting moves it more reliably than prose. Never ask for reasoning written out in the response — current models may decline it; ask for a short explanation or a summary of actions |
| C.3 | Positive Framing | Tell Claude what to do, not what not to do. ❌ "Do not use markdown" → "Write in flowing prose"; "Don't use mock data" → "Use only real production data". A prohibition naming one specific observed pattern stays (PQ.3) |
| C.4 | Match Prompt Style to Output | Formatting in prompt influences response. Less markdown in prompt → less markdown in output |
| C.5 | Descriptive Over Emphatic Instructions | Give the trigger and the reason, not volume: "Use this tool when..." not "CRITICAL: You MUST...". Claude generalizes from a reason; blanket "always use"/"if in doubt, use" causes overuse |
| C.6 | Overengineering Prevention | State the scope as the deliverable and what done is: without it the model widens the task at higher effort or stops early at lower effort. Add explicit constraints about minimal complexity |
| C.7 | Avoid ALL-CAPS Emphasis | Lower inflated "CRITICAL:"/"MUST"/"NEVER" emphasis to normal tone and state the reason instead; at most one emphasized line per artifact — when many lines shout, none stands out. Preserve prohibition meaning, incident-tied negatives and mandatory gates; capitalization changes require semantic review |
| C.8 | Prompt Format Influences Output Format | C.4 applies; write the desired output format |

## T - Token Efficiency

| ID | Rule | Notes |
|----|------|-------|
| T.1 | Tables over Prose | Multi-column data is more token-efficient in tables. Single-column → use bullets instead. Exception: Markdown table syntax (`\| col \|`, alignment rows) costs ~2x tokens of the same data as minified JSON. For dense tabular data embedded in prompts, prefer minified JSON over Markdown tables |
| T.2 | Bullets over Numbered | `-` (1 char) vs `1. ` (3 chars). ~5-10% savings. Keep numbers when order matters |
| T.3 | One-liners for Rules | `❌ bad → good` is self-documenting. Complex rules still need explanation |
| T.4 | Inline Code over Blocks | Code blocks add markers + newlines. Inline `code` for <3 lines. Multi-line needs blocks for readability |
| T.5 | Standard Abbreviations | Tables/technical contexts only. Allowed: impl, cfg, args, ret, env, prod, dev, repo, docs. Anti-pattern: Do NOT abbreviate domain terms, variable names, or constraint language in instructions. An abbreviation missing from a DICT header risks misreading (the model picks its statistically dominant meaning); a DICT mitigates (arXiv:2410.23866) |
| T.6 | Remove Filler Words | Cut: "please note", "it's important", "as mentioned", "basically". Also delete anti-laziness boosters written for older models ("be thorough", "do not be lazy", "make sure you always") — current models overtrigger on them |
| T.7 | Comma-separated Inline Lists | `a, b, c` instead of bullet list when items are short, order irrelevant. Use for 3-7 short items |
| T.8 | Arrows for Flow Notation | `A → B → C` instead of prose descriptions of sequences. Dense, scannable. ASCII digraphs `-> != >= <= \|` = 1 token each; unicode glyphs `∵ ∴ ⊃ ≤ ≥` = 2-3 tokens each (measured tiktoken cl100k/o200k): prefer ASCII. `→` is 1 token but `->` is equally cheap and portable. The token win comes from deleting words, not the glyph |
| T.10 | Strip Whitespace from Code in Prompts | Code in prompts (C/Java/C#): strip whitespace and indentation before embedding. arXiv:2508.13666 shows 11-22% fewer input tokens (Java: 18.7%, C++: 13.4%, C#: 11.7%) with <1.6% quality impact on Claude and GPT-4o. Python excluded — whitespace is syntactically required. Not for Gemini — significant degradation |

## S - Structure

| ID | Rule | Notes |
|----|------|-------|
| S.1 | XML Tags for Sections | `<rules>...</rules>`, `<examples>...</examples>`. Delimit instructions/context/examples and `{{VARIABLE}}` input; state that input is data. XML reduces misinterpretation, never guarantees injection safety or grants input authority |
| S.2 | Imperative Form | "Do X" not "You should do X". Removes 2nd person pronouns |
| S.3 | Single Source of Truth | Merge duplicate content. Repetition wastes tokens, causes contradictions. Strategic 2x max OK. Details: D.1-D.6 |
| S.4 | Add Context/Motivation | State goals and reasons, not only actions (example: L.5) |
| S.5 | Blockquotes for Critical | Use `>` for warnings, critical notes. Visual hierarchy in markdown |
| S.6 | Progressive Disclosure | Show minimum needed, reference details elsewhere. SKILL.md <500 lines |
| S.7 | Consistent Terminology | One term per concept. Avoid synonyms ("config file" vs "configuration document") |
| S.8 | One-Level Reference Depth | All refs link directly from main file. No chaining main→advanced→details |

## D - Deduplication

Merge accidental repetition; cap intentional emphasis at 2 per document. Dedup-merged facts count as PRESERVED in verification (kept once), never as loss. Deep/max: record each merge in a dedup ledger (kept <- dropped).

| ID | Rule | Notes |
|----|------|-------|
| D.1 | Exact-Duplicate Merge | Identical sentences/rows/rules after whitespace+case normalization -> keep first occurrence, delete rest. All modes |
| D.2 | Near-Duplicate Merge | Same fact reworded -> merge into ONE statement, keeping the MORE SPECIFIC variant (numbers, names, qualifiers beat vaguer phrasing) at its best position (S.7 one term per concept). Source: LLMLingua-2 arXiv:2403.12968 |
| D.3 | Cross-Format Duplicate | Same fact in prose AND table/list -> keep the denser form once, drop the other |
| D.4 | Emphasis Cap (max 2 per document) | Intentional repetition of a critical constraint: exactly 2x — full form early + <=1-line echo at END (sandwich, L.1/L.6), never middle. 3+ occurrences -> collapse to 2. Never zero a deliberately repeated critical constraint — cap, don't delete. Sources: arXiv:2512.14982 (x2 wins 47/70 tasks, 0 losses); arXiv:2507.11538 (repetition spends instruction budget) |
| D.5 | Cross-File Dedup (multi-file runs) | Same rule in several files -> keep ONE canonical location (most-specific version / topical owner), replace others with a pointer + inline 1-line summary (bare pointer costs a context hop). Respect S.8 one-level depth |
| D.6 | Wrong-Merge Guard | Before merging near-dups verify they state the SAME fact. Different scope qualifiers, numbers, versions, or conditions = different facts — keep both. Guards against silent contradiction/loss from over-eager dedup |

## R - Reference Integrity

| ID | Rule | Notes |
|----|------|-------|
| R.1 | Verify File Paths | Confirm each path exists on disk. Broken refs cause tool failures |
| R.2 | Check URLs | Validate accessible URLs. Skip auth-gated URLs |
| R.3 | Linearize Circular Refs | A→B→C→A becomes A→B→C with forward-reference note |

## P - Perception

| ID | Rule | Notes |
|----|------|-------|
| P.1 | Examples Near Rules | Place inline, not in appendix. Proximity improves pattern recognition |
| P.2 | Hierarchy via Headers | Max 3-4 levels deep. Structured documents improve retrieval |
| P.3 | Bold for Keywords | High-signal definitions only. Max 2-3 per 100 lines. Prefer XML tags or headers |
| P.4 | Standard Symbols | → (flow), + (and), / (or). Dense formats only (tables, compact lists), NOT in prose. ASCII operators over unicode glyphs (T.8) |
| P.5 | Instruction Order (Anchoring) | Place critical constraints BEFORE options/examples. First-position = strongest anchoring |
| P.6 | Default Over Options | Recommend ONE default, mention exceptions only. Too many options cause decision paralysis |

## L - LLM Comprehension

How content is perceived and processed by the LLM — not about token count but comprehension quality.

| ID | Rule | Notes |
|----|------|-------|
| L.1 | Critical Info at START or END, Not Middle | "Lost in the Middle" — middle content receives 40-50% less attention. Sandwich pattern (beginning + end) outperforms middle-only placement. Source: TACL 2024 |
| L.2 | Documents First, Query Last | Long-context ordering: documents/context first, then query/instructions last. Query at the END (not beginning) improves quality by up to 30% on multi-document inputs. Source: Anthropic official |
| L.3 | Explicitly Request Conciseness | State desired output length, e.g. "Skip preamble". Defaults vary by model. Output brevity does not constrain reasoning |
| L.4 | Quote-First Grounding | Instruct to extract relevant quotes before answering. Reduces hallucination by forcing the model to locate specific content first. Pattern: "Find relevant quotes → place in `<quotes>` → answer based only on those quotes." Source: Anthropic cookbook |
| L.5 | Add WHY to Instructions | Claude generalizes the reason to edge cases. "Never use ellipsis because TTS won't pronounce it" → Claude also avoids other TTS-incompatible symbols. "Never use ellipsis" alone gives no generalization |
| L.6 | Reiterate Critical Constraint at END | Position effect amplifies with context length — constraints closest to the end have highest compliance rate. Source: Brex Prompt Engineering Guide + Anthropic |
| L.7 | Prompt Repetition for Non-Reasoning Models | Repeat the entire prompt once. Google Research (arXiv:2512.14982): wins 47/70 benchmark-model combinations with 0 losses. Extreme case: 21% to 97% accuracy. Causal LMs benefit because the second pass has full first-pass context. Only for non-reasoning models — reasoning models already repeat internally |
| L.8 | Preserve Scope Qualifiers | The model applies an instruction to the item it names and does not silently generalize it to the next. Scope words ("every section, not just the first", "all files", "each") are load-bearing — never strip them during compression |

## A - Aggressive Lossy (deep/max only)

Deliberate-loss techniques, ONLY in deep and max modes. A.1/A.3 outputs count as PRESERVED (kept/merged) in verification. A.2 is word-level and gate-neutral: drops go in the loss ledger (dropped -> reason) but do NOT move the fact-level (kept + merged)/total ratio; if an A.2 drop degrades a fact's meaning, the verifier labels that fact `distorted` (normal gate impact). A.4 elisions consume the fact-level loss budget as `elided-known` and MUST appear in the loss ledger. D.6 and L.8 always win over A rules.

| ID | Rule | Notes |
|----|------|-------|
| A.1 | Line Fusion | Merge related short lines/bullets/sentences into ONE line with `\|` separators or comma lists; fuse a rule + its reason via `bc`. Fusion is loss-free: fused facts count as preserved |
| A.2 | Low-Value Word Drop | Drop words whose removal minimally degrades meaning: decorative adjectives/adverbs, politeness, meta-commentary, self-evident qualifiers. Never drop negations, numbers, named entities, scope qualifiers (L.8, C2 still win) |
| A.3 | Aggressive Paraphrase | Rewrite whole phrases/sentences into shorter equivalents: restructure, not just delete. Meaning-preserving paraphrase counts as preserved in verification |
| A.4 | Common-Knowledge Elision | Delete statements any modern LLM already knows from training (generic best practices like "write tests", "keep functions small", standard tool behavior, textbook definitions). Keep ONLY project-specific deltas: concrete names, numbers, paths, versions, prohibitions, deviations from defaults. Every elision -> loss ledger, counts against mode loss budget. Unsure whether generic -> keep |

Examples (before -> after):

- A.1: "Close the DB connection after use. Unclosed connections exhaust the pool." -> "close DB conn after use bc unclosed -> pool exhaustion"
- A.2: "Carefully review the extremely important production configuration file" -> "review prod cfg file"
- A.3: "In the event that the build process does not complete successfully, notify the team" -> "build fails -> notify team"
- A.4: "Write unit tests for new code, tests catch regressions. Coverage gate is 85% (jacoco); build fails below." -> "coverage gate 85% (jacoco), build fails below" (generic "write tests" elided -> ledger; project delta kept)

**Lossless guard (any mode, A.2/A.4 never target these):** numbers, dates, versions, model IDs
byte-exact (`claude-sonnet-5-5`, never "Sonnet 5.5"), CLI flags/options verbatim (`-x`, `--max`),
thresholds/gates/percentages exactly as stated (`>=95%`, `~20%` ceiling), URLs, file paths, ports,
sizes, named entities, negations (`!=`/NEVER/MUST NOT), scope qualifiers (L.8). A drop touching
these is a defect caught by the 100% sub-gate, not A.2/A.4.

## PQ - Prompt-Quality Rewrite

Separate from the 52 numbered rules above: a rewrite pass for prompt-shaped targets (system prompt, agent `.md`, skill `SKILL.md`, hook prompt text, AGENTS.md), Medium mode and above (never Light: wording-only, no restructuring). Lossless per the guard above: PQ governs shape and emphasis, never facts.

| ID | Basis | Transformation | Bad -> Good |
|----|-------|-----------------|-------------|
| PQ.1 | An unstated return shape gets a default one | Role in one sentence, Return contract next, Scope/Never after — before procedure detail | Role buried after 3 paragraphs of scope -> "You are a code reviewer. Return: findings list, `path:line`, verdict first." then Scope/Never as its own heading |
| PQ.2 | S.3 | Same instruction stated once; delete a cross-section repeat | "Never invent scope" stated, then restated 2 sentences later in other words -> keep the sharper phrasing once |
| PQ.3 | C.3 | Prohibition -> positive imperative, UNLESS the `!=`/NEVER guards a named, previously-observed failure | "Do not use markdown" -> "Write in flowing prose". Keep snapshot prohibition: `!=re-run text-guard.sh snapshot` (BT-F15 regression); owned-draft checkpoint remains permitted |
| PQ.4 | C.5, C.7 | Drop scattered ALL-CAPS; keep exactly one true hard-stop (irreversible action) in caps, lower the rest | 4x MUST/CRITICAL in one file -> 1 STOP on the irreversible action (e.g. edit-without-snapshot), 3 become plain imperative |
| PQ.5 | C.2 | Remove redundant "think step by step"/bare "verify"/"be careful" filler; retain steps defining real workflow dependencies and evaluation. Do not suppress model reasoning | "Think step by step and double-check" -> delete, or state the goal only |
| PQ.6 | Opus over-verifies when told to (official Opus 5 guidance; do not generalize to Sonnet/Fable) | Remove carried-over generic self-verification instructions; keep specific gated protocols/thresholds/independent reviews. Haiku 5.5 at low/medium effort and Sonnet 5.5 at low effort sometimes report done without running a check: there the generic line becomes exactly one concrete check (named command or criterion, pass/fail, what to report when it cannot run). Other models require their own guidance/evaluation | "Double-check your output before returning" (generic) -> delete. A named gate (`>=95% match, 100% sub-gate`) is not this pattern — keep it |
| PQ.7 | Each spawn multiplies cost and time | An agent that itself delegates states an explicit delegate-only-when criterion, low spawn count | "delegate as needed" -> "delegate only for large independent parallelizable work; never to verify your own output" |
| PQ.8 | C.1, L.8 | State scope explicitly; never rely on the model generalizing a rule to similar items | "apply this rule" -> "apply this rule to every file matching X, not just the first" |
| PQ.9 | T.1, T.2 | Reference data (fields/flags/thresholds/model IDs) -> table. Real-dependency procedure -> numbered steps. Never mix the two shapes | A flag/target matrix written as prose -> table; a create-in-order procedure kept as numbered prose, not flattened into a table |
| PQ.10 | P.1 | A concrete example or named reference file beats an adjective ("clean", "thorough", "professional") | "write clean code" -> "follow the pattern in `skill-creator.md`" or a 2-line before/after |
| PQ.11 | T.5 | `[DICT: ...]` header only when it pays: >=5 distinct abbreviations, each reused >=3x, file itself hundreds of lines | A 150-line agent body with 3 abbreviations used twice each -> no DICT header, inline the 3 terms |
| PQ.12 | Repeated harness text can read as a prompt injection (recommendation: check the hook's own miss-rate first) | Recurring reminder text: once at session-start/compaction, throttle or drop the per-turn copy | A reminder injected on every `UserPromptSubmit` AND at session-start/after-compaction -> keep the structural-checkpoint copies, narrow the per-turn one |
| PQ.13 | Parallel calls are already the default | State "run independent tool calls in parallel" once per artifact, never per section | 3 sections each repeating the parallel-call instruction -> state it once, delete the other 2 |

## Rules NOT Recommended

| Avoid | Reality |
|-------|---------|
| Remove all emojis | Status emojis are dense, meaningful |
| Compress everything | Domain terms need full form first time |
| Remove all examples | Claude generalizes better with examples (P.1) |
| Overload single prompts | Multiple tasks in one prompt divide attention → hallucination |
| Over-focus on wording | Structure and format matter more than specific word choice |
| Strip all function words / punctuation | Punctuation is load-bearing for context memory (arXiv:2502.15007 LLM-Microscope); ~20% deletion is the safe ceiling — substitute, don't bulk-delete |
| Blind merge; delete every repeated constraint | D.6: different scope/numbers/conditions = different facts. D.4: sandwich 2x raises compliance (L.1/L.6), cap at 2, don't zero |

## Compression Ratios (Token Efficiency)

These ratios reflect token savings from applying T and S category rules. L category rules improve comprehension quality without necessarily reducing token count.

| Content Type | Typical Savings |
|--------------|-----------------|
| Prose docs | 40-50% |
| Technical specs | 20-30% |
| System prompts | 30-40% |
| README files | 35-45% |

## Compression References

Each opens with its target and techniques: `references/standard-compression.md` (Standard),
`references/deep-compression.md` (Deep, Max), `references/max-compression.md` (Max, opt-in).
Rule sets per mode and the dedup scope per mode (D.5 only by the orchestrator's decision list, never per-file): skill `SKILL.md` Mode-to-Rules Mapping and Deduplication Pass.

## Sources

- [Current Claude Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5); 5.5 family: same path ending `-opus-5-5`, `-sonnet-5-5`, `-haiku-5-5`
- [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Agent Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Skills Activation](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)
- [Improving Agents](https://improvingagents.com)
- [Position Bias in LLMs](https://dl.acm.org/doi/full/10.1145/3715275.3732038)
- [Lost in the Middle (TACL 2024)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630)
- [Prompt Repetition (arXiv:2512.14982)](https://arxiv.org/abs/2512.14982)
- [Abbreviation Expansion (arXiv:2410.23866)](https://arxiv.org/abs/2410.23866)
- [LLM-Microscope / Punctuation (arXiv:2502.15007)](https://arxiv.org/abs/2502.15007)
- [Whitespace Stripping (arXiv:2508.13666)](https://arxiv.org/abs/2508.13666)
- [Brex Prompt Engineering Guide](https://github.com/brexhq/prompt-engineering)
- [LLMLingua-2 (arXiv:2403.12968)](https://arxiv.org/abs/2403.12968)
- [Instruction-Budget Degradation (arXiv:2507.11538)](https://arxiv.org/abs/2507.11538)
- [Sentence-Level Pruning (arXiv:2410.12388)](https://arxiv.org/abs/2410.12388)
- [Chain of Density (arXiv:2309.04269)](https://arxiv.org/abs/2309.04269)
- [CompactPrompt (arXiv:2510.18043)](https://arxiv.org/abs/2510.18043)
- [Claim-Decomposition Caution (arXiv:2411.02400)](https://arxiv.org/abs/2411.02400)
- [Entity Loss in Compression (arXiv:2503.19114)](https://arxiv.org/abs/2503.19114)
