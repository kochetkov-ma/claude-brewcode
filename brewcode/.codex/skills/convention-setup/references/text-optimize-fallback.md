# Text Optimization: Fallback

> Read when P5 finds no `brewtools:text-optimize` skill in this session (`brewtools` not installed).

Skip P5 and say so in the P6 summary, for example: "P5 skipped: the brewtools text optimizer is not
available, so the convention documents are not optimized." P6 receives the three documents exactly as
P4 wrote them.

| Do not | Why |
|--------|-----|
| Rewrite the documents by hand in place of the optimizer | P5 accepts a rewrite only through snapshot, checkpoints, the mechanical gate and an independent verifier; without them a lost etalon path or number goes unnoticed |
| Install brewtools or any other product implicitly | installing is the user's decision |

Once brewtools is installed, `$brewtools:text-optimize` (or re-running P5) optimizes
`.codex/convention/reference-patterns.md`, `testing-conventions.md` and `project-architecture.md`.
