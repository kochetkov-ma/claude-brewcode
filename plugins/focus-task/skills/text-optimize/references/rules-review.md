# Rules Review & Evidence

Categorized rules for LLM text optimization. Each rule has an ID, evidence, and verdict.
Apply by category. Reference specific IDs in reviews (e.g., "violates T.1").

## C - Claude Behavior

| ID | Rule | Evidence | Verdict | Notes |
|----|------|----------|---------|-------|
| C.1 | Literal Instruction Following | Official docs - earlier versions inferred intent, 4.x does exactly what asked | ✅ VERIFIED | Precise, explicit instructions required |
| C.2 | Avoid "think" Word | Official docs - Opus 4.5 sensitive to "think" when extended thinking DISABLED. Less critical with 4.6 adaptive thinking | ✅ VERIFIED | Alternatives: "consider", "evaluate", "believe" |
| C.3 | Positive Framing | Official docs - tell Claude what to do instead of what not to do | ✅ VERIFIED | ❌ "Do not use markdown" → ✅ "Write in flowing prose" |
| C.4 | Match Prompt Style to Output | Official docs - formatting in prompt influences response formatting | ✅ VERIFIED | Less markdown in prompt → less markdown in output |
| C.5 | Descriptive Over Emphatic Instructions | Official docs - Opus 4.5/4.6 overtrigger with aggressive language. "Dial back" guidance | ✅ VERIFIED | "Use this tool when..." not "CRITICAL: You MUST..." |
| C.6 | Overengineering Prevention | Official docs - Opus 4.5 tends to overengineer, creates extra files, unnecessary abstractions | ✅ VERIFIED | Add explicit constraints about minimal complexity |

## T - Token Efficiency

| ID | Rule | Evidence | Verdict | Notes |
|----|------|----------|---------|-------|
| T.1 | Tables over Prose | More token-efficient for multi-column data. Source: improvingagents.com | ✅ VERIFIED | Single-column → use bullets instead |
| T.2 | Bullets over Numbered | `-` (1 char) vs `1. ` (3 chars), `10. ` (4 chars). Numbers add implied ordering | ✅ VERIFIED | Keep numbers when order matters. ~5-10% savings |
| T.3 | One-liners for Rules | Claude 4.x responds well to clear, explicit instructions. `❌ bad → ✅ good` is self-documenting | ✅ VERIFIED | Complex rules still need explanation |
| T.4 | Inline Code over Blocks | Code blocks add ``` markers (6 chars) + newlines. Inline `code` for <3 lines | ⚠️ CONDITIONAL | Multi-line needs blocks for readability |
| T.5 | Standard Abbreviations | Industry-standard abbreviations reduce tokens. Tables/technical contexts only | ⚠️ CONDITIONAL | Allowed: impl, cfg, args, ret, env, prod, dev, repo, docs |
| T.6 | Remove Filler Words | Anthropic docs - be explicit, filler adds noise | ✅ VERIFIED | Cut: "please note", "it's important", "as mentioned", "basically" |
| T.7 | Comma-separated Inline Lists | `a, b, c` instead of bullet list when items are short, order irrelevant | ✅ VERIFIED | Saves newlines + bullet chars. Use for 3-7 short items |
| T.8 | Arrows for Flow Notation | `A → B → C` instead of prose descriptions of sequences | ✅ VERIFIED | Dense, scannable. Use in tables, compact lists |

## S - Structure

| ID | Rule | Evidence | Verdict | Notes |
|----|------|----------|---------|-------|
| S.1 | XML Tags for Sections | Claude docs - use XML tags to specify sections. Clear parsing boundaries | ✅ VERIFIED | `<rules>...</rules>`, `<examples>...</examples>` |
| S.2 | Imperative Form | Skill/agent best practices - "Do X" not "You should do X" | ✅ VERIFIED | Removes 2nd person pronouns, more direct |
| S.3 | Single Source of Truth | Context engineering - merge duplicate content | ✅ VERIFIED | Repetition wastes tokens, causes contradictions. Strategic 2x max OK |
| S.4 | Add Context/Motivation | Official docs - providing context helps Claude understand goals | ✅ VERIFIED | "Text-to-speech will read this, so avoid ellipses" |
| S.5 | Blockquotes for Critical | Community practice. `>` prefix provides visual hierarchy in markdown | ⚠️ CONDITIONAL | Use for warnings, critical notes. Not in official Anthropic docs |
| S.6 | Progressive Disclosure | Show minimum needed, reference details elsewhere. Source: platform.claude.com agent-skills best-practices | ✅ VERIFIED | SKILL.md <500 lines. Move excess to references/ |
| S.7 | Consistent Terminology | One term per concept throughout. Avoid synonyms that create semantic overlap ("config file" vs "configuration document") | ✅ VERIFIED | Pick one term, use consistently. Synonyms confuse retrieval |
| S.8 | One-Level Reference Depth | All refs link directly from main file. No chaining main→advanced→details | ✅ VERIFIED | Nested refs trigger partial reads. Source: platform.claude.com agent-skills best-practices |

## R - Reference Integrity

| ID | Rule | Evidence | Verdict | Notes |
|----|------|----------|---------|-------|
| R.1 | Verify File Paths | Engineering best practice. Broken refs cause tool failures | ✅ REQUIRED | Use Read/Glob to confirm |
| R.2 | Check URLs | Engineering best practice. Dead links waste attention | ✅ RECOMMENDED | Validate accessible URLs. Skip auth-gated URLs |
| R.3 | Linearize Circular Refs | Engineering best practice. Claude Code had circular symlink bugs | ✅ REQUIRED | A→B→C→A becomes A→B→C with forward-reference note |

## P - Perception

| ID | Rule | Evidence | Verdict | Notes |
|----|------|----------|---------|-------|
| P.1 | Examples Near Rules | Few-shot prompting improves LLM performance. Official docs recommend examples inline | ✅ VERIFIED | Place inline, not in appendix. Proximity improves pattern recognition |
| P.2 | Hierarchy via Headers | Structured documents improve retrieval | ✅ VERIFIED | Max 3-4 levels deep |
| P.3 | Bold for Keywords | `**word**` ~3x token overhead vs plain. Anthropic discourages bold/italics in prompts | ⚠️ CONDITIONAL | High-signal definitions only. Max 2-3 per 100 lines. Prefer XML tags or headers |
| P.4 | Standard Symbols | → (converts/flow), + (and), / (or), ✅❌⚠️ (status) | ✅ VERIFIED | Dense formats only (tables, compact lists). NOT in prose paragraphs |
| P.5 | Instruction Order (Anchoring) | Place critical constraints BEFORE options/examples. First-position creates strongest anchoring | ✅ VERIFIED | Later instructions have diminished influence. Source: ACM FAT 2025 |
| P.6 | Default Over Options | Recommend ONE default, mention exceptions only. Don't present multiple approaches | ✅ VERIFIED | Too many options cause decision paralysis. Source: platform.claude.com agent-skills best-practices |

## Rules NOT Recommended

| Avoid | Reality |
|-------|---------|
| Remove all emojis | Status emojis (✅❌⚠️) are dense, meaningful |
| Always use tables | Single-column data denser as bullets |
| Compress everything | Domain terms need full form first time |
| Remove all examples | Claude generalizes better with examples (P.1) |
| Non-standard abbreviations | REQ/OPT unclear. Stick to T.5 allowed list |
| Overload single prompts | Break into atomic tasks. Multiple tasks in one prompt divide attention → hallucination |
| Over-focus on wording | Structure and format matter more than specific word choice (1500 papers meta-analysis) |

## Compression Ratios

| Content Type | Typical Savings |
|--------------|-----------------|
| Prose docs | 40-50% |
| Technical specs | 20-30% |
| System prompts | 30-40% |
| README files | 35-45% |

## Summary

| Category | Count | Verified | Conditional |
|----------|-------|----------|-------------|
| C - Claude Behavior | 6 | 6 | 0 |
| T - Token Efficiency | 8 | 6 | 2 |
| S - Structure | 8 | 7 | 1 |
| R - Reference Integrity | 3 | 3 | 0 |
| P - Perception | 6 | 5 | 1 |
| **Total** | **31** | **27** | **4** |

## Sources

- [Claude 4 Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Extended Thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Agent Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Skills Activation](https://scottspence.com/posts/how-to-make-claude-code-skills-activate-reliably)
- [Improving Agents](https://improvingagents.com)
- [Position Bias in LLMs](https://dl.acm.org/doi/full/10.1145/3715275.3732038)
