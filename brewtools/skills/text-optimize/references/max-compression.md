# Max Compression Reference

Max mode = deep compression + atomic-fact-line rewriting + format-aware tables. LLM-only. Opt-in via `-x`/`--max`. ALWAYS runs 2 verification rounds. Use only when caller explicitly wants maximum density and accepts review burden.

> Inherits everything in `deep-compression.md`. Max adds 3 techniques (B1, A1, B3) + 4 guardrails (C1-C4) + mandatory 2-round verify.

## Atomic Fact-Line Decomposition (B1)

Source: arXiv:2605.04426 "Telegraph English". Decompose prose into one independently-addressable fact per line. Each line stands alone: no cross-line pronoun refs (`it`, `they`, `this`). Combine with ASCII operator dialect. Measured: ~50% token reduction @ 99.1% key-fact retention (GPT-4.1).

Rules:
- 1 fact = 1 line
- !=pronouns referring to other lines -> repeat the noun
- !=connective prose ("furthermore", "as a result") -> drop or replace with operator

**Before** (4 sentences):
> The build runs on CI. It compiles the Kotlin sources first. After that it runs the unit tests. If any test fails, the pipeline stops and the artifact is not published.

**After** (4 atomic lines):
> build runs @ CI
> build compiles Kotlin sources first
> build runs unit tests after compile
> test fail -> pipeline stops + artifact !=published

## ASCII Operator Dialect (A1 — CRITICAL)

Prefer ASCII digraphs over unicode glyphs. Measured token cost (tiktoken cl100k/o200k, live):

| Glyph | Tokens | ASCII | Tokens |
|-------|--------|-------|--------|
| `∵` `∴` `⊃` `≤` `≥` | 2-3 each | `->` `!=` `>=` `<=` `|` | 1 each |
| `→` | 1 | `->` | 1 (equally cheap + portable) |

Mapping:

| Meaning | Use |
|---------|-----|
| leads-to | `->` |
| not / never | `!=` |
| greater | `>=` |
| less | `<=` |
| or | `|` |
| because | `bc` or `because` |
| therefore | `so` |
| includes | `includes` |

> The win is DELETING WORDS, not swapping the glyph. `->` and `→` cost the same; prefer ASCII for portability. Replacing "because" (1 tok) with `∵` (2-3 tok) LOSES tokens.

## Format-Aware Tables (B3)

Sources: arXiv:2603.03306 (TOON); Gilbertson (JSON ~= 2x TSV tokens). For FLAT + UNIFORM tabular data, TSV/CSV-style compact rows beat markdown pipe-tables (pipe alignment = token bloat) and beat JSON (~2x TSV).

CONDITIONAL:

| Data shape | Format |
|------------|--------|
| flat + uniform | TSV-style rows |
| nested / irregular | minified JSON |
| any | !=TOML (worst) |

**Before** (markdown pipe-table):
> | id | name | role |
> |----|------|------|
> | 1 | ann | admin |
> | 2 | bob | user |

**After** (TSV-style):
> id name role
> 1 ann admin
> 2 bob user

## Guardrails (MANDATORY)

These CAP the aggression. Sources: Anthropic context-engineering blog; Anthropic Opus 4.8 prompting guide; arXiv:2502.15007 LLM-Microscope.

| ID | Rule |
|----|------|
| C1 | Minimal != short. Optimize signal/token, !=raw token count. Recall-first, precision-second. |
| C2 | Preserve scope qualifiers VERBATIM ("every section, not just the first"). Opus 4.8 follows literally; stripping scope words BREAKS behavior. |
| C3 | ~20% safe-deletion ceiling on function words. !=bulk-strip punctuation (punctuation is load-bearing for context memory). Substitute, !=delete. |
| C4 | Consistent terminology. !=paraphrase a term for variety. |

## Iron Rules (inherited + max-specific)

Inherits ALL `deep-compression.md` iron rules:
- Preserve names, numbers, dates, URLs, file paths, versions, ports, sizes
- DICT header @ document start (terms 3+ times)
- >= 1 example per rule that originally had examples

Max adds:
- Scope qualifiers preserved verbatim (C2)
- 2 mandatory verification rounds (never optional)
- Semantic match must be >= 95% -> else warn user with loss list

## Verification (2 rounds, mandatory)

Never silently ship lossy max output.

| Round | Action |
|-------|--------|
| 1 | Spawn verifier with ORIGINAL + COMPRESSED -> list lost/distorted facts -> compute semantic match % |
| 2 | Patch losses -> re-verify -> recompute match % |
| after R2 | match >= 95% -> ship. match < 95% -> output WARNING + full loss list, ship with caveat |

Loss list fmt (1 fact/line, atomic):
> lost: artifact retention policy (30d) dropped
> distorted: "every endpoint" -> "endpoints" (scope weakened, C2 violation)
