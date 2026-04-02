# LLM Text Optimization and Comprehension Rules

Categorized rules for LLM token efficiency and comprehension optimization with 41 rules across 6 categories.
Apply by category. Reference specific IDs in reviews (e.g., "violates T.1").

## C - Claude Behavior

| ID | Rule | Notes |
|----|------|-------|
| C.1 | Literal Instruction Following | Claude 4.x does exactly what asked. Precise, explicit instructions required |
| C.2 | Avoid "think" Word | Opus 4.5 sensitive to "think" when extended thinking disabled. Alternatives: "consider", "evaluate", "believe" |
| C.3 | Positive Framing | Tell Claude what to do, not what not to do. ❌ "Do not use markdown" → "Write in flowing prose". More examples: "Don't use mock data" → "Use only real production data"; "Avoid creating new files" → "Apply all fixes to existing files only"; "Never use ellipsis" → "Use only complete sentences and periods" |
| C.4 | Match Prompt Style to Output | Formatting in prompt influences response. Less markdown in prompt → less markdown in output |
| C.5 | Descriptive Over Emphatic Instructions | Opus 4.5/4.6 overtrigger with aggressive language. "Use this tool when..." not "CRITICAL: You MUST..." |
| C.6 | Overengineering Prevention | Opus 4.5 tends to overengineer. Add explicit constraints about minimal complexity |
| C.7 | Avoid ALL-CAPS Emphasis in Claude 4.x | Claude 4.x is more responsive to system prompts than previous versions. Aggressive capitalization ("CRITICAL:", "MUST", "NEVER") causes the model to overapply the rule. Use normal-toned instructions instead. Source: Anthropic Claude 4 best practices |
| C.8 | Prompt Format Influences Output Format | If your prompt is written in prose, Claude responds in prose. If your prompt uses dense markdown, Claude uses dense markdown. Write the format you want to receive. Source: Anthropic Claude 4 best practices |

## T - Token Efficiency

| ID | Rule | Notes |
|----|------|-------|
| T.1 | Tables over Prose | Multi-column data is more token-efficient in tables. Single-column → use bullets instead. Exception: Markdown table syntax (`| col |`, alignment rows) costs ~2x tokens of the same data as minified JSON. For dense tabular data embedded in prompts, prefer minified JSON over Markdown tables |
| T.2 | Bullets over Numbered | `-` (1 char) vs `1. ` (3 chars). ~5-10% savings. Keep numbers when order matters |
| T.3 | One-liners for Rules | `❌ bad → good` is self-documenting. Complex rules still need explanation |
| T.4 | Inline Code over Blocks | Code blocks add markers + newlines. Inline `code` for <3 lines. Multi-line needs blocks for readability |
| T.5 | Standard Abbreviations | Tables/technical contexts only. Allowed: impl, cfg, args, ret, env, prod, dev, repo, docs. Anti-pattern: Do NOT abbreviate domain terms, variable names, or constraint language in instructions. Shortening "authentication" to "auth" can cause 30+ point accuracy drops on specific tasks (DETAIL Matters, arXiv:2512.02246) because the model uses the statistically dominant meaning of the abbreviation |
| T.6 | Remove Filler Words | Cut: "please note", "it's important", "as mentioned", "basically" |
| T.7 | Comma-separated Inline Lists | `a, b, c` instead of bullet list when items are short, order irrelevant. Use for 3-7 short items |
| T.8 | Arrows for Flow Notation | `A → B → C` instead of prose descriptions of sequences. Dense, scannable. Caveat: each symbol (→, |, :) counts as exactly 1 token. Verify actual savings with a tokenizer before assuming compression — natural language connectors sometimes use fewer tokens than equivalent symbol notation |
| T.10 | Strip Whitespace from Code in Prompts | Code in prompts (C/Java/C#): strip whitespace and indentation before embedding. arXiv:2508.13666 shows 11-22% fewer input tokens (Java: 18.7%, C++: 13.4%, C#: 11.7%) with <1.6% quality impact on Claude and GPT-4o. Python excluded — whitespace is syntactically required. Not for Gemini — significant degradation |

## S - Structure

| ID | Rule | Notes |
|----|------|-------|
| S.1 | XML Tags for Sections | `<rules>...</rules>`, `<examples>...</examples>`. Clear parsing boundaries. Injection safety: XML tags are the only reliable way to prevent `{{VARIABLE}}` template substitution content from being confused with instructions. Without XML tag boundaries, injected user content can look like instructions to the model |
| S.2 | Imperative Form | "Do X" not "You should do X". Removes 2nd person pronouns |
| S.3 | Single Source of Truth | Merge duplicate content. Repetition wastes tokens, causes contradictions. Strategic 2x max OK |
| S.4 | Add Context/Motivation | Providing context helps Claude understand goals. "Text-to-speech will read this, so avoid ellipses" |
| S.5 | Blockquotes for Critical | Use `>` for warnings, critical notes. Visual hierarchy in markdown |
| S.6 | Progressive Disclosure | Show minimum needed, reference details elsewhere. SKILL.md <500 lines |
| S.7 | Consistent Terminology | One term per concept. Avoid synonyms ("config file" vs "configuration document") |
| S.8 | One-Level Reference Depth | All refs link directly from main file. No chaining main→advanced→details |

## R - Reference Integrity

| ID | Rule | Notes |
|----|------|-------|
| R.1 | Verify File Paths | Use Read/Glob to confirm. Broken refs cause tool failures |
| R.2 | Check URLs | Validate accessible URLs. Skip auth-gated URLs |
| R.3 | Linearize Circular Refs | A→B→C→A becomes A→B→C with forward-reference note |

## P - Perception

| ID | Rule | Notes |
|----|------|-------|
| P.1 | Examples Near Rules | Place inline, not in appendix. Proximity improves pattern recognition |
| P.2 | Hierarchy via Headers | Max 3-4 levels deep. Structured documents improve retrieval |
| P.3 | Bold for Keywords | High-signal definitions only. Max 2-3 per 100 lines. Prefer XML tags or headers |
| P.4 | Standard Symbols | → (flow), + (and), / (or). Dense formats only (tables, compact lists), NOT in prose |
| P.5 | Instruction Order (Anchoring) | Place critical constraints BEFORE options/examples. First-position = strongest anchoring |
| P.6 | Default Over Options | Recommend ONE default, mention exceptions only. Too many options cause decision paralysis |

## L - LLM Comprehension

How content is perceived and processed by the LLM — not about token count but comprehension quality.

| ID | Rule | Notes |
|----|------|-------|
| L.1 | Critical Info at START or END, Not Middle | "Lost in the Middle" — middle content receives 40-50% less attention. Sandwich pattern (beginning + end) outperforms middle-only placement. Source: TACL 2024 |
| L.2 | Documents First, Query Last | Long-context ordering: documents/context first, then query/instructions last. Counterintuitive: putting the query at the END (not beginning) improves quality by up to 30% on multi-document inputs. Source: Anthropic official |
| L.3 | Explicitly Request Conciseness | Conciseness is NOT Claude's default — always state "Skip preamble" explicitly. Without explicit instruction, responses are 3-5x longer than needed. Source: Anthropic docs |
| L.4 | Quote-First Grounding | Instruct to extract relevant quotes before answering. Reduces hallucination by forcing the model to locate specific content first. Pattern: "Find relevant quotes → place in `<quotes>` → answer based only on those quotes." Source: Anthropic cookbook |
| L.5 | Add WHY to Instructions | Claude generalizes the reason to edge cases. "Never use ellipsis because TTS won't pronounce it" → Claude also avoids other TTS-incompatible symbols. "Never use ellipsis" alone gives no generalization. Source: Anthropic Claude 4 best practices |
| L.6 | Reiterate Critical Constraint at END | Position effect amplifies with context length — constraints closest to the end have highest compliance rate. Source: Brex Prompt Engineering Guide + Anthropic |
| L.7 | Prompt Repetition for Non-Reasoning Models | Repeat the entire prompt once. Google Research (arXiv:2512.14982): wins 47/70 benchmark-model combinations with 0 losses. Extreme case: 21% to 97% accuracy. Causal LMs benefit because the second pass has full first-pass context. Only for non-reasoning models — reasoning models already repeat internally |

## Rules NOT Recommended

| Avoid | Reality |
|-------|---------|
| Remove all emojis | Status emojis are dense, meaningful |
| Always use tables | Single-column data denser as bullets |
| Compress everything | Domain terms need full form first time |
| Remove all examples | Claude generalizes better with examples (P.1) |
| Non-standard abbreviations | Stick to T.5 allowed list |
| Overload single prompts | Multiple tasks in one prompt divide attention → hallucination |
| Over-focus on wording | Structure and format matter more than specific word choice |

## Compression Ratios (Token Efficiency)

These ratios reflect token savings from applying T and S category rules. L category rules improve comprehension quality without necessarily reducing token count.

| Content Type | Typical Savings |
|--------------|-----------------|
| Prose docs | 40-50% |
| Technical specs | 20-30% |
| System prompts | 30-40% |
| README files | 35-45% |

## Sources

- [Claude 4 Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Extended Thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Agent Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Skills Activation](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)
- [Improving Agents](https://improvingagents.com)
- [Position Bias in LLMs](https://dl.acm.org/doi/full/10.1145/3715275.3732038)
- [Lost in the Middle (TACL 2024)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630)
- [Prompt Repetition (arXiv:2512.14982)](https://arxiv.org/abs/2512.14982)
- [DETAIL Matters (arXiv:2512.02246)](https://arxiv.org/abs/2512.02246)
- [Whitespace Stripping (arXiv:2508.13666)](https://arxiv.org/abs/2508.13666)
- [Brex Prompt Engineering Guide](https://github.com/brexhq/prompt-engineering)
