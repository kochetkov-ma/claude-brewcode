# Convention Skill

Analyze project codebase to extract etalon classes, patterns, architecture, and organize rules.

## Usage

```bash
/brewcode:convention                    # Full analysis (P0-P8)
/brewcode:convention conventions        # Generate docs only (P0-P7)
/brewcode:convention rules              # Re-extract rules (requires existing docs)
/brewcode:convention paths src/a,src/b  # Scoped analysis
```

## Phases

| Phase | Name | Agents | Output |
|-------|------|--------|--------|
| P0 | Stack + scan | — | Detect stack, setup `.claude/convention/` |
| P1 | Load layers | — | Filter layers by stack |
| P2 | Layer analysis | 10 (architect + tester) | Etalon candidates, patterns, anti-patterns |
| P3 | Etalon selection | 1 architect | Final etalon summary |
| P4 | Doc generation | 3 developer | Convention docs |
| P5 | Text optimization | 3 text-optimizer | Token-efficient docs |
| P6 | User review | — | Approve / revise / skip |
| P7 | Rules organization | bc-rules-organizer | `.claude/rules/` updates |
| P7.5 | CLAUDE.md update | — | Etalon summary in CLAUDE.md |
| P8 | Summary | — | Final report |

## Output

```
.claude/convention/
  reference-patterns.md       # Main code layers (L4-L11, L14)
  testing-conventions.md      # Test layers (T1-T6)
  project-architecture.md     # Build layers (L1-L3, L12-L13)

.claude/rules/
  {prefix}-avoid.md           # Extracted anti-patterns
  {prefix}-best-practice.md   # Extracted best practices
```

## References

| File | Purpose |
|------|---------|
| `references/analysis-layers.md` | Layer definitions (L1-L14, T1-T6) |
| `references/conventions-guide.md` | Document templates |
| `references/rules-guide.md` | Rules extraction + 3-Check Dedup Protocol |
| `scripts/convention.sh` | Stack detection, scan, setup, validation |

## Deduplication

Rules extraction uses the 3-Check Dedup Protocol:

| Check | Action |
|-------|--------|
| Within-file similarity | >70% skip, 40-70% merge |
| Cross-file antonym | avoid↔best-practice — keep avoid only |
| CLAUDE.md duplicate | Skip if already in CLAUDE.md |
