# Text Optimization: Compact Rules (Fallback)

> Use when brewtools is NOT installed and text-optimizer agent is unavailable.
> Main owns fallback edits and acceptance. Do not install another product implicitly.
> Savings/attention/accuracy claims below are historical heuristics/targets, not guarantees or measurements of this run.

## Key Rules by Category

### C -- Claude Behavior

| ID | Rule | Key Point |
|----|------|-----------|
| C.1 | Literal following | Instructions execute exactly as written -- be precise |
| C.3 | Positive framing | "Do Y" not "Don't do X"; preserve genuine prohibitions |
| C.5 | Descriptive over emphatic | "Use when..." not "CRITICAL: MUST..." (Opus 4.5/4.6 guidance) |
| C.6 | No overengineering | Claude follows literally -- simpler is better |
| C.7 | No ALL-CAPS emphasis | Claude 4.x: aggressive caps may overtrigger; use normal tone, preserve mandatory gates and negation meaning |

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

1. Resolve exactly the named generated docs; read them completely. Medium means 100% preservation,
   never a quota for deletion. Use the same P5 writer/verifier ownership boundaries.
2. Before editing, create a fresh private `RUN_DIR` outside tracked files (directories 0700,
   originals/checkpoints/reports 0600). Copy each regular, non-symlink target byte-for-byte to
   `RUN_DIR/orig/<relative path>`; reject escaping paths/symlinks. Keep snapshots read-only.
   Existing authorization for named dirty targets suffices; preserve unrelated/concurrent edits.
3. Inventory atomic facts and protected numbers, versions, names, paths, examples, prohibitions,
   scope qualifiers, and metadata. Cross-file dedup list is EMPTY unless main assigns one owner.
4. Apply T.6, T.1, T.2-T.4, then S.2: remove filler, use appropriate tables and lists/code with imperative
   wording. Preserve domain terms and examples; merge only identical facts with matching scope.
5. After each known-owned atomic edit, record its expected SHA-256 checkpoint immediately under
   `RUN_DIR/draft/`. Never capture concurrent writers' bytes or manufacture recovery proof later.
6. Run a protected-token comparison against snapshots using equivalent canonical set semantics:
   numbers/versions, slash-bearing paths, `!=` prohibitions and ALL-CAPS modal keywords; also check
   names, examples and ordinary negations through the fact inventory. Use the canonical guard if
   available (`verify --no-restore`); a fallback precheck must keep current bytes on failure.
7. Main spawns a fresh read-only verifier per file with the full P5 GOAL/ROLE/SCOPE/CONTEXT/CONSUMER/DONE
   brief. Compare ORIGINAL/CURRENT from disk without the writer's report. Require 100% facts and
   protected details; main reviews every finding. Mechanical token presence alone is insufficient.
8. Repair only known-owned loss, checkpoint immediately, and repeat the gate. Uncertain ownership,
   missing snapshots/checkpoints/precheck, or unpreserved facts -> refuse optimization acceptance,
   preserve current bytes, and report pending/partial status. No automatic default verify/restore.
9. Report actual lines/words/characters/bytes, counting method, kept/merged/lost/distorted facts,
   checkpoint/report paths and conflicts. Tokens require a named tokenizer; characters/4 is a rough
   proxy. The 20-40% token-reduction target never overrides zero-loss preservation.

If equivalent safeguards cannot run without brewtools, leave the documents unoptimized and report
optimization pending; do not claim an accepted fallback result. P5's fresh independent gate applies
here too. No nested optimizer/verifier spawns or model invocation of a DMI skill.

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
