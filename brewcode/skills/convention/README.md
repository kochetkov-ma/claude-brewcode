---
auto-sync: enabled
auto-sync-date: 2026-04-01
auto-sync-type: doc
---

# Convention

Analyzes a project codebase to extract etalon (reference) classes, coding patterns, and architecture conventions by layer. Produces structured documentation in `.claude/convention/` and organizes extracted rules into `.claude/rules/`.

## Quick Start

```
/brewcode:convention
```

Runs the full pipeline: detect stack, analyze all layers, generate convention docs, optimize text, review with user, extract rules, update CLAUDE.md.

## Modes

| Mode | Invocation | What it does |
|------|------------|--------------|
| `full` (default) | `/brewcode:convention` | Complete analysis: docs + rules + CLAUDE.md update (P0-P8) |
| `conventions` | `/brewcode:convention conventions` | Generate convention docs only, skip rules extraction (P0-P7) |
| `rules` | `/brewcode:convention rules` | Re-extract rules from existing convention docs (P0, P7-P8). Requires `.claude/convention/` to exist |
| `paths` | `/brewcode:convention paths src/a,src/b` | Full analysis scoped to specified comma-separated paths (P0-P7) |

## Examples

### Good Usage

```
# First-time full analysis of the entire project
/brewcode:convention

# Analyze only specific modules after adding a new service
/brewcode:convention paths src/payment,src/billing

# Regenerate conventions without touching rules
/brewcode:convention conventions

# Refresh rules after manually editing convention docs
/brewcode:convention rules

# Scope analysis to test directories only
/brewcode:convention paths src/test,src/integrationTest
```

### Common Mistakes

```
# Running rules mode before generating convention docs -- will fail
/brewcode:convention rules
# Fix: run `/brewcode:convention conventions` first, then `/brewcode:convention rules`

# Providing paths without the keyword -- interpreted as full mode
/brewcode:convention src/main
# Fix: always prefix with `paths` keyword
/brewcode:convention paths src/main

# Using spaces instead of commas for multiple paths
/brewcode:convention paths src/a src/b
# Fix: comma-separated, no spaces
/brewcode:convention paths src/a,src/b
```

## Phases

| Phase | Name | Agents | Output |
|-------|------|--------|--------|
| P0 | Stack + Scan | -- | Detect tech stack, scan project structure, setup `.claude/convention/` |
| P1 | Load Layers | -- | Filter analysis layers (L1-L14, T1-T6) by detected stack |
| P2 | Layer Analysis | 10 parallel (architect + tester) | Etalon candidates, patterns, naming conventions, anti-patterns |
| P3 | Etalon Selection | 1 architect | Final etalon summary with conflict resolution |
| P4 | Doc Generation | 3 parallel developer | Three convention documents |
| P5 | Text Optimization | 3 parallel text-optimizer (brewtools) | Token-efficient versions of all docs (requires brewtools plugin) |
| P6 | User Review | -- | Approve, revise (up to 2 iterations), or skip to rules |
| P7 | Rules Organization | bc-rules-organizer | Interactive rule extraction into `.claude/rules/` |
| P7.5 | CLAUDE.md Update | -- | Optional etalon summary table in project CLAUDE.md |
| P8 | Summary | -- | Final report with metrics |

## Output

```
.claude/convention/
  reference-patterns.md       # Main code layers (L4-L11, L14): etalons, patterns, anti-patterns
  testing-conventions.md      # Test layers (T1-T6): test etalons, assertion conventions
  project-architecture.md     # Build layers (L1-L3, L12-L13): build config, deps, migrations

.claude/rules/
  {prefix}-avoid.md           # Extracted anti-patterns as avoid rules
  {prefix}-best-practice.md   # Extracted best practices as rules
```

Rules extraction uses a 3-Check Deduplication Protocol:

| Check | Threshold | Action |
|-------|-----------|--------|
| Within-file similarity | >70% | Skip (already covered) |
| Within-file similarity | 40-70% | Merge into existing entry |
| Cross-file antonym | avoid vs best-practice | Keep avoid only |
| CLAUDE.md duplicate | Exists in CLAUDE.md | Skip |

## Tips

- **When to run:** After initial project setup, after major refactoring, or when onboarding new team conventions. Re-run `rules` mode after manually editing convention docs.
- **Large projects (>1000 files):** The skill warns automatically. Use `paths` mode to scope analysis to specific modules for faster, more focused results.
- **Iterative workflow:** Start with `conventions` mode to review docs first. Once satisfied, run `rules` mode separately. This gives you full control over what gets promoted to rules.
- **Supported stacks:** Java, Kotlin, TypeScript, Python, Rust, Go, and multi-stack projects. Unknown stacks get generic analysis across all layers.
