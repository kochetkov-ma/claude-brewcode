# Text Optimizer

Optimize prompts, CLAUDE.md, agent instructions, and documentation for LLM token efficiency. Applies 41 research-backed rules across 6 categories. Typical savings: **30-50%** on prose, **20-30%** on technical specs.

## Quick Start

1. Install:
   ```bash
   npx skills add kochetkov-ma/claude-brewcode
   ```

2. Use via slash command:
   ```
   /text-optimizer my-prompt.md
   /text-optimizer my-prompt.md -d      # deep — max compression
   /text-optimizer my-prompt.md -l      # light — cleanup only
   /text-optimizer .claude/agents/      # directory — all .md files in parallel
   ```

   Or via natural language prompt:
   ```
   Optimize my-prompt.md for token efficiency
   Optimize all agent instructions in .claude/agents/
   ```

Claude reads 41 rules, analyzes your files, applies transformations, and outputs a before/after report with token counts. For directories — finds all `.md` files and processes them in parallel.

## Why Use This

- **Token savings** — 30-50% fewer tokens in system prompts means lower cost and more room for context
- **Better compliance** — rules based on how Claude 4.x actually processes instructions, not intuition
- **Research-backed** — every rule cites a source (Anthropic docs, arXiv papers, TACL 2024)
- **Non-destructive** — preserves all facts, logic, and cross-references; only changes form
- **Three modes** — light cleanup for stable docs, deep compression for cost-critical prompts

## Examples

### Single file — default medium mode

```
/text-optimizer CLAUDE.md
```

Applies all 41 rules with balanced restructuring. Best for most files.

<details>
<summary>Optimization: filler removal + positive framing</summary>

Before:
```markdown
Please note that it's important to remember that the API basically
requires authentication for all endpoints. Do not use markdown
formatting in your responses. You should never create new files
when fixing bugs.
```

After:
```markdown
The API requires authentication for all endpoints. Write responses
in flowing prose without formatting. Apply all bug fixes to
existing files only.
```

Rules: filler removed (T.6), negative "do not" flipped to positive "do Y" (C.3), "you should" dropped for imperative (S.2).

</details>

<details>
<summary>Optimization: prose to table</summary>

Before:
```markdown
The function accepts three parameters: name (string, required),
age (number, optional, defaults to 0), and active (boolean,
optional, defaults to true).
```

After:
```markdown
| Param  | Type    | Required | Default |
|--------|---------|----------|---------|
| name   | string  | yes      | —       |
| age    | number  | no       | 0       |
| active | boolean | no       | true    |
```

Rule: tables over prose for multi-column data (T.1).

</details>

### Deep mode — max compression

```
/text-optimizer system-prompt.md -d
```

Aggressive rephrasing, section merging, all redundancy eliminated. Review the diff after — deep mode changes structure.

<details>
<summary>Optimization: aggressive language toned down</summary>

Before:
```markdown
CRITICAL: You MUST ALWAYS use this tool IMMEDIATELY when searching.
NEVER under ANY circumstances skip the validation step.
```

After:
```markdown
Use this tool when the task involves file search.
Run validation before each deployment.
```

Rules: descriptive over emphatic (C.5), avoid ALL-CAPS in Claude 4.x (C.7). The model overtriggers on aggressive language — calm instructions get better compliance.

</details>

<details>
<summary>Optimization: critical info repositioned</summary>

Before:
```markdown
Here are the coding guidelines...
[20 pages of context]
...and remember, never expose API keys in logs.
```

After:
```markdown
API keys must never appear in logs.

Here are the coding guidelines...
[20 pages of context]

Reminder: API keys must never appear in logs.
```

Rule: critical info at START and END (L.1). LLMs pay 40-50% less attention to middle content.

</details>

### Light mode — safe cleanup

```
/text-optimizer production-prompt.md -l
```

Text cleanup only — no restructuring, no section merging. Safe for reviewed, stable documents.

<details>
<summary>Optimization: filler and redundancy only</summary>

Before:
```markdown
It is important to note that you should always make sure to validate
user input. Please remember that basically all external data needs
to be sanitized before processing.
```

After:
```markdown
Validate all user input. Sanitize external data before processing.
```

Rules: filler removed (T.6), imperative form (S.2). Structure and sections stay intact.

</details>

### Directory — parallel batch optimization

```
/text-optimizer .claude/agents/
```

Scans the directory, finds all `.md` files, and processes them **in parallel**. Each file gets its own optimization report. This is the fastest way to optimize an entire agents or skills folder at once.

```
/text-optimizer -d .claude/rules/
```

Deep mode on a directory — max compression for all rules files in parallel.

<details>
<summary>Example: optimizing 5 agent files at once</summary>

```
/text-optimizer .claude/agents/
```

Found 5 files: `developer.md`, `reviewer.md`, `tester.md`, `architect.md`, `bash-expert.md`

Processing in parallel...

```markdown
## Optimization Report: developer.md
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines  | 142    | 98    | -31%   |
| Tokens | ~1850  | ~1190 | -36%   |

## Optimization Report: reviewer.md
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines  | 203    | 131   | -35%   |
| Tokens | ~2640  | ~1580 | -40%   |

... (report for each file)
```

</details>

### Multiple specific files

```
/text-optimizer CLAUDE.md, .claude/agents/reviewer.md, .claude/rules/testing.md
```

Comma-separated list — processes each file, generates a report for each.

### Natural language

```
Optimize all agent instructions in .claude/agents/
```

Claude finds `.claude/agents/*.md`, applies medium mode to each in parallel.

## Insights

### Don't abbreviate domain terms

```
/text-optimizer -d api-docs.md
```

The optimizer will **not** shorten "authentication" to "auth" or "configuration" to "config" in instructions — even in deep mode. Why? Shortening domain terms caused 30+ point accuracy drops in benchmarks. The model picks the statistically dominant meaning of the abbreviation, which may not match your intent. Short forms (impl, cfg, env) are only used in tables where context is clear. ([arXiv:2512.02246](https://arxiv.org/abs/2512.02246))

```diff
  # optimizer keeps full form in instructions:
- Ensure proper auth before accessing the config endpoint
+ Ensure proper authentication before accessing the configuration endpoint

  # but abbreviates in tables where column context disambiguates:
  | Param | Type | Desc |
  | auth  | bool | Enable authentication |
```

### Code in prompts — strip whitespace

```
/text-optimizer system-prompt-with-code.md -d
```

If your prompt embeds Java/C++/C# code examples, the optimizer strips indentation — saving 11-22% tokens with under 1.6% quality loss. Python is excluded (whitespace is syntactic). ([arXiv:2508.13666](https://arxiv.org/abs/2508.13666))

```diff
  # before — 4 levels of indentation:
- public class UserService {
-     public User findById(Long id) {
-         return repository.findById(id)
-             .orElseThrow(() -> new NotFoundException(id));
-     }
- }

  # after — stripped:
+ public class UserService {
+ public User findById(Long id) {
+ return repository.findById(id)
+ .orElseThrow(() -> new NotFoundException(id));
+ }
+ }
```

### Long prompts — put constraints at edges

```
/text-optimizer long-system-prompt.md
```

The optimizer moves critical constraints to the beginning and end of the document. LLMs pay 40-50% less attention to content in the middle — the "Lost in the Middle" effect. ([TACL 2024](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630))

```diff
  # before — buried constraint:
  [page 1: introduction]
  [page 2: guidelines]
- [page 3: ...and never expose API keys in logs.]
  [page 4: examples]

  # after — sandwiched at edges:
+ API keys must never appear in logs.
  [page 1: introduction]
  [page 2: guidelines]
  [page 3: examples]
+ Reminder: API keys must never appear in logs.
```

### RAG / multi-document prompts — query goes last

```
/text-optimizer rag-prompt-template.md
```

If your prompt template has `{{DOCUMENTS}}` and a question, the optimizer reorders: documents first, query last. This improves quality by up to 30% on multi-document inputs. ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

```diff
  # before:
- Question: {{USER_QUERY}}
- Context: {{DOCUMENTS}}
- Answer based on the context above.

  # after:
+ <context>
+ {{DOCUMENTS}}
+ </context>
+ Question: {{USER_QUERY}}
+ Answer based on the context above.
```

### Templates with variables — XML boundaries added

```
/text-optimizer prompt-template.md
```

The optimizer wraps `{{VARIABLE}}` sections in XML tags. Without boundaries, injected user content can look like system instructions — this is the most reliable prompt injection defense. ([Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices))

```diff
  # before — no boundaries:
- You are a helpful assistant.
- User message: {{USER_INPUT}}
- Respond helpfully.

  # after — XML-wrapped:
+ You are a helpful assistant.
+ <user-message>
+ {{USER_INPUT}}
+ </user-message>
+ Respond helpfully.
```

## Modes In Detail

### Light (`-l`)

Text cleanup without restructuring. Safe for stable, reviewed documents.

**Applies:** Claude behavior rules (C.1-C.8), filler removal (T.6), reference checks (R.1-R.3), perception basics (P.1-P.4).

**Skips:** Table/bullet restructuring, XML tags, section merging.

**Use for:** Production prompts where structure is intentional, docs that have been through review.

### Medium (default)

Balanced restructuring — all 41 rules applied with standard transformations.

**Applies:** All categories (C + T + S + R + P + L).

**Use for:** Most files — CLAUDE.md, agent instructions, skill definitions, technical docs.

### Deep (`-d`)

Maximum compression. Merges sections, rephrases aggressively, eliminates all redundancy.

**Applies:** All rules + aggressive rephrasing and section merging.

**Use for:** Cost-critical system prompts, context-limited scenarios. Review the diff carefully after.

### Comparison

| Input (100 lines) | Light | Medium | Deep |
|--------------------|-------|--------|------|
| Prose documentation | ~10% savings | ~40% | ~50% |
| System prompts | ~15% savings | ~35% | ~45% |
| Technical specs | ~5% savings | ~25% | ~30% |

## Rule Categories

| Category | Count | What it covers |
|----------|-------|----------------|
| Claude behavior | 8 | How Claude 4.x interprets instructions differently |
| Token efficiency | 10 | Structural compression without information loss |
| Structure | 8 | Organization patterns LLMs parse better |
| Reference integrity | 3 | Catching broken paths, URLs, circular refs |
| Perception | 6 | Visual hierarchy and attention patterns |
| LLM comprehension | 7 | Position bias, grounding, repetition effects |

Full rules with research citations: [`references/rules-review.md`](references/rules-review.md)

## Sources

- [Claude 4 Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) — Anthropic
- [Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) — Anthropic
- [Lost in the Middle](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00638/119630) — TACL 2024
- [DETAIL Matters](https://arxiv.org/abs/2512.02246) — arXiv 2024
- [Whitespace Stripping](https://arxiv.org/abs/2508.13666) — arXiv 2025
- [Prompt Repetition](https://arxiv.org/abs/2512.14982) — Google Research 2024
- [Brex Prompt Engineering](https://github.com/brexhq/prompt-engineering) — Brex

## Part of Brewcode

This skill is extracted from [brewcode](https://github.com/kochetkov-ma/claude-brewcode) — a development platform for Claude Code with infinite focus tasks, 14 agents, quorum reviews, and knowledge persistence.

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

## License

MIT
